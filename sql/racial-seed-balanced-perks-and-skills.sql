-- Racial catalog: seed only races without linked perks. Intentionally leaves existing races untouched.
-- Two modest permanent perks (7 + 5 basic stat points) and a short cooldown-gated racial buff per missing race.
-- Narrative descriptions intentionally do not expose numerical mechanics.
-- Prerequisite: sql/racial-skill-duration-support.sql
BEGIN;
CREATE TEMP TABLE racial_seed_perks ("raceId" integer,name text,description text,target text,amount integer,element text) ON COMMIT DROP;
INSERT INTO racial_seed_perks VALUES
  (6,'Legado de escamas','Bajo sus placas perduran las huellas de generaciones que aprendieron a atravesar las tormentas.','CON',7,'FIRE'),
  (6,'Sangre antigua','Algo muy antiguo aún responde cuando las voces del linaje se encuentran.','SPI',5,'FIRE'),
  (7,'Gracia del umbral','Sus palabras parecen hallar senderos donde otros solo ven puertas cerradas.','CHA',7,'NATURE'),
  (7,'Eco del vergel','El rumor de los jardines olvidados acompaña incluso a quienes nunca los han pisado.','SPI',5,'NATURE'),
  (8,'Juramento de clan','Cuando se alzan por los suyos, cada paso lleva el peso de antiguos acuerdos.','STR',7,'NEUTRAL'),
  (8,'Piedra de corazón','Las largas travesías han enseñado a su pueblo a guardar silencio ante el dolor.','CON',5,'NEUTRAL'),
  (9,'Chispa de taller','Las ideas llegan como chispas entre piezas imposibles de clasificar.','INT',7,'LIGHTNING'),
  (9,'Dedos inquietos','Pocas cosas permanecen inmóviles cuando un taller goblin despierta.','AGI',5,'LIGHTNING'),
  (10,'Memoria de mareas','En sus cantos persisten rutas que las cartas náuticas dejaron de mostrar.','WIS',7,'WATER'),
  (10,'Pulso de abismo','El océano enseña a escuchar los ritmos que la superficie desconoce.','CON',5,'WATER'),
  (11,'Voz de cordillera','Sus relatos tardan en comenzar, como montañas que eligen cuándo hablar.','CON',7,'EARTH'),
  (11,'Brazo de era','Las grandes obras guardan el eco paciente de innumerables manos.','STR',5,'EARTH'),
  (12,'Máscaras heredadas','Cada rostro conserva algo de los caminos que condujeron a los anteriores.','AGI',7,'NEUTRAL'),
  (12,'Instinto errante','Los recuerdos más útiles rara vez llegan en forma de palabras.','WIS',5,'NEUTRAL'),
  (13,'Núcleo primordial','En su interior late una cadencia que precede a los primeros nombres.','SPI',7,'NEUTRAL'),
  (13,'Ritmo del ciclo','Las estaciones les hablan en un lenguaje distinto al de los calendarios.','CON',5,'NEUTRAL'),
  (14,'Eco del firmamento','El cielo conserva constelaciones que solo sus sueños saben recorrer.','SPI',7,'HOLY'),
  (14,'Fulgor sereno','Hay presencias capaces de volver solemne hasta el silencio más sencillo.','CHA',5,'HOLY'),
  (15,'Mirada de penumbra','Donde termina el día comienzan historias que solo ellos acostumbran escuchar.','WIS',7,'SHADOW'),
  (15,'Pisada sin eco','Sus caminos se dibujan junto a los márgenes de la luz.','AGI',5,'SHADOW'),
  (16,'Raíces antiguas','La tierra recuerda a quienes han compartido con ella cada estación.','CON',7,'NATURE'),
  (16,'Calendario de savia','Aprendieron a contar los años con señales que no aparecen en los relojes.','WIS',5,'NATURE'),
  (17,'Brújula del cielo','Cada horizonte parece señalarles una ruta todavía no recorrida.','AGI',7,'AIR'),
  (17,'Oído de corrientes','En el murmullo de las alturas reconocen historias que llegan de muy lejos.','WIS',5,'AIR');
