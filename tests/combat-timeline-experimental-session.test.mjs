import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
 parseExperimentalV2Command,newExperimentalTimeline,
 submitExperimentalTimelineCommand,experimentalTrainingNpcCommand,
 advanceExperimentalTimeline,
} from "../lib/combat/timeline-experiment.ts";

const fighter=(name,x)=>({
 name,characterId:name==="Hero"?10:null,positionMeters:x,
 hp:1000,maxHp:1000,agility:100,constitution:40,
 strength:20,precision:80,dodge:8,physicalAttack:25,
 physicalDefense:4,magicAttack:12,magicDefense:6,
 critical:0,luck:0,race:20,massKg:70,
 attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,
});
const combat=(distance=.5)=>
 newCombatState(fighter("Hero",0),fighter("Training",distance),"PLAYER",true);
const dice=()=>({hit:0.01,critical:0.99,defense:0.99});
const hit={kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const load=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const dodgeDice=()=>({hit:.999,critical:.99,defense:.99});

test("experimental skills accept only server-approved IDs and aim",async()=>{
 const raw={kind:"CAST_SKILL",skillId:712,requestId:"v2-lab-approved-skill-001",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}],attackSource:"FIST_RIGHT"};
 assert.deepEqual(parseExperimentalV2Command(raw),raw);
 for(const attempt of [
   {...raw,approvedSkill:{damageMultiplier:999}},
   {...raw,cost:0},
   {...raw,skillId:-1},
   {...raw,movementOrder:"BEFORE"},
   {...raw,planarMove:{x:2,y:0},movementOrder:"AFTER"},
   {...raw,areaCenter:{x:2,y:0}},
 ]){
   assert.throws(()=>parseExperimentalV2Command(attempt),/V2|autorizada/);
 }
 const plan=compileCombatSkill({
   id:712,name:"Impacto certificado",characterId:10,
   status:"APPROVED",approvedAt:"2026-11-11T00:00:00Z",
   category:"OFFENSIVE",cost:5,pchCost:40,
   maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
   attackType:"BLUNT",duration:"Instantánea",
   cooldown:"1 turno",areaOfEffect:"Contacto | Alcance máximo: 2 m",
   mechanics:{},condition:"",
   effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100}],
 });
 const c=combat();
 c.mana={PLAYER:{current:50,max:50},NPC:{current:10,max:10}};
 const before=structuredClone(c);
 const initial=newExperimentalTimeline(c);
 await assert.rejects(()=>submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,raw,"v2-lab-approved-skill-001",dice),
   /aprobaci[oó]n|habilidad/i,
   "a raw skill ID without a trusted plan cannot be cast");
 const result=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,raw,"v2-lab-approved-skill-001",dice,
   {approvedSkill:plan});
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.mana.PLAYER.current,45);
 assert.ok(result.combat.actors.NPC.hp<1000,
   "the approved offensive plan must hit using the official physical formula");
 assert.ok((result.combat.skillCooldowns?.PLAYER?.["712"]??0)>0,
   "the skill must register its authoritative cooldown");
 assert.equal(result.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,before);
 const retry=await submitExperimentalTimelineCommand(result.combat,
   result.timeline,raw,"v2-lab-approved-skill-001",dice);
 assert.equal(retry.replayed,true);
 assert.equal(retry.combat.mana.PLAYER.current,45);
});

