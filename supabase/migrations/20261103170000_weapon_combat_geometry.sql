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
WITH classified(item_name,mode,effective,maximum,can_throw,throw_range) AS (
 VALUES
 ('Ispātatalavāra','MELEE',1.6,1.9,false,0.0),
 ('Rama de árbol','MELEE',1.1,1.3,true,3.0),
 ('Daga de Hierro','MELEE',0.9,1.1,true,4.0),
 ('Daga de Acero','MELEE',0.9,1.1,true,4.0),
 ('Espada Corta','MELEE',1.3,1.5,false,0.0),
 ('Espada Larga','MELEE',1.6,1.8,false,0.0),
 ('Espadón','MELEE',1.9,2.1,false,0.0),
 ('Mandoble de Acero Negro','MELEE',2.0,2.3,false,0.0),
 ('Hacha de Mano','MELEE',1.2,1.4,true,4.0),
 ('Hacha de Guerra','MELEE',1.9,2.2,false,0.0),
 ('Martillo de Guerra','MELEE',1.7,1.9,false,0.0),
 ('Maza de Hierro','MELEE',1.3,1.5,false,0.0),
 ('Lanza','MELEE',2.4,2.7,true,7.0),
 ('Alabarda','MELEE',2.7,3.0,false,0.0),
 ('Guja','MELEE',2.6,2.9,false,0.0),
 ('Estoque','MELEE',1.7,1.9,false,0.0),
 ('Katana','MELEE',1.6,1.8,false,0.0),
 ('Bastón de Combate','MELEE',2.3,2.5,false,0.0),
 ('Guanteletes de Combate','MELEE',0.8,1.0,false,0.0),
 ('Arco Corto','RANGED',12.0,20.0,false,0.0),
 ('Arco Largo','RANGED',22.0,35.0,false,0.0),
 ('Ballesta','RANGED',18.0,28.0,false,0.0),
 ('Daga Arcana','MELEE',0.9,1.1,true,4.0),
 ('Espada Rúnica','MELEE',1.6,1.8,false,0.0),
 ('Báculo de Aprendiz','MELEE',1.9,2.1,false,0.0),
 ('Báculo de Archimago','MELEE',2.3,2.5,false,0.0),
 ('Varita Arcana','MELEE',0.8,1.0,false,0.0),
 ('Orbe del Hechicero','MELEE',0.8,1.0,false,0.0),
 ('Guadaña Arcana','MELEE',2.4,2.7,false,0.0),
 ('Lanza Elemental','MELEE',2.5,2.8,true,7.0),
 ('Ballesta de Mano','RANGED',10.0,16.0,false,0.0),
 ('Sable de Acero','MELEE',1.5,1.7,false,0.0),
 ('Sable Real','MELEE',1.5,1.7,false,0.0),
 ('Rapier','MELEE',1.6,1.8,false,0.0),
 ('Maza de Guerra','MELEE',1.4,1.6,false,0.0),
 ('Látigo','MELEE',2.6,3.0,false,0.0),
 ('Pica','MELEE',3.3,3.8,false,0.0),
 ('Sable Militar','MELEE',1.5,1.7,false,0.0),
 ('Arco Compuesto','RANGED',20.0,32.0,false,0.0),
 ('Sable','MELEE',1.5,1.7,false,0.0),
 ('Naginata','MELEE',2.5,2.8,false,0.0),
 ('Cimitarra','MELEE',1.6,1.8,false,0.0),
 ('Wakizashi','MELEE',1.2,1.4,false,0.0),
 ('Jabalina','MELEE',1.6,1.8,true,10.0),
 ('Tridente','MELEE',2.0,2.3,true,6.0),
 ('Mangual','MELEE',1.8,2.1,false,0.0),
 ('Claymore','MELEE',1.9,2.2,false,0.0),
 ('Falchion','MELEE',1.6,1.9,false,0.0),
 ('Espada Bastarda','MELEE',1.7,2.0,false,0.0),
 ('Sable del Duelista','MELEE',1.5,1.7,false,0.0),
 ('Martillo de Guerra Pesado','MELEE',1.8,2.1,false,0.0),
 ('Estrella de la Mañana','MELEE',1.4,1.6,false,0.0),
 ('Nodachi','MELEE',2.0,2.3,false,0.0),
 ('Abanico divino','MELEE',1.1,1.4,false,0.0),
 ('El Cid','MELEE',0.7,0.9,false,0.0),
 ('Guadaña del Alba Soberana','MELEE',2.7,3.0,false,0.0)
)
UPDATE public.item AS i SET
 "weaponMode"=c.mode,
 "effectiveRangeMeters"=c.effective,
 "maximumRangeMeters"=c.maximum,
 "throwable"=c.can_throw,
 "throwRangeMeters"=c.throw_range
FROM classified c
WHERE i.name=c.item_name AND i."itemType"='WEAPON';
