import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  inviteUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamsSchema,
} from './admin-users.schema.js';
import { inviteUser, listUsers, resendInvitation, updateUser } from './admin-users.service.js';

export const listUsersHandler: RequestHandler = (request, response, next) => {
  const parsed = listUsersQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(
      new AppError('Los filtros de usuarios no son válidos.', 400, 'ADMIN_USER_LIST_INVALID_QUERY'),
    );

    return;
  }

  void listUsers(parsed.data)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const inviteUserHandler: RequestHandler = (request, response, next) => {
  const parsed = inviteUserSchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new AppError(
        'Los datos de la invitación no son válidos.',
        400,
        'ADMIN_USER_INVITATION_INVALID_INPUT',
      ),
    );

    return;
  }

  void inviteUser(getAuthenticatedUser(request), parsed.data)
    .then((user) => {
      response.status(201).json({
        data: {
          user,
        },
      });
    })
    .catch(next);
};

export const resendInvitationHandler: RequestHandler = (request, response, next) => {
  const parsed = userIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El identificador del usuario no es válido.', 400, 'ADMIN_USER_INVALID_ID'));

    return;
  }

  void resendInvitation(getAuthenticatedUser(request), parsed.data.userId)
    .then((user) => {
      response.status(200).json({
        data: {
          user,
        },
      });
    })
    .catch(next);
};

export const updateUserHandler: RequestHandler = (request, response, next) => {
  const parsedParams = userIdParamsSchema.safeParse(request.params);
  const parsedBody = updateUserSchema.safeParse(request.body);

  if (!parsedParams.success) {
    next(new AppError('El identificador del usuario no es válido.', 400, 'ADMIN_USER_INVALID_ID'));

    return;
  }

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para actualizar el usuario no son válidos.',
        400,
        'ADMIN_USER_UPDATE_INVALID_INPUT',
      ),
    );

    return;
  }

  void updateUser(getAuthenticatedUser(request), parsedParams.data.userId, parsedBody.data)
    .then((user) => {
      response.status(200).json({
        data: {
          user,
        },
      });
    })
    .catch(next);
};
