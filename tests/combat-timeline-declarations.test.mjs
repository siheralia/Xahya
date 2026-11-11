import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {activeTimelineBlockAt} from "../lib/combat/action-timeline.ts";
import {
 newTimelineDeclarationSession,declareTimelineCommand,
 prepareTimelineCommit,finalizeTimelineCommit,publicTimelineSessionStatus,
 resolveDeclaredTimelineBatch,
} from "../lib/combat/timeline-declarations.ts";

const fighter=(name,speed=100,withShield=false)=>({
 characterId:null,name,hp:30,maxHp:30,agility:speed,strength:20,
 constitution:5,precision:20,dodge:20,physicalAttack:10,
 physicalDefense:5,magicAttack:10,magicDefense:10,critical:0,
 luck:0,race:10,massKg:60,positionMeters:0,weaponIntegrity:100,
 attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 ...(withShield?{offhandWeapon:{name:"Escudo",characterItemId:41,itemId:9,
   attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:1,
   maximumRangeMeters:1,durability:100}}:{}),
});
const combat=(speed=100)=>newCombatState(
 fighter("Atacante",speed),fighter("Escudero",speed,true),"PLAYER",true);
const strike=(requestId="attack-id")=>({
 kind:"ATTACK",requestId,attackType:"BLUNT",attackSource:"FIST_RIGHT",
 trajectory:[{x:0.1,y:0.5},{x:0.9,y:0.5}],
});
const block={kind:"GUARD",weaponSlot:"OFF_HAND",requestId:"guard-id"};

test("one declaration never deals damage or advances the shared clock",()=>{
 const c=combat(),initial=newTimelineDeclarationSession(c);
 const next=declareTimelineCommand(initial,c,"PLAYER",strike(),"attack-1");
 assert.equal(next.clock.nowTick,0);
 assert.equal(prepareTimelineCommit(next),null);
 assert.equal(next.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.equal(c.actors.NPC.hp,30);
 assert.deepEqual(publicTimelineSessionStatus(next).waitingFor,["NPC"]);
 assert.equal(initial.clock.seenActionIds.length,0);
});

test("a shield declared first stays active for multiple impacts and is paid once",()=>{
 const c=combat(100);
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"NPC",block,"guard-1");
 session=declareTimelineCommand(session,c,"PLAYER",strike(),"attack-1");
 const prepared=prepareTimelineCommit(session);
 assert.ok(prepared);
 assert.equal(prepared.batch.atTick,10);
 assert.equal(prepared.declarations.length,1);
 assert.equal(prepared.declarations[0].owner,"PLAYER");
 assert.equal(activeTimelineBlockAt(prepared.batch.state,"NPC",10)?.blockToolCopyId,41);
 session=finalizeTimelineCommit(session,prepared);
 assert.deepEqual(publicTimelineSessionStatus(session).waitingFor,["PLAYER"]);
 session=declareTimelineCommand(session,c,"PLAYER",strike("second"),"attack-2");
 const second=prepareTimelineCommit(session);
 assert.equal(second.batch.atTick,20);
 assert.equal(second.batch.events.length,2,
   "attack and guard finish simultaneously and are resolved in one batch");
 assert.equal(activeTimelineBlockAt(second.batch.state,"NPC",20)?.id,"guard-1");
 assert.equal(session.clock.actors.NPC.spentApByRound["1"],1);
 session=finalizeTimelineCommit(session,second);
 assert.equal(activeTimelineBlockAt(session.clock,"NPC",21),null);
});

test("double KO from simultaneous server-resolved commands is a draw",async()=>{
 const c=combat();
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"PLAYER",strike(),"attack-1");
 session=declareTimelineCommand(session,c,"NPC",strike("opp"),"attack-2");
 const originalHp=c.actors.NPC.hp;
 const before=prepareTimelineCommit(session);
 assert.equal(before.batch.simultaneous,true);
 const result=await resolveDeclaredTimelineBatch(c,session,(_snapshot,entry)=>{
   return {eventId:entry.id,hpDamage:{
     [entry.owner==="PLAYER"?"NPC":"PLAYER"]:30,
   }};
 });
 assert.equal(result.combat.status,"FINISHED");
 assert.equal(result.combat.winner,null);
 assert.equal(result.combat.tick,10);
 assert.equal(result.timeline.clock.nowTick,10);
 assert.equal(result.timeline.declarations["attack-1"],undefined);
 assert.equal(c.actors.NPC.hp,originalHp,"declarations never touch the previous snapshot");
});

test("same request id is idempotent even when the first event was pruned",()=>{
 const c=combat();
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"PLAYER",strike(),"attack-1");
 const replay=declareTimelineCommand(session,c,"PLAYER",{
   attackType:"BLUNT",trajectory:[{y:0.5,x:0.1},{y:0.5,x:0.9}],
   attackSource:"FIST_RIGHT",requestId:"attack-id",kind:"ATTACK",
 },"attack-1");
 assert.equal(replay,session);
 assert.throws(()=>declareTimelineCommand(session,c,"PLAYER",
   strike("changed"),"attack-1"),/diferente/);
 assert.throws(()=>declareTimelineCommand(session,c,"NPC",
   strike(),"attack-1"),/diferente/);
 session=declareTimelineCommand(session,c,"NPC",{kind:"WAIT"},"wait-1");
 const prepared=prepareTimelineCommit(session);
 session=finalizeTimelineCommit(session,prepared);
 assert.equal(declareTimelineCommand(session,c,"PLAYER",strike(),"attack-1"),session,
   "retired commands retain their idempotent receipt");
});

test("a queued command hides the secret aim and can never be applied stale",()=>{
 const c=combat(),initial=newTimelineDeclarationSession(c);
 let session=declareTimelineCommand(initial,c,"PLAYER",{
   kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:0.1,y:0.01},{x:0.9,y:0.99}],
 },"secret-1");
 const status=publicTimelineSessionStatus(session);
 assert.equal(JSON.stringify(status).includes("0.99"),false);
 assert.ok(status.running.some(e=>e.kind==="ATTACK"));
 session=declareTimelineCommand(session,c,"NPC",{kind:"WAIT"},"wait");
 const prepared=prepareTimelineCommit(session);
 assert.throws(()=>finalizeTimelineCommit(session,{
   ...prepared,batch:{...prepared.batch,atTick:prepared.batch.atTick+1},
 }),/cambió/);
 assert.equal(session.clock.nowTick,0);
});

test("a fighter cannot queue a second command while the first is active",()=>{
 const c=combat(),initial=newTimelineDeclarationSession(c);
 const first=declareTimelineCommand(initial,c,"PLAYER",strike(),"attack-1");
 assert.throws(()=>declareTimelineCommand(first,c,"PLAYER",strike("again"),
   "attack-2"),/pendiente/);
 assert.throws(()=>declareTimelineCommand(first,c,"NPC",
   {kind:"GUARD",weaponSlot:"MAIN_HAND"},"guard-invalid"),/equipamiento/);
});

test("skill plans require server-approved context before escrow",()=>{
 const c=combat(),initial=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(initial,c,"PLAYER",{
   kind:"CAST_SKILL",skillId:21,requestId:"skill-abcdefghijk",
 },"skill-1"),/aprobación/);
 assert.deepEqual(Object.keys(initial.receipts),[]);
});
