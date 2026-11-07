import test from "node:test";
import assert from "node:assert/strict";
import {
 actionPoints,applyCombatCommand,canAct,newCombatState,remainingAp,turnTicks,
} from "../lib/combat/turn-engine.ts";
import {isCombatActionReplay,recordCombatAction} from "../lib/combat/action-idempotency.ts";

const fighter=(name,speed,positionMeters,overrides={})=>({
 characterId:null,name,hp:500,maxHp:500,speedValue:speed,agility:speed,
 strength:8,constitution:10,precision:45,dodge:30,
 physicalAttack:10,physicalDefense:10,magicAttack:15,magicDefense:10,
 critical:0,luck:15,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
 equippedWeapon:{name:"Espada",attackType:"CUT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2},
 spentTicks:0,spentAp:0,...overrides
});
const dice={hit:.02,critical:.99,defense:.8};
const magic={kind:"ATTACK",usesMagic:true,attackType:"CUT",areaCenter:{x:.5,y:.5}};
const initial=()=>{
 const state=newCombatState(fighter("Maga",100,0),fighter("Guardia",38,1.5));
 state.mana={PLAYER:{current:40,max:40},NPC:{current:20,max:20}};
 return state;
};
const incoming=state=>applyCombatCommand(state,"PLAYER",magic,dice);
const defend=(state,command)=>applyCombatCommand(state,"NPC",command,dice,undefined,undefined,undefined,false,dice);

test("multiple same-round reactions pay once each; spent ticks saturate and later hits remain resolvable",()=>{
 let state=initial();
 const defenses=[
  {kind:"DEFEND",defense:"MAGIC_FIELD"},
  {kind:"DEFEND",defense:"COUNTER"},
  {kind:"DEFEND",defense:"ENDURE"},
  {kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.5,y:.5}},
 ];
 assert.equal(turnTicks(state.actors.PLAYER),10);
 assert.equal(turnTicks(state.actors.NPC),27);
 for(let n=0;n<defenses.length;n++){
  assert.equal(canAct(state,"PLAYER"),true,"the fast fighter still has a valid initiative");
  state=incoming(state);
  assert.ok(state.pending,"one unresolved strike before each reaction");
  const beforeMana=state.mana.NPC.current;
  state=defend(state,defenses[n]);
  assert.equal(state.pending,null);
  assert.equal(state.round,1);
  assert.equal(state.actors.NPC.spentAp,n+1);
  assert.equal(state.actors.NPC.spentTicks,Math.min(100,(n+1)*27));
  assert.equal(state.mana.NPC.current,beforeMana-(n===0?1:0),
   "only the magical field should consume defender mana");
 }
 assert.equal(state.actors.NPC.spentTicks,100);
 assert.equal(state.actors.NPC.spentAp,4);
 const beforeHp=state.actors.NPC.hp;
 const beforeMana=state.mana.NPC.current;
 const beforePosition=state.actors.NPC.positionMeters;
 state=incoming(state);
 // A stale client may still offer the last selected reaction, possibly
 // with a drawn movement. No secondary paid defense can happen at 100 ticks.
 state=defend(state,{kind:"DEFEND",defense:"COUNTER",planarMove:{x:.2,y:0}});
 assert.equal(state.pending,null);
 assert.equal(state.actors.NPC.spentAp,4);
 assert.equal(state.actors.NPC.spentTicks,100);
 assert.equal(state.mana.NPC.current,beforeMana);
 assert.equal(state.actors.NPC.positionMeters,beforePosition);
 assert.ok(state.actors.NPC.hp<=beforeHp);
 assert.equal(state.log.filter(e=>e.kind==="RESOLVE").length,6,
  "four incoming strikes plus a counter and the exhausted reaction");
 assert.equal(state.log.filter(e=>e.simultaneousCounter).length,2,
  "one paid exchange contributes one ATTACK and one RESOLVE event");
});

