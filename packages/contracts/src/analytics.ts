import { z } from 'zod';

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
