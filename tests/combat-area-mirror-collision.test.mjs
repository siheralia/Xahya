import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {constructionInAreaFootprint} from "../lib/combat/constructs.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";

const fighter=(name,id,positionMeters)=>({
 name,characterId:id,hp:180,maxHp:180,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:90,
 critical:0,luck:15,race:20,massKg:70,positionMeters,
 attackType:"PIERCE",defenseType:"CONCENTRATED",
 weaponIntegrity:100,spentTicks:0,spentAp:0,
});
const dice={hit:.01,critical:.99,defense:.99};
const state=()=>{
 const s=newCombatState(fighter("Emisora",101,0),fighter("Objetivo",102,1.5));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 return s;
};
const mirror=(id,world,center={x:.95,y:.95},patch={})=>({
 id,owner:"NPC",sourceSkillId:30,material:"MIRROR",form:"MIRROR",
 label:id,createdRound:1,center,fieldPosition:world,
 tangible:true,durability:5,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
 ...patch
});
const block=(id,world)=>({
 id,owner:"NPC",sourceSkillId:31,material:"EARTH",form:"BLOCK",
 label:id,createdRound:1,center:{x:.95,y:.95},fieldPosition:world,
 tangible:true,durability:90,hitCount:0
});
const skill=(id,area,magic)=>({
 id,name:"Prueba de área "+id,status:"APPROVED",category:"OFFENSIVE",
 cost:12,attackType:magic?"PIERCE":"BLUNT",
 duration:"Instantánea",cooldown:"Sin cooldown",areaOfEffect:area,
 mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",value:100,
  target:magic?"MAGIC_ATTACK":"PHYSICAL_ATTACK"}]
});
const field="Campo alrededor del usuario | Alcance máximo: 2 m";
const cast=(s,id,area,magic,center,angle)=>{
 const plan=compileCombatSkill(skill(id,area,magic));
 assert.equal(plan.usesMagic,magic);
 return applyResolvedCombatSkill(s,"PLAYER",plan,{
  requestId:"phase-b-"+id+"-request",
  ...(center?{areaCenter:center}:{}),
  ...(angle!==undefined?{areaAngleDegrees:angle}:{})
 },dice);
};
const resolve=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const impacts=(s,id,kind)=>s.log.filter(e=>e.kind===kind&&e.constructionId===id);
const active=(s,id)=>s.constructions?.find(c=>c.id===id);

test("SELF_FIELD physical sweep hits nearby enemy mirror, not remote or legacy mirrors",()=>{
 let s=state();
 s.constructions=[
  mirror("near",{x:1.8,y:0},{x:.95,y:.95}),
  mirror("outside",{x:2.5,y:0},{x:.5,y:.5}),
  mirror("unknown",undefined,{x:.5,y:.5}),
  mirror("friendly",{x:1.1,y:0},{x:.5,y:.5},{owner:"PLAYER"}),
  block("near-block",{x:1,y:0}),
 ];
 const launched=cast(s,900,field,false);
 assert.equal(launched.pending.attackArea.shape,"SELF_FIELD");
 assert.equal(launched.pending.targetCenter,undefined);
 const hp=launched.actors.NPC.hp;
 const settled=resolve(launched);
 assert.ok(settled.actors.NPC.hp<hp);
 assert.equal(active(settled,"near"),undefined,"physical field breaks enemy mirror");
 assert.equal(active(settled,"outside").durability,5);
 assert.equal(active(settled,"unknown").durability,5);
 assert.equal(active(settled,"friendly").durability,5);
 assert.equal(active(settled,"near-block").durability,55,"block and mirror share same actual world radius");
 assert.equal(impacts(settled,"near","CONSTRUCTION").length,1);
 assert.equal(impacts(settled,"outside","CONSTRUCTION").length,0);
 assert.equal(impacts(settled,"unknown","CONSTRUCTION").length,0);
 assert.equal(impacts(settled,"near-block","CONSTRUCTION").length,1);
 assert.equal(impacts(settled,"near","REFLECTION").length,0);
});

test("SELF_FIELD magical aura reflects once from each real enemy mirror within its world radius",()=>{
 const s=state();
 s.constructions=[
  mirror("near-1",{x:1.8,y:0},{x:.95,y:.95}),
  mirror("near-2",{x:0,y:1.99},{x:.9,y:.1}),
  mirror("outside",{x:2.01,y:0},{x:.5,y:.5}),
  mirror("legacy",undefined,{x:.5,y:.5}),
  mirror("friendly",{x:1,y:0},{x:.5,y:.5},{owner:"PLAYER"}),
  block("near-block",{x:1,y:0}),
 ];
 const launched=cast(s,901,field,true);
 const publicPending=combatClientView(launched);
 assert.equal(publicPending.pending.targetCenter,undefined);
 assert.equal(publicPending.pending.areaHint,undefined);
 const hp=launched.actors.PLAYER.hp;
 const settled=resolve(launched);
 assert.equal(impacts(settled,"near-1","REFLECTION").length,1);
 assert.equal(impacts(settled,"near-2","REFLECTION").length,1);
 assert.equal(impacts(settled,"outside","REFLECTION").length,0);
 assert.equal(impacts(settled,"legacy","REFLECTION").length,0);
 assert.equal(impacts(settled,"friendly","REFLECTION").length,0);
 assert.equal(active(settled,"near-1").durability,5,"magical reflection does not destroy mirror");
 assert.equal(active(settled,"near-block").durability,50,"same aura damages touched block");
 const reflected=impacts(settled,"near-1","REFLECTION")[0].damage+
  impacts(settled,"near-2","REFLECTION")[0].damage;
 assert.equal(hp-settled.actors.PLAYER.hp,reflected);
 assert.equal(settled.actors.NPC.spentAp,0);
});

