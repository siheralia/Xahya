ALTER TABLE "public"."Character"
  ADD COLUMN IF NOT EXISTS "magicAttackDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "fieldDefenseDescription" TEXT;
