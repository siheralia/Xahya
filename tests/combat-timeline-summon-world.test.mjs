import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,actionPoints} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
 newTimelineDeclarationSession,declareTimelineCommand,
} from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {prepareTimelineImpactSnapshot,
 commitAuthorizedTimelineBatch} from "../lib/combat/timeline-batch-resolver.ts";
import {newContinuousCombatTimeline,queueTimelineAction,
 completeNextTimelineBatch} from "../lib/combat/action-timeline.ts";
import {scheduleAutonomousSummonTicks}
 from "../lib/combat/timeline-summon-world.ts";

const fighter=(name,x)=>({
 characterId:null,name,hp:200,maxHp:200,agility:100,speedValue:100,
 strength:30,constitution:15,precision:90,dodge:10,
 physicalAttack:60,physicalDefense:20,magicAttack:40,magicDefense:15,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const state=()=>{
 const c=newCombatState(fighter("Invocadora",0),
   fighter("Enemigo",1.5),"PLAYER",true);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return c;
};
const dice=()=>({hit:.1,critical:.99,defense:.99});
const skill=(mode="ATTACK",duration=4,id=777)=>compileCombatSkill({
 id,name:"Bnuuy",status:"APPROVED",category:"UTILITY",cost:30,
 maintenanceCost:20,
 effect:[{type:"COMPOSED",module:{
   id:"SUMMON_GRAPH",name:"Bnuuy",type:"COMPOSED",
   trigger:"ACTIVATE",description:"",steps:[
    {kind:"SUMMON_ENTITY",entityKey:"RABBIT",label:"Bnuuy",
     manaCost:30,maintenanceMana:20,durationTurns:duration,
     controlRangeMeters:15,hitLimit:3},
    {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
     sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor:.2},
    {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
     sourceStat:"AGI",destStat:"AGI",factor:1},
    {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
     sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
    {kind:"SET_ENTITY_BEHAVIOR",entityKey:"RABBIT",mode,
     allowedModes:["ATTACK","FOLLOW","HOLD","MANUAL"],
     target:mode==="FOLLOW"?"USER":"OPPONENT",trigger:"CONTACT"},
   ],
 }}],
});
const cast=(s,c,p=skill(),side="PLAYER")=>
 declareTimelineCommand(s,c,side,{
   kind:"CAST_SKILL",skillId:p.id,
   requestId:"timeline-summon-"+side+"-"+p.id,
 },"summon-"+side+"-"+p.id,{approvedSkill:p});
const wait=(s,c,side,id)=>
 declareTimelineCommand(s,c,side,{kind:"WAIT"},id);

test("official creature materializes only at skill deadline, pays mana once",async()=>{
 const c=state(),before=structuredClone(c),p=skill();
 let session=cast(newTimelineDeclarationSession(c),c,p);
 assert.equal(c.summons.length,0);
 assert.equal(c.mana.PLAYER.current,100);
 assert.equal(session.clock.nowTick,0);
 session=wait(session,c,"NPC","skip");
 const result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.mana.PLAYER.current,70);
 assert.equal(result.combat.summons.length,1);
 assert.equal(result.combat.summons[0].entityKey,"RABBIT");
 assert.equal(result.combat.summons[0].createdRound,1);
 assert.equal(result.combat.summons[0].expiresAtRound,5);
 assert.ok(result.combat.summons[0].autoNextTick>10);
 assert.equal(result.combat.summons[0].autoRound,1);
 assert.equal(result.combat.summons[0].chargesMigrated,true);
 assert.equal(result.combat.skillCooldowns.PLAYER[String(p.id)],0);
 assert.equal(result.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,before);
});

test("both sides summon at same tick with separate inventory, mana and keys",async()=>{
 const c=state(),p=skill();
 let session=cast(newTimelineDeclarationSession(c),c,p,"PLAYER");
 session=cast(session,c,p,"NPC");
 const result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.summons.length,2);
 assert.deepEqual(new Set(result.combat.summons.map(s=>s.owner)),new Set(["PLAYER","NPC"]));
 assert.equal(result.combat.mana.PLAYER.current,70);
 assert.equal(result.combat.mana.NPC.current,70);
 assert.equal(result.combat.log.filter(x=>x.kind==="SKILL").length,2);
});

test("manual behavior command occupies one owner PA without moving creature in advance",async()=>{
 const c=state(),p=skill();
 let s=cast(newTimelineDeclarationSession(c),c,p);
 s=wait(s,c,"NPC","wait-first");
 const first=await resolveBasicTimelineWindow(c,s,dice);
 const old=structuredClone(first.combat);
 const id=old.summons[0].id;
 s=declareTimelineCommand(first.timeline,first.combat,"PLAYER",{
   kind:"COMMAND_SUMMON",order:"CHANGE_BEHAVIOR",summonId:id,
   newBehavior:"MANUAL",requestId:"order-manual-0001",
 },"manual");
 assert.equal(first.combat.summons[0].behavior.mode,"ATTACK");
 const result=await resolveBasicTimelineWindow(first.combat,s,dice);
 assert.equal(result.combat.tick,20);
 assert.equal(result.combat.summons[0].behavior.mode,"MANUAL");
 assert.equal(result.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.deepEqual(first.combat,old);
});

test("maintenance at real tick 100 charges once, 200 expires by duration",()=>{
 const c=state(),p=skill("HOLD",2);
 c.summons=[{
   id:"PLAYER:777:v2-rabbit:0",owner:"PLAYER",sourceSkillId:777,
   entityKey:"RABBIT",label:"Bnuuy",fieldPosition:{x:.5,y:0},
   createdRound:1,expiresAtRound:3,controlRangeMeters:15,
   maintenanceMana:20,integrity:40,hitCount:0,hitLimit:3,
   links:p.summons[0].links,behavior:p.summons[0].behavior,
   autoRound:1,autoSpentAp:0,autoNextTick:30,chargesMigrated:true,
 }];
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"wait-p",kind:"WAIT",durationTicks:100,paCost:0});
 clock=queueTimelineAction(clock,"NPC",{id:"wait-n",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 const prepared=prepareTimelineImpactSnapshot(c,batch);
 assert.equal(prepared.mana.PLAYER.current,80);
 assert.equal(prepared.summons.length,1);
 assert.equal(prepared.log.filter(x=>x.kind==="SUMMON").length,1);
 const committed=commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"wait-p"},{eventId:"wait-n"},
 ]);
 assert.equal(committed.mana.PLAYER.current,80);
 assert.equal(committed.summons.length,1);
 assert.equal(c.mana.PLAYER.current,100);
 let future=queueTimelineAction(batch.state,"PLAYER",
   {id:"wait-p2",kind:"WAIT",durationTicks:100,paCost:0});
 future=queueTimelineAction(future,"NPC",
   {id:"wait-n2",kind:"WAIT",durationTicks:100,paCost:0});
 const second=completeNextTimelineBatch(future);
 const expired=commitAuthorizedTimelineBatch(committed,second,[
   {eventId:"wait-p2"},{eventId:"wait-n2"},
 ]);
 assert.equal(expired.round,3);
 assert.equal(expired.summons.length,0);
 assert.equal(expired.mana.PLAYER.current,80);
 assert.match(expired.log.filter(x=>x.kind==="SUMMON").at(-1).summary,/desapareció/);
});

