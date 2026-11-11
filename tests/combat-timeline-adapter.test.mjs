import test from "node:test";
import assert from "node:assert/strict";
import {
  compileCombatTimelineIntent,newTimelineForCombat,reserveCombatTimelineCommand,
} from "../lib/combat/combat-timeline-adapter.ts";
import {newCombatState,turnTicks} from "../lib/combat/turn-engine.ts";
import {activeTimelineBlockAt,completeNextTimelineBatch,queueTimelineAction}
  from "../lib/combat/action-timeline.ts";

const sword=(attackType="BLUNT")=>({name:"Arma de prueba",attackType,
  mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2,
  characterItemId:25,durability:100});
const fighter=(name,agility,extra={})=>({
  characterId:null,name,hp:100,maxHp:100,agility,strength:20,
  constitution:4,precision:40,dodge:20,physicalAttack:20,
  physicalDefense:5,magicAttack:10,magicDefense:10,critical:0,
  luck:0,race:30,massKg:70,positionMeters:0,weaponIntegrity:100,
  attackType:"CUT",defenseType:"SOLID",equippedWeapon:sword(),
  spentTicks:0,spentAp:0,...extra,
});
const move={kind:"MOVE",meters:0};
const attack=(extra={})=>({kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:0,y:0.5},{x:1,y:0.5}],...extra});
const shield={name:"Escudo de práctica",slot:"OFF_HAND",itemType:"ARMOR",
  itemId:42,characterItemId:77,durability:100,materialPhysicalResistance:100};
const encounter=(agi=20)=>newCombatState(
  fighter("Atacante",agi),fighter("Defensor",agi,{equippedWearables:[shield]}));

test("server compiler charges physical weapon handling, not magic or kicking",()=>{
 const s=encounter(50),clock=newTimelineForCombat(s);
 const weapon=compileCombatTimelineIntent(s,clock,"PLAYER",attack(),"attack-1");
 const magic=compileCombatTimelineIntent(s,clock,"PLAYER",
   attack({usesMagic:true}),"spell-1");
 const kick=compileCombatTimelineIntent(s,clock,"PLAYER",
   attack({attackSource:"KICK"}),"kick-1");
 assert.equal(weapon.durationTicks,turnTicks(s.actors.PLAYER,"BLUNT"));
 assert.equal(magic.durationTicks,turnTicks(s.actors.PLAYER));
 assert.equal(kick.durationTicks,turnTicks(s.actors.PLAYER));
 assert.ok(weapon.durationTicks>magic.durationTicks);
 assert.equal(weapon.paCost,1);
 assert.equal(s.actors.PLAYER.spentTicks,0,
   "compiling an intention cannot execute the real combat engine");
});

test("movement combined with attack overlaps its time but costs two PA",()=>{
 const s=encounter(50),clock=newTimelineForCombat(s);
 const intent=compileCombatTimelineIntent(s,clock,"PLAYER",
   attack({planarMove:{x:0.3,y:0},movementOrder:"BEFORE"}),"combo-1");
 assert.equal(intent.paCost,2);
 assert.equal(intent.durationTicks,Math.max(
   turnTicks(s.actors.PLAYER),turnTicks(s.actors.PLAYER,"BLUNT")));
 const movement=compileCombatTimelineIntent(s,clock,"PLAYER",move,"move-1");
 assert.equal(movement.paCost,1);
});

test("approved skills have real durations; the browser cannot supply its own plan",()=>{
 const s=encounter(50),clock=newTimelineForCombat(s);
 const command={kind:"CAST_SKILL",skillId:91,requestId:"skill-123456789"};
 assert.throws(()=>compileCombatTimelineIntent(s,clock,"PLAYER",command,"bad"),/aprobación/);
 assert.throws(()=>compileCombatTimelineIntent(s,clock,"PLAYER",command,"bad",{
   approvedSkill:{id:92,category:"OFFENSE",attackType:"PIERCE",usesMagic:false,rangeMeters:3},
 }),/aprobación/);
 const skill=compileCombatTimelineIntent(s,clock,"PLAYER",command,"valid",{
   approvedSkill:{id:91,category:"OFFENSE",attackType:"PIERCE",usesMagic:false,rangeMeters:3},
 });
 // No declared equipment hand: an approved physical area skill gets neutral tempo.
 assert.equal(skill.durationTicks,turnTicks(s.actors.PLAYER));
 assert.equal(skill.kind,"SKILL");
 assert.equal(skill.paCost,1);
});

