import test from "node:test";
import assert from "node:assert/strict";
import {
 applyCombatCommand, newCombatState, canAct, remainingAp,
} from "../lib/combat/turn-engine.ts";
import {
 BASIC_MAGIC_AREA_RADIUS, BASIC_MAGIC_RANGE_METERS, BASIC_MAGIC_MANA_COST,
 MAGIC_GUESS_TOLERANCE, guessedMagicCenter, magicImpactZone, combatClientView,
} from "../lib/combat/magic-area.ts";
import { progressTrainingNpc, chooseNpcReaction } from "../lib/combat/npc-policy.ts";

const fighter=(name,location=0,override={})=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,speedValue:100,
 strength:10,constitution:1,precision:30,dodge:30,
 physicalAttack:18,physicalDefense:6,magicAttack:150,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:location,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 ...override,
});
const makeState=(...args)=>{const state=newCombatState(...args);state.mana={PLAYER:{current:10,max:10},NPC:{current:10,max:10}};return state;};
const cast={kind:"ATTACK",attackType:"BLUNT",usesMagic:true,areaCenter:{x:0.18,y:0.15}};
const dice={hit:0.99,critical:0.99,defense:0.99};

test("basic magic shares the regular initiative and spends ticks and AP",()=>{
 let s=makeState(fighter("Caster"),fighter("Defender",2));
 assert.equal(BASIC_MAGIC_MANA_COST,1);
 assert.equal(BASIC_MAGIC_RANGE_METERS,4);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT"}),/alcance máximo/);
 s=applyCombatCommand(s,"PLAYER",cast);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.ok(s.actors.PLAYER.spentTicks>0);
 assert.equal(s.pending.usesMagic,true);
 assert.equal(s.pending.targetCenter.x,0.18);
 assert.equal(s.pending.areaHint,"superior izquierda");
 assert.equal(canAct(s,"NPC"),false);
});

test("invalid or out-of-range magic centers and distant targets are rejected",()=>{
 let s=makeState(fighter("Caster"),fighter("Defender",2));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT",usesMagic:true}),/centro/);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{...cast,areaCenter:{x:2,y:0.5}}),/centro/);
 s=makeState(fighter("Caster"),fighter("Defender",5));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",cast),/alcance mágico/);
});

test("defender receives only the telegraphed region, never the true circle center",()=>{
 const s=applyCombatCommand(makeState(fighter("Caster"),fighter("Defender",2)),"PLAYER",cast);
 const publicState=combatClientView(s);
 assert.equal(publicState.pending.targetCenter,undefined);
 assert.equal(publicState.pending.areaHint,"superior izquierda");
 assert.ok(!JSON.stringify(publicState).includes('"targetCenter"'));
 assert.deepEqual(s.pending.targetCenter,{x:0.18,y:0.15});
 const status=JSON.stringify(s);
 assert.ok(status.includes('"targetCenter"'));
});

test("area dodge requires a prediction and a successful dodge roll",()=>{
 const source=makeState(fighter("Caster"),fighter("Defender",2));
 const first=applyCombatCommand(source,"PLAYER",cast);
 assert.throws(()=>applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"DODGE"},dice),/Marca/);
 const escaped=applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"DODGE",predictedCenter:{x:0.2,y:0.15}},dice);
 assert.equal(escaped.actors.NPC.hp,100);
 assert.equal(escaped.log.at(-1).defense,"DODGE");
 assert.deepEqual(escaped.log.at(-1).predictedCenter,{x:0.2,y:0.15});
 assert.deepEqual(escaped.log.at(-1).areaCenter,{x:0.18,y:0.15});
 const missed=applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"DODGE",predictedCenter:{x:0.8,y:0.8}},dice);
 assert.ok(missed.actors.NPC.hp<100);
 assert.ok(missed.log.at(-1).damage<20,"basic spell damage must be modest despite 150 MATK");
 assert.equal(missed.actors.NPC.spentAp,1);
});

test("magic does not use physical deflection or consume weapon durability",()=>{
 const source=makeState(fighter("Caster"),fighter("Defender",2));
 const first=applyCombatCommand(source,"PLAYER",cast);
 assert.throws(()=>applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"DEFLECT",defenseAngle:90},dice),/explosión/);
 const endured=applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"ENDURE"},dice);
 assert.equal(endured.actors.NPC.weaponIntegrity,100);
 assert.ok(endured.actors.NPC.hp<100);
 assert.equal(endured.log.at(-1).damage>=0,true);
});

test("guess tolerance and circle hint work at arena edges",()=>{
 assert.equal(BASIC_MAGIC_AREA_RADIUS>0,true);
 assert.equal(MAGIC_GUESS_TOLERANCE>=BASIC_MAGIC_AREA_RADIUS,true);
 assert.equal(guessedMagicCenter({x:0.02,y:0.97},{x:0.02,y:0.98}),true);
 assert.equal(guessedMagicCenter({x:0.02,y:0.97},{x:0.8,y:0.8}),false);
 assert.equal(magicImpactZone({x:0.02,y:0.97}),"inferior izquierda");
});

test("training NPC may cast area magic without cheating when defending it",()=>{
 const player=fighter("Guha",0),npc=fighter("NPC",1.5);
 let s=makeState(player,npc,"NPC");
 s=progressTrainingNpc(s,()=>dice,()=>0.1);
 assert.equal(s.pending?.by,"NPC");
 assert.equal(s.pending?.usesMagic,true);
 assert.ok(s.pending.targetCenter);
 s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.log.some(x=>x.kind==="RESOLVE"&&x.areaCenter));
 let incoming=makeState(player,npc);
 incoming=applyCombatCommand(incoming,"PLAYER",cast);
 const fake=structuredClone(incoming);
 fake.pending.targetCenter={x:0.3,y:0.3}; // same coarse telegraph
 const a=chooseNpcReaction(incoming,()=>0.1);
 const b=chooseNpcReaction(fake,()=>0.1);
 assert.deepEqual(a,b);
 assert.equal(a.defense,"DODGE");
 assert.ok(a.predictedCenter);
});