CREATE TEMP TABLE racial_seed_skills ("raceId" integer,name text,description text,target text,element text) ON COMMIT DROP;
INSERT INTO racial_seed_skills VALUES
  (6,'Guardia del linaje','Las escamas parecen recordar una coraza que ninguna fragua logró fabricar.','PHYSICAL_DEFENSE','FIRE'),
  (7,'Danza de rocío','Un giro leve desdibuja la silueta entre destellos y hojas suspendidas.','DODGE','NATURE'),
  (8,'Paso de guerra','El estruendo de la marcha se apaga ante una postura que no admite retroceso.','PHYSICAL_DEFENSE','NEUTRAL'),
  (9,'Cálculo fugaz','Por un instante, todos los engranajes parecen encajar en el sitio correcto.','PRECISION','LIGHTNING'),
  (10,'Manto de sal','La corriente dibuja un círculo de espuma alrededor de quien recuerda su hogar.','MAGIC_DEFENSE','WATER'),
  (11,'Pies de montaña','El suelo reconoce una presencia tan antigua como sus propias grietas.','PHYSICAL_DEFENSE','EARTH'),
  (12,'Reflejo prestado','La silueta parece desplazarse antes de que el mundo decida dónde mirarla.','DODGE','NEUTRAL'),
  (13,'Pulso del núcleo','El latido de la materia responde durante un instante al llamado de su origen.','MAGIC_ATTACK','NEUTRAL'),
  (14,'Plegaria estelar','Un resplandor distante envuelve el lugar como una promesa sin palabras.','MAGIC_DEFENSE','HOLY'),
  (15,'Sombra fugaz','Las sombras se superponen y nadie sabe cuál de ellas estuvo allí primero.','DODGE','SHADOW'),
  (16,'Corteza despierta','La corteza cobra la quietud solemne de un bosque que contiene el aliento.','PHYSICAL_DEFENSE','NATURE'),
  (17,'Paso del vendaval','El aire acompaña un movimiento tan breve que apenas deja huella.','DODGE','AIR');
CREATE TEMP TABLE racial_missing AS
 SELECT r.id FROM public.race r
 WHERE r.id BETWEEN 6 AND 17
 AND NOT EXISTS (SELECT 1 FROM public."racePerk" rp WHERE rp."raceId" = r.id);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM racial_seed_perks p JOIN racial_missing r ON r.id=p."raceId"
   JOIN public.perk e ON e.name=p.name) THEN
  RAISE EXCEPTION 'A racial perk name already exists. No changes applied.';
 END IF;
 IF EXISTS(SELECT 1 FROM racial_seed_skills s JOIN racial_missing r ON r.id=s."raceId"
   JOIN public."raceSkill" e ON e.name=s.name AND e."raceId"=s."raceId") THEN
  RAISE EXCEPTION 'A racial skill already exists. No changes applied.';
 END IF;
END $$;
INSERT INTO public.perk(name,description,probability,effects,stackable,"maxStacks",active)
 SELECT p.name,p.description,0,jsonb_build_array(jsonb_build_object(
 'type','STAT_BONUS','value',p.amount,'target',p.target,'element',p.element)),false,1,true
 FROM racial_seed_perks p JOIN racial_missing r ON r.id=p."raceId";
INSERT INTO public."racePerk"("raceId","perkId")
 SELECT r.id,p.id FROM racial_seed_perks data JOIN racial_missing r ON r.id=data."raceId"
 JOIN public.perk p ON p.name=data.name
 ON CONFLICT DO NOTHING;
INSERT INTO public."raceSkill"("raceId",name,description,category,effect,"manaCost","maintenanceCost",duration,cooldown,active)
 SELECT r.id,s.name,s.description,'SUPPORT',
 jsonb_build_array(jsonb_build_object('type','STAT_BONUS','target',s.target,
  'value',5,'element',s.element,'targetKind','SELF','durationTurns',1)),
 14,0,'1 turno','3 turnos',true
 FROM racial_seed_skills s JOIN racial_missing r ON r.id=s."raceId"
 ON CONFLICT ("raceId",name) DO NOTHING;
COMMIT;
