import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseSkillArea,formatSkillArea,validateStripDimensions,normalizeSkillArea}
 from "../lib/skills/area-of-effect.ts";
import {compileCombatAttackArea,attackAreaHits,rectangularAreaHits,validateStripAngle}
 from "../lib/combat/skill-area.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {chooseNpcReaction} from "../lib/combat/npc-policy.ts";

const fighter=(name,id,position,patch={})=>({
 characterId:id,name,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:position,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,...patch,
});
const initial=()=>{
 const s=newCombatState(fighter("Emisora",101,0),fighter("Objetivo",102,3,{speedValue:75}));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const dice={hit:0.01,critical:0.99,defense:0.99};
const row=(id,magical=true)=>({
 id,name:"Franja "+id,status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:"Franja de 4 m de largo y 1 m de ancho | Alcance máximo: 5 m",
 mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,
  target:magical?"MAGIC_ATTACK":"PHYSICAL_ATTACK"}],
});
const cast=(s,id,magic,center,angle,key)=>applyResolvedCombatSkill(
 s,"PLAYER",compileCombatSkill(row(id,magic)),
 {requestId:key,areaCenter:center,areaAngleDegrees:angle},dice
);

test("strip dimensions are typed, normalized, independent of reach and legacy safe",()=>{
 const label=formatSkillArea("STRIP",{lengthMeters:4,widthMeters:1});
 assert.equal(label,"Franja de 4 m de largo y 1 m de ancho");
 assert.deepEqual(parseSkillArea(label),{kind:"STRIP",label,radiusMeters:null,
  lengthMeters:4,widthMeters:1});
 assert.equal(normalizeSkillArea("Franja de 4,0 m de largo y 1,0 m de ancho"),label);
 assert.deepEqual(compileCombatAttackArea(label),{shape:"STRIP",
  lengthMeters:4,widthMeters:1,lengthNormalized:0.4,widthNormalized:0.1});
 assert.throws(()=>validateStripDimensions({lengthMeters:2,widthMeters:3}),/ancho/);
 assert.throws(()=>formatSkillArea("STRIP",{lengthMeters:12,widthMeters:1}),/radio/);
 assert.equal(parseSkillArea("Franja de 2 m de largo y 3 m de ancho").kind,"LEGACY");
 assert.throws(()=>compileCombatAttackArea("Franja de 2 m de largo y 3 m de ancho"),/Área/);
 assert.throws(()=>compileCombatAttackArea("Cono de 4 m"),/Área/);
 assert.equal(compileCombatAttackArea("Objetivo único"),null);
});

test("rotated footprint hits only inside the full length/width rectangle",()=>{
 const area=compileCombatAttackArea("Franja de 4 m de largo y 1 m de ancho");
 const center={x:0.5,y:0.5};
 assert.equal(attackAreaHits(center,{x:.69,y:.5},area,0),true);
 assert.equal(attackAreaHits(center,{x:.71,y:.5},area,0),false);
 assert.equal(attackAreaHits(center,{x:.5,y:.56},area,0),false);
 assert.equal(attackAreaHits(center,{x:.5,y:.69},area,90),true);
 assert.equal(attackAreaHits(center,{x:.69,y:.5},area,90),false);
 assert.equal(rectangularAreaHits(center,{x:.60,y:.60},area,45),true);
 assert.equal(rectangularAreaHits(center,{x:.60,y:.5},area,45),false);
 for(const angle of [-1,360,0.5,NaN,Infinity,"90",undefined])
  assert.throws(()=>validateStripAngle(angle),/ángulo/);
});

