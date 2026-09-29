create table if not exists public."perk" (
  "id" serial primary key,
  "name" text not null,
  "description" text,
  "probability" numeric not null default 0,
  "effects" jsonb not null default '[]'::jsonb,
  "stackable" boolean not null default true,
  "maxStacks" integer,
  "active" boolean not null default true,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."characterPerk" (
  "id" serial primary key,
  "characterId" integer not null references public."character"(id) on delete cascade,
  "perkId" integer not null references public."perk"(id) on delete restrict,
  "source" text not null default 'MANUAL',
  "createdAt" timestamptz not null default now()
);

create index if not exists "characterPerk_characterId_idx" on public."characterPerk" ("characterId");
create index if not exists "characterPerk_perkId_idx" on public."characterPerk" ("perkId");

insert into public."perk" ("name","description","probability","effects","stackable","maxStacks","active")
values
('Nada','No obtiene ningún beneficio.',50,'[]'::jsonb,true,null,true),
('Mana Masivo','Aumenta el Mana máximo en 100.',8,'[{"type":"RESOURCE_BONUS","target":"MANA","value":100}]'::jsonb,true,null,true),
('HP Masivo','Aumenta el HP máximo en 100.',8,'[{"type":"RESOURCE_BONUS","target":"HP","value":100}]'::jsonb,true,null,true),
('Puntos Extras','Otorga 5 Puntos de Level Up.',10,'[{"type":"RESOURCE_BONUS","target":"LEVEL_UP_POINTS","value":5}]'::jsonb,true,null,true),
('Dinero Extra','Otorga 500 de dinero.',15,'[{"type":"RESOURCE_BONUS","target":"MONEY","value":500}]'::jsonb,true,null,true),
('Karma Extra','Otorga 1 de Karma.',9,'[{"type":"RESOURCE_BONUS","target":"KARMA","value":1}]'::jsonb,true,null,true),
('Doble arma principal','Permite equipar 2 objetos simultáneamente en Mano principal.',5,'[{"type":"EQUIPMENT_SLOT_CAP","target":"MAIN_HAND","value":2}]'::jsonb,false,1,true)
on conflict do nothing;
