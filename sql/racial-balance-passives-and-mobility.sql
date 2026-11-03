-- Race balance adjustments: only the intended racial catalog entries are changed.
-- Descriptions remain narrative; mechanical parameters live in effect JSON.
-- Prerequisite: effects catalog and combat innate-traits support in this PR.
BEGIN;

-- The single shared Evasividad perk is granted to both elves and felines.
UPDATE public.perk SET
  description='Entre un parpadeo y el siguiente ya no están donde se les busca.',
  effects=jsonb_set(effects,'{0,value}','25'::jsonb)
WHERE id=9 AND name='Evasividad'
 AND EXISTS(SELECT 1 FROM public."racePerk" WHERE "perkId"=9 AND "raceId"=3)
 AND EXISTS(SELECT 1 FROM public."racePerk" WHERE "perkId"=9 AND "raceId"=5);

-- Giants: extra strength and constitution, offset by weaker agility and running speed.
UPDATE public.perk SET effects=jsonb_set(effects,'{0,value}','10'::jsonb)
WHERE id=29 AND name='Brazo de era'
 AND EXISTS(SELECT 1 FROM public."racePerk" WHERE "perkId"=29 AND "raceId"=11);
UPDATE public.perk SET effects=jsonb_set(effects,'{0,value}','12'::jsonb)
WHERE id=30 AND name='Voz de cordillera'
 AND EXISTS(SELECT 1 FROM public."racePerk" WHERE "perkId"=30 AND "raceId"=11);

CREATE TEMP TABLE race_balance_perks ("raceId" integer,name text,description text,effects jsonb) ON COMMIT DROP;
INSERT INTO race_balance_perks VALUES
  (1,'Instinto de supervivencia','Cuando ya no quedan caminos claros, una idea inesperada abre el siguiente.','[{"type":"STAT_BONUS","target":"INT","value":5,"element":"NEUTRAL"}]'::jsonb),
  (6,'Eco de escamas arcanas','El eco de antiguas tormentas permanece bajo la superficie de cada escama.','[{"type":"STAT_BONUS","target":"MAGIC_DEFENSE","value":5,"element":"FIRE"}]'::jsonb),
  (11,'Peso del mundo','Cada paso suyo se mide con un tiempo que las pequeñas sendas no comprenden.','[{"type":"STAT_BONUS","target":"AGI","value":-3,"element":"EARTH"},{"type":"STAT_BONUS","target":"RACE","value":-12,"element":"EARTH"}]'::jsonb),
  (17,'Camino de las alturas','Las rutas más largas se vuelven familiares cuando las dicta el horizonte.','[{"type":"STAT_BONUS","target":"RACE","value":8,"element":"AIR"}]'::jsonb);
INSERT INTO public.perk(name,description,probability,effects,stackable,"maxStacks",active)
 SELECT p.name,p.description,0,p.effects,false,1,true
 FROM race_balance_perks p WHERE NOT EXISTS(SELECT 1 FROM public.perk existing WHERE existing.name=p.name);
INSERT INTO public."racePerk"("raceId","perkId")
 SELECT p."raceId",e.id FROM race_balance_perks p JOIN public.perk e ON e.name=p.name
 WHERE NOT EXISTS(SELECT 1 FROM public."racePerk" rp WHERE rp."raceId"=p."raceId" AND rp."perkId"=e.id);

-- Backfill new race-granted perks for characters who already belong to the race.
INSERT INTO public."characterPerk"("characterId","perkId",source)
 SELECT c.id,p.id,'RACE'
 FROM race_balance_perks d
 JOIN public.perk p ON p.name=d.name
 JOIN public.character c ON c."raceId"=d."raceId"
 WHERE NOT EXISTS(SELECT 1 FROM public."characterPerk" cp WHERE cp."characterId"=c.id AND cp."perkId"=p.id);

CREATE TEMP TABLE race_balance_skills ("raceId" integer,name text,description text,category text,effect jsonb,"manaCost" integer,duration text,cooldown text) ON COMMIT DROP;
INSERT INTO race_balance_skills VALUES
  (1,'Segunda oportunidad','Cuando todo parece agotado, una vieja promesa humana vuelve a ponerse en pie.','SUPPORT','[{"type":"RESOURCE_BONUS","target":"HP","value":18,"targetKind":"SELF"}]'::jsonb,12,'Instantánea','Una vez por combate'),
  (6,'Escamas de los ancestros','Los filos encuentran una historia antigua escrita en un cuerpo que no se rinde.','PASSIVE','[{"type":"NARRATIVE","target":"OTHER","value":1,"element":"FIRE","description":"Protección natural de las escamas frente a cortes (narrativa; sin reducción automática de daño)."}]'::jsonb,0,'Instantánea','Sin cooldown'),
  (11,'Oído de la piedra','Los relatos del suelo llegan antes que los rumores del viento.','PASSIVE','[{"type":"NARRATIVE","target":"OTHER","value":1,"element":"EARTH","description":"Percibe vibraciones, pasos y movimientos a través de la tierra en contacto (narrativo)."}]'::jsonb,0,'Instantánea','Sin cooldown'),
  (16,'Duramen antiguo','El bosque ha aprendido a doblarse, pero recuerda la mordida del hacha y el fulgor de las brasas.','PASSIVE','[{"type":"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER","target":"BLUNT","value":50,"element":"NATURE"},{"type":"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER","target":"PIERCE","value":50,"element":"NATURE"},{"type":"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER","target":"FIRE","value":175,"element":"FIRE"}]'::jsonb,0,'Instantánea','Sin cooldown'),
  (17,'Salto del vendaval','Una ráfaga toma prestada su silueta y la deposita un poco más allá.','UTILITY','[{"type":"NARRATIVE","target":"OTHER","value":1,"element":"AIR","description":"Desplazamiento narrativo por corrientes de aire; pendiente de resolutor de desplazamiento."}]'::jsonb,8,'Instantánea','2 turnos');
INSERT INTO public."raceSkill"("raceId",name,description,category,effect,"manaCost","maintenanceCost",duration,cooldown,active)
 SELECT "raceId",name,description,category,effect,"manaCost",0,duration,cooldown,true
 FROM race_balance_skills s
 WHERE NOT EXISTS(SELECT 1 FROM public."raceSkill" prior WHERE prior."raceId"=s."raceId" AND prior.name=s.name);

COMMIT;
