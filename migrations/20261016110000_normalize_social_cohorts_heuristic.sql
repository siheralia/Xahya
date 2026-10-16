-- Heuristic normalization of aggregate cohorts into disjoint social groups.
-- This is an explicitly provisional demographic estimate, not canonical lore.
-- Exact integer totals are preserved per source cohort. Racial composition remains unknown.
BEGIN;

CREATE TEMP TABLE "_cohort_heuristic_sources" ON COMMIT DROP AS
SELECT c.*
FROM public."populationCohort" c
WHERE c."active" = true
  AND c."population" > 0
  AND (
    SELECT count(*) FROM public."populationCohort" other
    WHERE other."locationId" = c."locationId" AND other."active" = true
  ) = 1;

-- Abort instead of silently overwriting or duplicating a previous partial normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."populationCohort" c
    JOIN "_cohort_heuristic_sources" s ON s."id" = c."id"
    WHERE c."active" IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Heuristic cohort normalization source changed; aborting';
  END IF;
END $$;

-- Keep source rows for audit/history, but make them inactive before the new
-- disjoint profiles become active. The source values themselves are not changed.
UPDATE public."populationCohort" c
SET "active" = false, "updatedAt" = now()
FROM "_cohort_heuristic_sources" s
WHERE c."id" = s."id";

WITH profiles AS (
  SELECT * FROM (VALUES
    (1, 24, 'Producción primaria', 'Agricultura y ganadería', 'Popular', 'Adulta'),
    (2, 16, 'Oficios y manufactura', 'Artesanía y manufactura', 'Trabajadora', 'Adulta'),
    (3, 12, 'Comercio y transporte', 'Comercio', 'Media baja', 'Adulta'),
    (4, 12, 'Servicios y cuidados', 'Servicios', 'Trabajadora', 'Adulta'),
    (5,  7, 'Gobierno y defensa', 'Administración y gobierno', 'Media', 'Adulta'),
    (6,  7, 'Conocimiento y salud', 'Educación e investigación', 'Media', 'Adulta'),
    (7, 14, 'Infancia y juventud', 'Estudiantes', 'Popular', 'Infantil y juvenil'),
    (8,  8, 'Personas mayores', 'Jubilación o retiro', 'Popular', 'Mayor')
  ) AS p(profile_no, weight, label, occupation_name, class_name, age_group)
),
catalogued AS (
  SELECT p.*, o."id" AS occupation_id, sc."id" AS class_id
  FROM profiles p
  JOIN public."worldOccupation" o ON o."name" = p.occupation_name AND o."active" = true
  JOIN public."worldSocialClass" sc ON sc."name" = p.class_name AND sc."active" = true
),
allocations AS (
  SELECT
    s.*,
    p.profile_no, p.weight, p.label, p.occupation_name, p.class_name, p.age_group,
    p.occupation_id, p.class_id,
    (s."population" * p.weight / 100) +
      CASE WHEN p.profile_no = 1 THEN
        s."population" - SUM(s."population" * p.weight / 100) OVER (PARTITION BY s."id")
      ELSE 0 END AS allocated_population,
    (s."wealth" * p.weight / 100) +
      CASE WHEN p.profile_no = 1 THEN
        s."wealth" - SUM(s."wealth" * p.weight / 100) OVER (PARTITION BY s."id")
      ELSE 0 END AS allocated_wealth
  FROM "_cohort_heuristic_sources" s
  CROSS JOIN catalogued p
)
INSERT INTO public."populationCohort" (
  "locationId", "name", "raceId", "occupationId", "socialClassId",
  "race", "occupation", "socialClass", "ageGroup", "population", "wealth",
  "birthRate", "deathRate", "migrationRate", "productivity", "consumption",
  "behavior", "active", "createdAt", "updatedAt"
)
SELECT
  a."locationId",
  LEFT(a."name" || ' — ' || a.label || ' (estimación)', 120),
  NULL,
  a.occupation_id,
  a.class_id,
  'Sin especificar',
  a.occupation_name,
  a.class_name,
  a.age_group,
  a.allocated_population,
  a.allocated_wealth,
  a."birthRate",
  a."deathRate",
  a."migrationRate",
  a."productivity",
  a."consumption",
  COALESCE(a."behavior", '{}'::jsonb) || jsonb_build_object(
    'demographicEstimate', true,
    'estimateVersion', 'heuristic-social-v1',
    'estimateWeightPercent', a.weight,
    'sourceAggregateCohortId', a."id",
    'raceComposition', 'unknown'
  ),
  true,
  now(),
  now()
FROM allocations a
ORDER BY a."id", a.profile_no;

-- Fail the migration if population or wealth changed in aggregate.
DO $$
DECLARE
  before_population numeric;
  after_population numeric;
  before_wealth numeric;
  after_wealth numeric;
BEGIN
  SELECT COALESCE(SUM("population"), 0), COALESCE(SUM("wealth"), 0)
  INTO before_population, before_wealth
  FROM "_cohort_heuristic_sources";

  SELECT COALESCE(SUM(c."population"), 0), COALESCE(SUM(c."wealth"), 0)
  INTO after_population, after_wealth
  FROM public."populationCohort" c
  JOIN "_cohort_heuristic_sources" s ON s."locationId" = c."locationId"
  WHERE c."active" = true
    AND c."behavior"->>'estimateVersion' = 'heuristic-social-v1'
    AND (c."behavior"->>'sourceAggregateCohortId') ~ '^[0-9]+$'
    AND (c."behavior"->>'sourceAggregateCohortId')::integer = s."id";

  IF before_population <> after_population OR before_wealth <> after_wealth THEN
    RAISE EXCEPTION 'Heuristic cohort normalization totals mismatch: population % vs %, wealth % vs %',
      before_population, after_population, before_wealth, after_wealth;
  END IF;
END $$;

COMMIT;
