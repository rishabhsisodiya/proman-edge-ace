-- CreateTable
CREATE TABLE "EngineerUtilizationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,

    CONSTRAINT "EngineerUtilizationSettings_pkey" PRIMARY KEY ("id")
);
