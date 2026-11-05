import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 fieldDistance,fieldPosition,moveFighterOnField,pointFromFieldView,
 pointToFieldView,previewPlanarMove,validatePlanarMove
} from "../lib/combat/field-plane.ts";
import {newCombatState,applyCombatCommand,remainingAp,turnTicks} from "../lib/combat/turn-engine.ts";

const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const dice={hit:.01,critical:.99,defense:.99};
const weapon={name:"Espada",attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1.5,
 maximumRangeMeters:1.5};
const actor=(name,id,pos,more={})=>({
 characterId:id,name,hp:100,maxHp:100,agility:90,speedValue:id===1?110:90,
 strength:45,constitution:20,precision:90,dodge:30,
 physicalAttack:50,physicalDefense:8,magicAttack:45,magicDefense:7,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,
 spentTicks:0,spentAp:0,equippedWeapon:weapon,...more,
});
const battle=(distance=1.7)=>newCombatState(actor("Jugador",1,0),actor("Rival",2,distance));
const strike=(extra={})=>({
 kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}],...extra,
});

test("one metre drawing is clamped in 10×10 metre horizontal plane",()=>{
 assert.deepEqual(previewPlanarMove({x:.6,y:.5}),{x:1,y:0});
 assert.deepEqual(previewPlanarMove({x:1,y:.5}),{x:1,y:0});
 assert.deepEqual(previewPlanarMove({x:.5,y:.4}),{x:0,y:-1});
 assert.deepEqual(previewPlanarMove({x:.5,y:.5}),{x:0,y:0});
 assert.throws(()=>validatePlanarMove({x:1.01,y:0}),/1 m/);
 assert.throws(()=>validatePlanarMove({x:.9,y:.9}),/1 m/);
 assert.throws(()=>validatePlanarMove({x:0,y:0}),/0,01/);
 assert.throws(()=>validatePlanarMove({x:"1",y:0}),/válido/);
});

test("map projection uses real metre coordinates and is reversible",()=>{
 const p=actor("A",1,4,{fieldPosition:{x:4,y:2}});
 const placed=pointFromFieldView(p,{x:.6,y:.4});
 assert.ok(Math.abs(placed.x-5)<1e-9&&Math.abs(placed.y-1)<1e-9);
 const projected=pointToFieldView(p,{x:5,y:1});
 assert.ok(Math.abs(projected.x-.6)<1e-9&&Math.abs(projected.y-.4)<1e-9);
 assert.equal(fieldDistance(actor("A",1,0,{fieldPosition:{x:0,y:0}}),
  actor("B",2,1,{fieldPosition:{x:0,y:1}})),1);
 moveFighterOnField(p,{x:.3,y:.4});
 assert.deepEqual(fieldPosition(p),{x:4.3,y:2.4});
 assert.equal(p.positionMeters,4.3);
});

test("standalone drawn movement costs 1 PA and creates a real 2D position",()=>{
 const s=battle(3),ap=remainingAp(s.actors.PLAYER);
 const next=applyCombatCommand(s,"PLAYER",{
  kind:"MOVE",direction:"VECTOR",meters:1,planarMove:{x:0,y:1}
 },dice);
 assert.equal(remainingAp(next.actors.PLAYER),ap-1);
 assert.deepEqual(fieldPosition(next.actors.PLAYER),{x:0,y:1});
 assert.equal(next.actors.PLAYER.positionMeters,0);
 assert.ok(next.log.some(x=>x.kind==="MOVE"&&x.movementDirection==="VECTOR"));
 assert.equal(s.actors.PLAYER.fieldPosition,undefined,"original persisted state stays immutable");
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
  kind:"MOVE",direction:"VECTOR",meters:1,planarMove:{x:0,y:2}},dice),/1 m/);
});

