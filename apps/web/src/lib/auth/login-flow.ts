export async function loginWithEditorialSession<T>(
  signIn: () => Promise<{
    data: { session: { access_token: string } | null };
    error: { code?: string } | null;
  }>,
  authorize: (token: string) => Promise<T>,
): Promise<{ token: string; session: T }> {
  const { data, error } = await signIn();
  if (error || !data.session?.access_token) {
    throw new Error(
      error?.code === 'invalid_credentials'
        ? 'El correo o la contraseña no son correctos.'
        : 'No fue posible iniciar sesión. Inténtalo de nuevo en unos minutos.',
    );
  }
  const token = data.session.access_token;
  return { token, session: await authorize(token) };
}
