-- Split character defense configuration into independent physical-block and magic-field defenses.
ALTER TABLE public."character" ADD COLUMN IF NOT EXISTS "blockDefenseType" TEXT NOT NULL DEFAULT 'CONCENTRATED';
ALTER TABLE public."character" ADD COLUMN IF NOT EXISTS "fieldDefenseType" TEXT NOT NULL DEFAULT 'CONCENTRATED';

-- Preserve the previous single defense choice for both mechanisms when migrating existing characters.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'character' AND column_name = 'defenseType'
  ) THEN
    EXECUTE 'UPDATE public."character" SET "blockDefenseType" = COALESCE("defenseType", ''CONCENTRATED''), "fieldDefenseType" = COALESCE("defenseType", ''CONCENTRATED'')';
  END IF;
END $$;

ALTER TABLE public."character" DROP CONSTRAINT IF EXISTS "Character_blockDefenseType_check";
ALTER TABLE public."character" ADD CONSTRAINT "Character_blockDefenseType_check" CHECK ("blockDefenseType" IN ('CONCENTRATED','DISPERSED','SOLID'));
ALTER TABLE public."character" DROP CONSTRAINT IF EXISTS "Character_fieldDefenseType_check";
ALTER TABLE public."character" ADD CONSTRAINT "Character_fieldDefenseType_check" CHECK ("fieldDefenseType" IN ('CONCENTRATED','DISPERSED','SOLID'));

ALTER TABLE public."character" DROP CONSTRAINT IF EXISTS "Character_defenseType_check";
ALTER TABLE public."character" DROP COLUMN IF EXISTS "defenseType";
