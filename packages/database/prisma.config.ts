import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const monorepoEnvPath = resolve(packageRoot, '../..', '.env');

config({ path: monorepoEnvPath, quiet: true });

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const command = process.argv.join(' ');
const requiresDatabaseUrl = /\bmigrate\b|\bdb\s+pull\b|\bdb\s+push\b|\bdb\s+seed\b/.test(command);

if (requiresDatabaseUrl && !databaseUrl) {
  const envPathMessage = existsSync(monorepoEnvPath)
    ? monorepoEnvPath
    : `${monorepoEnvPath} (archivo no encontrado)`;

  throw new Error(
    `Prisma requires DIRECT_URL or DATABASE_URL. Expected to load them from ${envPathMessage}; DIRECT_URL has priority over DATABASE_URL.`,
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl
    ? {
        datasource: {
          url: databaseUrl,
        },
      }
    : {}),
});
