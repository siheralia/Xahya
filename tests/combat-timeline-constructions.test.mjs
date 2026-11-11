import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {declareTimelineCommand,newTimelineDeclarationSession}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {diffConstructionWorld,scheduleMirrorRayTicks}
 from "../lib/combat/timeline-construction-world.ts";
import {commitAuthorizedTimelineBatch}
 from "../lib/combat/timeline-batch-resolver.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";

const fighter=(name,x,more={})=>({
 characterId:null,name,hp:180,maxHp:180,agility:100,speedValue:100,
 strength:40,constitution:15,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:7,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...more,
});
const battle=(distance=1.5)=>{
 const c=newCombatState(fighter("Creadora",0),fighter("Rival",distance),"PLAYER",true);
 c.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return c;
};
const rolls=()=>({hit:.01,critical:.99,defense:.99});
const sand=compileCombatSkill({
 id:140,name:"Sikatā",status:"APPROVED",category:"UTILITY",cost:10,
 effect:[{type:"NARRATIVE",value:1,target:"CARD:W002",
   element:"EARTH",capability:"CREATE"}],
 mechanics:{},areaOfEffect:"Objeto | Alcance máximo: 5 m",duration:"No termina",
});
const mirrorSkill=compileCombatSkill({
 id:800,name:"Espejo mágico",status:"APPROVED",category:"OFFENSIVE",cost:15,
 areaOfEffect:"100m | Alcance máximo: 5 m",speed:"Ataque mágico",
 duration:"Instantánea",cooldown:"Sin cooldown",attackType:"PIERCE",
 effect:[{type:"SUMMON_MIRROR",value:1,target:"OTHER"},
   {type:"MIRROR_RAY",value:100,target:"MAGIC_ATTACK"},
   {type:"MAGIC_REFLECTION",value:100,target:"OTHER"}],mechanics:{},
});
const directedSkill=compileCombatSkill({
 id:811,name:"Rayo dirigido",status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,target:"MAGIC_ATTACK"}],
});
const cast=(s,c,plan,owner="PLAYER",fields={})=>
 declareTimelineCommand(s,c,owner,{
   kind:"CAST_SKILL",skillId:plan.id,
   requestId:"v2-construction-"+owner+"-"+plan.id,
   areaCenter:{x:.5,y:.5},...fields,
 },"cast-"+owner+"-"+plan.id,{approvedSkill:plan});
const wait=(s,c,owner,id="wait")=>
 declareTimelineCommand(s,c,owner,{kind:"WAIT"},id);
const wall=(id="wall",durability=90)=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",
 form:"BLOCK",label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x:.5,y:0},heightMeters:0,
 footprintRadiusMeters:.15,solidHeightMeters:2,
 tangible:true,durability,hitCount:0,
});
const mirrored=(id="mid",pos={x:2,y:0})=>({
 id,owner:"NPC",sourceSkillId:800,material:"MIRROR",
 form:"MIRROR",label:id,center:{x:.98,y:.95},createdRound:1,
 fieldPosition:pos,tangible:true,durability:5,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,
   rangeMeters:5,attackType:"PIERCE"},
});

test("approved sand field appears at tick finish and pays one mana charge",async()=>{
 const c=battle(),before=structuredClone(c);
 let s=cast(newTimelineDeclarationSession(c),c,sand);
 assert.equal(c.constructions.length,0);
 assert.equal(c.mana.PLAYER.current,60);
 s=wait(s,c,"NPC");
 const out=await resolveBasicTimelineWindow(c,s,rolls);
 assert.equal(out.combat.tick,10);
 assert.equal(out.combat.constructions.length,1);
 assert.equal(out.combat.constructions[0].form,"FIELD");
 assert.equal(out.combat.constructions[0].material,"EARTH");
 assert.equal(out.combat.mana.PLAYER.current,50);
 assert.equal(out.combat.skillCooldowns.PLAYER["140"],0);
 assert.deepEqual(c,before);
});

test("two same-tick construction spells create independent authorized objects",async()=>{
 const c=battle();
 let s=cast(newTimelineDeclarationSession(c),c,sand,"PLAYER");
 s=cast(s,c,sand,"NPC");
 const out=await resolveBasicTimelineWindow(c,s,rolls);
 assert.equal(out.combat.constructions.length,2);
 assert.deepEqual(new Set(out.combat.constructions.map(x=>x.owner)),
   new Set(["PLAYER","NPC"]));
 assert.equal(out.combat.mana.PLAYER.current,50);
 assert.equal(out.combat.mana.NPC.current,50);
});

