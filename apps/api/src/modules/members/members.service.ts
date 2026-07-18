import type { AuthenticatedUser, EditorMember, PublicMember } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { AppError } from '../../common/errors/app-error.js';
import { mapMediaReference, mediaReferenceSelect } from '../media/media-reference.js';
import type { CreateMemberInput, ListMembersInput, UpdateMemberInput } from './members.schema.js';

type MemberActor = Pick<AuthenticatedUser, 'id'>;

interface MemberRecord {
  id: string;
  fullName: string;
  roleTitle: string;
  biography: string | null;
  email: string | null;
  linkedinUrl: string | null;
  orcidUrl: string | null;
  isCoordinator: boolean;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;

  photoMedia: Parameters<typeof mapMediaReference>[0];
}

const memberSelect = {
  id: true,
  fullName: true,
  roleTitle: true,
  biography: true,
  email: true,
  linkedinUrl: true,
  orcidUrl: true,
  isCoordinator: true,
  displayOrder: true,
  active: true,
  createdAt: true,
  updatedAt: true,

  photoMedia: {
    select: mediaReferenceSelect,
  },
} as const;

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function mapEditorMember(member: MemberRecord): EditorMember {
  return {
    id: member.id,
    fullName: member.fullName,
    roleTitle: member.roleTitle,
    biography: member.biography,
    email: member.email,
    linkedinUrl: member.linkedinUrl,
    orcidUrl: member.orcidUrl,
    isCoordinator: member.isCoordinator,
    displayOrder: member.displayOrder,
    active: member.active,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    photoMedia: mapMediaReference(member.photoMedia),
  };
}

function mapPublicMember(member: MemberRecord): PublicMember {
  return {
    id: member.id,
    fullName: member.fullName,
    roleTitle: member.roleTitle,
    biography: member.biography,
    email: member.email,
    linkedinUrl: member.linkedinUrl,
    orcidUrl: member.orcidUrl,
    isCoordinator: member.isCoordinator,
    displayOrder: member.displayOrder,
    photoMedia: mapMediaReference(member.photoMedia),
  };
}

async function validateMemberPhoto(photoMediaId: string | null | undefined): Promise<void> {
  if (photoMediaId === undefined || photoMediaId === null) {
    return;
  }

  const prisma = getPrismaClient();

  const media = await prisma.mediaAsset.findFirst({
    where: {
      id: photoMediaId,
      status: 'READY',
      archivedAt: null,

      rightsStatus: {
        not: 'RESTRICTED',
      },

      mimeType: {
        in: ['image/jpeg', 'image/png', 'image/webp'],
      },
    },

    select: {
      width: true,
      height: true,
    },
  });

  if (!media) {
    throw new AppError(
      'La fotografía no existe, no está lista o está restringida.',
      422,
      'MEMBER_PHOTO_INVALID',
    );
  }

  if (media.width === null || media.height === null) {
    throw new AppError(
      'No se pudieron determinar las dimensiones de la fotografía.',
      422,
      'MEMBER_PHOTO_DIMENSIONS_UNKNOWN',
    );
  }

  const shortestSide = Math.min(media.width, media.height);
  const longestSide = Math.max(media.width, media.height);

  if (shortestSide < 240 || longestSide < 320) {
    throw new AppError(
      'La fotografía tiene una resolución demasiado baja. El lado menor debe tener al menos 240 píxeles y el lado mayor 320 píxeles.',
      422,
      'MEMBER_PHOTO_TOO_SMALL',
    );
  }
}

