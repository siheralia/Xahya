-- A managed racial-skill catalog, with stable source IDs on granted character skills.
-- Existing racial definitions, including Fotoconstrucción, are preserved.
ALTER TABLE public."raceSkill" ALTER COLUMN id SET DEFAULT nextval('public."raceSkill_id_seq"'::regclass);
SELECT setval('public."raceSkill_id_seq"'::regclass,
  GREATEST((SELECT COALESCE(MAX(id),0) FROM public."raceSkill"),1),
  EXISTS(SELECT 1 FROM public."raceSkill"));
ALTER TABLE public.skill ALTER COLUMN id SET DEFAULT nextval('public.skill_id_seq'::regclass);
SELECT setval('public.skill_id_seq'::regclass,
  GREATEST((SELECT COALESCE(MAX(id),0) FROM public.skill),1),
  EXISTS(SELECT 1 FROM public.skill));

ALTER TABLE public.skill ADD COLUMN IF NOT EXISTS "grantedByRaceSkillId" integer
  REFERENCES public."raceSkill"(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS skill_unique_racial_grant
  ON public.skill ("characterId","grantedByRaceSkillId")
  WHERE "grantedByRaceSkillId" IS NOT NULL;

-- Only generated racial grants are managed; learned/player-created skills are untouched.
CREATE OR REPLACE FUNCTION public.refresh_character_racial_skills(p_character_id integer, p_race_id integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.skill s
  WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public."raceSkill" rs
      WHERE rs.id=s."grantedByRaceSkillId" AND rs."raceId"=p_race_id AND rs.active);

  UPDATE public.skill s SET
    name=rs.name, description=rs.description, category=rs.category,
    effect=rs.effect, cost=rs."manaCost", "maintenanceCost"=rs."maintenanceCost",
    "pchCost"=0, status='APPROVED', "approvedAt"=COALESCE(s."approvedAt",now()),
    "updatedAt"=now()
  FROM public."raceSkill" rs
  WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId"=rs.id
    AND rs."raceId"=p_race_id AND rs.active;

  INSERT INTO public.skill
    ("characterId",name,description,category,effect,cost,"maintenanceCost",
      "pchCost",status,"approvedAt","grantedByRaceSkillId")
  SELECT p_character_id,rs.name,rs.description,rs.category,rs.effect,
    rs."manaCost",rs."maintenanceCost",0,'APPROVED',now(),rs.id
  FROM public."raceSkill" rs
  WHERE rs."raceId"=p_race_id AND rs.active
    AND NOT EXISTS (SELECT 1 FROM public.skill s
      WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId"=rs.id)
    AND NOT EXISTS (SELECT 1 FROM public.skill s
      WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId" IS NULL AND s.name=rs.name);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_character_racial_skills(integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_character_racial_skills()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW."raceId" IS DISTINCT FROM OLD."raceId" THEN
    PERFORM public.refresh_character_racial_skills(NEW.id,NEW."raceId");
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_character_racial_skills() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_racial_skill_catalog_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_race_id integer;
DECLARE c record;
BEGIN
  FOR current_race_id IN
    SELECT DISTINCT race_id FROM (VALUES
      (CASE WHEN TG_OP<>'INSERT' THEN OLD."raceId" ELSE NULL END),
      (CASE WHEN TG_OP<>'DELETE' THEN NEW."raceId" ELSE NULL END)
    ) AS ids(race_id) WHERE race_id IS NOT NULL
  LOOP
    FOR c IN SELECT id,"raceId" FROM public.character WHERE "raceId"=current_race_id LOOP
      PERFORM public.refresh_character_racial_skills(c.id,c."raceId");
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_racial_skill_catalog_changes() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS racial_skill_catalog_sync ON public."raceSkill";
CREATE TRIGGER racial_skill_catalog_sync AFTER INSERT OR UPDATE OR DELETE ON public."raceSkill"
FOR EACH ROW EXECUTE FUNCTION public.sync_racial_skill_catalog_changes();

-- Backfill grants to characters who already had an eligible race before the catalog was created.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT id,"raceId" FROM public.character WHERE "raceId" IS NOT NULL LOOP
    PERFORM public.refresh_character_racial_skills(c.id,c."raceId");
  END LOOP;
END $$;