test("approved mirror launches its first ray at creation; later rays are scheduled separately",async()=>{
 const c=battle();
 let s=cast(newTimelineDeclarationSession(c),c,mirrorSkill);
 s=wait(s,c,"NPC");
 const out=await resolveBasicTimelineWindow(c,s,rolls);
 assert.equal(out.combat.tick,10);
 assert.equal(out.combat.constructions.length,1);
 const mirror=out.combat.constructions[0];
 assert.equal(mirror.form,"MIRROR");
 assert.ok(mirror.mirror);
 assert.equal(out.combat.mana.PLAYER.current,45);
 assert.ok(out.combat.actors.NPC.hp<180);
 assert.ok(out.combat.log.some(x=>x.kind==="RESOLVE"&&x.mirrorShot));
 assert.deepEqual(scheduleMirrorRayTicks(out.combat,10,99),[]);
 assert.deepEqual(scheduleMirrorRayTicks(out.combat,10,100),
   [{tick:100,constructionId:mirror.id,owner:"PLAYER"}]);
 s=wait(out.timeline,out.combat,"PLAYER","wait-to-next-round");
 await assert.rejects(()=>resolveBasicTimelineWindow(out.combat,s,rolls),
   /espejo debe emitir su rayo autónomo/);
});

test("magic directed ray reflects from first enemy mirror on measured world path",async()=>{
 const c=battle(4),before=structuredClone(c);
 c.constructions=[mirrored()];
 let s=cast(newTimelineDeclarationSession(c),c,directedSkill);
 s=wait(s,c,"NPC");
 const out=await resolveBasicTimelineWindow(c,s,rolls);
 assert.equal(out.combat.actors.NPC.hp,180);
 assert.equal(out.combat.actors.PLAYER.hp,140);
 assert.equal(out.combat.mana.PLAYER.current,48);
 assert.ok(out.combat.log.some(x=>x.kind==="REFLECTION"&&x.constructionId==="mid"));
 assert.equal(out.combat.constructions[0].durability,5);
 assert.equal(before.actors.PLAYER.hp,180);
});

test("measured solid wall prevents moving through its world volume",async()=>{
 const c=battle();c.constructions=[wall()];
 let s=declareTimelineCommand(newTimelineDeclarationSession(c),c,"PLAYER",{
   kind:"MOVE",direction:"VECTOR",meters:1,planarMove:{x:1,y:0},
 },"move-into-wall");
 s=wait(s,c,"NPC");
 await assert.rejects(()=>resolveBasicTimelineWindow(c,s,rolls),
   /obstáculo wall/);
 assert.equal(c.actors.PLAYER.positionMeters,0);
 assert.equal(c.constructions[0].durability,90);
});

test("two simultaneous authorized hits add durability wear once against same wall",()=>{
 const c=battle();c.constructions=[wall("shared",90)];
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"impact-a",kind:"ATTACK",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",
   {id:"impact-b",kind:"ATTACK",durationTicks:10,paCost:1});
 const batch=completeNextTimelineBatch(clock);
 const out=commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"impact-a",constructionWear:[
     {id:"shared",amount:50,hitCountDelta:1}]},
   {eventId:"impact-b",constructionWear:[
     {id:"shared",amount:50,hitCountDelta:1}]},
 ]);
 assert.equal(out.constructions.length,0);
 assert.equal(c.constructions[0].durability,90);
 assert.ok(out.log.length>=0);
});

test("construction world diff accepts only approved wear, rejects geometry change",()=>{
 const before=[wall("gate",90)];
 const after=[{...wall("gate",65),hitCount:1}];
 assert.deepEqual(diffConstructionWorld(before,after).wear,
   [{id:"gate",amount:25,hitCountDelta:1}]);
 assert.throws(()=>diffConstructionWorld(before,[
   {...before[0],fieldPosition:{x:2,y:0}}]),/geometría/);
 assert.throws(()=>diffConstructionWorld(before,[
   {...before[0],durability:110}]),/reparada/);
 const gone=diffConstructionWorld(before,[]);
 assert.deepEqual(gone.wear,[{id:"gate",amount:90,hitCountDelta:1}]);
});

test("two solid walls cannot materialize in the same occupied location",()=>{
 const c=battle();let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",
   {id:"cast-one",kind:"SKILL",durationTicks:10,paCost:1});
 clock=queueTimelineAction(clock,"NPC",
   {id:"cast-two",kind:"SKILL",durationTicks:10,paCost:1});
 const batch=completeNextTimelineBatch(clock);
 const a={...wall("alpha"),owner:"PLAYER",fieldPosition:{x:3,y:0}};
 const b={...wall("beta"),owner:"NPC",fieldPosition:{x:3,y:0}};
 assert.throws(()=>commitAuthorizedTimelineBatch(c,batch,[
   {eventId:"cast-one",constructionsCreated:[a]},
   {eventId:"cast-two",constructionsCreated:[b]},
 ]),/solapan/);
 assert.equal(c.constructions.length,0);
});
