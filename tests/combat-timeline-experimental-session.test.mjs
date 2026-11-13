import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {
 parseExperimentalV2Command,newExperimentalTimeline,
 submitExperimentalTimelineCommand,experimentalTrainingNpcCommand,
} from "../lib/combat/timeline-experiment.ts";

const fighter=(name,x)=>({
 name,characterId:name==="Hero"?10:null,positionMeters:x,
 hp:1000,maxHp:1000,agility:100,constitution:40,
 strength:20,precision:80,dodge:8,physicalAttack:25,
 physicalDefense:4,magicAttack:12,magicDefense:6,
 critical:0,luck:0,race:20,massKg:70,
 attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,
});
const combat=(distance=.5)=>
 newCombatState(fighter("Hero",0),fighter("Training",distance),"PLAYER",true);
const dice=()=>({hit:0.01,critical:0.99,defense:0.99});
const hit={kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const load=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("V2 laboratory accepts only a narrow action command vocabulary",()=>{
 assert.deepEqual(parseExperimentalV2Command({kind:"WAIT"}),{kind:"WAIT"});
 assert.deepEqual(parseExperimentalV2Command({kind:"MOVE",direction:"TOWARD",meters:.5}),
   {kind:"MOVE",direction:"TOWARD",meters:.5});
 for(const input of [
   {kind:"CAST_SKILL",skillId:88},
   {...hit,cost:0},
   {...hit,ticks:1},
   {kind:"MOVE",direction:"VECTOR",meters:10},
   {kind:"GUARD",weaponSlot:"FAKE"},
   {kind:"ATTACK",attackType:"PIERCE",targetSummonId:"foo"},
   {kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:999,y:0}]},
   {kind:"PREPARE_REACTION",defense:"DODGE",charges:99},
 ]){
   assert.throws(()=>parseExperimentalV2Command(input),/V2|autorizada/);
 }
});

test("experimental V2 is a clean fresh session and never modifies its seed",()=>{
 const seed=combat(),previous=structuredClone(seed);
 const instance=newExperimentalTimeline(seed);
 assert.equal(instance.combat.timelineMode,"SHARED");
 assert.equal(instance.timeline.clock.nowTick,0);
 assert.equal(instance.combat.tick,0);
 assert.deepEqual(seed,previous);
 const pvp=combat();pvp.actors.NPC.characterId=80;
 assert.throws(()=>newExperimentalTimeline(pvp),/entrenamiento/);
 const passive=combat();passive.microEffects={definitions:{foo:[{moduleId:"x"}]}};
 assert.throws(()=>newExperimentalTimeline(passive),/resolutor temporal/);
});

test("one player order queues autonomous NPC and resolves together on server dice",async()=>{
 const initial=newExperimentalTimeline(combat());
 const before=structuredClone(initial.combat);
 const received=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,hit,"experiment-unique-0001",dice);
 assert.equal(received.replayed,false);
 assert.equal(received.combat.tick,10);
 assert.ok(received.combat.actors.NPC.hp<1000);
 assert.ok(received.combat.actors.PLAYER.hp<1000);
 assert.equal(received.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.equal(received.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(received.timeline.receipts["V2_PLAYER:experiment-unique-0001"]);
 assert.deepEqual(initial.combat,before,"the transaction input stays unchanged");
 const retry=await submitExperimentalTimelineCommand(received.combat,
   received.timeline,hit,"experiment-unique-0001",dice);
 assert.equal(retry.replayed,true);
 assert.equal(retry.batches,0);
 assert.deepEqual(retry.combat,received.combat);
 await assert.rejects(()=>submitExperimentalTimelineCommand(received.combat,
   received.timeline,{kind:"WAIT"},"experiment-unique-0001",dice),
   /diferente|reutiliz/);
});

test("NPC AI moves toward a far opponent and attacks without client orders",()=>{
 const distant=combat(2);
 const move=experimentalTrainingNpcCommand(distant);
 assert.equal(move.kind,"MOVE");
 assert.equal(move.direction,"TOWARD");
 const close=combat(.5),attack=experimentalTrainingNpcCommand(close);
 assert.equal(attack.kind,"ATTACK");
 assert.equal(attack.attackSource,"FIST_RIGHT");
});

test("new encounter opt-in, private projection and V1 route separation are wired",()=>{
 const creation=load("app/api/combat/duels/route.ts");
 const route=load("app/api/combat/[id]/timeline/route.ts");
 const legacy=load("app/api/combat/[id]/actions/route.ts");
 const read=load("app/api/combat/[id]/route.ts");
 const page=load("app/combat/[id]/page.tsx");
 const launcher=load("app/combat/DuelLauncher.tsx");
 assert.match(creation,/experiment&&\(!gm/);
 assert.match(creation,/newExperimentalTimeline\(initial\)/);
 assert.match(creation,/lastAction:\{combatV1:state,/);
 assert.match(route,/UPDATE public\."combatSession" SET id=id/);
 assert.match(route,/submitExperimentalTimelineCommand\(/);
 assert.match(route,/privateProjectiles/);
 assert.match(legacy,/Las acciones V1 no pueden modificar una sesión V2/);
 assert.match(read,/combatV2:\{version:2,experimental:true\}/);
 assert.match(page,/CombatV2Encounter/);
 assert.match(launcher,/experimentalV2:options\.experimentalV2Available/);
});