test("advanced lab orders reject unauthorized creatures and forged constructions",()=>{
 const legal=[
   {kind:"COMMAND_SUMMON",order:"CHANGE_BEHAVIOR",summonId:"PLAYER:77:s1",
    newBehavior:"FOLLOW"},
   {kind:"COMMAND_SUMMON",order:"CHANGE_TARGET",summonId:"PLAYER:77:s1",
    targetId:"FIGHTER:NPC"},
   {kind:"COMMAND_SUMMON",order:"MOVE",summonId:"PLAYER:77:s1",
    planarMove:{x:.3,y:.2}},
   {kind:"CAST_SKILL",skillId:300,requestId:"v2-world-construction-001",
    areaCenter:{x:.5,y:.5},constructionFieldPoint:{x:.5,y:.5},
    constructionForm:"BLOCK",constructionHeightMeters:2,
    constructionFootprintRadiusMeters:.2,constructionSolidHeightMeters:2},
 ];
 for(const command of legal)assert.deepEqual(parseExperimentalV2Command(command),command);
 for(const command of [
   {...legal[0],cost:0},
   {...legal[0],order:"ATTACK"},
   {...legal[1],targetId:"FIGHTER:ADMIN"},
   {...legal[2],planarMove:{x:10,y:0}},
   {...legal[3],constructionSolidHeightMeters:Infinity},
   {...legal[3],constructionForm:"EXPLOSIVE"},
   {...legal[3],damageMultiplier:10000},
 ]){
   assert.throws(()=>parseExperimentalV2Command(command),/V2|autorizada/);
 }
});

test("server-approved creature summons at a real V2 deadline and then acts autonomously",async()=>{
 const plan=compileCombatSkill({
   id:777,name:"Bnuuy test",status:"APPROVED",category:"UTILITY",cost:30,
   maintenanceCost:20,effect:[{type:"COMPOSED",module:{
     id:"BNUUY_GRAPH",name:"Bnuuy",type:"COMPOSED",trigger:"ACTIVATE",
     description:"",steps:[
       {kind:"SUMMON_ENTITY",entityKey:"RABBIT",label:"Bnuuy",
         manaCost:30,maintenanceMana:20,durationTurns:4,
         controlRangeMeters:15,hitLimit:3},
       {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
         sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor:.2},
       {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
         sourceStat:"AGI",destStat:"AGI",factor:1},
       {kind:"LINK_ENTITY_STAT",entityKey:"RABBIT",
         sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
       {kind:"SET_ENTITY_BEHAVIOR",entityKey:"RABBIT",mode:"FOLLOW",
         allowedModes:["ATTACK","FOLLOW","HOLD","MANUAL"],
         target:"USER",trigger:"CONTACT"},
     ],
   }}],
 });
 const c=combat(1.5);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 const original=newExperimentalTimeline(c);
 const first=await submitExperimentalTimelineCommand(original.combat,
   original.timeline,{kind:"CAST_SKILL",skillId:777,
     requestId:"v2-legal-summon-001"},
   "v2-legal-summon-001",dice,{approvedSkill:plan});
 assert.equal(first.combat.tick,10);
 assert.equal(first.combat.summons.length,1);
 assert.equal(first.combat.summons[0].entityKey,"RABBIT");
 assert.equal(first.combat.mana.PLAYER.current,70);
 assert.equal(first.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.ok(first.combat.summons[0].autoNextTick>10);
 const summon=first.combat.summons[0];
 const follow=await submitExperimentalTimelineCommand(first.combat,
   first.timeline,{kind:"COMMAND_SUMMON",summonId:summon.id,
     order:"CHANGE_BEHAVIOR",newBehavior:"MANUAL"},
   "v2-summon-order-001",dice);
 assert.equal(follow.combat.summons[0].behavior.mode,"MANUAL");
 const retry=await submitExperimentalTimelineCommand(follow.combat,
   follow.timeline,{kind:"COMMAND_SUMMON",summonId:summon.id,
     order:"CHANGE_BEHAVIOR",newBehavior:"MANUAL"},
   "v2-summon-order-001",dice);
 assert.equal(retry.replayed,true);
});

test("authorized staff field appears at deadline with exactly one mana charge",async()=>{
 const plan=compileCombatSkill({
   id:140,name:"Tierra",status:"APPROVED",category:"UTILITY",cost:10,
   effect:[{type:"NARRATIVE",value:1,target:"CARD:W002",
     element:"EARTH",capability:"CREATE"}],
   mechanics:{},areaOfEffect:"Objeto | Alcance máximo: 5 m",
   duration:"No termina",
 });
 const c=combat(1.5);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 const original=newExperimentalTimeline(c);
 const result=await submitExperimentalTimelineCommand(original.combat,
   original.timeline,{kind:"CAST_SKILL",skillId:140,
     requestId:"v2-legal-structure-001",
     areaCenter:{x:.5,y:.5},constructionFieldPoint:{x:.5,y:.5},
     constructionForm:"FIELD"},
   "v2-legal-structure-001",dice,{approvedSkill:plan});
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.constructions.length,1);
 assert.equal(result.combat.constructions[0].material,"EARTH");
 assert.equal(result.combat.mana.PLAYER.current,90);
 assert.equal(result.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
});

test("V2 laboratory accepts only a narrow action command vocabulary",()=>{
 assert.deepEqual(parseExperimentalV2Command({kind:"WAIT"}),{kind:"WAIT"});
 assert.deepEqual(parseExperimentalV2Command({kind:"MOVE",direction:"TOWARD",meters:.5}),
   {kind:"MOVE",direction:"TOWARD",meters:.5});
 for(const input of [
   {kind:"CAST_SKILL",skillId:88},
   {...hit,cost:0},
   {...hit,ticks:1},
   {kind:"MOVE",direction:"VECTOR",meters:10},
   {kind:"GUARD",weaponSlot:"FAKE"},
   {kind:"ATTACK",attackType:"PIERCE",targetSummonId:"foo"},
   {kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:999,y:0}]},
   {...hit,planarMove:{x:3,y:0},movementOrder:"BEFORE"},
   {...hit,planarMove:{x:.5,y:0}},
   {...hit,movementOrder:"BEFORE"},
   {...hit,planarMove:{x:.5,y:0},movementOrder:"FORGED"},
   {...hit,planarMove:{x:.5,y:0},movementOrder:"AFTER",rangedPhysical:true},
   {kind:"PREPARE_REACTION",defense:"DODGE",charges:99},
 ]){
   assert.throws(()=>parseExperimentalV2Command(input),/V2|autorizada/);
 }
});

