-- Roles, user-level salary accrual and auditable transfers.
-- No existing User.role values are changed by this migration.
CREATE TABLE IF NOT EXISTS "ManagedRole" (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#a1a1aa' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  "dailyPts" INTEGER NOT NULL DEFAULT 0 CHECK ("dailyPts" >= 0),
  "dailyKarma" INTEGER NOT NULL DEFAULT 0 CHECK ("dailyKarma" >= 0),
  "dailyMoney" INTEGER NOT NULL DEFAULT 0 CHECK ("dailyMoney" >= 0),
  "protected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "UserManagedRole" (
  "userId" INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "roleId" INTEGER NOT NULL REFERENCES "ManagedRole"(id) ON DELETE RESTRICT,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "roleId")
);
CREATE TABLE IF NOT EXISTS "UserSalaryWallet" (
  "userId" INTEGER PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  pts BIGINT NOT NULL DEFAULT 0 CHECK (pts >= 0),
  karma BIGINT NOT NULL DEFAULT 0 CHECK (karma >= 0),
  money BIGINT NOT NULL DEFAULT 0 CHECK (money >= 0),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "RoleSalaryAccrual" (
  id BIGSERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "roleId" INTEGER NOT NULL REFERENCES "ManagedRole"(id) ON DELETE RESTRICT,
  "salaryDate" DATE NOT NULL,
  pts INTEGER NOT NULL CHECK (pts >= 0),
  karma INTEGER NOT NULL CHECK (karma >= 0),
  money INTEGER NOT NULL CHECK (money >= 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("userId", "roleId", "salaryDate")
);
CREATE TABLE IF NOT EXISTS "SalaryTransfer" (
  id BIGSERIAL PRIMARY KEY,
  "requestKey" UUID NOT NULL UNIQUE,
  "userId" INTEGER NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  "characterId" INTEGER NOT NULL REFERENCES "character"(id) ON DELETE RESTRICT,
  pts BIGINT NOT NULL CHECK (pts >= 0),
  karma BIGINT NOT NULL CHECK (karma >= 0),
  money BIGINT NOT NULL CHECK (money >= 0),
  "balanceBefore" JSONB NOT NULL,
  "balanceAfter" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pts > 0 OR karma > 0 OR money > 0)
);
CREATE INDEX IF NOT EXISTS "RoleSalaryAccrual_user_date_idx" ON "RoleSalaryAccrual" ("userId", "salaryDate");
CREATE INDEX IF NOT EXISTS "SalaryTransfer_user_created_idx" ON "SalaryTransfer" ("userId", "createdAt");
INSERT INTO "ManagedRole" (slug,name,color,permissions,"protected")
VALUES
 ('admin','Administrador','#ef4444','{"*": ["*"]}',true),
 ('gm','Game Master','#a78bfa','{}',true),
 ('player','Usuario','#a1a1aa','{}',true)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO "UserManagedRole" ("userId","roleId")
SELECT u.id,r.id FROM "user" u JOIN "ManagedRole" r ON r.slug=lower(u.role)
WHERE u.role IN ('ADMIN','GM','PLAYER')
ON CONFLICT DO NOTHING;
-- Role assignments and salary changes must be audit-logged by server APIs.
-- Never expose direct client writes to these tables.
ALTER TABLE "ManagedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserManagedRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSalaryWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleSalaryAccrual" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalaryTransfer" ENABLE ROW LEVEL SECURITY;
