-- Fix case-folding in the initial material types migration.
-- PostgreSQL created lowercase columns from unquoted camelCase identifiers.
-- The Prisma Contract ORM quotes camelCase fields exactly.
-- This migration was already applied to production on 2026-11-05; keeping
-- it versioned here ensures new environments can replay the full history.
-- Column renames preserve all values, constraints, foreign keys and RLS.
BEGIN;
ALTER TABLE public."materialType" RENAME COLUMN naturalform TO "naturalForm";
ALTER TABLE public."materialType" RENAME COLUMN minimumform TO "minimumForm";
ALTER TABLE public."materialType" RENAME COLUMN rawform TO "rawForm";
ALTER TABLE public."materialType" RENAME COLUMN marketform TO "marketForm";
ALTER TABLE public."materialType" RENAME COLUMN firereaction TO "fireReaction";
ALTER TABLE public."materialType" RENAME COLUMN lightningreaction TO "lightningReaction";
ALTER TABLE public."materialType" RENAME COLUMN icereaction TO "iceReaction";
COMMIT;
