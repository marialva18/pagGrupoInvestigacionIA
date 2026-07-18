import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { extractBearerToken } from './auth.middleware.js';
import { passwordRecoverySchema } from './auth.schema.js';
import { activateInvitation, requestPasswordRecovery } from './auth.service.js';

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

export const requestPasswordRecoveryHandler: RequestHandler = (request, response, next) => {
  const parsed = passwordRecoverySchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new AppError(
        'El correo para recuperar la contraseña no es válido.',
        400,
        'AUTH_PASSWORD_RECOVERY_INVALID_INPUT',
      ),
    );

    return;
  }

  void requestPasswordRecovery(parsed.data.email)
    .then(() => {
      response.status(202).json({
        data: {
          message:
            'Si el correo pertenece a una cuenta habilitada, recibirá las instrucciones.',
        },
      });
    })
    .catch(next);
};

export const activateInvitationHandler: RequestHandler = (request, response, next) => {
  const accessToken = extractBearerToken(request.header('authorization'));

  if (!accessToken) {
    next(new AppError('Se requiere autenticación.', 401, 'AUTH_REQUIRED'));

    return;
  }

  void activateInvitation(accessToken)
    .then((user) => {
      response.status(200).json({
        data: {
          user,
        },
      });
    })
    .catch(next);
};
