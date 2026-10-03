alter table public."maze"
  add column if not exists "resettable" boolean not null default false;
