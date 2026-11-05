import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  cloneLegacySkillAsMicro,legacyShadowCombatNumbers,evaluateLegacyShadowParts,legacyShadowCopyConfig,
} from "../lib/effects/legacy-modular-shadow.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {racialDamageFactors} from "../lib/combat/innate-traits.ts";
import {racialMazeBonuses} from "../lib/maze-racial-effects.ts";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/legacy-modular-shadow-2026-11-04.json",import.meta.url),"utf8"));
const def=(source,id)=>fixture.definitions.find(d=>d.source===source&&d.id===id);
const preview=(source,id)=>cloneLegacySkillAsMicro({...def(source,id),name:"Caso "+id},source);
const plan=(id,category="OFFENSIVE",other={})=>({
 id,category,status:"APPROVED",name:"Fixture "+id,cost:20,
 attackType:"PIERCE",areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 duration:"Instantánea",cooldown:"2 turnos",mechanics:{},condition:null,
 effect:def("skill",id).effect,...other,
});

test("read-only shadow copies cover every approved/active definition in the real audit",()=>{
 const originals=fixture.definitions;
 assert.equal(originals.length,63);
 const counts={skill:0,raceSkill:0,genericSkillTemplate:0};
 for(const row of originals){
   counts[row.source]++;
   const before=structuredClone(row);
   const copy=cloneLegacySkillAsMicro({...row,name:"Fixture"},row.source);
   assert.equal(copy.enabled,false);assert.equal(copy.uncharged,true);
   assert.equal(copy.parts.length,row.effect.length);
   assert.deepEqual(row,before,"Never mutate live or fixture source.");
   assert.ok(["COMPLETE","PARTIAL","UNSUPPORTED"].includes(copy.coverage));
   for(const part of copy.parts){
     if(part.status==="EXECUTABLE"){
       assert.equal(part.modules.length,1);
       assert.ok(part.modules[0].steps.length>=1 && part.modules[0].steps.length<=24);
     }else if(part.status==="DESCRIPTION_ONLY"){
       assert.equal(part.modules.length,1);
       assert.equal(part.modules[0].steps[0].kind,"CAPABILITY");
     } else {
       assert.equal(part.status,"UNSUPPORTED");
       assert.equal(part.modules.length,1);
       assert.equal(part.modules[0].steps[0].kind,"CAPABILITY",
         "Unsupported abilities must remain visible but mechanically inert.");
     }
   }
 }
 assert.deepEqual(counts,{skill:22,raceSkill:21,genericSkillTemplate:20});
});
test("Omega and Alfa modular clones feed the same combat plans (no double damage)",()=>{
 for(const id of [2,3]){
   const row=plan(id);
   const shadow=legacyShadowCombatNumbers(row.effect);
   assert.ok(shadow);
   assert.deepEqual(
     {damageMultiplier:shadow.damageMultiplier,defenseFactor:shadow.defenseFactor,finalMultiplier:shadow.finalMultiplier},
     {damageMultiplier:1,defenseFactor:0.5,finalMultiplier:3},
   );
   const compiled=compileCombatSkill(row);
   assert.equal(compiled.microEquivalent,true);
   assert.equal(compiled.damageMultiplier,1);
   assert.equal(compiled.defenseFactor,0.5);
   assert.equal(compiled.finalMultiplier,3);
 }
});
test("mirror clone feeds the existing summon/ray/reflect resolver without recoding its combat semantics",()=>{
 const row=plan(1);
 const shadow=legacyShadowCombatNumbers(row.effect);
 assert.deepEqual(shadow?.mirror,{durability:1,rayMultiplier:1,reflectionMultiplier:1});
 const compiled=compileCombatSkill(row);
 assert.equal(compiled.microEquivalent,true);
 assert.equal(compiled.category,"CONSTRUCTION");
 assert.deepEqual(compiled.mirror,shadow?.mirror);
 assert.equal(compiled.construction?.material,"MIRROR");
});
test("HP recovery produces the same amount, with HP cap left to combat state",()=>{
 for(const id of [17,18,19,20,21]){
   const s=legacyShadowCombatNumbers(def("skill",id).effect);
   assert.equal(s?.healing,18);
   const compiled=compileCombatSkill(plan(id,"SUPPORT"));
   assert.equal(compiled.microEquivalent,true);
   assert.equal(compiled.healing,18);
 }
});
test("physical attack bonus clone keeps damage factor and historical attack geometry",()=>{
 const p=compileCombatSkill(plan(38,"OFFENSIVE",{attackType:"BLUNT",mechanics:{parentSkillId:37}}));
 assert.equal(p.microEquivalent,true);
 assert.equal(p.damageMultiplier,2);
 assert.equal(p.requiredParentSkillId,37);
});
test("racial resistance and maze modifiers use modular numbers without changing stacking rules",()=>{
 const duramen=def("raceSkill",17).effect;
 assert.deepEqual(racialDamageFactors([{status:"APPROVED",category:"PASSIVE",grantedByRaceSkillId:17,effect:duramen}]),
   {BLUNT:0.5,PIERCE:0.5,FIRE:1.75});
 const maze=fixture.definitions.filter(d=>d.source==="raceSkill"&&
   d.effect.some(e=>String(e.type).startsWith("MAZE_")));
 const caps=racialMazeBonuses(maze.map(x=>({status:"APPROVED",category:"PASSIVE",grantedByRaceSkillId:x.id,effect:x.effect})));
 assert.ok(caps.trapEvasionPercent>=0&&caps.trapEvasionPercent<=100);
 assert.ok(caps.treasureItemChancePercent>=0&&caps.treasureItemChancePercent<=100);
 assert.ok(caps.treasureMoneyBonusPercent>=0&&caps.treasureMoneyBonusPercent<=100);
});
test("maze invisibility creates an executable capability token, preserving original skill",()=>{
 const p=preview("skill",4);
 assert.equal(p.coverage,"COMPLETE");
 assert.deepEqual(evaluateLegacyShadowParts(p.parts),[{kind:"BONUS",stat:"MAZE_INVISIBILITY",amount:1}]);
});
test("copy capability is reconstructed by 7 modules and still uses legacy permission/approval services",()=>{
 const original=def("skill",13).effect[0];
 const copy=legacyShadowCopyConfig(original);
 assert.equal(preview("skill",13).coverage,"COMPLETE");
 assert.equal(copy.type,"COPY_SKILL");
 assert.equal(copy.value,original.value);
 assert.equal(copy.copyMode,original.copyMode??"PERMANENT");
 assert.equal(copy.copyFidelityPercent,original.copyFidelityPercent??100);
 assert.equal(copy.copyAllowRacial,original.copyAllowRacial===true);
 assert.equal(copy.copyAllowSpecial,original.copyAllowSpecial!==false);
 assert.equal(legacyShadowCopyConfig({...original,copyCapacity:-1}),null);
 const server=readFileSync(new URL("../app/api/characters/[id]/skills/copies/route.ts",import.meta.url),"utf8");
 const search=readFileSync(new URL("../app/api/characters/[id]/skills/copies/search/route.ts",import.meta.url),"utf8");
 assert.match(server,/legacyShadowCopyConfig\(sourceCopyEffect\)/);
 assert.match(search,/legacyShadowCopyConfig\(sourceCopyEffect\)/);
 assert.match(server,/canCopySkill\(copyEffect/);
});
test("non-mechanical narrative still requires a typed resolver",()=>{
 const e=preview("skill",7);
 assert.equal(e.coverage,"UNSUPPORTED");
 assert.throws(()=>evaluateLegacyShadowParts(e.parts),/resolutor/);
});
test("UI and API only expose non-active private management shadows; no PCH or skill creation",()=>{
 const api=readFileSync(new URL("../app/api/management/effects/legacy-shadows/route.ts",import.meta.url),"utf8");
 assert.match(api,/hasRolePermission\(user,"management\.skills","view"\)/);
 assert.match(api,/readonly:true,chargedPch:0,activated:false/);
 assert.doesNotMatch(api,/Skill\.create|AppSetting\.create|pchBalance.*-/);
});
