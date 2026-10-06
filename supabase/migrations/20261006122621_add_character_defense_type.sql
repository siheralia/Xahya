-- Character defense typing for block and magic field
ALTER TABLE public."character"
  ADD COLUMN IF NOT EXISTS "defenseType" TEXT NOT NULL DEFAULT 'CONCENTRATED';

ALTER TABLE public."character"
  DROP CONSTRAINT IF EXISTS "Character_defenseType_check";

ALTER TABLE public."character"
  ADD CONSTRAINT "Character_defenseType_check"
  CHECK ("defenseType" IN ('CONCENTRATED','DISPERSED','SOLID'));
