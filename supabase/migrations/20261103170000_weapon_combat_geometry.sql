ALTER TABLE public.item
 ADD COLUMN IF NOT EXISTS "weaponMode" text NOT NULL DEFAULT 'MELEE',
 ADD COLUMN IF NOT EXISTS "effectiveRangeMeters" double precision NOT NULL DEFAULT 1.5,
 ADD COLUMN IF NOT EXISTS "maximumRangeMeters" double precision NOT NULL DEFAULT 1.5,
 ADD COLUMN IF NOT EXISTS "throwable" boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "throwRangeMeters" double precision NOT NULL DEFAULT 0;
ALTER TABLE public.item
 ADD CONSTRAINT item_weapon_ranges_valid CHECK (
 "weaponMode" IN ('MELEE','RANGED') AND
 "effectiveRangeMeters" > 0 AND
 "maximumRangeMeters" >= "effectiveRangeMeters" AND
 "throwRangeMeters" >= 0
);

-- Curated from the existing catalog's names, descriptions and subtypes.
-- Existing objects receive these values only during this initial schema migration.
-- Never modify attackType, rarity, effects, or descriptions.
WITH classified(id,mode,effective,maximum,can_throw,throw_range) AS (
 VALUES
 (1,'MELEE',1.6,1.9,false,0.0),
 (5,'MELEE',1.1,1.3,true,3.0),
 (6,'MELEE',0.9,1.1,true,4.0),
 (7,'MELEE',0.9,1.1,true,4.0),
 (8,'MELEE',1.3,1.5,false,0.0),
 (9,'MELEE',1.6,1.8,false,0.0),
 (10,'MELEE',1.9,2.1,false,0.0),
 (11,'MELEE',2.0,2.3,false,0.0),
 (12,'MELEE',1.2,1.4,true,4.0),
 (13,'MELEE',1.9,2.2,false,0.0),
 (14,'MELEE',1.7,1.9,false,0.0),
 (15,'MELEE',1.3,1.5,false,0.0),
 (16,'MELEE',2.4,2.7,true,7.0),
 (17,'MELEE',2.7,3.0,false,0.0),
 (18,'MELEE',2.6,2.9,false,0.0),
 (19,'MELEE',1.7,1.9,false,0.0),
 (20,'MELEE',1.6,1.8,false,0.0),
 (21,'MELEE',2.3,2.5,false,0.0),
 (22,'MELEE',0.8,1.0,false,0.0),
 (23,'RANGED',12.0,20.0,false,0.0),
 (24,'RANGED',22.0,35.0,false,0.0),
 (25,'RANGED',18.0,28.0,false,0.0),
 (26,'MELEE',0.9,1.1,true,4.0),
 (27,'MELEE',1.6,1.8,false,0.0),
 (28,'MELEE',1.9,2.1,false,0.0),
 (29,'MELEE',2.3,2.5,false,0.0),
 (30,'MELEE',0.8,1.0,false,0.0),
 (31,'MELEE',0.8,1.0,false,0.0),
 (32,'MELEE',2.4,2.7,false,0.0),
 (33,'MELEE',2.5,2.8,true,7.0),
 (92,'RANGED',10.0,16.0,false,0.0),
 (93,'MELEE',1.5,1.7,false,0.0),
 (94,'MELEE',1.5,1.7,false,0.0),
 (95,'MELEE',1.6,1.8,false,0.0),
 (97,'MELEE',1.4,1.6,false,0.0),
 (98,'MELEE',2.6,3.0,false,0.0),
 (99,'MELEE',3.3,3.8,false,0.0),
 (100,'MELEE',1.5,1.7,false,0.0),
 (102,'RANGED',20.0,32.0,false,0.0),
 (103,'MELEE',1.5,1.7,false,0.0),
 (104,'MELEE',2.5,2.8,false,0.0),
 (105,'MELEE',1.6,1.8,false,0.0),
 (108,'MELEE',1.2,1.4,false,0.0),
 (109,'MELEE',1.6,1.8,true,10.0),
 (110,'MELEE',2.0,2.3,true,6.0),
 (112,'MELEE',1.8,2.1,false,0.0),
 (114,'MELEE',1.9,2.2,false,0.0),
 (115,'MELEE',1.6,1.9,false,0.0),
 (116,'MELEE',1.7,2.0,false,0.0),
 (118,'MELEE',1.5,1.7,false,0.0),
 (120,'MELEE',1.8,2.1,false,0.0),
 (121,'MELEE',1.4,1.6,false,0.0),
 (123,'MELEE',2.0,2.3,false,0.0),
 (124,'MELEE',1.1,1.4,false,0.0),
 (132,'MELEE',0.7,0.9,false,0.0),
 (133,'MELEE',2.7,3.0,false,0.0)
)
UPDATE public.item AS i SET
 "weaponMode"=c.mode,
 "effectiveRangeMeters"=c.effective,
 "maximumRangeMeters"=c.maximum,
 "throwable"=c.can_throw,
 "throwRangeMeters"=c.throw_range
FROM classified c
WHERE i.id=c.id AND i."itemType"='WEAPON';
