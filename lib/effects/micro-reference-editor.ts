import type {NumericExpr} from "./micro-modules.ts";
import {MICRO_REFERENCE_SUGGESTIONS} from "./micro-labels.ts";

export type NumericReferenceSource = "EVENT"|"STAT"|"CHARGES"|"STORED_TOTAL"|"OUTPUT";
const validOutputKey=/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

/** A consumer can reference only actual, named outputs from earlier steps. */
export function selectablePreviousOutputs(outputs:readonly string[]):string[] {
  return [...new Set(outputs.filter(key=>typeof key==="string"&&validOutputKey.test(key)))];
}

/** Changing the source must also change its key. Carrying MAX_HP over into
 * OUTPUT created a dangling reference and left the visual editor in an invalid
 * state. Return null when the user requests a producer that does not exist.
 */
export function changeNumericReferenceSource(
  value:NumericExpr,nextSource:NumericReferenceSource,outputs:readonly string[],
):NumericExpr|null {
  if(typeof value==="number"||!value||!("source" in value))return null;
  if(!["EVENT","STAT","CHARGES","STORED_TOTAL","OUTPUT"].includes(nextSource))return null;
  if(nextSource==="OUTPUT"){
    const available=selectablePreviousOutputs(outputs);
    if(available.length===0)return null;
    return {source:"OUTPUT",key:value.source==="OUTPUT"&&available.includes(value.key)?value.key:available[0]};
  }
  if(value.source===nextSource && typeof value.key==="string" && value.key.length>0)
    return {source:nextSource,key:value.key};
  const suggestion=MICRO_REFERENCE_SUGGESTIONS[nextSource]?.[0];
  return {source:nextSource,key:suggestion??"ENERGY"};
}

/** Used by the editor to explain stale legacy links rather than crash/hide. */
export function invalidPreviousOutput(
  value:NumericExpr,outputs:readonly string[],
):boolean {
  return typeof value!=="number"&&Boolean(value)&&"source" in value&&
    value.source==="OUTPUT"&&!selectablePreviousOutputs(outputs).includes(value.key);
}
