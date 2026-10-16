-- Security hardening for tables that are accessed through Xahya's server-side ORM.
-- The application uses Clerk + server-side database access for these records; no browser
-- Supabase client usage was found for these tables. Keep service_role access unchanged.
-- Revoke direct PostgREST access from anon/authenticated and enable RLS as defense in depth.
BEGIN;
ALTER TABLE public."businessProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."characterProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."businessSubscriptionPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."businessSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."businessInvestment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."characterSkillState" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public."businessProduct",
  public."characterProperty",
  public."businessSubscriptionPlan",
  public."businessSubscription",
  public."businessInvestment",
  public."characterSkillState"
FROM PUBLIC, anon, authenticated;
COMMIT;
