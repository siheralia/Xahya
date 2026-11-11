import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
 newTimelineDeclarationSession,declareTimelineCommand,
 publicTimelineSessionStatus,
} from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {commitAuthorizedTimelineBatch,prepareTimelineImpactSnapshot}
 from "../lib/combat/timeline-batch-resolver.ts";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";

const fighter=(name,pos,agility=100,shield=false)=>({
 characterId:null,name,hp:70,maxHp:100,agility,strength:25,
 constitution:15,precision:75,dodge:12,physicalAttack:40,
 physicalDefense:10,magicAttack:55,magicDefense:8,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
 ...(shield?{offhandWeapon:{name:"Escudo",characterItemId:901,itemId:1,
   attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:1.5,
   maximumRangeMeters:1.5,durability:100}}:{}),
});
const state=()=>{
 const combat=newCombatState(fighter("Maga",0),
   fighter("Defensora",0.6,100,true),"PLAYER",true);
 combat.mana={PLAYER:{current:24,max:24},NPC:{current:24,max:24}};
 return combat;
};
const dice=()=>({hit:0.01,critical:0.99,defense:0.01});
const spell=(requestId="magic-a")=>({
 kind:"ATTACK",requestId,attackType:"BLUNT",usesMagic:true,
 areaCenter:{x:0.5,y:0.5},
});
const micro=(id,steps)=>({type:"COMPOSED",reviewedPch:20,
 module:{id,name:id,type:"COMBAT_SUPPORT",description:"Aprobado",
  trigger:"ACTIVATE",steps}});
const heal=micro("MODULAR_HEAL",[
 {kind:"READ_STAT",actor:"USER",stat:"MAX_HP",output:"maxHp"},
 {kind:"CALCULATE",output:"healValue",expression:{
   operator:"PERCENT",args:[{source:"OUTPUT",key:"maxHp"},10]}},
 {kind:"HEAL",amount:{source:"OUTPUT",key:"healValue"}},
]);
const buff=micro("MODULAR_ARMOR",[{kind:"BONUS",stat:"MAGIC_DEFENSE",amount:4}]);
const selfStatus=micro("MODULAR_STATUS",[
 {kind:"SELECT_TARGET",selector:"USER",output:"self"},
 {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},
  stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:1.2,durationTurns:2},
]);
const skill=(id=82,effect=[heal,buff])=>compileCombatSkill({
 id,name:"Amparo temporal",characterId:11,
 status:"APPROVED",approvedAt:"2026-11-11T00:00:00Z",
 category:"SUPPORT",cost:8,pchCost:80,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,condition:"",
 mechanics:{},duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Personal | Alcance máximo: 0 m",effect,
});
const cast=(id=82)=>({kind:"CAST_SKILL",skillId:id,
 requestId:"v2-modular-approved-"+id});
const declareCast=(session,combat,plan=skill())=>
 declareTimelineCommand(session,combat,"PLAYER",cast(plan.id),
 "approved-skill-"+plan.id,{approvedSkill:plan});

test("a declared spell spends zero mana and deals zero HP before the deadline",async()=>{
 const original=state(),before=structuredClone(original);
 let session=newTimelineDeclarationSession(original);
 session=declareTimelineCommand(session,original,"PLAYER",spell(),"spell-a");
 assert.equal(prepareTimelineImpactSnapshot(before,{
   state:{...session.clock,nowTick:0},atTick:0,events:[],
   simultaneous:false,crossedRoundBoundaries:[],
 }).mana.PLAYER.current,24);
 assert.equal(session.clock.nowTick,0);
 assert.equal(original.mana.PLAYER.current,24);
 assert.equal(original.actors.NPC.hp,70);
 assert.deepEqual(publicTimelineSessionStatus(session).waitingFor,["NPC"]);
 session=declareTimelineCommand(session,original,"NPC",{kind:"WAIT"},"npc-wait");
 const result=await resolveBasicTimelineWindow(original,session,dice);
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.mana.PLAYER.current,23);
 assert.ok(result.combat.actors.NPC.hp<70);
 assert.equal(result.combat.actors.PLAYER.spentAp,0);
 assert.equal(result.combat.log.find(x=>x.kind==="ATTACK").manaCost,1);
 assert.deepEqual(original,before);
});

