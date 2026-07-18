import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

export const contactStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'RESPONDED', 'ARCHIVED', 'SPAM']);

export type ContactStatus = z.infer<typeof contactStatusSchema>;

export const emailJobStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'RETRYING']);

export type EmailJobStatus = z.infer<typeof emailJobStatusSchema>;

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(2).max(220),
  message: z.string().trim().min(10).max(5000),
  sourcePath: z.string().trim().max(500).nullable().optional(),
  website: z.string().max(0).optional(),
});

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;

export const contactMessageSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(180),
  email: z.string().email(),
  subject: z.string().min(1).max(220),
  message: z.string(),
  sourcePath: z.string().nullable(),
  status: contactStatusSchema,
  emailJobStatus: emailJobStatusSchema,
  respondedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;
