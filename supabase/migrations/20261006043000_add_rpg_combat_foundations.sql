-- RPG combat foundations: attack typing, basic-skill metadata and accumulation costs
ALTER TABLE public."character" ADD COLUMN IF NOT EXISTS "magicAttackType" TEXT NOT NULL DEFAULT 'CUT';

ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "accumulationCost" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "basicType" TEXT;
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "attackType" TEXT;
ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "defenseType" TEXT;

ALTER TABLE public.item ADD COLUMN IF NOT EXISTS "attackType" TEXT;

ALTER TABLE public.skill DROP CONSTRAINT IF EXISTS "Skill_accumulationCost_check";
ALTER TABLE public.skill ADD CONSTRAINT "Skill_accumulationCost_check" CHECK ("accumulationCost" >= 0);

ALTER TABLE public."character" DROP CONSTRAINT IF EXISTS "Character_magicAttackType_check";
ALTER TABLE public."character" ADD CONSTRAINT "Character_magicAttackType_check" CHECK ("magicAttackType" IN ('CUT','BLUNT','PIERCE'));

ALTER TABLE public.item DROP CONSTRAINT IF EXISTS "Item_attackType_check";
ALTER TABLE public.item ADD CONSTRAINT "Item_attackType_check" CHECK ("attackType" IS NULL OR "attackType" IN ('CUT','BLUNT','PIERCE'));

ALTER TABLE public.skill DROP CONSTRAINT IF EXISTS "Skill_attackType_check";
ALTER TABLE public.skill ADD CONSTRAINT "Skill_attackType_check" CHECK ("attackType" IS NULL OR "attackType" IN ('CUT','BLUNT','PIERCE'));

ALTER TABLE public.skill DROP CONSTRAINT IF EXISTS "Skill_defenseType_check";
ALTER TABLE public.skill ADD CONSTRAINT "Skill_defenseType_check" CHECK ("defenseType" IS NULL OR "defenseType" IN ('CONCENTRATED','DISPERSED','SOLID'));

ALTER TABLE public.skill DROP CONSTRAINT IF EXISTS "Skill_basicType_check";
ALTER TABLE public.skill ADD CONSTRAINT "Skill_basicType_check" CHECK ("basicType" IS NULL OR "basicType" IN ('PHYSICAL_ATTACK','MAGIC_ATTACK','DODGE','BLOCK','FIELD'));
