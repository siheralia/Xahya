import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {combatSkillPreview,projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const part=(id,steps)=>({
 type:"COMPOSED",reviewedPch:20,
 module:{id,name:id,type:"COMBAT_SUPPORT",description:"Micromódulo revisado",
  trigger:"ACTIVATE",steps},
});
const healing=()=>part("SELF_HEAL",[
 {kind:"READ_STAT",actor:"USER",stat:"MAX_HP",output:"maxHp"},
 {kind:"CALCULATE",output:"healAmount",expression:{
  operator:"PERCENT",args:[{source:"OUTPUT",key:"maxHp"},10]}},
 {kind:"HEAL",amount:{source:"OUTPUT",key:"healAmount"}},
]);
const shielding=()=>part("SELF_SHIELD",[
 {kind:"BONUS",stat:"MAGIC_DEFENSE",amount:4},
]);
const approved=(id=91,extra={})=>({
 id,name:"Amparo entrelazado",status:"APPROVED",approvedAt:"2026-11-09T12:00:00Z",
 characterId:11,category:"SUPPORT",cost:8,pchCost:72,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,condition:"",
 mechanics:{},duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Personal | Alcance máximo: 0 m",
 effect:[healing(),shielding()],...extra,
});
const fighter=(name,id,pos)=>({
 characterId:id,name,hp:50,maxHp:100,agility:80,speedValue:90,
 strength:20,constitution:12,precision:80,dodge:12,
 physicalAttack:35,physicalDefense:12,magicAttack:30,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const state=()=>{
 const s=newCombatState(fighter("Bendición",11,0),fighter("Contrincante",22,3),"PLAYER");
 s.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const requestId="modular-support-action-001";
const cast=(s,plan=compileCombatSkill(approved()),aim={requestId})=>
 applyResolvedCombatSkill(s,"PLAYER",plan,aim,dice);
const roundEnd=s=>{
 let t=s;const target=s.round+1;
 for(let i=0;i<25&&t.round<target;i++){
  const side=canAct(t,"PLAYER")?"PLAYER":canAct(t,"NPC")?"NPC":null;
  assert.ok(side,"some actor must finish the current round");
  t=applyCombatCommand(t,side,{kind:"WAIT"},dice);
 }
 assert.equal(t.round,target);
 return t;
};

test("approved COMPOSED supports a real read -> calculate -> heal graph and timed magic defense",()=>{
 const plan=compileCombatSkill(approved());
 assert.equal(plan.category,"SUPPORT");
 assert.equal(plan.executionEngine,"MODULAR");
 assert.equal(plan.cost,8);
 assert.equal(plan.approvedActivation.definitions.length,2);
 assert.equal(plan.durationTurns,2);
 assert.equal(plan.cooldownRounds,1);
 assert.equal(plan.healing,0,"no hidden legacy healing bypasses interpreter");
 assert.deepEqual(plan.bonuses,[]);
 const s=state();
 const before=structuredClone(s);
 const next=cast(s,plan);
 assert.equal(next.actors.PLAYER.hp,60,"10% of actual MAX_HP restored");
 assert.equal(next.actors.PLAYER.magicDefense,14);
 assert.equal(next.mana.PLAYER.current,12);
 assert.equal(next.actors.PLAYER.spentAp,1);
 assert.equal(next.skillCooldowns.PLAYER["91"],3);
 assert.equal(next.skillBonuses[0].expiresAtRound,3);
 assert.equal(next.log.at(-1).manaCost,8);
 assert.equal(next.log.at(-1).healingPoints,10);
 assert.equal(activeCombatStatusViews(next,"PLAYER")[0].description,"Defensa mágica +4");
 assert.deepEqual(s,before,"original encounter is never mutated");
 const publicView=combatClientView(next);
 assert.equal(publicView.skillBonuses[0].value,4);
 assert.equal(publicView.microEffects,undefined,"private internal graph is not leaked");
 assert.equal(JSON.stringify(publicView).includes("SELF_HEAL"),false,
  "module step source must not leak via public combat state");
});

test("repeated request after JSON serialization does not duplicate mana HP PA or temporary bonuses",()=>{
 let s=cast(state());
 s=JSON.parse(JSON.stringify(s));
 const duplicate=cast(s);
 assert.deepEqual(duplicate,s);
 assert.equal(duplicate.mana.PLAYER.current,12);
 assert.equal(duplicate.skillBonuses.length,1);
 assert.equal(duplicate.actors.PLAYER.hp,60);
});

test("temporary modular buff expires on round 3 with exact original stat restored",()=>{
 let s=cast(state());
 s=roundEnd(s);
 assert.equal(s.round,2);
 assert.equal(s.actors.PLAYER.magicDefense,14);
 assert.equal(activeCombatStatusViews(s,"PLAYER").length,1);
 s=roundEnd(s);
 assert.equal(s.round,3);
 assert.equal(s.actors.PLAYER.magicDefense,10);
 assert.deepEqual(activeCombatStatusViews(s,"PLAYER"),[]);
 assert.equal(s.actors.PLAYER.hp,60,"turn expiration does not undo healing");
});

test("support spell cannot smuggle opponent targets, movement, projectile stroke or charge spending",()=>{
 const plan=compileCombatSkill(approved());
 for(const extras of [
  {areaCenter:{x:.4,y:.3}},{planarMove:{x:1,y:1}},
  {trajectory:[{x:0,y:0},{x:.3,y:.3}]},
  {attackSource:"MAIN_HAND"},{targetConstructionId:"mirror"},
  {targetSummonId:"creature"},{chargesToSpend:1},
 ]){
  const s=state(),before=structuredClone(s);
  assert.throws(()=>cast(s,plan,{requestId,...extras}),/no permite desplazamiento/);
  assert.deepEqual(s,before);
 }
});

test("unpriced, unapproved, targeted and unsupported COMPOSED graphs are never executable",()=>{
 const invalid=[
  {status:"PENDING"},{approvedAt:null},{pchCost:0},{category:"OFFENSIVE"},
  {cost:0},{maintenanceCost:3},{accumulationCost:2},{accumulationPerTick:1},
  {areaOfEffect:"Objetivo único | Alcance máximo: 5 m"},
  {areaOfEffect:"Área circular de 3 m | Alcance máximo: 5 m"},
  {condition:"Cuando haya luna"},{mechanics:{rules:[{action:"CHEAT"}]}},
  {effect:[healing(),{type:"RESOURCE_BONUS",target:"HP",value:10}]},
  {effect:[{...healing(),reviewedPch:undefined},shielding()]},
  {effect:[part("DAMAGE_MODULE",[{kind:"DAMAGE",amount:999,
   channel:"MAGICAL"}])]},
  {effect:[part("REPAIR_MODULE",[{kind:"READ_ITEM",selector:"SELF_ITEM",output:"item"},
   {kind:"REPAIR_DURABILITY",target:{source:"OUTPUT",key:"item"},amount:99}])]},
  {effect:[part("CONSUME_CHARGE",[{kind:"CONSUME",accumulator:"POOL",
   output:"charge",charges:"ALL"}])]},
  {effect:[part("TARGET_OTHER",[{kind:"READ_STAT",actor:"OPPONENT",
   stat:"MAX_HP",output:"hp"},{kind:"HEAL",amount:{source:"OUTPUT",key:"hp"}}])]},
 ];
 for(const [i,overrides] of invalid.entries()){
  const row=approved(100+i,overrides);
  assert.equal(previewSkillExecution(row).executable,false,
   "not executable "+i);
  assert.throws(()=>compileCombatSkill(row),"not executable "+i);
 }
});

test("evaluated power is bounded against the LIVE fighter, even if graphs are approved",()=>{
 const overHeal=approved(220,{effect:[
  part("HEAL_50_PCT",[{kind:"HEAL",amount:{
   operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},50]}}]),
 ] ,duration:"Instantánea"});
 const tooStrong=approved(221,{effect:[
  part("BONUS_101",[{kind:"BONUS",stat:"MAGIC_DEFENSE",amount:101}]),
 ]});
 for(const row of [overHeal,tooStrong]){
  const s=state(),before=structuredClone(s);
  const plan=compileCombatSkill(row);
  assert.throws(()=>cast(s,plan),/superan los límites|supera el máximo/);
  assert.deepEqual(s,before,"rejected action never debits mana or changes state");
 }
});

test("LEGACY_ONLY rollback blocks both real activation and player-visible button",()=>{
 const row=approved();
 assert.throws(()=>compileCombatSkill(row,"LEGACY_ONLY"),/desactivadas/);
 assert.equal(previewSkillExecution(row,"LEGACY_ONLY").executable,false);
 assert.equal(combatSkillPreview(row,false,true,"LEGACY_ONLY").executable,false);
 const roster=projectApprovedCombatSkills([row],[],new Set(),()=>true,"LEGACY_ONLY");
 assert.equal(roster[0].executable,false);
 assert.match(roster[0].disabledReason,/desactivadas/);
 assert.equal(combatSkillPreview(row,false,true,"MODULAR_FIRST").modularSupport,true);
 const disabled=projectApprovedCombatSkills([row],[{skillId:row.id,active:false}],
  new Set(),()=>true,"MODULAR_FIRST");
 assert.equal(disabled[0].executable,false,
  "an explicitly disabled modular support must not offer a live cast button");
 assert.match(disabled[0].disabledReason,/desactivada/);
 const noState=projectApprovedCombatSkills([row],[],new Set(),()=>true,"MODULAR_FIRST");
 assert.equal(noState[0].executable,true,
  "historical characters without an activation row retain their approved skill");
 const legacy=approved(92,{effect:[{type:"RESOURCE_BONUS",target:"HP",value:5}]});
 const legacyDisabled=projectApprovedCombatSkills([legacy],[{skillId:92,active:false}],
  new Set(),()=>true,"MODULAR_FIRST");
 assert.equal(legacyDisabled[0].executable,true,
  "do not silently redefine historical non-modular skill activation");
});

test("server action route uses approved owned skill, cooldown and persisted idempotent command",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const actions=read("app/api/combat/[id]/actions/route.ts");
 const skillApi=read("app/api/combat/[id]/skills/route.ts");
 const ui=read("app/combat/[id]/CombatEncounter.tsx");
 const loadout=read("app/combat/[id]/CombatSkillLoadout.tsx");
 const runtime=read("lib/combat/turn-engine.ts");
 assert.match(actions,/Skill\.where\(\{id:skillId,characterId,status:"APPROVED"\}\)/);
 assert.match(actions,/stolenIds\.has\(skillId\)/);
 assert.match(actions,/compileCombatSkill\(skill,mode\)/);
 assert.match(actions,/if\(plan\.approvedActivation\|\|plan\.approvedHostileStatus\)/);
 assert.match(actions,/activation\?\.active===false/);
 assert.match(actions,/processedSkillRequests\?\.includes\(requestId\)/);
 assert.match(skillApi,/readModularCutover\(\)/);
 assert.match(ui,/trajectory:skill\.skillKind==="OFFENSE"/);
 assert.match(ui,/targetConstructionId:skill\.skillKind==="OFFENSE"/);
 assert.match(loadout,/Soporte modular aprobado/);
 assert.match(runtime,/resolveApprovedSupportActivation\(plan\.approvedActivation,actor,by\)/);
 assert.match(runtime,/next\.processedSkillRequests=/);
 assert.doesNotMatch(actions,/executeMicroEvent\(/,
  "user request must never provide a graph");
});
