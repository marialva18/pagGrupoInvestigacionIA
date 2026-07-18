import type { getPrismaClient } from '../../src/index.js';

type PrismaClient = ReturnType<typeof getPrismaClient>;

const settings = [
  {
    key: 'site.timezone',
    value: 'America/Lima',
    description: 'Timezone used to display scheduled content.',
  },
  {
    key: 'media.defaultBucket',
    value: 'intgarti-media',
    description: 'Default object storage bucket.',
  },
] as const;

export async function seedSystemData(prisma: PrismaClient): Promise<void> {
  for (const setting of settings) {
    await prisma.siteSetting.upsert({
      where: {
        key: setting.key,
      },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });
  }
}
