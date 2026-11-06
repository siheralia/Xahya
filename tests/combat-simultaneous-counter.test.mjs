import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyCombatCommand,basicCounterAttack,newCombatState,remainingAp,turnTicks} from "../lib/combat/turn-engine.ts";
import {chooseNpcReaction,progressTrainingNpc} from "../lib/combat/npc-policy.ts";

const fighter=(name,speed=16,positionMeters=0,extra={})=>({
 characterId:null,name,hp:100,maxHp:100,speedValue:speed,agility:speed,
 strength:10,constitution:11,precision:50,dodge:25,physicalAttack:22,
 physicalDefense:4,magicAttack:14,magicDefense:4,critical:10,luck:10,race:20,massKg:70,
 positionMeters,weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
 equippedWeapon:{name:"Espada",attackType:"CUT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2},
 spentTicks:0,spentAp:0,...extra
});
const dice={hit:0.15,critical:0.99,defense:0.9};
const magic={kind:"ATTACK",attackType:"CUT",usesMagic:true,areaCenter:{x:.5,y:.5}};

test("a basic counter accepts the incoming magic damage and deals simultaneous physical damage",()=>{
 let state=newCombatState(fighter("Hero",11),fighter("NPC",16,1.5));
 state.mana={PLAYER:{current:10,max:10},NPC:{current:10,max:10}};
 const before=structuredClone(state);
 state=applyCombatCommand(state,"PLAYER",magic,dice);
 assert.equal(basicCounterAttack(state,"NPC")?.attackSource,"MAIN_HAND");
 const response=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"COUNTER"},dice);
 assert.equal(response.pending,null);
 assert.ok(response.actors.NPC.hp<before.actors.NPC.hp,"the lightning still lands");
 assert.ok(response.actors.PLAYER.hp<before.actors.PLAYER.hp,"the counterstrike lands in the same exchange");
 assert.equal(response.actors.NPC.spentAp,1,"not free, even if the defender did not dodge");
 assert.equal(response.actors.NPC.spentTicks,turnTicks(before.actors.NPC,"CUT"));
 assert.equal(remainingAp(response.actors.NPC),remainingAp(before.actors.NPC)-1);
 assert.equal(response.mana.NPC.current,10,"physical counter does not consume magic");
 assert.ok(response.log.some(e=>e.kind==="RESOLVE"&&e.by==="NPC"));
 assert.ok(response.log.some(e=>e.kind==="RESOLVE"&&e.by==="PLAYER"&&e.defense==="COUNTER"));
});

test("two lethal hits resolve together, even when the original defender is knocked out",()=>{
 let state=newCombatState(
  fighter("Caster",11,0,{hp:1,maxHp:1,physicalDefense:0}),
  fighter("Target",16,1.5,{hp:1,maxHp:1,magicDefense:0})
 );
 state.mana={PLAYER:{current:2,max:2},NPC:{current:2,max:2}};
 state=applyCombatCommand(state,"PLAYER",magic,dice);
 state=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"COUNTER"},dice);
 assert.equal(state.actors.PLAYER.hp,0);
 assert.equal(state.actors.NPC.hp,0);
 assert.equal(state.status,"FINISHED");
 assert.equal(state.winner,null,"mutual knockout is a draw");
 assert.match(state.log.at(-1).summary,/empate/);
});

test("a distant fighter may counter with basic magic and pays one mana",()=>{
 let state=newCombatState(
  fighter("Caster",11,0),
  fighter("Distant",16,3,{equippedWeapon:undefined,magicAttack:20})
 );
 state.mana={PLAYER:{current:4,max:4},NPC:{current:2,max:2}};
 state=applyCombatCommand(state,"PLAYER",magic,dice);
 assert.equal(basicCounterAttack(state,"NPC")?.usesMagic,true);
 state=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"COUNTER",counterMagic:true},dice);
 assert.equal(state.mana.NPC.current,1);
 assert.equal(state.actors.NPC.spentAp,1);
 assert.ok(state.actors.PLAYER.hp<100);
});

