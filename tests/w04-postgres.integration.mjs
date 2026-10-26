import assert from "node:assert/strict";
import test from "node:test";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../prisma/contract.json" with { type: "json" };

const db = postgres({ contractJson, url: process.env.DATABASE_URL });

async function wager(characterId, bet, payout, failAudit = false) {
  try {
    return await db.transaction(async (tx) => {
      const plan = db.raw.sql`
        UPDATE public."characterResource"
        SET "money" = "money" + ${payout}, "karma" = "karma" - 1
        WHERE "characterId" = ${characterId}
          AND "money" >= ${bet}
          AND "karma" >= 1
          AND "money" + ${payout} BETWEEN -2147483648 AND 2147483647
      `.affectedCount().build();
      const { affectedRows } = await tx.execute(plan);
      if (affectedRows !== 1) return false;
      if (failAudit) throw new Error("SIMULATED_AUDIT_FAILURE");
      await tx.execute(db.raw.sql`
        INSERT INTO public."w04Audit" ("characterId") VALUES (${characterId})
      `.affectedCount().build());
      return true;
    });
  } catch (error) {
    if (failAudit && error.message === "SIMULATED_AUDIT_FAILURE") return false;
    throw error;
  }
}

test("W04: real ORM concurrent wagers never double-spend", async () => {
  const attempts = await Promise.all([wager(1, 80, -80), wager(1, 80, -80)]);
  assert.deepEqual(attempts.sort(), [false, true]);
  const resources = await db.orm.public.CharacterResource.where({ characterId: 1 }).first();
  assert.equal(Number(resources.money), 20);
  assert.equal(Number(resources.karma), 0);
  // Query the independent audit table through PostgreSQL's psql client.
  // This avoids relying on an undocumented raw SELECT result builder.
  const { execFileSync } = await import("node:child_process");
  const auditCount = execFileSync("psql", [
    process.env.DATABASE_URL,
    "-At", "-c",
    'SELECT count(*) FROM public."w04Audit" WHERE "characterId" = 1',
  ], { encoding: "utf8" }).trim();
  assert.equal(Number(auditCount), 1);
});

test("W04: transaction rollback on audit failure", async () => {
  assert.equal(await wager(2, 80, -80, true), false);
  const resources = await db.orm.public.CharacterResource.where({ characterId: 2 }).first();
  assert.equal(Number(resources.money), 100);
  assert.equal(Number(resources.karma), 1);
});
