import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow}
 from "../lib/combat/timeline-basic-actions.ts";
import {advancePvPTimeline} from "../lib/combat/timeline-pvp.ts";

const fighter=(name,id,x)=>({
 characterId:id,name,hp:200,maxHp:200,agility:100,
 strength:30,constitution:40,precision:100,dodge:0,
 physicalAttack:90,physicalDefense:4,magicAttack:20,
 magicDefense:5,critical:0,luck:0,race:20,massKg:70,
 positionMeters:x,attackType:"PIERCE",defenseType:"SOLID",
 weaponIntegrity:85,spentTicks:0,spentAp:0,
});
const fight=()=>{
 const c=newCombatState({
   ...fighter("Tirador",11,0),
   equippedWeapon:{characterItemId:51,itemId:21,name:"Arco",
     attackType:"PIERCE",mode:"RANGED",effectiveRangeMeters:6,
     maximumRangeMeters:8,durability:85},
 },fighter("Objetivo",22,2),"PLAYER",true);
 c.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 c.timelineMode="SHARED";
 return c;
};
const shot={kind:"ATTACK",attackType:"PIERCE",
 attackSource:"MAIN_HAND",areaCenter:{x:.5,y:.5},
 projectileHeights:{launchMeters:1,impactMeters:1},
 rangedPhysical:true};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const launch=async()=>{
 const c=fight();
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",shot,"initial-projectile");
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"npc-long-wait");
 return resolveBasicTimelineWindow(c,s,dice);
};
test("PvP final projectile resolves even though its shooter can no longer declare",async()=>{
 const first=await launch();
 assert.equal(first.combat.timelineProjectiles.length,1);
 const fallen=structuredClone(first.combat);
 fallen.actors.PLAYER.hp=0;
 const original=structuredClone(fallen);
 const committed=await advancePvPTimeline(fallen,first.timeline,dice);
 assert.ok(committed.batches>=1);
 assert.ok(committed.combat.tick>first.combat.tick);
 assert.equal(committed.combat.timelineProjectiles.length,0);
 assert.equal(committed.combat.status,"FINISHED");
 assert.equal(committed.combat.winner,"NPC");
 assert.ok(committed.combat.actors.NPC.hp<200);
 assert.deepEqual(fallen,original);
 assert.ok(committed.timeline.clock.events.every(e=>e.owner!=="PLAYER"||
   e.status!=="QUEUED"));
});
test("the living combatant never loses a reaction window to an automatic WAIT",async()=>{
 const first=await launch();
 const fallen=structuredClone(first.combat);
 fallen.actors.NPC.hp=0; // shooter remains alive and can still act
 const frozen=structuredClone(fallen);
 const advanced=await advancePvPTimeline(fallen,first.timeline,dice);
 assert.equal(advanced.batches,0);
 assert.equal(advanced.combat.tick,first.combat.tick);
 assert.equal(advanced.combat.timelineProjectiles.length,1);
 assert.deepEqual(fallen,frozen);
});
test("both fallen combatants eventually resolve a projectile into a draw",async()=>{
 const first=await launch();
 const fallen=structuredClone(first.combat);
 fallen.actors.PLAYER.hp=0;
 fallen.actors.NPC.hp=0;
 const end=await advancePvPTimeline(fallen,first.timeline,dice);
 assert.equal(end.combat.timelineProjectiles.length,0);
 assert.equal(end.combat.status,"FINISHED");
 assert.equal(end.combat.winner,null);
});
