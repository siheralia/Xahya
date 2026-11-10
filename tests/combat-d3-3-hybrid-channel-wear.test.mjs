import test from "node:test";
import assert from "node:assert/strict";
import {attributeActualHpDamage} from "../lib/combat/damage-attribution.ts";
import {
 equipmentWearFromAttributedHit,defaultEquippedWear
} from "../lib/items/equipped-wear.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
 newCombatState,applyResolvedCombatSkill,applyCombatCommand,
 applyWearableOnConfirmedHpHit
} from "../lib/combat/turn-engine.ts";
import {narrateCombat} from "../lib/combat/narration.ts";

const rules={
 physical:{...defaultEquippedWear(),channel:"PHYSICAL",wearPercent:100},
 magical:{...defaultEquippedWear(),channel:"MAGICAL",wearPercent:100},
 all:{...defaultEquippedWear(),channel:"ALL",wearPercent:100},
};
const armor=(id,rule)=>({
 name:id,itemId:Number(id.slice(1))+100,
 characterItemId:Number(id.slice(1))+1000,
 itemType:"ARMOR",slot:"BODY",durability:100,wearOnHit:rule,
});
const armorSet=()=>[
 armor("A1",rules.physical),armor("A2",rules.magical),armor("A3",rules.all),
];
const fighter=(name,characterId,positionMeters,patch={})=>({
 name,characterId,hp:160,maxHp:160,agility:100,speedValue:100,
 strength:40,constitution:11,precision:100,dodge:10,
 physicalAttack:45,physicalDefense:10,magicAttack:55,magicDefense:15,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch,
});
const duel=(patch={})=>{
 const s=newCombatState(fighter("Alba",101,0),
  fighter("Guardia",102,1.5,{equippedWearables:armorSet(),...patch}),"PLAYER");
 s.mana={PLAYER:{current:80,max:80},NPC:{current:80,max:80}};
 return s;
};
const skill=compileCombatSkill({
 id:801,name:"Golpe imbuido",characterId:101,
 status:"APPROVED",approvedAt:"2026-11-09T00:00:00Z",pchCost:72,
 category:"OFFENSIVE",attackType:"BLUNT",cost:10,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 duration:"Instantánea",cooldown:"1 turno",condition:"",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",mechanics:{},
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
 ],
});
const roll={hit:.01,critical:.99,defense:.99};
const path=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const launch=(s,tag="d33-wear-contact-01")=>
 applyResolvedCombatSkill(s,"PLAYER",skill,{requestId:tag,trajectory:path},roll);
const resolve=(s,defense="NONE",dice=roll,other={})=>
 applyCombatCommand(launch(s),"NPC",{kind:"DEFEND",defense,...other},dice);
const impact=s=>s.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
const wearEvents=s=>s.log.filter(e=>e.kind==="EQUIPMENT_WEAR");
const bar=(x,durability)=>({
 id:"Barricada",owner:"NPC",sourceSkillId:900,material:"EARTH",
 form:"BLOCK",label:"Barricada",center:{x:.5,y:.5},
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability,hitCount:0,
 createdRound:1,
});

test("proportional attribution conserves real HP and respects both raw components",()=>{
 const cases=[
  [0,{physical:60,magical:40},{physical:0,magical:0}],
  [100,{physical:60,magical:40},{physical:60,magical:40}],
  [5,{physical:60,magical:40},{physical:3,magical:2}],
  [1,{physical:50,magical:50},{physical:1,magical:0}],
  [1,{physical:1,magical:99},{physical:0,magical:1}],
  [2,{physical:1,magical:99},{physical:0,magical:2}],
  [4,{physical:0,magical:5},{physical:0,magical:4}],
  [4,{physical:5,magical:0},{physical:4,magical:0}],
 ];
 for(const [hp,split,expected] of cases)
  assert.deepEqual(attributeActualHpDamage(hp,split),expected);
 for(let physical=0;physical<=20;physical++){
  for(let magical=0;magical<=20;magical++){
   for(let hp=0;hp<=physical+magical;hp++){
    const a=attributeActualHpDamage(hp,{physical,magical});
    assert.equal(a.physical+a.magical,hp);
    assert.ok(a.physical>=0&&a.physical<=physical);
    assert.ok(a.magical>=0&&a.magical<=magical);
   }
  }
 }
 for(const [hp,split] of [
  [-1,{physical:2,magical:2}],
  [5,{physical:2,magical:2}],
  [0,{physical:-1,magical:2}],
  [0,{physical:NaN,magical:2}],
  [0,{physical:Number.MAX_SAFE_INTEGER,magical:1}],
  [0,{physical:1.5,magical:2}],
 ]){
  assert.throws(()=>attributeActualHpDamage(hp,split));
 }
});

test("item rules use the correct actual HP channel and ALL never doubles wear",()=>{
 const hit={physical:8,magical:4};
 assert.equal(equipmentWearFromAttributedHit(100,hit,rules.physical),8);
 assert.equal(equipmentWearFromAttributedHit(100,hit,rules.magical),4);
 assert.equal(equipmentWearFromAttributedHit(100,hit,rules.all),12);
 assert.equal(equipmentWearFromAttributedHit(100,{physical:0,magical:8},rules.physical),0);
 assert.equal(equipmentWearFromAttributedHit(100,{physical:8,magical:0},rules.magical),0);
 assert.equal(equipmentWearFromAttributedHit(3,hit,rules.all),3);
 assert.throws(()=>equipmentWearFromAttributedHit(100,{physical:-1,magical:5},rules.all));
});

