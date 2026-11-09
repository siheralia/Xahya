/**
 * Immutable, server-authorized snapshot of the *basic* stat calculation.
 * Xahya adds item/perk/passive factors (x2 + x3 => x5), then adds flat
 * bonuses and karma, then applies the environmental mechanic multiplier.
 *
 * This is not a reverse calculation from the final fighter value. All
 * contributors are captured as they are computed in the effective resolver.
 * Only real ARMOR/ACCESSORY inventory copies with quantity=1 participate.
 */
import {calculateConfiguredDerivedSnapshot,type SnapshotStatDefinition} from "../stats/configured-derived-pure.ts";
import type {DerivedWearableCopy} from "./equipment-derived-replay.ts";

export type BasicFormulaInput={
 original:number;modifier:number;flat:number;factors:readonly number[];mechanic:number;
};
export type BasicFactors={
 bonus:number;factorSum:number;factorCount:number;
};
export type EquipmentBasicCopy={
 characterItemId:number;itemId:number;
 stats:Record<string,BasicFactors>;
};
export type EquipmentBasicReplay={
 formulas:Record<string,{
  original:number;modifier:number;otherFlat:number;
  otherFactorSum:number;otherFactorCount:number;mechanic:number;
 }>;
 copies:EquipmentBasicCopy[];
 catalog:SnapshotStatDefinition[];
 applied:Record<string,number>;
 /** The mechanics-configured speed stat, not necessarily AGI. */
 speedKey?:string;
};
const close=(a:number,b:number)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
const empty=():BasicFactors=>({bonus:0,factorSum:0,factorCount:0});

export function evaluateEquipmentBasic(
 model:EquipmentBasicReplay,active:ReadonlySet<number>
):Record<string,number>{
 const result:Record<string,number>={};
 for(const [key,formula] of Object.entries(model.formulas)){
  let sum=formula.otherFactorSum,count=formula.otherFactorCount,flat=formula.otherFlat;
  for(const copy of model.copies){
   if(!active.has(copy.characterItemId))continue;
   const stat=copy.stats[key];if(!stat)continue;
   sum+=stat.factorSum;
   count+=stat.factorCount;
   flat+=stat.bonus;
  }
  const value=(formula.original*formula.modifier*(count>0?sum:1)+flat)*
   formula.mechanic;
  if(!Number.isFinite(value))return {};
  result[key]=value;
 }
 return result;
}

/** Build only when every initial stat is reproducible with the live resolver.
 * Unknown or duplicate inventory copies deliberately fail closed.
 */
export function buildEquipmentBasicReplay(input:{
 source:Readonly<Record<string,BasicFormulaInput>>;
 currentBasic:Readonly<Record<string,number>>;
 catalog:readonly SnapshotStatDefinition[];
 codeByKey:Readonly<Record<string,string>>;
 wearableCopies:readonly DerivedWearableCopy[];
}):EquipmentBasicReplay|null{
 const keys=Object.keys(input.source);
 if(keys.length===0)return null;
 const totals:Record<string,BasicFactors>={};
 const copied:EquipmentBasicCopy[]=[];
 const seen=new Set<number>();
 let any=false;
 for(const copy of input.wearableCopies){
  if(!Number.isSafeInteger(copy.characterItemId)||copy.characterItemId<=0||
     !Number.isSafeInteger(copy.itemId)||copy.itemId<=0||
     seen.has(copy.characterItemId))return null;
  seen.add(copy.characterItemId);
  const stats:Record<string,BasicFactors>={};
  for(const effect of copy.effects){
   if(!effect||!Number.isFinite(effect.value)||
     (effect.type!=="stat_bonus"&&effect.type!=="stat_multiplier"))continue;
   for(const key of keys){
    if(effect.stat!==key&&effect.stat!==input.codeByKey[key])continue;
    const one=stats[key]??empty();
    const sum=totals[key]??empty();
    if(effect.type==="stat_bonus"){one.bonus+=effect.value;sum.bonus+=effect.value;}
    else{one.factorSum+=effect.value;one.factorCount++;sum.factorSum+=effect.value;sum.factorCount++;}
    stats[key]=one;
    totals[key]=sum;
    any=true;
   }
  }
  copied.push({characterItemId:copy.characterItemId,itemId:copy.itemId,stats});
 }
 // If none of the item's effects changes a basic stat, keep #208's
 // derived-only model instead of storing a redundant second snapshot.
 if(!any)return null;
 const formulas:EquipmentBasicReplay["formulas"]={};
 for(const [key,raw] of Object.entries(input.source)){
  const used=totals[key]??empty();
  const factorCount=raw.factors.length-used.factorCount;
  const factorSum=raw.factors.reduce((sum,n)=>sum+n,0)-used.factorSum;
  const otherFlat=raw.flat-used.bonus;
  if(factorCount<0||![raw.original,raw.modifier,raw.flat,raw.mechanic,
    factorSum,otherFlat].every(Number.isFinite)||
    raw.factors.some(n=>!Number.isFinite(n)))return null;
  formulas[key]={
   original:raw.original,modifier:raw.modifier,otherFlat,
   otherFactorSum:factorSum,otherFactorCount:factorCount,
   mechanic:raw.mechanic,
  };
 }
 const replay:EquipmentBasicReplay={
  formulas,copies:copied,catalog:input.catalog.map(c=>({...c})),applied:{},
 };
 const initial=evaluateEquipmentBasic(replay,seen);
 for(const key of keys){
  if(!Number.isFinite(initial[key])||!Number.isFinite(input.currentBasic[key])||
     !close(initial[key],input.currentBasic[key]))return null;
 }
 // Validate configured formulas against the same snapshot the source
 // evaluator sees, before accepting this basic model.
 try{
  const derived=calculateConfiguredDerivedSnapshot(initial as any,replay.catalog);
  if(!Object.values(derived).every(n=>Number.isFinite(n)))return null;
 }catch{return null;}
 replay.applied=initial;
 return replay;
}
