import test from "node:test";
import assert from "node:assert/strict";
import {applyCombatCommand,canAct,newCombatState,settleTemporalQueuedActions,turnTicks}
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
 assert.ok(s.actors.NPC.hp<300);
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
 assert.ok(s.actors.PLAYER.hp<300);
 assert.ok(s.actors.NPC.hp<300);
 assert.ok(s.narrativeHistory.some(e=>e.simultaneousCounter===true));
 const ticks=s.narrativeHistory.filter(e=>e.kind==="RESOLVE").map(e=>e.tick);
 assert.ok(ticks.every(t=>t===23));
});

test("a long strike from 95 finishes at 155 and keeps 55 ticks next round",()=>{
 let s=timeline(19.2,19.2);
 s.actors.PLAYER.spentTicks=95;
 s.actors.NPC.spentTicks=95;
 s.tick=95;
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 assert.equal(s.temporalQueued?.PLAYER?.endsAtTick,155);
 s=applyCombatCommand(s,"NPC",move,rolls);
 s=settle(s);
 assert.equal(s.tick,148);
 assert.equal(s.temporalQueued?.PLAYER?.endsAtTick,155);
 s=settle(s);
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
 s=applyCombatCommand(s,"PLAYER",attack,rolls);
 assert.ok(s.pending);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.equal(s.actors.NPC.spentAp,1);
 assert.ok(s.actors.NPC.equippedWearables[0].durability<first);
});
