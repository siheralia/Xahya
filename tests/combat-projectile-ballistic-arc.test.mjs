import test from "node:test";
import assert from "node:assert/strict";
import {
 coversAlongProjectileFlight,projectileHeightAt,validateProjectileHeights,
 PROJECTILE_ARC_SEGMENTS,MAX_PROJECTILE_ARC_RISE_METERS,
} from "../lib/combat/physical-obstacles.ts";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {readFileSync} from "node:fs";

const fighter=(name,id,x,patch={})=>({
 name,characterId:id,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:30,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"PIERCE",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch,
});
const bow={name:"Arco",attackType:"PIERCE",mode:"RANGED",
 effectiveRangeMeters:6,maximumRangeMeters:6};
const spear={name:"Jabalina",attackType:"PIERCE",mode:"MELEE",
 effectiveRangeMeters:2,maximumRangeMeters:2,throwable:true,throwRangeMeters:6};
const initial=(weapon=bow)=>{
 const s=newCombatState(fighter("Arquera",101,0,{equippedWeapon:structuredClone(weapon)}),
  fighter("Rival",102,4,{speedValue:70}));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const block=(id,x,durability=90,patch={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.18,tangible:true,durability,hitCount:0,...patch,
});
const roll={hit:.01,critical:.99,defense:.99};
const heights=(arcRiseMeters,launchMeters=1.5,impactMeters=1.5)=>
 ({launchMeters,impactMeters,arcRiseMeters});
const fire=(state,arcRiseMeters=0,options={})=>applyCombatCommand(state,"PLAYER",{
 kind:"ATTACK",rangedPhysical:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights:heights(arcRiseMeters),...options,
},roll);
const throwIt=(state,arcRiseMeters)=>applyCombatCommand(state,"PLAYER",{
 kind:"ATTACK",throwWeapon:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights:heights(arcRiseMeters)
},roll);
const settle=state=>applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
const damage=state=>state.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
const worn=state=>state.log.filter(e=>e.kind==="CONSTRUCTION"&&e.contact);
const get=(state,id)=>state.constructions?.find(c=>c.id===id);
const directFlight=(rise=0)=>({from:{x:0,y:0},to:{x:4,y:0},
 launchHeightMeters:1.5,impactHeightMeters:1.5,arcRiseMeters:rise});

test("rise 0 is an exact straight path; a positive rise peaks over the line at midpoint",()=>{
 assert.equal(MAX_PROJECTILE_ARC_RISE_METERS,5);
 assert.equal(PROJECTILE_ARC_SEGMENTS,64);
 const straight=directFlight(0),arc=directFlight(3);
 for(const t of [0,.05,.25,.5,.75,.95,1])
  assert.equal(projectileHeightAt(straight,t),1.5);
 assert.equal(projectileHeightAt(arc,0),1.5);
 assert.equal(projectileHeightAt(arc,1),1.5);
 assert.equal(projectileHeightAt(arc,.5),4.5);
 assert.equal(projectileHeightAt(arc,.25),3.75);
 assert.equal(projectileHeightAt(arc,.75),3.75);
 assert.deepEqual(validateProjectileHeights(1.5,1.5,3),
  {launchHeightMeters:1.5,impactHeightMeters:1.5,arcRiseMeters:3});
 assert.deepEqual(validateProjectileHeights(1.5,1.5),
  {launchHeightMeters:1.5,impactHeightMeters:1.5,arcRiseMeters:0});
});

test("server bounds the entire parabola analytically rather than endpoints alone",()=>{
 for(const [l,i,a] of [
  [1.5,1.5,-1],[1.5,1.5,5.01],[-1,1,1],[1,11,1],
  [9,9,2],[10,0,5],["2",2,1],[NaN,2,1],[1,2,Infinity],
 ]){
  assert.throws(()=>validateProjectileHeights(l,i,a),/altura|arco/i);
 }
 assert.deepEqual(validateProjectileHeights(8,8,2),{
  launchHeightMeters:8,impactHeightMeters:8,arcRiseMeters:2
 });
});

test("an arcing arrow flies above a low wall that stops the same straight shot",()=>{
 const s=initial();s.constructions=[block("low",2)];
 const straight=settle(fire(s,0));
 assert.equal(get(straight,"low").durability,65);
 assert.equal(straight.actors.NPC.hp,180);
 const arc=settle(fire(s,3));
 assert.equal(get(arc,"low").durability,90);
 assert.equal(worn(arc).length,0);
 assert.ok(arc.actors.NPC.hp<180);
 assert.equal(damage(arc).contact,true);
});

test("a raised wall intercepts a curved arrow while a straight shot passes BELOW it",()=>{
 const s=initial();
 s.constructions=[block("high",2,90,{heightMeters:3,solidHeightMeters:2})];
 const straight=settle(fire(s,0));
 assert.equal(get(straight,"high").durability,90);
 assert.ok(straight.actors.NPC.hp<180);
 const curved=settle(fire(s,3));
 assert.equal(get(curved,"high").durability,65);
 assert.equal(curved.actors.NPC.hp,180);
 assert.equal(damage(curved).contact,false);
 assert.deepEqual(worn(curved).map(x=>x.constructionId),["high"]);
});

test("a low near-origin obstacle can catch an arc BEFORE it climbs over the central low wall",()=>{
 const early=block("near",.1,90,{footprintRadiusMeters:.04});
 const middle=block("middle",2,90);
 const hits=coversAlongProjectileFlight([middle,early],directFlight(3));
 assert.deepEqual(hits.map(x=>x.block.id),["near"],
  "first near-ground contact prevents it reaching the middle");
});

test("two raised walls wear in 3D depth order only once despite 64 trajectory segments",()=>{
 const s=initial();
 s.constructions=[
  block("far",3,50,{heightMeters:3,solidHeightMeters:2}),
  block("near",1,5,{heightMeters:3,solidHeightMeters:2}),
 ];
 const curved=settle(fire(s,3));
 assert.deepEqual(worn(curved).map(x=>x.constructionId),["near","far"]);
 assert.deepEqual(worn(curved).map(x=>x.damage),[5,20]);
 assert.equal(get(curved,"near"),undefined);
 assert.equal(get(curved,"far").durability,30);
 assert.equal(get(curved,"far").hitCount,1);
 assert.equal(curved.actors.NPC.hp,180);
});

test("breaking two floating barriers leaves proportional damage, never extra force",()=>{
 const baseline=settle(fire(initial(),3));
 assert.ok(damage(baseline).damage>0);
 const s=initial();s.constructions=[
  block("rear",3,6,{heightMeters:3,solidHeightMeters:2}),
  block("front",1,4,{heightMeters:3,solidHeightMeters:2}),
 ];
 const resolved=settle(fire(s,3));
 assert.equal(resolved.constructions.length,0);
 assert.deepEqual(worn(resolved).map(x=>x.damage),[4,6]);
 assert.equal(damage(resolved).damage,Math.round(damage(baseline).damage*15/25));
 assert.equal(resolved.actors.NPC.hp,180-damage(resolved).damage);
});

test("lateral, decorative and legacy blocks remain unable to invent an arc impact",()=>{
 const s=initial();s.constructions=[
  block("lateral",2,90,{fieldPosition:{x:2,y:.8},heightMeters:3}),
  block("old",2,90,{fieldPosition:undefined,heightMeters:3}),
  block("decor",2,90,{form:"DECOR",heightMeters:3}),
 ];
 const result=settle(fire(s,3));
 assert.ok(result.actors.NPC.hp<180);
 assert.equal(worn(result).length,0);
 assert.deepEqual(result.constructions.map(c=>c.durability),[90,90,90]);
});

test("a thrown weapon follows the arcing flight and stops beside floating cover",()=>{
 const s=initial(spear);
 s.constructions=[block("arch",2,90,{heightMeters:3,solidHeightMeters:2})];
 const launch=throwIt(s,3);
 assert.equal(launch.pending.projectileFlight.arcRiseMeters,3);
 assert.equal(launch.droppedWeapons[0].positionMeters,4);
 const hit=settle(launch);
 assert.equal(hit.actors.NPC.hp,180);
 assert.equal(hit.droppedWeapons[0].positionMeters,2);
 assert.equal(get(hit,"arch").durability,65);
 assert.equal(hit.actors.PLAYER.spentAp,1);
});

test("an arc's origin is fixed by BEFORE movement; AFTER movement cannot shift it",()=>{
 const before=fire(initial(),2,{
  movementOrder:"BEFORE",planarMove:{x:.5,y:0}
 });
 assert.ok(Math.abs(before.pending.projectileFlight.from.x-.5)<1e-9);
 const after=fire(initial(),2,{
  movementOrder:"AFTER",planarMove:{x:.5,y:0}
 });
 assert.equal(after.pending.projectileFlight.from.x,0);
 const arrived=settle(after);
 assert.ok(Math.abs(arrived.actors.PLAYER.positionMeters-.5)<1e-9);
});

test("the full curved-flight path is private until resolved, and a legacy line stays valid",()=>{
 const arc=fire(initial(),3);
 assert.equal(arc.pending.projectileFlight.arcRiseMeters,3);
 assert.equal(combatClientView(arc).pending.projectileFlight,undefined);
 const s=initial();s.constructions=[block("low",2)];
 const legacy=fire(s,0,{projectileHeights:{
  launchMeters:1.5,impactMeters:1.5
 }});
 assert.equal(legacy.pending.projectileFlight.arcRiseMeters,undefined);
 const settled=settle(legacy);
 assert.equal(get(settled,"low").durability,65);
});

test("invalid arc does not spend AP, ticks or mana, or mutate a pending snapshot",()=>{
 const s=initial();s.constructions=[block("solid",2)];
 const snapshot=structuredClone(s);
 for(const arcRiseMeters of [-.1,6,Infinity,NaN,"4"]){
  assert.throws(()=>fire(s,arcRiseMeters),/arco/);
 }
 assert.throws(()=>fire(s,2,{projectileHeights:heights(2,9,9)}),/altura/);
 assert.deepEqual(s,snapshot);
});

test("player controls explicitly expose arcing on both ranged and thrown attacks",()=>{
 const ui=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(ui,/Elevación del arco del proyectil/);
 assert.match(ui,/arcRiseMeters:projectileArcRise/);
 assert.match(ui,/maxProjectileArcRise/);
});
