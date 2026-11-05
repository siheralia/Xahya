import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatAttackArea,circularAreaHits,AREA_CANVAS_METERS} from "../lib/combat/skill-area.ts";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {combatClientView,BASIC_MAGIC_AREA_RADIUS} from "../lib/combat/magic-area.ts";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";
import {chooseNpcReaction} from "../lib/combat/npc-policy.ts";

const fighter=(name,id,pos,overrides={})=>({
 characterId:id,name,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:pos,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,
 ...overrides,
});
const initial=()=>{
 const s=newCombatState(fighter("Emisora",101,0),fighter("Objetivo",102,3,{speedValue:75}));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const dice={hit:0.01,critical:0.99,defense:0.99};
const circle=(id,magical=true,area="Área circular de 3 m")=>({
 id,name:"Onda "+id,category:"OFFENSIVE",status:"APPROVED",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:area+" | Alcance máximo: 5 m",mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,target:magical?"MAGIC_ATTACK":"PHYSICAL_ATTACK"}],
});
const cast=(s,row,center={x:0.5,y:0.5},key="circular-cast-00001")=>
 applyResolvedCombatSkill(s,"PLAYER",compileCombatSkill(row),{requestId:key,areaCenter:center},dice);

test("validated radius comes from the approved skill and uses a documented local 10 m plane",()=>{
 assert.equal(AREA_CANVAS_METERS,10);
 assert.deepEqual(compileCombatAttackArea("Área circular de 3 m"),
  {shape:"CIRCLE",radiusMeters:3,radiusNormalized:0.3});
 assert.deepEqual(compileCombatAttackArea("Radio: 2,5 m"),
  {shape:"CIRCLE",radiusMeters:2.5,radiusNormalized:0.25});
 assert.equal(compileCombatAttackArea("Objetivo único"),null);
 assert.equal(compileCombatAttackArea("Contacto"),null);
 assert.equal(compileCombatAttackArea("100m"),null,"legacy descriptions are not invented circles");
 assert.equal(circularAreaHits({x:.2,y:.5},{x:.5,y:.5},compileCombatAttackArea("Radio 3 m")),true);
 assert.equal(circularAreaHits({x:.19,y:.5},{x:.5,y:.5},compileCombatAttackArea("Radio 3 m")),false);
 for(const value of ["Radio 0 m","Radio 11 m","Área circular de tamaño enorme","Cono de 5 m"]) {
  assert.throws(()=>compileCombatAttackArea(value),/radio|Área/);
 }
});

test("compiler exposes area on both magical and physical approved skills, but not unsupported circles",()=>{
 for(const magic of [true,false]){
  const plan=compileCombatSkill(circle(magic?100:101,magic));
  assert.equal(plan.category,"OFFENSE");
  assert.equal(plan.usesMagic,magic);
  assert.equal(plan.attackArea.radiusMeters,3);
  assert.equal(previewSkillExecution(circle(magic?100:101,magic)).attackArea.radiusNormalized,0.3);
 }
 assert.equal(previewSkillExecution(circle(102,true,"Cono de 4 m")).executable,false);
 const direct=compileCombatSkill(circle(103,true,"Objetivo único"));
 assert.equal(direct.attackArea,undefined);
});

