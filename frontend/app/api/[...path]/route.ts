import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import {
  createApplication, createTask, createUser, findUser, getTask, listApplications, listTasks,
  StoreError, updateApplicationStatus,
} from '@/lib/store';
import { type BackendCard, type Card, emptyCard, fromBackendCard, scoreCard, taskStatus, safeUrl } from '@/lib/domain';
import { hashPassword, verifyPassword, setSession, clearSession, sessionUserId, validateSessionConfig } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

function handleError(error: unknown, businessStatus = 400) {
  if (error instanceof StoreError) return fail(error.message, businessStatus);
  if (error instanceof SyntaxError) return fail('Некорректный JSON.');
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return fail('Команда уже выбрана. Другие отклики заблокированы.', 409);
  }
  // Never include connection details, password hashes or raw Prisma errors in responses.
  return fail('Не удалось выполнить запрос. Проверьте настройки сервера и попробуйте позже.', 500);
}

async function currentUser(req: NextRequest) {
  const id = sessionUserId(req);
  return id ? findUser({ id }) : null;
}

async function aiRequest(path: string, body: unknown) {
  const base = process.env.AI_BACKEND_URL ?? 'http://127.0.0.1:8000';
  let url: URL;
  try {
    url = new URL(path, base);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return fail('Неверный адрес AI backend', 500);
  }
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(70000), cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) return fail(typeof data.detail === 'string' ? data.detail : 'AI-сервис вернул ошибку', response.status);
    return NextResponse.json(data);
  } catch {
    return fail('AI-сервис недоступен', 503);
  }
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.pathname;
    if (p === '/api/tasks') return NextResponse.json(await listTasks());
    const user = await currentUser(req);
    if (p === '/api/auth/me') return NextResponse.json({ user: user ? { id: user.id, email: user.email } : null });
    if (p === '/api/my-tasks') {
      return user ? NextResponse.json(await listTasks(user.id)) : fail('Войдите в аккаунт', 401);
    }
    const match = p.match(/^\/api\/tasks\/([^/]+)(\/applications)?$/);
    if (!match) return fail('Не найдено', 404);
    const task = await getTask(match[1]);
    if (!task) return fail('Задача не найдена', 404);
    if (match[2]) {
      return user && task.owner_id === user.id
        ? NextResponse.json(await listApplications(task.id)) : fail('Нет доступа к откликам', 403);
    }
    return NextResponse.json(task);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) return fail('Некорректный запрос.');
    const p = req.nextUrl.pathname;
    if (p === '/api/auth/register') {
      validateSessionConfig();
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof b.password !== 'string' || b.password.length < 12) {
        return fail('Укажите email и пароль не короче 12 символов');
      }
      const user = await createUser(email, hashPassword(b.password));
      if (!user) return fail('Пользователь уже существует', 409);
      const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
      setSession(response, user.id);
      return response;
    }
    if (p === '/api/auth/login') {
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const user = await findUser({ email });
      if (!user || typeof b.password !== 'string' || !verifyPassword(b.password, user.password_hash)) {
        return fail('Неверный email или пароль', 401);
      }
      const response = NextResponse.json({ user: { id: user.id, email: user.email } });
      setSession(response, user.id);
      return response;
    }
    if (p === '/api/auth/logout') {
      const response = NextResponse.json({ success: true });
      clearSession(response);
      return response;
    }
    if (p === '/api/ai/clarify') {
      if (typeof b.draft_text !== 'string' || b.draft_text.trim().length < 20) {
        return fail('Опишите задачу подробнее — минимум 20 символов.');
      }
      return aiRequest('/api/ai/clarify', { draft_text: b.draft_text });
    }
    if (p === '/api/ai/build-card') {
      if (typeof b.draft_text !== 'string' || !Array.isArray(b.qa_pairs) || b.qa_pairs.length !== 3
        || b.qa_pairs.some((a: unknown) => !a || typeof a !== 'object'
          || typeof (a as { question?: unknown }).question !== 'string'
          || typeof (a as { answer?: unknown }).answer !== 'string')) {
        return fail('Ответьте на все три вопроса.');
      }
      const response = await aiRequest('/api/ai/build-card', { draft_text: b.draft_text, qa_pairs: b.qa_pairs });
      if (!response.ok) return response;
      const data = await response.json() as { card: BackendCard; scoring: unknown };
      return NextResponse.json({ card_data: fromBackendCard(data.card), scoring: data.scoring });
    }
    if (p === '/api/tasks' || p === '/api/tasks/score') {
      if (!b.card_data || Object.keys(emptyCard).some(k => typeof b.card_data[k] !== 'string')) {
        return fail('Некорректная карточка.');
      }
      const card = Object.fromEntries(Object.keys(emptyCard).map(k => [k, b.card_data[k]])) as Card;
      if (card.links && !safeUrl(card.links)) return fail('Укажите ссылку HTTP или HTTPS.');
      const score = scoreCard(card);
      if (p.endsWith('/score')) return NextResponse.json({ score, status: taskStatus(score) });
      const user = await currentUser(req);
      if (!user) return fail('Войдите в аккаунт', 401);
      if (!card.title.trim() || !card.context.trim()) return fail('Заполните название и контекст.');
      return NextResponse.json(await createTask(card, user.id), { status: 201 });
    }
    if (p === '/api/applications') {
      const user = await currentUser(req);
      if (!user) return fail('Войдите в аккаунт', 401);
      if (['task_id', 'team_name', 'idea', 'plan'].some(k => typeof b[k] !== 'string' || !b[k].trim())) {
        return fail('Заполните все обязательные поля.');
      }
      if (b.prototype != null && (typeof b.prototype !== 'string' || (b.prototype && !safeUrl(b.prototype)))) {
        return fail('Укажите корректную ссылку на прототип.');
      }
      const application = await createApplication({
        taskId: b.task_id, teamName: b.team_name.trim(), idea: b.idea.trim(),
        plan: b.plan.trim(), prototype: b.prototype || '',
      }, user.id);
      return NextResponse.json(application, { status: 201 });
    }
    return fail('Не найдено', 404);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const match = req.nextUrl.pathname.match(/^\/api\/applications\/([^/]+)\/status$/);
    if (!match) return fail('Не найдено', 404);
    const user = await currentUser(req);
    if (!user) return fail('Войдите в аккаунт', 401);
    const body = await req.json();
    const status = body?.status;
    if (status !== 'ACCEPTED' && status !== 'REJECTED') return fail('Некорректный статус');
    return NextResponse.json({ success: true, application: await updateApplicationStatus(match[1], status, user.id) });
  } catch (error) {
    return handleError(error, 409);
  }
}