test("simultaneous basic spells each consume one mana and both damage survives",async()=>{
 const original=state();
 let session=newTimelineDeclarationSession(original);
 session=declareTimelineCommand(session,original,"PLAYER",spell("p"),"spell-p");
 session=declareTimelineCommand(session,original,"NPC",spell("n"),"spell-n");
 const result=await resolveBasicTimelineWindow(original,session,dice);
 assert.equal(result.combat.mana.PLAYER.current,23);
 assert.equal(result.combat.mana.NPC.current,23);
 assert.ok(result.combat.actors.PLAYER.hp<70);
 assert.ok(result.combat.actors.NPC.hp<70);
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.log.filter(x=>x.kind==="RESOLVE").length,2);
});

test("physical shield guard does not automatically block magic",async()=>{
 const c=state();
 c.actors.NPC.agility=50;
 let session=newTimelineDeclarationSession(c);
 session=declareTimelineCommand(session,c,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"guard");
 session=declareTimelineCommand(session,c,"PLAYER",spell(),"magic");
 const result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.mana.PLAYER.current,23);
 assert.equal(result.combat.actors.NPC.offhandWeapon.durability,100);
 assert.equal(result.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(result.combat.actors.NPC.hp<70);
});

test("insufficient mana is rejected without reserving ticks or PA",()=>{
 const c=state();c.mana.PLAYER.current=0;
 const session=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(session,c,"PLAYER",spell(),"magic"),
   /maná/);
 assert.equal(session.clock.events.length,0);
 const p=skill();
 assert.throws(()=>declareCast(session,c,p),/Maná insuficiente/);
 assert.equal(c.mana.PLAYER.current,0);
});

test("approved modular support heals, buffs, spends mana and locks cooldown",async()=>{
 const c=state(),approved=skill(82);
 let session=newTimelineDeclarationSession(c);
 session=declareCast(session,c,approved);
 const entry=session.declarations["approved-skill-82"];
 assert.equal(entry.approvedSkill.id,82);
 assert.equal(c.actors.PLAYER.hp,70);
 assert.equal(c.actors.PLAYER.magicDefense,8);
 assert.equal(c.mana.PLAYER.current,24);
 session=declareTimelineCommand(session,c,"NPC",{kind:"WAIT"},"wait");
 let result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.actors.PLAYER.hp,80);
 assert.equal(result.combat.actors.PLAYER.magicDefense,12);
 assert.equal(result.combat.mana.PLAYER.current,16);
 assert.equal(result.combat.skillBonuses.length,1);
 assert.equal(result.combat.skillBonuses[0].expiresAtRound,3);
 assert.equal(result.combat.skillCooldowns.PLAYER["82"],3);
 assert.ok(result.combat.log.some(x=>x.kind==="SKILL"&&x.manaCost===8));
 assert.throws(()=>declareCast(result.timeline,result.combat,approved),/enfriamiento/);
 // One round later, still buffed.
 session=declareTimelineCommand(result.timeline,result.combat,"PLAYER",
   {kind:"WAIT"},"player-wait-1");
 result=await resolveBasicTimelineWindow(result.combat,session,dice);
 assert.equal(result.combat.tick,100);
 assert.equal(result.combat.round,2);
 assert.equal(result.combat.actors.PLAYER.magicDefense,12);
 // The old buff expires AT tick 200, before any new impact at that tick.
 session=declareTimelineCommand(result.timeline,result.combat,"PLAYER",
   {kind:"WAIT"},"player-wait-2");
 session=declareTimelineCommand(session,result.combat,"NPC",
   {kind:"WAIT"},"npc-wait-2");
 result=await resolveBasicTimelineWindow(result.combat,session,dice);
 assert.equal(result.combat.tick,200);
 assert.equal(result.combat.round,3);
 assert.equal(result.combat.actors.PLAYER.magicDefense,8);
 assert.equal(result.combat.skillBonuses.length,0);
 assert.equal(result.combat.actors.PLAYER.hp,80);
});

