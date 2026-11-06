import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 measuredBlock,measuredSegmentHit,firstMeasuredObstacle,firstCoverAlongStroke,
 blockingMovement,validatePhysicalCollider,
} from "../lib/combat/physical-obstacles.ts";
import {
 newCombatState,applyCombatCommand,applyResolvedCombatSkill,remainingAp,
} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {progressTrainingNpc} from "../lib/combat/npc-policy.ts";

const fighter=(name,id,x,patch={})=>({
 name,characterId:id,hp:100,maxHp:100,agility:80,speedValue:80,
 strength:30,constitution:11,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:30,magicDefense:50,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Maza",attackType:"BLUNT",mode:"MELEE",
  effectiveRangeMeters:3,maximumRangeMeters:3},
 ...patch,
});
const initial=()=>{
 const s=newCombatState(fighter("Jugador",101,0),fighter("Rival",102,1.5,{speedValue:75}));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const block=(id,x=.5,y=0,overrides={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",label:id,
 center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y},heightMeters:0,
 footprintRadiusMeters:.15,solidHeightMeters:2,
 tangible:true,durability:90,hitCount:0,...overrides,
});
const dice={hit:.01,critical:.99,defense:.99};
const strokeLow=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const strokeHigh=[{x:.1,y:.5},{x:.5,y:.5}];
function swing(s,stroke=strokeLow){
 return applyCombatCommand(s,"PLAYER",
  {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",trajectory:stroke},dice);
}
const resolve=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const sand={id:140,name:"Sikatā",status:"APPROVED",category:"UTILITY",cost:10,
 effect:[{type:"NARRATIVE",value:1,target:"CARD:W002",element:"EARTH",capability:"CREATE"}],
 mechanics:{},areaOfEffect:"Objeto | Alcance máximo: 5 m",duration:"No termina"};
const construct=compileCombatSkill(sand);

test("measured cylinder requires complete server-validated 3D dimensions, not a map sprite",()=>{
 const c=block("wall");
 assert.equal(measuredBlock(c),true);
 assert.deepEqual(validatePhysicalCollider(.4,2,0,{x:.5,y:0}),
  {radiusMeters:.4,solidHeightMeters:2});
 for(const values of [[.4,undefined,0,{x:0,y:0}],
  [undefined,2,0,{x:0,y:0}],[".4",2,0,{x:0,y:0}],
  [4,2,0,{x:0,y:0}],[0,2,0,{x:0,y:0}],
  [.4,11,0,{x:0,y:0}],[.4,2,9,{x:0,y:0}],
  [.4,2,0,undefined]]){
  assert.throws(()=>validatePhysicalCollider(...values),/radio|altura|posición|base/);
 }
 assert.equal(validatePhysicalCollider(undefined,undefined,undefined,undefined),undefined);
 assert.equal(measuredBlock({...c,footprintRadiusMeters:undefined}),false);
 assert.equal(measuredBlock({...c,fieldPosition:undefined}),false);
 assert.equal(measuredBlock({...c,solidHeightMeters:undefined}),false);
 assert.equal(measuredBlock({...c,form:"FIELD"}),false);
 assert.equal(measuredBlock({...c,durability:0}),false);
});

test("3D ray tests both the horizontal footprint and altitude, including tangent and ordering",()=>{
 const c=block("close",.5,0);
 assert.equal(measuredSegmentHit(c,{x:0,y:0},{x:1.5,y:0},1,1)!==null,true);
 assert.equal(measuredSegmentHit(c,{x:0,y:0},{x:1.5,y:0},4,4),null,
  "a low barrier cannot stop a high arc");
 assert.equal(measuredSegmentHit(c,{x:0,y:.2},{x:1.5,y:.2},1,1),null,
  "lateral miss");
 assert.equal(measuredSegmentHit({...c,heightMeters:4},{x:0,y:0},{x:1.5,y:0},1,1),null,
  "a floating wall does not block ground");
 const other=block("far",1,0);
 const first=firstMeasuredObstacle([other,c],{x:0,y:0},{x:1.5,y:0},1,1);
 assert.equal(first.block.id,"close");
 assert.equal(firstMeasuredObstacle([other,c],{x:0,y:0},{x:1.5,y:0},1,1,"close").block.id,"far");
 const curve=firstCoverAlongStroke([c],{x:0,y:0},{x:1.5,y:0},strokeLow);
 assert.equal(curve.block.id,"close");
 assert.equal(firstCoverAlongStroke([c],{x:0,y:0},{x:1.5,y:0},strokeHigh),null);
});

test("drawn movement is blocked at a crossed wall and does not spend AP, ticks or position",()=>{
 const s=initial();s.constructions=[block("rock",.5)];
 const before=structuredClone(s);
 assert.ok(blockingMovement(s.constructions,{x:0,y:0},{x:1,y:0}));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",
  {kind:"MOVE",direction:"VECTOR",meters:1,planarMove:{x:1,y:0}},dice),/obstáculo rock/);
 assert.deepEqual(s,before,"a failed transition cannot mutate persisted state");
 const clear=applyCombatCommand(s,"PLAYER",
  {kind:"MOVE",direction:"VECTOR",meters:.5,planarMove:{x:0,y:.5}},dice);
 assert.equal(clear.actors.PLAYER.fieldPosition.y,.5,"moving around it remains valid");
 assert.equal(clear.actors.PLAYER.spentAp,1);
});

