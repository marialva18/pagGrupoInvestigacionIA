import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
    },
  });
};
