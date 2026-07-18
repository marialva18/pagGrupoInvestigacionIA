import { memberInputSchema } from '@intgarti/contracts';
import { z } from 'zod';

const booleanQuerySchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const memberIdParamsSchema = z.object({
  memberId: z.string().uuid(),
});

export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  pageSize: z.coerce.number().int().min(1).max(100).default(20),

  q: z.string().trim().min(1).max(120).optional(),

  active: booleanQuerySchema.optional(),
});

export const createMemberSchema = memberInputSchema;

export const updateMemberSchema = memberInputSchema
  .partial()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Debe enviarse al menos un campo para actualizar.',
  });

export type ListMembersInput = z.infer<typeof listMembersQuerySchema>;

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
