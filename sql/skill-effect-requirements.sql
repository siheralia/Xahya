-- Requirements are defined by effect and optional element, not a skill ID.
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "effectRequirements" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.skill ADD CONSTRAINT skill_effect_requirements_array CHECK (jsonb_typeof("effectRequirements") = 'array');
-- Preserve existing records; the old requiredSkillIds column is left for backward compatibility.
