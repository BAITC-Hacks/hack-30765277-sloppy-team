import { NextRequest, NextResponse } from 'next/server';
import { AppError, publicError } from '@/lib/errors';
import { object, text, cardInput, requireConfirmation } from '@/lib/validation';
import { backendRequest, backendObject, scoreCard, scoringResponse } from '@/lib/backend-client';
import { fromBackendCard, safeUrl } from '@/lib/domain';
import * as service from '@/lib/task-service';
import { createUser, findUser } from '@/lib/store';
import { hashPassword, verifyPassword, setSession, clearSession, sessionUserId, validateSessionConfig } from '@/lib/auth';
async function currentUser(req: NextRequest) {
    const id = sessionUserId(req);
    return id ? findUser({ id }) : null;
}
async function requireUser(req: NextRequest) {
    const user = await currentUser(req);
    if (!user) throw new AppError('Войдите в аккаунт.', 401);
    return user;
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(fn: () => Promise<NextResponse>) {
    try {
        return await fn();
    }
    catch (error) {
        const result = publicError(error);
        return json({ error: result.error }, result.status);
    }
}
async function body(req: NextRequest) {
    const origin = req.headers.get('origin');
    // Next.js may normalize nextUrl.hostname to localhost. Host preserves the
    // browser-facing authority; browsers cannot override that request header.
    const host = req.headers.get('host') || req.nextUrl.host;
    let sameHost = !origin;
    if (origin) {
        try { const url = new URL(origin); sameHost = ['http:', 'https:'].includes(url.protocol) && url.host === host; }
        catch { sameHost = false; }
    }
    if (req.headers.get('sec-fetch-site') === 'cross-site' || !sameHost)
        throw new AppError('Запрос с другого сайта запрещён.', 403);
    if (!req.headers.get('content-type')?.includes('application/json'))
        throw new AppError('Используйте application/json.', 415);
    const reader = req.body?.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let bytes = 0;
    if (reader) {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                bytes += value.byteLength;
                if (bytes > 512000) {
                    await reader.cancel();
                    throw new AppError('Запрос слишком большой.', 413);
                }
                raw += decoder.decode(value, { stream: true });
            }
            raw += decoder.decode();
        }
        finally {
            reader.releaseLock();
        }
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new AppError('Некорректный JSON.', 400);
    }
    return object(parsed);
}
export async function GET(req: NextRequest) {
    return handle(async () => {
        const p = req.nextUrl.pathname;
        if (p === '/api/health')
            return json(await backendRequest('/health'));
        if (p === '/api/auth/me') {
            const user = await currentUser(req);
            return json({ user: user ? { id: user.id, email: user.email } : null });
        }
        if (p === '/api/my-tasks') return json(await service.listTasks((await requireUser(req)).id));
        if (p === '/api/tasks')
            return json(await service.listTasks());
        const match = p.match(/^\/api\/tasks\/([^/]+)(\/applications)?$/);
        if (match)
            return json(match[2] ? await service.applicationsFor(match[1], (await requireUser(req)).id) : await service.getTask(match[1]));
        throw new AppError('Не найдено.', 404);
    });
}
export async function POST(req: NextRequest) {
    return handle(async () => {
        const p = req.nextUrl.pathname;
        const b = await body(req);
        if (p === '/api/auth/logout') {
            const response = json({ success: true }); clearSession(response); return response;
        }
        if (p === '/api/auth/register' || p === '/api/auth/login') {
            validateSessionConfig();
            const email = text(b.email, 'Email', 254).toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof b.password !== 'string' || b.password.length < 12 || b.password.length > 128)
                throw new AppError('Укажите email и пароль длиной от 12 до 128 символов.', 422);
            let user;
            if (p.endsWith('/register')) {
                user = await createUser(email, await hashPassword(b.password));
                if (!user) throw new AppError('Пользователь уже существует.', 409);
            } else {
                user = await findUser({ email });
                const valid = await verifyPassword(b.password, user?.password_hash ?? '');
                if (!user || !valid) throw new AppError('Неверный email или пароль.', 401);
            }
            const response = json({ user: { id: user.id, email: user.email } }, p.endsWith('/register') ? 201 : 200);
            setSession(response, user.id); return response;
        }
        const user = await requireUser(req);
        if (p === '/api/ai/clarify') {
            const data = backendObject(await backendRequest(p, { draft_text: text(b.draft_text, 'Черновик', 20000) }));
            if (!Array.isArray(data.questions) || data.questions.length !== 3 || data.questions.some(q => typeof q !== 'string' || !q.trim()) || !['demo', 'openai'].includes(String(data.mode)))
                throw new AppError('AI-сервис вернул некорректные вопросы.', 502);
            return json(data);
        }
        if (p === '/api/ai/build-card') {
            if (!Array.isArray(b.qa_pairs) || b.qa_pairs.length !== 3)
                throw new AppError('Передайте три пары вопрос–ответ.', 422);
            const qa_pairs = b.qa_pairs.map(pair => { const qa = object(pair); return { question: text(qa.question, 'Вопрос', 2000), answer: text(qa.answer, 'Ответ', 10000, false) }; });
            const data = backendObject(await backendRequest(p, { draft_text: text(b.draft_text, 'Черновик', 20000), qa_pairs }));
            const card = backendObject(data.card);
            const fields = ['title', 'context', 'data_materials', 'expected_result', 'success_criteria', 'constraints', 'target_audience', 'contacts', 'interaction_format'];
            if (typeof card.title !== 'string' || !card.title.trim() || fields.some(k => card[k] !== null && typeof card[k] !== 'string') || !['demo', 'openai'].includes(String(data.mode)))
                throw new AppError('AI-сервис вернул некорректную карточку.', 502);
            return json({ card_data: fromBackendCard(card as Record<string, string | null>), scoring: scoringResponse(data.scoring), mode: data.mode });
        }
        if (p === '/api/tasks/score')
            return json(await scoreCard(cardInput(b.card_data)));
        if (p === '/api/tasks') {
            requireConfirmation(b);
            return json(await service.saveTask(cardInput(b.card_data), user.id), 201);
        }
        if (p === '/api/applications') {
            const prototype = text(b.prototype ?? '', 'Ссылка', 2000, false);
            if (prototype && !safeUrl(prototype))
                throw new AppError('Укажите корректную ссылку HTTP или HTTPS.', 422);
            return json(await service.applyToTask({ task_id: text(b.task_id, 'Задача', 200), team_name: text(b.team_name, 'Команда', 200),
                idea: text(b.idea, 'Идея'), plan: text(b.plan, 'План'), deadline: text(b.deadline, 'Срок', 200), prototype }, user.id), 201);
        }
        throw new AppError('Не найдено.', 404);
    });
}
export async function PATCH(req: NextRequest) {
    return handle(async () => {
        const p = req.nextUrl.pathname;
        const b = await body(req);
        const user = await requireUser(req);
        const task = p.match(/^\/api\/tasks\/([^/]+)$/);
        if (task) {
            requireConfirmation(b);
            return json(await service.saveTask(cardInput(b.card_data), user.id, task[1]));
        }
        const match = p.match(/^\/api\/applications\/([^/]+)\/status$/);
        if (!match)
            throw new AppError('Не найдено.', 404);
        if (b.status !== 'ACCEPTED' && b.status !== 'REJECTED')
            throw new AppError('Некорректный статус.', 422);
        return json({ success: true, application: await service.decideApplication(match[1], b.status, user.id) });
    });
}
