-- Versioned catalog of material TYPES (distinct from individual materials).
-- All accesses are through Clerk-authorized application routes.
CREATE TABLE IF NOT EXISTS public."materialType" (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  obtaining text,
  naturalForm text,
  minimumForm text,
  rawForm text,
  marketForm text,
  fireReaction text,
  lightningReaction text,
  iceReaction text,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."materialType" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."materialType" FROM PUBLIC, anon, authenticated;
INSERT INTO public."materialType" (code,name,obtaining,naturalForm,minimumForm,rawForm,marketForm,fireReaction,lightningReaction,iceReaction)
VALUES
 ('METAL','Metal','Procesado',NULL,'Polvo metálico','Trozo','Lingote','Se calienta','Se calienta',NULL),
 ('WOOD','Madera','Primario','Árbol','Polvo de madera','Tronco o rama','Tabla','Arde',NULL,NULL),
 ('MINERAL','Mineral','Primario','Roca','Polvo mineral','Mena','Piedra mineral',NULL,'Resiste',NULL),
 ('LIQUID','Líquido','Primario','Variable','Gotas','Variable','En frasco','Se gasifica',NULL,'Se solidifica'),
 ('PLANT','Planta','Primario','Planta completa','Polvo vegetal','Planta completa','Planta completa','Arde',NULL,NULL),
 ('BONE','Hueso','Primario','Vertebrado vivo','Polvo de hueso','Cadáver','Hueso',NULL,NULL,NULL),
 ('SKIN','Piel','Primario','Vertebrado vivo','Retazos','Cadáver','Pieza','Arde',NULL,'Se endurece'),
 ('CLOTH','Tela','Procesado',NULL,'Hilo','Hilo','Tela','Arde',NULL,'Se endurece')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.material DROP CONSTRAINT IF EXISTS material_type_check;
ALTER TABLE public.material
  ADD CONSTRAINT material_type_code_fk FOREIGN KEY (type)
    REFERENCES public."materialType"(code) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 100 marks STEEL's reference resistance, not a maximum. Keep a high
-- operational safety limit to protect numeric calculations, not a balance cap.
ALTER TABLE public.material DROP CONSTRAINT IF EXISTS material_hardness_check;
ALTER TABLE public.material DROP CONSTRAINT IF EXISTS "material_physicalResistance_check";
ALTER TABLE public.material DROP CONSTRAINT IF EXISTS "material_magicResistance_check";
ALTER TABLE public.material
  ADD CONSTRAINT material_hardness_check CHECK (hardness BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "material_physicalResistance_check" CHECK ("physicalResistance" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "material_magicResistance_check" CHECK ("magicResistance" BETWEEN 0 AND 1000000);

-- Perk-based offensive property: +attack against a target who HAS the perk,
-- regardless of race. This does not create an always-on stat bonus.
ALTER TABLE public.material
 ADD COLUMN IF NOT EXISTS "bonusAgainstPerkId" integer REFERENCES public.perk(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS "bonusAgainstPerkAttack" integer NOT NULL DEFAULT 0
  CHECK ("bonusAgainstPerkAttack" BETWEEN 0 AND 10000);

-- Starter values are an editable *physical* reference, not magic resistance.
-- The advanced alloy values are provisional and configurable.
UPDATE public.material SET "physicalResistance"=80, hardness=80
 WHERE name='Hierro' AND "physicalResistance"=0 AND hardness=0;
UPDATE public.material SET "physicalResistance"=100, hardness=100
 WHERE name='Acero' AND "physicalResistance"=0 AND hardness=0;
UPDATE public.material SET "physicalResistance"=120, hardness=120
 WHERE name='Acero wootz' AND "physicalResistance"=0 AND hardness=0;
UPDATE public.material SET "physicalResistance"=140, hardness=140
 WHERE name='Acero oscuro' AND "physicalResistance"=0 AND hardness=0;
UPDATE public.material SET "physicalResistance"=160, hardness=160
 WHERE name='Mitrilo' AND "physicalResistance"=0 AND hardness=0;

-- Replace the old narrative placeholder on the three woods with a real,
-- editable mechanic targeting the existing perk "Cuerpo ethereo".
UPDATE public.material
 SET "specialEffect"=NULL,
     "bonusAgainstPerkId"=(SELECT id FROM public.perk WHERE name='Cuerpo ethereo' AND active=true ORDER BY id LIMIT 1),
     "bonusAgainstPerkAttack"=20
 WHERE name IN ('Madera de fresno','Madera de tejo','Madera de roble')
   AND "specialEffect"='Ataque +20 contra espíritu (referencia narrativa)'
   AND EXISTS (SELECT 1 FROM public.perk WHERE name='Cuerpo ethereo' AND active=true);
CREATE INDEX IF NOT EXISTS material_bonus_against_perk_idx ON public.material("bonusAgainstPerkId");
