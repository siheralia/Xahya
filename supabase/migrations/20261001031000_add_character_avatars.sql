alter table public."character" add column if not exists "avatarPath" text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character-avatars',
  'character-avatars',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];