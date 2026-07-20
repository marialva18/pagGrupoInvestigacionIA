import type { AuthenticatedUser } from '@intgarti/contracts';
import type { RestoreNewsInput } from './news.schema.js';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { toJsonObject } from '../../common/json.js';
import type {
  ArchiveNewsInput,
  CreateNewsInput,
  ListNewsInput,
  PublishNewsInput,
  SetNewsFeaturedInput,
  UnpublishNewsInput,
  UpdateNewsInput,
} from './news.schema.js';

type NewsActor = Pick<AuthenticatedUser, 'id' | 'role'>;

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

function createNumberedSlug(baseSlug: string, number: number): string {
  if (number === 1) {
    return baseSlug;
  }

  const suffix = `-${number}`;

  return `${baseSlug.slice(0, 180 - suffix.length)}${suffix}`;
}

export async function createNews(actor: NewsActor, input: CreateNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const editor = actor;

    if (input.categoryIds.length > 0) {
      const categoryCount = await transaction.category.count({
        where: {
          id: { in: input.categoryIds },
          active: true,
        },
      });

      if (categoryCount !== input.categoryIds.length) {
        throw new AppError(
          'Una o más categorías no existen o están inactivas.',
          422,
          'NEWS_CATEGORY_INVALID',
        );
      }
    }

    let coverMedia: { id: string } | null = null;

    if (input.coverMediaId) {
      coverMedia = await transaction.mediaAsset.findFirst({
        where: {
          id: input.coverMediaId,
          status: 'READY',
          archivedAt: null,
          rightsStatus: { not: 'RESTRICTED' },
        },
        select: { id: true },
      });

      if (!coverMedia) {
        throw new AppError(
          'La imagen de portada no existe, no está lista o está restringida.',
          422,
          'NEWS_COVER_MEDIA_INVALID',
        );
      }
    }

    const requestedSlug = normalizeSlug(input.slug ?? input.title);

    if (!requestedSlug) {
      throw new AppError(
        'No fue posible generar un slug para la noticia.',
        400,
        'NEWS_SLUG_INVALID',
      );
    }

    let slug = requestedSlug;

    for (let number = 1; number <= 100; number += 1) {
      const candidate = createNumberedSlug(requestedSlug, number);
      const existing = await transaction.contentItem.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing) {
        slug = candidate;
        break;
      }

      if (number === 100) {
        throw new AppError('No fue posible generar un slug único.', 409, 'NEWS_SLUG_CONFLICT');
      }
    }

    if (input.featured) {
      await transaction.contentItem.updateMany({
        where: { type: 'NEWS', featured: true, archivedAt: null },
        data: { featured: false },
      });
    }

    const seoTitle = input.seoTitle?.trim() ?? input.title.trim().slice(0, 70);
    const metaDescription = input.metaDescription?.trim() ?? input.summary.trim().slice(0, 180);
    const publishDate = input.publishNow ? new Date() : null;

    const news = await transaction.contentItem.create({
      data: {
        type: 'NEWS',
        status: input.publishNow ? 'PUBLISHED' : 'DRAFT',
        slug,
        title: input.title.trim(),
        summary: input.summary.trim(),
        body: toJsonObject(input.body),
        seoTitle,
        metaDescription,
        featured: input.featured,
        origin: input.origin,
        externalUrl: input.origin === 'EXTERNAL' ? (input.externalUrl ?? null) : null,
        sourceName: input.origin === 'EXTERNAL' ? (input.sourceName ?? null) : 'INTGARTI',
        sourceType: input.origin === 'EXTERNAL' ? (input.sourceType ?? null) : null,
        originalTitle: input.origin === 'EXTERNAL' ? (input.originalTitle ?? null) : null,
        externalPublishedAt:
          input.origin === 'EXTERNAL' ? (input.externalPublishedAt ?? null) : null,
        publishedAt: publishDate,
        expiresAt: input.expiresAt ?? null,
        createdById: editor.id,
        assignedEditorId: editor.id,
        coverMediaId: coverMedia?.id ?? null,
        categories: {
          create: input.categoryIds.map((categoryId) => ({ categoryId })),
        },
        ...(coverMedia
          ? {
              media: {
                create: {
                  mediaAssetId: coverMedia.id,
                  role: 'COVER',
                  position: 0,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        type: true,
        status: true,
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
        lockVersion: true,
        publishedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, displayName: true },
        },
        categories: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        coverMedia: {
          select: {
            id: true,
            objectKey: true,
            altText: true,
            status: true,
            variants: {
              select: { kind: true, objectKey: true, width: true, height: true },
              orderBy: { kind: 'asc' },
            },
          },
        },
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: editor.id,
        action: input.publishNow ? 'NEWS_CREATED_AND_PUBLISHED' : 'NEWS_CREATED',
        entityType: 'ContentItem',
        entityId: news.id,
        after: {
          id: news.id,
          status: news.status,
          slug: news.slug,
          title: news.title,
          origin: news.origin,
          featured: news.featured,
          categoryIds: input.categoryIds,
          coverMediaId: coverMedia?.id ?? null,
          lockVersion: news.lockVersion,
        },
      },
    });

    return {
      ...news,
      externalPublishedAt: news.externalPublishedAt?.toISOString() ?? null,
      publishedAt: news.publishedAt?.toISOString() ?? null,
      createdAt: news.createdAt.toISOString(),
      updatedAt: news.updatedAt.toISOString(),
      categories: news.categories.map(({ category }) => category),
    };
  });
}

