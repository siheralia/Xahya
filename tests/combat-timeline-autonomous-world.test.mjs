import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {nextWorldTimelineBatch} from "../lib/combat/timeline-world-batch.ts";

const fighter=(name,x,patch={})=>({
 characterId:null,name,hp:200,maxHp:200,agility:100,speedValue:100,
 strength:40,constitution:15,precision:100,dodge:10,
 physicalAttack:60,physicalDefense:10,
 magicAttack:40,magicDefense:10,critical:0,luck:10,
 race:20,massKg:70,positionMeters:x,attackType:"BLUNT",
 defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,...patch,
});
const state=(npcExtras={})=>{
 const c=newCombatState(fighter("Invocadora",0),
   fighter("Oponente",1.2,npcExtras),"PLAYER",true);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return c;
};
const fixed=(destStat,value)=>({mode:"FIXED",destStat,value});
const familiar=(id="bnuuy",patch={})=>({
 id,owner:"PLAYER",sourceSkillId:777,entityKey:"RABBIT",
 label:"Bnuuy del Juicio",fieldPosition:{x:.6,y:0},
 createdRound:1,expiresAtRound:5,controlRangeMeters:15,
 maintenanceMana:2,integrity:60,hitCount:0,hitLimit:3,
 links:[fixed("PHYSICAL_ATTACK",50),fixed("AGI",100),
   fixed("INTEGRITY",60),fixed("CON",15),fixed("MOVE_SPEED",100)],
 behavior:{mode:"ATTACK",allowedModes:["ATTACK","FOLLOW","HOLD"],
   target:"OPPONENT",trigger:"CONTACT"},
 contactEffects:[],charges:{},chargesMigrated:true,
 autoNextTick:10,autoRound:1,autoSpentAp:0,...patch,
});
const mirror=(id,owner,position)=>({
 id,owner,sourceSkillId:800,material:"MIRROR",form:"MIRROR",
 label:"Espejo "+id,center:{x:.2,y:.5},
 fieldPosition:position,createdRound:1,
 tangible:true,durability:5,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,
   rangeMeters:5,attackType:"PIERCE"},
});
const dice=()=>({hit:.01,critical:.99,defense:.99});
const wait=(s,c,side,id="wait-"+side)=>
 declareTimelineCommand(s,c,side,{kind:"WAIT"},id);
