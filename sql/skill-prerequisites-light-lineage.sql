-- Skill prerequisites and racial skill grants.
-- Apply only after API/UI integration is ready.
ALTER TABLE public.skill
  ADD COLUMN IF NOT EXISTS "requiredSkillIds" integer[] NOT NULL DEFAULT '{}';
ALTER TABLE public.skill
  ADD COLUMN IF NOT EXISTS "grantedByRacePerkId" integer NULL REFERENCES public.perk(id) ON DELETE SET NULL;
ALTER TABLE public.skill
  ADD CONSTRAINT skill_no_self_requirement
  CHECK (NOT (id = ANY("requiredSkillIds")));
CREATE INDEX IF NOT EXISTS skill_required_skill_ids_idx ON public.skill USING gin ("requiredSkillIds");
CREATE INDEX IF NOT EXISTS skill_granted_by_race_perk_idx ON public.skill ("grantedByRacePerkId");
COMMENT ON COLUMN public.skill."requiredSkillIds" IS 'Approved skills of the same character required to use this skill; validate server-side.';
COMMENT ON COLUMN public.skill."grantedByRacePerkId" IS 'Race perk that grants this skill; null for personally learned skills.';
