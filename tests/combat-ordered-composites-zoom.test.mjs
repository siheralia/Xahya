import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 battleFieldViewport,fieldPosition,fieldToViewport,viewportToField,previewViewportMove,
} from "../lib/combat/field-plane.ts";
import {newCombatState,applyCombatCommand,remainingAp,turnTicks} from "../lib/combat/turn-engine.ts";

const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const rolls={hit:.01,critical:.99,defense:.99};
const weapon={name:"Arma",attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1.5,
 maximumRangeMeters:1.5};
const actor=(name,id,position,extra={})=>({
 characterId:id,name,hp:300,maxHp:300,agility:90,speedValue:id===1?110:90,
 strength:30,constitution:20,precision:90,dodge:10,
 physicalAttack:30,physicalDefense:12,magicAttack:30,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:position,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,
 spentTicks:0,spentAp:0,equippedWeapon:weapon,...extra
});
const fight=(d=1.4)=>newCombatState(actor("Jugador",1,0),actor("Rival",2,d));
const strike=more=>({
 kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}],...more
});

test("dynamic viewport expands for distant fighters and enlarges a close 0.5m gesture",()=>{
 const me=actor("Yo",1,0),close=actor("Rival",2,1);
 const far=actor("Rival",2,8);
 const nearView=battleFieldViewport(me,close);
 const farView=battleFieldViewport(me,far);
 assert.equal(nearView.spanMeters,3);
 assert.equal(farView.spanMeters,10);
 assert.ok(nearView.spanMeters<farView.spanMeters);
 const anchor=fieldToViewport(nearView,fieldPosition(me));
 const target=fieldToViewport(nearView,{x:.5,y:0});
 const draw=previewViewportMove(nearView,me,target);
 assert.equal(draw.x,.5);assert.equal(draw.y,0);
 assert.ok((target.x-anchor.x)*100>15,"half metre is legible at near zoom");
 assert.ok(Math.abs(viewportToField(nearView,target).x-.5)<1e-9);
 assert.deepEqual(previewViewportMove(nearView,me,fieldToViewport(nearView,{x:5,y:0})),{x:1,y:0});
 const zoomed=battleFieldViewport(me,close,.5);
 assert.ok(zoomed.spanMeters<nearView.spanMeters);
 assert.ok(zoomed.center.x<nearView.center.x,"manual zoom focuses on the user");
});

test("move then attack moves before range check, consumes 2 PA once",()=>{
 const state=fight(1.8);
 const before=remainingAp(state.actors.PLAYER);
 const launched=applyCombatCommand(state,"PLAYER",strike({
  planarMove:{x:.5,y:0},movementOrder:"BEFORE"
 }),rolls);
 assert.equal(remainingAp(launched.actors.PLAYER),before-2);
 assert.equal(fieldPosition(launched.actors.PLAYER).x,.5);
 assert.equal(launched.pending.movementOrder,"BEFORE");
 const resolved=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"ENDURE"},rolls);
 assert.equal(resolved.pending,null);
 assert.equal(fieldPosition(resolved.actors.PLAYER).x,.5);
 assert.equal(resolved.log.filter(e=>e.kind==="POSITION"&&e.by==="PLAYER").length,1);
 assert.equal(state.actors.PLAYER.positionMeters,0);
});

test("attack then move keeps original range until defense resolves",()=>{
 const state=fight(1.4);
 const before=remainingAp(state.actors.PLAYER);
 const launched=applyCombatCommand(state,"PLAYER",strike({
  planarMove:{x:-.5,y:.1},movementOrder:"AFTER"
 }),rolls);
 assert.equal(remainingAp(launched.actors.PLAYER),before-2);
 assert.equal(fieldPosition(launched.actors.PLAYER).x,0,"no teleport before a defense");
 assert.equal(launched.log.filter(e=>e.kind==="POSITION").length,0);
 assert.equal(launched.pending.movementOrder,"AFTER");
 const resolved=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"ENDURE"},rolls);
 assert.equal(resolved.pending,null);
 assert.equal(fieldPosition(resolved.actors.PLAYER).x,-.5);
 assert.equal(fieldPosition(resolved.actors.PLAYER).y,.1);
 assert.equal(remainingAp(resolved.actors.PLAYER),before-2,"do not charge the step again");
 assert.equal(resolved.log.filter(e=>e.kind==="POSITION"&&e.by==="PLAYER").length,1);
 const kinds=resolved.log.map(e=>e.kind);
 assert.ok(kinds.indexOf("RESOLVE")<kinds.indexOf("POSITION"),"attack resolves first");
});

test("attack then move cannot borrow the subsequent step to reach a distant target",()=>{
 const s=fight(1.8);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  planarMove:{x:.8,y:0},movementOrder:"AFTER"
 }),rolls),/fuera del alcance/);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(fieldPosition(s.actors.PLAYER).x,0);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  movementOrder:"AFTER"
 }),rolls),/Elige un desplazamiento/);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  planarMove:{x:.5,y:0},movementOrder:"SOMETHING_ELSE"
 }),rolls),/orden del movimiento/);
});

