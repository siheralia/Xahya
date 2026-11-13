import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {declareTimelineCommand,newTimelineDeclarationSession,
 isRecordedTimelineReplay} from "../lib/combat/timeline-declarations.ts";

const fighter=(name,x)=>({
 characterId:null,name,hp:50,maxHp:50,
 strength:20,agility:100,speedValue:100,constitution:12,
 precision:40,dodge:12,physicalAttack:30,physicalDefense:10,
 magicAttack:20,magicDefense:10,critical:0,luck:10,race:20,
 massKg:60,positionMeters:x,weaponIntegrity:100,
 attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
});
const init=()=>{
 const c=newCombatState(fighter("A",0),fighter("B",.8),"PLAYER",true);
 c.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return c;
};
const cast={kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:.1,y:.5},{x:.6,y:.5}]};

test("a completed encounter still recognizes the exact action receipt",()=>{
 const c=init();c.timelineMode="SHARED";
 const command={...cast};
 const id="V2_PLAYER:terminal-action-00001";
 const session=declareTimelineCommand(newTimelineDeclarationSession(c),
   c,"PLAYER",command,id);
 const frozen=structuredClone(session);
 c.status="FINISHED";c.winner="PLAYER";
 assert.equal(isRecordedTimelineReplay(session,"PLAYER",command,id),true);
 assert.equal(isRecordedTimelineReplay(session,"NPC",command,
   "V2_NPC:terminal-action-00001"),false);
 assert.equal(isRecordedTimelineReplay(session,"PLAYER",command,
   "V2_PLAYER:different-action-00002"),false);
 assert.deepEqual(session,frozen);
});

test("a reused id with changed aim or owner never becomes terminal replay",()=>{
 const c=init();c.timelineMode="SHARED";
 const id="V2_NPC:terminal-action-00001";
 const session=declareTimelineCommand(newTimelineDeclarationSession(c),
   c,"NPC",cast,id);
 c.status="FINISHED";
 assert.throws(()=>isRecordedTimelineReplay(session,"NPC",
   {...cast,trajectory:[{x:0,y:0},{x:1,y:1}]},id),
   /diferente/);
 assert.throws(()=>isRecordedTimelineReplay(session,"PLAYER",cast,id),
   /diferente/);
});

test("terminal retry route is guarded by locked session and does not commit stock",()=>{
 const content=readFileSync(new URL("../app/api/combat/[id]/timeline/route.ts",
   import.meta.url),"utf8");
 const lock=content.indexOf('UPDATE public."combatSession" SET id=id');
 const replay=content.indexOf("isRecordedTimelineReplay(original.timeline,owner,parsed");
 const inventory=content.indexOf("commitV2InventoryMutations(before,after,tx)");
 assert.ok(lock>=0&&replay>lock&&inventory>replay,
   "terminal replays must complete before the first inventory callback");
 assert.match(content,/replayed:true,batches:0/);
 assert.match(content,/if\(advance\)throw new Error\("El combate experimental ya terminó\."\)/);
});
