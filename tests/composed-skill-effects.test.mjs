import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  MODULE_DEPOSIT_PER_STEP,isComposedSkillEffect,validateComposedSkillList,
  canonicalPlayerComposedEffects,composedEffectBasePch,composedDepositPch,
} from "../lib/skills/composed-effects.ts";
import {configuredSkillEffectPch} from "../lib/skills/configured-effect-pricing.ts";
import {defaultEffectPricing} from "../lib/skills/pch.ts";
import {DEFAULT_DURATION_PRICING} from "../lib/effects/duration-pricing.ts";
import {GLORIA_MICRO_PRESETS} from "../lib/effects/micro-template-presets.ts";

const fresh=(idx=0)=>({type:"COMPOSED",module:structuredClone(GLORIA_MICRO_PRESETS[idx].effect),pricingNotes:"Pendiente de revisión."});
const price=(e)=>configuredSkillEffectPch(e,[],defaultEffectPricing(),DEFAULT_DURATION_PRICING);

test("player may create arbitrary composed effects, validated with existing engine",()=>{
  const rows=[fresh(0),fresh(1),fresh(2),fresh(3),fresh(4)];
  assert.equal(validateComposedSkillList(rows,"PLAYER"),null);
  assert.equal(rows.every(isComposedSkillEffect),true);
  assert.deepEqual(rows.map(composedDepositPch),[5,5,5,15,10]);
});
test("player provisional reservation is positive, calculated by server, not by JSON value or stats",()=>{
  const proposed=fresh(3);
  assert.equal(MODULE_DEPOSIT_PER_STEP,5);
  assert.equal(price(proposed),15);
  proposed.module.steps[1].amount=999999999;
  assert.equal(price(proposed),15,"the deposit is provisional and does not price final utility");
});
test("staff-reviewed base changes the skill pricing, and cannot be forged by players",()=>{
  const composed=fresh(0);
  const staff={...composed,reviewedPch:42};
  assert.equal(price(staff),42);
  assert.match(validateComposedSkillList([staff],"PLAYER"),/solo puede/);
  assert.equal(validateComposedSkillList([staff],"REVIEW"),null);
  assert.throws(()=>canonicalPlayerComposedEffects([staff]),/solo puede/);
  assert.equal(composedEffectBasePch(staff),42);
});
test("server strips unapproved metadata and keeps everything else unchanged",()=>{
  const row=fresh(0),old={type:"STAT_BONUS",target:"STR",value:3};
  const result=canonicalPlayerComposedEffects([row,old]);
  assert.equal(result[0].reviewedPch,undefined);
  assert.equal(result[0].pricingNotes,row.pricingNotes);
  assert.deepEqual(result[1],old);
  assert.notEqual(result[0].module,row.module);
});
test("duplicate ID, missing module, unsupported fields, invalid staff prices are rejected",()=>{
  const a=fresh(0);
  assert.match(validateComposedSkillList([a,structuredClone(a)],"PLAYER"),/distintos/);
  assert.match(validateComposedSkillList([{type:"COMPOSED"}],"PLAYER"),/Micromódulo|contenedor/);
  assert.match(validateComposedSkillList([{...a,hiddenCost:1}],"PLAYER"),/desconocidos/);
  assert.match(validateComposedSkillList([{...a,reviewedPch:0}],"REVIEW"),/revisado/);
  assert.match(validateComposedSkillList([{...a,reviewedPch:2.5}],"REVIEW"),/revisado/);
  assert.match(validateComposedSkillList([{...a,reviewedPch:100001}],"REVIEW"),/revisado/);
  assert.match(validateComposedSkillList(Array.from({length:9},(_,i)=>({...fresh(0),module:{...fresh(0).module,id:"UNIQUE_"+i}})),"PLAYER"),/ocho/);
});
test("approved skill review verifies final cost and sufficient PCH inside existing transaction",()=>{
 const submit=readFileSync(new URL("../app/api/characters/[id]/skills/route.ts",import.meta.url),"utf8");
 const approve=readFileSync(new URL("../app/api/management/skills/[id]/route.ts",import.meta.url),"utf8");
 assert.match(submit,/validateComposedSkillList\(effect,"PLAYER"\)/);
 assert.match(submit,/canonicalPlayerComposedEffects\(body\.effect\)/);
 assert.match(submit,/pchBalance" >=/);
 assert.match(submit,/status: "PENDING"/);
 assert.match(approve,/validateComposedSkillList\(effect,/);
 assert.match(approve,/requeste[d]?PchCost!==exact/);
 assert.match(approve,/PCH_INSUFFICIENT/);
 assert.match(approve,/approve && hasComposed \? 0/);
});
