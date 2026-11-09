import test from "node:test";
import assert from "node:assert/strict";
import {resolveDamageChannels} from "../lib/combat/damage-channels.ts";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {applyResolvedCombatSkill,applyCombatCommand,newCombatState}
 from "../lib/combat/turn-engine.ts";

const channel=(kind="PHYSICAL",patch={})=>({
 kind,power:35,protection:9,damageMultiplier:1.2,
 defenseFactor:0.75,finalMultiplier:1.5,
 typeFactor:1.3,racialFactor:0.9,
 critical:false,contact:true,reactionScale:0.8,...patch,
});
const legacyFormula=({power,protection,damageMultiplier,defenseFactor,
 finalMultiplier,typeFactor,racialFactor,critical,contact,reactionScale})=>{
 const raw=Math.max(1,Math.round(
  power*damageMultiplier*(critical?1.5:1)*typeFactor-
  protection*defenseFactor*0.75));
 const noDefenseRaw=Math.max(1,Math.round(
  power*damageMultiplier*(critical?1.5:1)*typeFactor));
 const damage=contact?Math.max(0,Math.round(
  raw*reactionScale*finalMultiplier*racialFactor)):0;
 const unprotectedDamage=contact?Math.max(0,Math.round(
  noDefenseRaw*reactionScale*finalMultiplier*racialFactor)):0;
 return {raw,rawWithoutResistance:noDefenseRaw,damage,unprotectedDamage,
  mitigatedByResistance:Math.max(0,unprotectedDamage-damage)};
};
const actor=(name,id,pos,patch={})=>({
 characterId:id,name,hp:90,maxHp:90,agility:100,speedValue:100,
 strength:20,constitution:10,precision:100,dodge:10,
 physicalAttack:35,physicalDefense:9,magicAttack:35,magicDefense:9,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"PIERCE",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...patch,
});
const encounter=()=>{
 const state=newCombatState(actor("Iniciador",11,0),actor("Defensor",12,3),"PLAYER");
 state.mana={PLAYER:{current:80,max:80},NPC:{current:80,max:80}};
 return state;
};
const attackSkill=(magic,id)=>compileCombatSkill({
 id,name:"Ataque "+id,status:"APPROVED",category:"OFFENSIVE",cost:12,
 attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
 condition:"",mechanics:{},
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 effect:[{type:"DAMAGE_MULTIPLIER",
  target:magic?"MAGIC_ATTACK":"PHYSICAL_ATTACK",value:125},
  {type:magic?"IGNORE_MAGIC_DEF_MULTIPLIER":"IGNORE_PHYS_DEF_MULTIPLIER",value:75},
  {type:"FINAL_DAMAGE_MULTIPLIER",value:150}],
});
const dice={hit:.01,critical:.99,defense:.99};
const resolve=(state,magic,id)=>{
 const plan=attackSkill(magic,id);
 const pending=applyResolvedCombatSkill(state,"PLAYER",plan,{
  requestId:"channel-skill-cast-"+id,
  ...(magic?{areaCenter:{x:.5,y:.5}}:
   {trajectory:[{x:0,y:.5},{x:.5,y:.5}]}),
 },dice);
 assert.equal(pending.pending?.usesMagic,magic);
 assert.equal(pending.mana.PLAYER.current,68);
 return applyCombatCommand(pending,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
};

test("a single physical or magical damage channel reproduces the exact historical skill formula",()=>{
 for(const kind of ["PHYSICAL","MAGICAL"]){
  for(let i=0;i<650;i++){
   const args=channel(kind,{
    power:i%7===0?0:(i*13)%230+0.3,
    protection:(i*17)%300,
    damageMultiplier:((i*11)%130+1)/60,
    defenseFactor:(i%9)/7,
    finalMultiplier:((i*19)%140+1)/65,
    typeFactor:((i*5)%90+1)/55,
    racialFactor:((i*23)%100+1)/75,
    reactionScale:(i%11)/10,
    contact:i%8!==0,
    critical:i%3===0,
   });
   const result=resolveDamageChannels([args]);
   const expected=legacyFormula(args);
   assert.deepEqual(result.channels[0],{kind,...expected},
    "single-channel parity "+kind+" #"+i);
   assert.equal(result.damage,expected.damage);
   assert.equal(result.unprotectedDamage,expected.unprotectedDamage);
   assert.equal(result.mitigatedByResistance,expected.mitigatedByResistance);
  }
 }
});

test("two independently defended channels are accounted separately before totaling",()=>{
 const physical=channel("PHYSICAL",{
  power:45,protection:60,typeFactor:1.2,reactionScale:0.15});
 const magical=channel("MAGICAL",{
  power:22,protection:4,typeFactor:0.8,reactionScale:0.7,
  racialFactor:1.5});
 const expectedPhysical=legacyFormula(physical);
 const expectedMagical=legacyFormula(magical);
 const result=resolveDamageChannels([physical,magical]);
 assert.deepEqual(result.channels.map(c=>c.kind),["PHYSICAL","MAGICAL"]);
 assert.equal(result.channels[0].damage,expectedPhysical.damage);
 assert.equal(result.channels[1].damage,expectedMagical.damage);
 assert.equal(result.damage,expectedPhysical.damage+expectedMagical.damage);
 assert.equal(result.unprotectedDamage,
  expectedPhysical.unprotectedDamage+expectedMagical.unprotectedDamage);
 assert.equal(result.mitigatedByResistance,
  expectedPhysical.mitigatedByResistance+expectedMagical.mitigatedByResistance);
 assert.ok(result.channels[0].mitigatedByResistance>=0);
 assert.ok(result.channels[1].mitigatedByResistance>=0);
});

test("no contact on one channel never creates damage for that channel",()=>{
 const res=resolveDamageChannels([
  channel("PHYSICAL",{contact:false,power:10000}),
  channel("MAGICAL",{contact:true,power:20,protection:0}),
 ]);
 assert.equal(res.channels[0].damage,0);
 assert.ok(res.channels[1].damage>0);
 assert.equal(res.damage,res.channels[1].damage);
 const missed=resolveDamageChannels([channel("PHYSICAL",{contact:false})]);
 assert.equal(missed.damage,0);
 assert.equal(missed.unprotectedDamage,0);
 assert.equal(missed.mitigatedByResistance,0);
});

test("explicit channel boundaries reject missing, unknown, duplicated or unsafe calculations",()=>{
 const invalid=[
  [],[channel("PHYSICAL"),channel("PHYSICAL")],
  [channel("MAGICAL"),channel("MAGICAL")],
  [channel("PHYSICAL"),channel("MAGICAL"),channel("PHYSICAL")],
  [channel("FIRE")],
  [channel("PHYSICAL",{power:NaN})],
  [channel("PHYSICAL",{power:Infinity})],
  [channel("PHYSICAL",{protection:-3})],
  [channel("PHYSICAL",{reactionScale:-1})],
  [channel("PHYSICAL",{typeFactor:Infinity})],
  [channel("MAGICAL",{critical:1})],
  [channel("MAGICAL",{contact:"true"})],
  [channel("MAGICAL",{power:Number.MAX_VALUE,damageMultiplier:10})],
  [channel("MAGICAL",{power:Number.MAX_SAFE_INTEGER,damageMultiplier:8})],
 ];
 for(const channels of invalid)
  assert.throws(()=>resolveDamageChannels(channels),"invalid input "+JSON.stringify(channels));
});

test("actual approved single-channel physical damage keeps encounter accounting and log",()=>{
 const settled=resolve(encounter(),false,601);
 const event=settled.log.filter(e=>e.kind==="RESOLVE").at(-1);
 assert.equal(event?.skillId,601);
 assert.equal(event?.contact,true);
 assert.ok(event?.damage>0);
 assert.equal(settled.actors.NPC.hp,90-event.damage);
 assert.ok(event.mitigatedByResistance>=0);
 assert.equal(settled.summonStatuses?.length??0,0);
});
test("actual approved single-channel magical damage keeps encounter accounting and log",()=>{
 const settled=resolve(encounter(),true,602);
 const event=settled.log.filter(e=>e.kind==="RESOLVE").at(-1);
 assert.equal(event?.skillId,602);
 assert.equal(event?.contact,true);
 assert.ok(event?.damage>0);
 assert.equal(settled.actors.NPC.hp,90-event.damage);
 assert.ok(event.mitigatedByResistance>=0);
 assert.equal(settled.summonStatuses?.length??0,0);
});

test("mixed physical+magic Skill graphs remain NOT launchable until a shared defense policy exists",()=>{
 const mixed={
  id:603,name:"Ataque mixto no implementado",
  status:"APPROVED",category:"OFFENSIVE",cost:10,
  duration:"Instantánea",cooldown:"Sin cooldown",attackType:"PIERCE",
  condition:"",mechanics:{},areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
  effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},
  ],
 };
 assert.equal(previewSkillExecution(mixed).executable,false);
 assert.throws(()=>compileCombatSkill(mixed),/ambiguo|no implementado|PCH revisado|híbrida/);
});
