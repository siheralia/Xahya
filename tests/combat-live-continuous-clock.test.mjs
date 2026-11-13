import test from "node:test";
import assert from "node:assert/strict";
import {applyCombatCommand,applyResolvedCombatSkill,applyResolvedCombatConsumable,applyResolvedKarmaBoost,canAct,remainingAp,newCombatState,settleTemporalQueuedActions,turnTicks}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const fighter=(name,agility,overrides={})=>({
  characterId:null,name,hp:300,maxHp:300,
  agility,strength:20,constitution:4,precision:70,dodge:5,
  physicalAttack:25,physicalDefense:2,magicAttack:15,magicDefense:3,
  critical:0,luck:0,race:30,massKg:70,positionMeters:0,
  attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
  equippedWeapon:{name:"Maza",attackType:"BLUNT",mode:"MELEE",
    effectiveRangeMeters:2,maximumRangeMeters:2,durability:100},
  spentTicks:0,spentAp:0,...overrides,
});
const rolls={hit:0.05,critical:0.99,defense:0.02};
const attack={kind:"ATTACK",attackType:"BLUNT",
 trajectory:[{x:0,y:0.5},{x:1,y:0.5}]};
const move={kind:"MOVE",meters:0};
const timeline=(playerSpeed=19.2,npcSpeed=50)=>
 newCombatState(fighter("Sarya",playerSpeed),fighter("Robin",npcSpeed),"PLAYER",true,true);
const settle=s=>settleTemporalQueuedActions(s,()=>rolls);

test("new encounters use real continuous duration; past snapshots retain shared mode",()=>{
 const modern=timeline();
 assert.equal(modern.timelineMode,"CONTINUOUS");
 assert.equal(modern.actors.PLAYER.continuousTicks,true);
 assert.equal(newCombatState(fighter("A",20),fighter("B",20),"PLAYER",true).timelineMode,"SHARED");
 assert.equal(canAct(modern,"PLAYER"),true);
 assert.equal(canAct(modern,"NPC"),true);
});

test("slow attack is a reservation: no premature damage, mana or PA",()=>{
 const initial=timeline();
 const state=applyCombatCommand(initial,"PLAYER",attack,rolls);
 assert.equal(state.pending,null);
 assert.equal(state.actors.PLAYER.spentAp,0);
 assert.equal(state.actors.PLAYER.spentTicks,0);
 assert.equal(state.actors.NPC.hp,300);
 assert.equal(state.temporalQueued?.PLAYER?.endsAtTick,60);
 assert.equal(canAct(state,"PLAYER"),false);
 assert.equal(canAct(state,"NPC"),true);
 const view=combatClientView(state);
 assert.equal(view.temporalQueued,undefined);
 assert.equal(view.temporalReserved?.PLAYER?.endsAtTick,60);
 assert.equal(view.log.at(-1)?.kind,"PREPARE");
});

test("faster movements finish at 20 and 40 before the prepared hit at 60",()=>{
 let s=applyCombatCommand(timeline(),"PLAYER",attack,rolls);
 s=applyCombatCommand(s,"NPC",move,rolls);
 assert.equal(s.temporalQueued?.NPC?.endsAtTick,20);
 s=settle(s);
 assert.equal(s.actors.NPC.spentTicks,20);
 assert.equal(s.tick,20);
 assert.equal(s.actors.PLAYER.spentTicks,0);
 assert.equal(s.actors.NPC.hp,300);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.NPC.spentTicks,40);
 assert.equal(s.tick,40);
 assert.equal(s.temporalQueued?.PLAYER?.endsAtTick,60);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.tick,60);
 assert.equal(s.temporalQueued?.PLAYER,undefined);
 assert.ok(s.pending,"the attack finally reaches the defender at tick 60");
 assert.equal(s.pending.launchedAtTick,60);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.ok(s.narrativeHistory.some(e=>e.kind==="RESOLVE"&&e.by==="PLAYER"),
   "a finished contact must yield a resolved attack, even if the blow misses");
 const ticks=s.narrativeHistory.map(e=>e.tick);
 assert.ok(ticks.every((x,i)=>i===0||x>=ticks[i-1]));
});

