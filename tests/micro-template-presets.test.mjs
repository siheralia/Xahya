import test from "node:test";
import assert from "node:assert/strict";
import {GLORIA_MICRO_PRESETS} from "../lib/effects/micro-template-presets.ts";
import {validateEffectContainers,executeMicroEvent,emptyMicroState,chargeCount,totalStored} from "../lib/effects/micro-modules.ts";

const effects=GLORIA_MICRO_PRESETS.map(t=>t.effect);
const ctx=(eventId,trigger,other={})=>({eventId,trigger,ownerId:17,stats:{HP:40,MAX_HP:100,STR:40},...other});
test("all editable Gloria example templates are valid and retain unique IDs",()=>{
  assert.equal(validateEffectContainers(effects),null);
  assert.equal(new Set(effects.map(e=>e.id)).size,effects.length);
});
test("Gloria examples reproduce stored resistance, turn regen, and direct attack consumption",()=>{
  const start=emptyMicroState();
  assert.deepEqual(executeMicroEvent(start,effects,ctx("passive","PASSIVE")).intents,
    [{kind:"MODIFIER",stat:"RESISTANCE",multiplier:1.3}]);
  const stored=executeMicroEvent(start,effects,ctx("hit","DAMAGE_RESOLVED",{event:{MITIGATED_DAMAGE:17}}));
  assert.equal(chargeCount(stored.state,17,"DIVINE_GRACE"),1);
  assert.deepEqual(executeMicroEvent(stored.state,effects,ctx("turn","TURN_START")).intents,
    [{kind:"HEAL",requested:10,applied:10}]);
  assert.deepEqual(executeMicroEvent(stored.state,effects,ctx("passive2","PASSIVE")).intents,[]);
  const hit=executeMicroEvent(stored.state,effects,ctx("direct","IMPACT",{impactKind:"CHARACTER"}));
  assert.deepEqual(hit.intents,[
    {kind:"DAMAGE",amount:140,channel:"PHYSICAL",element:undefined,radiusMeters:undefined},
    {kind:"DAMAGE",amount:17,channel:"MAGICAL",element:"LIGHT",radiusMeters:undefined},
  ]);
  assert.equal(totalStored(hit.state,17,"DIVINE_GRACE"),0);
});
test("ground impact has strength-derived area and shares the same reserve",()=>{
  const stored=executeMicroEvent(emptyMicroState(),effects,ctx("hit","DAMAGE_RESOLVED",{event:{MITIGATED_DAMAGE:64}}));
  const impact=executeMicroEvent(stored.state,effects,ctx("ground","IMPACT",{impactKind:"GROUND"}));
  assert.deepEqual(impact.intents,[
    {kind:"DAMAGE",amount:64,channel:"MAGICAL",element:"LIGHT",radiusMeters:5},
  ]);
  assert.equal(totalStored(impact.state,17,"DIVINE_GRACE"),0);
});
