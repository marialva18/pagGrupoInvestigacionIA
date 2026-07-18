import type { ApiSuccessResponse } from '@intgarti/contracts';
import type { Response } from 'express';

export function sendSuccess<TData, TMeta = Record<string, unknown>>(
  response: Response,
  statusCode: number,
  data: TData,
  meta?: TMeta,
): Response {
  const payload: ApiSuccessResponse<TData, TMeta> =
    meta === undefined
      ? { data }
      : {
          data,
          meta,
        };

  return response.status(statusCode).json(payload);
}
