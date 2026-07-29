-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "duplicateFlagResolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "erpTrackingStatus" TEXT,
ADD COLUMN     "possibleDuplicateOfId" TEXT,
ADD COLUMN     "quantity" INTEGER;

-- CreateTable
CREATE TABLE "EquipmentSyncSkipped" (
    "id" TEXT NOT NULL,
    "erpSerialId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentSyncSkipped_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentSyncSkipped_erpSerialId_key" ON "EquipmentSyncSkipped"("erpSerialId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_possibleDuplicateOfId_fkey" FOREIGN KEY ("possibleDuplicateOfId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

