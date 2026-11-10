import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PCH_PER_COIN,PCH_PER_UPGRADE_COIN} from "../lib/skills/pch.ts";
import {quoteSkillPchBudget} from "../lib/skills/pch-budget-feedback.ts";

test("D4.5: one creation coin gives 10 PCH, not an absolute cap per skill",()=>{
 assert.equal(PCH_PER_COIN,10);
 const single=quoteSkillPchBudget({total:4,balance:10,provisional:true});
 assert.ok(single);
 assert.equal(single.payable,4);
 assert.equal(single.remaining,6);
 assert.equal(single.shortfall,0);
 assert.equal(single.coinsWorth,1);
 assert.equal(single.singleCoinRemainder,6);
 assert.equal(single.referenceCoinPch,10);
 assert.equal(single.provisional,true);
 const exact=quoteSkillPchBudget({total:10,balance:10});
 assert.equal(exact?.remaining,0);
 assert.equal(exact?.affordable,true);
 const over=quoteSkillPchBudget({total:11,balance:10});
 assert.equal(over?.shortfall,1);
 assert.equal(over?.coinsWorth,2);
 assert.equal(over?.affordable,false);
 assert.equal(over?.singleCoinRemainder,null);
 const accumulated=quoteSkillPchBudget({total:21,balance:25});
 assert.equal(accumulated?.affordable,true);
 assert.equal(accumulated?.remaining,4);
});

test("D4.5: upgrade costs only the positive increment; coin grants five PCH",()=>{
 assert.equal(PCH_PER_UPGRADE_COIN,5);
 const upgrade=quoteSkillPchBudget({total:27,baseline:22,balance:5});
 assert.equal(upgrade?.payable,5);
 assert.equal(upgrade?.referenceCoinPch,5);
 assert.equal(upgrade?.coinsWorth,1);
 assert.equal(upgrade?.remaining,0);
 assert.equal(upgrade?.requiresIncreasedPrice,false);
 const larger=quoteSkillPchBudget({total:30,baseline:22,balance:5});
 assert.equal(larger?.payable,8);
 assert.equal(larger?.shortfall,3);
 assert.equal(larger?.coinsWorth,2);
 const invalidUpgrade=quoteSkillPchBudget({total:30,baseline:30,balance:5});
 assert.equal(invalidUpgrade?.payable,0);
 assert.equal(invalidUpgrade?.requiresIncreasedPrice,true);
});

test("D4.5: never present invalid numeric amounts as valid balances",()=>{
 assert.equal(quoteSkillPchBudget({total:Number.NaN,balance:10}),null);
 assert.equal(quoteSkillPchBudget({total:-1,balance:10}),null);
 assert.equal(quoteSkillPchBudget({total:5,balance:-1}),null);
 assert.equal(quoteSkillPchBudget({total:1,baseline:1.4,balance:10}),null);
 assert.equal(quoteSkillPchBudget({total:5})?.affordable,null);
});

test("D4.5: UI exposes affordability, provisional review and mobile-safe dialog",()=>{
 const modal=readFileSync(new URL("../components/skills/SkillFormModal.tsx",import.meta.url),"utf8");
 const character=readFileSync(new URL("../app/characters/[id]/page.tsx",import.meta.url),"utf8");
 const management=readFileSync(new URL("../app/management/skills/page.tsx",import.meta.url),"utf8");
 assert.match(modal,/quoteSkillPchBudget\(pch\)/);
 assert.match(modal,/Una moneda de creación aporta 10 PCH/);
 assert.match(modal,/Una moneda de mejora aporta 5 PCH/);
 assert.match(modal,/Faltan \{budget.shortfall\} PCH/);
 assert.match(modal,/Reserva provisional: administración confirmará/);
 assert.match(modal,/A pagar: \{budget.payable\} PCH/);
 assert.match(modal,/max-h-\[90dvh\]/);
 assert.match(modal,/max-h-\[85dvh\]/);
 assert.match(modal,/overflow-x-hidden/);
 for(const code of [character,management])
  assert.match(code,/provisional:\w+\.effect\.some\(e=>e\.type==="COMPOSED"/);
 assert.match(character,/balance:pchBalance/);
 assert.match(character,/pchBalance < \(upgradingSkill\?/);
});
