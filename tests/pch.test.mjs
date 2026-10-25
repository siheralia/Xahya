import test from "node:test";
import assert from "node:assert/strict";
import {estimateSkillPch,normalizeItemEffect,statMultiplierFactor,applyStatOperation} from "../lib/effects/pch.mjs";
test("Ispātatalavāra value 2 doubles ATTACK_TOTAL",()=>{
 const sword=normalizeItemEffect({type:"stat_multiplier",stat:"ATTACK_TOTAL",value:2});
 assert.equal(sword.type,"STAT_MULTIPLIER");
 assert.equal(statMultiplierFactor(sword.value),2);

});
test("Omega gets a provisional effect-only cost, not a definitive skill price",()=>{
 const result=estimateSkillPch({effect:[{type:"DAMAGE_MULTIPLIER",value:1,target:"PHYS_ATK"},{type:"IGNORE_PHYS_DEF_MULTIPLIER",value:0.5},{type:"FINAL_DAMAGE_MULTIPLIER",value:3}],areaOfEffect:"Objetivo único"});
 assert.equal(result.effectPch,18);
 assert.ok(result.warnings.includes("RANGE_NOT_PRICED"));
});
test("narrative effects require review",()=>{
 const result=estimateSkillPch({effect:[{type:"NARRATIVE",description:"Refleja magia"}]});
 assert.equal(result.effectPch,0);
 assert.ok(result.warnings.includes("NARRATIVE_REQUIRES_REVIEW"));
});
test("unknown effects are never assigned definitive costs",()=>{
 assert.equal(estimateSkillPch({effect:[{type:"UNLISTED",value:10}]}).totalPch,null);
});

test("stat + is additive; stat x uses direct factors",()=>{
 assert.equal(applyStatOperation(40,{type:"STAT_BONUS",value:10}),50);
 assert.equal(applyStatOperation(40,{type:"STAT_MULTIPLIER",value:2}),80);
 assert.equal(statMultiplierFactor(1),1);
 assert.equal(statMultiplierFactor(1.5),1.5);
 assert.equal(statMultiplierFactor(3),3);
});
test("invalid factors are rejected",()=>{ assert.throws(()=>statMultiplierFactor(-1)); });\n