import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const use=readFileSync(new URL("../app/api/characters/[id]/items/use/route.ts",import.meta.url),"utf8");
const sheet=readFileSync(new URL("../app/characters/[id]/page.tsx",import.meta.url),"utf8");
const pch=readFileSync(new URL("../lib/skills/pch.ts",import.meta.url),"utf8");

test("upgrade currency grants one improvement credit plus five spendable PCH, atomically",()=>{
  const start=use.indexOf('if (action === "IMPROVE_SKILL")');
  const end=use.indexOf('if (action === "CREATE_SKILL")');
  assert.ok(start>=0&&end>start);
  const improve=use.slice(start,end);
  assert.match(improve,/await db\.transaction\(async \(tx\) =>/);
  assert.match(improve,/SET "skillUpgradeCredits" = "skillUpgradeCredits" \+ 1,/);
  assert.match(improve,/"pchBalance" = "pchBalance" \+ \$\{PCH_PER_UPGRADE_COIN\}/);
  assert.match(improve,/if \(\(await tx\.execute\(consume\)\)\.affectedRows !== 1\)/);
  assert.match(improve,/pchGranted: PCH_PER_UPGRADE_COIN/);
  assert.match(pch,/PCH_PER_UPGRADE_COIN = 5/);
});

test("sheet refreshes character PCH and informs player about both grants",()=>{
  assert.match(sheet,/setSkillUpgradeCredits\(current => current \+ Number\(data\.upgradeCreditsGranted \?\? 1\)\)/);
  assert.match(sheet,/setPchBalance\(Number\(data\.pchBalance/);
  assert.match(sheet,/Recibiste 1 crédito de mejora y 5 PCH/);
});
