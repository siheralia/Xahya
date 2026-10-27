import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const url = process.env.DATABASE_URL;
async function sql(query) {
  const { stdout } = await run("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query]);
  return stdout.trim();
}
async function coin(id, characterId, failAudit = false) {
  const result = await sql(`BEGIN;
WITH spent AS (
 UPDATE public."pchTestCoin" SET quantity=quantity-1
 WHERE id=${id} AND "characterId"=${characterId} AND quantity>=1 RETURNING "characterId"
), credited AS (
 UPDATE public."pchTestCharacter" SET "pchBalance"="pchBalance"+10
 WHERE id IN (SELECT "characterId" FROM spent) RETURNING id
)
SELECT count(*) FROM credited;
${failAudit ? "INSERT INTO public.\"pchTestAudit\"(action,\"characterId\") VALUES ('GRANT',"+characterId+"); SELECT 1/0;" : "INSERT INTO public.\"pchTestAudit\"(action,\"characterId\") SELECT 'GRANT',"+characterId+" WHERE (SELECT quantity FROM public.\"pchTestCoin\" WHERE id="+id+")=0;"}
COMMIT;`);
  return result;
}
async function skill(characterId, failAudit = false) {
  return sql(`BEGIN;
WITH debited AS (
 UPDATE public."pchTestCharacter" SET "pchBalance"="pchBalance"-10
 WHERE id=${characterId} AND "pchBalance">=10 RETURNING id
), created AS (
 INSERT INTO public."pchTestSkill"("characterId","pchCost")
 SELECT id,10 FROM debited RETURNING id
)
SELECT count(*) FROM created;
${failAudit ? "SELECT 1/0;" : "INSERT INTO public.\"pchTestAudit\"(action,\"characterId\") SELECT 'SKILL',"+characterId+" WHERE EXISTS (SELECT 1 FROM public.\"pchTestSkill\" WHERE \"characterId\"="+characterId+");"}
COMMIT;`);
}
test("PCH PostgreSQL: parallel coin grants cannot double-spend", async () => {
 const results = await Promise.all([coin(1,1),coin(1,1)]);
 assert.deepEqual(results.map(x=>Number(x.split("\n").find(y=>/^[01]$/.test(y)))).sort(),[0,1]);
 assert.equal(await sql('SELECT "pchBalance" FROM public."pchTestCharacter" WHERE id=1'),"10");
 assert.equal(await sql('SELECT quantity FROM public."pchTestCoin" WHERE id=1'),"0");
});
test("PCH PostgreSQL: parallel skill creation cannot overdraw", async () => {
 const results=await Promise.all([skill(2),skill(2)]);
 assert.deepEqual(results.map(x=>Number(x.split("\n").find(y=>/^[01]$/.test(y)))).sort(),[0,1]);
 assert.equal(await sql('SELECT "pchBalance" FROM public."pchTestCharacter" WHERE id=2'),"0");
 assert.equal(await sql('SELECT count(*) FROM public."pchTestSkill" WHERE "characterId"=2'),"1");
});
test("PCH PostgreSQL: failed skill audit rolls back debit and creation", async () => {
 await assert.rejects(skill(3,true));
 assert.equal(await sql('SELECT "pchBalance" FROM public."pchTestCharacter" WHERE id=3'),"10");
 assert.equal(await sql('SELECT count(*) FROM public."pchTestSkill" WHERE "characterId"=3'),"0");
});
test("PCH PostgreSQL: failed coin audit rolls back grant and consumption", async () => {
 await assert.rejects(coin(2,4,true));
 assert.equal(await sql('SELECT "pchBalance" FROM public."pchTestCharacter" WHERE id=4'),"0");
 assert.equal(await sql('SELECT quantity FROM public."pchTestCoin" WHERE id=2'),"1");
});
