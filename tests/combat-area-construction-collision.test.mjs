import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {attackAreaHits} from "../lib/combat/skill-area.ts";
import {constructionInAreaFootprint} from "../lib/combat/constructs.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand} from "../lib/combat/turn-engine.ts";

const fighter=(name,id,position=0)=>({
 name,characterId:id,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:90,
 critical:0,luck:15,race:20,massKg:70,positionMeters:position,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,
});
const initial=()=>{
 const s=newCombatState(fighter("Emisora",101,0),fighter("Objetivo",102,1.5));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const block=(id,x=.5,y=.5,patch={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",label:id,
 center:{x,y},createdRound:1,tangible:true,durability:90,hitCount:0,...patch,
});
const field=(id,x=.5,y=.5)=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"FIELD",label:id,
 center:{x,y},createdRound:1,tangible:false,
});
const decor=(id,x=.5,y=.5)=>({
 id,owner:"NPC",sourceSkillId:141,material:"LIGHT",form:"DECOR",label:id,
 center:{x,y},createdRound:1,tangible:false,
});
const skill=(id,area,usesMagic=true)=>({
 id,name:"Área "+id,status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 areaOfEffect:area+" | Alcance máximo: 5 m",mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,
  target:usesMagic?"MAGIC_ATTACK":"PHYSICAL_ATTACK"}],
});
const circle="Área circular de 3 m",strip="Franja de 4 m de largo y 1 m de ancho";
const cone="Cono de 3 m y apertura de 90°",sweep="Barrido en arco de 1 a 3 m y apertura de 90°";
const cast=(s,id,area,magic=true,center={x:.5,y:.5},angle=0)=>applyResolvedCombatSkill(
 s,"PLAYER",compileCombatSkill(skill(id,area,magic)),
 {requestId:"area-collision-"+id+"-00001",areaCenter:center,
  ...(["Franja","Cono","Barrido"].some(text=>area.startsWith(text))?{areaAngleDegrees:angle}:{})},dice
);
const none=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const find=(s,id)=>s.constructions.find(c=>c.id===id);
const impacts=(s,id)=>s.log.filter(e=>e.kind==="CONSTRUCTION"&&e.constructionId===id&&e.contact===true);

test("one magic circular explosion damages each touched solid obstacle on either team, not fields or decorations",()=>{
 const s=initial();
 s.constructions=[
  block("near-npc",.55,.50),
  block("near-player",.70,.50,{owner:"PLAYER",durability:25}),
  block("far",.90,.90),
  field("untouchable-field",.50,.50),decor("light",.50,.50),
 ];
 const beforeAp=s.actors.NPC.spentAp,beforeTicks=s.actors.NPC.spentTicks;
 const result=none(cast(s,810,circle,true));
 assert.equal(find(result,"near-npc").durability,50);
 assert.equal(find(result,"near-npc").hitCount,1);
 assert.equal(find(result,"near-player"),undefined,"collateral destruction removes one block");
 assert.equal(find(result,"far").durability,90);
 assert.ok(find(result,"untouchable-field")&&find(result,"light"));
 assert.equal(result.constructions.length,4);
 assert.equal(impacts(result,"near-npc").length,1);
 assert.equal(impacts(result,"near-player").length,1);
 assert.equal(result.actors.NPC.spentAp,beforeAp,"NONE stays free");
 assert.equal(result.actors.NPC.spentTicks,beforeTicks);
 assert.equal(result.mana.PLAYER.current,48);
 assert.ok(result.actors.NPC.hp<180);
});

