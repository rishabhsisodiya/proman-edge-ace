-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "escalatedMultipleRejections" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalationAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "escalationAcknowledgedByUserId" TEXT;
