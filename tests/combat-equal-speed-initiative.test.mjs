import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCombatCommand, canAct, newCombatState, remainingAp,
} from "../lib/combat/turn-engine.ts";
import { progressTrainingNpc } from "../lib/combat/npc-policy.ts";

const fighter=(name,speed=38,overrides={})=>({
  characterId:null,name,hp:100,maxHp:100,agility:speed,speedValue:speed,
  strength:1,constitution:1,precision:62.33,dodge:136,
  physicalAttack:10.5,physicalDefense:10.5,magicAttack:20,magicDefense:10,
  critical:10,luck:31,race:1.25,massKg:70,positionMeters:0,
  weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
  spentTicks:0,spentAp:0,...overrides,
});
const dice=()=>({hit:0.1,critical:0.99,defense:0.2});

test("equal combat speed alternates MOVE and ATTACK initiatives (not two in a row)",()=>{
  let s=newCombatState(fighter("Guha"),fighter("NPC",38,{positionMeters:1.5}));
  assert.equal(canAct(s,"PLAYER"),true);
  assert.equal(canAct(s,"NPC"),false);
  s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),false);
  assert.equal(canAct(s,"NPC"),true);
  assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1}),/Espera/);
  s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),true);
  assert.equal(canAct(s,"NPC"),false);
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DODGE"},dice());
  assert.equal(canAct(s,"PLAYER"),false);
  assert.equal(canAct(s,"NPC"),true,"defending should not consume the NPC's initiative slot");
  assert.equal(remainingAp(s.actors.NPC),8,"defending still costs one action point");
});

test("NPC automatically counterattacks after a paid reaction on equal speed",()=>{
  let s=newCombatState(fighter("Guha"),fighter("NPC",38,{positionMeters:1.5}));
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
  // At equal speed, a paid defense can now be followed by the NPC's
  // alternating initiative; it no longer needs to forgo every defense.
  s=progressTrainingNpc(s,dice,()=>0.35);
  assert.equal(s.pending?.by,"NPC");
  assert.equal(s.pending?.against,"PLAYER");
  assert.equal(s.log.filter(e=>e.kind==="ATTACK"&&e.by==="NPC").length,1);
  assert.equal(s.actors.NPC.spentAp,2);
  assert.equal(s.actors.NPC.spentTicks,54);
  s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"DODGE"},dice());
  s=progressTrainingNpc(s,dice,()=>0.35);
  assert.equal(s.pending,null);
  assert.equal(canAct(s,"PLAYER"),true);
  assert.equal(canAct(s,"NPC"),false);
});

test("first initiative switches each round if combat speeds are equal",()=>{
  let s=newCombatState(fighter("Guha"),fighter("NPC",38,{positionMeters:1.5}));
  s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
  s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
  assert.equal(s.round,2);
  assert.equal(canAct(s,"NPC"),true);
  assert.equal(canAct(s,"PLAYER"),false);
  s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),true);
  assert.equal(canAct(s,"NPC"),false);
});

test("a fighter may finish remaining actions if the rival's budget is exhausted",()=>{
  let s=newCombatState(fighter("Guha"),fighter("NPC",38,{positionMeters:1.5}));
  s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
  s.actors.NPC.spentTicks=100;
  s.actors.NPC.spentAp=10;
  assert.equal(canAct(s,"PLAYER"),true);
  assert.equal(canAct(s,"NPC"),false);
  s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),true);
});

test("unequal speeds still allow two actions before the slower actor's one",()=>{
  let s=newCombatState(fighter("Fast",100),fighter("Slow",50,{positionMeters:1.5}));
  s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),true);
  s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
  assert.equal(canAct(s,"PLAYER"),false);
  assert.equal(canAct(s,"NPC"),true);
});
