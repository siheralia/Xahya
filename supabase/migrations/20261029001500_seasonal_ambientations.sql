create table if not exists public.seasonal_ambientations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 enabled boolean not null default false,
 starts_at timestamptz,
 ends_at timestamptz,
 layers jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint seasonal_layers_array check (jsonb_typeof(layers) = 'array'),
 constraint seasonal_dates_order check (starts_at is null or ends_at is null or starts_at < ends_at)
);
create unique index if not exists seasonal_only_one_enabled on public.seasonal_ambientations(enabled) where enabled = true;
alter table public.seasonal_ambientations enable row level security;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('seasonal-ambientations','seasonal-ambientations',true,5242880,array['image/webp','image/gif'])
on conflict (id) do nothing;