test("approved personal status shares official stacking and expires on clock",async()=>{
 const c=state(),approved=skill(95,[selfStatus]);
 let session=newTimelineDeclarationSession(c);
 session=declareCast(session,c,approved);
 session=declareTimelineCommand(session,c,"NPC",{kind:"WAIT"},"npc-skip");
 let result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.actors.PLAYER.magicDefense,9.6);
 assert.equal(result.combat.summonStatuses[0].expiresAtRound,3);
 assert.equal(result.combat.summonStatuses[0].by,"PLAYER");
 assert.equal(result.combat.summonStatuses[0].target,"PLAYER");
 session=declareTimelineCommand(result.timeline,result.combat,"PLAYER",
   {kind:"WAIT"},"skip-player-1");
 result=await resolveBasicTimelineWindow(result.combat,session,dice);
 session=declareTimelineCommand(result.timeline,result.combat,"PLAYER",
   {kind:"WAIT"},"skip-player-2");
 session=declareTimelineCommand(session,result.combat,"NPC",
   {kind:"WAIT"},"skip-npc-2");
 result=await resolveBasicTimelineWindow(result.combat,session,dice);
 assert.equal(result.combat.round,3);
 assert.equal(result.combat.summonStatuses.length,0);
 assert.equal(result.combat.actors.PLAYER.magicDefense,8);
});

test("unapproved skill plans and forged aim cannot execute or spend mana",async()=>{
 const c=state(),p=skill(82);
 const session=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(session,c,"PLAYER",cast(82),
   "skill-no-plan"),/aprobación/);
 let fake;
 try{fake=declareTimelineCommand(session,c,"PLAYER",
   {...cast(),targetSummonId:"NPC-CREATURE"},"forged-skill",{approvedSkill:p});}
 catch{fake=null;}
 if(fake){
   fake=declareTimelineCommand(fake,c,"NPC",{kind:"WAIT"},"wait");
   await assert.rejects(()=>resolveBasicTimelineWindow(c,fake,dice),/soporte modular personal/);
 }
 assert.equal(c.mana.PLAYER.current,24);
 assert.equal(c.actors.PLAYER.hp,70);
});

test("batch mana debits fail atomically and cannot be refunded to fund a spell",()=>{
 const c=state();c.mana.PLAYER.current=1;
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"magic",kind:"ATTACK",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",{id:"wait",kind:"WAIT",durationTicks:10,paCost:0});
 const batch=completeNextTimelineBatch(clock),before=structuredClone(c);
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"magic",manaSpent:{PLAYER:2},manaRestored:{PLAYER:10}},
   {eventId:"wait"},
 ]),/Maná insuficiente/);
 assert.deepEqual(c,before);
});

test("crossed round boundaries expire bonuses before simultaneous effects read stats",()=>{
 const c=state();c.actors.PLAYER.magicAttack=75;
 c.skillBonuses=[{by:"PLAYER",stat:"magicAttack",value:20,
   skillId:88,skillName:"Temporal",expiresAtRound:2}];
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{id:"wait-a",kind:"WAIT",durationTicks:100,paCost:0});
 clock=queueTimelineAction(clock,"NPC",{id:"wait-b",kind:"WAIT",durationTicks:100,paCost:0});
 const batch=completeNextTimelineBatch(clock);
 assert.equal(prepareTimelineImpactSnapshot(c,batch).actors.PLAYER.magicAttack,55);
 const committed=commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"wait-a"},{eventId:"wait-b"},
 ]);
 assert.equal(committed.actors.PLAYER.magicAttack,55);
 assert.equal(committed.skillBonuses.length,0);
 assert.equal(committed.log.find(x=>x.kind==="ROUND").tick,100);
 assert.equal(c.actors.PLAYER.magicAttack,75);
});
