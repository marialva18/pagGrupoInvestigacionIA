import { z } from 'zod';
import { apiRequest } from './http-client';

export const apiHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('intgarti-api'),
  timestamp: z.iso.datetime(),
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;

export function getApiHealth(): Promise<ApiHealth> {
  return apiRequest('/health', apiHealthSchema);
}
