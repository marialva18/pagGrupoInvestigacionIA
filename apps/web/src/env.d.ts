/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_WEB_URL: string;
  readonly PUBLIC_API_URL: string;
  readonly API_INTERNAL_URL?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
