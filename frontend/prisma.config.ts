import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Generation and Next.js builds do not need a running database or an .env file.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
