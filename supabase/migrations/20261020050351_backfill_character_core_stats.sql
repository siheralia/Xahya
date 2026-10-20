-- Backfill every character's eight core basic stats into the unified per-character stat table.
-- Safe to rerun: values are synchronized from the current authoritative CharacterStat row.
insert into public."characterStatValue" ("characterId", "statKey", "value")
select cs."characterId", stat."statKey", stat.value
from public."characterStat" cs
cross join lateral (
  values
    ('strength', cs.strength),
    ('agility', cs.agility),
    ('constitution', cs.constitution),
    ('intelligence', cs.intelligence),
    ('wisdom', cs.wisdom),
    ('charisma', cs.charisma),
    ('spirit', cs.spirit),
    ('luck', cs.luck)
) as stat("statKey", value)
on conflict ("characterId", "statKey")
do update set "value" = excluded."value";
