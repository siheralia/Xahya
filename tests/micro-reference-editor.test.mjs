import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateEffectContainers} from "../lib/effects/micro-modules.ts";
import {changeNumericReferenceSource,invalidPreviousOutput,selectablePreviousOutputs}
  from "../lib/effects/micro-reference-editor.ts";

const effect=steps=>({id:"MICRO_REFERENCE_REGRESSION",name:"Daño con fuente previa",
  type:"COMPOSED",description:"",trigger:"IMPACT",steps});

test("regression: selecting another module for damage replaces the stale MAX_HP key",()=>{
 const previous={source:"STAT",key:"MAX_HP"};
 const output=changeNumericReferenceSource(previous,"OUTPUT",["attackAmount"]);
 assert.deepEqual(output,{source:"OUTPUT",key:"attackAmount"});
 assert.deepEqual(previous,{source:"STAT",key:"MAX_HP"},"source value is immutable");
 assert.equal(validateEffectContainers([effect([
  {kind:"CALCULATE",output:"attackAmount",expression:10},
  {kind:"DAMAGE",amount:output,channel:"MAGICAL"}
 ])]),null);
});

test("first node cannot select another module without an earlier producer",()=>{
 const previous={source:"STAT",key:"MAX_HP"};
 assert.equal(changeNumericReferenceSource(previous,"OUTPUT",[]),null);
 assert.equal(invalidPreviousOutput({source:"OUTPUT",key:"MAX_HP"},[]),true);
 assert.match(validateEffectContainers([effect([
   {kind:"DAMAGE",amount:{source:"OUTPUT",key:"MAX_HP"},channel:"MAGICAL"}
 ])]),/productor anterior/);
});

test("switching sources initializes a matching key, not the previous stat key",()=>{
 const original={source:"STAT",key:"MAX_HP"};
 assert.deepEqual(changeNumericReferenceSource(original,"EVENT",[]),{source:"EVENT",key:"MITIGATED_DAMAGE"});
 assert.deepEqual(changeNumericReferenceSource(original,"CHARGES",[]),{source:"CHARGES",key:"ENERGY"});
 assert.deepEqual(changeNumericReferenceSource(original,"STORED_TOTAL",[]),{source:"STORED_TOTAL",key:"ENERGY"});
 assert.deepEqual(changeNumericReferenceSource({source:"EVENT",key:"INCOMING_DAMAGE"},"STAT",[]),
  {source:"STAT",key:"STR"});
 assert.deepEqual(changeNumericReferenceSource(original,"STAT",[]),original);
});

test("only valid previous outputs are selectable, preserving real selections",()=>{
 assert.deepEqual(selectablePreviousOutputs(["","missing spaces","valid","valid",null,"good_key"]),
  ["valid","good_key"]);
 assert.deepEqual(changeNumericReferenceSource({source:"OUTPUT",key:"good_key"},"OUTPUT",["valid","good_key"]),
  {source:"OUTPUT",key:"good_key"});
 assert.equal(invalidPreviousOutput({source:"OUTPUT",key:"legacyRemoved"},["valid"]),true);
 assert.equal(invalidPreviousOutput({source:"OUTPUT",key:"valid"},["valid"]),false);
 assert.deepEqual(changeNumericReferenceSource({source:"OUTPUT",key:"legacyRemoved"},"OUTPUT",["valid"]),
  {source:"OUTPUT",key:"valid"});
});

test("editor offers recovery rather than crashing for incomplete saved references",()=>{
 const builder=readFileSync(new URL("../components/effects/MicroEffectBuilder.tsx",import.meta.url),"utf8");
 const flow=readFileSync(new URL("../components/effects/MicroEffectFlowEditor.tsx",import.meta.url),"utf8");
 assert.match(builder,/changeNumericReferenceSource\(value/);
 assert.match(builder,/source==="OUTPUT"&&validOutputs\.length===0/);
 assert.match(builder,/No existe una salida de un micromódulo anterior/);
 assert.match(builder,/Este valor tiene una referencia incompleta/);
 assert.match(builder,/invalidPreviousOutput/);
 assert.match(flow,/expr===null/);
});
