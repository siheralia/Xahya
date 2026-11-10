import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 microRestrictionQuote,pricedMicroStepCount,
} from "../lib/skills/micro-restriction-pricing.ts";
import {
 composedEffectBasePch,composedDepositPch,previewComposedEffectBasePch,
 validateComposedSkillList,stampReviewedRestrictionPricing,
} from "../lib/skills/composed-effects.ts";
import {executeMicroEvent,emptyMicroState,validateEffectContainers} from "../lib/effects/micro-modules.ts";
import {configuredSkillEffectPch} from "../lib/skills/configured-effect-pricing.ts";
import {defaultEffectPricing} from "../lib/skills/pch.ts";
import {DEFAULT_DURATION_PRICING} from "../lib/effects/duration-pricing.ts";

const out=(key)=>({source:"OUTPUT",key});
const contact=(selector="OPPONENT",when)=>[
 {kind:"SELECT_TARGET",selector,output:"chosen"},
 {kind:"REQUIRE_CONTACT",target:out("chosen"),...(when?{when}: {})},
];
const lowHealth=(percent=20)=>({
 left:{source:"STAT",key:"HP"},compare:"LTE",
 right:{operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},percent]},
});
const effect=(steps,requirements=[])=>({
 id:"RESTRICTED_TEST",name:"Técnica limitada",type:"COMPOSED",
 description:"Solo en circunstancias especiales",trigger:"ACTIVATE",requirements,steps,
});
const healing=()=>({kind:"HEAL",amount:12});
const wrapped=(module,reviewedPch,restrictionPricing)=>({
 type:"COMPOSED",module,
 ...(reviewedPch!==undefined?{reviewedPch}:{}),
 ...(restrictionPricing!==undefined?{restrictionPricing}:{}),
});
const price=(row)=>configuredSkillEffectPch(row,[],defaultEffectPricing(),DEFAULT_DURATION_PRICING);
const ctx=(hp=50,contactTargetIds=[])=>({
 eventId:"RestrictD44",ownerId:44,trigger:"ACTIVATE",
 stats:{HP:hp,MAX_HP:100},targetIds:{OPPONENT:77},contactTargetIds,
});

test("D4.4: mandatory contact reduces provisional PCH and newly approved PCH",()=>{
 const graph=effect([...contact(),healing()]);
 assert.equal(validateEffectContainers([graph]),null);
 assert.equal(pricedMicroStepCount(graph),1);
 assert.deepEqual(microRestrictionQuote(graph,100),{
  grossPch:100,contactDiscountPch:20,lowHealthDiscountPch:0,
  discountPch:20,finalPch:80,pricedActions:1,
  contactGatedActions:1,lowHpGatedActions:0,
 });
 const row=wrapped(graph);
 assert.equal(composedDepositPch(row),4);
 assert.equal(price(row),4);
 assert.equal(previewComposedEffectBasePch(row).amount,4);
 const reviewed=wrapped(graph,100,"V1");
 assert.equal(validateComposedSkillList([reviewed],"REVIEW"),null);
 assert.equal(composedEffectBasePch(reviewed),80);
 assert.equal(price(reviewed),80);
 const blocked=executeMicroEvent(emptyMicroState(),[graph],ctx(50,[]));
 assert.equal(blocked.intents.length,0,"without real contact no healing executes");
 const allowed=executeMicroEvent(emptyMicroState(),[graph],ctx(50,[77]));
 assert.equal(allowed.intents.filter(i=>i.kind==="HEAL").length,1);
});

test("D4.4: only genuine low-HP restrictions receive an automatic discount",()=>{
 const graph=effect([healing()],[lowHealth(20)]);
 assert.equal(validateEffectContainers([graph]),null);
 assert.equal(microRestrictionQuote(graph,100).finalPch,85);
 assert.equal(executeMicroEvent(emptyMicroState(),[graph],ctx(80)).intents.length,0);
 assert.equal(executeMicroEvent(emptyMicroState(),[graph],ctx(10)).intents.filter(i=>i.kind==="HEAL").length,1);
 const wide=effect([healing()],[lowHealth(99)]);
 assert.equal(microRestrictionQuote(wide,100).discountPch,0);
 const constant=effect([healing()],[{left:1,compare:"LT",right:10}]);
 assert.equal(microRestrictionQuote(constant,100).discountPch,0);
});

test("D4.4: restrictive gates are action-scoped and never grant free effects",()=>{
 const graph=effect([healing(),...contact(),healing()]);
 const quote=microRestrictionQuote(graph,100);
 assert.equal(quote.pricedActions,2);
 assert.equal(quote.contactGatedActions,1);
 assert.equal(quote.finalPch,90,"earlier healing never receives the contact reduction");
 assert.equal(microRestrictionQuote(graph,5).finalPch,4,"small PCH gains one point with a real restriction");
 assert.equal(microRestrictionQuote(effect([...contact(),{kind:"REQUIRE_CONTACT",target:out("chosen")},healing()]),100).finalPch,80,
  "adding extra contact nodes cannot stack a discount");
 assert.equal(microRestrictionQuote(effect([healing(),...contact()]),100).finalPch,100);
 assert.equal(microRestrictionQuote(effect([...contact("USER"),healing()]),100).finalPch,100);
 assert.equal(microRestrictionQuote(effect([...contact("OPPONENT",[lowHealth(20)]),healing()]),100).finalPch,100,
  "conditional checks that can be skipped cannot discount all later actions");
});