test("experimental V2 is a clean fresh session and never modifies its seed",()=>{
 const seed=combat(),previous=structuredClone(seed);
 const instance=newExperimentalTimeline(seed);
 assert.equal(instance.combat.timelineMode,"SHARED");
 assert.equal(instance.timeline.clock.nowTick,0);
 assert.equal(instance.timeline.clock.events.length,1);
 assert.equal(instance.timeline.clock.events[0].kind,"ATTACK");
 assert.equal(instance.timeline.clock.events[0].owner,"NPC");
 assert.equal(instance.timeline.clock.events[0].endsAtTick,10);
 assert.equal(instance.combat.tick,0);
 assert.deepEqual(seed,previous);
 const pvp=combat();pvp.actors.NPC.characterId=80;
 assert.throws(()=>newExperimentalTimeline(pvp),/entrenamiento/);
 const passive=combat();passive.microEffects={definitions:{foo:[{moduleId:"x"}]}};
 assert.throws(()=>newExperimentalTimeline(passive),/resolutor temporal|pasiva/i);
});

test("one player order queues autonomous NPC and resolves together on server dice",async()=>{
 const initial=newExperimentalTimeline(combat());
 const before=structuredClone(initial.combat);
 const received=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,hit,"experiment-unique-0001",dice);
 assert.equal(received.replayed,false);
 assert.equal(received.combat.tick,10);
 assert.ok(received.combat.actors.NPC.hp<1000);
 assert.ok(received.combat.actors.PLAYER.hp<1000);
 assert.equal(received.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 // NPC commits one resolved action and has already reserved the next
 // telegraphed action in the same 100-tick round.
 assert.equal(received.timeline.clock.actors.NPC.spentApByRound["1"],2);
 assert.ok(received.timeline.receipts["V2_PLAYER:experiment-unique-0001"]);
 assert.deepEqual(initial.combat,before,"the transaction input stays unchanged");
 const retry=await submitExperimentalTimelineCommand(received.combat,
   received.timeline,hit,"experiment-unique-0001",dice);
 assert.equal(retry.replayed,true);
 assert.equal(retry.batches,0);
 assert.deepEqual(retry.combat,received.combat);
 await assert.rejects(()=>submitExperimentalTimelineCommand(received.combat,
   received.timeline,{kind:"WAIT"},"experiment-unique-0001",dice),
   /diferente|reutiliz/);
});