test("exhausted defender accepts MAGIC_FIELD and invalid-for-magic BLOCK without new costs",()=>{
 for(const defense of ["MAGIC_FIELD","BLOCK","CONSTRUCTION","COUNTER"]){
  let state=initial();
  state.actors.NPC.spentTicks=100;
  state=incoming(state);
  const mana=state.mana.NPC.current;
  const resolved=defend(state,{kind:"DEFEND",defense,planarMove:{x:.5,y:0}});
  assert.equal(resolved.pending,null,defense);
  assert.equal(resolved.actors.NPC.spentTicks,100);
  assert.equal(resolved.actors.NPC.spentAp,0);
  assert.equal(resolved.mana.NPC.current,mana);
  const originalIncoming=resolved.log.findLast(e=>e.kind==="RESOLVE"&&e.by==="PLAYER");
  assert.equal(originalIncoming.defense,"NONE",defense);
 }
});

test("active defenders cannot smuggle free movement via NONE",()=>{
 const state=incoming(initial());
 assert.throws(()=>defend(state,{kind:"DEFEND",defense:"NONE",planarMove:{x:.2,y:0}}),
  /No puedes combinar movimiento con una reacción sin PA/);
 assert.equal(state.pending?.against,"NPC");
 assert.equal(state.actors.NPC.spentAp,0);
});

test("reactions at 1, 81 and 99 ticks cost one PA and never carry ticks over 100",()=>{
 for(const spentTicks of [1,81,99]){
  let state=initial();
  state.actors.NPC.spentTicks=spentTicks;
  state=incoming(state);
  state=defend(state,{kind:"DEFEND",defense:"ENDURE"});
  assert.equal(state.actors.NPC.spentAp,1);
  assert.equal(state.actors.NPC.spentTicks,Math.min(100,spentTicks+27));
  assert.equal(state.round,1);
  if(state.actors.NPC.spentTicks===100){
   state=incoming(state);
   const resolved=defend(state,{kind:"DEFEND",defense:"COUNTER"});
   assert.equal(resolved.actors.NPC.spentAp,1);
   assert.equal(resolved.log.at(-1).defense,"NONE");
  }
 }
});

test("exhausted action point budget also suppresses magic defense and counterattack",()=>{
 let state=initial();
 state.actors.NPC.spentTicks=1;
 state.actors.NPC.spentAp=actionPoints(state.actors.NPC.constitution);
 state=incoming(state);
 const original=structuredClone(state);
 const resolved=defend(state,{kind:"DEFEND",defense:"COUNTER"});
 assert.equal(resolved.pending,null);
 assert.equal(resolved.actors.NPC.spentAp,original.actors.NPC.spentAp);
 assert.equal(resolved.actors.NPC.spentTicks,1);
 assert.equal(resolved.log.at(-1).defense,"NONE");
});

test("a disconnected response can replay the first reaction without consuming the second",()=>{
 let state=incoming(initial());
 state.actors.NPC.spentTicks=99;
 const first={kind:"DEFEND",defense:"ENDURE",requestId:"multi-defense-00001"};
 const before=state;
 const resolved=defend(state,first);
 state=recordCombatAction(before,resolved,"NPC",first);
 const restored=JSON.parse(JSON.stringify(state));
 assert.equal(isCombatActionReplay(restored,"NPC",first),true);
 assert.deepEqual(restored,state);
 assert.equal(restored.log.filter(e=>e.kind==="RESOLVE").length,1);
 state=incoming(restored);
 const second={kind:"DEFEND",defense:"COUNTER",requestId:"multi-defense-00002"};
 assert.equal(isCombatActionReplay(state,"NPC",second),false);
 const accepted=defend(state,second);
 assert.equal(accepted.pending,null);
 assert.equal(accepted.actors.NPC.spentAp,1,"the earlier 99-tick reaction used its only window");
 assert.equal(accepted.log.filter(e=>e.kind==="RESOLVE").length,2);
});
