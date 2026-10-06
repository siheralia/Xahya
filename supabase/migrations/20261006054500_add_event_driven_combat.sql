-- Event-driven combat timeline. Combat advances only when an action is submitted.
CREATE TABLE IF NOT EXISTS public."combatSession" (
  "id" serial PRIMARY KEY,
  "playerCharacterId" integer NOT NULL,
  "npcName" text NOT NULL,
  "npcStats" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "currentTick" integer NOT NULL DEFAULT 0,
  "turn" integer NOT NULL DEFAULT 1,
  "activeActor" text NOT NULL DEFAULT 'PLAYER',
  "playerNextActionTick" integer,
  "npcNextActionTick" integer,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "lastAction" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "combatSession_playerCharacterId_fkey"
    FOREIGN KEY ("playerCharacterId") REFERENCES public."character"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "combatSession_playerCharacterId_status_idx"
  ON public."combatSession" ("playerCharacterId", "status");
