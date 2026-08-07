-- CreateTable
CREATE TABLE "DashboardAccessRule" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "dashboardKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardAccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardAccessRule_role_dashboardKey_key" ON "DashboardAccessRule"("role", "dashboardKey");
