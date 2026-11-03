ALTER TABLE public."Item"
 ADD COLUMN IF NOT EXISTS "weaponMode" text NOT NULL DEFAULT 'MELEE',
 ADD COLUMN IF NOT EXISTS "effectiveRangeMeters" double precision NOT NULL DEFAULT 1.5,
 ADD COLUMN IF NOT EXISTS "maximumRangeMeters" double precision NOT NULL DEFAULT 1.5,
 ADD COLUMN IF NOT EXISTS "throwable" boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS "throwRangeMeters" double precision NOT NULL DEFAULT 0;
ALTER TABLE public."Item"
 ADD CONSTRAINT item_weapon_ranges_valid CHECK (
 "weaponMode" IN ('MELEE','RANGED') AND
 "effectiveRangeMeters" > 0 AND
 "maximumRangeMeters" >= "effectiveRangeMeters" AND
 "throwRangeMeters" >= 0
);
