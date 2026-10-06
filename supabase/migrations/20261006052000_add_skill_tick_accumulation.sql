-- Skill accumulation by combat tick.
ALTER TABLE public."skill"
  ADD COLUMN IF NOT EXISTS "accumulationPerTick" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public."characterSkillState" (
  "id" serial PRIMARY KEY,
  "characterId" integer NOT NULL,
  "skillId" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT false,
  "accumulations" integer NOT NULL DEFAULT 0,
  "totalTicks" integer NOT NULL DEFAULT 0,
  "lastTickAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "characterSkillState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES public."character"("id") ON DELETE CASCADE,
  CONSTRAINT "characterSkillState_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public."skill"("id") ON DELETE CASCADE,
  CONSTRAINT "characterSkillState_characterId_skillId_key" UNIQUE ("characterId", "skillId")
);
CREATE INDEX IF NOT EXISTS "characterSkillState_characterId_active_idx" ON public."characterSkillState" ("characterId", "active");
CREATE INDEX IF NOT EXISTS "characterSkillState_lastTickAt_idx" ON public."characterSkillState" ("lastTickAt");
