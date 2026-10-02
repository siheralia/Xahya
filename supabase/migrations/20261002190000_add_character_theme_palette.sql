alter table public."character"
  add column if not exists "themePalette" jsonb;
