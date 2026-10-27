-- Apply in the same release window as the PCH application deployment.
-- Run exactly once as a tracked migration; never reset balances on reruns.
-- Do not deploy old skill-creation code after this conversion.
BEGIN;
ALTER TABLE public.character ADD COLUMN IF NOT EXISTS "pchBalance" integer NOT NULL DEFAULT 0;
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "pchCost" integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.character
    WHERE "skillCreationCredits" > 0
      AND ("pchBalance"::bigint + "skillCreationCredits"::bigint * 10) > 2147483647
  ) THEN
    RAISE EXCEPTION 'PCH conversion would overflow integer balance';
  END IF;
END $$;
UPDATE public.character
SET "pchBalance" = "pchBalance" + "skillCreationCredits" * 10,
    "skillCreationCredits" = 0
WHERE "skillCreationCredits" > 0;
COMMIT;
