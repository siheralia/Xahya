import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {firstMirrorAlongMagicRay,MIRROR_RAY_INTERCEPT_RADIUS_METERS} from "../lib/combat/constructs.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";

const fighter=(name,characterId,positionMeters,patch={})=>({
 name,characterId,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:7,
 critical:0,luck:15,race:20,massKg:70,positionMeters,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch
});
const state=()=>{
 const s=newCombatState(fighter("Lanzadora",101,0),fighter("Defensora",102,4));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const mirror=(id,position,patch={})=>({
 id,owner:"NPC",sourceSkillId:800,material:"MIRROR",form:"MIRROR",
 label:id,center:{x:.98,y:.95},fieldPosition:position,createdRound:1,
 tangible:true,durability:5,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
 ...patch
});
const dice={hit:.01,critical:.99,defense:.99};
const skill=(id,area="Objetivo único | Alcance máximo: 5 m")=>({
 id,name:"Rayo dirigido "+id,status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:area,mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,target:"MAGIC_ATTACK"}]
});
const cast=(s,id=811,aim={})=>applyResolvedCombatSkill(
 s,"PLAYER",compileCombatSkill(skill(id)),{
  requestId:"mirror-interception-"+id+"-request",
  areaCenter:{x:.5,y:.5},...aim
 },dice);
const none=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const events=(s,kind)=>s.log.filter(e=>e.kind===kind);
const reflections=s=>events(s,"REFLECTION");
const result=s=>events(s,"RESOLVE").filter(e=>e.by==="PLAYER").at(-1);

test("a direct single-target spell is reflected by an enemy mirror BETWEEN caster and fighter",()=>{
 const s=state();
 s.constructions=[mirror("middle",{x:2,y:0})];
 const launched=cast(s);
 assert.equal(launched.pending.attackArea,undefined);
 assert.deepEqual(launched.pending.directedMagicRay,{
  from:{x:0,y:0},to:{x:4,y:0}
 });
 const publicView=combatClientView(launched);
 assert.equal(publicView.pending.directedMagicRay,undefined);
 assert.equal(publicView.pending.targetCenter,undefined);
 const before=structuredClone(launched);
 const settled=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.5,y:.5}
 },dice);
 assert.deepEqual(launched,before,"resolving cannot mutate the pending snapshot");
 assert.equal(settled.pending,null);
 assert.equal(settled.actors.NPC.hp,180);
 assert.equal(settled.actors.NPC.spentAp,0,"mirror interception pays no defender reaction");
 assert.equal(settled.actors.NPC.spentTicks,0);
 assert.equal(settled.actors.PLAYER.hp,140,"40 magic damage returns to caster");
 assert.equal(settled.mana.PLAYER.current,48,"one skill cast still spends 12 mana");
 assert.equal(settled.actors.PLAYER.spentAp,1);
 assert.equal(reflections(settled).length,1);
 assert.equal(reflections(settled)[0].constructionId,"middle");
 assert.equal(reflections(settled)[0].damage,40);
 assert.equal(result(settled).contact,false);
 assert.equal(result(settled).damage,0);
 assert.equal(settled.constructions[0].durability,5,"magic does not break mirror");
});

test("a mirror near the aiming-center icon but OFF the measured world ray cannot reflect",()=>{
 const s=state();
 s.constructions=[mirror("near-icon",{x:2,y:.6},{center:{x:.5,y:.5}})];
 const launched=cast(s,812);
 const settled=none(launched);
 assert.equal(reflections(settled).length,0);
 assert.equal(settled.actors.PLAYER.hp,180);
 assert.ok(settled.actors.NPC.hp<180);
 assert.equal(result(settled).contact,true);
});

test("only the FIRST intersected mirror reflects, independently of creation order",()=>{
 const s=state();
 s.constructions=[
  mirror("far",{x:2.8,y:0}),
  mirror("near",{x:1.1,y:0}),
  mirror("other",{x:2.0,y:0}),
  mirror("friendly",{x:.6,y:0},{owner:"PLAYER"}),
 ];
 const settled=none(cast(s,813));
 assert.deepEqual(reflections(settled).map(e=>e.constructionId),["near"]);
 assert.equal(settled.actors.PLAYER.hp,140);
 assert.equal(settled.actors.NPC.hp,180);
 assert.equal(settled.constructions.length,4);
});

