-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "predictiveHoursCheckpoint" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PredictiveRuleConfig" (
    "id" TEXT NOT NULL,
    "equipmentCategory" "EquipCategory" NOT NULL,
    "monthsSinceService" INTEGER NOT NULL,
    "operatingHoursInterval" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictiveRuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PredictiveRuleConfig_equipmentCategory_key" ON "PredictiveRuleConfig"("equipmentCategory");
