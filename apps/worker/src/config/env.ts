import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const safeImagePixelLimit = z.coerce
  .number()
  .int()
  .positive()
  .transform((value) => Math.min(value, 16_000_000));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1),

  S3_INTERNAL_ENDPOINT: z.string().url().default('http://minio:9000'),

  S3_REGION: z.string().default('us-east-1'),

  S3_ACCESS_KEY: z.string().min(1).default('intgarti'),

  S3_SECRET_KEY: z.string().min(1).default('intgarti_dev_storage'),

  S3_BUCKET: z.string().min(1).default('intgarti-media'),

  S3_FORCE_PATH_STYLE: booleanString.default(true),

  IMAGE_WORKER_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(5000),

  IMAGE_WORKER_MAX_JOBS_PER_PROCESS: z.coerce.number().int().min(1).max(20).default(1),

  IMAGE_MAX_PIXELS: safeImagePixelLimit.default(16_000_000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid worker environment variables:', parsed.error.flatten().fieldErrors);

  throw new Error('Invalid worker environment configuration');
}

export const env = parsed.data;