test("when too far for both attack orders, one paid MOVE remains legal",()=>{
 const s=fight(5.7);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  planarMove:{x:1,y:0},movementOrder:"BEFORE"
 }),rolls),/fuera del alcance/);
 const moved=applyCombatCommand(s,"PLAYER",{
  kind:"MOVE",meters:1,direction:"VECTOR",planarMove:{x:1,y:0}
 },rolls);
 assert.equal(fieldPosition(moved.actors.PLAYER).x,1);
 assert.equal(remainingAp(moved.actors.PLAYER),remainingAp(s.actors.PLAYER)-1);
});

test("basic magic can move first within 4m, and can cast before moving when already in range",()=>{
 const a=fight(4.6);a.mana={PLAYER:{current:5,max:5},NPC:{current:5,max:5}};
 const before=applyCombatCommand(a,"PLAYER",{
  kind:"ATTACK",usesMagic:true,attackType:"PIERCE",
  areaCenter:{x:.5,y:.5},planarMove:{x:.75,y:0},movementOrder:"BEFORE"
 },rolls);
 assert.equal(before.pending?.usesMagic,true);
 assert.equal(before.mana.PLAYER.current,4);
 assert.equal(remainingAp(before.actors.PLAYER),remainingAp(a.actors.PLAYER)-2);
 assert.equal(fieldPosition(before.actors.PLAYER).x,.75);
 const b=fight(3.6);b.mana={PLAYER:{current:5,max:5},NPC:{current:5,max:5}};
 const after=applyCombatCommand(b,"PLAYER",{
  kind:"ATTACK",usesMagic:true,attackType:"PIERCE",
  areaCenter:{x:.5,y:.5},planarMove:{x:-.4,y:0},movementOrder:"AFTER"
 },rolls);
 assert.equal(after.pending?.usesMagic,true);
 assert.equal(after.actors.PLAYER.positionMeters,0);
 assert.equal(after.mana.PLAYER.current,4);
 const outcome=applyCombatCommand(after,"NPC",{kind:"DEFEND",defense:"ENDURE"},rolls);
 assert.equal(fieldPosition(outcome.actors.PLAYER).x,-.4);
 assert.equal(outcome.mana.PLAYER.current,4);
});

test("20 PA and a full tick budget allow a combined kick using one temporal window",()=>{
 const s=fight(1);
 Object.assign(s.actors.PLAYER,{
  constitution:11,agility:11,speedValue:11,equippedWeapon:undefined
 });
 assert.equal(remainingAp(s.actors.PLAYER),20);
 assert.equal(turnTicks(s.actors.PLAYER),91);
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",attackSource:"KICK",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
  planarMove:{x:.4,y:0},movementOrder:"BEFORE"
 },rolls);
 assert.equal(remainingAp(launched.actors.PLAYER),18);
 assert.equal(launched.actors.PLAYER.spentTicks,91);
 assert.equal(fieldPosition(launched.actors.PLAYER).x,.4);
 assert.ok(launched.pending);
});

test("movement with slow weapon checks actual combined ticks before spending",()=>{
 const s=fight(1.4);
 s.actors.PLAYER.spentTicks=100-Math.max(turnTicks(s.actors.PLAYER),turnTicks(s.actors.PLAYER,"PIERCE"))+1;
 // Keep the opponent's initiative clock aligned so the action reaches the
 // specific composite-tick validation rather than failing canAct() first.
 s.actors.NPC.spentTicks=s.actors.PLAYER.spentTicks;
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  planarMove:{x:0,y:.4},movementOrder:"AFTER"
 }),rolls),/ticks suficientes/);
 assert.equal(s.actors.PLAYER.positionMeters,0);
});

test("UI modes and zoom use icon-only aligned controls, while physical/magic commands send order",()=>{
 const ui=src("app/combat/[id]/CombatEncounter.tsx"),top=src("app/combat/[id]/CombatTopDownPlane.tsx");
 for(const term of ['MOVE_ONLY','MOVE_BEFORE','MOVE_AFTER','aria-label={item.label}','movementOrder']){
  assert.ok(ui.includes(term),term);
 }
 assert.match(ui,/movementOrder,usesMagic:true/);
 assert.match(ui,/planarMove:preparedMovement,movementOrder/);
 assert.match(ui,/canCombineAttack/);
 assert.match(ui,/No alcanzan los ticks/);
 assert.match(ui,/afterMovementDistance/);
 assert.match(ui,/solo mover/i);
 assert.match(top,/battleFieldViewport/);
 assert.match(top,/previewViewportMove/);
 assert.match(top,/aria-label="Acercar plano"/);
 assert.match(top,/aria-label="Ajustar zoom a los dos personajes"/);
 assert.match(top,/size-7/);
});

test("automatic zoom retains construction world coordinates and no database migration",()=>{
 const ui=src("app/combat/[id]/CombatTopDownPlane.tsx");
 assert.match(ui,/pointToFieldView\(actor,world\)/);
 assert.match(ui,/pointFromFieldView\(actor,placement\)/);
 assert.match(ui,/state\.constructions/);
 const engine=src("lib/combat/turn-engine.ts");
 assert.match(engine,/finishCompositeStep\(state,pending.by,pending.planarMove\)/);
 assert.match(engine,/movementOrder:aim\.movementOrder/);
});
