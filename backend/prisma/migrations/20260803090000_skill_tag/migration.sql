-- Skill Tags master list (2026-08-03, client-agreed scope) — new table only,
-- no existing column changes. Starts empty per client decision (no seeding
-- from existing User.skillTags free-text values).

CREATE TABLE "SkillTag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillTag_label_key" ON "SkillTag"("label");
