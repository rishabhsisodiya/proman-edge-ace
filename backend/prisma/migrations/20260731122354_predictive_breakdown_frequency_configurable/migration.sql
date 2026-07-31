-- AlterTable
ALTER TABLE "PredictiveRuleConfig" ADD COLUMN     "breakdownFrequencyThreshold" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "breakdownFrequencyWindowMonths" INTEGER NOT NULL DEFAULT 6;
