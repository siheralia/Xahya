import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatSkillArea,parseSkillArea,normalizeSkillArea,validateAngularOpening,
 validateConeDimensions,validateSweepDimensions} from "../lib/skills/area-of-effect.ts";
import {compileCombatAttackArea,attackAreaHits,angularAreaHits,angularAreaSvgPath,
 validateAreaDirection} from "../lib/combat/skill-area.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand} from "../lib/combat/turn-engine.ts";
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
const row=(id,area,magic=true)=>({
 id,name:"Área angular "+id,status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:area+" | Alcance máximo: 5 m",mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,
  target:magic?"MAGIC_ATTACK":"PHYSICAL_ATTACK"}],
});
const cone="Cono de 3 m y apertura de 90°";
const sweep="Barrido en arco de 1 a 3 m y apertura de 90°";
const cast=(s,id,area,magic,center,angle,key)=>applyResolvedCombatSkill(
 s,"PLAYER",compileCombatSkill(row(id,area,magic)),
 {requestId:key,areaCenter:center,areaAngleDegrees:angle},dice
);
const resolve=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);

test("cone and annular sweep labels normalize without upgrading narrative legacy",()=>{
 assert.equal(formatSkillArea("CONE",{radiusMeters:3,openingDegrees:90}),cone);
 assert.equal(formatSkillArea("SWEEP",{innerRadiusMeters:1,outerRadiusMeters:3,openingDegrees:90}),sweep);
 assert.equal(normalizeSkillArea("Cono de 3,0 m y apertura de 90°"),cone);
 assert.equal(normalizeSkillArea("Barrido en arco de 1,0 a 3,0 m y apertura de 90°"),sweep);
 assert.deepEqual(parseSkillArea(cone),{kind:"CONE",label:cone,radiusMeters:3,openingDegrees:90});
 assert.deepEqual(parseSkillArea(sweep),{kind:"SWEEP",label:sweep,radiusMeters:null,
  innerRadiusMeters:1,outerRadiusMeters:3,openingDegrees:90});
 assert.deepEqual(compileCombatAttackArea(cone),{shape:"CONE",radiusMeters:3,radiusNormalized:0.3,openingDegrees:90});
 assert.deepEqual(compileCombatAttackArea(sweep),{shape:"SWEEP",innerRadiusMeters:1,outerRadiusMeters:3,
  innerRadiusNormalized:0.1,outerRadiusNormalized:0.3,openingDegrees:90});
 assert.equal(parseSkillArea("Un cono de viento eterno").kind,"LEGACY");
 assert.throws(()=>compileCombatAttackArea("Un cono de viento eterno"),/Área/);
 assert.equal(parseSkillArea("Cono de 4 m y apertura de 0°").kind,"LEGACY");
 assert.equal(parseSkillArea("Barrido en arco de 4 a 1 m y apertura de 90°").kind,"LEGACY");
 assert.throws(()=>validateConeDimensions({radiusMeters:11,openingDegrees:90}),/radio/);
 assert.throws(()=>validateSweepDimensions({innerRadiusMeters:3,outerRadiusMeters:2,openingDegrees:45}),/interior/);
 for(const angle of [0,360,-1,5.5,NaN,Infinity,"90",undefined])
  assert.throws(()=>validateAngularOpening(angle),/apertura/);
 for(const angle of [-1,360,5.5,NaN,Infinity,"90",undefined])
  assert.throws(()=>validateAreaDirection(angle),/ángulo/);
});

