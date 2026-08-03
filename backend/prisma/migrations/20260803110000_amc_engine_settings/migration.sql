-- AMC engine settings (2026-08-03) — single-row table, same pattern as
-- FinanceSettings, for the Admin-configurable look-ahead window on
-- AmcVisitCron's auto-ticket-creation job.

CREATE TABLE "AmcEngineSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lookAheadDays" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "AmcEngineSettings_pkey" PRIMARY KEY ("id")
);
