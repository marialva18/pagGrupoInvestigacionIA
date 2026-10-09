import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    __intgartiSupabase?: SupabaseClient;
  }
}

// Window keeps one client across islands and Vite module reloads. Never shared with SSR.
export function getBrowserSupabase(
  configuration: {
    PUBLIC_SUPABASE_URL?: string;
    PUBLIC_SUPABASE_ANON_KEY?: string;
  } = import.meta.env,
): SupabaseClient {
  if (typeof window === 'undefined') throw new Error('Cliente exclusivo del navegador.');
  const url = configuration.PUBLIC_SUPABASE_URL;
  const key = configuration.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) {
    throw new Error('El acceso no está disponible. Contacta al administrador.');
  }
  window.__intgartiSupabase ??= createClient(url, key, {
    auth: {
      storageKey: 'intgarti.browser.auth',
      persistSession: false,
      autoRefreshToken: false,
      // Recovery is requested by the API using implicit flow (no browser PKCE verifier).
      flowType: 'implicit',
      detectSessionInUrl: (callbackUrl, params) => {
        const path = new URL(callbackUrl).pathname;
        return (
          (path === '/auth/restablecer-contrasena' && params.type === 'recovery') ||
          (path === '/auth/aceptar-invitacion' && params.type === 'invite')
        );
      },
    },
  });
  return window.__intgartiSupabase;
}