test("no measured world position means NO invented interception, even with legacy longitudinal coordinate",()=>{
 const s=state();
 s.constructions=[mirror("old",undefined,{positionMeters:2,center:{x:.5,y:.5}})];
 const settled=none(cast(s,814));
 assert.equal(reflections(settled).length,0);
 assert.ok(settled.actors.NPC.hp<180);
 assert.equal(settled.actors.PLAYER.hp,180);
});

test("a nearest mirror at the launch origin, target or outside the segment is not a mid-flight interceptor",()=>{
 const from={x:0,y:0},to={x:4,y:0};
 assert.equal(MIRROR_RAY_INTERCEPT_RADIUS_METERS,.35);
 for(const x of [0,4,4.5]){
  assert.equal(firstMirrorAlongMagicRay([mirror("endpoint",{x,y:0})],"NPC",from,to),null);
 }
 assert.equal(firstMirrorAlongMagicRay([mirror("off",{x:2,y:.351})],"NPC",from,to),null);
 assert.equal(firstMirrorAlongMagicRay([mirror("tangent",{x:2,y:.35})],"NPC",from,to)?.mirror.id,
  "tangent");
 assert.equal(firstMirrorAlongMagicRay([mirror("zero",{x:2,y:0})],"NPC",from,from),null);
 assert.equal(firstMirrorAlongMagicRay([mirror("broken",{x:2,y:0},{durability:0})],"NPC",from,to),null);
 assert.equal(firstMirrorAlongMagicRay([mirror("decoration",{x:2,y:0},{form:"DECOR"})],"NPC",from,to),null);
 assert.equal(firstMirrorAlongMagicRay([mirror("forged",{x:2,y:0},{fieldPosition:{x:Infinity,y:0}})],
  "NPC",from,to),null);
 const ties=firstMirrorAlongMagicRay([
  mirror("z",{x:2,y:0}),mirror("a",{x:2,y:0})],"NPC",from,to);
 assert.equal(ties?.mirror.id,"a","equal intersections use stable ID order");
});

test("basic magic still reflects only by its real 1.4 m AREA, not by a directed ray",()=>{
 const s=state();
 s.constructions=[mirror("on-world-ray",{x:2,y:0},{center:{x:.95,y:.95}})];
 const basic=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",usesMagic:true,attackType:"PIERCE",areaCenter:{x:.5,y:.5}
 },dice);
 assert.equal(basic.pending.directedMagicRay,undefined);
 const noAreaOverlap=none(basic);
 assert.equal(reflections(noAreaOverlap).length,0);
 assert.equal(noAreaOverlap.mana.PLAYER.current,59);
 assert.ok(noAreaOverlap.actors.NPC.hp<180);
 const touched=state();
 touched.constructions=[mirror("canvas-overlap",{x:2,y:.8},{center:{x:.55,y:.5}})];
 const overlap=none(applyCombatCommand(touched,"PLAYER",{
  kind:"ATTACK",usesMagic:true,attackType:"PIERCE",areaCenter:{x:.5,y:.5}
 },dice));
 assert.equal(reflections(overlap).length,1,"basic magic still uses area contact");
});

test("typed magical areas keep their footprint collision and do not intercept by the centerline",()=>{
 const s=state();
 s.constructions=[mirror("line",{x:2,y:0},{center:{x:.95,y:.95}})];
 const area=compileCombatSkill(skill(816,"Área circular de 3 m | Alcance máximo: 5 m"));
 const launched=applyResolvedCombatSkill(s,"PLAYER",area,{
  requestId:"mirror-typed-area-816",areaCenter:{x:.5,y:.5}},dice);
 assert.equal(launched.pending.directedMagicRay,undefined);
 const settled=none(launched);
 assert.equal(reflections(settled).length,0,"area overlap, not line, defines reflection");
 const touching=state();
 touching.constructions=[mirror("area",{x:2,y:1},{center:{x:.55,y:.5}})];
 const hit=none(applyResolvedCombatSkill(touching,"PLAYER",area,{
  requestId:"mirror-typed-area-816-other",areaCenter:{x:.5,y:.5}},dice));
 assert.equal(reflections(hit).length,1);
});

