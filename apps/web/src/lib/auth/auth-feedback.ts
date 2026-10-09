export function passwordErrorMessage(error: { code?: string }): string {
  if (error.code === 'same_password') return 'Elige una contraseña diferente a la anterior.';
  if (error.code === 'weak_password')
    return 'La contraseña no cumple los requisitos de seguridad de la cuenta.';
  if (['session_not_found', 'refresh_token_not_found', 'bad_jwt'].includes(error.code ?? '')) {
    return 'El enlace expiró. Solicita uno nuevo.';
  }
  return 'No fue posible guardar la contraseña. Inténtalo de nuevo o solicita otro enlace.';
}

export function isAuthCallback(url: string, expected: 'recovery' | 'invite'): boolean {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.slice(1));
  return (
    params.get('type') === expected &&
    !!params.get('access_token') &&
    !!params.get('refresh_token') &&
    !params.has('error') &&
    !parsed.searchParams.has('error')
  );
}

export function isInvitationCallback(url: string): boolean {
  return isAuthCallback(url, 'invite') || isAuthCallback(url, 'recovery');
}

export function invitationRedirectFromLogin(url: string): string | null {
  if (!isAuthCallback(url, 'invite')) return null;
  return `/auth/aceptar-invitacion${new URL(url).hash}`;
}

export function safeEditorRedirect(requested: string | null): string {
  if (
    !requested ||
    !requested.startsWith('/') ||
    requested.startsWith('//') ||
    requested.includes('\\') ||
    [...requested].some((char) => char.charCodeAt(0) <= 32)
  )
    return '/editor';
  const parsed = new URL(requested, 'https://intgarti.invalid');
  return /^\/(editor|admin)(\/|$)/.test(parsed.pathname) ? requested : '/editor';
}
