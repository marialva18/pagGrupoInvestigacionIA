import 'dotenv/config';
import { getPrismaClient } from '../src/index.js';
import { seedDevelopmentData } from './seed/development.js';
import { seedSystemData } from './seed/system.js';

const prisma = getPrismaClient();

async function main(): Promise<void> {
  await seedSystemData(prisma);

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