test("legacy TOWARD movement also cannot pass a measured obstacle and a historical unmeasured BLOCK is compatible",()=>{
 const s=initial();s.constructions=[block("gate",.5)];
 assert.throws(()=>applyCombatCommand(s,"PLAYER",
  {kind:"MOVE",meters:1,direction:"TOWARD"},dice),/obstáculo gate/);
 const legacy=initial();legacy.constructions=[{...block("old"),footprintRadiusMeters:undefined}];
 const moved=applyCombatCommand(legacy,"PLAYER",
  {kind:"MOVE",meters:1,direction:"TOWARD"},dice);
 assert.equal(moved.actors.PLAYER.positionMeters,1);
 assert.equal(moved.constructions[0].durability,90);
});

test("BEFORE and AFTER composites reject blocked paths before a pending defense can deadlock",()=>{
 for(const order of ["BEFORE","AFTER"]){
  const s=initial();s.constructions=[block("wall",.5)];
  assert.throws(()=>applyCombatCommand(s,"PLAYER",
   {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
    trajectory:strokeHigh,planarMove:{x:.75,y:0},movementOrder:order},dice),
   /obstáculo wall/);
  assert.equal(s.pending,null,order+" must not create an unresolvable incoming attack");
  assert.equal(s.actors.PLAYER.spentAp,0);
  assert.equal(s.actors.PLAYER.spentTicks,0);
 }
});

test("physical line of fire intersects measured barriers: cover takes damage, not the target",()=>{
 const s=initial();s.constructions=[block("cover",.5,0,{durability:90})];
 const launched=swing(s);
 assert.equal(launched.pending.explicitTrajectory,true);
 const settled=resolve(launched);
 assert.equal(settled.actors.NPC.hp,100);
 assert.equal(settled.constructions[0].durability,65,
  "one physical attack wears measured material only once");
 assert.equal(settled.constructions[0].hitCount,1);
 assert.equal(settled.actors.PLAYER.spentAp,1);
 assert.ok(settled.log.some(e=>e.kind==="CONSTRUCTION"&&e.constructionId==="cover"));
 const last=settled.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
 assert.equal(last.contact,false);
 assert.equal(last.damage,0);
 assert.match(last.summary,/cover interceptó/);
});

test("a high stroke passes above the same wall, while a lower curved stroke intersects",()=>{
 const s=initial();s.constructions=[block("wall",.5)];
 const high=resolve(swing(s,strokeHigh));
 assert.ok(high.actors.NPC.hp<100);
 assert.equal(high.constructions[0].durability,90);
 const low=resolve(swing(s,strokeLow));
 assert.equal(low.actors.NPC.hp,100);
 assert.ok(low.constructions[0].durability<90);
});

test("barrier durability can break and partial remaining force reaches the fighter",()=>{
 const baseline=resolve(swing(initial()));
 const s=initial();s.constructions=[block("fragile",.5,0,{durability:5})];
 const hit=resolve(swing(s));
 assert.equal(hit.constructions.some(c=>c.id==="fragile"),false);
 assert.ok(hit.actors.NPC.hp<100);
 assert.ok(hit.actors.NPC.hp>baseline.actors.NPC.hp,
  "breaking a barrier reduces, rather than duplicates, the original damage");
 const last=hit.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
 assert.equal(last.contact,true);
 assert.ok(last.damage>0);
});

