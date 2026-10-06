-- Add personal descriptions for the character's magic attack and magic field defense.
ALTER TABLE public."character"
  ADD COLUMN IF NOT EXISTS "magicAttackDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "fieldDefenseDescription" TEXT;
