import test from "node:test";
import assert from "node:assert/strict";
import {
  actionPoints, applyCombatCommand, canAct, contestChance, deflectionAlignment,
  knockbackMeters, matchupMultiplier, newCombatState, remainingAp, turnTicks,
} from "../lib/combat/turn-engine.ts";

const fighter = (name, agility = 100, overrides = {}) => ({
  characterId:null,name,hp:100,maxHp:100,agility,strength:10,constitution:1,
  precision:30,dodge:30,physicalAttack:18,physicalDefense:6,
  magicAttack:12,magicDefense:4,critical:10,luck:10,race:20,
  massKg:70,positionMeters:0,weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
  spentTicks:0,spentAp:0,...overrides,
});
const move = {kind:"MOVE",meters:1};
const attack = {kind:"ATTACK",attackType:"CUT",trajectory:[{x:0,y:0.5},{x:1,y:0.5}]};
const rolls = {hit:0.2,critical:0.9,defense:0.9};

test("100 ticks allow ten moves at 100 AGI vs five at 50 AGI with 10 AP",()=>{
  let state = newCombatState(fighter("A",100),fighter("B",50));
  assert.equal(actionPoints(1),10);
  for(let i=0;i<10;i++) {
    if(i%2===0) {
      state=applyCombatCommand(state,"PLAYER",move);
      state=applyCombatCommand(state,"PLAYER",move);
      state=applyCombatCommand(state,"NPC",move);
    } else {
      // Next turns are handled above; no extra action needed.
    }
  }
  assert.equal(state.round,2);
  assert.equal(state.actors.PLAYER.spentAp,0);
  assert.equal(state.actors.NPC.spentAp,0);
  assert.equal(state.log.filter(x=>x.kind==="MOVE"&&x.by==="PLAYER").length,10);
  assert.equal(state.log.filter(x=>x.kind==="MOVE"&&x.by==="NPC").length,5);
});
test("a third rapid move waits for the slower participant",()=>{
  let s=newCombatState(fighter("A",100),fighter("B",50));
  s=applyCombatCommand(s,"PLAYER",move);
  s=applyCombatCommand(s,"PLAYER",move);
  assert.equal(canAct(s,"PLAYER"),false);
  assert.throws(()=>applyCombatCommand(s,"PLAYER",move),/Espera/);
  assert.equal(canAct(s,"NPC"),true);
});
test("an attack requires a selected defense before HP changes",()=>{
  let s=newCombatState(fighter("A"),fighter("B"));
  s=applyCombatCommand(s,"PLAYER",attack);
  assert.ok(s.pending);
  assert.equal(s.actors.NPC.hp,100);
  assert.throws(()=>applyCombatCommand(s,"PLAYER",move),/pendiente/);
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
  assert.equal(s.pending,null);
  assert.ok(s.actors.NPC.hp<100);
});
test("dodge resolves a single contested roll, not two dodges",()=>{
  let s=newCombatState(fighter("A"),fighter("B"));
  s=applyCombatCommand(s,"PLAYER",attack);
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DODGE"},{...rolls,hit:0.9});
  assert.equal(s.actors.NPC.hp,100);
  s=newCombatState(fighter("A"),fighter("B"));
  s=applyCombatCommand(s,"PLAYER",attack);
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DODGE"},{...rolls,hit:0.1});
  assert.ok(s.actors.NPC.hp<100);
});
test("weapon durability 100 cannot make a weak child resist a very strong blow",()=>{
  let s=newCombatState(fighter("Troll",50,{strength:180,physicalAttack:160}),
    fighter("Niño",40,{constitution:1,weaponIntegrity:100,physicalDefense:2}));
  s=applyCombatCommand(s,"PLAYER",{...attack,attackType:"BLUNT"});
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK"},{hit:0.2,critical:0.9,defense:0.99});
  assert.ok(s.actors.NPC.hp<100);
  assert.ok(s.actors.NPC.weaponIntegrity<100);
});
test("rock paper scissors is symmetric across all three attack and defense types",()=>{
  const attacks=["CUT","BLUNT","PIERCE"], defenses=["CONCENTRATED","DISPERSED","SOLID"];
  for(const a of attacks) {
    const sorted=defenses.map(d=>matchupMultiplier(a,d)).sort((x,y)=>x-y);
    assert.deepEqual(sorted,[0.8,1,1.2]);
  }
  for(const d of defenses) {
    const sorted=attacks.map(a=>matchupMultiplier(a,d)).sort((x,y)=>x-y);
    assert.deepEqual(sorted,[0.8,1,1.2]);
  }
});
test("trajectories affect deflection and mass affects knockback",()=>{
  const horizontal=[{x:0.1,y:0.5},{x:0.9,y:0.5}];
  assert.equal(deflectionAlignment(horizontal,90),1);
  assert.equal(deflectionAlignment(horizontal,0),0);
  assert.ok(knockbackMeters(120,10,35)>knockbackMeters(120,10,100));
});
test("simulation: 10k symmetric contests avoid first-player bias",()=>{
  let seed=1729;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let hits=0;
  for(let i=0;i<10000;i++) {
    const s0=newCombatState(fighter("A"),fighter("B"));
    const s1=applyCombatCommand(s0,"PLAYER",attack);
    const s2=applyCombatCommand(s1,"NPC",{kind:"DEFEND",defense:"DODGE"},
      {hit:random(),critical:random(),defense:random()});
    if(s2.actors.NPC.hp<100)hits++;
  }
  console.log("COMBAT_BALANCE accuracy_symmetric_10000="+hits+"/10000");
  assert.ok(hits>4700 && hits<5300,`expect ~50% accuracy; got ${hits}`);
  assert.equal(contestChance(100,100),0.5);
});

test("Monte Carlo: 1000 complete equal-stat duels produce no runaway winner bias",()=>{
 let seed=20261103;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let first=0,second=0;
 for(let trial=0;trial<1000;trial++) {
  let state=newCombatState(fighter("A"),fighter("B",100,{positionMeters:1.5}));
  let n=0;
  while(state.status==="ACTIVE"&&n++<1000) {
   if(state.pending) {
    const against=state.pending.against;
    state=applyCombatCommand(state,against,{kind:"DEFEND",defense:"DODGE"},
      {hit:random(),defense:random(),critical:random()});
    continue;
   }
   const canPlayer=canAct(state,"PLAYER"),canNpc=canAct(state,"NPC");
   if(!canPlayer&&!canNpc)throw Error("Combat scheduler deadlocked");
   let by=canPlayer?"PLAYER":"NPC";
   if(canPlayer&&canNpc) {
    const delta=state.actors.PLAYER.spentTicks-state.actors.NPC.spentTicks;
    by=delta<0?"PLAYER":delta>0?"NPC":random()<0.5?"PLAYER":"NPC";
   }
   state=applyCombatCommand(state,by,attack);
  }
  assert.equal(state.status,"FINISHED");
  if(state.winner==="PLAYER")first++; else second++;
 }
 console.log("COMBAT_BALANCE duel_wins_1000 PLAYER="+first+" NPC="+second);
 assert.equal(first+second,1000);
 assert.ok(first>430&&first<570,`biased complete duel winners: ${first}/1000`);
});
