import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const rootEnvDirectory = fileURLToPath(new URL('../../', import.meta.url));

function readRootEnv() {
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url));

  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');

        return [key, value];
      }),
  );
}

const rootEnv = readRootEnv();

process.env.PUBLIC_SUPABASE_URL ??= rootEnv.PUBLIC_SUPABASE_URL || rootEnv.SUPABASE_URL;
process.env.PUBLIC_SUPABASE_ANON_KEY ??=
  rootEnv.PUBLIC_SUPABASE_ANON_KEY || rootEnv.SUPABASE_ANON_KEY;

export default defineConfig({
  root: '.',

  output: 'server',

  adapter: node({
    mode: 'standalone',
  }),

  integrations: [react()],

  vite: {
    envDir: rootEnvDirectory,
    plugins: [tailwindcss()],
  },

  server: {
    port: 4321,
  },
});
