import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PCH_PER_COIN,PCH_PER_UPGRADE_COIN} from "../lib/skills/pch.ts";
import {microRestrictionQuote} from "../lib/skills/micro-restriction-pricing.ts";
import {composedEffectBasePch,composedDepositPch,stampReviewedRestrictionPricing} from "../lib/skills/composed-effects.ts";
import {validateEffectContainers} from "../lib/effects/micro-modules.ts";

const lowHp=()=>({left:{source:"STAT",key:"HP"},compare:"LTE",right:{
 operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},20],
}});
const effect=(kind="HP")=>({
 id:"D45_PCH",name:"Guardia limitada",type:"COMPOSED",description:"Solo con un requisito real",
 trigger:"ACTIVATE",requirements:kind==="HP"?[lowHp()]:[],
 steps:kind==="HP"?[{kind:"HEAL",amount:6}]:[
  {kind:"SELECT_TARGET",selector:"OPPONENT",output:"enemy"},
  {kind:"REQUIRE_CONTACT",target:{source:"OUTPUT",key:"enemy"}},
  {kind:"HEAL",amount:6},
 ],
});
const wrap=(module,reviewedPch,version)=>({type:"COMPOSED",module,
 ...(reviewedPch!==undefined?{reviewedPch}:{}),
 ...(version!==undefined?{restrictionPricing:version}:{}),
});

test("D4.5: one creation coin grants 10 PCH and an upgrade coin adds 5",()=>{
 assert.equal(PCH_PER_COIN,10);
 assert.equal(PCH_PER_UPGRADE_COIN,5);
 const source=readFileSync(new URL("../app/characters/[id]/page.tsx",import.meta.url),"utf8");
 assert.match(source,/Recibiste 10 PCH/);
 assert.match(source,/Recibiste 1 crédito de mejora y 5 PCH/);
});

test("D4.5: low-cost restrictions yield integer PCH savings within strict 30% cap",()=>{
 const hp=effect("HP"),contact=effect("CONTACT");
 for(const graph of [hp,contact])assert.equal(validateEffectContainers([graph]),null);
 assert.equal(composedDepositPch(wrap(hp)),4);
 assert.equal(composedDepositPch(wrap(contact)),4);
 const scenarios=[
  {base:1,hp:1,contact:1},
  {base:5,hp:4,contact:4},
  {base:10,hp:8,contact:8},
 ];
 for(const row of scenarios){
  for(const [graph,expected] of [[hp,row.hp],[contact,row.contact]]){
   const quote=microRestrictionQuote(graph,row.base);
   assert.equal(quote.finalPch,expected);
   assert.ok(quote.discountPch<=Math.floor(row.base*0.30));
   assert.ok(quote.finalPch>=1);
  }
 }
});

test("D4.5: V1 approval price never changes on read, new review is V2",()=>{
 const hp=effect();
 const old=wrap(hp,5,"V1");
 assert.equal(composedEffectBasePch(old),5);
 assert.equal(microRestrictionQuote(hp,5,"V1").finalPch,5);
 const newer=stampReviewedRestrictionPricing([old])[0];
 assert.equal(newer.restrictionPricing,"V2");
 assert.equal(composedEffectBasePch(newer),4);
 assert.equal(composedEffectBasePch(old),5,"old object must not be modified");
});

test("D4.5: the player sees actual spendable PCH and shortage on narrow screens",()=>{
 const modal=readFileSync(new URL("../components/skills/SkillFormModal.tsx",import.meta.url),"utf8");
 const core=readFileSync(new URL("../components/skills/SkillCoreFields.tsx",import.meta.url),"utf8");
 const editor=readFileSync(new URL("../components/skills/SkillEffectsEditor.tsx",import.meta.url),"utf8");
 assert.match(modal,/pch\.balance-payablePch/);
 assert.match(modal,/Cada moneda de creación aporta 10 PCH/);
 assert.match(modal,/Te faltan/);
 assert.match(modal,/aria-live="polite"/);
 assert.match(modal,/max-h-\[calc\(100dvh-1rem\)\]/);
 assert.match(modal,/overflow-x-hidden/);
 assert.match(modal,/whitespace-normal break-words/);
 assert.match(core,/min-w-0 grid-cols-1/);
 assert.match(core,/min-w-0 max-w-full rounded-lg/);
 assert.match(editor,/min-w-0 rounded-xl/);
 assert.match(editor,/restrictionPricing==="V1"/);
});

test("D4.5: non-upgrade skills reserve the full cost, upgrades only reserve positive delta",()=>{
 const modal=readFileSync(new URL("../components/skills/SkillFormModal.tsx",import.meta.url),"utf8");
 assert.match(modal,/pch\.baseline===undefined\?pch\.total:Math\.max\(0,pch\.total-pch\.baseline\)/);
 const character=readFileSync(new URL("../app/characters/[id]/page.tsx",import.meta.url),"utf8");
 assert.match(character,/pchBalance < delta/);
});
