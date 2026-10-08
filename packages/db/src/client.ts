import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. See .env.example.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

// Reuse one client across Next.js hot reloads in development.
const globalForPrisma = globalThis as unknown as { __snowPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.__snowPrisma ??= createPrismaClient();
  return globalForPrisma.__snowPrisma;
}
