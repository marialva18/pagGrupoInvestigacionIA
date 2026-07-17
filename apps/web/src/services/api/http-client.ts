import type { ZodType } from 'zod';

const API_BASE_URL = import.meta.env.SSR
  ? (import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL)
  : import.meta.env.PUBLIC_API_URL;

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'API_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init.headers);

  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  const rawBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const payload = rawBody as ApiErrorPayload | null;

    throw new ApiRequestError(
      payload?.error?.message ?? 'La solicitud no pudo completarse.',
      response.status,
      payload?.error?.code ?? 'API_ERROR',
      payload?.error?.details,
    );
  }

  return schema.parse(rawBody);
}
