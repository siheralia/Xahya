ALTER TABLE public."ruleSection"
  ADD COLUMN IF NOT EXISTS "backgroundPath" text,
  ADD COLUMN IF NOT EXISTS "bannerPath" text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('rule-images', 'rule-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE public."ruleSection" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ruleSection_public_read" ON public."ruleSection";
CREATE POLICY "ruleSection_public_read"
  ON public."ruleSection"
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public."ruleSection" TO anon, authenticated;
