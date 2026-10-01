alter table public."Maze"
  add column if not exists "allowTraps" boolean not null default true,
  add column if not exists "allowDeath" boolean not null default true,
  add column if not exists "allowTreasures" boolean not null default true;
