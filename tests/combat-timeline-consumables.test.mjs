import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {
 declareTimelineCommand,newTimelineDeclarationSession,
} from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {
 commitAuthorizedTimelineBatch,
} from "../lib/combat/timeline-batch-resolver.ts";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";

const fighter=(name,pos)=>({
 characterId:null,name,hp:50,maxHp:100,agility:100,strength:20,
 constitution:12,precision:30,dodge:10,physicalAttack:25,
 physicalDefense:8,magicAttack:30,magicDefense:10,critical:0,
 luck:10,race:20,massKg:65,positionMeters:pos,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const state=()=>{
 const c=newCombatState(fighter("Jugador",0),fighter("NPC",0.8),"PLAYER",true);
 c.mana={PLAYER:{current:5,max:25},NPC:{current:6,max:25}};
 c.consumables={PLAYER:[
   {itemId:81,characterItemId:1001,name:"Poción de vida",
    action:"HEAL_HP",amount:20,quantity:2},
   {itemId:82,characterItemId:1002,name:"Poción de maná",
    action:"RESTORE_MANA",amount:8,quantity:1},
 ],NPC:[{itemId:83,name:"Poción de entrenamiento",
   action:"HEAL_HP",amount:10,quantity:1}]};
 return c;
};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const item=(itemId,characterItemId,requestId="v2-item-request-0001")=>({
 kind:"USE_ITEM",itemId,...(characterItemId!==undefined?{characterItemId}:{}),
 requestId,
});
const action=(session,c,side,command,id)=>declareTimelineCommand(
 session,c,side,command,id);

test("potion reserves 1 PA but heals and removes 1 copy only at its end",async()=>{
 const c=state(),old=structuredClone(c);
 let t=newTimelineDeclarationSession(c);
 t=action(t,c,"PLAYER",item(81,1001),"potion");
 assert.equal(t.clock.nowTick,0);
 assert.equal(c.consumables.PLAYER[0].quantity,2);
 assert.equal(c.actors.PLAYER.hp,50);
 assert.equal(t.clock.actors.PLAYER.spentApByRound["1"],1);
 t=action(t,c,"NPC",{kind:"WAIT"},"wait");
 const done=await resolveBasicTimelineWindow(c,t,dice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.actors.PLAYER.hp,70);
 assert.equal(done.combat.consumables.PLAYER[0].quantity,1);
 assert.equal(done.combat.actors.PLAYER.spentAp,0);
 assert.equal(done.combat.log.at(-1).kind,"ITEM");
 assert.equal(done.combat.log.at(-1).tick,10);
 assert.deepEqual(c,old);
});

test("mana consumable restores the approved quantity and caps at max",async()=>{
 const c=state();
 c.mana.PLAYER.current=22;
 let t=newTimelineDeclarationSession(c);
 t=action(t,c,"PLAYER",item(82,1002),"mana-potion");
 t=action(t,c,"NPC",{kind:"WAIT"},"wait");
 const done=await resolveBasicTimelineWindow(c,t,dice);
 assert.equal(done.combat.mana.PLAYER.current,25);
 assert.equal(done.combat.consumables.PLAYER[1].quantity,0);
 assert.equal(c.mana.PLAYER.current,22);
});

test("two simultaneous potions draw from separate inventories at same tick",async()=>{
 const c=state();
 let t=newTimelineDeclarationSession(c);
 t=action(t,c,"PLAYER",item(81,1001),"player-potion");
 t=action(t,c,"NPC",item(83,undefined,"npc-item-0000001"),"npc-potion");
 const done=await resolveBasicTimelineWindow(c,t,dice);
 assert.equal(done.combat.actors.PLAYER.hp,70);
 assert.equal(done.combat.actors.NPC.hp,60);
 assert.equal(done.combat.consumables.PLAYER[0].quantity,1);
 assert.equal(done.combat.consumables.NPC[0].quantity,0);
 assert.equal(done.combat.log.filter(x=>x.kind==="ITEM").length,2);
});

test("item request replay after resolution never consumes more stock",async()=>{
 const c=state();
 let t=newTimelineDeclarationSession(c);
 const command=item(81,1001);
 t=action(t,c,"PLAYER",command,"potion");
 t=action(t,c,"NPC",{kind:"WAIT"},"wait");
 const done=await resolveBasicTimelineWindow(c,t,dice);
 assert.equal(action(done.timeline,done.combat,"PLAYER",command,"potion"),
   done.timeline);
 assert.equal(done.combat.consumables.PLAYER[0].quantity,1);
 assert.throws(()=>action(done.timeline,done.combat,"PLAYER",
   item(82,1002),"potion"),/diferente/);
});

test("forged item recipe and nonexistent copies fail before PA reservation",()=>{
 const c=state(),s=newTimelineDeclarationSession(c);
 assert.throws(()=>action(s,c,"PLAYER",item(999,1001),"invalid"),
   /consumible/);
 assert.throws(()=>action(s,c,"PLAYER",
   {...item(81,1001),amount:99999},"forged"),/datos no permitidos/);
 assert.throws(()=>action(s,c,"PLAYER",
   item(81,undefined),"missing-copy"),/copia/);
 assert.equal(s.clock.events.length,0);
 assert.equal(c.consumables.PLAYER[0].quantity,2);
});

test("full HP or full mana refuses wasting the item without charging AP",()=>{
 const c=state(),s=newTimelineDeclarationSession(c);
 c.actors.PLAYER.hp=100;
 c.mana.PLAYER.current=25;
 assert.throws(()=>action(s,c,"PLAYER",item(81,1001),"full-hp"),/todos tus HP/);
 assert.throws(()=>action(s,c,"PLAYER",item(82,1002),"full-mana"),/todo tu maná/);
 assert.equal(s.clock.actors.PLAYER.spentApByRound["1"]??0,0);
});

test("simultaneous mana restore cannot retrospectively pay an unaffordable cast",()=>{
 const c=state(),old=structuredClone(c);
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"cast",kind:"ATTACK",
   durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",{id:"item",kind:"ITEM",
   durationTicks:10,paCost:1});
 const batch=completeNextTimelineBatch(clock);
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"cast",manaSpent:{PLAYER:12}},
   {eventId:"item",manaRestored:{PLAYER:20}},
 ]),/Maná insuficiente/);
 assert.deepEqual(c,old);
});

test("atomic commit rejects duplicate and missing stock instead of healing",()=>{
 const c=state(),before=structuredClone(c);
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"item",kind:"ITEM",
   durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",{id:"wait",kind:"WAIT",
   durationTicks:10,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 for(const bad of [
   {eventId:"item",hpHealing:{PLAYER:20},
     consumableUses:[{owner:"PLAYER",itemId:81,characterItemId:999}]},
   {eventId:"item",hpHealing:{PLAYER:20},
     consumableUses:[
       {owner:"PLAYER",itemId:81,characterItemId:1001},
       {owner:"PLAYER",itemId:81,characterItemId:1001},
     ]},
 ]){
   assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[bad,{eventId:"wait"}]),
     /consumible/);
   assert.deepEqual(c,before);
 }
});
