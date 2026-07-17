/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_WEB_URL: string;
  readonly PUBLIC_API_URL: string;
  readonly API_INTERNAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
