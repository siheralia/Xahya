import test from "node:test";
import assert from "node:assert/strict";
import {estimateSkillPch,normalizeItemEffect,legacyItemMultiplier,statMultiplierFactor,applyStatOperation} from "../lib/effects/pch.mjs";
test("Ispātatalavāra value 200 doubles ATTACK_TOTAL",()=>{
 const sword=normalizeItemEffect({type:"stat_multiplier",stat:"ATTACK_TOTAL",value:200});
 assert.equal(sword.type,"ATTACK_TOTAL_MULTIPLIER_LEGACY");
 assert.equal(legacyItemMultiplier(sword.value, sword.target),2);
 assert.equal(legacyItemMultiplier(200,"PHYS_ATK"),3);
});
test("Omega gets a provisional effect-only cost, not a definitive skill price",()=>{
 const result=estimateSkillPch({effect:[{type:"DAMAGE_MULTIPLIER",value:100,target:"PHYS_ATK"},{type:"IGNORE_PHYS_DEF_MULTIPLIER",value:50},{type:"FINAL_DAMAGE_MULTIPLIER",value:300}],areaOfEffect:"Objetivo único"});
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
 assert.equal(applyStatOperation(40,{type:"STAT_MULTIPLIER",value:200}),80);
 assert.equal(statMultiplierFactor(100),1);
 assert.equal(statMultiplierFactor(150),1.5);
 assert.equal(statMultiplierFactor(300),3);
});
test("old additive percent items can retain original values explicitly",()=>{
 assert.equal(applyStatOperation(40,{type:"STAT_MULTIPLIER",value:200},"legacy_additive_percent"),120);
 assert.throws(()=>statMultiplierFactor(200,"unknown"));
});
