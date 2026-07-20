-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReason" TEXT,
ALTER COLUMN "region" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RegionMapping" (
    "id" TEXT NOT NULL,
    "erpTerritory" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSyncFailure" (
    "id" TEXT NOT NULL,
    "erpnextCustomerId" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSyncFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegionMapping_erpTerritory_key" ON "RegionMapping"("erpTerritory");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSyncFailure_erpnextCustomerId_key" ON "CustomerSyncFailure"("erpnextCustomerId");

-- CreateIndex
CREATE INDEX "Customer_needsReview_idx" ON "Customer"("needsReview");
