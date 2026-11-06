import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 battleFieldViewport,fieldPosition,fieldToViewport,viewportToField,previewViewportMove,
} from "../lib/combat/field-plane.ts";
import {newCombatState,applyCombatCommand,canStartComposite,remainingAp,turnTicks} from "../lib/combat/turn-engine.ts";

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

test("slow blunt weapon still allows an initial 2 PA composite within one capped 100-tick window",()=>{
 const s=fight(1.2);
 Object.assign(s.actors.PLAYER,{constitution:11,agility:11,speedValue:11,
  equippedWeapon:{...weapon,attackType:"BLUNT"}});
 assert.equal(remainingAp(s.actors.PLAYER),20);
 assert.ok(turnTicks(s.actors.PLAYER,"BLUNT")>100);
 const launched=applyCombatCommand(s,"PLAYER",strike({
  attackType:"BLUNT",planarMove:{x:.35,y:0},movementOrder:"BEFORE"
 }),rolls);
 assert.equal(remainingAp(launched.actors.PLAYER),18);
 assert.equal(launched.actors.PLAYER.spentTicks,100);
 assert.equal(fieldPosition(launched.actors.PLAYER).x,.35);
 assert.ok(launched.pending);
});

test("encounter 63: with 81/100 ticks and 2+ PA, move + attack stays available",()=>{
 for(const order of ["BEFORE","AFTER"]){
  const s=fight(1.4);
  Object.assign(s.actors.PLAYER,{
   agility:38,speedValue:38,constitution:1,spentTicks:81,spentAp:3,
   equippedWeapon:{...weapon,attackType:"CUT",effectiveRangeMeters:2.7}
  });
  s.actors.NPC.spentTicks=81;
  s.actors.NPC.speedValue=45;
  const ap=remainingAp(s.actors.PLAYER);
  assert.ok(ap>=2);
  assert.equal(turnTicks(s.actors.PLAYER),27);
  assert.equal(canStartComposite(s.actors.PLAYER),true,
   "a partial tick window is enough to begin a paid composite");
  const launched=applyCombatCommand(s,"PLAYER",strike({
   attackType:"CUT",planarMove:{x:.3,y:0},movementOrder:order
  }),rolls);
  assert.ok(launched.pending,"both attack orders remain legal");
  assert.equal(launched.actors.PLAYER.spentTicks,100,
   "81 + 27 ticks saturate at 100; no second tick window");
  assert.equal(remainingAp(launched.actors.PLAYER),ap-2,
   "movement and attack consume exactly two PA");
  assert.equal(fieldPosition(launched.actors.PLAYER).x,
   order==="BEFORE"?.3:0);
  assert.equal(launched.pending.movementOrder,order);
  if(order==="AFTER"){
   const resolved=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
   assert.equal(fieldPosition(resolved.actors.PLAYER).x,.3);
  }
 }
});

test("a composite also saturates late in the turn with a slow weapon or magic",()=>{
 const slow=fight(1.4);
 Object.assign(slow.actors.PLAYER,{
  speedValue:38,agility:38,spentTicks:81,spentAp:3,constitution:1,
  equippedWeapon:{...weapon,attackType:"BLUNT",effectiveRangeMeters:2.7}
 });
 slow.actors.NPC.spentTicks=81;
 const launched=applyCombatCommand(slow,"PLAYER",strike({
  attackType:"BLUNT",planarMove:{x:.3,y:0},movementOrder:"BEFORE"
 }),rolls);
 assert.equal(launched.actors.PLAYER.spentTicks,100);
 assert.equal(launched.actors.PLAYER.spentAp,5);
 const magical=fight(1.4);
 Object.assign(magical.actors.PLAYER,{
  speedValue:38,agility:38,spentTicks:81,spentAp:3,constitution:1
 });
 magical.actors.NPC.spentTicks=81;
 magical.mana={PLAYER:{current:5,max:5},NPC:{current:5,max:5}};
 const cast=applyCombatCommand(magical,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",usesMagic:true,
  areaCenter:{x:.5,y:.5},planarMove:{x:.3,y:0},movementOrder:"BEFORE"
 },rolls);
 assert.equal(cast.actors.PLAYER.spentTicks,100);
 assert.equal(cast.actors.PLAYER.spentAp,5);
 assert.equal(cast.mana.PLAYER.current,4);
});

test("a composite is prohibited only after 100 ticks or with less than 2 PA",()=>{
 const s=fight(1.4);
 s.actors.PLAYER.spentTicks=100;
 assert.equal(canStartComposite(s.actors.PLAYER),false);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",strike({
  planarMove:{x:.4,y:0},movementOrder:"AFTER"
 }),rolls),/Espera/);
 const ap=fight(1.4);
 ap.actors.PLAYER.spentAp=ap.actors.PLAYER.constitution+8;
 assert.equal(remainingAp(ap.actors.PLAYER),1);
 assert.equal(canStartComposite(ap.actors.PLAYER),false);
 assert.throws(()=>applyCombatCommand(ap,"PLAYER",strike({
  planarMove:{x:.4,y:0},movementOrder:"AFTER"
 }),rolls),/2 PA/);
});

test("UI modes and zoom use icon-only aligned controls, while physical/magic commands send order",()=>{
 const ui=src("app/combat/[id]/CombatEncounter.tsx"),top=src("app/combat/[id]/CombatTopDownPlane.tsx");
 for(const term of ['MOVE_ONLY','MOVE_BEFORE','MOVE_AFTER','aria-label={item.label}','movementOrder']){
  assert.ok(ui.includes(term),term);
 }
 assert.match(ui,/movementOrder:order,usesMagic:true|movementOrder:order,usesMagic:true/s);
 assert.match(ui,/planarMove:move,movementOrder:order/);
 assert.match(ui,/function launchAttack\(order/);
 assert.match(ui,/canCombineAttack/);
 assert.match(ui,/canStartComposite\(actor\)/);
 assert.match(ui,/Has agotado los 100 ticks de este turno/);
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
