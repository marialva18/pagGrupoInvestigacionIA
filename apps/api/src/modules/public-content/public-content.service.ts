import {
  richTextBodySchema,
  type PublicAcademicSource,
  type PublicNewsDetail,
  type PublicNewsSummary,
  type RichTextBody,
} from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { mapMediaReference, mediaReferenceSelect } from '../media/media-reference.js';
import { listPublicMembers } from '../members/members.service.js';
import type { PublicNewsListInput } from './public-content.schema.js';

const emptyRichTextBody: RichTextBody = {
  schemaVersion: 1,
  editor: 'tiptap',
  document: {
    type: 'doc',
    content: [],
  },
};

const publicNewsSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  body: true,
  seoTitle: true,
  metaDescription: true,
  featured: true,
  origin: true,
  externalUrl: true,
  sourceName: true,
  sourceType: true,
  originalTitle: true,
  externalPublishedAt: true,
  publishedAt: true,
  expiresAt: true,
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

function parseRichTextBody(value: unknown): RichTextBody {
  const parsed = richTextBodySchema.safeParse(value);

  return parsed.success ? parsed.data : emptyRichTextBody;
}

function mapPublicNewsSummary(news: {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featured: boolean;
  origin: 'INTERNAL' | 'EXTERNAL';
  externalUrl: string | null;
  sourceName: string | null;
  sourceType:
    | 'ACADEMIC'
    | 'NEWS_AGENCY'
    | 'NEWS_MEDIA'
    | 'CORPORATE_RESEARCH'
    | 'CORPORATE_BLOG'
    | 'GOVERNMENT'
    | 'UNIVERSITY'
    | 'OTHER'
    | null;
  originalTitle: string | null;
  externalPublishedAt: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
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
  const normalizedSourceKey = (news.sourceName ?? 'fuente-externa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    id: news.id,
    slug: news.slug,
    title: news.title,
    summary: news.summary,
    featured: news.featured,
    origin: news.origin,
    source: {
      key: news.origin === 'INTERNAL' ? 'intgarti' : normalizedSourceKey || 'fuente-externa',
      name: news.sourceName ?? (news.origin === 'INTERNAL' ? 'INTGARTI' : 'Fuente externa'),
      type: news.sourceType,
      url: news.externalUrl,
      originalTitle: news.originalTitle,
      externalPublishedAt: news.externalPublishedAt?.toISOString() ?? null,
    },

    publishedAt: news.publishedAt?.toISOString() ?? null,
    expiresAt: news.expiresAt?.toISOString() ?? null,

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

    AND: [
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],

    ...(input.featured !== undefined
      ? {
          featured: input.featured,
        }
      : {}),

    ...(input.origin
      ? {
          origin: input.origin,
        }
      : {}),

    ...(input.year
      ? {
          publishedAt: {
            gte: new Date(`${input.year}-01-01T00:00:00.000Z`),
            lt: new Date(`${input.year + 1}-01-01T00:00:00.000Z`),
            lte: now,
          },
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
            {
              sourceName: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
            {
              categories: {
                some: {
                  category: {
                    name: {
                      contains: input.q,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.pageSize;

  const total = await prisma.contentItem.count({
    where,
  });

  const newsItems = await prisma.contentItem.findMany({
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
  });

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

      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },

    select: publicNewsSelect,
  });

  if (!news) {
    throw new AppError('No se encontró la noticia solicitada.', 404, 'PUBLIC_NEWS_NOT_FOUND');
  }

  return {
    ...mapPublicNewsSummary(news),
    body: parseRichTextBody(news.body),
    seoTitle: news.seoTitle,
    metaDescription: news.metaDescription,
  };
}

export { listPublicMembers };

export async function listPublicAcademicSources(): Promise<PublicAcademicSource[]> {
  const prisma = getPrismaClient();

  const [sources, ingestionSources] = await Promise.all([
    prisma.academicSource.findMany({
      where: { active: true },
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        description: true,
        featured: true,
        displayOrder: true,
        logoMedia: { select: mediaReferenceSelect },
      },
    }),
    prisma.externalNewsSource.findMany({
      where: { type: 'ACADEMIC', status: 'ACTIVE', deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, websiteUrl: true },
    }),
  ]);

  const publicSources: PublicAcademicSource[] = sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url,
    description: source.description,
    featured: source.featured,
    displayOrder: source.displayOrder,

    logoMedia: mapMediaReference(source.logoMedia),
  }));

  const existingUrls = new Set(publicSources.map((source) => source.url.replace(/\/+$/, '')));

  for (const [index, source] of ingestionSources.entries()) {
    const normalizedUrl = source.websiteUrl.replace(/\/+$/, '');
    if (existingUrls.has(normalizedUrl)) continue;

    publicSources.push({
      id: source.id,
      name: source.name,
      type: 'REPOSITORY',
      url: source.websiteUrl,
      description: 'Fuente académica autorizada por INTGARTI.',
      featured: false,
      displayOrder: sources.length + index,
      logoMedia: null,
    });
  }

  return publicSources;
}
