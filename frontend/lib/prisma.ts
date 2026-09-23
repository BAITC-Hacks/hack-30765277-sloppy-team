import { PrismaPg } from '@prisma/adapter-pg';
import { AppError } from './errors';
import { PrismaClient } from '../generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDatabaseSchema(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new AppError('База данных не настроена. Укажите DATABASE_URL на сервере.', 503);
  return new URL(connectionString).searchParams.get('schema') ?? 'public';
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new AppError('База данных не настроена. Укажите DATABASE_URL на сервере.', 503);
    globalForPrisma.prisma = new PrismaClient({
      // Prisma's pg adapter normalizes timestamptz as UTC; use UTC on every pooled connection.
      adapter: new PrismaPg({ connectionString, options: '-c timezone=UTC', connectionTimeoutMillis: 5000, query_timeout: 10000, max: 10 }, { schema: getDatabaseSchema() }),
    });
  }
  return globalForPrisma.prisma;
}
