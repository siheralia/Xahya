-- Racial skills remain free grants, but their configured cooldown must survive
-- catalog changes and be enforced by the same activation endpoint as other skills.
ALTER TABLE public."raceSkill"
  ADD COLUMN IF NOT EXISTS cooldown text NOT NULL DEFAULT 'Sin cooldown';

CREATE OR REPLACE FUNCTION public.refresh_character_racial_skills(p_character_id integer,p_race_id integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.skill s
  WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public."raceSkill" rs
      WHERE rs.id=s."grantedByRaceSkillId" AND rs."raceId"=p_race_id AND rs.active);

  UPDATE public.skill s SET
    name=rs.name,description=rs.description,category=rs.category,
    effect=rs.effect,cost=rs."manaCost","maintenanceCost"=rs."maintenanceCost",
    cooldown=rs.cooldown,"pchCost"=0,status='APPROVED',
    "approvedAt"=COALESCE(s."approvedAt",now()),"updatedAt"=now()
  FROM public."raceSkill" rs
  WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId"=rs.id
    AND rs."raceId"=p_race_id AND rs.active;

  INSERT INTO public.skill
    ("characterId",name,description,category,effect,cost,"maintenanceCost",
      cooldown,"pchCost",status,"approvedAt","grantedByRaceSkillId")
  SELECT p_character_id,rs.name,rs.description,rs.category,rs.effect,
    rs."manaCost",rs."maintenanceCost",rs.cooldown,0,'APPROVED',now(),rs.id
  FROM public."raceSkill" rs
  WHERE rs."raceId"=p_race_id AND rs.active
    AND NOT EXISTS (SELECT 1 FROM public.skill s
      WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId"=rs.id)
    AND NOT EXISTS (SELECT 1 FROM public.skill s
      WHERE s."characterId"=p_character_id AND s."grantedByRaceSkillId" IS NULL AND s.name=rs.name);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_character_racial_skills(integer,integer) FROM PUBLIC,anon,authenticated;

-- The existing raceSkill AFTER INSERT/UPDATE/DELETE trigger invokes this function
-- whenever a managed racial skill changes. Backfill current grants with their
-- catalog cooldown, preserving other character skills and their PCH.
UPDATE public.skill s SET cooldown=rs.cooldown
FROM public."raceSkill" rs
WHERE s."grantedByRaceSkillId"=rs.id
  AND s.cooldown IS DISTINCT FROM rs.cooldown;
