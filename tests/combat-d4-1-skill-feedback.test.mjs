import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {combatSkillBlockers} from "../lib/combat/skill-cast-feedback.ts";

const skill={
 executable:true,requirementsSatisfied:true,disabledReason:null,
 skillKind:"OFFENSE",manaCost:12,rangeMeters:2,attackArea:null,usesMagic:false,
};
const ready={
 busy:false,canUseSkill:true,invalidAttackMovement:false,
 round:3,nextRound:0,mana:25,missingAim:false,outOfRange:false,
 missingCharges:false,missingFusion:false,
};

test("D4.1: a usable skill has no invented blockers",()=>{
 assert.deepEqual(combatSkillBlockers(skill,ready),[]);
});

test("D4.1: every simultaneous reason is shown rather than only the first",()=>{
 const list=combatSkillBlockers(skill,{
  ...ready,mana:4,nextRound:5,outOfRange:true,
  missingAim:true,invalidAttackMovement:true,
 });
 assert.equal(list.length,5);
 assert.ok(list.some(s=>s.includes("maná")||s.includes("Maná")));
 assert.ok(list.some(s=>s.includes("5")));
 assert.ok(list.some(s=>s.includes("alcance")));
 assert.ok(list.some(s=>s.includes("plano")));
 assert.ok(list.some(s=>s.includes("PA/ticks")));
});

test("D4.1: busy action never falsely blames the player's initiative",()=>{
 const list=combatSkillBlockers(skill,{...ready,busy:true,canUseSkill:false});
 assert.equal(list.length,1);
 assert.match(list[0],/procesando otra acción/);
});

test("D4.1: one-use cooldown, missing mana, charges and fusion are explicit",()=>{
 const once=combatSkillBlockers(skill,{...ready,nextRound:-1,mana:null,
  missingCharges:true,missingFusion:true});
 assert.equal(once.length,4);
 assert.match(once[0],/una vez/);
 assert.match(once[1],/no tiene la reserva de maná/);
 assert.match(once[2],/fusión/);
 assert.match(once[3],/cargas/);
});

test("D4.1: unsupported/disabled modular graphs never become castable",()=>{
 const unsupported={...skill,executable:false,disabledReason:"Falta un resolutor revisado."};
 assert.deepEqual(combatSkillBlockers(unsupported,ready),["Falta un resolutor revisado."]);
 const requirements={...skill,executable:false,requirementsSatisfied:false,disabledReason:null};
 assert.match(combatSkillBlockers(requirements,ready)[0],/requisitos/);
});

test("D4.1: roster keeps the original server-aligned block and exposes reason to accessibility APIs",()=>{
 const source=readFileSync(new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");
 assert.match(source,/!canUseSkill\|\|invalidAttackMovement\|\|busy/);
 assert.match(source,/const blockers=combatSkillBlockers\(skill/);
 assert.match(source,/disabled=\{blocked\} aria-describedby=\{blockers.length\?blockersId:undefined\}/);
 assert.match(source,/blockers\.map\(\(reason,index\)=>/);
 assert.match(source,/No ejecutable/);
 assert.match(source,/La aprobación de la ficha no significa/);
});