test("real melee hybrid wears physical, magical and ALL armor exactly once",()=>{
 const input=duel(),before=structuredClone(input);
 const s=resolve(input),event=impact(s);
 assert.deepEqual(input,before);
 assert.ok(event.damageChannels.physical>0&&event.damageChannels.magical>0);
 assert.equal(event.damage,event.damageChannels.physical+event.damageChannels.magical);
 assert.deepEqual(event.hpDamageChannels,event.damageChannels);
 assert.equal(event.mitigatedByResistance,
  event.mitigatedChannels.physical+event.mitigatedChannels.magical);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(x=>100-x.durability),[
  event.hpDamageChannels.physical,event.hpDamageChannels.magical,event.damage,
 ]);
 assert.equal(wearEvents(s).length,3);
 assert.equal(s.mana.PLAYER.current,70);
 assert.equal(s.actors.PLAYER.spentAp,1);
});

test("lethal overkill wears only HP truly removed, not the raw total attack",()=>{
 const s=resolve(duel({hp:5}));
 const e=impact(s);
 assert.ok(e.damage>5);
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(e.hpDamageChannels.physical+e.hpDamageChannels.magical,5);
 assert.ok(e.hpDamageChannels.physical<=e.damageChannels.physical);
 assert.ok(e.hpDamageChannels.magical<=e.damageChannels.magical);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(x=>100-x.durability),[
  e.hpDamageChannels.physical,e.hpDamageChannels.magical,5,
 ]);
 assert.equal(wearEvents(s).length,3);
});

test("a shield block protects physical component without hiding magical armor wear",()=>{
 const s=resolve(duel(),"BLOCK",{hit:.01,critical:.99,defense:0});
 const e=impact(s);
 assert.ok(e.damageChannels.magical>0);
 assert.equal(e.hpDamageChannels.magical,e.damageChannels.magical);
 assert.equal(s.actors.NPC.equippedWearables[1].durability,
  100-e.hpDamageChannels.magical);
 assert.equal(wearEvents(s).length,3);
});

test("magic field reduces only magical component and its gear wear",()=>{
 const s=resolve(duel({magicDefense:1000}),"MAGIC_FIELD",
  {hit:.01,critical:.99,defense:0});
 const e=impact(s);
 assert.ok(e.damageChannels.physical>0);
 assert.equal(e.damageChannels.magical,0);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,
  100-e.hpDamageChannels.physical);
 assert.equal(s.actors.NPC.equippedWearables[1].durability,100);
 assert.equal(s.actors.NPC.equippedWearables[2].durability,
  100-e.hpDamageChannels.physical);
 assert.equal(wearEvents(s).length,2);
 assert.equal(s.mana.NPC.current,79);
});

test("misses and full walls wear no HP-reactive armor",()=>{
 const before=duel();
 const s=duel();
 s.constructions=[bar(.2,500)];
 const stopped=resolve(s);
 assert.deepEqual(impact(stopped).hpDamageChannels,{physical:0,magical:0});
 assert.equal(impact(stopped).damage,0);
 assert.deepEqual(stopped.actors.NPC.equippedWearables.map(x=>x.durability),[100,100,100]);
 assert.equal(wearEvents(stopped).length,0);
 const launched=applyResolvedCombatSkill(before,"PLAYER",skill,{
  requestId:"d33-wear-contact-miss",trajectory:[{x:.1,y:.05},{x:.5,y:.05}],
 },roll);
 const missed=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.equal(impact(missed).damage,0);
 assert.equal(wearEvents(missed).length,0);
});

test("legacy one-channel hit still uses old wear behavior without channel split",()=>{
 const s=duel();
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(x=>100-x.durability),
  [20,0,20]);
 assert.equal(wearEvents(s).length,2);
 const m=duel();
 applyWearableOnConfirmedHpHit(m,"NPC",20,true);
 assert.deepEqual(m.actors.NPC.equippedWearables.map(x=>100-x.durability),
  [0,20,20]);
 assert.equal(wearEvents(m).length,2);
});

test("chronicle explicitly distinguishes two damage channels without another attack",()=>{
 const s=resolve(duel());
 const text=narrateCombat(s.narrativeHistory,{
  PLAYER:{name:"Alba",hp:s.actors.PLAYER.hp,maxHp:160},
  NPC:{name:"Guardia",hp:s.actors.NPC.hp,maxHp:160},
 });
 const e=impact(s);
 assert.match(text,/La fuerza se dividió/);
 assert.match(text,/daño físico/);
 assert.match(text,/daño mágico/);
 assert.match(text,/mágic/);
 assert.equal((text.match(/La fuerza se dividió/g)??[]).length,1);
 const lethal=resolve(duel({hp:5,maxHp:160}));
 const chronicle=narrateCombat(lethal.narrativeHistory,{
  PLAYER:{name:"Alba",hp:160,maxHp:160},
  NPC:{name:"Guardia",hp:lethal.actors.NPC.hp,maxHp:160},
 });
 assert.match(chronicle,/únicamente cinco HP/);
});
