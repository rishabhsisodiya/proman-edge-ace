-- AlterTable
ALTER TABLE "User" ADD COLUMN     "erpEmployeeId" TEXT;

-- CreateTable
CREATE TABLE "ErpEmployee" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "erpUserId" TEXT,
    "cellNumber" TEXT,
    "department" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpEmployee_employeeId_key" ON "ErpEmployee"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_erpEmployeeId_key" ON "User"("erpEmployeeId");
