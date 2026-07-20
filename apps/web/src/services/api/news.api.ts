import {
  publicNewsDetailSchema,
  publicNewsListResultSchema,
  type PublicNewsDetail,
  type PublicNewsListResult,
} from '@intgarti/contracts';
import { apiRequest } from '../../lib/api-client';

export interface PublicNewsFilters {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: string;
  featured?: boolean;
  origin?: 'INTERNAL' | 'EXTERNAL';
  year?: number;
}

export async function listPublicNews(
  filters: PublicNewsFilters = {},
): Promise<PublicNewsListResult> {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return apiRequest(`/public/news${suffix}`, publicNewsListResultSchema);
}

export async function getPublicNews(slug: string): Promise<PublicNewsDetail> {
  return apiRequest(`/public/news/${encodeURIComponent(slug)}`, publicNewsDetailSchema);
}