export async function listMembers(input: ListMembersInput) {
  const prisma = getPrismaClient();

  const where = {
    ...(input.active !== undefined
      ? {
          active: input.active,
        }
      : {}),

    ...(input.q
      ? {
          OR: [
            {
              fullName: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
            {
              roleTitle: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.pageSize;

  const [total, members] = await prisma.$transaction([
    prisma.member.count({
      where,
    }),

    prisma.member.findMany({
      where,
      skip,
      take: input.pageSize,

      orderBy: [
        {
          active: 'desc',
        },
        {
          isCoordinator: 'desc',
        },
        {
          displayOrder: 'asc',
        },
        {
          fullName: 'asc',
        },
      ],

      select: memberSelect,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: members.map(mapEditorMember),

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

export async function getMemberById(memberId: string): Promise<EditorMember> {
  const prisma = getPrismaClient();

  const member = await prisma.member.findUnique({
    where: {
      id: memberId,
    },

    select: memberSelect,
  });

  if (!member) {
    throw new AppError('No se encontró el miembro solicitado.', 404, 'MEMBER_NOT_FOUND');
  }

  return mapEditorMember(member);
}

export async function createMember(
  actor: MemberActor,
  input: CreateMemberInput,
): Promise<EditorMember> {
  await validateMemberPhoto(input.photoMediaId);

  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const member = await transaction.member.create({
      data: {
        fullName: input.fullName.trim(),
        roleTitle: input.roleTitle.trim(),

        biography: input.biography === undefined ? null : normalizeNullableText(input.biography),

        email: input.email === undefined ? null : normalizeNullableText(input.email),

        linkedinUrl:
          input.linkedinUrl === undefined ? null : normalizeNullableText(input.linkedinUrl),

        orcidUrl: input.orcidUrl === undefined ? null : normalizeNullableText(input.orcidUrl),

        photoMediaId: input.photoMediaId ?? null,

        isCoordinator: input.isCoordinator ?? false,

        displayOrder: input.displayOrder ?? 0,

        active: input.active ?? true,
      },

      select: memberSelect,
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MEMBER_CREATED',
        entityType: 'Member',
        entityId: member.id,

        after: {
          id: member.id,
          fullName: member.fullName,
          roleTitle: member.roleTitle,
          photoMediaId: input.photoMediaId ?? null,
          isCoordinator: member.isCoordinator,
          active: member.active,
        },
      },
    });

    return mapEditorMember(member);
  });
}

export async function updateMember(
  actor: MemberActor,
  memberId: string,
  input: UpdateMemberInput,
): Promise<EditorMember> {
  await validateMemberPhoto(input.photoMediaId);

  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.member.findUnique({
      where: {
        id: memberId,
      },

      select: {
        id: true,
        fullName: true,
        roleTitle: true,
        active: true,
        photoMediaId: true,
      },
    });

    if (!existing) {
      throw new AppError('No se encontró el miembro solicitado.', 404, 'MEMBER_NOT_FOUND');
    }

    const member = await transaction.member.update({
      where: {
        id: memberId,
      },

      data: {
        ...(input.fullName !== undefined
          ? {
              fullName: input.fullName.trim(),
            }
          : {}),

        ...(input.roleTitle !== undefined
          ? {
              roleTitle: input.roleTitle.trim(),
            }
          : {}),

        ...(input.biography !== undefined
          ? {
              biography: normalizeNullableText(input.biography),
            }
          : {}),

        ...(input.email !== undefined
          ? {
              email: normalizeNullableText(input.email),
            }
          : {}),

        ...(input.linkedinUrl !== undefined
          ? {
              linkedinUrl: normalizeNullableText(input.linkedinUrl),
            }
          : {}),

        ...(input.orcidUrl !== undefined
          ? {
              orcidUrl: normalizeNullableText(input.orcidUrl),
            }
          : {}),

        ...(input.photoMediaId !== undefined
          ? {
              photoMedia:
                input.photoMediaId === null
                  ? {
                      disconnect: true,
                    }
                  : {
                      connect: {
                        id: input.photoMediaId,
                      },
                    },
            }
          : {}),

        ...(input.isCoordinator !== undefined
          ? {
              isCoordinator: input.isCoordinator,
            }
          : {}),

        ...(input.displayOrder !== undefined
          ? {
              displayOrder: input.displayOrder,
            }
          : {}),

        ...(input.active !== undefined
          ? {
              active: input.active,
            }
          : {}),
      },

      select: memberSelect,
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MEMBER_UPDATED',
        entityType: 'Member',
        entityId: member.id,

        before: {
          fullName: existing.fullName,
          roleTitle: existing.roleTitle,
          active: existing.active,
          photoMediaId: existing.photoMediaId,
        },

        after: {
          fullName: member.fullName,
          roleTitle: member.roleTitle,
          active: member.active,
          photoMediaId:
            input.photoMediaId !== undefined ? input.photoMediaId : existing.photoMediaId,
        },
      },
    });

    return mapEditorMember(member);
  });
}

export async function deactivateMember(
  actor: MemberActor,
  memberId: string,
): Promise<EditorMember> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.member.findUnique({
      where: {
        id: memberId,
      },

      select: {
        id: true,
        active: true,
      },
    });

    if (!existing) {
      throw new AppError('No se encontró el miembro solicitado.', 404, 'MEMBER_NOT_FOUND');
    }

    const member = await transaction.member.update({
      where: {
        id: memberId,
      },

      data: {
        active: false,
      },

      select: memberSelect,
    });

    if (existing.active) {
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'MEMBER_DEACTIVATED',
          entityType: 'Member',
          entityId: member.id,

          before: {
            active: true,
          },

          after: {
            active: false,
          },
        },
      });
    }

    return mapEditorMember(member);
  });
}

export async function listPublicMembers(): Promise<PublicMember[]> {
  const prisma = getPrismaClient();

  const members = await prisma.member.findMany({
    where: {
      active: true,
    },

    orderBy: [
      {
        isCoordinator: 'desc',
      },
      {
        displayOrder: 'asc',
      },
      {
        fullName: 'asc',
      },
    ],

    select: memberSelect,
  });

  return members.map(mapPublicMember);
}