test("D4.4: low-HP and contact discounts cap at 30% on the SAME guarded action",()=>{
 const graph=effect([...contact(),healing()],[lowHealth(20)]);
 const quote=microRestrictionQuote(graph,100);
 assert.equal(quote.contactDiscountPch,20);
 assert.equal(quote.lowHealthDiscountPch,10);
 assert.equal(quote.finalPch,70);
 assert.equal(microRestrictionQuote(graph,5).finalPch,4);
 const stepOnly=effect([{...healing(),when:[lowHealth(15)]},healing()]);
 assert.equal(microRestrictionQuote(stepOnly,100).finalPch,92,"V2 rounds genuine fractional discounts upward");
 const doubleHp=effect([{...healing(),when:[lowHealth(10),lowHealth(20)]}],[lowHealth(20)]);
 assert.equal(microRestrictionQuote(doubleHp,100).finalPch,85);
});

test("D4.4: versioned approval preserves old prices and cannot be forged by player",()=>{
 const graph=effect([...contact(),healing()]);
 const legacy=wrapped(graph,100);
 assert.equal(composedEffectBasePch(legacy),100,"legacy approved skills are never repriced on read");
 assert.equal(previewComposedEffectBasePch(legacy).amount,100);
 assert.equal(previewComposedEffectBasePch(legacy,{forApproval:true}).amount,80);
 const [reviewed]=stampReviewedRestrictionPricing([legacy]);
 assert.equal(reviewed.restrictionPricing,"V2");
 assert.equal(composedEffectBasePch(reviewed),80);
 assert.match(validateComposedSkillList([reviewed],"PLAYER"),/solo puede/);
 assert.throws(()=>composedDepositPch(reviewed));
 assert.match(validateComposedSkillList([wrapped(graph,100,"V9")],"REVIEW"),/Versión/);
 const withoutReview=stampReviewedRestrictionPricing([wrapped(graph)])[0];
 assert.match(validateComposedSkillList([withoutReview],"REVIEW"),/PCH revisado/);
});

test("D4.5: 5–10 PCH budgets receive useful discounts without going below 1",()=>{
 const hp=effect([healing()],[lowHealth(20)]);
 const contactOnly=effect([...contact(),healing()]);
 const both=effect([...contact(),healing()],[lowHealth(20)]);
 // A creation coin is 10 PCH; a single modular action initially reserves 5.
 for(const [gross,contactCost,hpCost,bothCost] of [
  [1,1,1,1],
  [5,4,4,4],
  [10,8,8,7],
 ]){
  assert.equal(microRestrictionQuote(contactOnly,gross).finalPch,contactCost);
  assert.equal(microRestrictionQuote(hp,gross).finalPch,hpCost);
  assert.equal(microRestrictionQuote(both,gross).finalPch,bothCost);
  for(const graph of [hp,contactOnly,both]){
   const quote=microRestrictionQuote(graph,gross);
   assert.ok(quote.finalPch>=1);
   assert.ok(quote.discountPch<=Math.floor(gross*0.30));
   assert.equal(quote.contactDiscountPch+quote.lowHealthDiscountPch,quote.discountPch);
  }
 }
 assert.equal(composedDepositPch(wrapped(hp)),4,"the player reservation uses V2");
 assert.equal(composedDepositPch(wrapped(both)),4,"the nominal cap survives integer rounding");
});

test("D4.5: previously approved V1 contracts keep their exact old rounding",()=>{
 const low=effect([healing()],[lowHealth(20)]);
 const both=effect([...contact(),healing()],[lowHealth(20)]);
 assert.equal(microRestrictionQuote(low,5,"V1").finalPch,5);
 assert.equal(microRestrictionQuote(low,5,"V2").finalPch,4);
 assert.equal(microRestrictionQuote(both,5,"V1").finalPch,4);
 assert.equal(composedEffectBasePch(wrapped(low,5,"V1")),5);
 assert.equal(composedEffectBasePch(wrapped(low,5,"V2")),4);
 const reviewed=stampReviewedRestrictionPricing([wrapped(low,5,"V1")])[0];
 assert.equal(reviewed.restrictionPricing,"V2");
 assert.equal(composedEffectBasePch(reviewed),4);
 // Before a new approval, player notes and old reviewed prices cannot be restamped.
 assert.equal(composedEffectBasePch(wrapped(low,5)),5);
 assert.match(validateComposedSkillList([reviewed],"PLAYER"),/solo puede/);
});

test("D4.4: server approval stamps version and UI shows the same discount",()=>{
 const patch=readFileSync(new URL("../app/api/management/skills/[id]/route.ts",import.meta.url),"utf8");
 const create=readFileSync(new URL("../app/api/management/skills/route.ts",import.meta.url),"utf8");
 const admin=readFileSync(new URL("../app/management/skills/page.tsx",import.meta.url),"utf8");
 const edit=readFileSync(new URL("../components/skills/SkillEffectsEditor.tsx",import.meta.url),"utf8");
 for(const source of [patch,create])assert.match(source,/stampReviewedRestrictionPricing\(/);
 assert.match(patch,/requestedPchCost!==exact/);
 assert.match(admin,/forApproval:true/);
 assert.match(admin,/approve\|\|!selected\?pchTotal:form.pchCost/);
 assert.match(edit,/descuento por restricciones verificadas|restricciones verificadas/);
});
