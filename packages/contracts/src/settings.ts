import { z } from 'zod';

export const siteIdentitySchema = z.object({
  name: z.string().min(1).max(180),
  shortName: z.string().min(1).max(40),
  description: z.string().nullable(),
  logoMediaId: z.string().uuid().nullable(),
  faviconMediaId: z.string().uuid().nullable(),
});

export const siteContactSchema = z.object({
  email: z.string().email().nullable(),
  phone: z.string().max(40).nullable(),
  address: z.string().max(500).nullable(),
  officeHours: z.string().max(300).nullable(),
});

export const siteSocialSchema = z.record(z.string().min(1), z.string().url());

export const siteFooterSchema = z.object({
  text: z.string().max(500).nullable(),
  links: z.array(
    z.object({
      label: z.string().min(1).max(120),
      url: z.string().url(),
    }),
  ),
});

export const siteSeoSchema = z.object({
  siteTitle: z.string().min(1).max(70),
  defaultDescription: z.string().max(180).nullable(),
});

export const publicSiteSettingsSchema = z.object({
  identity: siteIdentitySchema,
  contact: siteContactSchema,
  social: siteSocialSchema,
  footer: siteFooterSchema,
  seo: siteSeoSchema,
});

export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;

export const siteSettingRecordSchema = z.object({
  key: z.string().min(1).max(160),
  value: z.unknown(),
  description: z.string().nullable(),
  sensitive: z.boolean(),
  updatedAt: z.string().datetime({
    offset: true,
  }),
});

export type SiteSettingRecord = z.infer<typeof siteSettingRecordSchema>;
