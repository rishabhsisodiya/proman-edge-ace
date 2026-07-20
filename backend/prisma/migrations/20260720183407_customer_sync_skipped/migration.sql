-- CreateTable
CREATE TABLE "CustomerSyncSkipped" (
    "id" TEXT NOT NULL,
    "erpnextCustomerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSyncSkipped_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSyncSkipped_erpnextCustomerId_key" ON "CustomerSyncSkipped"("erpnextCustomerId");
