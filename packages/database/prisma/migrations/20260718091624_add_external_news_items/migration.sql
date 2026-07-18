-- CreateEnum
CREATE TYPE "ExternalNewsStatus" AS ENUM ('DISCOVERED', 'REVIEWED', 'IMPORTED', 'DISCARDED', 'FAILED');

-- CreateTable
CREATE TABLE "ExternalNewsItem" (
    "id" UUID NOT NULL,
    "sourceKey" VARCHAR(100) NOT NULL,
    "externalId" VARCHAR(255),
    "canonicalUrl" TEXT NOT NULL,
    "canonicalUrlHash" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "contentHash" VARCHAR(64),
    "status" "ExternalNewsStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rawMetadata" JSONB,
    "failureReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contentId" UUID,

    CONSTRAINT "ExternalNewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalNewsItem_canonicalUrlHash_key" ON "ExternalNewsItem"("canonicalUrlHash");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_sourceKey_externalId_idx" ON "ExternalNewsItem"("sourceKey", "externalId");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_sourceKey_status_idx" ON "ExternalNewsItem"("sourceKey", "status");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_status_firstSeenAt_idx" ON "ExternalNewsItem"("status", "firstSeenAt");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_publishedAt_idx" ON "ExternalNewsItem"("publishedAt");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_contentHash_idx" ON "ExternalNewsItem"("contentHash");

-- CreateIndex
CREATE INDEX "ExternalNewsItem_contentId_idx" ON "ExternalNewsItem"("contentId");

-- AddForeignKey
ALTER TABLE "ExternalNewsItem" ADD CONSTRAINT "ExternalNewsItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
