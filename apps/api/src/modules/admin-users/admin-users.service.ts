import type { AuthenticatedUser, CmsUser } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import type {
  InviteUserInput,
  ListUsersInput,
  UpdateUserInput,
} from './admin-users.schema.js';

type AdminActor = Pick<AuthenticatedUser, 'id'>;

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

let supabaseAdminClient: SupabaseClient | undefined;

function getSupabaseAdminClient(): SupabaseClient {
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env.SUPABASE_URL || !secretKey) {
    throw new AppError(
      'La administración de usuarios de Supabase no está configurada.',
      503,
      'AUTH_ADMIN_NOT_CONFIGURED',
    );
  }

  supabaseAdminClient ??= createClient(env.SUPABASE_URL, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAdminClient;
}

function mapCmsUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'EDITOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CmsUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function listUsers(input: ListUsersInput) {
  const prisma = getPrismaClient();

  const where = {
    ...(input.role
      ? {
          role: input.role,
        }
      : {}),
    ...(input.status
      ? {
          status: input.status,
        }
      : {}),
    ...(input.q
      ? {
          OR: [
            {
              email: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
            {
              displayName: {
                contains: input.q,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.pageSize;

  const [total, users] = await prisma.$transaction([
    prisma.user.count({
      where,
    }),
    prisma.user.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: [
        {
          role: 'asc',
        },
        {
          displayName: 'asc',
        },
      ],
      select: userSelect,
    }),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: users.map(mapCmsUser),
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

export async function inviteUser(
  actor: AdminActor,
  input: InviteUserInput,
): Promise<CmsUser> {
  const prisma = getPrismaClient();

  const existing = await prisma.user.findUnique({
    where: {
      email: input.email,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing) {
    throw new AppError(
      'Ya existe un usuario registrado con ese correo.',
      409,
      'ADMIN_USER_EMAIL_ALREADY_EXISTS',
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(input.email, {
    data: {
      display_name: input.displayName,
      role: input.role,
    },
    redirectTo: env.AUTH_INVITE_REDIRECT_URL,
  });

  if (error || !data.user) {
    throw new AppError(
      'No fue posible enviar la invitación al usuario.',
      502,
      'ADMIN_USER_INVITATION_FAILED',
      {
        providerMessage: error?.message,
      },
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          status: 'INVITED',
          authProviderId: data.user.id,
        },
        select: userSelect,
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'USER_INVITED',
          entityType: 'User',
          entityId: user.id,
          after: {
            email: user.email,
            role: user.role,
            status: user.status,
          },
        },
      });

      return mapCmsUser(user);
    });
  } catch (error: unknown) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw error;
  }
}

export async function resendInvitation(actor: AdminActor, userId: string): Promise<CmsUser> {
  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: userSelect,
  });

  if (!user) {
    throw new AppError('No se encontró el usuario solicitado.', 404, 'ADMIN_USER_NOT_FOUND');
  }

  if (user.status !== 'INVITED') {
    throw new AppError(
      'Solo se puede reenviar una invitación a usuarios pendientes.',
      409,
      'ADMIN_USER_NOT_INVITED',
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(user.email, {
    data: {
      display_name: user.displayName,
      role: user.role,
    },
    redirectTo: env.AUTH_INVITE_REDIRECT_URL,
  });

  if (error || !data.user) {
    throw new AppError(
      'No fue posible reenviar la invitación.',
      502,
      'ADMIN_USER_INVITATION_RESEND_FAILED',
      {
        providerMessage: error?.message,
      },
    );
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      authProviderId: data.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'USER_INVITATION_RESENT',
      entityType: 'User',
      entityId: user.id,
      after: {
        email: user.email,
        status: user.status,
      },
    },
  });

  return mapCmsUser(user);
}

export async function updateUser(
  actor: AdminActor,
  userId: string,
  input: UpdateUserInput,
): Promise<CmsUser> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({
      where: {
        id: userId,
      },
      select: userSelect,
    });

    if (!existing) {
      throw new AppError('No se encontró el usuario solicitado.', 404, 'ADMIN_USER_NOT_FOUND');
    }

    if (actor.id === userId && input.role && input.role !== 'ADMIN') {
      throw new AppError(
        'Un administrador no puede quitarse su propio rol.',
        422,
        'ADMIN_USER_SELF_ROLE_CHANGE_FORBIDDEN',
      );
    }

    if (actor.id === userId && input.status && input.status !== 'ACTIVE') {
      throw new AppError(
        'Un administrador no puede desactivar su propia cuenta.',
        422,
        'ADMIN_USER_SELF_STATUS_CHANGE_FORBIDDEN',
      );
    }

    const removesActiveAdmin =
      existing.role === 'ADMIN' &&
      existing.status === 'ACTIVE' &&
      ((input.role !== undefined && input.role !== 'ADMIN') ||
        (input.status !== undefined && input.status !== 'ACTIVE'));

    if (removesActiveAdmin) {
      const otherActiveAdmins = await transaction.user.count({
        where: {
          id: {
            not: userId,
          },
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      if (otherActiveAdmins === 0) {
        throw new AppError(
          'Debe permanecer al menos un administrador activo.',
          422,
          'ADMIN_USER_LAST_ADMIN_REQUIRED',
        );
      }
    }

    const updated = await transaction.user.update({
      where: {
        id: userId,
      },
      data: {
        ...(input.displayName !== undefined
          ? {
              displayName: input.displayName,
            }
          : {}),
        ...(input.role !== undefined
          ? {
              role: input.role,
            }
          : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
            }
          : {}),
      },
      select: userSelect,
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: updated.id,
        before: {
          displayName: existing.displayName,
          role: existing.role,
          status: existing.status,
        },
        after: {
          displayName: updated.displayName,
          role: updated.role,
          status: updated.status,
        },
      },
    });

    return mapCmsUser(updated);
  });
}
