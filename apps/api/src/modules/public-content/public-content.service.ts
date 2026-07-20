import {
  type PublicAcademicSource,
  type PublicNewsDetail,
  type PublicNewsSummary,
} from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { normalizeStoredRichTextBody } from '../../common/content/rich-text-body.js';
import { mapMediaReference, mediaReferenceSelect } from '../media/media-reference.js';
import { listPublicMembers } from '../members/members.service.js';
import type { PublicNewsListInput } from './public-content.schema.js';

const publicNewsSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  body: true,
  seoTitle: true,
  metaDescription: true,
  featured: true,
  publishedAt: true,
  updatedAt: true,

  categories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        },
      },
    },
  },

  coverMedia: {
    select: mediaReferenceSelect,
  },
} as const;

function mapPublicNewsSummary(news: {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featured: boolean;
  publishedAt: Date | null;
  updatedAt: Date;

  categories: Array<{
    category: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    };
  }>;

  coverMedia: Parameters<typeof mapMediaReference>[0];
}): PublicNewsSummary {
  return {
    id: news.id,
    slug: news.slug,
    title: news.title,
    summary: news.summary,
    featured: news.featured,

    publishedAt: news.publishedAt?.toISOString() ?? null,

    updatedAt: news.updatedAt.toISOString(),

    categories: news.categories.map(({ category }) => category),

    coverMedia: mapMediaReference(news.coverMedia),
  };
}

export async function listPublicNews(input: PublicNewsListInput) {
  const prisma = getPrismaClient();
  const now = new Date();

  const where = {
    type: 'NEWS' as const,
    status: 'PUBLISHED' as const,
    archivedAt: null,

    publishedAt: {
      lte: now,
    },

    ...(input.featured !== undefined
      ? {
          featured: input.featured,
        }
      : {}),

    ...(input.category
      ? {
          categories: {
            some: {
              category: {
                slug: input.category,
                active: true,
              },
            },
          },
        }
      : {}),

    ...(input.q
      ? {
          OR: [
            {
              title: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
            {
              summary: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.pageSize;

  const [total, newsItems] = await prisma.$transaction([
    prisma.contentItem.count({
      where,
    }),

    prisma.contentItem.findMany({
      where,
      skip,
      take: input.pageSize,

      orderBy: [
        {
          featured: 'desc',
        },
        {
          publishedAt: 'desc',
        },
        {
          updatedAt: 'desc',
        },
      ],

      select: publicNewsSelect,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: newsItems.map(mapPublicNewsSummary),

    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages,
      hasPreviousPage: input.page > 1,
      hasNextPage: input.page < totalPages,
    },
  };
}

export async function getPublicNewsBySlug(slug: string): Promise<PublicNewsDetail> {
  const prisma = getPrismaClient();

  const news = await prisma.contentItem.findFirst({
    where: {
      slug,
      type: 'NEWS',
      status: 'PUBLISHED',
      archivedAt: null,

      publishedAt: {
        lte: new Date(),
      },
    },

    select: publicNewsSelect,
  });

  if (!news) {
    throw new AppError('No se encontró la noticia solicitada.', 404, 'PUBLIC_NEWS_NOT_FOUND');
  }

  return {
    ...mapPublicNewsSummary(news),
    body: normalizeStoredRichTextBody(news.body),
    seoTitle: news.seoTitle,
    metaDescription: news.metaDescription,
  };
}

export { listPublicMembers };

export async function listPublicAcademicSources(): Promise<PublicAcademicSource[]> {
  const prisma = getPrismaClient();

  const sources = await prisma.academicSource.findMany({
    where: {
      active: true,
    },

    orderBy: [
      {
        featured: 'desc',
      },
      {
        displayOrder: 'asc',
      },
      {
        name: 'asc',
      },
    ],

    select: {
      id: true,
      name: true,
      type: true,
      url: true,
      description: true,
      featured: true,
      displayOrder: true,

      logoMedia: {
        select: mediaReferenceSelect,
      },
    },
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url,
    description: source.description,
    featured: source.featured,
    displayOrder: source.displayOrder,

    logoMedia: mapMediaReference(source.logoMedia),
  }));
}
