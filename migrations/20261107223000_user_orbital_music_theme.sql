-- Each authenticated player can save one personal combat soundtrack.
-- No music is stored on combat sessions, so turn transactions stay unchanged.
ALTER TABLE public."user"
  ADD COLUMN IF NOT EXISTS "musicTheme" jsonb;
