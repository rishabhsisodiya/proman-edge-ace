-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "priceListName" TEXT;

-- CreateTable
CREATE TABLE "ItemPriceListRate" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "priceListName" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPriceListRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemPriceListRate_itemCode_priceListName_key" ON "ItemPriceListRate"("itemCode", "priceListName");

-- AddForeignKey
ALTER TABLE "ItemPriceListRate" ADD CONSTRAINT "ItemPriceListRate_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("itemCode") ON DELETE RESTRICT ON UPDATE CASCADE;