test("two same-speed blunt attacks resolve as one simultaneous exchange",()=>{
 let s=timeline(50,50);
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 s=applyCombatCommand(s,"NPC",attack,rolls);
 assert.equal(s.temporalQueued?.PLAYER?.endsAtTick,23);
 assert.equal(s.temporalQueued?.NPC?.endsAtTick,23);
 s=settle(s);
 assert.equal(s.pending,null);
 assert.equal(s.temporalQueued?.PLAYER,undefined);
 assert.equal(s.temporalQueued?.NPC,undefined);
 assert.ok(s.narrativeHistory.some(e=>e.kind==="RESOLVE"&&e.by==="PLAYER"));
 assert.ok(s.narrativeHistory.some(e=>e.kind==="RESOLVE"&&e.by==="NPC"));
 assert.ok(s.narrativeHistory.some(e=>e.simultaneousCounter===true));
 const ticks=s.narrativeHistory.filter(e=>e.kind==="RESOLVE").map(e=>e.tick);
 assert.ok(ticks.every(t=>t===23));
});

test("a long strike from 95 finishes at 155 and keeps 55 ticks next round",()=>{
 let s=timeline(19.2,19.2);
 s.actors.PLAYER.spentTicks=95;s.actors.PLAYER.absoluteTick=95;
 s.actors.NPC.spentTicks=95;s.actors.NPC.absoluteTick=95;
 s.tick=95;
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 assert.equal(s.temporalQueued?.PLAYER?.endsAtTick,155);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.ok(s.narrativeHistory.some(e=>e.kind==="MOVE"&&e.tick===148),
   "the 53-tick movement must resolve at 148");
 assert.equal(s.pending?.launchedAtTick,155);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.equal(s.round,2);
 assert.equal(s.actors.PLAYER.spentTicks,55);
 assert.equal(s.actors.NPC.spentTicks,48);
 assert.ok(s.tick>=155);
});

test("a raised shield uses the same interval against consecutive hits",()=>{
 let s=timeline(200,100);
 s.actors.NPC.equippedWearables=[{name:"Escudo",itemId:42,
   characterItemId:78,slot:"OFF_HAND",itemType:"ARMOR",
   materialPhysicalResistance:100,durability:100}];
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 assert.ok(s.pending);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls);
 assert.equal(s.actors.NPC.spentAp,1);
 const first=s.actors.NPC.equippedWearables[0].durability;
 s=applyCombatCommand(s,"PLAYER",{...attack,trajectory:[{x:1,y:0.5},{x:0,y:0.5}]},rolls);
 assert.ok(s.pending);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.equal(s.actors.NPC.spentAp,1);
 assert.ok(s.actors.NPC.equippedWearables[0].durability<first);
});


test("approved healing skill is paid and applied at its ending tick, never at declaration",()=>{
 let s=timeline(19.2,50);
 s.actors.PLAYER.hp=120;
 s.mana={PLAYER:{current:40,max:40},NPC:{current:40,max:40}};
 const plan={id:71,name:"Curación temporal",category:"SUPPORT",
  cost:5,healing:20,bonuses:[],durationTurns:1,cooldownRounds:0,oncePerCombat:false};
 const aim={requestId:"skill-tempo-0001"};
 s=applyResolvedCombatSkill(s,"PLAYER",plan,aim,rolls);
 assert.equal(s.actors.PLAYER.hp,120);
 assert.equal(s.mana.PLAYER.current,40);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(s.temporalReserved?.PLAYER?.endsAtTick,53);
 assert.equal(combatClientView(s).temporalQueued,undefined);
 assert.equal(applyResolvedCombatSkill(s,"PLAYER",plan,aim,rolls),s,
   "retry of a queued skill must not create a new reservation");
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.hp,120);
 assert.equal(s.temporalReserved?.PLAYER?.endsAtTick,53);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.hp,140);
 assert.equal(s.tick,53);
 assert.equal(s.mana.PLAYER.current,35);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.temporalQueued?.PLAYER,undefined);
 assert.ok(s.narrativeHistory.some(e=>e.kind==="SKILL"));
 assert.ok(s.processedSkillRequests.includes(aim.requestId));
});


