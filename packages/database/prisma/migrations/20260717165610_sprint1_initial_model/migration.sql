-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('NEWS', 'PAGE', 'EVENT');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('MINIO', 'SUPABASE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaVariantKind" AS ENUM ('ORIGINAL', 'THUMBNAIL', 'CARD', 'HERO', 'MOBILE');

-- CreateEnum
CREATE TYPE "MediaRightsStatus" AS ENUM ('PENDING', 'VERIFIED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ContentMediaRole" AS ENUM ('COVER', 'INLINE', 'GALLERY', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "AcademicSourceType" AS ENUM ('DATABASE', 'JOURNAL', 'REPOSITORY', 'SEARCH_ENGINE', 'ORGANIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESPONDED', 'ARCHIVED', 'SPAM');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "authProviderId" VARCHAR(255),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" VARCHAR(180) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "summary" TEXT,
    "body" JSONB,
    "seoTitle" VARCHAR(70),
    "metaDescription" VARCHAR(180),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "assignedEditorId" UUID,
    "reviewedById" UUID,
    "approvedById" UUID,
    "coverMediaId" UUID,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCategory" (
    "contentId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentCategory_pkey" PRIMARY KEY ("contentId","categoryId")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" UUID NOT NULL,
    "fullName" VARCHAR(180) NOT NULL,
    "roleTitle" VARCHAR(180) NOT NULL,
    "biography" TEXT,
    "email" VARCHAR(320),
    "linkedinUrl" TEXT,
    "orcidUrl" TEXT,
    "photoMediaId" UUID,
    "isCoordinator" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicSource" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "AcademicSourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "logoMediaId" UUID,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "bucket" VARCHAR(120) NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "extension" VARCHAR(20) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksumSha256" VARCHAR(64),
    "altText" VARCHAR(300),
    "caption" TEXT,
    "credit" VARCHAR(220),
    "sourceUrl" TEXT,
    "rightsStatus" "MediaRightsStatus" NOT NULL DEFAULT 'PENDING',
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaVariant" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "kind" "MediaVariantKind" NOT NULL,
    "objectKey" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMedia" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "role" "ContentMediaRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(220) NOT NULL,
    "message" TEXT NOT NULL,
    "sourcePath" VARCHAR(500),
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "emailJobStatus" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(140) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(255),
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" VARCHAR(160) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProviderId_key" ON "User"("authProviderId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_slug_key" ON "ContentItem"("slug");

-- CreateIndex
CREATE INDEX "ContentItem_type_status_idx" ON "ContentItem"("type", "status");

-- CreateIndex
CREATE INDEX "ContentItem_status_publishedAt_idx" ON "ContentItem"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "ContentItem_assignedEditorId_status_idx" ON "ContentItem"("assignedEditorId", "status");

-- CreateIndex
CREATE INDEX "ContentItem_featured_publishedAt_idx" ON "ContentItem"("featured", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_name_idx" ON "Category"("active", "name");

-- CreateIndex
CREATE INDEX "ContentCategory_categoryId_idx" ON "ContentCategory"("categoryId");

-- CreateIndex
CREATE INDEX "Member_active_displayOrder_idx" ON "Member"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSource_url_key" ON "AcademicSource"("url");

-- CreateIndex
CREATE INDEX "AcademicSource_active_displayOrder_idx" ON "AcademicSource"("active", "displayOrder");

-- CreateIndex
CREATE INDEX "AcademicSource_type_active_idx" ON "AcademicSource"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_checksumSha256_key" ON "MediaAsset"("checksumSha256");

-- CreateIndex
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_createdById_status_idx" ON "MediaAsset"("createdById", "status");

-- CreateIndex
CREATE INDEX "MediaAsset_provider_bucket_idx" ON "MediaAsset"("provider", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_objectKey_key" ON "MediaVariant"("objectKey");

-- CreateIndex
CREATE INDEX "MediaVariant_mediaAssetId_idx" ON "MediaVariant"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_mediaAssetId_kind_key" ON "MediaVariant"("mediaAssetId", "kind");

-- CreateIndex
CREATE INDEX "ContentMedia_contentId_role_position_idx" ON "ContentMedia"("contentId", "role", "position");

-- CreateIndex
CREATE INDEX "ContentMedia_mediaAssetId_idx" ON "ContentMedia"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMedia_contentId_mediaAssetId_role_key" ON "ContentMedia"("contentId", "mediaAssetId", "role");

-- CreateIndex
CREATE INDEX "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMessage_emailJobStatus_createdAt_idx" ON "ContactMessage"("emailJobStatus", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_assignedEditorId_fkey" FOREIGN KEY ("assignedEditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCategory" ADD CONSTRAINT "ContentCategory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCategory" ADD CONSTRAINT "ContentCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_photoMediaId_fkey" FOREIGN KEY ("photoMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSource" ADD CONSTRAINT "AcademicSource_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMedia" ADD CONSTRAINT "ContentMedia_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMedia" ADD CONSTRAINT "ContentMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
