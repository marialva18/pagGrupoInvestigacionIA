import type { AuthenticatedUser, RichTextBody } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { toJsonObject } from '../../common/json.js';
import type {
  DiscardExternalNewsItemInput,
  ImportExternalNewsItemInput,
  ListExternalNewsItemsInput,
} from './external-news.schema.js';

type NewsActor = Pick<AuthenticatedUser, 'id'>;

function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 170)
    .replace(/-+$/g, '');
}

function toTiptapBody(text: string | null | undefined): RichTextBody {
  const paragraphs = (text ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 100);

  return {
    schemaVersion: 1,
    editor: 'tiptap',
    document: {
      type: 'doc',
      content: paragraphs.map((paragraph) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph }],
      })),
    },
  };
}

interface ContentSlugLookup {
  contentItem: {
    findUnique(input: {
      where: { slug: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

async function createUniqueSlug(transaction: ContentSlugLookup, value: string) {
  const base = normalizeSlug(value);

  if (!base) {
    throw new AppError('No fue posible generar un slug.', 400, 'EXTERNAL_NEWS_SLUG_INVALID');
  }

  for (let number = 1; number <= 100; number += 1) {
    const suffix = number === 1 ? '' : `-${number}`;
    const candidate = `${base.slice(0, 180 - suffix.length)}${suffix}`;
    const existing = await transaction.contentItem.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new AppError('No fue posible generar un slug único.', 409, 'EXTERNAL_NEWS_SLUG_CONFLICT');
}

function mapItem(item: {
  id: string;
  sourceKey: string;
  canonicalUrl: string;
  title: string;
  sourceSummary: string | null;
  generatedSummary: string | null;
  summaryStatus: 'SOURCE' | 'EXTRACTIVE' | 'AI_GENERATED' | 'REVIEWED';
  language: string | null;
  author: string | null;
  imageUrl: string | null;
  matchedKeywords: string[];
  relevanceScore: number;
  publishedAt: Date | null;
  status: 'DISCOVERED' | 'REVIEWED' | 'IMPORTED' | 'DISCARDED' | 'FAILED';
  firstSeenAt: Date;
  contentId: string | null;
  source: {
    id: string;
    key: string;
    name: string;
    type:
      | 'ACADEMIC'
      | 'NEWS_AGENCY'
      | 'NEWS_MEDIA'
      | 'CORPORATE_RESEARCH'
      | 'CORPORATE_BLOG'
      | 'GOVERNMENT'
      | 'UNIVERSITY'
      | 'OTHER';
    websiteUrl: string;
    reviewMode: 'REQUIRED' | 'AUTOMATIC';
  } | null;
}) {
  return {
    ...item,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    firstSeenAt: item.firstSeenAt.toISOString(),
  };
}

const externalItemSelect = {
  id: true,
  sourceKey: true,
  canonicalUrl: true,
  title: true,
  sourceSummary: true,
  generatedSummary: true,
  summaryStatus: true,
  language: true,
  author: true,
  imageUrl: true,
  matchedKeywords: true,
  relevanceScore: true,
  publishedAt: true,
  status: true,
  firstSeenAt: true,
  contentId: true,
  source: {
    select: {
      id: true,
      key: true,
      name: true,
      type: true,
      websiteUrl: true,
      reviewMode: true,
    },
  },
} as const;

export async function listExternalNewsItems(input: ListExternalNewsItemsInput) {
  const prisma = getPrismaClient();
  const where = {
    ...(input.status
      ? { status: input.status }
      : { status: { in: ['DISCOVERED', 'REVIEWED'] as Array<'DISCOVERED' | 'REVIEWED'> } }),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: 'insensitive' as const } },
            { generatedSummary: { contains: input.q, mode: 'insensitive' as const } },
            { sourceSummary: { contains: input.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const skip = (input.page - 1) * input.pageSize;
  const [total, items] = await prisma.$transaction([
    prisma.externalNewsItem.count({ where }),
    prisma.externalNewsItem.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: [{ relevanceScore: 'desc' }, { publishedAt: 'desc' }, { firstSeenAt: 'desc' }],
      select: externalItemSelect,
    }),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: items.map(mapItem),
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

export async function importExternalNewsItem(
  actor: NewsActor,
  itemId: string,
  input: ImportExternalNewsItemInput,
) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const item = await transaction.externalNewsItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        status: true,
        title: true,
        sourceSummary: true,
        generatedSummary: true,
        canonicalUrl: true,
        publishedAt: true,
        sourceKey: true,
        source: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    if (!item) {
      throw new AppError('No se encontró la noticia externa.', 404, 'EXTERNAL_NEWS_ITEM_NOT_FOUND');
    }

    if (item.status === 'IMPORTED') {
      throw new AppError(
        'La noticia externa ya fue importada.',
        409,
        'EXTERNAL_NEWS_ITEM_IMPORTED',
      );
    }

    if (item.status === 'DISCARDED') {
      throw new AppError('La noticia externa fue descartada.', 409, 'EXTERNAL_NEWS_ITEM_DISCARDED');
    }

    if (input.categoryIds.length > 0) {
      const categories = await transaction.category.count({
        where: { id: { in: input.categoryIds }, active: true },
      });

      if (categories !== input.categoryIds.length) {
        throw new AppError('Una o más categorías no son válidas.', 422, 'NEWS_CATEGORY_INVALID');
      }
    }

    const title = input.title?.trim() ?? item.title;
    const summary =
      input.summary?.trim() ??
      item.generatedSummary ??
      item.sourceSummary ??
      'Consulta la publicación original para conocer todos los detalles.';
    const slug = await createUniqueSlug(transaction, input.slug ?? title);
    const publishAt = input.publishNow ? new Date() : null;

    if (input.featured) {
      await transaction.contentItem.updateMany({
        where: { type: 'NEWS', featured: true, archivedAt: null },
        data: { featured: false },
      });
    }

    const content = await transaction.contentItem.create({
      data: {
        type: 'NEWS',
        status: input.publishNow ? 'PUBLISHED' : 'DRAFT',
        slug,
        title,
        summary,
        body: toJsonObject(toTiptapBody(input.bodyText ?? summary)),
        seoTitle: title.slice(0, 70),
        metaDescription: summary.slice(0, 180),
        featured: input.featured,
        origin: 'EXTERNAL',
        externalUrl: item.canonicalUrl,
        sourceName: item.source?.name ?? item.sourceKey,
        sourceType: item.source?.type ?? null,
        originalTitle: item.title,
        externalPublishedAt: item.publishedAt,
        publishedAt: publishAt,
        createdById: actor.id,
        assignedEditorId: actor.id,
        categories: {
          create: input.categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        origin: true,
        publishedAt: true,
      },
    });

    await transaction.externalNewsItem.update({
      where: { id: item.id },
      data: {
        status: 'IMPORTED',
        contentId: content.id,
        reviewedAt: new Date(),
        importedAt: new Date(),
        generatedSummary: summary,
        summaryStatus: 'REVIEWED',
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXTERNAL_NEWS_IMPORTED',
        entityType: 'ExternalNewsItem',
        entityId: item.id,
        after: {
          contentId: content.id,
          status: content.status,
          featured: content.featured,
        },
      },
    });

    return {
      ...content,
      publishedAt: content.publishedAt?.toISOString() ?? null,
    };
  });
}

export async function discardExternalNewsItem(
  actor: NewsActor,
  itemId: string,
  input: DiscardExternalNewsItemInput,
) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const item = await transaction.externalNewsItem.findUnique({
      where: { id: itemId },
      select: { id: true, status: true, title: true },
    });

    if (!item) {
      throw new AppError('No se encontró la noticia externa.', 404, 'EXTERNAL_NEWS_ITEM_NOT_FOUND');
    }

    if (item.status === 'IMPORTED') {
      throw new AppError(
        'Una noticia importada no puede descartarse.',
        409,
        'EXTERNAL_NEWS_ITEM_IMPORTED',
      );
    }

    const updated = await transaction.externalNewsItem.update({
      where: { id: itemId },
      data: {
        status: 'DISCARDED',
        reviewedAt: new Date(),
        failureReason: input.reason ?? null,
      },
      select: { id: true, status: true },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXTERNAL_NEWS_DISCARDED',
        entityType: 'ExternalNewsItem',
        entityId: itemId,
        reason: input.reason ?? null,
        before: item,
        after: updated,
      },
    });

    return updated;
  });
}