test("magical circular attack only hits when the target is inside its configured footprint",()=>{
 let hit=cast(initial(),circle(104,true));
 assert.equal(hit.pending.attackArea.radiusMeters,3);
 assert.equal(hit.pending.attackArea.radiusNormalized,0.3);
 assert.equal(hit.pending.areaHint,"inferior derecha");
 assert.equal(hit.mana.PLAYER.current,48);
 assert.equal(hit.actors.PLAYER.spentAp,1);
 hit=applyCombatCommand(hit,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(hit.actors.NPC.hp<180);
 assert.equal(hit.log.at(-1).attackArea.radiusMeters,3);
 assert.match(hit.log.at(-1).summary,/ataque circular/);
 let miss=cast(initial(),circle(105,true),{x:.05,y:.05},"circular-cast-misses-001");
 miss=applyCombatCommand(miss,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(miss.actors.NPC.hp,180,"outside the circle never damages the fighter");
 assert.equal(miss.mana.PLAYER.current,48,"missed casts still charge declared mana");
 assert.match(miss.log.at(-1).summary,/no alcanzó/);
});

test("physical circular strike uses physical attack, spatial contact, and no phantom hand-stroke",()=>{
 let s=cast(initial(),circle(106,false));
 assert.equal(s.pending.usesMagic,false);
 assert.equal(s.pending.rangedPhysical,false);
 assert.equal(s.pending.attackArea.radiusMeters,3);
 assert.deepEqual(s.physicalPathEnds,{},"an area attack does not set the next weapon stroke origin");
 assert.throws(()=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DEFLECT"},dice),/circulares/);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.actors.NPC.hp<180);
 let miss=cast(initial(),circle(107,false),{x:.05,y:.05},"physical-area-miss-0001");
 miss=applyCombatCommand(miss,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(miss.actors.NPC.hp,180);
});

test("each magical or physical area permits one paid, center-prediction dodge without revealing center",()=>{
 for(const magical of [true,false]){
  const s=cast(initial(),circle(magical?108:109,magical),{x:.52,y:.48},
   "area-defender-dodge-"+magical+"-00001");
  const projected=combatClientView(s);
  assert.equal(projected.pending.targetCenter,undefined);
  assert.equal(projected.pending.attackArea.radiusMeters,3);
  assert.equal(projected.pending.areaHint,"superior derecha");
  assert.ok(!JSON.stringify(projected).includes('"targetCenter"'));
  const reaction={kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.52,y:.48}};
  const before=s.actors.NPC.spentAp;
  const after=applyCombatCommand(s,"NPC",reaction,{...dice,hit:0.99});
  assert.equal(after.actors.NPC.hp,180);
  assert.equal(after.actors.NPC.spentAp,before+1);
  assert.equal(after.log.at(-1).predictionMatched,true);
 }
});

test("a configured circle uses its own radius for incidental mirror reflection or destruction",()=>{
 const mirror={
  id:"npc-mirror-1",owner:"NPC",sourceSkillId:1,material:"MIRROR",form:"MIRROR",
  label:"Espejo rival",center:{x:.72,y:.50},createdRound:1,tangible:true,
  durability:1,mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
 };
 const magicState=initial();magicState.constructions=[structuredClone(mirror)];
 let magic=cast(magicState,circle(110,true),{x:.5,y:.5});
 magic=applyCombatCommand(magic,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(magic.actors.PLAYER.hp<180,"magic area reaching the mirror reflects into attacker");
 assert.ok(magic.log.some(e=>e.kind==="REFLECTION"&&e.constructionId===mirror.id));
 const physicalState=initial();physicalState.constructions=[structuredClone(mirror)];
 let physical=cast(physicalState,circle(111,false),{x:.5,y:.5},"physical-area-mirror-1");
 physical=applyCombatCommand(physical,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(physical.constructions.every(c=>c.id!==mirror.id),"physical area breaks touched fragile mirror");
 assert.ok(physical.log.some(e=>e.kind==="CONSTRUCTION"&&e.constructionId===mirror.id));
 const far=initial();far.constructions=[{...structuredClone(mirror),center:{x:.99,y:.99}}];
 let untouched=cast(far,circle(112,false),{x:.5,y:.5},"physical-area-mirror-2");
 untouched=applyCombatCommand(untouched,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(untouched.constructions.some(c=>c.id===mirror.id));
});

test("range, mana and target selection still validate authoritatively",()=>{
 const plan=compileCombatSkill(circle(113,true));
 assert.throws(()=>applyResolvedCombatSkill(initial(),"PLAYER",plan,
  {requestId:"missing-center-123456"},dice),/Marca el centro/);
 const far=initial();far.actors.NPC.positionMeters=7;
 assert.throws(()=>applyResolvedCombatSkill(far,"PLAYER",plan,
  {requestId:"outside-reach-12345",areaCenter:{x:.5,y:.5}},dice),/alcance/);
 assert.equal(far.mana.PLAYER.current,60);
 const low=initial();low.mana.PLAYER.current=11;
 assert.throws(()=>applyResolvedCombatSkill(low,"PLAYER",plan,
  {requestId:"low-mana-area-12345",areaCenter:{x:.5,y:.5}},dice),/Maná insuficiente/);
});

test("basic magic and historical single-target skills keep their existing contact rules",()=>{
 let magic=applyCombatCommand(initial(),"PLAYER",
  {kind:"ATTACK",attackType:"PIERCE",usesMagic:true,areaCenter:{x:0,y:0}},dice);
 assert.equal(magic.pending.attackArea,undefined);
 assert.equal(BASIC_MAGIC_AREA_RADIUS,.14);
 magic=applyCombatCommand(magic,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(magic.actors.NPC.hp<180,"basic magic remains historically full-area");
 let single=cast(initial(),circle(114,true,"Objetivo único"),{x:0,y:0},"single-target-skill-123");
 assert.equal(single.pending.attackArea,undefined);
 single=applyCombatCommand(single,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(single.actors.NPC.hp<180);
});

test("NPC can predict a physical-area epicenter without reading the hidden server target",()=>{
 const s=cast(initial(),circle(115,false));
 const reaction=chooseNpcReaction(s,()=>0.2);
 assert.equal(reaction.defense,"DODGE");
 assert.ok(reaction.predictedCenter.x>=0&&reaction.predictedCenter.x<=1);
 assert.ok(reaction.predictedCenter.y>=0&&reaction.predictedCenter.y<=1);
});

test("interface prepares, previews, casts and labels actual circles",()=>{
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 const roster=readFileSync(new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");
 assert.match(page,/preparedAreaSkill\.attackArea\.radiusNormalized/);
 assert.match(page,/onPrepareArea=\{prepareAreaSkill\}/);
 assert.match(page,/attackArea\?\.radiusNormalized/);
 assert.match(page,/entry\.attackArea/);
 assert.match(roster,/Preparar área circular/);
 assert.match(roster,/preparedAreaSkillId!==skill\.id/);
});


// Approved skill #38 on encounter #47: a Capoeira kick sweeping around its caster.
const meiaLua={
 id:38,name:"Meia-lua de compasso",status:"APPROVED",category:"OFFENSIVE",
 cost:30,attackType:"BLUNT",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:"Campo alrededor del usuario | Alcance máximo: 2 m",
 mechanics:{family:"CAPOEIRA",parentSkillId:37},
 effect:[{type:"DAMAGE_MULTIPLIER",value:200,target:"PHYSICAL_ATTACK",
   targetKind:"OPPONENT",targetReference:"Cualquiera alrededor "}],
};
const nearbyEncounter=()=>{
 const s=initial();
 s.actors.NPC.positionMeters=1.5;
 return s;
};

test("encounter 47 Meia-lua compasso compiles as a self-centered physical sweep",()=>{
 const plan=compileCombatSkill(meiaLua);
 const preview=previewSkillExecution(meiaLua);
 assert.equal(preview.executable,true);
 assert.equal(preview.needsAim,false);
 assert.equal(preview.disabledReason,null);
 assert.equal(plan.requiredParentSkillId,37);
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.usesMagic,false);
 assert.equal(plan.damageMultiplier,2);
 assert.equal(plan.attackType,"BLUNT");
 assert.equal(plan.rangeMeters,2);
 assert.deepEqual(plan.attackArea,{shape:"SELF_FIELD",radiusMeters:2,radiusNormalized:0.2});
 assert.equal(compileCombatAttackArea("Campo alrededor del usuario",2).shape,"SELF_FIELD");
});

test("Meia-lua spends mana and PA, deals physical damage without selecting an epicenter",()=>{
 const plan=compileCombatSkill(meiaLua);
 let s=applyResolvedCombatSkill(nearbyEncounter(),"PLAYER",plan,
   {requestId:"meia-lua-47-cast-001"},dice);
 assert.equal(s.mana.PLAYER.current,30);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.pending.usesMagic,false);
 assert.equal(s.pending.attackSource,"KICK");
 assert.equal(s.pending.targetCenter,undefined);
 assert.equal(s.pending.areaHint,undefined);
 assert.equal(s.pending.attackArea.shape,"SELF_FIELD");
 assert.deepEqual(s.physicalPathEnds,{},"sweeps do not move the origin of drawn weapon strokes");
 assert.throws(()=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DEFLECT"},dice),/circulares|área/);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.actors.NPC.hp<180);
 assert.match(s.log.at(-1).summary,/barrido/);
 assert.equal(s.log.at(-1).areaCenter,undefined);
});

test("self-centered sweeps cannot hit enemies beyond reach and do not spend mana on failure",()=>{
 const plan=compileCombatSkill(meiaLua);
 const far=initial();
 assert.throws(()=>applyResolvedCombatSkill(far,"PLAYER",plan,
   {requestId:"meia-lua-out-range-01"},dice),/alcance/);
 assert.equal(far.mana.PLAYER.current,60);
 const dry=nearbyEncounter();
 dry.mana.PLAYER.current=29;
 assert.throws(()=>applyResolvedCombatSkill(dry,"PLAYER",plan,
   {requestId:"meia-lua-not-mana-001"},dice),/Maná insuficiente/);
 assert.throws(()=>applyResolvedCombatSkill(nearbyEncounter(),"PLAYER",plan,
   {requestId:"meia-lua-mirror-001",targetConstructionId:"fake"},dice),/no permite elegir/);
});

test("self-centered sweeps allow a normal physical dodge, no prediction puzzle",()=>{
 let s=applyResolvedCombatSkill(nearbyEncounter(),"PLAYER",compileCombatSkill(meiaLua),
   {requestId:"meia-lua-47-dodge-001"},dice);
 const projected=combatClientView(s);
 assert.equal(projected.pending.targetCenter,undefined);
 assert.equal(projected.pending.areaHint,undefined);
 assert.equal(chooseNpcReaction(s,()=>0.1).predictedCenter,undefined);
 assert.equal(chooseNpcReaction(s,()=>0.1).defense,"DODGE");
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"DODGE"},
   {...dice,hit:0.99});
 assert.equal(s.actors.NPC.hp,180);
 assert.equal(s.actors.NPC.spentAp,1);
});

test("combat UI offers a one-tap self-centered sweep, not a circular placement",()=>{
 const roster=readFileSync(new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(roster,/Ejecutar barrido/);
 assert.match(roster,/skill\.attackArea\?\.shape==="SELF_FIELD"/);
 assert.match(page,/skill\.attackArea\?\.shape==="SELF_FIELD"\?undefined/);
 assert.match(page,/pending\.attackArea\?\.shape==="SELF_FIELD"/);
});


test("encounter 55 regression: Meia-lua costs 91 ticks and leaves a paid reaction possible",()=>{
 const state=nearbyEncounter();
 state.actors.PLAYER.speedValue=11;
 const plan=compileCombatSkill(meiaLua);
 let s=applyResolvedCombatSkill(state,"PLAYER",plan,
  {requestId:"meia-lua-speed-55-001"},dice);
 assert.equal(s.actors.PLAYER.spentTicks,91,
  "neutral action: ceil(1000 / 11), no blunt weapon surcharge");
 assert.equal(100-s.actors.PLAYER.spentTicks,9);
 assert.equal(s.actors.PLAYER.spentAp,1);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s=applyCombatCommand(s,"NPC",{
  kind:"ATTACK",attackType:"PIERCE",usesMagic:true,areaCenter:{x:.5,y:.5}
 },dice);
 assert.equal(s.pending.against,"PLAYER");
 s=applyCombatCommand(s,"PLAYER",{
  kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.5,y:.5},
 },{...dice,hit:0.99});
 assert.equal(s.log.at(-1).defense,"DODGE",
  "a slow fighter can spend the last ticks reacting after a kick");
 assert.equal(s.actors.PLAYER.spentTicks,100);
 assert.equal(s.actors.PLAYER.spentAp,2);
});
