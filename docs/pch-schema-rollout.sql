-- STAGING ONLY. Review and apply via a versioned migration before merging the PCH branch.
-- The original skillCreationCredits are converted once into ten PCH each.
BEGIN;
ALTER TABLE public.character ADD COLUMN IF NOT EXISTS "pchBalance" integer NOT NULL DEFAULT 0;
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "pchCost" integer NOT NULL DEFAULT 0;
UPDATE public.character
SET "pchBalance" = "pchBalance" + "skillCreationCredits" * 10,
    "skillCreationCredits" = 0
WHERE "skillCreationCredits" > 0;
COMMIT;
