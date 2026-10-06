-- Finalize the independent block/field defense split.
-- The earlier split migration already performs this change; this migration is
-- intentionally idempotent so remote migration history matches the database.
ALTER TABLE public."character"
  DROP CONSTRAINT IF EXISTS "Character_defenseType_check",
  DROP COLUMN IF EXISTS "defenseType";
