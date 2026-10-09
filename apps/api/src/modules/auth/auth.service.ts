import type { AuthenticatedUser } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { authProviderError } from './auth-provider-error.js';
import type {
  AuthenticateAccessToken,
  VerifiedSupabaseIdentity,
  VerifySupabaseAccessToken,
} from './auth.types.js';

let supabaseAuthClient: SupabaseClient | undefined;

function getSupabaseAuthClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new AppError(
      'La autenticación de Supabase no está configurada.',
      503,
      'AUTH_NOT_CONFIGURED',
    );
  }

  supabaseAuthClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });

  return supabaseAuthClient;
}

export const verifySupabaseAccessToken: VerifySupabaseAccessToken = async (
  accessToken: string,
): Promise<VerifiedSupabaseIdentity> => {
  const supabase = getSupabaseAuthClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    if (error) throw authProviderError(error);
    throw new AppError(
      'El token de autenticación no es válido o ha expirado.',
      401,
      'AUTH_INVALID_TOKEN',
    );
  }

  if (!user.email) {
    throw new AppError(
      'La identidad autenticada no tiene un correo asociado.',
      401,
      'AUTH_EMAIL_NOT_AVAILABLE',
    );
  }

  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    emailConfirmed: !!user.email_confirmed_at,
  };
};

function mapAuthenticatedUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'EDITOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastLoginAt: Date | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  const supabase = getSupabaseAuthClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: env.AUTH_PASSWORD_RESET_REDIRECT_URL,
  });

  if (error) {
    throw new AppError(
      'No fue posible procesar la recuperación de contraseña.',
      502,
      'AUTH_PASSWORD_RECOVERY_FAILED',
    );
  }
}

export async function requestInvitationRecovery(email: string): Promise<void> {
  const { error } = await getSupabaseAuthClient().auth.resetPasswordForEmail(email, {
    redirectTo: env.AUTH_INVITE_REDIRECT_URL,
  });
  if (error)
    throw new AppError(
      'No fue posible enviar el enlace de activación.',
      502,
      'ADMIN_USER_INVITATION_RESEND_FAILED',
    );
}

export function createActivateInvitation(
  verifyIdentity: VerifySupabaseAccessToken = verifySupabaseAccessToken,
  getPrisma: typeof getPrismaClient = getPrismaClient,
) {
  return async (accessToken: string): Promise<AuthenticatedUser> => {
    const identity = await verifyIdentity(accessToken);
    if (!identity.emailConfirmed)
      throw new AppError(
        'Confirma tu correo antes de activar el acceso.',
        403,
        'AUTH_EMAIL_NOT_CONFIRMED',
      );
    const prisma = getPrisma();

    return prisma.$transaction(async (transaction) => {
      const candidates = await transaction.user.findMany({
        where: {
          OR: [
            {
              authProviderId: identity.id,
            },
            {
              email: {
                equals: identity.email,
                mode: 'insensitive',
              },
            },
          ],
        },
        take: 2,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          authProviderId: true,
          lastLoginAt: true,
        },
      });
      if (candidates.length > 1)
        throw new AppError(
          'La identidad requiere revisión administrativa.',
          403,
          'AUTH_IDENTITY_CONFLICT',
        );
      const localUser = candidates[0];

      if (!localUser) {
        throw new AppError(
          'La invitación no corresponde a un usuario habilitado.',
          403,
          'AUTH_INVITATION_NOT_PROVISIONED',
        );
      }

      if (
        (localUser.authProviderId && localUser.authProviderId !== identity.id) ||
        localUser.email.toLowerCase() !== identity.email.toLowerCase()
      ) {
        throw new AppError(
          'La identidad de la invitación no coincide con el usuario local.',
          403,
          'AUTH_IDENTITY_CONFLICT',
        );
      }

      if (localUser.status === 'SUSPENDED' || localUser.status === 'DISABLED') {
        throw new AppError(
          'El usuario no puede activar esta invitación.',
          403,
          'AUTH_USER_INACTIVE',
        );
      }

      if (localUser.status === 'ACTIVE') return mapAuthenticatedUser(localUser);

      // Conditional write prevents a concurrent suspension from being overwritten.
      const claimed = await transaction.user.updateMany({
        where: {
          id: localUser.id,
          status: 'INVITED',
          authProviderId: localUser.authProviderId,
          email: { equals: identity.email, mode: 'insensitive' },
        },
        data: {
          status: 'ACTIVE',
          authProviderId: identity.id,
          lastLoginAt: new Date(),
        },
      });
      if (claimed.count !== 1)
        throw new AppError(
          'El estado del usuario cambió. Solicita revisión administrativa.',
          409,
          'AUTH_ACTIVATION_STATE_CHANGED',
        );
      const activatedUser = await transaction.user.findUniqueOrThrow({
        where: { id: localUser.id },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          lastLoginAt: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: activatedUser.id,
          action: 'USER_INVITATION_ACCEPTED',
          entityType: 'User',
          entityId: activatedUser.id,
          before: { status: localUser.status },
          after: {
            email: activatedUser.email,
            role: activatedUser.role,
            status: activatedUser.status,
          },
        },
      });

      return mapAuthenticatedUser(activatedUser);
    });
  };
}

export const activateInvitation = createActivateInvitation();

export function createAuthenticateAccessToken(
  verifyIdentity: VerifySupabaseAccessToken = verifySupabaseAccessToken,
): AuthenticateAccessToken {
  return async (accessToken: string): Promise<AuthenticatedUser> => {
    const identity = await verifyIdentity(accessToken);
    const prisma = getPrismaClient();

    const localUser = await prisma.user.findFirst({
      where: {
        OR: [
          {
            authProviderId: identity.id,
          },
          {
            email: {
              equals: identity.email,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        authProviderId: true,
        lastLoginAt: true,
      },
    });

    if (!localUser) {
      throw new AppError(
        'El usuario autenticado no está habilitado en el CMS.',
        403,
        'AUTH_USER_NOT_PROVISIONED',
      );
    }

    if (localUser.authProviderId && localUser.authProviderId !== identity.id) {
      throw new AppError(
        'La identidad autenticada no coincide con el usuario local.',
        403,
        'AUTH_IDENTITY_CONFLICT',
      );
    }

    if (localUser.status !== 'ACTIVE') {
      throw new AppError('El usuario no se encuentra activo.', 403, 'AUTH_USER_INACTIVE');
    }

    const authenticatedUser = await prisma.user.update({
      where: {
        id: localUser.id,
      },
      data: {
        authProviderId: localUser.authProviderId ?? identity.id,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        lastLoginAt: true,
      },
    });

    return mapAuthenticatedUser(authenticatedUser);
  };
}

export const authenticateAccessToken = createAuthenticateAccessToken();
