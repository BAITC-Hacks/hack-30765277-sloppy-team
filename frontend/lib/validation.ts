import { Card, emptyCard, safeUrl } from './domain';
import { AppError } from './errors';
export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new AppError('Ожидается JSON-объект.');
    return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 10000, required = true): string {
    if (typeof value !== 'string' || (required && !value.trim()) || value.length > max)
        throw new AppError(`${label}: укажите текст${required ? ' (не пустой)' : ''}, максимум ${max} символов.`, 422);
    return value.trim();
}
export function cardInput(value: unknown): Card {
    const input = object(value);
    const card = { ...emptyCard };
    for (const key of Object.keys(emptyCard) as (keyof Card)[])
        card[key] = text(input[key], key, key === 'title' ? 500 : 20000, false);
    if (card.links && !safeUrl(card.links))
        throw new AppError('Укажите ссылку HTTP или HTTPS.', 422);
    return card;
}
export function requireConfirmation(body: Record<string, unknown>) {
    if (body.confirmed !== true)
        throw new AppError('Подтвердите карточку перед публикацией или сохранением.', 422);
}
