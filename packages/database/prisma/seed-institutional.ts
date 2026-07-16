import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getPrismaClient } from '../src/index.js';
import { seedInstitutionalData } from './seed/institutional.js';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const prisma = getPrismaClient();

async function main(): Promise<void> {
  await seedInstitutionalData(prisma);

  console.log('Institutional seed completed.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
