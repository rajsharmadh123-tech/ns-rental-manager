-- AlterTable RentalProductConfig
ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "cleaningBufferDays" INTEGER;
ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "isDamaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "isLost" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable RentalSettings
ALTER TABLE "RentalSettings" ADD COLUMN IF NOT EXISTS "cleaningBufferDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RentalSettings" ADD COLUMN IF NOT EXISTS "alterationBufferDays" INTEGER NOT NULL DEFAULT 0;

-- CreateTable AvailabilityBlock
CREATE TABLE IF NOT EXISTS "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "variantId" TEXT DEFAULT '',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "internalNote" TEXT,
    "createdBy" TEXT DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvailabilityBlock_shop_productId_startDate_endDate_idx" ON "AvailabilityBlock"("shop", "productId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "AvailabilityBlock_shop_status_idx" ON "AvailabilityBlock"("shop", "status");

-- CreateTable AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "performedBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_shop_entityType_entityId_idx" ON "AuditLog"("shop", "entityType", "entityId");
