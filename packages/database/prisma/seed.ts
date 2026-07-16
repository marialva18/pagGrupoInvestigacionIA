import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { getPrismaClient } from '../src/index.js';
import { seedDevelopmentData } from './seed/development.js';
import { seedInstitutionalData } from './seed/institutional.js';
import { seedSystemData } from './seed/system.js';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const prisma = getPrismaClient();

async function main(): Promise<void> {
  await seedSystemData(prisma);
  await seedInstitutionalData(prisma);

  if (process.env.NODE_ENV !== 'production') {
    const developmentEditorId = await seedDevelopmentData(prisma);

    console.log(`Development editor created: ${developmentEditorId}`);
  }

  console.log('System seed completed.');
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
