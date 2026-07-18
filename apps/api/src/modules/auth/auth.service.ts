import type { AuthenticatedUser } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
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