test("approved magical or physical strips pay real resources and respect orientation",()=>{
 for(const magic of [true,false]){
  const id=magic?501:502;
  const plan=compileCombatSkill(row(id,magic));
  assert.equal(plan.attackArea.shape,"STRIP");
  let hit=cast(initial(),id,magic,{x:.33,y:.5},0,"strip-hit-"+id+"-12345");
  assert.equal(hit.pending.attackArea.widthMeters,1);
  assert.equal(hit.pending.areaAngleDegrees,0);
  assert.equal(hit.pending.usesMagic,magic);
  assert.equal(hit.mana.PLAYER.current,48);
  assert.equal(hit.actors.PLAYER.spentAp,1);
  assert.equal(hit.pending.areaHint,"inferior izquierda");
  assert.deepEqual(hit.physicalPathEnds,{},"a projected strip is not a physical hand stroke");
  hit=applyCombatCommand(hit,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
  assert.ok(hit.actors.NPC.hp<180,"horizontal strip crosses the center");
  assert.equal(hit.log.at(-1).areaAngleDegrees,0);
  assert.match(hit.log.at(-1).summary,/franja/);
  let miss=cast(initial(),id,magic,{x:.33,y:.5},90,"strip-miss-"+id+"-1234");
  miss=applyCombatCommand(miss,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
  assert.equal(miss.actors.NPC.hp,180,"vertical strip misses the defender at x=0.5");
  assert.equal(miss.mana.PLAYER.current,48,"a miss still costs mana");
 }
});

test("orientation and center are private until defense, with a paid prediction reaction",()=>{
 const s=cast(initial(),503,true,{x:.49,y:.49},37,"strip-privacy-503-0001");
 const publicState=combatClientView(s);
 assert.equal(publicState.pending.targetCenter,undefined);
 assert.equal(publicState.pending.areaAngleDegrees,undefined);
 assert.equal(publicState.pending.attackArea.shape,"STRIP");
 assert.equal(publicState.pending.areaHint,"superior izquierda");
 assert.ok(!JSON.stringify(publicState).includes('"areaAngleDegrees"'),
  "neither pending nor launch log leaks its direction");
 const reaction=chooseNpcReaction(s,()=>0.2);
 assert.equal(reaction.defense,"DODGE");
 assert.ok(reaction.predictedCenter);
 assert.throws(()=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DEFLECT"},dice),/franjas/);
 const before=s.actors.NPC.spentAp;
 const after=applyCombatCommand(s,"NPC",
  {kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.49,y:.49}},
  {...dice,hit:0.99});
 assert.equal(after.actors.NPC.hp,180);
 assert.equal(after.actors.NPC.spentAp,before+1);
 assert.equal(after.log.at(-1).areaAngleDegrees,37);
 assert.equal(after.log.at(-1).predictionMatched,true);
});

test("server rejects missing/fractional orientation before spending anything",()=>{
 const plan=compileCombatSkill(row(504));
 const state=initial();
 for(const angle of [undefined,-1,360,17.5,"45"]){
  assert.throws(()=>applyResolvedCombatSkill(state,"PLAYER",plan,
   {requestId:"strip-invalid-"+String(angle)+"-0001",areaCenter:{x:.5,y:.5},
    areaAngleDegrees:angle},dice),/ángulo/);
  assert.equal(state.mana.PLAYER.current,60);
  assert.equal(state.actors.PLAYER.spentAp,0);
 }
 const s=applyResolvedCombatSkill(state,"PLAYER",plan,
  {requestId:"strip-idempotent-504-001",areaCenter:{x:.5,y:.5},areaAngleDegrees:0},dice);
 const again=applyResolvedCombatSkill(s,"PLAYER",plan,
  {requestId:"strip-idempotent-504-001",areaCenter:{x:.1,y:.1},areaAngleDegrees:180},dice);
 assert.equal(again.mana.PLAYER.current,48,"one request never doubles mana");
 assert.equal(again.actors.PLAYER.spentAp,1);
});

test("strips touch only the mirrors within their actual rectangular footprint",()=>{
 const mirror={
  id:"npc-strip-mirror",owner:"NPC",sourceSkillId:11,material:"MIRROR",form:"MIRROR",
  label:"Espejo de prueba",center:{x:.67,y:.5},createdRound:1,tangible:true,
  durability:1,mirror:{rayMultiplier:1,reflectionMultiplier:.5,rangeMeters:10,attackType:"PIERCE"},
 };
 const horizontal=initial();horizontal.constructions=[structuredClone(mirror)];
 let hit=cast(horizontal,505,false,{x:.5,y:.5},0,"strip-mirror-hit-505-01");
 hit=applyCombatCommand(hit,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(hit.constructions.every(c=>c.id!==mirror.id),
  "horizontal strip intersects and destroys the physical mirror");
 const vertical=initial();vertical.constructions=[structuredClone(mirror)];
 let miss=cast(vertical,506,false,{x:.5,y:.5},90,"strip-mirror-miss-506-1");
 miss=applyCombatCommand(miss,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(miss.constructions.some(c=>c.id===mirror.id),"vertical strip misses the mirror");
});

test("Spanish skill editor, roster and combat canvas expose strip dimensions and angle",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const form=read("components/skills/SkillCoreFields.tsx");
 const page=read("app/combat/[id]/CombatEncounter.tsx");
 const roster=read("app/combat/[id]/CombatSkillLoadout.tsx");
 assert.match(form,/Largo de la franja/);
 assert.match(form,/Ancho de la franja/);
 assert.match(roster,/Preparar franja/);
 assert.match(page,/Dirección de la franja en grados/);
 assert.match(page,/areaAngleDegrees:skill.attackArea/);
 assert.match(page,/rotate\(/);
 assert.match(page,/Franja revelada/);
});
