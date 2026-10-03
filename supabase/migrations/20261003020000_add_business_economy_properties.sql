alter table public."item" add column if not exists "imagePath" text;
alter table public."business" add column if not exists "securityInvestment" integer not null default 0;
alter table public."business" add column if not exists "growthInvestment" integer not null default 0;

create table if not exists public."businessProduct" (
  "id" serial primary key,
  "businessId" integer not null references public."business"("id") on delete cascade,
  "itemId" integer not null references public."item"("id") on delete restrict,
  "purchasePrice" integer not null default 0,
  "salePrice" integer not null default 0,
  "stock" integer not null default 0,
  "active" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  unique ("businessId","itemId")
);
create index if not exists "businessProduct_businessId_active_idx" on public."businessProduct" ("businessId","active");

create table if not exists public."characterProperty" (
  "id" serial primary key,
  "characterId" integer not null references public."character"("id") on delete cascade,
  "itemId" integer not null references public."item"("id") on delete restrict,
  "businessId" integer references public."business"("id") on delete set null,
  "purchasePrice" integer not null default 0,
  "createdAt" timestamptz not null default now()
);
create index if not exists "characterProperty_characterId_idx" on public."characterProperty" ("characterId");
create index if not exists "characterProperty_itemId_idx" on public."characterProperty" ("itemId");

create table if not exists public."businessSubscriptionPlan" (
  "id" serial primary key,
  "businessId" integer not null references public."business"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "price" integer not null default 0,
  "intervalValue" integer not null default 1,
  "intervalUnit" text not null default 'MONTH',
  "active" boolean not null default true,
  "createdAt" timestamptz not null default now()
);
create index if not exists "businessSubscriptionPlan_businessId_active_idx" on public."businessSubscriptionPlan" ("businessId","active");

create table if not exists public."businessSubscription" (
  "id" serial primary key,
  "planId" integer not null references public."businessSubscriptionPlan"("id") on delete cascade,
  "characterId" integer not null references public."character"("id") on delete cascade,
  "active" boolean not null default true,
  "nextChargeAt" timestamptz not null,
  "lastChargedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);
create index if not exists "businessSubscription_characterId_active_idx" on public."businessSubscription" ("characterId","active");
create index if not exists "businessSubscription_nextChargeAt_active_idx" on public."businessSubscription" ("nextChargeAt","active");

create table if not exists public."businessInvestment" (
  "id" serial primary key,
  "businessId" integer not null references public."business"("id") on delete cascade,
  "type" text not null,
  "sourceType" text not null,
  "sourceCharacterId" integer references public."character"("id") on delete set null,
  "amount" integer not null,
  "createdAt" timestamptz not null default now()
);
create index if not exists "businessInvestment_businessId_type_idx" on public."businessInvestment" ("businessId","type");

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('item-images','item-images',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;