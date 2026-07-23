-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "duplicateFlagResolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possibleDuplicateOfId" TEXT;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_possibleDuplicateOfId_fkey" FOREIGN KEY ("possibleDuplicateOfId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