const physical=(s,c,side,id)=>
 declareTimelineCommand(s,c,side,{
   kind:"ATTACK",attackType:"BLUNT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },id);
const shared=(c)=>{
 let s=newTimelineDeclarationSession(c);
 s=wait(s,c,"PLAYER");
 s=wait(s,c,"NPC");
 return s;
};

test("autonomous Bnuuy attacks at tick 10 without completing either WAIT",async()=>{
 const c=state(),before=structuredClone(c);
 c.summons=[familiar()];
 let s=shared(c);
 const plan=nextWorldTimelineBatch(c,s);
 assert.equal(plan.batch.atTick,10);
 assert.equal(plan.hasDeclaredEvents,false);
 assert.equal(plan.batch.events.length,1);
 assert.equal(plan.batch.events[0].kind,"AUTO_SUMMON");
 const next=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(next.combat.tick,10);
 assert.ok(next.combat.actors.NPC.hp<200);
 assert.equal(next.combat.actors.PLAYER.hp,200);
 assert.ok(next.combat.log.some(e=>e.kind==="RESOLVE"&&e.summonId==="bnuuy"));
 assert.equal(next.timeline.clock.actors.PLAYER.spentApByRound["1"]??0,0);
 assert.equal(next.timeline.clock.actors.NPC.spentApByRound["1"]??0,0);
 assert.equal(next.timeline.clock.events.filter(e=>e.status==="QUEUED").length,2);
 assert.equal(next.combat.summons[0].autoSpentAp,1);
 assert.equal(next.combat.summons[0].autoNextTick,20);
 assert.equal(c.actors.NPC.hp,200);
 assert.equal(before.tick,0);
 s=next.timeline;
 const second=await resolveBasicTimelineWindow(next.combat,s,dice);
 assert.equal(second.combat.tick,20);
 assert.equal(second.combat.log.filter(e=>e.kind==="RESOLVE"&&e.summonId==="bnuuy").length,2);
 assert.equal(second.combat.summons[0].autoSpentAp,2);
});

test("player attack and Bnuuy impact ending together both use one snapshot",async()=>{
 const c=state();
 c.summons=[familiar()];
 const before=structuredClone(c);
 let s=newTimelineDeclarationSession(c);
 s=wait(s,c,"PLAYER");
 s=physical(s,c,"NPC","npc-blow");
 const plan=nextWorldTimelineBatch(c,s);
 assert.equal(plan.batch.atTick,10);
 assert.equal(plan.hasDeclaredEvents,true);
 assert.equal(plan.batch.events.length,2);
 assert.deepEqual(plan.batch.events.map(e=>e.kind),["ATTACK","AUTO_SUMMON"]);
 const next=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(next.combat.tick,10);
 assert.ok(next.combat.actors.PLAYER.hp<200);
 assert.ok(next.combat.actors.NPC.hp<200);
 assert.equal(next.combat.log.filter(e=>e.kind==="RESOLVE").length,2);
 assert.deepEqual(c.summons,before.summons);
 assert.equal(c.actors.PLAYER.hp,200);
 assert.equal(c.actors.NPC.hp,200);
});

test("one prepared NPC shield covers multiple independent creature hits",async()=>{
 const c=state({agility:50,speedValue:50});
 c.summons=[familiar()];
 c.actors.NPC.offhandWeapon={
   name:"Escudo",mode:"MELEE",attackType:"BLUNT",characterItemId:61,
   itemId:8,durability:100,effectiveRangeMeters:1.5,maximumRangeMeters:1.5,
 };
 let s=newTimelineDeclarationSession(c);
 s=wait(s,c,"PLAYER");
 s=declareTimelineCommand(s,c,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"held-shield");
 const one=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(one.combat.tick,10);
 assert.ok(one.combat.log.some(e=>e.kind==="RESOLVE"&&e.defense==="BLOCK"));
 const firstWear=one.combat.actors.NPC.offhandWeapon.durability;
 assert.ok(firstWear<100);
 assert.equal(one.timeline.clock.actors.NPC.spentApByRound["1"],1);
 const two=await resolveBasicTimelineWindow(one.combat,one.timeline,dice);
 assert.equal(two.combat.tick,20);
 assert.ok(two.combat.log.filter(e=>e.kind==="RESOLVE"&&e.defense==="BLOCK").length>=2);
 assert.ok(two.combat.actors.NPC.offhandWeapon.durability<firstWear);
 assert.equal(two.timeline.clock.actors.NPC.spentApByRound["1"],1);
});

test("FOLLOW support touch applies official buff once per active duration",async()=>{
 const c=state();
 c.summons=[familiar("helper",{
   fieldPosition:{x:.3,y:0},
   behavior:{mode:"FOLLOW",allowedModes:["FOLLOW","HOLD"],target:"USER",
     trigger:"CONTACT"},
   contactEffects:[{kind:"APPLY_STATUS",target:"USER",stat:"MAGIC_DEFENSE",
     operation:"BONUS",value:7,durationTurns:2}],
 })];
 const one=await resolveBasicTimelineWindow(c,shared(c),dice);
 assert.equal(one.combat.tick,10);
 assert.equal(one.combat.actors.PLAYER.magicDefense,17);
 assert.equal(one.combat.summonStatuses.length,1);
 assert.ok(one.combat.summonStatuses[0].id.startsWith("V2_SUMMON:"));
 assert.equal(one.combat.summonStatuses[0].sourceSummonId,"helper");
 const two=await resolveBasicTimelineWindow(one.combat,one.timeline,dice);
 assert.equal(two.combat.tick,20);
 assert.equal(two.combat.actors.PLAYER.magicDefense,17);
 assert.equal(two.combat.summonStatuses.length,1);
 assert.equal(two.timeline.clock.actors.PLAYER.spentApByRound["1"]??0,0);
});

test("an autonomous creature destroys an enemy summon, not its owner",async()=>{
 const c=state();
 c.summons=[familiar("hunter",{
   targetId:"SUMMON:enemy-creature",
   fieldPosition:{x:.6,y:0},
 }),familiar("enemy-creature",{
   owner:"NPC",entityKey:"OTHER",label:"Criatura enemiga",
   fieldPosition:{x:.9,y:0},integrity:15,hitLimit:2,
   behavior:{mode:"HOLD",allowedModes:["HOLD"],target:"USER",trigger:"CONTACT"},
   autoNextTick:100,
 })];
 const next=await resolveBasicTimelineWindow(c,shared(c),dice);
 assert.equal(next.combat.tick,10);
 assert.equal(next.combat.actors.NPC.hp,200);
 assert.equal(next.combat.summons.some(s=>s.id==="enemy-creature"),false);
 assert.ok(next.combat.log.some(e=>e.kind==="RESOLVE"&&e.summonId==="hunter"));
 assert.equal(next.combat.summons[0].autoSpentAp,1);
});

test("a mirror fires at tick 100 without charging caster mana or PA",async()=>{
 const c=state();
 c.constructions=[mirror("my-mirror","PLAYER",{x:.45,y:0})];
 let s=shared(c);
 const plan=nextWorldTimelineBatch(c,s);
 assert.equal(plan.batch.atTick,100);
 assert.equal(plan.hasDeclaredEvents,true);
 assert.equal(plan.batch.events.filter(e=>e.kind==="AUTO_MIRROR").length,1);
 const next=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(next.combat.tick,100);
 assert.equal(next.combat.round,2);
 assert.ok(next.combat.actors.NPC.hp<200);
 assert.equal(next.combat.mana.PLAYER.current,100);
 assert.equal(next.timeline.clock.actors.PLAYER.spentApByRound["1"]??0,0);
 assert.ok(next.combat.log.some(e=>e.kind==="RESOLVE"&&e.mirrorShot));
 assert.equal(next.combat.constructions.length,1);
 assert.equal(c.actors.NPC.hp,200);
});

test("two opposite mirrors finishing together can deal simultaneous lethal damage",async()=>{
 const c=state({hp:25,maxHp:25,magicDefense:0});
 c.actors.PLAYER.hp=25;c.actors.PLAYER.maxHp=25;
 c.actors.PLAYER.magicDefense=0;
 c.constructions=[
   mirror("p","PLAYER",{x:.4,y:.7}),
   mirror("n","NPC",{x:.8,y:-.7}),
 ];
 const next=await resolveBasicTimelineWindow(c,shared(c),dice);
 assert.equal(next.combat.tick,100);
 assert.ok(next.combat.log.filter(x=>x.kind==="ATTACK"&&x.mirrorShot).length>=2);
 assert.ok(next.combat.actors.PLAYER.hp<25);
 assert.ok(next.combat.actors.NPC.hp<25);
 assert.equal(c.actors.PLAYER.hp,25);
 assert.equal(c.actors.NPC.hp,25);
});

test("no autonomous hit may spend mana for an out-of-range mirror",async()=>{
 const c=state();
 c.constructions=[mirror("far","PLAYER",{x:99,y:0})];
 const next=await resolveBasicTimelineWindow(c,shared(c),dice);
 assert.equal(next.combat.tick,100);
 assert.equal(next.combat.actors.NPC.hp,200);
 assert.equal(next.combat.mana.PLAYER.current,100);
 assert.ok(next.combat.log.some(x=>x.kind==="MIRROR"&&x.summary.includes("no alcanzó")));
});

test("unsupported invert-status contact rejects atomically without granting mana",async()=>{
 const c=state();
 c.summons=[familiar("inverter",{
   behavior:{mode:"FOLLOW",allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
   contactEffects:[{kind:"INVERT_STATUS",target:"USER",selection:"LATEST_DEBUFF",
     manaCost:5}],
 })];
 await assert.rejects(()=>resolveBasicTimelineWindow(c,shared(c),dice),
   /resolutor avanzado/);
 assert.equal(c.tick,0);
 assert.equal(c.mana.PLAYER.current,100);
 assert.equal(c.summons[0].autoSpentAp,0);
});
