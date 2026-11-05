-- Schema compatibility repair for the existing materialType catalog.
-- The original CREATE TABLE statement used unquoted mixed-case identifiers,
-- so PostgreSQL silently folded them to lowercase. The ORM contract requires
-- quoted camelCase names (e.g. "fireReaction", not firereaction).
-- This migration was applied to production in Supabase migration history
-- version 20261105192758; keep it versioned for fresh environments.
-- Renames preserve the existing material types, rows, FKs, privileges and RLS.
DO $$
DECLARE
  column_pair record;
BEGIN
  IF to_regclass('public."materialType"') IS NULL THEN
    RAISE EXCEPTION 'Missing public.materialType; apply prerequisite migration first';
  END IF;
  FOR column_pair IN
    SELECT old_name, correct_name FROM (VALUES
      ('naturalform', 'naturalForm'),
      ('minimumform', 'minimumForm'),
      ('rawform', 'rawForm'),
      ('marketform', 'marketForm'),
      ('firereaction', 'fireReaction'),
      ('lightningreaction', 'lightningReaction'),
      ('icereaction', 'iceReaction'),
      ('createdat', 'createdAt')
    ) AS names(old_name, correct_name)
  LOOP
    IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='materialType'
          AND column_name=column_pair.old_name
    ) AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='materialType'
          AND column_name=column_pair.correct_name
    ) THEN
      EXECUTE format('ALTER TABLE public."materialType" RENAME COLUMN %I TO %I',
        column_pair.old_name, column_pair.correct_name);
    END IF;
  END LOOP;
END $$;
