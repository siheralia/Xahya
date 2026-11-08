import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const fighter=(name,id,x,patch={})=>({
 name,characterId:id,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:40,magicDefense:10,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"PIERCE",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch,
});
const bow={name:"Arco",attackType:"PIERCE",mode:"RANGED",
 effectiveRangeMeters:6,maximumRangeMeters:6};
const throwingWeapon={name:"Jabalina",attackType:"PIERCE",mode:"MELEE",
 effectiveRangeMeters:2,maximumRangeMeters:2,
 throwable:true,throwRangeMeters:6};
const state=(weapon=bow)=>{
 const s=newCombatState(
  fighter("Arquera",101,0,{equippedWeapon:structuredClone(weapon)}),
  fighter("Defensor",102,4,{speedValue:70})
 );
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const block=(id,x,durability=90,patch={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.18,tangible:true,durability,hitCount:0,...patch
});
const dice={hit:.01,critical:.99,defense:.99};
const heights=(launchMeters=1.5,impactMeters=1.5)=>({launchMeters,impactMeters});
const shot=(s,projectileHeights=heights(),options={})=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",rangedPhysical:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights,...options
},dice);
const thrown=(s,projectileHeights=heights())=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",throwWeapon:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights
},dice);
const none=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const hit=s=>s.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
const impacts=s=>s.log.filter(e=>e.kind==="CONSTRUCTION"&&e.contact);
const findBlock=(s,id)=>(s.constructions??[]).find(c=>c.id===id);

test("an aimed arrow captures a real 3D path and a measured wall absorbs it",()=>{
 const s=state();
 s.constructions=[block("wall",1.5)];
 const launch=shot(s);
 assert.deepEqual(launch.pending.projectileFlight,{
  from:{x:0,y:0},to:{x:4,y:0},launchHeightMeters:1.5,impactHeightMeters:1.5
 });
 assert.equal(combatClientView(launch).pending.projectileFlight,undefined,
  "private projectile heights and world trajectory do not leak");
 const snapshot=structuredClone(launch);
 const result=none(launch);
 assert.deepEqual(launch,snapshot,"resolving does not mutate the pending snapshot");
 assert.equal(result.actors.NPC.hp,180);
 assert.equal(findBlock(result,"wall").durability,65);
 assert.equal(findBlock(result,"wall").hitCount,1);
 assert.equal(impacts(result).length,1);
 assert.equal(impacts(result)[0].damage,25);
 assert.equal(hit(result).contact,false);
 assert.equal(hit(result).damage,0);
 assert.equal(result.actors.PLAYER.spentAp,1);
 assert.equal(result.pending,null);
});

test("sequential measured barriers absorb projectile pressure in depth order",()=>{
 const base=none(shot(state()));
 assert.ok(hit(base).damage>0);
 const s=state();
 s.constructions=[block("rear",2.5,50),block("front",1,5)];
 const result=none(shot(s));
 assert.equal(findBlock(result,"front"),undefined);
 assert.equal(findBlock(result,"rear")?.durability,30);
 assert.equal(findBlock(result,"rear")?.hitCount,1);
 assert.deepEqual(impacts(result).map(e=>e.constructionId),["front","rear"]);
 assert.deepEqual(impacts(result).map(e=>e.damage),[5,20]);
 assert.equal(result.actors.NPC.hp,180,"rear wall consumes the remainder");

 const weak=state();
 weak.constructions=[block("last",2.5,6),block("first",1,4)];
 const penetrated=none(shot(weak));
 assert.equal(penetrated.constructions.length,0);
 assert.deepEqual(impacts(penetrated).map(e=>e.damage),[4,6]);
 assert.equal(hit(penetrated).damage,Math.round(hit(base).damage*15/25));
 assert.equal(penetrated.actors.NPC.hp,180-hit(penetrated).damage);
 assert.equal(hit(penetrated).contact,true);
});

test("projectiles can fly above or laterally past measured cover, without interpreting old sprites",()=>{
 const s=state();
 s.constructions=[
  block("low",1.5,90),
  block("beside",2.5,90,{fieldPosition:{x:2.5,y:1}}),
  block("legacy",3.5,90,{solidHeightMeters:undefined}),
  block("decor",1,90,{form:"DECOR"}),
 ];
 const high=none(shot(s,heights(3.5,3.5)));
 assert.equal(impacts(high).length,0);
 for(const b of high.constructions)assert.equal(b.durability,90);
 const low=none(shot(s,heights(1,1)));
 assert.deepEqual(impacts(low).map(x=>x.constructionId),["low"]);
});