test("area can destroy a block while missing the character, without damaging unrelated blocks",()=>{
 const s=initial();
 s.constructions=[block("blast-only",.08,.07),block("outside",.6,.5)];
 const result=none(cast(s,811,circle,true,{x:.08,y:.08}));
 assert.equal(result.actors.NPC.hp,180,"character outside circle");
 assert.equal(find(result,"blast-only").durability,50);
 assert.equal(find(result,"outside").durability,90);
 assert.equal(result.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").length,1);
});

test("successful character dodge does not make nearby material obstacles intangible",()=>{
 const s=initial();
 s.constructions=[block("blast-cover")];
 const launched=cast(s,812,circle,true,{x:.51,y:.49});
 const resolved=applyCombatCommand(launched,"NPC",
  {kind:"DEFEND",defense:"DODGE",predictedCenter:{x:.51,y:.49}}, {...dice,hit:.99});
 assert.equal(resolved.actors.NPC.hp,180);
 assert.equal(find(resolved,"blast-cover").durability,50);
 assert.equal(impacts(resolved,"blast-cover").length,1);
 assert.equal(resolved.actors.NPC.spentAp,1);
});

test("physical and magical rectangles, cones and annular sweeps use their exact rotating footprint for blocks",()=>{
 const shapes=[
  {area:strip,at:{x:.65,y:.50},outside:{x:.5,y:.65}},
  {area:cone,at:{x:.65,y:.50},outside:{x:.5,y:.65}},
  {area:sweep,at:{x:.65,y:.50},outside:{x:.55,y:.50}},
 ];
 let id=820;
 for(const {area,at,outside} of shapes)for(const magic of [false,true]){
  const s=initial();
  const areaBlock=block("shape-hit-"+id,at.x,at.y);
  s.constructions=[areaBlock,block("shape-miss-"+id,outside.x,outside.y)];
  const plan=compileCombatSkill(skill(id,area,magic));
  assert.equal(attackAreaHits({x:.5,y:.5},at,plan.attackArea,0),true);
  assert.equal(attackAreaHits({x:.5,y:.5},outside,plan.attackArea,0),false);
  const launched=cast(s,id,area,magic,{x:.5,y:.5},0);
  const publicPending=combatClientView(launched);
  assert.equal(publicPending.pending.targetCenter,undefined);
  assert.equal(publicPending.pending.areaAngleDegrees,undefined);
  const result=none(launched);
  assert.ok(find(result,areaBlock.id).durability<90);
  assert.equal(find(result,"shape-miss-"+id).durability,90);
  assert.equal(impacts(result,areaBlock.id).length,1);
  assert.equal(result.mana.PLAYER.current,48);
  id++;
 }
});

test("turning an oriented attack changes which barrier receives the damage",()=>{
 const s=initial();
 s.constructions=[block("east",.67,.5),block("south",.5,.67)];
 const result=none(cast(s,830,strip,false,{x:.5,y:.5},90));
 assert.equal(find(result,"east").durability,90);
 assert.ok(find(result,"south").durability<90);
});

test("active CONSTRUCTION defense wears its own barrier once, plus incidental wear on other touched blocks",()=>{
 const s=initial();
 s.constructions=[block("defense"),block("other",.7,.5)];
 const launched=cast(s,840,circle,true);
 const result=applyCombatCommand(launched,"NPC",
  {kind:"DEFEND",defense:"CONSTRUCTION",constructionId:"defense"},dice);
 assert.equal(result.actors.NPC.hp,180,"barrier with adequate resistance fully holds");
 assert.equal(find(result,"defense").durability,50,"reactive block takes one pressure, not two");
 assert.equal(find(result,"defense").hitCount,1);
 assert.equal(impacts(result,"defense").length,0,"not counted as incidental AoE damage");
 assert.equal(find(result,"other").durability,50);
 assert.equal(impacts(result,"other").length,1);
 assert.equal(result.actors.NPC.spentAp,1);
});

test("a selected barrier outside the private blast remains intact and cannot shield the fighter",()=>{
 const s=initial();
 s.constructions=[block("wrong-cover",.84,.5)];
 const launched=cast(s,841,circle,true);
 const projected=combatClientView(launched);
 assert.equal(projected.pending.targetCenter,undefined,"hidden impact is not revealed");
 const result=applyCombatCommand(launched,"NPC",
  {kind:"DEFEND",defense:"CONSTRUCTION",constructionId:"wrong-cover"},dice);
 assert.ok(result.actors.NPC.hp<180,"out-of-footprint block offers no magic cover");
 assert.equal(find(result,"wrong-cover").durability,90);
 assert.equal(result.actors.NPC.spentAp,1,"wrong guess still pays reaction");
 assert.ok(result.log.some(e=>e.kind==="CONSTRUCTION"&&e.contact===false&&
  e.constructionId==="wrong-cover"));
});

test("SELF_FIELD sweeps use actual horizontal world distance, never invented vertical coordinates",()=>{
 const s=initial();
 s.constructions=[
  block("near-world",.9,.9,{fieldPosition:{x:1.8,y:0}}),
  block("far-world",.5,.5,{fieldPosition:{x:2.5,y:0}}),
  block("legacy-without-world",.5,.5),
  decor("light-world",.5,.5),
 ];
 const melee={
  ...skill(850,"Campo alrededor del usuario",false),
  areaOfEffect:"Campo alrededor del usuario | Alcance máximo: 2 m",
  attackType:"BLUNT",
 };
 const plan=compileCombatSkill(melee);
 assert.equal(plan.attackArea.shape,"SELF_FIELD");
 const launched=applyResolvedCombatSkill(s,"PLAYER",plan,
  {requestId:"self-field-area-block-850"},dice);
 assert.equal(launched.pending.targetCenter,undefined);
 const result=none(launched);
 assert.ok(find(result,"near-world").durability<90);
 assert.equal(find(result,"far-world").durability,90);
 assert.equal(find(result,"legacy-without-world").durability,90);
 assert.ok(find(result,"light-world"));
 assert.equal(impacts(result,"near-world").length,1);
 assert.equal(result.mana.PLAYER.current,48);
});

test("legacy constructions remain readable and no new SQL schema or reaction is required",()=>{
 const s=initial();
 const oldBlock={...block("historical",.5,.5)};
 delete oldBlock.hitCount;
 delete oldBlock.fieldPosition;
 s.constructions=[oldBlock];
 const launched=cast(s,860,circle,false);
 const settled=none(launched);
 assert.equal(find(settled,"historical").hitCount,1);
 assert.ok(find(settled,"historical").durability<90);
 const typed=compileCombatSkill(skill(861,circle,true)).attackArea;
 assert.equal(constructionInAreaFootprint(
  {...oldBlock,form:"DECOR",tangible:false},typed,{x:.5,y:.5},undefined,{x:0,y:0}),false);
});