test("move plus attack costs exactly 2 AP, moves first, then checks reach",()=>{
 const s=battle(1.7),ap=remainingAp(s.actors.PLAYER);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike(),dice),/fuera del alcance/);
 const next=applyCombatCommand(s,"PLAYER",strike({planarMove:{x:.5,y:0}}),dice);
 assert.equal(remainingAp(next.actors.PLAYER),ap-2);
 assert.equal(next.actors.PLAYER.spentTicks,
   turnTicks(s.actors.PLAYER)+turnTicks(s.actors.PLAYER,"PIERCE"),
   "movement uses neutral ticks, attack uses the equipped weapon speed factor");
 assert.equal(fieldPosition(next.actors.PLAYER).x,.5);
 assert.equal(next.pending?.by,"PLAYER");
 assert.deepEqual(next.pending?.planarMove,{x:.5,y:0});
 assert.equal(next.log.filter(x=>x.kind==="POSITION").length,1);
 assert.equal(next.log.filter(x=>x.kind==="ATTACK").length,1);
});

test("invalid combined movement or insufficient AP never spends or moves",()=>{
 const s=battle(1.7);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",
  strike({planarMove:{x:2,y:0}}),dice),/1 m/);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(s.actors.PLAYER.positionMeters,0);
 const tired=battle(1.7);
 tired.actors.PLAYER.spentAp=8+tired.actors.PLAYER.constitution;
 assert.equal(remainingAp(tired.actors.PLAYER),1);
 assert.throws(()=>applyCombatCommand(tired,"PLAYER",
  strike({planarMove:{x:.5,y:0}}),dice),/2 PA/);
 assert.equal(tired.actors.PLAYER.positionMeters,0);
});

test("moving plus reaction costs 2 AP, preserves the pending defense contest",()=>{
 const s=battle(1.2);
 const launched=applyCombatCommand(s,"PLAYER",strike(),dice);
 const before=remainingAp(launched.actors.NPC);
 const outcome=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"BLOCK",planarMove:{x:0,y:.5},weaponSlot:"MAIN_HAND"
 },dice);
 assert.equal(remainingAp(outcome.actors.NPC),before-2);
 const stepEvent=outcome.log.find(x=>x.kind==="POSITION"&&x.by==="NPC");
 assert.ok(stepEvent);
 assert.deepEqual(stepEvent.fieldPosition,{x:1.2,y:.5},
  "the voluntary 1/2m reaction step occurs before attack resolution");
 assert.ok(fieldPosition(outcome.actors.NPC).x>=1.2,
  "the defender may also suffer a separate post-hit knockback");
 assert.equal(outcome.pending,null);
 assert.ok(outcome.log.some(x=>x.kind==="POSITION"&&x.by==="NPC"));
 assert.throws(()=>applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"NONE",planarMove:{x:0,y:1}
 },dice),/reacción sin PA/);
});

test("horizontal and vertical construction coordinates are independent in skill route",()=>{
 const engine=src("lib/combat/turn-engine.ts");
 assert.match(engine,/constructionFieldPoint/);
 assert.match(engine,/constructionHeightMeters/);
 assert.match(engine,/pointFromFieldView/);
 assert.match(engine,/heightMeters:aim\.constructionHeightMeters/);
 assert.match(engine,/fuera del alcance en el plano horizontal/);
});

test("UI renders two equally sized canvases and wires commands and height",()=>{
 const ui=src("app/combat/[id]/CombatEncounter.tsx");
 const top=src("app/combat/[id]/CombatTopDownPlane.tsx");
 const vertical=src("app/combat/[id]/CombatVerticalActionPlane.tsx");
 assert.match(ui,/grid-cols-2.*aria-label="Dos planos del combate"/s);
 assert.match(ui,/Plano horizontal · terreno/);
 assert.match(ui,/Plano vertical · altura/);
 assert.match(ui,/CombatTopDownPlane/);
 assert.match(ui,/CombatVerticalActionPlane/);
 assert.match(ui,/planarMove:preparedMovement/);
 assert.match(ui,/constructionFieldPoint:construction\?constructionFieldPoint/);
 assert.match(top,/aspect-square w-full/);
 assert.match(top,/Object\.entries\(state\.actors\)/);
 assert.match(vertical,/aspect-square w-full/);
 assert.match(vertical,/onAngle/);
 assert.match(vertical,/onHeight/);
});

test("one-on-one engine is not represented as completed multi-enemy support",()=>{
 const engine=src("lib/combat/turn-engine.ts");
 assert.match(engine,/export type Side = "PLAYER" \| "NPC"/);
 const top=src("app/combat/[id]/CombatTopDownPlane.tsx");
 assert.match(top,/markers\.map/);
});