test("mirror skill's FIRST ray uses the placed mirror position, not its owner's position",()=>{
 const mirrorSkill=compileCombatSkill({
  id:817,name:"Espejo activo",status:"APPROVED",category:"OFFENSIVE",cost:15,
  areaOfEffect:"100m | Alcance máximo: 5 m",speed:"Ataque mágico",
  duration:"Instantánea",cooldown:"Sin cooldown",attackType:"PIERCE",
  effect:[
   {type:"SUMMON_MIRROR",value:1,target:"OTHER"},
   {type:"MIRROR_RAY",value:100,target:"MAGIC_ATTACK"},
   {type:"MAGIC_REFLECTION",value:100,target:"OTHER"}
  ],mechanics:{}
 });
 const s=state();
 s.constructions=[mirror("interceptor",{x:2,y:0})];
 const launched=applyResolvedCombatSkill(s,"PLAYER",mirrorSkill,{
  requestId:"mirror-first-ray-world-817",
  areaCenter:{x:.2,y:.2},constructionFieldPoint:{x:.55,y:.5},
  constructionForm:"FIELD"
 },dice);
 assert.equal(launched.pending.mirrorId,launched.constructions[1].id);
 assert.deepEqual(launched.pending.directedMagicRay,{
  from:{x:0.5000000000000004,y:0},to:{x:4,y:0}
 });
 const intercepted=none(launched);
 assert.equal(intercepted.actors.NPC.hp,180);
 assert.equal(reflections(intercepted).length,1);
 assert.equal(reflections(intercepted)[0].constructionId,"interceptor");
 assert.equal(intercepted.mana.PLAYER.current,45);
 assert.ok(intercepted.constructions.some(c=>c.owner==="PLAYER"&&c.form==="MIRROR"),
  "emitting mirror remains active");
 const next=structuredClone(intercepted);
 next.actors.PLAYER.spentTicks=100;
 next.actors.NPC.spentTicks=80;
 const round2=applyCombatCommand(next,"NPC",{kind:"WAIT"},dice);
 assert.equal(round2.round,2);
 assert.equal(round2.pending?.mirrorAuto,true);
 assert.deepEqual(round2.pending?.directedMagicRay,launched.pending.directedMagicRay);
 const hitAgain=none(round2);
 assert.equal(reflections(hitAgain).length,2);
 assert.equal(hitAgain.actors.NPC.hp,180);
 assert.equal(hitAgain.mana.PLAYER.current,45,"automatic ray costs no extra mana");
});

test("lethal reflection from a mid-flight mirror ends the fight for its owner",()=>{
 const s=state();
 s.actors.PLAYER.magicAttack=240;
 s.constructions=[mirror("lethal",{x:2,y:0})];
 const landed=none(cast(s,819));
 assert.equal(landed.status,"FINISHED");
 assert.equal(landed.winner,"NPC");
 assert.equal(landed.pending,null);
 assert.equal(landed.actors.PLAYER.hp,0);
 assert.equal(landed.actors.NPC.hp,180);
 assert.equal(reflections(landed).length,1);
});

test("AFTER movement occurs only after the ray has been launched and intercepted",()=>{
 const s=state();
 s.constructions=[mirror("between",{x:2,y:0})];
 const launched=cast(s,820,{planarMove:{x:.2,y:0},movementOrder:"AFTER"});
 assert.deepEqual(launched.pending.directedMagicRay.from,{x:0,y:0});
 const settled=none(launched);
 assert.equal(reflections(settled).length,1);
 assert.ok(Math.abs(settled.actors.PLAYER.positionMeters-.2)<1e-8);
 assert.equal(settled.actors.NPC.spentAp,0);
});
