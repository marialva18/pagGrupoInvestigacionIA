import { getPrismaClient } from '@intgarti/database';

export interface ArchiveExpiredContentResult {
  checkedAt: string;
  archived: number;
  ids: string[];
}

export async function archiveExpiredContent(
  now = new Date(),
): Promise<ArchiveExpiredContentResult> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const expiredItems = await transaction.contentItem.findMany({
      where: {
        status: 'PUBLISHED',
        archivedAt: null,
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        title: true,
        expiresAt: true,
        lockVersion: true,
      },
      take: 200,
      orderBy: {
        expiresAt: 'asc',
      },
    });

    const archivedIds: string[] = [];

    for (const item of expiredItems) {
      const archivedAt = new Date();

      const updated = await transaction.contentItem.updateMany({
        where: {
          id: item.id,
          status: 'PUBLISHED',
          archivedAt: null,
          expiresAt: {
            lte: now,
          },
        },
        data: {
          status: 'ARCHIVED',
          featured: false,
          archivedAt,
          lockVersion: {
            increment: 1,
          },
        },
      });

      if (updated.count === 0) continue;

      archivedIds.push(item.id);

      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: 'NEWS_EXPIRED_AND_ARCHIVED',
          entityType: 'ContentItem',
          entityId: item.id,
          reason: 'La publicación alcanzó su fecha de caducidad configurada.',
          before: {
            status: 'PUBLISHED',
            expiresAt: item.expiresAt?.toISOString() ?? null,
            lockVersion: item.lockVersion,
          },
          after: {
            status: 'ARCHIVED',
            archivedAt: archivedAt.toISOString(),
            lockVersion: item.lockVersion + 1,
          },
          metadata: {
            source: 'worker',
            title: item.title,
          },
        },
      });
    }

    return {
      checkedAt: now.toISOString(),
      archived: archivedIds.length,
      ids: archivedIds,
    };
  });
}
