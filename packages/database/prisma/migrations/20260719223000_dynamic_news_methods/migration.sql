-- Add discovery methods in a separate migration so PostgreSQL commits enum values
-- before the following migration uses AUTO in data updates.

ALTER TYPE "ExternalNewsIngestionMethod" ADD VALUE IF NOT EXISTS 'AUTO' BEFORE 'RSS';
ALTER TYPE "ExternalNewsIngestionMethod" ADD VALUE IF NOT EXISTS 'SITEMAP' BEFORE 'MANUAL';
ALTER TYPE "ExternalNewsIngestionMethod" ADD VALUE IF NOT EXISTS 'HTML' BEFORE 'MANUAL';
