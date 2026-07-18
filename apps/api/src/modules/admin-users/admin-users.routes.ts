import express, { type Router } from 'express';
import {
  inviteUserHandler,
  listUsersHandler,
  resendInvitationHandler,
  updateUserHandler,
} from './admin-users.controller.js';

export const adminUsersRouter: Router = express.Router();

adminUsersRouter.get('/', listUsersHandler);
adminUsersRouter.post('/invitations', inviteUserHandler);
adminUsersRouter.post('/:userId/resend-invitation', resendInvitationHandler);
adminUsersRouter.patch('/:userId', updateUserHandler);
