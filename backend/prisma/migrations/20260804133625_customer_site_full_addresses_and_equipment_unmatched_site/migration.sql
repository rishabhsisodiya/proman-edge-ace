-- AlterTable
ALTER TABLE "CustomerSite" ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "addressType" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBilling" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "unmatchedSiteAddressId" TEXT;
