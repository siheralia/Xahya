ALTER TABLE public."business"
  ADD COLUMN IF NOT EXISTS "locationId" integer
  REFERENCES public."worldLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "business_locationId_idx" ON public."business"("locationId");

ALTER TABLE public."race"
  ADD COLUMN IF NOT EXISTS "lifeExpectancyYears" integer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'race_lifeExpectancyYears_check'
      AND conrelid = 'public."race"'::regclass
  ) THEN
    ALTER TABLE public."race"
      ADD CONSTRAINT "race_lifeExpectancyYears_check"
      CHECK ("lifeExpectancyYears" IS NULL OR "lifeExpectancyYears" BETWEEN 1 AND 100000);
  END IF;
END $$;
