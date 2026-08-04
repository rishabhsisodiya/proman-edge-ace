-- CreateEnum
CREATE TYPE "SlaBreachType" AS ENUM ('RESPONSE', 'RESOLUTION');

-- CreateTable
CREATE TABLE "SlaNotificationRule" (
    "id" TEXT NOT NULL,
    "breachType" "SlaBreachType" NOT NULL,
    "role" "Role" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaNotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaNotificationRule_breachType_role_key" ON "SlaNotificationRule"("breachType", "role");
