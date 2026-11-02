-- Generic skill catalog (no templates or character skills are inserted).
CREATE TABLE IF NOT EXISTS public."genericSkillTemplate" (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  "parentTemplateId" integer REFERENCES public."genericSkillTemplate"(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  "elementChoice" boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generic_template_payload_object CHECK(jsonb_typeof(payload)='object'),
  CONSTRAINT generic_template_no_self_parent CHECK("parentTemplateId" IS NULL OR "parentTemplateId" <> id)
);
CREATE INDEX IF NOT EXISTS generic_skill_template_parent_idx ON public."genericSkillTemplate"("parentTemplateId");
CREATE INDEX IF NOT EXISTS generic_skill_template_enabled_idx ON public."genericSkillTemplate"(enabled);

ALTER TABLE public.skill
  ADD COLUMN IF NOT EXISTS "genericTemplateId" integer,
  ADD COLUMN IF NOT EXISTS "genericElement" text;
CREATE INDEX IF NOT EXISTS skill_generic_template_idx ON public.skill("genericTemplateId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='skill_generic_template_fk') THEN
    ALTER TABLE public.skill ADD CONSTRAINT skill_generic_template_fk
      FOREIGN KEY ("genericTemplateId") REFERENCES public."genericSkillTemplate"(id) ON DELETE SET NULL;
  END IF;
END $$;
