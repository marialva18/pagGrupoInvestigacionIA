import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

type PrismaGlobal = typeof globalThis & {
  intgartiPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required to create Prisma Client.');
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
  });
}

export function getPrismaClient(): PrismaClient {
  if (!prismaGlobal.intgartiPrisma) {
    prismaGlobal.intgartiPrisma = createPrismaClient();
  }

  return prismaGlobal.intgartiPrisma;
}
