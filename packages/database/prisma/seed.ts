import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const categories = [
  {
    name: 'Inteligencia artificial',
    slug: 'inteligencia-artificial',
  },
  {
    name: 'Investigaci\u00f3n',
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
