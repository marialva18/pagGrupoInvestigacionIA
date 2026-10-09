import { AppError } from '../../common/errors/app-error.js';

export function authProviderError(error: {
  status?: number | undefined;
  code?: string | undefined;
  name?: string | undefined;
  message: string;
}): AppError {
  if (/api.?key/i.test(error.message) || error.code === 'invalid_api_key') {
    return new AppError(
      'La autenticación no está configurada correctamente.',
      503,
      'AUTH_NOT_CONFIGURED',
    );
  }
  if (
    !error.status ||
    error.status >= 500 ||
    error.name === 'AuthRetryableFetchError' ||
    error.code === 'unexpected_failure'
  ) {
    return new AppError(
      'El servicio de autenticación no está disponible.',
      503,
      'AUTH_UNAVAILABLE',
    );
  }
  return new AppError(
    'El token de autenticación no es válido o ha expirado.',
    401,
    'AUTH_INVALID_TOKEN',
  );
}
