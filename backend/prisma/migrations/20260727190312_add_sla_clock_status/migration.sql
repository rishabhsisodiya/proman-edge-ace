-- CreateEnum
CREATE TYPE "SlaClockStatus" AS ENUM ('ON_TRACK', 'WARNING_90', 'BREACHED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "slaResolutionStatus" "SlaClockStatus" NOT NULL DEFAULT 'ON_TRACK',
ADD COLUMN     "slaResponseStatus" "SlaClockStatus" NOT NULL DEFAULT 'ON_TRACK';
