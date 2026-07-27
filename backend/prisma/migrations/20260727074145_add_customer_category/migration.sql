-- CreateEnum
CREATE TYPE "CustomerCategory" AS ENUM ('WARRANTY', 'NON_WARRANTY', 'AMC');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "customerCategory" "CustomerCategory";
