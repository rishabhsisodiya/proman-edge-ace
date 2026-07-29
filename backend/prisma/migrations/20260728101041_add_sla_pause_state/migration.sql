-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "slaPausedAt" TIMESTAMP(3),
ADD COLUMN     "slaPausedMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SlaPauseState" (
    "id" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaPauseState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPauseState_status_key" ON "SlaPauseState"("status");
