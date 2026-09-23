export type Card = {
    title: string;
    company: string;
    category: string;
    context: string;
    data: string;
    constraints: string;
    criteria: string;
    contacts: string;
    links: string;
    expected_result: string;
    target_audience: string;
    interaction_format: string;
};
export type Task = {
    id: string;
    card_data: Card;
    score: number;
    status: 'PRIORITY' | 'READY' | 'WORKING' | 'DRAFT';
    created_at: string;
    scoring?: Scoring;
};
export type Application = {
    id: string;
    task_id: string;
    team_name: string;
    idea: string;
    plan: string;
    prototype: string;
    deadline?: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
};
export const emptyCard: Card = { title: '', company: '', category: 'Разработка', context: '', data: '', constraints: '', criteria: '', contacts: '', links: '', expected_result: '', target_audience: '', interaction_format: '' };
export function safeUrl(value: string) { try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
}
catch {
    return null;
} }
export function seedTasks(): Task[] {
    return [
        ['1', 'Дашборд продаж для локальной кофейни', 'Кофе и люди', 'Аналитика', 'Помогите небольшой сети кофеен разобраться в продажах и находить точки роста на основе данных.'],
        ['2', 'Сервис подбора волонтёров для НКО', 'Добро рядом', 'Разработка', 'Создайте удобный сервис, который объединит волонтёров и благотворительные проекты города.'],
        ['3', 'Новый взгляд на доставку фермерских продуктов', 'Зелёная ферма', 'Дизайн', 'Исследуйте путь покупателя и спроектируйте понятный интерфейс заказа свежих продуктов.'],
        ['4', 'Telegram-бот для записи на занятия', 'Студия Ритм', 'Разработка', 'Автоматизируйте запись на групповые занятия, чтобы администратор мог уделять больше времени гостям.'],
        ['5', 'Стратегия продвижения локального бренда', 'Тихий дом', 'Маркетинг', 'Помогите молодому бренду керамики найти свою аудиторию и выстроить коммуникацию в соцсетях.'],
        ['6', 'Исследование аудитории книжного клуба', 'Между строк', 'Исследования', 'Узнайте, что привлекает читателей в офлайн-клубы, и предложите новые форматы встреч.']
    ].map(([id, title, company, category, context], i) => { const card_data = { ...emptyCard, title, company, category, context, data: i < 4 ? 'Обезличенные данные за последние 6 месяцев. Материалы предоставим выбранной команде.' : '', constraints: 'Срок: 4 недели. Использовать доступные открытые инструменты.', criteria: i !== 5 ? 'Рабочий прототип, проверенный на 5 пользователях, и краткая презентация результатов.' : '', contacts: i < 3 ? 'hello@example.com' : '', links: i === 0 ? 'https://example.com' : '' }; return { id, card_data, score: 0, status: 'DRAFT' as const, created_at: '2026-09-20T10:00:00Z' }; });
}
export type Scoring = {
    score: number;
    status: Task['status'];
    breakdown: Record<string, number>;
    missing_fields: string[];
};
export const cardLabels: Record<keyof Card, string> = {
    title: 'Название задачи', company: 'Компания', category: 'Направление', context: 'Контекст и потребность',
    data: 'Данные и материалы', expected_result: 'Ожидаемый результат', criteria: 'Критерии успеха',
    constraints: 'Ограничения и сроки', target_audience: 'Пользователи / ЦА', contacts: 'Контакт для связи',
    interaction_format: 'Формат консультаций и обратной связи', links: 'Ссылка на материалы'
};
export const criterionLabels: Record<string, string> = {
    context: 'Контекст и потребность', data_materials: 'Данные и материалы', expected_result: 'Ожидаемый результат',
    success_criteria: 'Критерии успеха', constraints: 'Ограничения', target_audience: 'Пользователи', business_connection: 'Связь с бизнесом'
};
// Adapter for cards created by the earlier pilot. No migration or writes to storage.
export function normalizeCard(card: Partial<Card>): Card { return { ...emptyCard, ...card }; }
export function toBackendCard(card: Card) {
    return { title: card.title.trim() || 'Задача без названия', context: card.context || null, data_materials: card.data || null,
        expected_result: card.expected_result || null, success_criteria: card.criteria || null, constraints: card.constraints || null,
        target_audience: card.target_audience || null, contacts: card.contacts || null, interaction_format: card.interaction_format || null };
}
export function fromBackendCard(card: Record<string, string | null>): Card {
    return { ...emptyCard, title: card.title || '', context: card.context || '', data: card.data_materials || '',
        expected_result: card.expected_result || '', criteria: card.success_criteria || '', constraints: card.constraints || '',
        target_audience: card.target_audience || '', contacts: card.contacts || '', interaction_format: card.interaction_format || '' };
}
