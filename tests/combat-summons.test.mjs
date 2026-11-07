import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {compileSummonTemplates,summonStat} from "../lib/combat/summons.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,basicCounterAttack,canAct,remainingAp} from "../lib/combat/turn-engine.ts";
import {chooseNpcReaction,progressTrainingNpc} from "../lib/combat/npc-policy.ts";
import {isCombatActionReplay,recordCombatAction} from "../lib/combat/action-idempotency.ts";

const fighter=(name,positionMeters,override={})=>({
 characterId:null,name,hp:120,maxHp:120,agility:100,speedValue:100,
 strength:40,constitution:10,precision:30,dodge:20,
 physicalAttack:100,physicalDefense:25,magicAttack:80,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,...override
});
const selected=(entityKey="FAMILIAR",factor=0.2)=>[
 {kind:"SUMMON_ENTITY",entityKey,label:"Familiar",manaCost:30,maintenanceMana:20,
  durationTurns:2,controlRangeMeters:15,hitLimit:3},
 {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor},
 {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"AGI",destStat:"AGI",factor:1},
 {kind:"LINK_ENTITY_STAT",entityKey,sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
 {kind:"SET_ENTITY_BEHAVIOR",entityKey,mode:"ATTACK",allowedModes:["ATTACK","FOLLOW","MANUAL"],
  target:"OPPONENT",trigger:"CONTACT"}
];
const configured=(steps,changes={})=>({
 id:101,name:"Invocación genérica",status:"APPROVED",category:"UTILITY",
 cost:30,maintenanceCost:20,effect:[{type:"COMPOSED",module:{
  id:"SUMMON_GRAPH",name:"Criatura",type:"COMPOSED",description:"",trigger:"ACTIVATE",steps
 }}],...changes,
});
const rolls={hit:0.2,critical:0.99,defense:0.5};
const makeState=(f1=fighter("A",0),f2=fighter("B",1.3))=>{
 const s=newCombatState(f1,f2);
 s.mana={PLAYER:{current:150,max:150},NPC:{current:150,max:150}};
 return s;
};
const cast=(s,plan,requestId="summon-request-123456")=>applyResolvedCombatSkill(s,"PLAYER",plan,
 {requestId},rolls);

test("an approved composed graph becomes a summon skill without aim or free mana",()=>{
 const skill=configured(selected());
 const plan=compileCombatSkill(skill);
 assert.equal(plan.category,"SUMMON");
 assert.equal(plan.cost,30);
 assert.equal(plan.summons.length,1);
 assert.equal(plan.summons[0].maintenanceMana,20);
 assert.equal(previewSkillExecution(skill).needsAim,false);
 const before=makeState();
 const after=cast(before,plan);
 assert.equal(after.summons.length,1);
 assert.equal(after.mana.PLAYER.current,120);
 assert.equal(after.actors.PLAYER.spentAp,1);
 assert.ok(after.actors.PLAYER.spentTicks>0);
 assert.deepEqual(before.summons,[]);
 assert.equal(after.summons[0].integrity,50);
 assert.equal(after.summons[0].expiresAtRound,3);
 assert.equal(summonStat(after.summons[0],after.actors.PLAYER,"PHYSICAL_ATTACK"),20);
 assert.equal(cast(after,plan),after,"retransmission must never spend again");
});

test("rejects mixed, unauthorized, underpriced or malformed summoning",()=>{
 assert.throws(()=>compileCombatSkill(configured(selected(),{cost:5})),/maná de la habilidad/);
 assert.throws(()=>compileCombatSkill(configured(selected(),{maintenanceCost:0})),/mantenimiento/);
 const mixed=configured(selected(),{effect:[
   configured(selected()).effect[0],{type:"DAMAGE_MULTIPLIER",target:"PHYS_ATK",value:100}
 ]});
 assert.throws(()=>compileCombatSkill(mixed),/mezcles módulos/);
 const ability=configured([...selected(),{kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"victim"},
   stat:"STR",operation:"MULTIPLIER",value:0.5,durationTurns:2}]);
 assert.throws(()=>compileCombatSkill(ability),/Micromódulo inválido|resolutor|objetivo/);
 const wrongStat=configured(selected().map(step=>step.kind==="LINK_ENTITY_STAT"&&step.destStat==="INTEGRITY"
   ?{...step,sourceStat:"PHYSICAL_ATTACK"}:step));
 assert.throws(()=>compileCombatSkill(wrongStat),/defensa física/);
});