test("cone hits only its exact radius and angular sector, including wrap-around",()=>{
 const area=compileCombatAttackArea(cone),center={x:.5,y:.5};
 assert.equal(attackAreaHits(center,{x:.7,y:.5},area,0),true);
 assert.equal(attackAreaHits(center,{x:.5,y:.7},area,0),false);
 assert.equal(attackAreaHits(center,{x:.81,y:.5},area,0),false);
 assert.equal(attackAreaHits(center,center,area,0),true,"cone apex belongs to footprint");
 assert.equal(attackAreaHits(center,{x:.5,y:.3},area,270),true);
 assert.equal(attackAreaHits(center,{x:.7,y:.5},area,359),true,"direction 359 wraps to 0");
 assert.equal(attackAreaHits(center,{x:.7,y:.5},area,180),false);
 const wide=compileCombatAttackArea("Cono de 3 m y apertura de 270°");
 assert.equal(angularAreaHits(center,{x:.5,y:.7},wide,0),true);
 assert.equal(angularAreaHits(center,{x:.3,y:.5},wide,0),false);
 const path=angularAreaSvgPath(center,area,0);
 assert.match(path,/^M 50 50 L /);
 assert.match(path,/ A 30 30 0 0 1 /);
 assert.match(angularAreaSvgPath(center,wide,0),/ A 30 30 0 1 1 /);
});

test("sweep is a real annular sector and never fills its hollow center",()=>{
 const area=compileCombatAttackArea(sweep),center={x:.5,y:.5};
 assert.equal(attackAreaHits(center,{x:.65,y:.5},area,0),true);
 assert.equal(attackAreaHits(center,{x:.55,y:.5},area,0),false,"inner hole");
 assert.equal(attackAreaHits(center,{x:.81,y:.5},area,0),false,"beyond outer edge");
 assert.equal(attackAreaHits(center,{x:.5,y:.65},area,0),false,"outside aperture");
 assert.equal(attackAreaHits(center,{x:.5,y:.65},area,90),true);
 assert.equal(attackAreaHits(center,center,area,0),false,"sweep does not hit center");
 assert.match(angularAreaSvgPath(center,area,0),/ A 30 30 0 0 1 /);
 assert.match(angularAreaSvgPath(center,area,0),/ A 10 10 0 0 0 /);
});

test("magical and physical angular attacks use real footprint and costs",()=>{
 for(const area of [cone,sweep])for(const magic of [true,false]){
  const id=magic?701:702,shape=area===cone?"CONE":"SWEEP",label=shape+"-"+(magic?"magic":"physical");
  const hit=cast(initial(),id,area,magic,{x:.33,y:.5},0,"angular-hit-"+label+"-0001");
  assert.equal(hit.pending.attackArea.shape,shape);
  assert.equal(hit.pending.areaAngleDegrees,0);
  assert.equal(hit.pending.usesMagic,magic);
  assert.equal(hit.mana.PLAYER.current,48);
  assert.equal(hit.actors.PLAYER.spentAp,1);
  assert.equal(hit.actors.PLAYER.spentTicks>0,true);
  assert.equal(hit.pending.areaHint,"inferior izquierda");
  const settled=resolve(hit);
  assert.ok(settled.actors.NPC.hp<180,label+" should hit the rival");
  assert.equal(settled.log.at(-1).areaAngleDegrees,0);
  let wrong=cast(initial(),id,area,magic,{x:.33,y:.5},90,"angular-miss-"+label+"-0001");
  wrong=resolve(wrong);
  assert.equal(wrong.actors.NPC.hp,180,label+" should miss when facing away");
  assert.equal(wrong.mana.PLAYER.current,48);
 }
});

test("cone and sweep have distinct off-center exclusion and real reach",()=>{
 const inHole=resolve(cast(initial(),710,sweep,true,{x:.47,y:.5},0,"angular-hole-sweep-710"));
 assert.equal(inHole.actors.NPC.hp,180);
 const atApex=resolve(cast(initial(),711,cone,true,{x:.5,y:.5},0,"angular-apex-cone-711"));
 assert.ok(atApex.actors.NPC.hp<180);
 const far=initial();far.actors.NPC.positionMeters=6;
 assert.throws(()=>cast(far,712,cone,true,{x:.5,y:.5},0,"angular-far-cone-712"),/fuera del alcance/);
 assert.equal(far.mana.PLAYER.current,60);
});

