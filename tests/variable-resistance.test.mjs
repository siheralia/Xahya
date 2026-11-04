import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_VARIABLE_RESISTANCE,calculateVariableResistance,validateVariableResistance,variableResistancePchCost,withResistanceOwners,resistanceBaseOwner,resistanceInputOwner} from "../lib/skills/variable-resistance.ts";
import {validateSkillMechanics} from "../lib/skills/interaction-engine.ts";
import {mechanicsPchCost} from "../lib/skills/mechanics-pricing.ts";

test("no resistance rule is free and remains optional",()=>{
 assert.equal(validateSkillMechanics({}),null);
 assert.equal(mechanicsPchCost({}),0);
 assert.equal(validateSkillMechanics({variableResistance:DEFAULT_VARIABLE_RESISTANCE}),null);
 assert.equal(mechanicsPchCost({variableResistance:DEFAULT_VARIABLE_RESISTANCE}),variableResistancePchCost(DEFAULT_VARIABLE_RESISTANCE));
});
test("newtonian sand reacts to abstract attack speed",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 assert.equal(calculateVariableResistance(c,100,0).resistance,100);
 assert.equal(calculateVariableResistance(c,100,25).resistance,140);
 assert.equal(calculateVariableResistance(c,100,50).resistance,200);
 assert.equal(calculateVariableResistance(c,150,50).resistance,300);
 assert.ok(calculateVariableResistance(c,100,200).multiplier<3);
});
test("formulas are configurable, capped and ordered",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 assert.equal(calculateVariableResistance({...c,formula:"LINEAR",coefficient:.1,maxMultiplier:2},100,20).resistance,200);
 assert.equal(calculateVariableResistance({...c,formula:"DECREASING",coefficient:.1},100,30).resistance,20);
 assert.equal(calculateVariableResistance({...c,formula:"THRESHOLD"},100,49).resistance,100);
 assert.equal(calculateVariableResistance({...c,formula:"THRESHOLD"},100,50).resistance,300);
 assert.equal(calculateVariableResistance({...c,formula:"HITS",input:"HIT_COUNT",coefficient:.5},100,4).resistance,300);
 assert.ok(variableResistancePchCost({...c,maxMultiplier:5})>variableResistancePchCost(c));
 assert.ok(variableResistancePchCost({...c,threshold:10})>variableResistancePchCost(c));
});
test("strict validation prevents script injection and unbounded power",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 assert.match(validateSkillMechanics({variableResistance:{...c,maxMultiplier:100}}),/resistencia/i);
 assert.match(validateVariableResistance({...c,baseStat:"constructor;alert(1)"}),/Estadística/i);
 assert.match(validateVariableResistance({...c,threshold:0}),/Parámetros/i);
 assert.match(validateVariableResistance({...c,input:"HP_PERCENT",formula:"HITS"}),/impactos/i);
 assert.throws(()=>calculateVariableResistance(c,100,Infinity),/finitas/);
});

test("actor attribution is explicit, validated and backward compatible",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 assert.equal(c.baseOwner,"USER");
 assert.equal(c.inputOwner,"OPPONENT");
 assert.equal(resistanceBaseOwner(c),"USER");
 assert.equal(resistanceInputOwner(c),"OPPONENT");
 const old={...c};
 delete old.baseOwner;delete old.inputOwner;
 assert.deepEqual(withResistanceOwners(old),c);
 assert.equal(resistanceInputOwner({...old,input:"HIT_COUNT"}),"USER");
 assert.equal(resistanceInputOwner({...old,input:"HP_PERCENT"}),"USER");
 assert.match(validateVariableResistance({...c,baseOwner:"UNTRUSTED"}),/Origen/);
 assert.match(validateVariableResistance({...c,inputOwner:"SELF"}),/Origen/);
 assert.equal(variableResistancePchCost({...c,baseOwner:"OPPONENT",inputOwner:"USER"}),
   variableResistancePchCost(c),"owner selection does not silently change the PCH formula");
});
