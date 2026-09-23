import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDatabaseSchema(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  return new URL(connectionString).searchParams.get('schema') ?? 'public';
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    globalForPrisma.prisma = new PrismaClient({
      // Prisma's pg adapter normalizes timestamptz as UTC; use UTC on every pooled connection.
      adapter: new PrismaPg({ connectionString, options: '-c timezone=UTC' }, { schema: getDatabaseSchema() }),
    });
  }
  return globalForPrisma.prisma;
}
