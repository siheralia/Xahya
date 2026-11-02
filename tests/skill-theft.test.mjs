import test from "node:test";
import assert from "node:assert/strict";
import {BASE_COST,effectPchCost} from "../lib/skills/pch.ts";
import {requiredTheftPch,validateTheftEffect,SKILL_THEFT_COMPLEXITY_MULTIPLIER} from "../lib/skills/theft-pricing.ts";

test("robo cuesta el doble del costo base de copiar",()=>{
  assert.equal(BASE_COST.COPY_SKILL,15);
  assert.equal(BASE_COST.STEAL_SKILL,30);
  assert.equal(effectPchCost({type:"STEAL_SKILL",value:1}),30);
});
test("robar exige el doble de PCH de la habilidad original",()=>{
  assert.equal(SKILL_THEFT_COMPLEXITY_MULTIPLIER,2);
  assert.equal(requiredTheftPch(10),20);
  assert.equal(requiredTheftPch(25),50);
  assert.equal(requiredTheftPch(50),100);
  assert.equal(requiredTheftPch(100),200);
  assert.equal(requiredTheftPch(0),0);
  assert.throws(()=>requiredTheftPch(-1));
});
test("configuración de duración, capacidad y fidelidad debe ser válida",()=>{
  assert.equal(validateTheftEffect({type:"STEAL_SKILL",value:100,stealDurationTurns:3,stealCapacity:1,stealFidelityPercent:100}),null);
  assert.match(validateTheftEffect({type:"STEAL_SKILL",value:0})??"",/Capacidad/);
  assert.match(validateTheftEffect({type:"STEAL_SKILL",value:100,stealDurationTurns:0})??"",/Duración/);
  assert.match(validateTheftEffect({type:"STEAL_SKILL",value:100,stealCapacity:0})??"",/Capacidad/);
  assert.match(validateTheftEffect({type:"STEAL_SKILL",value:100,stealFidelityPercent:110})??"",/Fidelidad/);
});
