-- DropForeignKey
ALTER TABLE "Equipment" DROP CONSTRAINT "Equipment_siteId_fkey";

-- AlterTable
ALTER TABLE "Equipment" ALTER COLUMN "siteId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "_AmcContractToEquipment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AmcContractToEquipment_AB_unique" ON "_AmcContractToEquipment"("A", "B");

-- CreateIndex
CREATE INDEX "_AmcContractToEquipment_B_index" ON "_AmcContractToEquipment"("B");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CustomerSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AmcContractToEquipment" ADD CONSTRAINT "_AmcContractToEquipment_A_fkey" FOREIGN KEY ("A") REFERENCES "AmcContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AmcContractToEquipment" ADD CONSTRAINT "_AmcContractToEquipment_B_fkey" FOREIGN KEY ("B") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
