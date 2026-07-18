import type { getPrismaClient } from '../../src/index.js';

type PrismaClient = ReturnType<typeof getPrismaClient>;

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
] as const;

export async function seedInstitutionalData(prisma: PrismaClient): Promise<void> {
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
}
