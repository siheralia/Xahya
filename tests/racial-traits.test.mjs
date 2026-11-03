import test from "node:test";
import assert from "node:assert/strict";
import { racialDamageFactors, racialDamageFactor } from "../lib/combat/innate-traits.ts";
import { compileCombatSkill } from "../lib/combat/skill-casting.ts";

const arboreal={status:"APPROVED",category:"PASSIVE",grantedByRaceSkillId:25,effect:[
  {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",target:"BLUNT",value:50},
  {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",target:"PIERCE",value:50},
  {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",target:"FIRE",value:175},
]};
test("arborio resists blunt and pierce, not cut, and is vulnerable to fire",()=>{
  const factors=racialDamageFactors([arboreal]);
  assert.equal(racialDamageFactor(factors,"BLUNT",false),0.5);
  assert.equal(racialDamageFactor(factors,"PIERCE",false),0.5);
  assert.equal(racialDamageFactor(factors,"CUT",false),1);
  assert.equal(racialDamageFactor(factors,"CUT",true,"FIRE"),1.75);
  assert.equal(racialDamageFactor(factors,"BLUNT",false,"FIRE"),0.875);
  assert.equal(racialDamageFactor(factors,"BLUNT",true,"WATER"),1);
});
test("pending and player-authored traits are ignored",()=>{
  assert.deepEqual(racialDamageFactors([{...arboreal,status:"PENDING"}, {...arboreal,grantedByRaceSkillId:null}, {...arboreal,category:"SUPPORT"}]),{});
});
test("invalid modifiers cannot enable invulnerability or a huge damage multiplier",()=>{
  const factors=racialDamageFactors([{...arboreal,effect:[
    {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",target:"BLUNT",value:0},
    {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",target:"FIRE",value:9999},
  ]}]);
  assert.deepEqual(factors,{});
});
test("fire attack skill retains its damage element, healing keeps operating",()=>{
  const attack=compileCombatSkill({
    id:3,name:"Llama",status:"APPROVED",cost:10,category:"OFFENSIVE",
    areaOfEffect:"Contacto | Alcance máximo: 10 m",attackType:"CUT",duration:"Instantánea",cooldown:"Sin cooldown",
    effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100,element:"FIRE"}],
  });
  assert.equal(attack.damageElement,"FIRE");
  const heal=compileCombatSkill({
    id:4,name:"Segunda oportunidad",status:"APPROVED",cost:12,category:"SUPPORT",
    duration:"Instantánea",cooldown:"Una vez por combate",
    effect:[{type:"RESOURCE_BONUS",target:"HP",value:18}],
  });
  assert.equal(heal.healing,18);
  assert.equal(heal.oncePerCombat,true);
});
