import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { getRequestId } from '../http/request-id.js';

export const errorMiddleware: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;

  const requestId = getRequestId(request);

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });

    return;
  }

  console.error(error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
      ...(requestId ? { requestId } : {}),
    },
  });
};
