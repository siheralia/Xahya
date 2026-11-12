import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,turnTicks} from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow}
 from "../lib/combat/timeline-basic-actions.ts";
import {commitAuthorizedTimelineBatch}
 from "../lib/combat/timeline-batch-resolver.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";
import {PROJECTILE_METERS_PER_TICK}
 from "../lib/combat/timeline-projectile-flight.ts";

const weapon=(mode="RANGED",throwable=false)=>({
 characterItemId:51,itemId:21,name:"Arco o lanza",
 attackType:"PIERCE",mode,effectiveRangeMeters:6,
 maximumRangeMeters:8,throwable,throwRangeMeters:8,durability:85,
});
const fighter=(name,x)=>({
 characterId:null,name,hp:200,maxHp:200,agility:100,strength:30,
 constitution:40,precision:100,dodge:0,physicalAttack:90,
 physicalDefense:4,magicAttack:20,magicDefense:5,critical:0,luck:0,
 race:20,massKg:70,positionMeters:x,attackType:"PIERCE",
 defenseType:"SOLID",weaponIntegrity:85,spentTicks:0,spentAp:0,
});
const fight=(thrown=false,dist=2)=>{
 const c=newCombatState(
   {...fighter("Tirador",0),equippedWeapon:weapon(thrown?"MELEE":"RANGED",thrown)},
   {...fighter("Blanco",dist)},"PLAYER",true);
 return c;
};
const attack=(thrown=false,changes={})=>({
 kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights:{launchMeters:1,impactMeters:1},
 ...(thrown?{throwWeapon:true}:{rangedPhysical:true}),...changes,
});
const dice=()=>({hit:.01,critical:.99,defense:.99});
const prepare=(c,command)=>{
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"PLAYER",command,"shot-one");
 session=declareTimelineCommand(session,c,"NPC",{kind:"WAIT"},"wait-one");
 return session;
};

test("server reserves windup + real flight; no damage or loss at declaration",async()=>{
 const c=fight(false,2),original=structuredClone(c);
 const session=prepare(c,attack());
 const fired=session.clock.events.find(e=>e.id==="shot-one");
 assert.equal(PROJECTILE_METERS_PER_TICK,.25);
 assert.equal(fired.projectileFlightTicks,8);
 assert.equal(fired.durationTicks,turnTicks(c.actors.PLAYER,"PIERCE")+8);
 assert.equal(session.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,original);
 const done=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(done.combat.tick,fired.endsAtTick);
 assert.ok(done.combat.actors.NPC.hp<200);
 assert.equal(done.combat.actors.PLAYER.equippedWeapon.characterItemId,51);
 assert.equal(done.combat.droppedWeapons?.length??0,0);
 assert.deepEqual(c,original);
});

test("an approved throw lands one equipped copy only at impact",async()=>{
 const c=fight(true,1),original=structuredClone(c);
 const session=prepare(c,attack(true));
 assert.equal(c.actors.PLAYER.equippedWeapon.characterItemId,51);
 const done=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(done.combat.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(done.combat.droppedWeapons.length,1);
 assert.equal(done.combat.droppedWeapons[0].owner,"PLAYER");
 assert.equal(done.combat.droppedWeapons[0].weapon.characterItemId,51);
 assert.equal(done.combat.droppedWeapons[0].slot,"MAIN_HAND");
 assert.equal(done.combat.droppedWeapons[0].fieldPosition.x,1);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,original);
});

test("arc height increases real flight ticks using measured path length",()=>{
 const c=fight(false,2);
 const flat=prepare(c,attack()).clock.events[0];
 const arc=prepare(c,attack(false,{
   projectileHeights:{launchMeters:1,impactMeters:1,arcRiseMeters:3},
 })).clock.events[0];
 assert.ok(arc.projectileFlightTicks>flat.projectileFlightTicks);
});

test("invalid, distant or forged projectile intent is rejected before PA",()=>{
 const c=fight();
 const s=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",
   attack(false,{projectileHeights:undefined}),"bad"),/alturas|puntería/i);
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",
   attack(false,{areaCenter:{x:5,y:0}}),"bad"),/alturas|puntería/i);
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",
   attack(false,{planarMove:{x:.1,y:0}}),"bad"),/sin movimiento|combinado/i);
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",
   attack(false,{projectileHeights:{launchMeters:50,impactMeters:1}}),"bad"),
   /altura|proyectil|metro/i);
 const distant=fight(false,10);
 assert.throws(()=>declareTimelineCommand(newTimelineDeclarationSession(distant),
   distant,"PLAYER",attack(false),"far"),/alcance/);
 assert.deepEqual(s.clock.actors.PLAYER.spentApByRound,{});
});

test("forged throw copy and landing coordinates reject the entire batch",()=>{
 const c=fight(true,1),original=structuredClone(c);
 let clock=newContinuousCombatTimeline(25,25);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"shot",kind:"ATTACK",durationTicks:14,paCost:1,projectileFlightTicks:4});
 clock=queueTimelineAction(clock,"NPC",
   {id:"wait",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 for(const change of [
   {characterItemId:99,landing:{x:1,y:0}},
   {characterItemId:51,landing:{x:9,y:0}},
 ]){
   assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
     {eventId:"shot",weaponThrows:[{owner:"PLAYER",
       slot:"MAIN_HAND",...change}]},
   ]),/arma|punto|encuentro/i);
 }
 assert.deepEqual(c,original);
});

test("flight is a tick interval, not extra PA or a new actor request",async()=>{
 const c=fight(false,2);
 const s=prepare(c,attack());
 assert.deepEqual(s.clock.actors.PLAYER.spentApByRound,{1:1});
 const impactTick=s.clock.events.find(e=>e.id==="shot-one").endsAtTick;
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,impactTick);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.ok(done.combat.log.some(e=>e.kind==="RESOLVE"&&e.tick===impactTick));
});
