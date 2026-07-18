import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';

export const getSessionHandler: RequestHandler = (request, response, next) => {
  if (!request.user) {
    next(new AppError('Se requiere autenticación.', 401, 'AUTH_REQUIRED'));

    return;
  }

  response.status(200).json({
    data: {
      user: request.user,
    },
  });
};
