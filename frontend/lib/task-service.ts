import { getStore, updateStore } from './store';
import { Application, Card, Task, normalizeCard } from './domain';
import { scoreCard } from './backend-client';
import { AppError } from './errors';
async function withScore(task: Task): Promise<Task> {
    const card_data = normalizeCard(task.card_data);
    const scoring = await scoreCard(card_data);
    return { ...task, card_data, score: scoring.score, status: scoring.status, scoring };
}
export async function listTasks() {
    const tasks = (await getStore()).tasks;
    const result: Task[] = [];
    for (let i = 0; i < tasks.length; i += 8)
        result.push(...await Promise.all(tasks.slice(i, i + 8).map(withScore)));
    return result.sort((a, b) => b.score - a.score);
}
export async function getTask(id: string) {
    const task = (await getStore()).tasks.find(t => t.id === id);
    if (!task)
        throw new AppError('Задача не найдена.', 404);
    return withScore(task);
}
export async function applicationsFor(id: string) {
    const db = await getStore();
    if (!db.tasks.some(t => t.id === id))
        throw new AppError('Задача не найдена.', 404);
    return db.applications.filter(a => a.task_id === id);
}
export async function saveTask(card: Card, id?: string) {
    if (!card.title || !card.context)
        throw new AppError('Заполните название и контекст.', 422);
    const scoring = await scoreCard(card);
    return updateStore(db => {
        const existing = id ? db.tasks.find(t => t.id === id) : undefined;
        if (id && !existing)
            throw new AppError('Задача не найдена.', 404);
        const task: Task = { ...existing, id: id || crypto.randomUUID(), card_data: card, score: scoring.score,
            status: scoring.status, scoring, created_at: existing?.created_at || new Date().toISOString() };
        if (existing)
            db.tasks[db.tasks.indexOf(existing)] = task;
        else
            db.tasks.push(task);
        return task;
    });
}
export async function applyToTask(input: Omit<Application, 'id' | 'status'>) {
    return updateStore(db => {
        if (!db.tasks.some(t => t.id === input.task_id))
            throw new AppError('Задача не найдена.', 404);
        const application: Application = { ...input, id: crypto.randomUUID(), status: 'PENDING' };
        db.applications.push(application);
        return application;
    });
}
export async function decideApplication(id: string, status: 'ACCEPTED' | 'REJECTED') {
    return updateStore(db => {
        const application = db.applications.find(a => a.id === id);
        if (!application)
            throw new AppError('Отклик не найден.', 404);
        if (application.status === status)
            return application;
        if (application.status !== 'PENDING')
            throw new AppError('Отклик уже рассмотрен.', 409);
        application.status = status;
        return application;
    });
}
