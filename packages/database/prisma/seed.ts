import 'dotenv/config';
import { getPrismaClient } from '../src/index.ts';

const prisma = getPrismaClient();

const developmentEditorId =
  process.env.DEV_EDITOR_USER_ID ?? '00000000-0000-4000-8000-000000000001';

const categories = [
  {
    name: 'Inteligencia artificial',
    slug: 'inteligencia-artificial',
  },
  {
    name: 'Investigación',
    slug: 'investigacion',
  },
  {
    name: 'Publicaciones',
    slug: 'publicaciones',
  },
  {
    name: 'Eventos',
    slug: 'eventos',
  },
  {
    name: 'Convocatorias',
    slug: 'convocatorias',
  },
];

async function main(): Promise<void> {
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

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        slug: category.slug,
      },
      update: {
        name: category.name,
        active: true,
      },
      create: {
        name: category.name,
        slug: category.slug,
      },
    });
  }

  await prisma.siteSetting.upsert({
    where: {
      key: 'site.timezone',
    },
    update: {
      value: 'America/Lima',
    },
    create: {
      key: 'site.timezone',
      value: 'America/Lima',
      description: 'Timezone used to display scheduled content.',
    },
  });

  await prisma.siteSetting.upsert({
    where: {
      key: 'media.defaultBucket',
    },
    update: {
      value: 'intgarti-media',
    },
    create: {
      key: 'media.defaultBucket',
      value: 'intgarti-media',
      description: 'Default object storage bucket.',
    },
  });

  console.log('Initial INTGARTI data created.');
  console.log(`Development editor: ${developmentEditorId}`);
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
