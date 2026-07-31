-- AlterTable
ALTER TABLE "AmcContract" ADD COLUMN     "renewalAlert15SentAt" TIMESTAMP(3),
ADD COLUMN     "renewalAlert30SentAt" TIMESTAMP(3),
ADD COLUMN     "renewalAlert7SentAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_owningAsmId_fkey" FOREIGN KEY ("owningAsmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
