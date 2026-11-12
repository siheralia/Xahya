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
const fight=(thrown=false,dist=2)=>
 newCombatState(
   {...fighter("Tirador",0),equippedWeapon:weapon(thrown?"MELEE":"RANGED",thrown)},
   {...fighter("Blanco",dist)},"PLAYER",true);
const attack=(thrown=false,changes={})=>({
 kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights:{launchMeters:1,impactMeters:1},
 ...(thrown?{throwWeapon:true}:{rangedPhysical:true}),...changes,
});
const dice=()=>({hit:.01,critical:.99,defense:.99});
const wait=(s,c,owner,id)=>declareTimelineCommand(s,c,owner,{kind:"WAIT"},id);
const prepare=(c,command)=>{
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"PLAYER",command,"shot-one");
 session=wait(session,c,"NPC","wait-one");
 return session;
};
const advance=async(c,s,command={kind:"WAIT"},id="next-a")=>
 resolveBasicTimelineWindow(c,
   declareTimelineCommand(s,c,"PLAYER",command,id),dice);

test("preparation ends without damage; independent impact consumes world ticks",async()=>{
 const c=fight(false,2),original=structuredClone(c),s=prepare(c,attack());
 const fired=s.clock.events.find(e=>e.id==="shot-one");
 assert.equal(PROJECTILE_METERS_PER_TICK,.25);
 assert.equal(fired.projectileFlightTicks,8);
 assert.equal(fired.durationTicks,turnTicks(c.actors.PLAYER,"PIERCE"));
 assert.equal(s.clock.actors.PLAYER.spentApByRound["1"],1);
 const launch=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(launch.combat.tick,fired.endsAtTick);
 assert.equal(launch.combat.actors.NPC.hp,200);
 assert.equal(launch.combat.timelineProjectiles.length,1);
 assert.equal(launch.combat.timelineProjectiles[0].impactTick,fired.endsAtTick+8);
 assert.deepEqual(c,original);
 const hit=await advance(launch.combat,launch.timeline);
 assert.equal(hit.combat.tick,fired.endsAtTick+8);
 assert.ok(hit.combat.actors.NPC.hp<200);
 assert.equal(hit.combat.timelineProjectiles.length,0);
 assert.equal(hit.combat.actors.PLAYER.equippedWeapon.characterItemId,51);
});

test("thrown copy leaves hand at launch and lands once at impact",async()=>{
 const c=fight(true,1);
 c.physicalPathEnds={PLAYER:{MAIN_HAND:{x:.5,y:.5}}};
 const launch=await resolveBasicTimelineWindow(c,prepare(c,attack(true)),dice);
 assert.equal(launch.combat.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(launch.combat.droppedWeapons?.length??0,0);
 assert.equal(launch.combat.physicalPathEnds?.PLAYER?.MAIN_HAND,undefined);
 const hit=await advance(launch.combat,launch.timeline);
 assert.equal(hit.combat.droppedWeapons.length,1);
 assert.equal(hit.combat.droppedWeapons[0].weapon.characterItemId,51);
 assert.equal(hit.combat.droppedWeapons[0].fieldPosition.x,1);
 assert.equal(hit.timeline.clock.actors.PLAYER.spentApByRound["1"],1,
   "WAIT to advance the world must not consume another PA");
});

test("the shooter can move while an earlier projectile is flying",async()=>{
 const c=fight(false,2),launch=await resolveBasicTimelineWindow(c,prepare(c,attack()),dice);
 const movement={kind:"MOVE",meters:.5,direction:"AWAY"};
 const hit=await advance(launch.combat,launch.timeline,movement,"move-shooter");
 assert.ok(hit.combat.actors.NPC.hp<200);
 assert.equal(hit.combat.actors.PLAYER.positionMeters,0,
   "impact must precede the still-queued move completion");
 const moved=await resolveBasicTimelineWindow(hit.combat,hit.timeline,dice);
 assert.equal(moved.combat.actors.PLAYER.positionMeters,-.5);
});

test("enemy moving away before launch makes the original world target miss",async()=>{
 const c=fight(false,2);
 c.actors.NPC.agility=250;
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",attack(),"shot-one");
 s=declareTimelineCommand(s,c,"NPC",
   {kind:"MOVE",meters:.5,direction:"AWAY"},"escape");
 const escaped=await resolveBasicTimelineWindow(c,s,dice);
 assert.ok(escaped.combat.actors.NPC.positionMeters>2);
 assert.equal(escaped.combat.timelineProjectiles?.length??0,0);
 const next=wait(escaped.timeline,escaped.combat,"NPC","wait-after-escape");
 const launch=await resolveBasicTimelineWindow(escaped.combat,next,dice);
 assert.equal(launch.combat.timelineProjectiles.length,1);
 const missed=await advance(launch.combat,launch.timeline);
 assert.equal(missed.combat.timelineProjectiles.length,0);
 assert.equal(missed.combat.actors.NPC.hp,200);
});

test("curved flight takes longer without extra action PA",()=>{
 const c=fight(false,2);
 const flat=prepare(c,attack()).clock.events[0];
 const arc=prepare(c,attack(false,{
   projectileHeights:{launchMeters:1,impactMeters:1,arcRiseMeters:3},
 })).clock.events[0];
 assert.ok(arc.projectileFlightTicks>flat.projectileFlightTicks);
 assert.equal(arc.durationTicks,flat.durationTicks);
 assert.equal(arc.paidAp,1);
});

test("illegal projectile coordinates and combined action fail before PA",()=>{
 const c=fight(),s=newTimelineDeclarationSession(c);
 for(const command of [
   attack(false,{projectileHeights:undefined}),
   attack(false,{areaCenter:{x:5,y:0}}),
   attack(false,{planarMove:{x:.1,y:0}}),
   attack(false,{projectileHeights:{launchMeters:50,impactMeters:1}}),
 ])assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",command,"bad"));
 const far=fight(false,10);
 assert.throws(()=>declareTimelineCommand(newTimelineDeclarationSession(far),
   far,"PLAYER",attack(),"far"),/alcance/);
 assert.deepEqual(s.clock.actors.PLAYER.spentApByRound,{});
});

test("forged world-impact receipt rejects the entire batch",()=>{
 const c=fight(true,1),original=structuredClone(c);
 let clock=newContinuousCombatTimeline(25,25);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"hit",kind:"ATTACK",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",
   {id:"wait",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"hit",projectilesImpacted:[{id:"forged",owner:"PLAYER",weaponWear:0}]},
 ]),/proyectil|impacto/i);
 assert.deepEqual(c,original);
});

