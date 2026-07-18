import type { getPrismaClient } from '../../src/index.js';

type PrismaClient = ReturnType<typeof getPrismaClient>;

export async function seedDevelopmentData(prisma: PrismaClient): Promise<string> {
  const developmentEditorId =
    process.env.DEV_EDITOR_USER_ID ?? '00000000-0000-4000-8000-000000000001';

  await prisma.user.upsert({
    where: {
      id: developmentEditorId,
    },
    update: {
      email: 'editor.local@intgarti.test',
      displayName: 'Editor local INTGARTI',
      role: 'EDITOR',
      status: 'ACTIVE',
    },
    create: {
      id: developmentEditorId,
      email: 'editor.local@intgarti.test',
      displayName: 'Editor local INTGARTI',
      role: 'EDITOR',
      status: 'ACTIVE',
    },
  });

  return developmentEditorId;
}
