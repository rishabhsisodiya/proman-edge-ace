-- Skill Tags master list (2026-08-03) — seeds the 2 tags actually already in
-- use on a real engineer's profile (M. Kumar: CRUSHER, BEARINGS), set before
-- the master list existed. Deliberately NOT a seed of all historical
-- skillTags usage (client declined that) — this is the narrower "these 2
-- specific tags are already live data, so validation can be fully strict
-- with zero exceptions" fix, applied ad-hoc to the dev DB when the gap was
-- first found; recorded here as a real migration so a fresh environment
-- (staging, another dev machine) gets the same 2 rows.
-- ON CONFLICT DO NOTHING — safe to run even though these rows may already
-- exist (they do, on this database).

INSERT INTO "SkillTag" ("id", "label", "createdAt") VALUES
(gen_random_uuid(), 'CRUSHER', now()),
(gen_random_uuid(), 'BEARINGS', now())
ON CONFLICT ("label") DO NOTHING;
