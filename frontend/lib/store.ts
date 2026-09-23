import { type Application as DatabaseApplication, type Task as DatabaseTask, Prisma } from '../generated/prisma/client';
import { getDatabaseSchema, getPrisma } from './prisma';
import { type Application, type Card, type Task, scoreCard, taskStatus } from './domain';
import type { User } from './auth';

export class StoreError extends Error {}

const taskState = { _count: { select: { applications: { where: { status: 'ACCEPTED' as const } } } } };

function toTask(task: DatabaseTask & { _count?: { applications: number } }): Task {
  const { id, ownerId, score, status, createdAt, _count, ...card_data } = task;
  return {
    id, card_data, score, status, created_at: createdAt.toISOString(),
    ...(ownerId ? { owner_id: ownerId } : {}),
    applications_open: !!ownerId && !_count?.applications,
  };
}

function toApplication(application: DatabaseApplication): Application {
  const { id, taskId, teamName, idea, plan, prototype, status } = application;
  return { id, task_id: taskId, team_name: teamName, idea, plan, prototype, status };
}

export async function findUser(where: { id: string } | { email: string }): Promise<User | null> {
  const user = await getPrisma().user.findUnique({ where });
  return user ? { id: user.id, email: user.email, password_hash: user.passwordHash } : null;
}

export async function createUser(email: string, passwordHash: string): Promise<User | null> {
  try {
    const user = await getPrisma().user.create({ data: { email, passwordHash } });
    return { id: user.id, email: user.email, password_hash: user.passwordHash };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

export async function listTasks(ownerId?: string): Promise<Task[]> {
  return (await getPrisma().task.findMany({
    where: ownerId ? { ownerId } : undefined,
    include: taskState,
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })).map(toTask);
}

export async function getTask(id: string): Promise<Task | null> {
  const task = await getPrisma().task.findUnique({ where: { id }, include: taskState });
  return task ? toTask(task) : null;
}

export async function listApplications(taskId: string): Promise<Application[]> {
  return (await getPrisma().application.findMany({
    where: { taskId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })).map(toApplication);
}

export async function createTask(card: Card, ownerId: string): Promise<Task> {
  const score = scoreCard(card);
  return toTask(await getPrisma().task.create({ data: { ...card, ownerId, score, status: taskStatus(score) } }));
}

async function lockTask(tx: Prisma.TransactionClient, taskId: string) {
  // Every application mutation locks the same parent row, including new submissions.
  // Raw SQL must also honor DATABASE_URL's schema. Quote identifiers and bind user data separately.
  const table = Prisma.raw(`"${getDatabaseSchema().replaceAll('"', '""')}"."Task"`);
  const tasks = await tx.$queryRaw<{ id: string; ownerId: string | null }[]>`SELECT "id", "ownerId" FROM ${table} WHERE "id" = ${taskId} FOR UPDATE`;
  if (!tasks.length) throw new StoreError('Задача не найдена');
  return tasks[0];
}

async function ensureNoAcceptedTeam(tx: Prisma.TransactionClient, taskId: string) {
  if (await tx.application.findFirst({ where: { taskId, status: 'ACCEPTED' }, select: { id: true } })) {
    throw new StoreError('Команда уже выбрана. Другие отклики заблокированы.');
  }
}

export async function createApplication(input: {
  taskId: string; teamName: string; idea: string; plan: string; prototype: string;
}, userId: string): Promise<Application> {
  return getPrisma().$transaction(async tx => {
    const task = await lockTask(tx, input.taskId);
    if (!task.ownerId) throw new StoreError('Это демонстрационная задача, приём откликов закрыт');
    if (task.ownerId === userId) throw new StoreError('Нельзя откликнуться на свою задачу');
    await ensureNoAcceptedTeam(tx, input.taskId);
    return toApplication(await tx.application.create({ data: input }));
  }, { isolationLevel: 'ReadCommitted' });
}

export async function updateApplicationStatus(id: string, status: 'ACCEPTED' | 'REJECTED', userId: string): Promise<Application> {
  return getPrisma().$transaction(async tx => {
    const application = await tx.application.findUnique({ where: { id }, select: { taskId: true } });
    if (!application) throw new StoreError('Отклик не найден');
    const task = await lockTask(tx, application.taskId);
    if (task.ownerId !== userId) throw new StoreError('Нет доступа к задаче');
    await ensureNoAcceptedTeam(tx, application.taskId);
    // Re-read after acquiring the lock: another request may have reviewed this application.
    const current = await tx.application.findUnique({ where: { id } });
    if (!current) throw new StoreError('Отклик не найден');
    if (current.status !== 'PENDING') throw new StoreError('Отклик уже рассмотрен');
    return toApplication(await tx.application.update({ where: { id }, data: { status } }));
  }, { isolationLevel: 'ReadCommitted' });
}