test("magical single-target skill does not inherit basic magic's area against nearby mirrors",()=>{
 const s=state();
 s.constructions=[mirror("near-enemy",undefined,{x:.51,y:.5})];
 const single=cast(s,902,"Objetivo único | Alcance máximo: 5 m",true,{x:.5,y:.5});
 assert.equal(single.pending.attackArea,undefined);
 const resolved=resolve(single);
 assert.equal(impacts(resolved,"near-enemy","REFLECTION").length,0);
 assert.equal(resolved.actors.PLAYER.hp,180);
 assert.ok(resolved.actors.NPC.hp<180);
 assert.equal(active(resolved,"near-enemy").durability,5);
});

test("ordinary basic magic retains its real 1.4 m footprint and reflection",()=>{
 const s=state();
 s.constructions=[
  mirror("basic-near",undefined,{x:.55,y:.5}),
  mirror("basic-far",undefined,{x:.8,y:.5})
 ];
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",usesMagic:true,attackType:"PIERCE",areaCenter:{x:.5,y:.5}
 },dice);
 assert.equal(launched.pending.attackArea,undefined);
 const resolved=resolve(launched);
 assert.equal(impacts(resolved,"basic-near","REFLECTION").length,1);
 assert.equal(impacts(resolved,"basic-far","REFLECTION").length,0);
 assert.ok(resolved.actors.PLAYER.hp<180);
 assert.equal(resolved.mana.PLAYER.current,59);
});

test("measured world position is required for SELF_FIELD mirrors, even if canvas icons overlap",()=>{
 const area=compileCombatSkill(skill(903,field,false)).attackArea;
 const caster={x:0,y:0};
 const near=mirror("world-near",{x:0.4,y:0.3},{x:.9,y:.9});
 const far=mirror("world-far",{x:5,y:5},{x:.5,y:.5});
 const legacy=mirror("legacy",undefined,{x:.5,y:.5});
 assert.equal(constructionInAreaFootprint(near,area,undefined,undefined,caster),true);
 assert.equal(constructionInAreaFootprint(far,area,undefined,undefined,caster),false);
 assert.equal(constructionInAreaFootprint(legacy,area,undefined,undefined,caster),false);
});

test("rotated and annular areas touch mirrors by true orientation, not just circle distance",()=>{
 const shapes=[
  {description:"Área circular de 3 m | Alcance máximo: 5 m",angle:undefined},
  {description:"Franja de 4 m de largo y 1 m de ancho | Alcance máximo: 5 m",angle:0},
  {description:"Cono de 3 m y apertura de 90° | Alcance máximo: 5 m",angle:0},
  {description:"Barrido en arco de 1 a 3 m y apertura de 90° | Alcance máximo: 5 m",angle:0},
 ];
 for(let i=0;i<shapes.length;i++)for(const magic of [true,false]){
  const {description,angle}=shapes[i];
  const initial=state();
  initial.constructions=[
   mirror("east",undefined,{x:.65,y:.50}),
   mirror("far",undefined,{x:.97,y:.95}),
  ];
  const launched=cast(initial,920+i*2+Number(magic),description,magic,{x:.5,y:.5},angle);
  const projected=combatClientView(launched);
  assert.equal(projected.pending.targetCenter,undefined);
  if(angle!==undefined)assert.equal(projected.pending.areaAngleDegrees,undefined);
  const settled=resolve(launched);
  if(magic){
   assert.equal(impacts(settled,"east","REFLECTION").length,1,description);
   assert.equal(impacts(settled,"far","REFLECTION").length,0,description);
  }else{
   assert.equal(active(settled,"east"),undefined,description);
   assert.ok(active(settled,"far"),description);
   assert.equal(impacts(settled,"east","CONSTRUCTION").length,1,description);
  }
 }
});

test("breaking an area-hit mirror cancels its future automatic ray without extra reactions",()=>{
 const s=state();
 s.constructions=[mirror("queued",{x:1,y:0},{x:.95,y:.95})];
 s.mirrorRayQueue=["queued"];
 const settled=resolve(cast(s,950,field,false));
 assert.equal(active(settled,"queued"),undefined);
 assert.deepEqual(settled.mirrorRayQueue,[]);
 assert.equal(settled.actors.NPC.spentAp,0);
 assert.equal(impacts(settled,"queued","CONSTRUCTION").length,1);
});
