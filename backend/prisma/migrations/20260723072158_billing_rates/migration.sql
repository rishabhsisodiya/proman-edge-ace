-- AlterTable
ALTER TABLE "User" ADD COLUMN     "engineerLevel" TEXT;

-- CreateTable
CREATE TABLE "BillingRate" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "hourlyRate" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingRate_level_key" ON "BillingRate"("level");