test("the projectile keeps its cover collision if its target successfully dodges",()=>{
 const s=state();
 s.constructions=[block("dodge-wall",1.5)];
 const launched=shot(s);
 const defended=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.5,y:.5}
 },{hit:.99,critical:.99,defense:.01});
 assert.equal(defended.actors.NPC.hp,180);
 assert.equal(hit(defended).contact,false);
 assert.equal(findBlock(defended,"dodge-wall").durability,65,
  "a dodge cannot erase a projectile mid-flight");
 assert.equal(impacts(defended).length,1);
});

test("a missed aim has no defined ray to the fighter and cannot invent cover collisions",()=>{
 const s=state();s.constructions=[block("in-world-line",1.5)];
 const launched=shot(s,heights(),{areaCenter:{x:.95,y:.95}});
 assert.equal(launched.pending.projectileFlight,undefined);
 const miss=none(launched);
 assert.equal(findBlock(miss,"in-world-line").durability,90);
 assert.equal(impacts(miss).length,0);
 assert.equal(miss.actors.NPC.hp,180);
});

test("old projectiles without recorded heights preserve their historical rules",()=>{
 const s=state();s.constructions=[block("legacy-cover",1.5)];
 const legacy=shot(s,undefined,{projectileHeights:undefined});
 assert.equal(legacy.pending.projectileFlight,undefined);
 const old=none(legacy);
 assert.equal(findBlock(old,"legacy-cover").durability,90);
 assert.ok(old.actors.NPC.hp<180);
});

test("invalid shot elevations fail atomically without charges or moving players",()=>{
 const s=state();s.constructions=[block("wall",1.5)];
 const before=structuredClone(s);
 for(const bad of [heights(-1,1),heights(1,11),heights(NaN,1),
  heights(Infinity,1),{launchMeters:"1",impactMeters:2},{launchMeters:1}]){
  assert.throws(()=>shot(s,bad),/alturas de salida e impacto/);
 }
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",usesMagic:true,
  areaCenter:{x:.5,y:.5},projectileHeights:heights()
 },dice),/alturas de salida e impacto/);
 assert.deepEqual(s,before);
});

test("throwing a weapon into solid cover drops it at that barrier, not behind it",()=>{
 const s=state(throwingWeapon);s.constructions=[block("throw-stop",1.5)];
 const launched=thrown(s);
 assert.equal(launched.droppedWeapons[0].positionMeters,4,
  "historical launch initially records target depth");
 assert.equal(launched.actors.PLAYER.equippedWeapon,undefined);
 const resolved=none(launched);
 assert.equal(findBlock(resolved,"throw-stop").durability,65);
 assert.equal(resolved.droppedWeapons[0].positionMeters,1.5,
  "the thrown weapon lands at the stopping cover");
 assert.equal(resolved.actors.NPC.hp,180);
 assert.equal(resolved.actors.PLAYER.spentAp,1);
 assert.equal(resolved.droppedWeapons.length,1);
});

test("a weak barrier broken by a thrown weapon lets it continue to target",()=>{
 const s=state(throwingWeapon);s.constructions=[block("breakable",1.5,5)];
 const resolved=none(thrown(s));
 assert.equal(findBlock(resolved,"breakable"),undefined);
 assert.ok(resolved.actors.NPC.hp<180);
 assert.equal(resolved.droppedWeapons[0].positionMeters,4);
});

test("BEFORE movement sets the origin of the projectile; AFTER movement does not alter its recorded path",()=>{
 const before=state();before.constructions=[block("wall",2.5)];
 const prepared=shot(before,heights(),{
  movementOrder:"BEFORE",planarMove:{x:0.5,y:0}
 });
 assert.ok(Math.abs(prepared.pending.projectileFlight.from.x-.5)<1e-9);
 assert.equal(prepared.pending.projectileFlight.to.x,4);
 const after=state();after.constructions=[block("wall",2.5)];
 const launched=shot(after,heights(),{
  movementOrder:"AFTER",planarMove:{x:.5,y:0}
 });
 assert.equal(launched.pending.projectileFlight.from.x,0);
 const settled=none(launched);
 assert.ok(Math.abs(settled.actors.PLAYER.positionMeters-.5)<1e-9);
 assert.equal(findBlock(settled,"wall").durability,65);
});

test("player-facing ranged controls expose both independent elevations",()=>{
 const ui=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(ui,/Altura de salida del proyectil/);
 assert.match(ui,/Altura de impacto del proyectil/);
 assert.match(ui,/projectileHeights:\{launchMeters:projectileLaunchHeight,impactMeters:projectileImpactHeight,[\s\S]*arcRiseMeters:projectileArcRise\}/);
});
