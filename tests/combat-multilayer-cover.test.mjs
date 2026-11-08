import test from "node:test";
import assert from "node:assert/strict";
import {
 coversAlongStroke,firstCoverAlongStroke,measuredBlock,
} from "../lib/combat/physical-obstacles.ts";
import {applyCombatCommand,newCombatState} from "../lib/combat/turn-engine.ts";

const fighter=(name,id,positionMeters,overrides={})=>({
 name,characterId:id,hp:100,maxHp:100,agility:80,speedValue:80,
 strength:30,constitution:11,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:30,magicDefense:50,
 critical:0,luck:15,race:20,massKg:70,positionMeters,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Maza",attackType:"BLUNT",mode:"MELEE",
  effectiveRangeMeters:3,maximumRangeMeters:3},
 ...overrides
});
const initial=()=>newCombatState(fighter("Atacante",101,0),
 fighter("Defensor",102,1.5,{speedValue:75}));
const dice={hit:0.01,critical:0.99,defense:0.99};
const stroke=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const highStroke=[{x:.1,y:.5},{x:.5,y:.5}];
const wall=(id,x,durability,overrides={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability,hitCount:0,
 ...overrides
});
const swing=s=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",trajectory:stroke,
},dice);
const resolve=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const resolvedStrike=s=>resolve(swing(s));
const impact=s=>s.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
const impacts=s=>s.log.filter(e=>e.kind==="CONSTRUCTION"&&e.contact);
const after=s=>s.constructions??[];

test("all measured intersections are ordered by actual 3D depth, independent of creation order",()=>{
 const walls=[wall("far",.5,15),wall("near",.2,10),wall("invisible",.35,9,{form:"DECOR",tangible:false})];
 const hits=coversAlongStroke(walls,{x:0,y:0},{x:1.5,y:0},stroke);
 assert.deepEqual(hits.map(h=>h.block.id),["near","far"]);
 assert.ok(hits[0].t<hits[1].t);
 assert.equal(firstCoverAlongStroke(walls,{x:0,y:0},{x:1.5,y:0},stroke)?.block.id,"near");
 assert.deepEqual(coversAlongStroke(walls,{x:0,y:0},{x:1.5,y:0},highStroke),[]);
});

test("identical-depth cover order is deterministic, and one winding stroke cannot wear a wall twice",()=>{
 const same=[wall("z",.25,5),wall("a",.25,5)];
 const ordered=coversAlongStroke(same,{x:0,y:0},{x:1.5,y:0},stroke);
 assert.deepEqual(ordered.map(h=>h.block.id),["a","z"]);
 const zigzag=[{x:.1,y:.9},{x:.15,y:.9},{x:.2,y:.9},
  {x:.15,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
 const hits=coversAlongStroke([wall("one",.5,12,{footprintRadiusMeters:.18})],
  {x:0,y:0},{x:1.5,y:0},zigzag);
 assert.deepEqual(hits.map(h=>h.block.id),["one"]);
});

test("a strong front barrier absorbs the entire attack; farther walls and target remain intact",()=>{
 const s=initial();
 s.constructions=[wall("rear",.5,4),wall("front",.2,40)];
 const result=resolvedStrike(s);
 assert.equal(after(result).find(b=>b.id==="front")?.durability,15);
 assert.equal(after(result).find(b=>b.id==="front")?.hitCount,1);
 assert.equal(after(result).find(b=>b.id==="rear")?.durability,4);
 assert.equal(after(result).find(b=>b.id==="rear")?.hitCount,0);
 assert.deepEqual(impacts(result).map(e=>e.constructionId),["front"]);
 assert.equal(result.actors.NPC.hp,100);
 assert.equal(impact(result).damage,0);
 assert.equal(impact(result).contact,false);
 assert.equal(result.actors.PLAYER.spentAp,1);
});

test("breaking a front barrier transfers only residual force to the barrier behind it",()=>{
 const s=initial();
 s.constructions=[wall("rear",.5,40),wall("front",.2,5)];
 const result=resolvedStrike(s);
 assert.equal(after(result).some(b=>b.id==="front"),false);
 assert.equal(after(result).find(b=>b.id==="rear")?.durability,20,
  "25 pressure minus 5 spent on front leaves 20 for the rear");
 assert.equal(after(result).find(b=>b.id==="rear")?.hitCount,1);
 assert.deepEqual(impacts(result).map(e=>e.constructionId),["front","rear"]);
 assert.deepEqual(impacts(result).map(e=>e.damage),[5,20]);
 assert.equal(result.actors.NPC.hp,100,"two barriers together stop the attack");
 assert.equal(impact(result).contact,false);
 assert.equal(impact(result).damage,0);
});

test("breaking two weak barriers lets only the remaining pressure reach the fighter",()=>{
 const baseline=resolvedStrike(initial());
 assert.ok(impact(baseline).damage>0);
 const s=initial();
 s.constructions=[wall("rear",.5,6),wall("front",.2,4)];
 const result=resolvedStrike(s);
 assert.equal(after(result).length,0);
 assert.deepEqual(impacts(result).map(e=>e.constructionId),["front","rear"]);
 assert.deepEqual(impacts(result).map(e=>e.damage),[4,6]);
 const expected=Math.round(impact(baseline).damage*15/25);
 assert.equal(impact(result).damage,expected);
 assert.equal(result.actors.NPC.hp,100-expected);
 assert.equal(impact(result).contact,true,"remaining pressure reaches the fighter");
 assert.ok(result.actors.NPC.hp>baseline.actors.NPC.hp);
 assert.equal(impacts(result).length,2,"each barrier wears only once");
});

test("barriers outside the drawn height/footprint and legacy sprites never shield",()=>{
 const s=initial();
 s.constructions=[
  wall("high",.2,40,{heightMeters:4,solidHeightMeters:2}),
  wall("side",.5,40,{fieldPosition:{x:.5,y:.3}}),
  wall("legacy",.3,40,{footprintRadiusMeters:undefined}),
  wall("cosmetic",.4,40,{form:"DECOR",tangible:false}),
 ];
 assert.equal(measuredBlock(s.constructions[2]),false);
 const baseline=resolvedStrike(initial());
 const result=resolvedStrike(s);
 assert.equal(impact(result).damage,impact(baseline).damage);
 assert.equal(impacts(result).length,0);
 for(const c of after(result))assert.equal(c.durability,40);
 assert.equal(result.actors.NPC.hp,baseline.actors.NPC.hp);
});

test("physical cover path never causes extra spending, and NONE remains a free reaction",()=>{
 const s=initial();
 s.constructions=[wall("front",.2,5),wall("rear",.5,5)];
 const launch=swing(s);
 const replay=structuredClone(launch);
 const result=resolve(launch);
 assert.equal(s.actors.PLAYER.spentAp,0,"pure initial state was not mutated");
 assert.deepEqual(launch,replay,"resolution must not mutate an unresolved snapshot");
 assert.equal(result.actors.PLAYER.spentAp,1);
 assert.equal(result.actors.NPC.spentAp,0);
 assert.equal(result.actors.NPC.spentTicks,0);
 assert.equal(result.pending,null);
});