test("the autonomous NPC waits for free after exhausting its round PA",async()=>{
 const initial=newExperimentalTimeline(combat());
 initial.timeline.clock.actors.NPC.apLimitPerRound=1;
 initial.timeline.clock.actors.NPC.apLimitsByRound["1"]=1;
 const advanced=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,{kind:"WAIT"},"v2-wait-budget-0001",dice);
 assert.equal(advanced.combat.tick,100);
 assert.equal(advanced.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(advanced.combat.actors.PLAYER.hp<1000);
});

test("NPC telegraph pauses time for the player's defensive decision",async()=>{
 const initial=newExperimentalTimeline(combat());
 const early=await advanceExperimentalTimeline(initial.combat,initial.timeline,dice);
 assert.equal(early.batches,0);
 assert.equal(early.combat.tick,0);
 assert.deepEqual(early.timeline,initial.timeline);
 const {publicTimelineSessionStatus}=await import("../lib/combat/timeline-declarations.ts");
 const hud=publicTimelineSessionStatus(initial.timeline);
 assert.deepEqual(hud.waitingFor,["PLAYER"]);
 assert.deepEqual(hud.running,[{owner:"NPC",kind:"ATTACK",
   startsAtTick:0,endsAtTick:10}]);
 assert.ok(!JSON.stringify(hud).includes("FIST_RIGHT"));
});

test("player can dodge the warned strike and move half a meter once",async()=>{
 const initial=newExperimentalTimeline(combat());
 const command={kind:"PREPARE_REACTION",defense:"DODGE",
   predictedCenter:{x:.25,y:.75},dodgeDirection:"AWAY"};
 const done=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,command,"v2-warning-dodge-001",dodgeDice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.actors.PLAYER.hp,1000);
 assert.ok(done.combat.actors.PLAYER.positionMeters<0);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.equal(done.timeline.usedDodgeMovementIds.length,1);
 assert.ok(done.timeline.clock.events.some(e=>
   e.owner==="NPC"&&e.status==="QUEUED"&&e.startsAtTick===10));
 const retry=await submitExperimentalTimelineCommand(done.combat,
   done.timeline,command,"v2-warning-dodge-001",dodgeDice);
 assert.equal(retry.replayed,true);
 assert.equal(retry.combat.tick,done.combat.tick);
});

test("guard uses one paid PA to block the announced NPC strike",async()=>{
 const c=combat();
 c.actors.PLAYER.offhandWeapon={
   name:"Escudo de hierro",attackType:"BLUNT",mode:"MELEE",
   effectiveRangeMeters:1.5,maximumRangeMeters:1.5,
   itemId:301,characterItemId:801,durability:100,
 };
 const initial=newExperimentalTimeline(c);
 const done=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,{kind:"GUARD",weaponSlot:"OFF_HAND"},
   "v2-warning-guard-001",()=>({hit:.01,critical:.99,defense:.01}));
 assert.equal(done.combat.tick,10);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.ok(done.combat.actors.PLAYER.offhandWeapon.durability<100);
 assert.equal(c.actors.PLAYER.offhandWeapon.durability,100);
});

