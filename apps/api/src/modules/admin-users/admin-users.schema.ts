import { userRoleSchema, userStatusSchema } from '@intgarti/contracts';
import { z } from 'zod';

export const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(160).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(160),
  role: userRoleSchema.default('EDITOR'),
});

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2).max(160).optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Debe enviarse al menos un campo para actualizar.',
  });

export type ListUsersInput = z.infer<typeof listUsersQuerySchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
