import 'dotenv/config';
import { seedTasks } from '../lib/domain';
import { getPrisma } from '../lib/prisma';

async function main() {
  const prisma = getPrisma();
  try {
    await prisma.$transaction(seedTasks().map(task => prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id, ...task.card_data, score: task.score,
        status: task.status, createdAt: new Date(task.created_at),
      },
    })));
    console.log('Шесть демонстрационных задач добавлены. Существующие записи сохранены.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Не удалось заполнить базу. Проверьте DATABASE_URL и применённые миграции.');
  process.exitCode = 1;
});