test("a healing potion is claimed once but heals only when its action completes",()=>{
 let s=timeline(19.2,50);
 s.actors.PLAYER.hp=100;
 const potion={itemId:21,characterItemId:42,name:"Poción",
  action:"HEAL_HP",amount:25,quantity:1};
 s.consumables={PLAYER:[potion],NPC:[]};
 const request="item-timeline-0001";
 s=applyResolvedCombatConsumable(s,"PLAYER",potion,request);
 assert.equal(s.actors.PLAYER.hp,100);
 assert.equal(s.consumables.PLAYER[0].quantity,0);
 assert.equal(s.temporalReserved.PLAYER.endsAtTick,53);
 assert.ok(s.processedItemRequests.includes(request));
 assert.equal(applyResolvedCombatConsumable(s,"PLAYER",potion,request),s);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.hp,100);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.hp,125);
 assert.equal(s.consumables.PLAYER[0].quantity,0);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.narrativeHistory.filter(e=>e.kind==="ITEM").length,1);
});

test("a karma purchase debits its ledger once but changes stats at its completion",()=>{
 let s=timeline(19.2,50);
 const before=s.actors.PLAYER.strength;
 const request="karma-timeline-0001";
 s=applyResolvedKarmaBoost(s,"PLAYER",request,{strength:1},2,{strength:3});
 assert.equal(s.actors.PLAYER.strength,before);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.ok(s.processedKarmaRequests.includes(request));
 assert.equal(applyResolvedKarmaBoost(s,"PLAYER",request,{strength:1},2,{strength:3}),s);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.strength,before);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.strength,before+3);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.narrativeHistory.filter(e=>e.kind==="KARMA").length,1);
});


test("long attack from tick 95 does not erase the PA of the new 100-tick window",()=>{
 let s=timeline(19.2,19.2);
 s.actors.PLAYER.spentTicks=95;s.actors.PLAYER.absoluteTick=95;
 s.actors.NPC.spentTicks=95;s.actors.NPC.absoluteTick=95;
 s.tick=95;
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.pending?.launchedAtTick,155);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.equal(s.round,2);
 assert.equal(s.actors.PLAYER.absoluteTick,155);
 assert.equal(remainingAp(s.actors.PLAYER),13);
 s=applyCombatCommand(s,"PLAYER",move,rolls);
 assert.ok(s.temporalQueued?.PLAYER||s.actors.PLAYER.absoluteTick>155);
});

test("exhausted fast actor waits to the next boundary during a slow wind-up",()=>{
 let s=timeline(200,1);
 s=applyCombatCommand(s,"NPC",attack,rolls);
 assert.equal(s.temporalReserved?.NPC?.endsAtTick,1150);
 for(let i=0;i<13;i++){
   s=applyCombatCommand(s,"PLAYER",move,rolls);
   s=settle(s);
 }
 assert.equal(s.actors.PLAYER.absoluteTick,100);
 assert.equal(s.tick,100);
 assert.equal(remainingAp(s.actors.PLAYER),13);
 assert.equal(s.temporalReserved?.NPC?.endsAtTick,1150);
 s=applyCombatCommand(s,"PLAYER",move,rolls);
 s=settle(s);
 assert.equal(s.actors.PLAYER.absoluteTick,105);
 assert.equal(s.actors.PLAYER.apCycle,1);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.actors.NPC.hp,300);
});

test("equal-duration piercing attacks cannot bypass simultaneous resolution",()=>{
 let s=timeline(50,50);
 for(const side of ["PLAYER","NPC"]){
   s.actors[side].equippedWeapon.attackType="PIERCE";
 }
 const pierce={kind:"ATTACK",attackType:"PIERCE",trajectory:attack.trajectory};
 s=applyCombatCommand(s,"PLAYER",pierce,rolls);
 assert.equal(s.temporalReserved?.PLAYER?.endsAtTick,17);
 assert.equal(s.pending,null,"the first declared attack cannot settle before the other declaration");
 s=applyCombatCommand(s,"NPC",pierce,rolls);
 assert.equal(s.temporalReserved?.NPC?.endsAtTick,17);
 s=settle(s);
 assert.equal(s.pending,null);
 assert.equal(s.temporalQueued?.PLAYER,undefined);
 assert.equal(s.temporalQueued?.NPC,undefined);
 assert.ok(s.narrativeHistory.some(e=>e.simultaneousCounter===true));
});
