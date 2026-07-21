/*
  Warnings:

  - A unique constraint covering the columns `[erpnextAddressId]` on the table `CustomerSite` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CustomerSite" ADD COLUMN     "erpnextAddressId" TEXT;

-- CreateTable
CREATE TABLE "ItemWarehouseStock" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "actualQty" DOUBLE PRECISION NOT NULL,
    "valuationRate" DECIMAL(65,30),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemWarehouseStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemWarehouseStock_itemCode_warehouse_key" ON "ItemWarehouseStock"("itemCode", "warehouse");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSite_erpnextAddressId_key" ON "CustomerSite"("erpnextAddressId");

-- AddForeignKey
ALTER TABLE "ItemWarehouseStock" ADD CONSTRAINT "ItemWarehouseStock_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;
