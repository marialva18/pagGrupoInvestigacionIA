import type { ApiErrorResponse, ApiSuccessResponse } from '@intgarti/contracts';
import type { ZodType } from 'zod';

const configuredApiBaseUrl = import.meta.env.SSR
  ? (import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL)
  : import.meta.env.PUBLIC_API_URL;

const API_BASE_URL =
  typeof configuredApiBaseUrl === 'string' ? configuredApiBaseUrl.replace(/\/+$/, '') : '';

export interface ApiRequestOptions extends RequestInit {
  accessToken?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'API_ERROR',
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function getApiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new ApiRequestError(
      'La URL de la API no está configurada.',
      500,
      'API_URL_NOT_CONFIGURED',
    );
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { accessToken, headers: configuredHeaders, ...requestInit } = options;

  const headers = new Headers(configuredHeaders);

  headers.set('Accept', 'application/json');

  if (requestInit.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(getApiUrl(path), {
    ...requestInit,
    credentials: 'include',
    headers,
  });

  const rawBody: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const payload = rawBody as ApiErrorResponse | null;

    throw new ApiRequestError(
      payload?.error?.message ?? 'La solicitud no pudo completarse.',
      response.status,
      payload?.error?.code ?? 'API_ERROR',
      payload?.error?.details,
      payload?.error?.requestId,
    );
  }

  if (!rawBody || typeof rawBody !== 'object' || !('data' in rawBody)) {
    throw new ApiRequestError(
      'La API devolvió una respuesta con formato inválido.',
      response.status,
      'INVALID_API_RESPONSE',
    );
  }

  const payload = rawBody as ApiSuccessResponse<unknown>;

  return schema.parse(payload.data);
}
