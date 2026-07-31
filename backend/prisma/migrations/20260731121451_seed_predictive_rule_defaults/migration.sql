-- Seeds the 8 EquipCategory rows with the FSD's own stated defaults
-- (6 months since last service, 500 operating hours interval). Admin edits
-- these via the Predictive Rules admin screen afterwards.
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited.
INSERT INTO "PredictiveRuleConfig" ("id", "equipmentCategory", "monthsSinceService", "operatingHoursInterval", "updatedAt") VALUES
(gen_random_uuid(), 'CRUSHER', 6, 500, now()),
(gen_random_uuid(), 'CONVEYOR', 6, 500, now()),
(gen_random_uuid(), 'WAGON_TIPPLER', 6, 500, now()),
(gen_random_uuid(), 'STACKER_RECLAIMER', 6, 500, now()),
(gen_random_uuid(), 'SCREEN', 6, 500, now()),
(gen_random_uuid(), 'DRY_MORTAR', 6, 500, now()),
(gen_random_uuid(), 'BULK_RECEPTION', 6, 500, now()),
(gen_random_uuid(), 'OTHER', 6, 500, now())
ON CONFLICT ("equipmentCategory") DO NOTHING;
