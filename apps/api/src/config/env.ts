import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().optional(),

  API_PORT: z.coerce.number().int().positive().default(3001),

  WEB_ORIGINS: z.string().default('http://localhost:4321'),

  TRUST_PROXY: booleanString.default(false),

  LOG_LEVEL: z.string().default('info'),

  STORAGE_PROVIDER: z.enum(['minio', 'supabase']).default('minio'),

  S3_INTERNAL_ENDPOINT: z.string().url().default('http://minio:9000'),

  S3_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),

  S3_REGION: z.string().default('us-east-1'),

  S3_ACCESS_KEY: z.string().min(1).default('intgarti'),

  S3_SECRET_KEY: z.string().min(1).default('intgarti_dev_storage'),

  S3_BUCKET: z.string().min(1).default('intgarti-media'),

  S3_FORCE_PATH_STYLE: booleanString.default(true),

  MEDIA_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),

  MEDIA_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  DEV_EDITOR_USER_ID: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);

  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;

export const allowedOrigins = env.WEB_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