export async function listNews(actor: NewsActor, input: ListNewsInput) {
  const prisma = getPrismaClient();

  const editor = actor;

  const accessCondition =
    editor.role === 'ADMIN'
      ? {}
      : {
          OR: [
            {
              createdById: editor.id,
            },
            {
              assignedEditorId: editor.id,
            },
          ],
        };

  const statusCondition = input.status
    ? {
        status: input.status,
      }
    : {};

  const categoryCondition = input.categoryId
    ? {
        categories: {
          some: {
            categoryId: input.categoryId,
          },
        },
      }
    : {};

  const searchCondition = input.q
    ? {
        OR: [
          {
            title: {
              contains: input.q,
              mode: 'insensitive' as const,
            },
          },
          {
            slug: {
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
    : {};

  const where = {
    AND: [
      {
        type: 'NEWS' as const,
      },
      accessCondition,
      statusCondition,
      categoryCondition,
      searchCondition,
    ],
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
          updatedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        status: true,
        slug: true,
        title: true,
        summary: true,
        featured: true,
        origin: true,
        sourceName: true,
        lockVersion: true,
        scheduledAt: true,
        publishedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,

        createdBy: {
          select: {
            id: true,
            displayName: true,
          },
        },

        assignedEditor: {
          select: {
            id: true,
            displayName: true,
          },
        },

        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },

        coverMedia: {
          select: {
            id: true,
            altText: true,
            status: true,

            variants: {
              where: {
                kind: {
                  in: ['THUMBNAIL', 'CARD'],
                },
              },
              select: {
                kind: true,
                objectKey: true,
                width: true,
                height: true,
              },
              orderBy: {
                kind: 'asc',
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: newsItems.map((news) => ({
      ...news,

      categories: news.categories.map(({ category }) => category),
    })),

    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages,
      hasPreviousPage: input.page > 1,
      hasNextPage: input.page < totalPages,
    },

    filters: {
      q: input.q ?? null,
      status: input.status ?? null,
      categoryId: input.categoryId ?? null,
    },
  };
}

export async function getNewsById(actor: NewsActor, newsId: string) {
  const prisma = getPrismaClient();

  const editor = actor;

  const accessCondition =
    editor.role === 'ADMIN'
      ? {}
      : {
          OR: [
            {
              createdById: editor.id,
            },
            {
              assignedEditorId: editor.id,
            },
          ],
        };

  const news = await prisma.contentItem.findFirst({
    where: {
      AND: [
        {
          id: newsId,
        },
        {
          type: 'NEWS',
        },
        accessCondition,
      ],
    },

    select: {
      id: true,
      type: true,
      status: true,
      slug: true,
      title: true,
      summary: true,
      body: true,
      seoTitle: true,
      metaDescription: true,
      featured: true,
      lockVersion: true,
      scheduledAt: true,
      publishedAt: true,
      expiresAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,

      createdBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      assignedEditor: {
        select: {
          id: true,
          displayName: true,
        },
      },

      reviewedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      approvedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      categories: {
        select: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              active: true,
            },
          },
        },
      },

      coverMedia: {
        select: {
          id: true,
          originalFilename: true,
          objectKey: true,
          mimeType: true,
          width: true,
          height: true,
          altText: true,
          caption: true,
          credit: true,
          rightsStatus: true,
          status: true,

          variants: {
            select: {
              kind: true,
              objectKey: true,
              mimeType: true,
              width: true,
              height: true,
            },
            orderBy: {
              kind: 'asc',
            },
          },
        },
      },
    },
  });

  if (!news) {
    throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
  }

  return {
    ...news,

    categories: news.categories.map(({ category }) => category),
  };
}

type NewsRevisionSnapshot = {
  slug: string;
  title: string;
  summary: string;
  body: NonNullable<UpdateNewsInput['body']>;
  seoTitle: string | null;
  metaDescription: string | null;
  expiresAt: string | null;
  featured: boolean;
  coverMediaId: string | null;
  categoryIds: string[];
};

export async function updateNews(actor: NewsActor, newsId: string, input: UpdateNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const editor = actor;

    const accessCondition =
      editor.role === 'ADMIN'
        ? {}
        : {
            OR: [
              {
                createdById: editor.id,
              },
              {
                assignedEditorId: editor.id,
              },
            ],
          };

    const existing = await transaction.contentItem.findFirst({
      where: {
        AND: [
          {
            id: newsId,
          },
          {
            type: 'NEWS',
          },
          accessCondition,
        ],
      },
      select: {
        id: true,
        status: true,
        slug: true,
        title: true,
        summary: true,
        body: true,
        seoTitle: true,
        metaDescription: true,
        featured: true,
        lockVersion: true,
        coverMediaId: true,
        scheduledAt: true,
        publishedAt: true,
        expiresAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,

        categories: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (existing.lockVersion !== input.lockVersion) {
      throw new AppError(
        'La noticia fue modificada por otro usuario. Actualiza la página antes de volver a guardar.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (existing.status === 'ARCHIVED') {
      throw new AppError(
        'La noticia está archivada. Debes restaurarla antes de editarla.',
        409,
        'NEWS_ARCHIVED_READ_ONLY',
      );
    }

    if (input.categoryIds !== undefined) {
      const categories = await transaction.category.findMany({
        where: {
          id: {
            in: input.categoryIds,
          },
          active: true,
        },
        select: {
          id: true,
        },
      });

      if (categories.length !== input.categoryIds.length) {
        throw new AppError(
          'Una o más categorías no existen o están inactivas.',
          422,
          'NEWS_CATEGORY_INVALID',
        );
      }
    }

    if (input.coverMediaId !== undefined && input.coverMediaId !== null) {
      const coverMedia = await transaction.mediaAsset.findFirst({
        where: {
          id: input.coverMediaId,
          status: 'READY',
          archivedAt: null,
          rightsStatus: {
            not: 'RESTRICTED',
          },
        },
        select: {
          id: true,
        },
      });

      if (!coverMedia) {
        throw new AppError(
          'La imagen de portada no existe, no está lista o está restringida.',
          422,
          'NEWS_COVER_MEDIA_INVALID',
        );
      }
    }

    let updatedSlug: string | undefined;

    if (input.slug !== undefined) {
      updatedSlug = normalizeSlug(input.slug);

      if (!updatedSlug) {
        throw new AppError('El slug de la noticia no es válido.', 400, 'NEWS_SLUG_INVALID');
      }

      const conflictingContent = await transaction.contentItem.findFirst({
        where: {
          slug: updatedSlug,
          id: {
            not: newsId,
          },
        },
        select: {
          id: true,
        },
      });

      if (conflictingContent) {
        throw new AppError('El slug ya pertenece a otro contenido.', 409, 'NEWS_SLUG_CONFLICT');
      }
    }

    /*
     * Cuando una noticia ya está publicada:
     * 1. Conservamos automáticamente su versión anterior.
     * 2. Aplicamos el cambio de inmediato.
     * 3. La noticia continúa publicada.
     *
     * El usuario solo necesita presionar Guardar cambios.
     */
    let historyRevision: {
      id: string;
      version: number;
      status: string;
      snapshot: unknown;
      changeSummary: string | null;
      sourceLockVersion: number;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;

    if (existing.status === 'PUBLISHED') {
      const previousSnapshot: NewsRevisionSnapshot = {
        slug: existing.slug,
        title: existing.title,
        summary: existing.summary ?? '',
        body: (existing.body as NonNullable<UpdateNewsInput['body']> | null) ?? {
          schemaVersion: 1,
          editor: 'tiptap',
          document: {
            type: 'doc',
            content: [],
          },
        },
        seoTitle: existing.seoTitle,
        metaDescription: existing.metaDescription,
        expiresAt: existing.expiresAt?.toISOString() ?? null,
        featured: existing.featured,
        coverMediaId: existing.coverMediaId,
        categoryIds: existing.categories.map(({ categoryId }) => categoryId),
      };

      const latestRevision = await transaction.contentRevision.findFirst({
        where: {
          contentId: newsId,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          version: true,
        },
      });

      /*
       * Las revisiones DRAFT creadas durante el prototipo anterior
       * dejan de estar activas, pero no se eliminan.
       */
      await transaction.contentRevision.updateMany({
        where: {
          contentId: newsId,
          status: {
            in: ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'],
          },
        },
        data: {
          status: 'ARCHIVED',
        },
      });

      historyRevision = await transaction.contentRevision.create({
        data: {
          contentId: newsId,
          version: (latestRevision?.version ?? 0) + 1,
          status: 'SUPERSEDED',
          sourceLockVersion: existing.lockVersion,
          snapshot: toJsonObject(previousSnapshot),
          changeSummary:
            input.changeSummary?.trim() ??
            'Versión anterior guardada automáticamente antes de editar la publicación.',
          createdById: editor.id,
          publishedAt: existing.publishedAt,
        },
        select: {
          id: true,
          version: true,
          status: true,
          snapshot: true,
          changeSummary: true,
          sourceLockVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    /*
     * Tanto el borrador como la publicación se actualizan
     * directamente. En publicaciones, la versión anterior ya quedó
     * protegida dentro del historial.
     */
    const transition = await transaction.contentItem.updateMany({
      where: {
        id: newsId,
        lockVersion: input.lockVersion,
      },
      data: {
        lockVersion: {
          increment: 1,
        },

        ...(input.title !== undefined
          ? {
              title: input.title.trim(),
            }
          : {}),

        ...(updatedSlug !== undefined
          ? {
              slug: updatedSlug,
            }
          : {}),

        ...(input.summary !== undefined
          ? {
              summary: input.summary.trim(),
            }
          : {}),

        ...(input.body !== undefined
          ? {
              body: toJsonObject(input.body),
            }
          : {}),

        ...(input.seoTitle !== undefined
          ? {
              seoTitle: input.seoTitle === null ? null : input.seoTitle.trim(),
            }
          : {}),

        ...(input.metaDescription !== undefined
          ? {
              metaDescription: input.metaDescription === null ? null : input.metaDescription.trim(),
            }
          : {}),

        ...(input.expiresAt !== undefined
          ? {
              expiresAt: input.expiresAt,
            }
          : {}),
      },
    });

    if (transition.count === 0) {
      throw new AppError(
        'La noticia fue modificada durante la actualización.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (input.categoryIds !== undefined) {
      await transaction.contentCategory.deleteMany({
        where: {
          contentId: newsId,
        },
      });

      await transaction.contentCategory.createMany({
        data: input.categoryIds.map((categoryId) => ({
          contentId: newsId,
          categoryId,
        })),
      });
    }

    if (input.coverMediaId !== undefined) {
      await transaction.contentItem.update({
        where: {
          id: newsId,
        },
        data:
          input.coverMediaId === null
            ? {
                coverMedia: {
                  disconnect: true,
                },
              }
            : {
                coverMedia: {
                  connect: {
                    id: input.coverMediaId,
                  },
                },
              },
      });

      await transaction.contentMedia.deleteMany({
        where: {
          contentId: newsId,
          role: 'COVER',
        },
      });

      if (input.coverMediaId !== null) {
        await transaction.contentMedia.create({
          data: {
            contentId: newsId,
            mediaAssetId: input.coverMediaId,
            role: 'COVER',
            position: 0,
          },
        });
      }
    }

    const updated = await transaction.contentItem.findUnique({
      where: {
        id: newsId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        slug: true,
        title: true,
        summary: true,
        body: true,
        seoTitle: true,
        metaDescription: true,
        featured: true,
        lockVersion: true,
        scheduledAt: true,
        publishedAt: true,
        expiresAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,

        createdBy: {
          select: {
            id: true,
            displayName: true,
          },
        },

        assignedEditor: {
          select: {
            id: true,
            displayName: true,
          },
        },

        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
                active: true,
              },
            },
          },
        },

        coverMedia: {
          select: {
            id: true,
            originalFilename: true,
            objectKey: true,
            mimeType: true,
            width: true,
            height: true,
            altText: true,
            caption: true,
            credit: true,
            rightsStatus: true,
            status: true,

            variants: {
              select: {
                kind: true,
                objectKey: true,
                mimeType: true,
                width: true,
                height: true,
              },
              orderBy: {
                kind: 'asc',
              },
            },
          },
        },
      },
    });

    if (!updated) {
      throw new AppError(
        'No fue posible recuperar la noticia actualizada.',
        500,
        'NEWS_UPDATE_FAILED',
      );
    }

    await transaction.auditLog.create({
      data: {
        actorId: editor.id,
        action: existing.status === 'PUBLISHED' ? 'NEWS_PUBLISHED_UPDATED' : 'NEWS_UPDATED',
        entityType: 'ContentItem',
        entityId: newsId,
        reason: input.changeSummary?.trim() ?? null,

        before: {
          slug: existing.slug,
          title: existing.title,
          summary: existing.summary,
          body: existing.body,
          seoTitle: existing.seoTitle,
          metaDescription: existing.metaDescription,
          expiresAt: existing.expiresAt,
          coverMediaId: existing.coverMediaId,

          categoryIds: existing.categories.map(({ categoryId }) => categoryId),

          lockVersion: existing.lockVersion,
        },

        after: {
          slug: updated.slug,
          title: updated.title,
          summary: updated.summary,
          body: updated.body,
          seoTitle: updated.seoTitle,
          metaDescription: updated.metaDescription,
          expiresAt: updated.expiresAt,

          coverMediaId: updated.coverMedia?.id ?? null,

          categoryIds: updated.categories.map(({ category }) => category.id),

          lockVersion: updated.lockVersion,
        },
      },
    });

    return {
      updateMode:
        existing.status === 'PUBLISHED' ? ('PUBLISHED_DIRECT' as const) : ('DIRECT' as const),

      publishedContentUpdated: existing.status === 'PUBLISHED',

      historyRevision,
      ...updated,

      categories: updated.categories.map(({ category }) => category),
    };
  });
}
export async function archiveNews(actor: NewsActor, newsId: string, input: ArchiveNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const editor = actor;

    const accessCondition =
      editor.role === 'ADMIN'
        ? {}
        : {
            OR: [
              {
                createdById: editor.id,
              },
              {
                assignedEditorId: editor.id,
              },
            ],
          };

    const existing = await transaction.contentItem.findFirst({
      where: {
        AND: [
          {
            id: newsId,
          },
          {
            type: 'NEWS',
          },
          accessCondition,
        ],
      },
      select: {
        id: true,
        status: true,
        slug: true,
        title: true,
        lockVersion: true,
        archivedAt: true,
      },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (existing.lockVersion !== input.lockVersion) {
      throw new AppError(
        'La noticia fue modificada por otro usuario. Actualiza la página antes de archivarla.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (existing.status === 'ARCHIVED') {
      throw new AppError('La noticia ya se encuentra archivada.', 409, 'NEWS_ALREADY_ARCHIVED');
    }

    const archivedAt = new Date();

    const transition = await transaction.contentItem.updateMany({
      where: {
        id: newsId,
        lockVersion: input.lockVersion,
      },
      data: {
        status: 'ARCHIVED',
        archivedAt,
        scheduledAt: null,
        featured: false,

        lockVersion: {
          increment: 1,
        },
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        'La noticia fue modificada durante el archivado.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    const archived = await transaction.contentItem.findUnique({
      where: {
        id: newsId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        slug: true,
        title: true,
        summary: true,
        featured: true,
        lockVersion: true,
        scheduledAt: true,
        publishedAt: true,
        expiresAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,

        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!archived) {
      throw new AppError(
        'No fue posible recuperar la noticia archivada.',
        500,
        'NEWS_ARCHIVE_FAILED',
      );
    }

    await transaction.auditLog.create({
      data: {
        actorId: editor.id,
        action: 'NEWS_ARCHIVED',
        entityType: 'ContentItem',
        entityId: newsId,
        reason: input.reason ?? null,

        before: {
          status: existing.status,
          archivedAt: existing.archivedAt?.toISOString() ?? null,
          lockVersion: existing.lockVersion,
        },

        after: {
          status: archived.status,
          archivedAt: archived.archivedAt?.toISOString() ?? null,
          lockVersion: archived.lockVersion,
        },
      },
    });

    return {
      ...archived,

      categories: archived.categories.map(({ category }) => category),
    };
  });
}

export async function restoreNews(actor: NewsActor, newsId: string, input: RestoreNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const editor = actor;

    const accessCondition =
      editor.role === 'ADMIN'
        ? {}
        : {
            OR: [
              {
                createdById: editor.id,
              },
              {
                assignedEditorId: editor.id,
              },
            ],
          };

    const existing = await transaction.contentItem.findFirst({
      where: {
        AND: [
          {
            id: newsId,
          },
          {
            type: 'NEWS',
          },
          accessCondition,
        ],
      },
      select: {
        id: true,
        status: true,
        slug: true,
        title: true,
        lockVersion: true,
        archivedAt: true,
        publishedAt: true,
        expiresAt: true,
      },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (existing.lockVersion !== input.lockVersion) {
      throw new AppError(
        'La noticia fue modificada por otro usuario. Actualiza la página antes de restaurarla.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (existing.status !== 'ARCHIVED') {
      throw new AppError('Solo pueden restaurarse noticias archivadas.', 409, 'NEWS_NOT_ARCHIVED');
    }

    const transition = await transaction.contentItem.updateMany({
      where: {
        id: newsId,
        status: 'ARCHIVED',
        lockVersion: input.lockVersion,
      },
      data: {
        status: 'DRAFT',
        archivedAt: null,
        scheduledAt: null,
        publishedAt: null,
        reviewedById: null,
        approvedById: null,
        featured: false,

        lockVersion: {
          increment: 1,
        },
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        'La noticia fue modificada durante la restauración.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    const restored = await transaction.contentItem.findUnique({
      where: {
        id: newsId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        slug: true,
        title: true,
        summary: true,
        featured: true,
        lockVersion: true,
        scheduledAt: true,
        publishedAt: true,
        expiresAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,

        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!restored) {
      throw new AppError(
        'No fue posible recuperar la noticia restaurada.',
        500,
        'NEWS_RESTORE_FAILED',
      );
    }

    await transaction.auditLog.create({
      data: {
        actorId: editor.id,
        action: 'NEWS_RESTORED',
        entityType: 'ContentItem',
        entityId: newsId,
        reason: input.reason ?? null,

        before: {
          status: existing.status,
          archivedAt: existing.archivedAt?.toISOString() ?? null,
          publishedAt: existing.publishedAt?.toISOString() ?? null,
          lockVersion: existing.lockVersion,
        },

        after: {
          status: restored.status,
          archivedAt: null,
          publishedAt: null,
          lockVersion: restored.lockVersion,
        },
      },
    });

    return {
      ...restored,

      categories: restored.categories.map(({ category }) => category),
    };
  });
}

export async function publishNews(actor: NewsActor, newsId: string, input: PublishNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const accessCondition =
      actor.role === 'ADMIN'
        ? {}
        : {
            OR: [{ createdById: actor.id }, { assignedEditorId: actor.id }],
          };

    const existing = await transaction.contentItem.findFirst({
      where: {
        AND: [{ id: newsId }, { type: 'NEWS' }, accessCondition],
      },
      select: {
        id: true,
        status: true,
        origin: true,
        featured: true,
        lockVersion: true,
        publishedAt: true,
        expiresAt: true,
        archivedAt: true,
        coverMedia: {
          select: {
            id: true,
            status: true,
            archivedAt: true,
            rightsStatus: true,
          },
        },
        categories: {
          select: {
            category: {
              select: {
                active: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (input.lockVersion !== undefined && existing.lockVersion !== input.lockVersion) {
      throw new AppError(
        'La noticia fue modificada por otro usuario. Actualiza la página antes de publicarla.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (existing.archivedAt || existing.status === 'ARCHIVED') {
      throw new AppError('La noticia está archivada.', 409, 'NEWS_ARCHIVED_READ_ONLY');
    }

    if (existing.status !== 'DRAFT') {
      throw new AppError(
        'Solo pueden publicarse noticias en estado borrador.',
        409,
        'NEWS_NOT_DRAFT',
      );
    }

    if (existing.expiresAt && existing.expiresAt <= new Date()) {
      throw new AppError(
        'La fecha de caducidad ya terminó. Actualízala antes de publicar.',
        422,
        'NEWS_EXPIRATION_IN_PAST',
      );
    }

    if (existing.origin === 'INTERNAL') {
      const hasActiveCategory = existing.categories.some(({ category }) => category.active);

      if (!hasActiveCategory) {
        throw new AppError(
          'La noticia interna debe tener al menos una categoría activa antes de publicarse.',
          422,
          'NEWS_PUBLISH_CATEGORY_REQUIRED',
        );
      }

      const coverMedia = existing.coverMedia;

      if (
        !coverMedia ||
        coverMedia.status !== 'READY' ||
        coverMedia.archivedAt !== null ||
        coverMedia.rightsStatus === 'RESTRICTED'
      ) {
        throw new AppError(
          'La noticia interna debe tener una imagen de portada lista y habilitada antes de publicarse.',
          422,
          'NEWS_PUBLISH_COVER_REQUIRED',
        );
      }
    }

    const featured = input.featured ?? existing.featured;

    if (featured) {
      await transaction.contentItem.updateMany({
        where: { type: 'NEWS', featured: true, id: { not: newsId }, archivedAt: null },
        data: { featured: false },
      });
    }

    const publishedAt = new Date();
    const transition = await transaction.contentItem.updateMany({
      where: {
        id: newsId,
        status: 'DRAFT',
        lockVersion: existing.lockVersion,
      },
      data: {
        status: 'PUBLISHED',
        publishedAt,
        scheduledAt: null,
        archivedAt: null,
        featured,
        lockVersion: { increment: 1 },
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        'La noticia fue modificada durante la publicación.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    const news = await transaction.contentItem.findUniqueOrThrow({
      where: { id: newsId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        publishedAt: true,
        expiresAt: true,
        lockVersion: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'NEWS_PUBLISHED',
        entityType: 'ContentItem',
        entityId: news.id,
        before: {
          status: existing.status,
          featured: existing.featured,
          publishedAt: existing.publishedAt?.toISOString() ?? null,
          lockVersion: existing.lockVersion,
        },
        after: {
          status: news.status,
          featured: news.featured,
          publishedAt: news.publishedAt?.toISOString() ?? null,
          lockVersion: news.lockVersion,
        },
      },
    });

    return {
      ...news,
      publishedAt: news.publishedAt?.toISOString() ?? null,
      expiresAt: news.expiresAt?.toISOString() ?? null,
    };
  });
}

export async function unpublishNews(actor: NewsActor, newsId: string, input: UnpublishNewsInput) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const accessCondition =
      actor.role === 'ADMIN'
        ? {}
        : {
            OR: [{ createdById: actor.id }, { assignedEditorId: actor.id }],
          };

    const existing = await transaction.contentItem.findFirst({
      where: {
        AND: [{ id: newsId }, { type: 'NEWS' }, accessCondition],
      },
      select: {
        id: true,
        status: true,
        featured: true,
        lockVersion: true,
        publishedAt: true,
      },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (existing.lockVersion !== input.lockVersion) {
      throw new AppError(
        'La noticia fue modificada por otro usuario. Actualiza la página antes de despublicarla.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    if (existing.status !== 'PUBLISHED') {
      throw new AppError(
        'Solo pueden despublicarse noticias publicadas.',
        409,
        'NEWS_NOT_PUBLISHED',
      );
    }

    const transition = await transaction.contentItem.updateMany({
      where: {
        id: newsId,
        status: 'PUBLISHED',
        lockVersion: input.lockVersion,
      },
      data: {
        status: 'DRAFT',
        featured: false,
        publishedAt: null,
        scheduledAt: null,
        lockVersion: { increment: 1 },
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        'La noticia fue modificada durante la despublicación.',
        409,
        'NEWS_VERSION_CONFLICT',
      );
    }

    const news = await transaction.contentItem.findUniqueOrThrow({
      where: { id: newsId },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        publishedAt: true,
        expiresAt: true,
        lockVersion: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'NEWS_UNPUBLISHED',
        entityType: 'ContentItem',
        entityId: news.id,
        before: {
          status: existing.status,
          featured: existing.featured,
          publishedAt: existing.publishedAt?.toISOString() ?? null,
          lockVersion: existing.lockVersion,
        },
        after: {
          status: news.status,
          featured: news.featured,
          publishedAt: null,
          lockVersion: news.lockVersion,
        },
      },
    });

    return {
      ...news,
      publishedAt: null,
      expiresAt: news.expiresAt?.toISOString() ?? null,
    };
  });
}

export async function setNewsFeatured(
  actor: NewsActor,
  newsId: string,
  input: SetNewsFeaturedInput,
) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const accessCondition =
      actor.role === 'ADMIN'
        ? {}
        : {
            OR: [{ createdById: actor.id }, { assignedEditorId: actor.id }],
          };
    const existing = await transaction.contentItem.findFirst({
      where: { AND: [{ id: newsId }, { type: 'NEWS' }, accessCondition] },
      select: { id: true, status: true, featured: true, archivedAt: true },
    });

    if (!existing) {
      throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
    }

    if (input.featured && existing.status !== 'PUBLISHED') {
      throw new AppError(
        'Solo una noticia publicada puede marcarse como destacada.',
        409,
        'NEWS_FEATURED_REQUIRES_PUBLISHED',
      );
    }

    if (input.featured) {
      await transaction.contentItem.updateMany({
        where: { type: 'NEWS', featured: true, id: { not: newsId }, archivedAt: null },
        data: { featured: false },
      });
    }

    const news = await transaction.contentItem.update({
      where: { id: newsId },
      data: {
        featured: input.featured,
        lockVersion: { increment: 1 },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        lockVersion: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: input.featured ? 'NEWS_FEATURED' : 'NEWS_UNFEATURED',
        entityType: 'ContentItem',
        entityId: news.id,
        before: existing,
        after: news,
      },
    });

    return news;
  });
}

export async function listNewsRevisions(actor: NewsActor, newsId: string) {
  const prisma = getPrismaClient();

  const editor = actor;

  const accessCondition =
    editor.role === 'ADMIN'
      ? {}
      : {
          OR: [
            {
              createdById: editor.id,
            },
            {
              assignedEditorId: editor.id,
            },
          ],
        };

  const content = await prisma.contentItem.findFirst({
    where: {
      AND: [
        {
          id: newsId,
        },
        {
          type: 'NEWS',
        },
        accessCondition,
      ],
    },
    select: {
      id: true,
      status: true,
      lockVersion: true,
      title: true,
    },
  });

  if (!content) {
    throw new AppError('No se encontró la noticia solicitada.', 404, 'NEWS_NOT_FOUND');
  }

  const revisions = await prisma.contentRevision.findMany({
    where: {
      contentId: newsId,
    },
    orderBy: {
      version: 'desc',
    },
    select: {
      id: true,
      version: true,
      status: true,
      sourceLockVersion: true,
      snapshot: true,
      changeSummary: true,
      publishedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,

      createdBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      reviewedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      approvedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },

      publishedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  return {
    contentId: content.id,
    title: content.title,
    publicStatus: content.status,
    publicLockVersion: content.lockVersion,
    items: revisions,
  };
}
