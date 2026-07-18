import 'dotenv/config';
import { getPrismaClient } from '../src/index.js';
import { seedInstitutionalData } from './seed/institutional.js';

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
