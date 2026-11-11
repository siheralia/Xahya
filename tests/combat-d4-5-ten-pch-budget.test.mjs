import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PCH_PER_COIN,PCH_PER_UPGRADE_COIN} from "../lib/skills/pch.ts";
import {skillPchBudgetQuote} from "../lib/skills/pch-budget.ts";
import {
 microRestrictionQuote,NEW_MODULAR_DISCOUNT_VERSION,
} from "../lib/skills/micro-restriction-pricing.ts";
import {
 composedDepositPch,composedEffectBasePch,previewComposedEffectBasePch,
 stampReviewedRestrictionPricing,validateComposedSkillList,
} from "../lib/skills/composed-effects.ts";
import {validateEffectContainers} from "../lib/effects/micro-modules.ts";

const low=(percentage=20)=>({
 left:{source:"STAT",key:"HP"},compare:"LTE",
 right:{operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},percentage]},
});
const graph=(steps=[{kind:"HEAL",amount:10}],requirements=[low()])=>({
 id:"BUDGET_D45",name:"Curación condicionada",type:"COMPOSED",
 description:"Solo al estar herido",trigger:"ACTIVATE",requirements,steps,
});
const entry=(module,reviewedPch,restrictionPricing)=>({
 type:"COMPOSED",module,
 ...(reviewedPch===undefined?{}:{reviewedPch}),
 ...(restrictionPricing===undefined?{}:{restrictionPricing}),
});

test("D4.5: one creation coin really means ten cumulative PCH, not a maximum skill cost",()=>{
 assert.equal(PCH_PER_COIN,10);
 assert.equal(PCH_PER_UPGRADE_COIN,5);
 assert.deepEqual(skillPchBudgetQuote(10,10),{
  due:10,balance:10,missing:0,affordable:true,creationCoinsEquivalent:0,
 });
 assert.deepEqual(skillPchBudgetQuote(11,10),{
  due:11,balance:10,missing:1,affordable:false,creationCoinsEquivalent:1,
 });
 assert.equal(skillPchBudgetQuote(25,10).creationCoinsEquivalent,2);
 assert.equal(skillPchBudgetQuote(25,30).affordable,true);
 assert.equal(skillPchBudgetQuote(20,5,15).due,5,
  "upgrades/specializations pay the increment, not full cost again");
 assert.equal(skillPchBudgetQuote(20,5,15).affordable,true);
 assert.equal(skillPchBudgetQuote(20,0,25).due,0);
});

test("D4.5: V2 makes real low-health restriction visible at a 5-PCH step",()=>{
 const module=graph();
 assert.equal(validateEffectContainers([module]),null);
 assert.equal(microRestrictionQuote(module,5,"V1").discountPch,0,
  "past approved V1 amounts are not recalculated");
 const v2=microRestrictionQuote(module,5,"V2");
 assert.equal(v2.discountPch,1);
 assert.equal(v2.finalPch,4);
 assert.equal(composedDepositPch(entry(module)),4,
  "one affordable conditional action should be available below a 10 PCH coin");
 const approved=entry(module,5,"V2");
 assert.equal(validateComposedSkillList([approved],"REVIEW"),null);
 assert.equal(composedEffectBasePch(approved),4);
 assert.equal(previewComposedEffectBasePch(approved).amount,4);
});

test("D4.5: versioned prices are stable, and only staff can assign V2",()=>{
 const module=graph();
 assert.equal(NEW_MODULAR_DISCOUNT_VERSION,"V2");
 assert.equal(composedEffectBasePch(entry(module,5)),5,
  "old approved row without version retains its reviewed price");
 assert.equal(composedEffectBasePch(entry(module,5,"V1")),5);
 assert.equal(composedEffectBasePch(entry(module,5,"V2")),4);
 assert.equal(previewComposedEffectBasePch(entry(module,5)).amount,5);
 assert.equal(previewComposedEffectBasePch(entry(module,5),{forApproval:true}).amount,4);
 const [stamped]=stampReviewedRestrictionPricing([entry(module,5,"V1")]);
 assert.equal(stamped.restrictionPricing,"V2");
 assert.equal(composedEffectBasePch(stamped),4);
 assert.match(validateComposedSkillList([stamped],"PLAYER"),/solo puede/);
 assert.throws(()=>composedDepositPch(stamped),/precio o descuento/);
 assert.match(validateComposedSkillList([entry(module,5,"V3")],"REVIEW"),/Versión/);
});

test("D4.5: rounded discounts obey 30% cap and never turn a paid skill into a free one",()=>{
 const withContact=graph([
  {kind:"SELECT_TARGET",selector:"OPPONENT",output:"other"},
  {kind:"REQUIRE_CONTACT",target:{source:"OUTPUT",key:"other"}},
  {kind:"HEAL",amount:10},
 ]);
 assert.equal(validateEffectContainers([withContact]),null);
 assert.equal(microRestrictionQuote(withContact,5,"V2").discountPch,1);
 assert.equal(microRestrictionQuote(withContact,10,"V2").discountPch,3);
 assert.equal(microRestrictionQuote(withContact,5,"V2").finalPch,4);
 const unsafe=graph([{kind:"HEAL",amount:10}],[]);
 assert.equal(microRestrictionQuote(unsafe,5,"V2").discountPch,0);
 for(const base of [1,2,3,4,5,6,9,10,12,20,50,100]){
  const discount=microRestrictionQuote(withContact,base,"V2");
  assert.ok(discount.discountPch<=Math.floor(base*0.3));
  assert.ok(discount.finalPch>=1);
  assert.equal(discount.contactDiscountPch+discount.lowHealthDiscountPch,discount.discountPch);
 }
});

test("D4.5: mobile creation editor shows balance and missing money without changing purchases",()=>{
 const modal=readFileSync(new URL("../components/skills/SkillFormModal.tsx",import.meta.url),"utf8");
 const server=readFileSync(new URL("../app/api/characters/[id]/items/use/route.ts",import.meta.url),"utf8");
 const management=readFileSync(new URL("../app/api/management/skills/[id]/route.ts",import.meta.url),"utf8");
 const player=readFileSync(new URL("../app/characters/[id]/page.tsx",import.meta.url),"utf8");
 assert.match(server,/pchBalance" = "pchBalance" \+ \$\{PCH_PER_COIN\}/);
 assert.match(modal,/Saldo disponible:/);
 assert.match(modal,/Faltan /);
 assert.match(modal,/PCH_PER_COIN/);
 assert.match(modal,/min-w-0 max-w-full whitespace-normal break-words/);
 assert.match(modal,/p-2 sm:p-4/);
 assert.match(modal,/overflow-x-hidden/);
 assert.match(modal,/role="status"/);
 assert.match(player,/pchBalance < \(upgradingSkill\?/);
 assert.match(management,/stampReviewedRestrictionPricing\(effect\)/);
});
