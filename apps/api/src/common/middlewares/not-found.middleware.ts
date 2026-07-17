import type { RequestHandler } from 'express';

export const notFoundMiddleware: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'El recurso solicitado no existe.',
    },
  });
};
