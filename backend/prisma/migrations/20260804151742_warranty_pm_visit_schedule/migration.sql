-- AlterTable
ALTER TABLE "PredictiveRuleConfig" ADD COLUMN     "warrantyPmIntervalMonths" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "WarrantyPmEngineSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lookAheadDays" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "WarrantyPmEngineSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyPmVisit" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "visitSeqNo" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED_PENDING',
    "linkedTicketId" TEXT,
    "actualDate" TIMESTAMP(3),

    CONSTRAINT "WarrantyPmVisit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WarrantyPmVisit" ADD CONSTRAINT "WarrantyPmVisit_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
