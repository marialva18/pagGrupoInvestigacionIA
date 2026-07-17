import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'EDITOR']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const contentStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const mediaStatusSchema = z.enum([
  'PENDING',
  'UPLOADING',
  'PROCESSING',
  'READY',
  'REJECTED',
  'ARCHIVED',
]);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const analyticsEventSchema = z.enum([
  'PAGE_VIEW',
  'NEWS_VIEW',
  'ENGAGED_READ',
  'SCROLL_DEPTH',
  'EXTERNAL_SOURCE_CLICK',
  'ACADEMIC_SOURCE_CLICK',
  'ACADEMIC_SEARCH',
  'FILE_DOWNLOAD',
  'CONTACT_STARTED',
  'CONTACT_SUBMITTED',
]);
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