test("counterattack never bypasses tick, AP, mana or range limits",()=>{
 let state=newCombatState(
  fighter("Hero",11,0),
  fighter("Distant",16,8,{equippedWeapon:undefined,magicAttack:0})
 );
 state.mana={PLAYER:{current:10,max:10},NPC:{current:0,max:0}};
 state=applyCombatCommand(state,"PLAYER",{...magic,areaCenter:{x:.5,y:.5}},dice,10);
 assert.equal(basicCounterAttack(state,"NPC"),null);
 assert.throws(()=>applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"COUNTER"},dice),/No tienes PA, ticks o un ataque básico al alcance/);
 state.actors.NPC.spentTicks=100;
 assert.equal(basicCounterAttack(state,"NPC"),null);
});

test("training NPC can exchange against repeated magic without a free proactive turn",()=>{
 let state=newCombatState(
  fighter("Hero",11,0,{magicAttack:30}),
  fighter("NPC",16,1.5,{hp:130,maxHp:130})
 );
 state.mana={PLAYER:{current:10,max:10},NPC:{current:10,max:10}};
 state=applyCombatCommand(state,"PLAYER",magic,dice);
 const reaction=chooseNpcReaction(state,()=>.2);
 assert.equal(reaction.defense,"COUNTER");
 const next=progressTrainingNpc(state,()=>dice,()=>.2);
 assert.equal(next.pending,null);
 assert.equal(next.actors.NPC.spentAp,1);
 assert.equal(next.log.filter(e=>e.kind==="ATTACK"&&e.by==="NPC").length,1);
 assert.ok(next.actors.PLAYER.hp<100);
});

test("combat UI offers explicit simultaneous exchange and server-selected attack mode",()=>{
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(page,/Intercambiar golpes/);
 assert.match(page,/Atacar mientras recibes el impacto/);
 assert.match(page,/basicCounterAttack\(state,side,counterMagic\)/);
 assert.match(page,/counterMagic:selectedDefense==="COUNTER"/);
 assert.match(page,/el daño recibido/i);
});

test("a simultaneous exchange advances the round only after paying both 100-tick actions",()=>{
 let state=newCombatState(fighter("Hero",8),fighter("NPC",8,1.5));
 state.mana={PLAYER:{current:4,max:4},NPC:{current:4,max:4}};
 state=applyCombatCommand(state,"PLAYER",magic,dice);
 assert.equal(state.actors.PLAYER.spentTicks,100);
 state=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"COUNTER"},dice);
 assert.equal(state.round,2,"the shared round finishes after both paid actions");
 assert.equal(state.actors.NPC.spentTicks,0,"the new round resets the spent ticks");
 assert.equal(state.actors.NPC.spentAp,0,"the new round resets spent PA");
 assert.equal(state.log.filter(e=>e.kind==="ROUND").length,1);
 assert.equal(state.log.filter(e=>e.kind==="ATTACK"&&e.by==="NPC").length,1);
});

test("the counterstrike uses its own server dice rather than reusing the incoming hit roll",()=>{
 const setup=()=>{
  let s=newCombatState(fighter("Hero",11),fighter("NPC",16,1.5));
  s.mana={PLAYER:{current:5,max:5},NPC:{current:5,max:5}};
  return applyCombatCommand(s,"PLAYER",magic,dice);
 };
 const normal=applyCombatCommand(setup(),"NPC",{kind:"DEFEND",defense:"COUNTER"},
  dice,undefined,undefined,undefined,false,{hit:.15,critical:.99,defense:.9});
 const critical=applyCombatCommand(setup(),"NPC",{kind:"DEFEND",defense:"COUNTER"},
  dice,undefined,undefined,undefined,false,{hit:.15,critical:0,defense:.9});
 assert.ok(critical.actors.PLAYER.hp<normal.actors.PLAYER.hp,
  "changing only counter dice must affect the counter damage");
 assert.equal(critical.actors.NPC.hp,normal.actors.NPC.hp,
  "incoming attack damage must remain unchanged");
});
