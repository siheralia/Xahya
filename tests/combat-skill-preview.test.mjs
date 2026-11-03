import test from "node:test";
import assert from "node:assert/strict";
import {combatSkillPreview,parseConfiguredSkillRange,projectApprovedCombatSkills}
 from "../lib/combat/skill-preview.ts";

const skill=(id,overrides={})=>({
 id,status:"APPROVED",characterId:101,name:"Habilidad "+id,
 category:"OFFENSIVE",description:"Efecto aprobado",
 cost:14,pchCost:280,maintenanceCost:2,accumulationCost:4,
 duration:"2 turnos",cooldown:"3 turnos",
 speed:"DEFAULT",areaOfEffect:"Objetivo único | Alcance máximo: 7 m",
 attackType:"PIERCE",defenseType:"CONCENTRATED",
 effect:[{type:"RESOURCE_BONUS",target:"HP",value:5},{type:"STAT_BONUS",target:"AGI",value:2}],
 mechanics:{rules:[{event:"ACTIVATE",actions:[{kind:"STATUS",target:"SELF",status:"BRAVE",durationTurns:2},{kind:"MANA_WARD",target:"SELF",level:2,manaInvestment:8,durationTurns:1}]}]},
 ...overrides,
});
test("phase 2.1 uses real approved skill metadata without treating PCH as mana",()=>{
 const p=combatSkillPreview(skill(9),true);
 assert.equal(p.id,9);
 assert.equal(p.manaCost,14);
 assert.equal(p.maintenanceCost,2);
 assert.equal(p.accumulationCost,4);
 assert.equal(p.rangeMeters,7);
 assert.equal(p.area,"Objetivo único");
 assert.equal(p.speed,"DEFAULT");
 assert.equal(p.cooldown,"3 turnos");
 assert.equal(p.duration,"2 turnos");
 assert.equal(p.attackType,"PIERCE");
 assert.equal(p.defenseType,"CONCENTRATED");
 assert.deepEqual(p.effectTypes,["RESOURCE_BONUS","STAT_BONUS"]);
 assert.deepEqual(p.mechanicActions,["STATUS","MANA_WARD"]);
 assert.equal(p.executable,false);
 assert.equal("pchCost" in p,false);
});
test("no invented range when existing skill has no valid configured value",()=>{
 assert.deepEqual(parseConfiguredSkillRange("Área de niebla"),
  {area:"Área de niebla",rangeMeters:null});
 assert.deepEqual(parseConfiguredSkillRange(" | Alcance máximo: 0 m"),
  {area:"Objetivo único",rangeMeters:0});
 assert.deepEqual(parseConfiguredSkillRange("Objetivo único | Alcance máximo: 200 m"),
  {area:"Objetivo único",rangeMeters:null});
 assert.deepEqual(parseConfiguredSkillRange(null),
  {area:"No especificada",rangeMeters:null});
});
test("pending and rejected skills cannot enter the combat roster",()=>{
 assert.equal(combatSkillPreview(skill(7,{status:"PENDING"})),null);
 assert.equal(combatSkillPreview(skill(7,{status:"REJECTED"})),null);
 assert.equal(combatSkillPreview(skill(-7)),null);
});
test("approved roster excludes temporarily stolen skills and marks prerequisite status",()=>{
 const skills=[skill(1),skill(2,{status:"PENDING"}),skill(3),skill(4)];
 const states=[{skillId:1,active:true},{skillId:3,active:false}];
 const seen=[];
 const list=projectApprovedCombatSkills(skills,states,new Set([4]),(s,others)=>{
  seen.push([s.id,others.map(x=>x.id)]);
  return s.id===1;
 });
 assert.deepEqual(list.map(s=>s.id),[1,3]);
 assert.equal(list[0].active,true);
 assert.equal(list[1].active,false);
 assert.equal(list[0].requirementsSatisfied,true);
 assert.equal(list[1].requirementsSatisfied,false);
 assert.deepEqual(seen,[[1,[3]],[3,[1]]]);
 assert.ok(list.every(s=>s.executable===false));
});
test("legacy or invalid optional skill fields remain safe and non executable",()=>{
 const p=combatSkillPreview(skill(5,{
  cost:-12,areaOfEffect:null,effect:"bad",mechanics:{rules:"bad"},
  attackType:"LASER",defenseType:"ABSOLUTE",cooldown:null,
 }));
 assert.equal(p.manaCost,0);
 assert.equal(p.rangeMeters,null);
 assert.equal(p.attackType,null);
 assert.equal(p.defenseType,null);
 assert.deepEqual(p.effectTypes,[]);
 assert.deepEqual(p.mechanicActions,[]);
 assert.equal(p.executable,false);
});