test("guard can block a delayed autonomous projectile without paying twice",async()=>{
 const c=fight(false,1);
 c.actors.NPC.agility=40;
 c.actors.NPC.offhandWeapon={name:"Escudo",itemId:78,characterItemId:78,
   mode:"MELEE",attackType:"BLUNT",effectiveRangeMeters:1.5,
   maximumRangeMeters:1.5,durability:100};
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",attack(),"shot-one");
 s=declareTimelineCommand(s,c,"NPC",{kind:"GUARD",weaponSlot:"OFF_HAND"},"guard");
 const launch=await resolveBasicTimelineWindow(c,s,dice);
 const hit=await advance(launch.combat,launch.timeline);
 assert.ok(hit.combat.actors.NPC.offhandWeapon.durability<100);
 assert.equal(hit.timeline.clock.actors.NPC.spentApByRound["1"],1);
});

test("already-fired projectile remains live after shooter HP becomes zero",async()=>{
 const c=fight(false,2);
 const launch=await resolveBasicTimelineWindow(c,prepare(c,attack()),dice);
 const fallen=structuredClone(launch.combat);
 fallen.actors.PLAYER.hp=0; // represents a simultaneous KO before impact
 const hit=await resolveBasicTimelineWindow(fallen,launch.timeline,dice);
 assert.ok(hit.combat.actors.NPC.hp<200);
 assert.equal(hit.combat.timelineProjectiles.length,0);
 assert.equal(hit.combat.status,"FINISHED");
 assert.equal(hit.combat.winner,"NPC");
});

test("target movement AFTER release but BEFORE impact avoids a frozen shot",async()=>{
 const c=fight(false,2);
 c.actors.PLAYER.agility=70; // 13-tick pierced-weapon wind-up
 c.actors.NPC.agility=250;   // 10-tick guard, then 4-tick move
 c.actors.NPC.offhandWeapon={name:"Escudo",itemId:88,characterItemId:88,
   mode:"MELEE",attackType:"BLUNT",effectiveRangeMeters:1.5,
   maximumRangeMeters:1.5,durability:100};
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",attack(),"shot-one");
 s=declareTimelineCommand(s,c,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"guard-short");
 const guardFinished=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(guardFinished.combat.timelineProjectiles?.length??0,0);
 assert.equal(guardFinished.combat.tick,10);
 const move=declareTimelineCommand(guardFinished.timeline,guardFinished.combat,
   "NPC",{kind:"MOVE",meters:.5,direction:"AWAY"},"escape-after-guard");
 const launch=await resolveBasicTimelineWindow(guardFinished.combat,move,dice);
 assert.equal(launch.combat.timelineProjectiles.length,1);
 assert.equal(launch.combat.actors.NPC.positionMeters,2);
 const timed=await advance(launch.combat,launch.timeline,{kind:"WAIT"},"wait-for-flight");
 assert.ok(timed.combat.actors.NPC.positionMeters>2);
 assert.equal(timed.combat.timelineProjectiles.length,1);
 const finalSession=wait(timed.timeline,timed.combat,"NPC","wait-after-escape");
 const impact=await resolveBasicTimelineWindow(timed.combat,finalSession,dice);
 assert.equal(impact.combat.timelineProjectiles.length,0);
 assert.equal(impact.combat.actors.NPC.hp,200);
 assert.ok(impact.combat.log.some(e=>e.kind==="PROJECTILE"&&
   e.summary.includes("posición original")));
});
