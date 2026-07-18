import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const userRoleSchema = z.enum(['ADMIN', 'EDITOR']);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']);

export type UserStatus = z.infer<typeof userStatusSchema>;

export const authenticatedUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  role: userRoleSchema,
  status: userStatusSchema,
  lastLoginAt: isoDateTimeSchema.nullable(),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
