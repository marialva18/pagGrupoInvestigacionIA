import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  createMemberSchema,
  listMembersQuerySchema,
  memberIdParamsSchema,
  updateMemberSchema,
} from './members.schema.js';
import {
  createMember,
  deactivateMember,
  getMemberById,
  listMembers,
  updateMember,
} from './members.service.js';

export const listMembersHandler: RequestHandler = (request, response, next) => {
  const parsed = listMembersQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    next(new AppError('Los filtros de miembros no son válidos.', 400, 'MEMBER_LIST_INVALID_QUERY'));

    return;
  }

  void listMembers(parsed.data)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const getMemberByIdHandler: RequestHandler = (request, response, next) => {
  const parsed = memberIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El identificador del miembro no es válido.', 400, 'MEMBER_INVALID_ID'));

    return;
  }

  void getMemberById(parsed.data.memberId)
    .then((member) => {
      response.status(200).json({
        data: member,
      });
    })
    .catch(next);
};

export const createMemberHandler: RequestHandler = (request, response, next) => {
  const parsed = createMemberSchema.safeParse(request.body);

  if (!parsed.success) {
    next(new AppError('Los datos del miembro no son válidos.', 400, 'MEMBER_INVALID_INPUT'));

    return;
  }

  void createMember(getAuthenticatedUser(request), parsed.data)
    .then((member) => {
      response.status(201).json({
        data: member,
      });
    })
    .catch(next);
};

export const updateMemberHandler: RequestHandler = (request, response, next) => {
  const parsedParams = memberIdParamsSchema.safeParse(request.params);

  if (!parsedParams.success) {
    next(new AppError('El identificador del miembro no es válido.', 400, 'MEMBER_INVALID_ID'));

    return;
  }

  const parsedBody = updateMemberSchema.safeParse(request.body);

  if (!parsedBody.success) {
    next(
      new AppError(
        'Los datos para actualizar el miembro no son válidos.',
        400,
        'MEMBER_UPDATE_INVALID_INPUT',
      ),
    );

    return;
  }

  void updateMember(getAuthenticatedUser(request), parsedParams.data.memberId, parsedBody.data)
    .then((member) => {
      response.status(200).json({
        data: member,
      });
    })
    .catch(next);
};

export const deactivateMemberHandler: RequestHandler = (request, response, next) => {
  const parsed = memberIdParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(new AppError('El identificador del miembro no es válido.', 400, 'MEMBER_INVALID_ID'));

    return;
  }

  void deactivateMember(getAuthenticatedUser(request), parsed.data.memberId)
    .then((member) => {
      response.status(200).json({
        data: member,
      });
    })
    .catch(next);
};
