import type { RequestHandler } from 'express';
import { getRequestId } from '../http/request-id.js';

export const notFoundMiddleware: RequestHandler = (request, response) => {
  const requestId = getRequestId(request);

  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'El recurso solicitado no existe.',
      ...(requestId ? { requestId } : {}),
    },
  });
};
