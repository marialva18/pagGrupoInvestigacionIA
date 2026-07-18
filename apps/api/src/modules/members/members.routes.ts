import express, { type Router } from 'express';
import {
  createMemberHandler,
  deactivateMemberHandler,
  getMemberByIdHandler,
  listMembersHandler,
  updateMemberHandler,
} from './members.controller.js';

export const membersRouter: Router = express.Router();

membersRouter.get('/', listMembersHandler);
membersRouter.post('/', createMemberHandler);

membersRouter.get('/:memberId', getMemberByIdHandler);

membersRouter.patch('/:memberId', updateMemberHandler);

membersRouter.delete('/:memberId', deactivateMemberHandler);
