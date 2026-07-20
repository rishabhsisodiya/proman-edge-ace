/*
  Warnings:

  - The values [UNDETERMINED] on the enum `ServiceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ServiceType_new" AS ENUM ('WARRANTY_REPAIR', 'BREAKDOWN_CHARGEABLE', 'SCHEDULED_PM', 'TECHNICAL_AUDIT', 'RETROFIT_UPGRADE', 'AMC', 'SPARES_SUPPLY_INSTALLATION');
ALTER TABLE "Ticket" ALTER COLUMN "serviceType" TYPE "ServiceType_new" USING ("serviceType"::text::"ServiceType_new");
ALTER TYPE "ServiceType" RENAME TO "ServiceType_old";
ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";
DROP TYPE "ServiceType_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Source" ADD VALUE 'CUSTOMER_PORTAL';
ALTER TYPE "Source" ADD VALUE 'CUSTOMER_EMAIL';
ALTER TYPE "Source" ADD VALUE 'AMC_SCHEDULED';
ALTER TYPE "Source" ADD VALUE 'WARRANTY_TRIGGERED';
ALTER TYPE "Source" ADD VALUE 'PREDICTIVE';

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "serviceType" DROP NOT NULL;