test("user-drawn V2 physical strike combines movement and strike on one clock",async()=>{
 const initial=newExperimentalTimeline(combat());
 const command={...hit,planarMove:{x:-.2,y:0},movementOrder:"AFTER"};
 assert.deepEqual(parseExperimentalV2Command(command),command);
 const done=await submitExperimentalTimelineCommand(initial.combat,
   initial.timeline,command,"v2-ui-composite-attack-001",dice);
 assert.equal(done.combat.tick,10);
 assert.equal(done.combat.actors.PLAYER.positionMeters,-.2);
 assert.equal(done.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.equal(initial.combat.actors.PLAYER.positionMeters,0);
});

test("NPC AI moves toward a far opponent and attacks without client orders",()=>{
 const distant=combat(2);
 const move=experimentalTrainingNpcCommand(distant);
 assert.equal(move.kind,"MOVE");
 assert.equal(move.direction,"TOWARD");
 const close=combat(.5),attack=experimentalTrainingNpcCommand(close);
 assert.equal(attack.kind,"ATTACK");
 assert.equal(attack.attackSource,"FIST_RIGHT");
});

test("new encounter opt-in, private projection and V1 route separation are wired",()=>{
 const creation=load("app/api/combat/duels/route.ts");
 const route=load("app/api/combat/[id]/timeline/route.ts");
 const legacy=load("app/api/combat/[id]/actions/route.ts");
 const read=load("app/api/combat/[id]/route.ts");
 const page=load("app/combat/[id]/page.tsx");
 const launcher=load("app/combat/DuelLauncher.tsx");
 assert.match(creation,/experiment&&!gm/);
 assert.match(creation,/newExperimentalTimeline\(initial,\{/);
 assert.match(creation,/lastAction:\{combatV1:state,/);
 assert.match(route,/UPDATE public\."combatSession" SET id=id/);
 assert.match(route,/submitExperimentalTimelineCommand\(/);
 assert.match(route,/approvedLabSkillPlan\(/);
 assert.match(route,/listApprovedLabSkills\(/);
 assert.match(load("lib/combat/timeline-lab-skills.ts"),/compileCombatSkill\(/);
 assert.match(load("lib/combat/timeline-lab-skills.ts"),/stolenSkillIds\(/);
 assert.match(load("app/combat/[id]/CombatV2AttackPlanner.tsx"),
   /Lanzar habilidad aprobada/);
 assert.match(route,/privateProjectiles/);
 assert.match(legacy,/Las acciones V1 no pueden modificar una sesión V2/);
 assert.match(read,/combatV2:\{version:2,experimental:true\}/);
 assert.match(page,/CombatV2Encounter/);
 const reactions=load("app/combat/[id]/CombatV2Reactions.tsx");
 assert.match(reactions,/predictedCenter/);
 assert.match(reactions,/dodgeDirection/);
 assert.match(reactions,/endsAtTick/);
 assert.match(load("app/combat/[id]/CombatV2Encounter.tsx"),
   /<CombatV2Reactions/);
 const planner=load("app/combat/[id]/CombatV2AttackPlanner.tsx");
 assert.match(planner,/onPointerDown/);
 assert.match(planner,/onPointerMove/);
 assert.match(planner,/previewViewportMove/);
 assert.match(planner,/movementOrder:/);
 assert.match(planner,/areaCenter:/);
 assert.match(load("app/combat/[id]/CombatV2Encounter.tsx"),
   /<CombatV2AttackPlanner/);
 assert.match(load("app/combat/[id]/CombatV2Encounter.tsx"),
   /<CombatV2Summons/);
 assert.match(load("app/combat/[id]/CombatV2Summons.tsx"),
   /CHANGE_BEHAVIOR/);
 assert.match(load("app/combat/[id]/CombatV2AttackPlanner.tsx"),
   /constructionFieldPoint/);
 assert.match(launcher,/experimentalV2:options\.experimentalV2Available/);
});
