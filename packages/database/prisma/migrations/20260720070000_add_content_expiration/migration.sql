ALTER TABLE "ContentItem"
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "ContentItem_status_expiresAt_idx"
ON "ContentItem"("status", "expiresAt");
