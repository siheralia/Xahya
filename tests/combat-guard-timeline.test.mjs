import test from "node:test";
import assert from "node:assert/strict";
import {applyCombatCommand,hasActiveBlockGuard,newCombatState}
  from "../lib/combat/turn-engine.ts";

const sword={name:"Espada de entrenamiento",attackType:"CUT",mode:"MELEE",
  effectiveRangeMeters:2,maximumRangeMeters:2,durability:100};
const fighter=(name,agility,overrides={})=>({
  characterId:null,name,hp:200,maxHp:200,agility,strength:10,constitution:4,
  precision:50,dodge:10,physicalAttack:24,physicalDefense:5,
  magicAttack:8,magicDefense:4,critical:0,luck:0,race:20,
  massKg:70,positionMeters:0,weaponIntegrity:100,
  attackType:"CUT",defenseType:"SOLID",equippedWeapon:{...sword},
  spentTicks:0,spentAp:0,...overrides,
});
const shield=(durability=100)=>({name:"Escudo de prueba",slot:"OFF_HAND",
  itemType:"ARMOR",itemId:42,characterItemId:77,durability,
  materialPhysicalResistance:100});
const attack=trajectory=>({kind:"ATTACK",attackType:"CUT",trajectory});
const right=[{x:0,y:0.5},{x:1,y:0.5}];
const left=[{x:1,y:0.5},{x:0,y:0.5}];
const rolls={hit:0.05,critical:0.99,defense:0.01};

test("two sword strikes inside one shield interval cost only one BLOCK reaction",()=>{
 let s=newCombatState(fighter("Rápido",200),
   fighter("Escudero",100,{equippedWearables:[shield()]}));
 s=applyCombatCommand(s,"PLAYER",attack(right),rolls);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls);
 const first=s.actors.NPC.equippedWearables[0].durability;
 assert.ok(first<100,"first contact must wear the real shield");
 assert.equal(s.actors.NPC.spentAp,1);
 assert.equal(s.actors.NPC.spentTicks,10);
 assert.ok(s.activeBlocks?.NPC);
 s=applyCombatCommand(s,"PLAYER",attack(left),rolls);
 assert.equal(hasActiveBlockGuard(s,"NPC"),true);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK"},rolls);
 assert.equal(s.log.filter(x=>x.kind==="RESOLVE").at(-1)?.defense,"BLOCK");
 assert.equal(s.actors.NPC.spentAp,1,"still holding shield must not pay a second PA");
 assert.equal(s.actors.NPC.spentTicks,10,"still holding shield must not pay more ticks");
 assert.ok(s.actors.NPC.equippedWearables[0].durability<first,
   "the second blow independently wears the shield");
});

test("the raised block expires at its tick deadline, so the next hit is paid",()=>{
 let s=newCombatState(fighter("Rápido",200),
   fighter("Escudero",100,{equippedWearables:[shield()]}));
 s=applyCombatCommand(s,"PLAYER",attack(right),rolls);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls);
 s=applyCombatCommand(s,"PLAYER",attack(left),rolls);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 // The second hit arrived within the first window even though the caller
 // sent NONE: an equipped shield is still physically raised.
 assert.equal(s.log.filter(x=>x.kind==="RESOLVE").at(-1)?.defense,"BLOCK");
 s=applyCombatCommand(s,"PLAYER",attack(right),rolls);
 assert.equal(hasActiveBlockGuard(s,"NPC"),false);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls);
 assert.equal(s.actors.NPC.spentAp,2);
 assert.equal(s.actors.NPC.spentTicks,20);
});

test("breaking the shield cancels the stance before any next impact",()=>{
 let s=newCombatState(fighter("Rápido",200),
   fighter("Escudero",100,{equippedWearables:[shield(1)]}));
 s=applyCombatCommand(s,"PLAYER",attack(right),rolls);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(s.activeBlocks?.NPC,undefined);
 s=applyCombatCommand(s,"PLAYER",attack(left),rolls);
 assert.equal(hasActiveBlockGuard(s,"NPC"),false);
});

test("committed timeline never moves backwards when a slower action is logged",()=>{
 let s=newCombatState(fighter("A",50),fighter("B",100));
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:1});
 s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:1});
 s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:1});
 const events=s.narrativeHistory;
 assert.ok(events.length>=3);
 for(let i=1;i<events.length;i++)
   assert.ok(events[i].tick>=events[i-1].tick,
     "event "+i+" was incorrectly backdated");
 assert.equal(s.tick,events.at(-1).tick);
});
