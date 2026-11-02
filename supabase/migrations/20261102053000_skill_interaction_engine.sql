-- General-purpose skill mechanics. No character abilities or skill records are inserted.
-- Run before deploying API code that reads these columns.
ALTER TABLE public.skill
  ADD COLUMN IF NOT EXISTS mechanics jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.skill
  DROP CONSTRAINT IF EXISTS skill_mechanics_object;
ALTER TABLE public.skill
  ADD CONSTRAINT skill_mechanics_object CHECK (jsonb_typeof(mechanics) = 'object');

ALTER TABLE public."combatSession"
  ADD COLUMN IF NOT EXISTS "mechanicsState" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."mazeRoom"
  ADD COLUMN IF NOT EXISTS "mechanicsState" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public."characterResource"
  ADD COLUMN IF NOT EXISTS "currentMana" integer;

ALTER TABLE public."characterResource"
  DROP CONSTRAINT IF EXISTS character_resource_current_mana_positive;
ALTER TABLE public."characterResource"
  ADD CONSTRAINT character_resource_current_mana_positive CHECK ("currentMana" IS NULL OR "currentMana" >= 0);

COMMENT ON COLUMN public.skill.mechanics IS 'Validated declarative triggers, activation conditions and linked skills';
COMMENT ON COLUMN public."combatSession"."mechanicsState" IS 'Encounter-specific persistent fields, exposures, wards and timed statuses';
COMMENT ON COLUMN public."mazeRoom"."mechanicsState" IS 'Room-specific persistent environmental fields and status';
COMMENT ON COLUMN public."characterResource"."currentMana" IS 'Nullable until initialized from computed max mana; never silently reset per page load';