test("direction is private until reaction; invalid requests cannot debit mana or PA",()=>{
 for(const area of [cone,sweep]){
  const id=area===cone?720:721;
  const plan=compileCombatSkill(row(id,area));
  const before=initial();
  for(const [n,angle] of [undefined,-1,360,12.5,"45"].entries()){
   assert.throws(()=>applyResolvedCombatSkill(before,"PLAYER",plan,{
    requestId:"angular-invalid-"+id+"-"+n+"-001",areaCenter:{x:.5,y:.5},
    areaAngleDegrees:angle},dice),/ángulo/);
   assert.equal(before.mana.PLAYER.current,60);
   assert.equal(before.actors.PLAYER.spentAp,0);
  }
  const pending=applyResolvedCombatSkill(before,"PLAYER",plan,
   {requestId:"angular-private-"+id+"-0001",areaCenter:{x:.49,y:.49},areaAngleDegrees:37},dice);
  const publicState=combatClientView(pending);
  assert.equal(publicState.pending.areaAngleDegrees,undefined);
  assert.equal(publicState.pending.targetCenter,undefined);
  assert.ok(!JSON.stringify(publicState).includes('"areaAngleDegrees"'));
  assert.equal(publicState.pending.areaHint,"superior izquierda");
  assert.equal(chooseNpcReaction(pending,()=>0.2).defense,"DODGE");
  assert.throws(()=>applyCombatCommand(pending,"NPC",{kind:"DEFEND",defense:"DEFLECT"},dice),/área/);
  const defended=applyCombatCommand(pending,"NPC",
   {kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.49,y:.49}},{...dice,hit:0.99});
  assert.equal(defended.actors.NPC.spentAp,pending.actors.NPC.spentAp+1);
  assert.equal(defended.log.at(-1).areaAngleDegrees,37);
  const duplicate=applyResolvedCombatSkill(pending,"PLAYER",plan,{
   requestId:"angular-private-"+id+"-0001",areaCenter:{x:0,y:0},areaAngleDegrees:180},dice);
  assert.equal(duplicate.mana.PLAYER.current,48,"one request never double-charges");
 }
});

test("mirrors interact only with real angular footprints",()=>{
 const mirror={id:"npc-angular-mirror",owner:"NPC",sourceSkillId:11,material:"MIRROR",form:"MIRROR",
  label:"Espejo de prueba",center:{x:.67,y:.5},createdRound:1,tangible:true,
  durability:1,mirror:{rayMultiplier:1,reflectionMultiplier:.5,rangeMeters:10,attackType:"PIERCE"}};
 for(const area of [cone,sweep]){
  const first=initial();first.constructions=[structuredClone(mirror)];
  let hit=cast(first,730,area,false,{x:.5,y:.5},0,"angular-mirror-hit-"+(area===cone?"cone":"sweep"));
  hit=resolve(hit);
  assert.equal(hit.constructions.some(c=>c.id===mirror.id),false);
  const second=initial();second.constructions=[structuredClone(mirror)];
  let miss=cast(second,731,area,false,{x:.5,y:.5},90,"angular-mirror-miss-"+(area===cone?"cone":"sweep"));
  miss=resolve(miss);
  assert.equal(miss.constructions.some(c=>c.id===mirror.id),true);
 }
});

test("Spanish editor, roster, aim control, replay and NPC support angular shapes",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const form=read("components/skills/SkillCoreFields.tsx");
 const roster=read("app/combat/[id]/CombatSkillLoadout.tsx");
 const combat=read("app/combat/[id]/CombatEncounter.tsx");
 const npc=read("lib/combat/npc-policy.ts");
 assert.match(form,/Radio del cono/);
 assert.match(form,/Apertura del cono/);
 assert.match(form,/Radio interior del barrido/);
 assert.match(form,/Apertura del barrido/);
 assert.match(roster,/Preparar cono/);
 assert.match(roster,/Preparar barrido en arco/);
 assert.match(combat,/Dirección del cono en grados/);
 assert.match(combat,/Dirección del barrido en grados/);
 assert.match(combat,/angularAreaSvgPath/);
 assert.match(combat,/Cono revelado/);
 assert.match(combat,/Barrido en arco revelado/);
 assert.match(npc,/\["STRIP","CONE","SWEEP"\]/);
});
