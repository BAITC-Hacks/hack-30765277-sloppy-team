import * as store from './store';
import { Application, Card } from './domain';
import { scoreCard } from './backend-client';
import { AppError } from './errors';

export const listTasks = store.listTasks;
export async function getTask(id: string) {
    const task = await store.getTask(id);
    if (!task) throw new AppError('Задача не найдена.', 404);
    return { ...task, scoring: await scoreCard(task.card_data) };
}
export async function applicationsFor(id: string, userId: string) {
    const task = await store.getTask(id);
    if (!task) throw new AppError('Задача не найдена.', 404);
    if (task.owner_id !== userId) throw new AppError('Нет доступа к откликам.', 403);
    return store.listApplications(id);
}
export async function saveTask(card: Card, userId: string, id?: string) {
    if (!card.title || !card.context) throw new AppError('Заполните название и контекст.', 422);
    if (id) {
        const task = await store.getTask(id);
        if (!task) throw new AppError('Задача не найдена.', 404);
        if (task.owner_id !== userId) throw new AppError('Нет доступа к задаче.', 403);
    }
    const scoring = await scoreCard(card);
    const task = id ? await store.updateTask(id, card, userId, scoring) : await store.createTask(card, userId, scoring);
    return { ...task, scoring };
}
export async function applyToTask(input: Omit<Application, 'id' | 'status'>, userId: string) {
    return store.createApplication({ taskId: input.task_id, teamName: input.team_name,
        idea: input.idea, plan: input.plan, prototype: input.prototype, deadline: input.deadline || '' }, userId);
}
export const decideApplication = store.updateApplicationStatus;
