import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const module=(selector="OPPONENT",value=0.8,operation="MULTIPLIER",
 stat="MAGIC_DEFENSE",durationTurns=2)=>({
 type:"COMPOSED",reviewedPch:20,module:{
  id:"ContactStatus",name:"Debilitamiento",description:"Solo contacto real",
  type:"COMBAT_CONTACT",trigger:"ACTIVATE",steps:[
   {kind:"SELECT_TARGET",selector,output:"target"},
   {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},
    stat,operation,value,durationTurns},
  ],
 },
});
const offense=(id=321,changes={})=>({
 id,name:"Impacto debilitante",characterId:101,
 status:"APPROVED",approvedAt:"2026-11-09T00:00:00Z",
 pchCost:45,category:"OFFENSIVE",cost:8,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 attackType:"PIERCE",duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 mechanics:{},condition:"",
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
  module(),
 ],...changes,
});
const fighter=(name,characterId,pos,other={})=>({
 characterId,name,hp:50,maxHp:100,agility:100,speedValue:100,
 strength:1,constitution:10,precision:100,dodge:10,
 physicalAttack:18,physicalDefense:6,magicAttack:22,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"PIERCE",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...other,
});
const state=()=>{
 const s=newCombatState(fighter("Marya",101,0),fighter("Rival",102,3),"PLAYER");
 s.mana={PLAYER:{current:30,max:30},NPC:{current:30,max:30}};
 return s;
};
const dice={hit:0.02,critical:0.99,defense:0.99};
const path=[{x:0,y:0.5},{x:0.5,y:0.5}];
const requestId="hostile-status-action-001";
const cast=(s,plan=compileCombatSkill(offense()),aim={requestId,trajectory:path})=>
 applyResolvedCombatSkill(s,"PLAYER",plan,aim,dice);
const roundEnd=previous=>{
 let s=previous;const target=s.round+1;
 for(let n=0;n<25&&s.round<target;n++){
  const who=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(who,"round must progress");
  s=applyCombatCommand(s,who,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,target);return s;
};

test("reviewed physical offense uses official defense before applying the status",()=>{
 const plan=compileCombatSkill(offense());
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.attackType,"PIERCE");
 assert.equal(plan.usesMagic,false);
 assert.equal(plan.damageMultiplier,1);
 assert.ok(plan.approvedHostileStatus);
 const initial=state(),snapshot=structuredClone(initial);
 let s=cast(initial,plan);
 assert.deepEqual(initial,snapshot);
 assert.equal(s.actors.NPC.magicDefense,10,
  "status must not apply when the caster only prepares the attack");
 assert.equal(s.mana.PLAYER.current,22);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.skillCooldowns.PLAYER["321"],3);
 assert.equal(s.pending.hostileStatus.value,0.8);
 assert.equal(s.pending.hostileStatus.durationTurns,2);
 const publicState=combatClientView(s);
 assert.equal(publicState.pending.hostileStatus,undefined,
  "status payload stays server-side until the defender reacts");
 assert.equal(JSON.stringify(publicState).includes("ContactStatus"),false);
 const replay=JSON.parse(JSON.stringify(s));
 assert.deepEqual(cast(replay,plan),replay,
  "a repeated request cannot restart the attack or charge resources again");
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.actors.NPC.hp<50);
 assert.equal(s.actors.NPC.magicDefense,8);
 assert.equal(s.summonStatuses.length,1);
 assert.equal(s.summonStatuses[0].target,"NPC");
 assert.equal(s.summonStatuses[0].sourceSummonId,"SKILL:321");
 assert.equal(s.summonStatuses[0].expiresAtRound,3);
 assert.equal(activeCombatStatusViews(s,"NPC").length,1);
 assert.equal(activeCombatStatusViews(s,"PLAYER").length,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,1);
 s=JSON.parse(JSON.stringify(s));
 s=roundEnd(s);assert.equal(s.round,2);
 assert.equal(s.actors.NPC.magicDefense,8);
 s=roundEnd(s);assert.equal(s.round,3);
 assert.equal(s.actors.NPC.magicDefense,10);
 assert.equal(activeCombatStatusViews(s,"NPC").length,0);
});

test("successful physical dodge prevents both HP damage and modular status",()=>{
 const plan=compileCombatSkill(offense());
 let s=cast(state(),plan);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DODGE"},
   {hit:0.999,critical:0.99,defense:0.999});
 assert.equal(s.actors.NPC.hp,50);
 assert.equal(s.actors.NPC.magicDefense,10);
 assert.equal(s.summonStatuses?.length??0,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});

test("cannot redirect a status to a mirror or a summon, even with an authorized skill",()=>{
 const plan=compileCombatSkill(offense()),initial=state();
 const before=structuredClone(initial);
 for(const target of [{targetConstructionId:"forged-mirror"},
  {targetSummonId:"forged-summon"}]){
  assert.throws(()=>cast(initial,plan,{requestId,trajectory:path,...target}),
   /solo puede acompañar un ataque dirigido al rival/);
  assert.deepEqual(initial,before);
 }
});

test("unapproved, unpriced, hostile bypass and arbitrary graphs are rejected",()=>{
 const invalid=[
  {status:"PENDING"},{approvedAt:null},{pchCost:0},{cost:0},
  {maintenanceCost:4},{accumulationCost:2},{condition:"Solo en lluvia"},
  {areaOfEffect:"Área circular de 3 m | Alcance máximo: 5 m"},
  {areaOfEffect:"Objetivo único | Alcance máximo: 99 m"},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},module()]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:200},module()]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},module("USER")]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},module("OPPONENT",1.2)]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   module("OPPONENT",-40,"BONUS")]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   module("OPPONENT",0.8,"MULTIPLIER","RACE")]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   module("OPPONENT",0.8,"MULTIPLIER","MAGIC_DEFENSE",6)]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   {...module(),reviewedPch:undefined}]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   module(),module()]},
 ];
 for(const [index,changes] of invalid.entries()){
  const row=offense(500+index,changes);
  assert.equal(previewSkillExecution(row).executable,false,
   "invalid hostile graph should remain disabled #"+index);
  assert.throws(()=>compileCombatSkill(row),"invalid hostile graph #"+index);
 }
 assert.throws(()=>compileCombatSkill(offense(900),"LEGACY_ONLY"),
  /desactivados/);
});

test("modular hostile preview respects explicit deactivation, legacy skills remain unchanged",()=>{
 const row=offense();
  const preview=projectApprovedCombatSkills([row],[],new Set(),()=>true);
 assert.equal(preview[0].executable,true);
 assert.equal(preview[0].modularHostileStatus,true);
 const disabled=projectApprovedCombatSkills([row],[{skillId:321,active:false}],
  new Set(),()=>true);
 assert.equal(disabled[0].executable,false);
 assert.match(disabled[0].disabledReason,/desactivada/);
});

test("combined application does not accept injected attacker parameters",()=>{
 const plan=compileCombatSkill(offense());
 assert.equal(plan.approvedHostileStatus.definition.steps.length,2);
 assert.throws(()=>cast(state(),plan,{requestId,trajectory:path,
   targetSummonId:"enemi",damageMultiplier:9999}),/solo puede acompañar/);
});