test("no physical cover is invented for magic, area skills, auto strokes, decorations or elevated blocks",()=>{
 const direct=initial();direct.constructions=[block("wall",.5)];
 const magic=applyCombatCommand(direct,"PLAYER",
  {kind:"ATTACK",attackType:"BLUNT",usesMagic:true,areaCenter:{x:.5,y:.5}},dice);
 const magicResolved=resolve(magic);
 assert.ok(magicResolved.actors.NPC.hp<100);
 const automatic=applyCombatCommand(direct,"PLAYER",
  {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND"},dice);
 assert.equal(automatic.pending.explicitTrajectory,false);
 const noCover=resolve(automatic);
 assert.equal(noCover.constructions[0].durability,90);
 const floating=initial();floating.constructions=[block("high-wall",.5,0,{heightMeters:5})];
 const under=resolve(swing(floating));
 assert.ok(under.actors.NPC.hp<100);
 assert.equal(under.constructions[0].durability,90);
});

test("explicitly measured constructions keep base, radius and solid height without changing historical creation",()=>{
 let s=initial();
 s=applyResolvedCombatSkill(s,"PLAYER",construct,{
  requestId:"make-field-volume-001",areaCenter:{x:.5,y:.5},constructionForm:"FIELD"},dice);
 assert.equal(s.constructions[0].footprintRadiusMeters,undefined);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 const stateBefore=structuredClone(s);
 for(const [r,h] of [[.4,undefined],[undefined,2],[3.1,2],[.4,11]]){
  assert.throws(()=>applyResolvedCombatSkill(stateBefore,"PLAYER",construct,{
   requestId:"invalid-volume-00001",areaCenter:{x:.5,y:.5},
   constructionForm:"BLOCK",constructionFieldPoint:{x:.65,y:.5},constructionHeightMeters:0,
   constructionFootprintRadiusMeters:r,constructionSolidHeightMeters:h},dice),/radio|altura/);
 }
 assert.deepEqual(s,stateBefore);
 const created=applyResolvedCombatSkill(s,"PLAYER",construct,{
  requestId:"make-block-volume-001",areaCenter:{x:.5,y:.5},
  constructionForm:"BLOCK",constructionFieldPoint:{x:.6,y:.5},
  constructionHeightMeters:0,constructionFootprintRadiusMeters:.35,
  constructionSolidHeightMeters:2},dice);
 const wall=created.constructions.find(c=>c.form==="BLOCK");
 assert.equal(wall.fieldPosition.x,1);
 assert.equal(wall.footprintRadiusMeters,.35);
 assert.equal(wall.solidHeightMeters,2);
 assert.equal(wall.heightMeters,0);
 assert.ok(measuredBlock(wall));
 assert.equal(created.mana.PLAYER.current,40);
 assert.equal(created.actors.PLAYER.spentAp,2);
 assert.throws(()=>applyResolvedCombatSkill(s,"PLAYER",construct,{
  requestId:"invalid-overlap-001",areaCenter:{x:.5,y:.5},
  constructionForm:"BLOCK",constructionFieldPoint:{x:.5,y:.5},
  constructionHeightMeters:0,constructionFootprintRadiusMeters:.35,
  constructionSolidHeightMeters:2},dice),/combatiente/);
 const historic=applyResolvedCombatSkill(s,"PLAYER",construct,{
  requestId:"legacy-block-vol-001",areaCenter:{x:.5,y:.5},
  constructionForm:"BLOCK"},dice);
 assert.equal(historic.constructions.find(c=>c.form==="BLOCK").footprintRadiusMeters,undefined);
});

test("public view preserves measured footprint but never reveals a pending hit center",()=>{
 const s=initial();s.constructions=[block("public-cover",.5)];
 const launched=applyCombatCommand(s,"PLAYER",
  {kind:"ATTACK",attackType:"BLUNT",usesMagic:true,areaCenter:{x:.3,y:.3}},dice);
 const view=combatClientView(launched);
 assert.equal(view.pending.targetCenter,undefined);
 assert.equal(view.constructions[0].footprintRadiusMeters,.15);
 assert.equal(view.constructions[0].solidHeightMeters,2);
 const ui=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 const map=readFileSync(new URL("../app/combat/[id]/CombatTopDownPlane.tsx",import.meta.url),"utf8");
 assert.match(ui,/constructionFootprintRadiusMeters/);
 assert.match(ui,/constructionSolidHeightMeters/);
 assert.match(map,/blockingMovement/);
 assert.match(map,/plannedFootprintRadiusMeters/);
});

test("training NPC routes around a measured barrier instead of retrying the impossible move forever",()=>{
 const s=newCombatState(fighter("Hero",101,0),fighter("Training NPC",null,4,{
  magicAttack:0,speedValue:40,
 }));
 s.constructions=[block("npc-gate",3.5,0,{footprintRadiusMeters:.2})];
 const afterWait=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},dice);
 const progressed=progressTrainingNpc(afterWait,()=>dice,()=>.8);
 const steps=progressed.log.filter(e=>e.kind==="MOVE"&&e.by==="NPC");
 assert.ok(steps.some(e=>e.movementDirection==="VECTOR"),
  "NPC must try a legal lateral route around the block");
 const npc=progressed.actors.NPC;
 assert.ok(Math.hypot((npc.fieldPosition?.x??npc.positionMeters)-3.5,
  (npc.fieldPosition?.y??0))>=.2-1e-5,"NPC cannot end inside measured cover");
});

test("NPC chooses a paid WAIT instead of throwing when no one-meter escape route is clear",()=>{
 const s=newCombatState(fighter("Hero",101,0),fighter("Training NPC",null,4,{
  magicAttack:0,speedValue:40,
 }));
 s.constructions=[block("encircling",4,0,{footprintRadiusMeters:3})];
 const afterWait=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},dice);
 const progressed=progressTrainingNpc(afterWait,()=>dice,()=>.8);
 assert.ok(progressed.log.some(e=>e.kind==="WAIT"&&e.by==="NPC"),
  "a blocked training NPC must not freeze the encounter");
});
