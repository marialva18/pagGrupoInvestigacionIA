import { getPrismaClient } from '@intgarti/database';

export async function listActiveCategories() {
  const prisma = getPrismaClient();

  const items = await prisma.category.findMany({
    where: {
      active: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: [
      {
        name: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });

  return {
    items,
  };
}