test("insufficient maintenance removes creature without borrowing mana",()=>{
 const c=state(),p=skill("HOLD",4);
 c.mana.PLAYER.current=10;
 c.summons=[{id:"RABBIT:1",owner:"PLAYER",sourceSkillId:777,
   entityKey:"RABBIT",label:"Bnuuy",fieldPosition:{x:.3,y:0},
   createdRound:1,expiresAtRound:5,
   controlRangeMeters:15,maintenanceMana:20,
   integrity:40,hitCount:0,hitLimit:3,links:p.summons[0].links,
   behavior:p.summons[0].behavior,chargesMigrated:true,
   autoNextTick:20,autoRound:1,autoSpentAp:0,
 }];
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"w1",kind:"WAIT",durationTicks:100,paCost:0});
 clock=queueTimelineAction(clock,"NPC",{id:"w2",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 const after=commitAuthorizedTimelineBatch(c,batch,[{eventId:"w1"},{eventId:"w2"}]);
 assert.equal(after.summons.length,0);
 assert.equal(after.mana.PLAYER.current,10);
});

test("autonomous attack has its own due ticks, not owner PA or user input",async()=>{
 const c=state();let s=cast(newTimelineDeclarationSession(c),c);
 s=wait(s,c,"NPC","wait-first");
 const first=await resolveBasicTimelineWindow(c,s,dice);
 const creature=first.combat.summons[0],tick=creature.autoNextTick;
 const plan=scheduleAutonomousSummonTicks(first.combat,10,Math.max(100,tick));
 assert.ok(plan.length>0);
 assert.equal(plan[0].tick,tick);
 assert.equal(plan[0].summonId,creature.id);
 assert.equal(plan[0].owner,"PLAYER");
 assert.equal(plan[0].behavior,"ATTACK");
 assert.equal(first.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(scheduleAutonomousSummonTicks(first.combat,10,tick-1),[]);
});

test("faked commands / unsupported contact attacks fail instead of silently moving",()=>{
 const c=state(),s=newTimelineDeclarationSession(c),p=skill();
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",{
   kind:"CAST_SKILL",skillId:p.id,
   requestId:"unsigned-summon-command-1",
 },"unsigned"),/aprobación/);
 assert.throws(()=>declareTimelineCommand(s,c,"PLAYER",{
   kind:"COMMAND_SUMMON",summonId:"fake",order:"ATTACK",
 },"forged"),/No controlas/);
 assert.equal(s.clock.events.length,0);
});

test("a real autonomous tick must never be skipped by the next fighter action",async()=>{
 const c=state(),p=skill("ATTACK");
 let s=cast(newTimelineDeclarationSession(c),c,p);
 s=wait(s,c,"NPC","wait-initial");
 const first=await resolveBasicTimelineWindow(c,s,dice);
 s=wait(first.timeline,first.combat,"PLAYER","wait-beyond-auto");
 const due=await resolveBasicTimelineWindow(first.combat,s,dice);
 assert.equal(due.combat.tick,first.combat.summons[0].autoNextTick,
   "el reloj se detiene en el siguiente turno autónomo");
 assert.equal(due.combat.summons[0].autoSpentAp,1);
 assert.equal(due.timeline.clock.events.filter(e=>e.status==="QUEUED").length,2,
   "las esperas de ambos jugadores siguen activas");
 assert.equal(first.combat.tick,10);
});
