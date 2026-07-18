import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

loadEnv({
  path: resolve(currentDirectory, '../../../../.env'),
});

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function requireArgument(name: string): string {
  const value = getArgument(name)?.trim();

  if (!value) {
    throw new Error(`Falta el argumento obligatorio ${name}.`);
  }

  return value;
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const pageSize = 100;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(`No fue posible consultar los usuarios de Supabase: ${error.message}`);
    }

    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);

    if (user) {
      return user;
    }

    if (data.users.length < pageSize) {
      return null;
    }
  }

  throw new Error('Se alcanzó el límite de páginas de usuarios.');
}

async function main(): Promise<void> {
  const email = requireArgument('--email').trim().toLowerCase();

  const displayName = requireArgument('--display-name').trim();

  const role = requireArgument('--role').trim().toUpperCase();

  const databaseTarget = (getArgument('--database') ?? 'local').trim().toLowerCase();

  if (role !== 'ADMIN' && role !== 'EDITOR') {
    throw new Error('El rol debe ser ADMIN o EDITOR.');
  }

  const password = process.env.CMS_USER_PASSWORD?.trim();

  if (!password || password.length < 12) {
    throw new Error('CMS_USER_PASSWORD debe tener al menos 12 caracteres.');
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();

  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL no está configurada en .env.');
  }

  if (!supabaseSecretKey) {
    throw new Error('SUPABASE_SECRET_KEY no está configurada en .env.');
  }

  if (databaseTarget === 'local') {
    process.env.DATABASE_URL =
      'postgresql://intgarti:intgarti_dev@localhost:55432/intgarti?schema=public';

    process.env.DIRECT_URL = process.env.DATABASE_URL;
  } else if (databaseTarget === 'configured') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está configurada.');
    }
  } else {
    throw new Error('--database debe ser local o configured.');
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  let authUser = await findUserByEmail(supabase, email);

  const authUserAlreadyExisted = Boolean(authUser);

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    });

    if (error || !data.user) {
      throw new Error(
        `No fue posible crear el usuario en Supabase: ${error?.message ?? 'respuesta sin usuario'}`,
      );
    }

    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...authUser.user_metadata,
        display_name: displayName,
      },
    });

    if (error || !data.user) {
      throw new Error(
        `No fue posible actualizar el usuario en Supabase: ${
          error?.message ?? 'respuesta sin usuario'
        }`,
      );
    }

    authUser = data.user;
  }

  const { getPrismaClient } = await import('@intgarti/database');

  const prisma = getPrismaClient();

  try {
    const identityConflict = await prisma.user.findFirst({
      where: {
        authProviderId: authUser.id,
        email: {
          not: email,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (identityConflict) {
      throw new Error(
        `La identidad de Supabase ya pertenece al usuario ${identityConflict.email}.`,
      );
    }

    const localUser = await prisma.user.upsert({
      where: {
        email,
      },
      update: {
        displayName,
        role,
        status: 'ACTIVE',
        authProviderId: authUser.id,
      },
      create: {
        email,
        displayName,
        role,
        status: 'ACTIVE',
        authProviderId: authUser.id,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        authProviderId: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          result: 'CMS_USER_PROVISIONED',
          databaseTarget,
          authUserAlreadyExisted,
          authUserId: authUser.id,
          localUser,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);

  process.exit(1);
});