test("order an attack with linked 20% offense, resolving through normal paid defense",()=>{
 const plan=compileCombatSkill(configured(selected()));
 let s=cast(makeState(fighter("A",0,{speedValue:250,agility:250}),fighter("B",1.2,{physicalDefense:5,speedValue:20,agility:20})),plan);
 const id=s.summons[0].id;
 assert.ok(canAct(s,"PLAYER"),"fast owner still has initiative budget after summon");
 const ap=s.actors.PLAYER.spentAp;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",order:"ATTACK",summonId:id});
 assert.equal(s.pending.summonId,id);
 assert.equal(s.actors.PLAYER.spentAp,ap+1);
 const hp=s.actors.NPC.hp;
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.ok(s.actors.NPC.hp<hp,"summon attack must actually lower the target's HP");
 assert.ok(hp-s.actors.NPC.hp<40,"20% summon offense must not inherit owner's full 100 attack");
 assert.equal(s.pending,null);
});

test("training NPC never chooses a simultaneous counter against a summon strike",()=>{
 const plan=compileCombatSkill(configured(selected()));
 let s=cast(makeState(fighter("Caster",0,{speedValue:250,agility:250}),
   fighter("Training NPC",1.2,{speedValue:20,agility:20})),plan);
 const summonId=s.summons[0].id;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",order:"ATTACK",summonId});
 assert.equal(s.pending.summonId,summonId);
 s.actors.NPC.spentTicks=80; // A normal defense would consume the NPC's remaining window.
 assert.ok(basicCounterAttack(s,"NPC"),"the original bug could offer a forbidden counter");
 assert.notEqual(chooseNpcReaction(s,()=>0.2).defense,"COUNTER");
 const resolved=progressTrainingNpc(s,()=>rolls,()=>0.2);
 assert.ok(resolved.log.some(e=>e.kind==="RESOLVE"&&e.summonId===summonId));
 assert.equal(resolved.pending,null);
});

test("owner can change only approved behaviors, and summon manual move obeys the radius",()=>{
 const plan=compileCombatSkill(configured(selected()));
 let s=cast(makeState(fighter("A",0,{speedValue:250,agility:250}),fighter("B",2,{speedValue:20,agility:20})),plan);
 const id=s.summons[0].id;
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",order:"CHANGE_BEHAVIOR",summonId:id,newBehavior:"PROTECT"
 }),/no está autorizado/);
 s=applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",order:"CHANGE_BEHAVIOR",summonId:id,newBehavior:"MANUAL"
 });
 assert.equal(s.summons[0].behavior.mode,"MANUAL");
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",order:"MOVE",summonId:id,planarMove:{x:50,y:0}
 }),/no puede recorrer|radio de control|debe medir entre 0,01 y 1 m/);
});

test("an opponent may strike a summon instead of the fighter and spend its own attack",()=>{
 const plan=compileCombatSkill(configured(selected()));
 let s=cast(makeState(fighter("A",0,{physicalDefense:100}),fighter("B",0.9,{
   physicalAttack:20,physicalDefense:10
 })),plan);
 const summonId=s.summons[0].id;
 assert.equal(s.summons[0].integrity,200);
 assert.ok(canAct(s,"NPC"));
 s=applyCombatCommand(s,"NPC",{kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}],targetSummonId:summonId},rolls);
 assert.equal(s.summons[0].hitCount,1);
 assert.ok(s.summons[0].integrity<200);
 assert.equal(s.actors.PLAYER.hp,120,"striking a summon must not harm its caster");
 assert.equal(s.actors.NPC.spentAp,1);
 assert.equal(s.pending,null);
});

test("summon orders are covered by the shared replay signature ledger",()=>{
 const cmd={kind:"COMMAND_SUMMON",order:"ACT",summonId:"x",requestId:"summon-order-replay-123"};
 const state=makeState();
 assert.equal(isCombatActionReplay(state,"PLAYER",cmd),false);
 const recorded=recordCombatAction(state,state,"PLAYER",cmd);
 assert.equal(isCombatActionReplay(recorded,"PLAYER",cmd),true);
 assert.throws(()=>isCombatActionReplay(recorded,"PLAYER",{...cmd,order:"MOVE"}),/reutilizado/);
});
