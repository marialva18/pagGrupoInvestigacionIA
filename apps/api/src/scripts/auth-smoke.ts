import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedUser } from '@intgarti/contracts';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

loadEnv({
  path: resolve(currentDirectory, '../../../../.env'),
});

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`La variable ${name} no está configurada.`);
  }

  return value;
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');

  return contentType?.includes('application/json') ? response.json() : response.text();
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnvironmentValue('SUPABASE_URL');

  const publishableKey =
    process.env.SUPABASE_ANON_KEY?.trim() || process.env.PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!publishableKey) {
    throw new Error('SUPABASE_ANON_KEY no está configurada.');
  }

  const email = requireEnvironmentValue('CMS_AUTH_TEST_EMAIL');

  const password = requireEnvironmentValue('CMS_AUTH_TEST_PASSWORD');

  const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(
    /\/+$/,
    '',
  );

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Falló el login en Supabase: ${error?.message ?? 'sesión no disponible'}`);
  }

  const headers = {
    Authorization: `Bearer ${data.session.access_token}`,
  };

  const sessionResponse = await fetch(`${apiBaseUrl}/auth/session`, { headers });

  const sessionBody = await readBody(sessionResponse);

  if (!sessionResponse.ok) {
    throw new Error(
      `GET /auth/session devolvió ${sessionResponse.status}: ${JSON.stringify(sessionBody)}`,
    );
  }

  const user = (
    sessionBody as {
      data: {
        user: AuthenticatedUser;
      };
    }
  ).data.user;

  const newsResponse = await fetch(`${apiBaseUrl}/editor/news?page=1&pageSize=1`, { headers });

  const newsBody = await readBody(newsResponse);

  if (!newsResponse.ok) {
    throw new Error(
      `GET /editor/news devolvió ${newsResponse.status}: ${JSON.stringify(newsBody)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        result: 'AUTH_SMOKE_OK',
        sessionStatus: sessionResponse.status,
        editorNewsStatus: newsResponse.status,
        user,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);

  process.exit(1);
});
