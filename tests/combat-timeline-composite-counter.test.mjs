import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {fieldPosition} from "../lib/combat/field-plane.ts";

const fighter=(name,x,more={})=>({
 characterId:null,name,hp:250,maxHp:250,agility:100,speedValue:100,
 strength:40,constitution:16,precision:80,dodge:12,
 physicalAttack:50,physicalDefense:6,magicAttack:60,magicDefense:8,
 critical:0,luck:10,race:25,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...more,
});
const state=(distance=.5,overrides={})=>{
 const c=newCombatState(fighter("Espadachina",0),
   fighter("Defensora",distance,overrides),"PLAYER",true);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return c;
};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const dodgeDice=()=>({hit:.999,critical:.99,defense:.99});
const trajectory=[{x:.1,y:.5},{x:.5,y:.5}];
const physical=(move,order,extra={})=>({
 kind:"ATTACK",attackType:"BLUNT",trajectory,
 ...(move?{planarMove:move,movementOrder:order}:{}),...extra,
});
const magic=(move,order)=>({
 ...physical(move,order,{usesMagic:true,areaCenter:{x:.5,y:.5}}),
});
const wait=(s,c,side,id="wait")=>
 declareTimelineCommand(s,c,side,{kind:"WAIT"},id);
const attack=(s,c,side,id,command=physical())=>
 declareTimelineCommand(s,c,side,command,id);
const prepare=(s,c,side,id,defense,other={})=>
 declareTimelineCommand(s,c,side,{
   kind:"PREPARE_REACTION",defense,...other,
 },id);
const skill=()=>compileCombatSkill({
 id:412,name:"Puñetazo aprobado",characterId:99,status:"APPROVED",
 approvedAt:"2026-11-11T00:00:00Z",pchCost:40,
 category:"OFFENSIVE",cost:5,attackType:"BLUNT",
 duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",mechanics:{},
 effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100}],
});

test("MOVE BEFORE ATTACK closes real distance; exactly two AP and one tick interval",async()=>{
 const c=state(1.1),original=structuredClone(c);
 let s=attack(newTimelineDeclarationSession(c),c,"PLAYER","move-first",
   physical({x:.6,y:0},"BEFORE"));
 s=wait(s,c,"NPC");
 assert.equal(s.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.equal(s.clock.events.find(e=>e.owner==="PLAYER").endsAtTick,10);
 assert.equal(c.actors.PLAYER.positionMeters,0);
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,10);
 assert.ok(done.combat.actors.NPC.hp<250);
 assert.equal(fieldPosition(done.combat.actors.PLAYER).x,.6);
 assert.ok(done.combat.log.some(e=>e.kind==="POSITION"));
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.equal(done.combat.actors.PLAYER.spentAp,0);
 assert.deepEqual(c,original);
});

test("ATTACK then MOVE records strike before final position, not two full time windows",async()=>{
 const c=state(.5);
 let s=attack(newTimelineDeclarationSession(c),c,"PLAYER","move-after",
   physical({x:-.8,y:0},"AFTER"));
 s=wait(s,c,"NPC");
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.actors.PLAYER.positionMeters,-.8);
 assert.ok(done.combat.actors.NPC.hp<250);
 const attackLog=done.combat.log.findIndex(x=>x.kind==="RESOLVE");
 const moveLog=done.combat.log.findIndex(x=>x.kind==="POSITION");
 assert.ok(attackLog>=0&&moveLog>=0);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
});

test("magic + moving into range still uses one mana and no duplicated ticks",async()=>{
 const c=state(4.5),original=structuredClone(c);
 let s=attack(newTimelineDeclarationSession(c),c,"PLAYER","magic-move",
   magic({x:.9,y:0},"BEFORE"));
 s=wait(s,c,"NPC");
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.actors.PLAYER.positionMeters,.9);
 assert.equal(done.combat.mana.PLAYER.current,99);
 assert.ok(done.combat.actors.NPC.hp<250);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.deepEqual(c,original);
});

