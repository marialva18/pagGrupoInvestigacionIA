-- Dynamic external-news discovery: automatic detection, HTML/sitemap extraction and sync diagnostics.

ALTER TABLE "ExternalNewsSource"
  ADD COLUMN "listingUrl" TEXT,
  ADD COLUMN "discoveryUrl" TEXT,
  ADD COLUMN "detectedMethod" VARCHAR(30),
  ADD COLUMN "includeUrlPatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "excludeUrlPatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN "nextSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

UPDATE "ExternalNewsSource"
SET
  "listingUrl" = COALESCE("listingUrl", "websiteUrl"),
  "discoveryUrl" = COALESCE("discoveryUrl", "feedUrl"),
  "detectedMethod" = CASE
    WHEN "ingestionMethod" = 'RSS' THEN 'RSS'
    WHEN "ingestionMethod" = 'ATOM' THEN 'ATOM'
    ELSE NULL
  END,
  "ingestionMethod" = CASE
    WHEN "ingestionMethod" = 'MANUAL' THEN 'AUTO'::"ExternalNewsIngestionMethod"
    ELSE "ingestionMethod"
  END,
  "status" = CASE
    WHEN "deletedAt" IS NULL THEN 'ACTIVE'::"ExternalNewsSourceStatus"
    ELSE "status"
  END,
  "maxItemsPerSync" = LEAST("maxItemsPerSync", 15),
  "nextSyncAt" = CURRENT_TIMESTAMP;

CREATE TABLE "ExternalNewsSyncRun" (
  "id" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" VARCHAR(30) NOT NULL,
  "strategy" VARCHAR(30),
  "discoveryUrl" TEXT,
  "fetched" INTEGER NOT NULL DEFAULT 0,
  "accepted" INTEGER NOT NULL DEFAULT 0,
  "inserted" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "duplicates" INTEGER NOT NULL DEFAULT 0,
  "excluded" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "errorMessage" TEXT,
  "diagnostics" JSONB,
  CONSTRAINT "ExternalNewsSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExternalNewsSyncRun"
  ADD CONSTRAINT "ExternalNewsSyncRun_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ExternalNewsSource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ExternalNewsSource_status_nextSyncAt_idx"
  ON "ExternalNewsSource"("status", "nextSyncAt");

CREATE INDEX "ExternalNewsSyncRun_sourceId_startedAt_idx"
  ON "ExternalNewsSyncRun"("sourceId", "startedAt");

CREATE INDEX "ExternalNewsSyncRun_status_startedAt_idx"
  ON "ExternalNewsSyncRun"("status", "startedAt");
