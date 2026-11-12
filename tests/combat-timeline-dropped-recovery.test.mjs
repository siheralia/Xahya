import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {fieldPosition} from "../lib/combat/field-plane.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow,simulateBasicTimelineMove}
 from "../lib/combat/timeline-basic-actions.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";
import {commitAuthorizedTimelineBatch}
 from "../lib/combat/timeline-batch-resolver.ts";

const fighter=(name,x)=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,strength:40,
 constitution:20,precision:80,dodge:5,physicalAttack:30,
 physicalDefense:5,magicAttack:10,magicDefense:5,critical:0,
 luck:0,race:20,massKg:60,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,
});
const weapon={name:"Lanza extraviada",characterItemId:731,itemId:17,
 attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1,
 maximumRangeMeters:1,durability:75,throwable:true,throwRangeMeters:5};
const combat=(x=.5)=>{
 const state=newCombatState(fighter("A",0),fighter("B",1),"PLAYER",true);
 state.droppedWeapons=[{owner:"PLAYER",weapon:{...weapon},
   slot:"MAIN_HAND",positionMeters:x,fieldPosition:{x,y:0}}];
 return state;
};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const recover=(meters,slot="MAIN_HAND")=>({kind:"MOVE",direction:"WEAPON",meters,weaponSlot:slot});
const declare=(c,m)=>{
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",m,"recover-one");
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"wait-rival");
 return s;
};

test("ground copy is restored exactly at move completion, with one PA",async()=>{
 const c=combat(.5),original=structuredClone(c);
 const s=declare(c,recover(.5));
 assert.deepEqual(c,original);
 assert.equal(s.clock.actors.PLAYER.spentApByRound["1"],1);
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.droppedWeapons.length,0);
 assert.deepEqual(done.combat.actors.PLAYER.equippedWeapon,weapon);
 assert.equal(done.combat.actors.PLAYER.weaponIntegrity,75);
 assert.deepEqual(fieldPosition(done.combat.actors.PLAYER),{x:.5,y:0});
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,original);
});

test("weapon remains on ground if the move finishes outside pickup radius",async()=>{
 const c=combat(1.3);
 const done=await resolveBasicTimelineWindow(c,declare(c,recover(.5)),dice);
 assert.equal(done.combat.droppedWeapons.length,1);
 assert.equal(done.combat.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(done.combat.actors.PLAYER.positionMeters,.5);
});

test("two actors moving simultaneously do not give extra pickup actions",async()=>{
 const c=combat(.5);
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",recover(.5),"recover-one");
 s=declareTimelineCommand(s,c,"NPC",
   {kind:"MOVE",meters:.5,direction:"AWAY"},"move-other");
 const done=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(done.combat.droppedWeapons.length,0);
 assert.equal(done.combat.actors.PLAYER.equippedWeapon.characterItemId,731);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.equal(done.timeline.clock.actors.NPC.spentApByRound["1"],1);
});

test("counterfeit recovery with no movement or wrong slot rejects whole batch",()=>{
 const c=combat(.5),original=structuredClone(c);
 let clock=newContinuousCombatTimeline(25,25);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"move-a",kind:"MOVE",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",
   {id:"wait-b",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"move-a",weaponRecoveries:[{owner:"PLAYER",
     characterItemId:731,slot:"MAIN_HAND"}]},
 ]),/recuperación|disponible/i);
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"move-a",positionDelta:{PLAYER:{x:.5,y:0}},
     weaponRecoveries:[{owner:"PLAYER",
       characterItemId:731,slot:"OFF_HAND"}]},
 ]),/recuperación|disponible/i);
 assert.deepEqual(c,original);
});

test("ordinary movement is allowed even while dropped copies exist",async()=>{
 const c=combat(1);
 const command={kind:"MOVE",meters:.3,direction:"AWAY"};
 const done=await resolveBasicTimelineWindow(c,declare(c,command),dice);
 assert.equal(done.combat.droppedWeapons.length,1);
 assert.equal(done.combat.actors.PLAYER.positionMeters,-.3);
});

test("simulator returns a pickup patch, never a shadow weapon overwrite",()=>{
 const c=combat(.5);
 let clock=newContinuousCombatTimeline(25,25);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"move-a",kind:"MOVE",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",
   {id:"wait-b",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 const effect=simulateBasicTimelineMove(c,batch.state,batch.events[0],recover(.5));
 assert.deepEqual(effect.weaponRecoveries,[{owner:"PLAYER",
   characterItemId:731,slot:"MAIN_HAND"}]);
 assert.equal(c.droppedWeapons.length,1);
});
