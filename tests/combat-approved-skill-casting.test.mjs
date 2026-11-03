import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {applyResolvedCombatSkill,applyCombatCommand,newCombatState,canAct}
 from "../lib/combat/turn-engine.ts";

const actor=(name,characterId,pos=0,other={})=>({
 characterId,name,hp:50,maxHp:100,agility:100,speedValue:100,
 strength:1,constitution:10,precision:100,dodge:10,
 physicalAttack:18,physicalDefense:6,magicAttack:22,magicDefense:4,
 critical:1,luck:10,race:20,massKg:70,positionMeters:pos,weaponIntegrity:100,
 attackType:"PIERCE",defenseType:"SOLID",spentTicks:0,spentAp:0,...other,
});
const state=()=>{const s=newCombatState(actor("Guha",101),actor("Other player",102,3),"PLAYER");
 s.mana={PLAYER:{current:50,max:50},NPC:{current:30,max:30}};return s;};
const offense=(id,magic=false)=>({
 id,name:"Rayo "+id,status:"APPROVED",category:"OFFENSIVE",cost:20,
 attackType:"PIERCE",duration:"Instantánea",cooldown:"1 turno",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 mechanics:{},condition:"",
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:magic?"MAGIC_ATTACK":"PHYSICAL_ATTACK",value:100},
  {type:magic?"IGNORE_MAGIC_DEF_MULTIPLIER":"IGNORE_PHYS_DEF_MULTIPLIER",value:50},
  {type:"FINAL_DAMAGE_MULTIPLIER",value:300},
 ],
});
const support=(id,options={})=>({
 id,name:"Curar "+id,status:"APPROVED",category:"SUPPORT",cost:5,
 cooldown:"2 turnos",duration:"Instantánea",effect:[{type:"RESOURCE_BONUS",target:"HP",value:12}],
 ...options,
});
const dice={hit:0.02,critical:0.99,defense:0.99};
const request=n=>`cast-request-0000${n}`;
test("approved physical skill uses configured 5m reach, damage x1/ignore DEF x0.5/final x3, and maná",()=>{
 const plan=compileCombatSkill(offense(2));
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.damageMultiplier,1);
 assert.equal(plan.defenseFactor,0.5);
 assert.equal(plan.finalMultiplier,3);
 let s=state();
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:0,y:0.5},{x:1,y:0.5}]}),/alcance máximo/);
 s=applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:request(1),trajectory:[{x:0,y:0.5},{x:0.5,y:0.5}]},dice);
 assert.equal(s.mana.PLAYER.current,30);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.pending.skill.id,2);
 assert.equal(s.pending.skill.finalMultiplier,3);
 assert.equal(s.skillCooldowns.PLAYER["2"],3);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.actors.NPC.hp<50);
 assert.equal(s.log.at(-1).skillId,2);
});

test("magical skill requires aiming its area and can use range 5m",()=>{
 const plan=compileCombatSkill(offense(3,true));
 assert.equal(plan.usesMagic,true);
 assert.throws(()=>applyResolvedCombatSkill(state(),"PLAYER",plan,{requestId:request(2)},dice),/centro/);
 const s=applyResolvedCombatSkill(state(),"PLAYER",plan,{requestId:request(3),areaCenter:{x:0.2,y:0.4}},dice);
 assert.deepEqual(s.pending.targetCenter,{x:0.2,y:0.4});
 assert.equal(s.pending.usesMagic,true);
});

test("one cast request is idempotent after a full serialized reload, including 0-cooldown healing",()=>{
 const plan=compileCombatSkill(support(4,{cooldown:"Sin cooldown"}));
 let s=applyResolvedCombatSkill(state(),"PLAYER",plan,{requestId:request(4)},dice);
 assert.equal(s.mana.PLAYER.current,45);
 assert.equal(s.actors.PLAYER.hp,62);
 s=JSON.parse(JSON.stringify(s));
 assert.deepEqual(applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:request(4)},dice),s);
 assert.equal(s.log.filter(e=>e.kind==="SKILL").length,1);
});

test("healing respects HP maximum, cooldown and insufficient mana",()=>{
 const plan=compileCombatSkill(support(7,{cost:50}));
 const s=state();
 s.actors.PLAYER.hp=99;
 const next=applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:request(5)},dice);
 assert.equal(next.actors.PLAYER.hp,100);
 assert.equal(next.mana.PLAYER.current,0);
 assert.equal(next.skillCooldowns.PLAYER["7"],4);
 const afterNpc=applyCombatCommand(next,"NPC",{kind:"WAIT"},dice);
 assert.throws(()=>applyResolvedCombatSkill(afterNpc,"PLAYER",plan,{requestId:request(6)},dice),/Maná insuficiente|cooldown/);
 assert.equal(s.actors.PLAYER.hp,99,"original session state must remain pure");
});

test("temporary stat bonus expires on the correct round",()=>{
 const plan=compileCombatSkill(support(8,{cost:5,duration:"1 turno",
  effect:[{type:"STAT_BONUS",target:"MAGIC_ATTACK",value:10}],
  cooldown:"Sin cooldown"}));
 let s=state();
 s=applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:request(7)},dice);
 assert.equal(s.actors.PLAYER.magicAttack,32);
 assert.equal(s.skillBonuses.length,1);
 // PvP round 1: opponent waits, player waits. Round 2 expires the buff.
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 assert.equal(s.actors.PLAYER.magicAttack,22);
 assert.equal(s.skillBonuses.length,0);
});

test("one-per-combat cooldown never resets even after a round",()=>{
 const plan=compileCombatSkill(support(9,{cost:0,cooldown:"Una vez por combate"}));
 let s=applyResolvedCombatSkill(state(),"PLAYER",plan,{requestId:request(8)},dice);
 assert.equal(s.skillCooldowns.PLAYER["9"],-1);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},dice);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice); // NPC opens tied round 2
 assert.throws(()=>applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:request(9)},dice),/una vez/);
});

test("unsupported narrative, passive, mechanics and ambiguous offensive effects are never executable",()=>{
 for(const row of [
  support(10,{effect:[{type:"NARRATIVE",value:1}]}),
  support(11,{category:"PASSIVE"}),
  support(12,{mechanics:{rules:[{event:"ACTIVATE",actions:[{kind:"MANA_WARD"}]}]}}),
  offense(13,false),
 ]){
  if(row.id===13)row.effect.push({type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100});
  const preview=previewSkillExecution(row);
  assert.equal(preview.executable,false);
  assert.ok(preview.disabledReason);
 }
});
test("client cannot bypass engine by sending cast with arbitrary damage",()=>{
 assert.throws(()=>applyCombatCommand(state(),"PLAYER",{
  kind:"CAST_SKILL",skillId:2,requestId:request(99),damageMultiplier:1e9,
 }),/habilidad sin autorización/);
});
