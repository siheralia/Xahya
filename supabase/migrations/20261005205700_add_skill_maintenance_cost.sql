alter table public."skill"
  add column if not exists "maintenanceCost" integer not null default 0;
