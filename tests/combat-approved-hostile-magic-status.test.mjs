import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const effect=(value=0.8,operation="MULTIPLIER",stat="MAGIC_DEFENSE",durationTurns=2)=>({
 type:"COMPOSED",reviewedPch:24,
 module:{id:"MAGIC_CONTACT_STATUS",name:"Marca debilitante",
  type:"COMBAT_CONTACT",description:"Tras el impacto mágico real",
  trigger:"ACTIVATE",steps:[
   {kind:"SELECT_TARGET",selector:"OPPONENT",output:"opponent"},
   {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"opponent"},
    stat,operation,value,durationTurns},
  ]},
});
const spell=(id=501,changes={})=>({
 id,name:"Rayo entorpecedor",characterId:101,status:"APPROVED",
 approvedAt:"2026-11-09T00:00:00Z",pchCost:64,
 category:"OFFENSIVE",cost:12,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,condition:"",mechanics:{},
 attackType:"PIERCE",duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},
  effect(),
 ],...changes,
});
const fighter=(name,characterId,positionMeters,patch={})=>({
 name,characterId,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:10,
 critical:0,luck:15,race:20,massKg:70,positionMeters,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch,
});
const encounter=()=>{
 const s=newCombatState(fighter("Lanzadora",101,0),fighter("Defensora",102,4),"PLAYER");
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const mirror=(id,position)=>({
 id,owner:"NPC",sourceSkillId:800,material:"MIRROR",form:"MIRROR",
 label:id,center:{x:.98,y:.95},fieldPosition:position,createdRound:1,
 tangible:true,durability:5,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
});
const dice={hit:.01,critical:.99,defense:.99};
const requestId="magic-hostile-d25-0001";
const cast=(s,plan=compileCombatSkill(spell()),aim={requestId,areaCenter:{x:.5,y:.5}})=>
 applyResolvedCombatSkill(s,"PLAYER",plan,aim,dice);
const defend=(s,defense="NONE",rolls=dice,other={})=>
 applyCombatCommand(s,"NPC",{kind:"DEFEND",defense,...other},rolls);
const finishRound=before=>{
 let s=before,expected=before.round+1;
 for(let i=0;i<25&&s.round<expected;i++){
  const side=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(side);
  s=applyCombatCommand(s,side,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,expected);
 return s;
};

test("approved magical rider is a normal directed attack; status only after HP hit",()=>{
 const plan=compileCombatSkill(spell());
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.usesMagic,true);
 assert.equal(plan.damageMultiplier,1);
 assert.equal(plan.approvedHostileStatus?.usesMagic,true);
 assert.equal(plan.approvedHostileStatus?.value,0.8);
 const initial=encounter(),snapshot=structuredClone(initial);
 let launched=cast(initial,plan);
 assert.deepEqual(initial,snapshot,"preparation cannot mutate original encounter");
 assert.equal(launched.pending.usesMagic,true);
 assert.equal(launched.pending.attackArea,undefined);
 assert.equal(launched.pending.hostileStatus?.value,0.8);
 assert.equal(launched.pending.directedMagicRay?.to.x,4);
 assert.equal(launched.actors.NPC.magicDefense,10,
  "launch never applies an unavoidable status");
 assert.equal(launched.mana.PLAYER.current,48);
 assert.equal(launched.actors.PLAYER.spentAp,1);
 assert.equal(launched.skillCooldowns.PLAYER["501"],3);
 const client=combatClientView(launched);
 assert.equal(client.pending.hostileStatus,undefined);
 assert.equal(client.pending.directedMagicRay,undefined);
 assert.equal(client.pending.targetCenter,undefined);
 assert.equal(JSON.stringify(client).includes("MAGIC_CONTACT_STATUS"),false);
 const retry=JSON.parse(JSON.stringify(launched));
 assert.deepEqual(cast(retry,plan),retry,
  "same requestId never spends twice or overwrites pending defense");
 let landed=defend(launched);
 assert.ok(landed.actors.NPC.hp<180);
 assert.ok(Math.abs(landed.actors.NPC.magicDefense-8)<1e-9);
 assert.equal(landed.summonStatuses?.length,1);
 assert.equal(landed.summonStatuses[0].target,"NPC");
 assert.equal(landed.summonStatuses[0].sourceSummonId,"SKILL:501");
 assert.equal(landed.summonStatuses[0].expiresAtRound,3);
 assert.equal(activeCombatStatusViews(landed,"NPC").length,1);
 assert.equal(activeCombatStatusViews(landed,"PLAYER").length,0);
 assert.equal(landed.log.filter(e=>e.kind==="STATUS").length,1);
 const order=landed.log.map(e=>e.kind);
 assert.ok(order.indexOf("RESOLVE")<order.indexOf("STATUS"),
  "chronicle logs magical hit before its status consequence");
 landed=JSON.parse(JSON.stringify(landed));
 landed=finishRound(landed);assert.equal(landed.round,2);
 assert.ok(Math.abs(landed.actors.NPC.magicDefense-8)<1e-9);
 landed=finishRound(landed);assert.equal(landed.round,3);
 assert.equal(landed.actors.NPC.magicDefense,10);
 assert.equal(activeCombatStatusViews(landed,"NPC").length,0);
});

test("magical dodge uses defender's regular prediction, nullifying status",()=>{
 let prepared=cast(encounter());
 prepared=defend(prepared,"DODGE",{hit:.999,critical:.99,defense:.999},
  {predictedCenter:{x:.5,y:.5}});
 assert.equal(prepared.actors.NPC.hp,180);
 assert.equal(prepared.actors.NPC.magicDefense,10);
 assert.equal(prepared.summonStatuses?.length??0,0);
 assert.equal(prepared.log.filter(e=>e.kind==="STATUS").length,0);
});

test("mirror on the actual world ray reflects magic before defense and blocks rider",()=>{
 const s=encounter();
 s.constructions=[mirror("Espejo entre combatientes",{x:2,y:0})];
 const launched=cast(s);
 const reflected=defend(launched,"DODGE",dice,{predictedCenter:{x:.5,y:.5}});
 assert.equal(reflected.pending,null);
 assert.equal(reflected.actors.NPC.hp,180);
 assert.equal(reflected.actors.NPC.magicDefense,10);
 assert.equal(reflected.actors.NPC.spentAp,0,
  "an interception happens before the target spends a reaction");
 assert.ok(reflected.actors.PLAYER.hp<180);
 assert.equal(reflected.mana.PLAYER.current,48);
 assert.equal(reflected.summonStatuses?.length??0,0);
 assert.equal(reflected.log.filter(e=>e.kind==="REFLECTION").length,1);
 assert.equal(reflected.log.filter(e=>e.kind==="STATUS").length,0);
});

test("magic field still allows a status when real HP is lost, without an extra cost",()=>{
 const s=defend(cast(encounter()),"MAGIC_FIELD",
  {hit:.01,critical:.99,defense:0});
 assert.ok(s.actors.NPC.hp<180);
 assert.ok(Math.abs(s.actors.NPC.magicDefense-8)<1e-9);
 assert.equal(s.summonStatuses?.length,1);
 assert.equal(s.mana.PLAYER.current,48);
 assert.equal(s.mana.NPC.current,59,"basic magical defense costs one mana");
 assert.equal(s.actors.PLAYER.spentAp,1);
});

test("a fully mitigated magical hit with zero actual HP loss cannot debuff",()=>{
 const s=encounter();
 s.actors.PLAYER.magicAttack=1;
 s.actors.NPC.magicDefense=1000;
 const before=structuredClone(s);
 const resolved=defend(cast(s),"MAGIC_FIELD",
  {hit:.01,critical:.99,defense:0});
 assert.deepEqual(s,before);
 assert.equal(resolved.actors.NPC.hp,180);
 assert.equal(resolved.actors.NPC.magicDefense,1000);
 assert.equal(resolved.summonStatuses?.length??0,0);
 assert.equal(resolved.log.filter(e=>e.kind==="STATUS").length,0);
});

test("magic rider cannot choose external targets, bypass area restrictions or forge effects",()=>{
 const invalid=[
  {status:"PENDING"},{approvedAt:null},{pchCost:0},
  {cost:0},{maintenanceCost:1},{accumulationCost:2},
  {areaOfEffect:"Contacto | Alcance máximo: 5 m"},
  {areaOfEffect:"Área circular de 3 m | Alcance máximo: 5 m"},
  {areaOfEffect:"Objetivo único | Alcance máximo: 10 m"},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:150},effect()]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100,element:"FIRE"},effect()]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},effect(1.2)]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},effect(-30,"BONUS")]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},
   effect(0.8,"MULTIPLIER","RACE")]},
  {effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},effect()]},
 ];
 for(const [i,patch] of invalid.entries()){
  const row=spell(600+i,patch);
  assert.equal(previewSkillExecution(row).executable,false,"invalid #"+i);
  assert.throws(()=>compileCombatSkill(row),"invalid #"+i);
 }
 assert.throws(()=>compileCombatSkill(spell(700),"LEGACY_ONLY"),/desactivados/);
 const valid=compileCombatSkill(spell(702));
 for(const [i,attempt] of [
  {targetConstructionId:"forged"},
  {targetSummonId:"foreign"},
 ].entries()){
  const source=encounter(),snap=structuredClone(source);
  assert.throws(()=>cast(source,valid,{requestId,areaCenter:{x:.5,y:.5},...attempt}),
   /solo puede acompañar un ataque dirigido al rival/,"target #"+i);
  assert.deepEqual(source,snap);
 }
});

test("magical status cast button respects active flag and correctly requires aim",()=>{
 const row=spell(),list=projectApprovedCombatSkills([row],[],new Set(),()=>true);
 assert.equal(list[0].executable,true);
 assert.equal(list[0].modularHostileStatus,true);
 assert.equal(list[0].usesMagic,true);
 assert.equal(list[0].needsAim,true);
 const disabled=projectApprovedCombatSkills([row],[{skillId:row.id,active:false}],
  new Set(),()=>true);
 assert.equal(disabled[0].executable,false);
 assert.match(disabled[0].disabledReason,/desactivada/);
});
