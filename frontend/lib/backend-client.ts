import { AppError } from './errors';
import { Card, Scoring, toBackendCard } from './domain';
export function backendObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new AppError('Бэкенд вернул некорректный ответ.', 502);
    return value as Record<string, unknown>;
}
// Server configuration only: never put the OpenAI key in NEXT_PUBLIC_* variables.
export async function backendRequest(path: string, body?: unknown): Promise<unknown> {
    const base = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    try {
        const response = await fetch(base + path, {
            method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(path.includes('/ai/score') ? 10000 : 70000), cache: 'no-store',
        });
        const data = await response.json().catch(() => { throw new AppError('Бэкенд вернул некорректный ответ.', 502); });
        if (!response.ok) {
            const message = typeof data?.detail === 'string' ? data.detail :
                response.status === 422 ? 'Проверьте заполнение полей.' : 'Бэкенд временно недоступен.';
            throw new AppError(message, [400, 422, 429, 502, 503, 504].includes(response.status) ? response.status : 502);
        }
        return data;
    }
    catch (error) {
        if (error instanceof AppError)
            throw error;
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
            throw new AppError('Сервис не ответил вовремя. Повторите запрос.', 504);
        throw new AppError('Нет соединения с бэкендом. Проверьте, что сервер запущен.', 503);
    }
}
export function scoringResponse(value: unknown): Scoring {
    const s = value as Scoring | null;
    const weights: Record<string, number> = { context: 20, data_materials: 20, expected_result: 15, success_criteria: 15, constraints: 10, target_audience: 10, business_connection: 10 };
    if (!s || !Number.isInteger(s.score) || s.score < 0 || s.score > 100 ||
        !['DRAFT', 'WORKING', 'READY', 'PRIORITY'].includes(s.status) ||
        !Array.isArray(s.missing_fields) || s.missing_fields.some(x => typeof x !== 'string') ||
        !s.breakdown || Object.keys(s.breakdown).length !== 7 ||
        Object.entries(weights).some(([k, max]) => !Number.isInteger(s.breakdown[k]) || s.breakdown[k] < 0 || s.breakdown[k] > max) ||
        Object.values(s.breakdown).reduce((a, b) => a + b, 0) !== s.score)
        throw new AppError('Бэкенд вернул некорректный рейтинг.', 502);
    const bounds = { DRAFT: [0, 39], WORKING: [40, 69], READY: [70, 89], PRIORITY: [90, 100] };
    const [min, max] = bounds[s.status];
    if (s.score < min || s.score > max)
        throw new AppError('Статус не соответствует рейтингу.', 502);
    return s;
}
export async function scoreCard(card: Card): Promise<Scoring> {
    return scoringResponse(await backendRequest('/api/ai/score', toBackendCard(card)));
}
