-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SlaBreachType" ADD VALUE 'LEVEL2';
ALTER TYPE "SlaBreachType" ADD VALUE 'LEVEL3';

-- AlterTable
ALTER TABLE "SlaPolicy" ADD COLUMN     "level2DelayHours" INTEGER,
ADD COLUMN     "level3DelayHours" INTEGER;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "slaResolutionBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaResolutionEscalationLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slaResponseBreachedAt" TIMESTAMP(3),
ADD COLUMN     "slaResponseEscalationLevel" INTEGER NOT NULL DEFAULT 0;
