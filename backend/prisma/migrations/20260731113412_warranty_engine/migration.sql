-- AlterEnum
ALTER TYPE "ServiceType" ADD VALUE 'WARRANTY_RENEWAL_OUTREACH';

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "warrantyOutreachSentAt" TIMESTAMP(3);