test("approved physical SKILL can combine travel and attack with a single spell fee",async()=>{
 const c=state(1.1),p=skill();
 let s=declareTimelineCommand(newTimelineDeclarationSession(c),c,"PLAYER",{
   kind:"CAST_SKILL",skillId:p.id,requestId:"approved-composite-skill",
   planarMove:{x:.6,y:0},movementOrder:"BEFORE",trajectory,
 },"skill-combined",{approvedSkill:p});
 s=wait(s,c,"NPC");
 const out=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(out.combat.tick,10);
 assert.ok(out.combat.actors.NPC.hp<250);
 assert.equal(out.combat.actors.PLAYER.positionMeters,.6);
 assert.equal(out.combat.mana.PLAYER.current,95);
 assert.equal(out.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
});

test("a prepared counter trades two real attacks, one defender PA",async()=>{
 const c=state(.5),before=structuredClone(c);
 let s=prepare(newTimelineDeclarationSession(c),c,"NPC","counter","COUNTER");
 s=attack(s,c,"PLAYER","strike",physical());
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,10);
 assert.ok(done.combat.actors.PLAYER.hp<250);
 assert.ok(done.combat.actors.NPC.hp<250);
 assert.ok(done.combat.log.some(x=>x.simultaneousCounter));
 assert.equal(done.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.deepEqual(done.timeline.usedCounterReactionIds,["counter"]);
 assert.deepEqual(c,before);
});

test("a single counter posture retaliates only once against two attacks",async()=>{
 const c=state(.5,{agility:50,speedValue:50,strength:1,massKg:300});
 c.actors.PLAYER.strength=1;
 c.actors.PLAYER.massKg=300;
 let s=prepare(newTimelineDeclarationSession(c),c,"NPC","counter-slow","COUNTER");
 s=attack(s,c,"PLAYER","strike-one",physical());
 const first=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(first.combat.tick,10);
 assert.equal(first.timeline.usedCounterReactionIds.length,1);
 const retaliations=first.combat.log.filter(x=>x.simultaneousCounter).length;
 assert.ok(retaliations>0);
 s=attack(first.timeline,first.combat,"PLAYER","strike-two",
   physical(undefined,undefined,{attackSource:"KICK"}));
 const second=await resolveBasicTimelineWindow(first.combat,s,dice);
 assert.equal(second.combat.tick,20);
 assert.equal(second.combat.log.filter(x=>x.simultaneousCounter).length,retaliations);
 assert.equal(second.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.deepEqual(second.timeline.usedCounterReactionIds,["counter-slow"]);
});

test("COUNTER is not universal: magical incoming hits cannot trigger retaliation",async()=>{
 const c=state(.5);
 let s=prepare(newTimelineDeclarationSession(c),c,"NPC","counter-magic","COUNTER");
 s=attack(s,c,"PLAYER","magic-strike",magic());
 const out=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(out.combat.actors.PLAYER.hp,250);
 assert.ok(out.combat.actors.NPC.hp<250);
 assert.deepEqual(out.timeline.usedCounterReactionIds,[]);
});

test("a paid movement dodge moves at most once in its prepared time interval",async()=>{
 const c=state(.5,{agility:50,speedValue:50,dodge:200});
 let s=prepare(newTimelineDeclarationSession(c),c,"NPC","dodge-away",
   "DODGE",{predictedCenter:{x:.5,y:.5},dodgeDirection:"AWAY"});
 s=attack(s,c,"PLAYER","attack-one",physical());
 assert.equal(s.clock.actors.NPC.spentApByRound["1"],2);
 const first=await resolveBasicTimelineWindow(c,s,dodgeDice);
 assert.equal(first.combat.tick,10);
 assert.equal(first.combat.actors.NPC.hp,250);
 const firstPosition=fieldPosition(first.combat.actors.NPC).x;
 assert.ok(firstPosition>.5);
 assert.deepEqual(first.timeline.usedDodgeMovementIds,["dodge-away"]);
 s=attack(first.timeline,first.combat,"PLAYER","attack-two",magic());
 const next=await resolveBasicTimelineWindow(first.combat,s,dodgeDice);
 assert.equal(next.combat.tick,20);
 assert.equal(fieldPosition(next.combat.actors.NPC).x,firstPosition);
 assert.equal(next.timeline.clock.actors.NPC.spentApByRound["1"],2);
});

test("invalid, unsupported or forged movement parameters do not reserve PA",()=>{
 const c=state(),t=newTimelineDeclarationSession(c);
 for(const [action,id] of [
   [{...physical(),movementOrder:"BEFORE"},"missing-vector"],
   [physical({x:4,y:0},"BEFORE"),"oversized-move"],
   [physical({x:0,y:0},"BEFORE"),"zero-move"],
   [physical({x:.2,y:0},"FORGED"),"bad-order"],
 ]){
   assert.throws(()=>attack(t,c,"PLAYER",id,action),/desplazamiento|orden|movimiento/i);
 }
 for(const [defense,extra] of [
   ["COUNTER",{defenseAngle:15}],
   ["COUNTER",{dodgeDirection:"AWAY"}],
   ["DODGE",{predictedCenter:{x:.5,y:.5},dodgeDirection:"WEAPON"}],
 ]){
   assert.throws(()=>prepare(t,c,"NPC","invalid-react-"+defense,defense,extra),
     /contraatacar|esquivar|predicción/i);
 }
 assert.equal(t.clock.events.length,0);
 assert.equal(t.clock.actors.PLAYER.spentApByRound["1"]??0,0);
});
