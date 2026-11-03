-- Three editable PASSIVE racial skills with distinct, server-resolved maze effects.
-- The character grant sync trigger assigns them to existing and future race members.
-- Descriptions are narrative; numbers remain only in configured effects.
BEGIN;
INSERT INTO public."raceSkill"(
  "raceId",name,description,category,effect,"manaCost","maintenanceCost",duration,cooldown,active)
VALUES
 (5,'Reflejos felinos',
  'Cuando el suelo traiciona sus pasos, el cuerpo ya ha elegido otro lugar donde apoyarse.',
  'PASSIVE','[{"type":"MAZE_TRAP_EVASION","target":"TRAP","value":50}]'::jsonb,
  0,0,'Instantánea','Sin cooldown',true),
 (3,'Mirada del sotobosque',
  'Entre las sombras de cada rincón perciben pequeñas promesas que otros ojos dejarían atrás.',
  'PASSIVE','[{"type":"MAZE_TREASURE_ITEM_CHANCE","target":"TREASURE","value":20}]'::jsonb,
  0,0,'Instantánea','Sin cooldown',true),
 (2,'Instinto de las vetas',
  'La piedra les susurra dónde guardó su fortuna, incluso cuando la roca ha perdido su nombre.',
  'PASSIVE','[{"type":"MAZE_TREASURE_MONEY_BONUS","target":"TREASURE","value":30}]'::jsonb,
  0,0,'Instantánea','Sin cooldown',true)
ON CONFLICT ("raceId",name) DO NOTHING;

-- Ensure old race members receive the new approved racial grants.
DO $$ DECLARE member record; BEGIN
  FOR member IN SELECT id,"raceId" FROM public.character WHERE "raceId" IN (2,3,5) LOOP
    PERFORM public.refresh_character_racial_skills(member.id,member."raceId");
  END LOOP;
END $$;
COMMIT;
