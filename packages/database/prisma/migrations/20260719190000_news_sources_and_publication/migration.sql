-- News source catalog, feed ingestion metadata and external publication fields.

CREATE TYPE "NewsOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');
CREATE TYPE "ExternalNewsSourceType" AS ENUM (
  'ACADEMIC',
  'NEWS_AGENCY',
  'NEWS_MEDIA',
  'CORPORATE_RESEARCH',
  'CORPORATE_BLOG',
  'GOVERNMENT',
  'UNIVERSITY',
  'OTHER'
);
CREATE TYPE "ExternalNewsSourceStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "ExternalNewsIngestionMethod" AS ENUM ('RSS', 'ATOM', 'MANUAL');
CREATE TYPE "ExternalNewsReviewMode" AS ENUM ('REQUIRED', 'AUTOMATIC');
CREATE TYPE "ExternalSummaryStatus" AS ENUM ('SOURCE', 'EXTRACTIVE', 'AI_GENERATED', 'REVIEWED');

ALTER TABLE "ContentItem"
  ADD COLUMN "origin" "NewsOrigin" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "externalUrl" TEXT,
  ADD COLUMN "sourceName" VARCHAR(180),
  ADD COLUMN "sourceType" "ExternalNewsSourceType",
  ADD COLUMN "originalTitle" VARCHAR(300),
  ADD COLUMN "externalPublishedAt" TIMESTAMP(3);

CREATE TABLE "ExternalNewsSource" (
  "id" UUID NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "domain" VARCHAR(255) NOT NULL,
  "websiteUrl" TEXT NOT NULL,
  "feedUrl" TEXT,
  "type" "ExternalNewsSourceType" NOT NULL,
  "status" "ExternalNewsSourceStatus" NOT NULL DEFAULT 'PAUSED',
  "ingestionMethod" "ExternalNewsIngestionMethod" NOT NULL DEFAULT 'MANUAL',
  "reviewMode" "ExternalNewsReviewMode" NOT NULL DEFAULT 'REQUIRED',
  "language" VARCHAR(12) NOT NULL DEFAULT 'es',
  "includeKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludeKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minimumRelevanceScore" INTEGER NOT NULL DEFAULT 30,
  "maxItemsPerSync" INTEGER NOT NULL DEFAULT 30,
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" VARCHAR(30),
  "lastSyncMessage" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalNewsSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalNewsSource_key_key" ON "ExternalNewsSource"("key");
CREATE UNIQUE INDEX "ExternalNewsSource_domain_key" ON "ExternalNewsSource"("domain");
CREATE INDEX "ExternalNewsSource_status_deletedAt_idx" ON "ExternalNewsSource"("status", "deletedAt");
CREATE INDEX "ExternalNewsSource_type_status_idx" ON "ExternalNewsSource"("type", "status");
CREATE INDEX "ExternalNewsSource_domain_idx" ON "ExternalNewsSource"("domain");

ALTER TABLE "ExternalNewsItem"
  RENAME COLUMN "summary" TO "sourceSummary";

ALTER TABLE "ExternalNewsItem"
  ADD COLUMN "sourceId" UUID,
  ADD COLUMN "generatedSummary" TEXT,
  ADD COLUMN "summaryStatus" "ExternalSummaryStatus" NOT NULL DEFAULT 'SOURCE',
  ADD COLUMN "language" VARCHAR(12),
  ADD COLUMN "author" VARCHAR(220),
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "matchedKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "relevanceScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ExternalNewsItem"
  ADD CONSTRAINT "ExternalNewsItem_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ExternalNewsSource"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ContentItem_origin_publishedAt_idx" ON "ContentItem"("origin", "publishedAt");
CREATE INDEX "ContentItem_sourceName_publishedAt_idx" ON "ContentItem"("sourceName", "publishedAt");
CREATE INDEX "ExternalNewsItem_sourceId_status_idx" ON "ExternalNewsItem"("sourceId", "status");
CREATE INDEX "ExternalNewsItem_relevanceScore_publishedAt_idx" ON "ExternalNewsItem"("relevanceScore", "publishedAt");

-- Preserve a single highlighted publication even under concurrent editor requests.
WITH ranked_featured AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY "publishedAt" DESC NULLS LAST, "updatedAt" DESC, "id"
    ) AS row_number
  FROM "ContentItem"
  WHERE "type" = 'NEWS' AND "featured" = TRUE AND "archivedAt" IS NULL
)
UPDATE "ContentItem" AS content
SET "featured" = FALSE
FROM ranked_featured
WHERE content."id" = ranked_featured."id"
  AND ranked_featured.row_number > 1;

CREATE UNIQUE INDEX "ContentItem_one_featured_news_idx"
  ON "ContentItem" ((1))
  WHERE "type" = 'NEWS' AND "featured" = TRUE AND "archivedAt" IS NULL;
