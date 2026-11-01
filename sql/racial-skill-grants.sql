-- Racial skills are free approved grants, never ordinary player purchases.
CREATE OR REPLACE FUNCTION public.sync_character_racial_skills()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."raceId" IS NOT DISTINCT FROM OLD."raceId" THEN
    RETURN NEW;
  END IF;

  -- Remove only skills previously granted by the former race, not learned skills.
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.skill s
    USING public."racePerk" rp
    WHERE s."characterId" = NEW.id
      AND s."grantedByRacePerkId" = rp."perkId"
      AND rp."raceId" = OLD."raceId";
  END IF;

  IF NEW."raceId" IS NOT NULL THEN
    INSERT INTO public.skill
      ("characterId", name, description, category, effect, cost,
       "maintenanceCost", "pchCost", status, "approvedAt", "grantedByRacePerkId")
    SELECT NEW.id, rs.name, rs.description, rs.category, rs.effect,
           rs."manaCost", rs."maintenanceCost", 0, 'APPROVED', now(),
           (SELECT rp."perkId" FROM public."racePerk" rp
            WHERE rp."raceId" = rs."raceId" ORDER BY rp."perkId" LIMIT 1)
    FROM public."raceSkill" rs
    WHERE rs."raceId" = NEW."raceId" AND rs.active
      AND EXISTS (SELECT 1 FROM public."racePerk" rp WHERE rp."raceId" = rs."raceId")
      AND NOT EXISTS (
        SELECT 1 FROM public.skill s
        WHERE s."characterId" = NEW.id AND s.name = rs.name
      );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS character_racial_skills_sync ON public.character;
CREATE TRIGGER character_racial_skills_sync
AFTER INSERT OR UPDATE OF "raceId" ON public.character
FOR EACH ROW EXECUTE FUNCTION public.sync_character_racial_skills();