test("a 60-tick physical blow from 95 resolves at 155, with a real raised shield",()=>{
 const s=encounter(19.2);
 s.actors.NPC.agility=15; // shield lasts 67 ticks, longer than the 60-tick blunt blow
 const initial=newTimelineForCombat(s);
 let clock=queueTimelineAction(initial,"PLAYER",{
   id:"approach-p",kind:"MOVE",durationTicks:95,paCost:1,
 });
 clock=queueTimelineAction(clock,"NPC",{
   id:"approach-n",kind:"MOVE",durationTicks:95,paCost:1,
 });
 clock=completeNextTimelineBatch(clock).state;
 assert.equal(clock.nowTick,95);
 assert.equal(turnTicks(s.actors.PLAYER,"BLUNT"),60);
 clock=reserveCombatTimelineCommand(clock,s,"PLAYER",attack(),"first-hit");
 const pending={by:"PLAYER",against:"NPC",attackType:"BLUNT",
  trajectory:[],launchedAtTick:155,usesMagic:false};
 const incoming={...s,pending};
 clock=reserveCombatTimelineCommand(clock,incoming,"NPC",
   {kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},"shield-up");
 assert.equal(clock.events.at(-2).endsAtTick,155);
 assert.equal(clock.events.at(-1).blockToolCopyId,77);
 assert.equal(clock.events.at(-1).blockToolSlot,"OFF_HAND");
 const result=completeNextTimelineBatch(clock);
 assert.equal(result.atTick,155);
 assert.deepEqual(result.crossedRoundBoundaries,[100]);
 assert.equal(activeTimelineBlockAt(result.state,"NPC",155)?.id,"shield-up");
 assert.equal(result.state.actors.NPC.spentApByRound["1"],2,
  "the shield is charged once in the round in which it started");
});

test("a prior guard is not converted into an unlimited free action",()=>{
 const s=encounter(50);
 const pending={by:"PLAYER",against:"NPC",attackType:"BLUNT",
  trajectory:[],launchedAtTick:15,usesMagic:false};
 const incoming={...s,pending};
 const clock=newTimelineForCombat(s);
 const timed=compileCombatTimelineIntent(incoming,clock,"NPC",
   {kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},"guard");
 assert.equal(timed.kind,"BLOCK");
 assert.equal(timed.paCost,1);
 assert.ok(timed.durationTicks>=10);
 const broken={...s,actors:{...s.actors,NPC:{
   ...s.actors.NPC,equippedWearables:[{...shield,durability:0}],
 }}};
 assert.throws(()=>compileCombatTimelineIntent({...broken,pending},clock,"NPC",
   {kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},"guard"),/roto/);
 const missing={...s,pending:null};
 assert.throws(()=>compileCombatTimelineIntent(missing,clock,"NPC",
   {kind:"DEFEND",defense:"BLOCK"},"bad"),/impacto/);
});

test("WAIT moves to the next round boundary instead of burning 100 extra ticks",()=>{
 const s=encounter(50),timeline=newTimelineForCombat(s);
 timeline.nowTick=95;
 timeline.actors.PLAYER.availableAtTick=95;
 const intent=compileCombatTimelineIntent(s,timeline,"PLAYER",
   {kind:"WAIT"},"wait-1");
 assert.deepEqual({durationTicks:intent.durationTicks,paCost:intent.paCost},
   {durationTicks:5,paCost:0});
 const queued=queueTimelineAction(timeline,"PLAYER",intent);
 assert.equal(queued.events[0].endsAtTick,100);
});

test("summon orders, item use and karma boosts are action-time reservations",()=>{
 const s=encounter(50),clock=newTimelineForCombat(s);
 for(const [command,kind] of [
   [{kind:"COMMAND_SUMMON",summonId:"rabbit",order:"CHANGE_TARGET",targetId:"FIGHTER:NPC"},"SUMMON"],
   [{kind:"USE_ITEM",itemId:2,requestId:"item-123456789"},"ITEM"],
   [{kind:"BOOST_KARMA",allocation:{strength:1},requestId:"boost-123456789"},"KARMA"],
 ]){
   const intent=compileCombatTimelineIntent(s,clock,"PLAYER",command,"event-"+kind);
   assert.equal(intent.kind,kind);
   assert.equal(intent.paCost,1);
   assert.equal(intent.durationTicks,turnTicks(s.actors.PLAYER));
 }
});

test("no client-selected duration is accepted by the timeline compiler",()=>{
 const s=encounter(50),clock=newTimelineForCombat(s);
 const intent=compileCombatTimelineIntent(s,clock,"PLAYER",{
   ...attack(),durationTicks:1,paCost:0,
 },"attacker-1");
 assert.equal(intent.durationTicks,turnTicks(s.actors.PLAYER,"BLUNT"));
 assert.equal(intent.paCost,1);
});
