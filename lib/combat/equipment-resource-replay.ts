/**
 * Reversible, server-only HP/mana *capacity* contributions from equipped
 * ARMOR/ACCESSORY copies. The same configured derived arithmetic is captured
 * at duel creation; durability changes never infer capacity by dividing the
 * character's current resource bars.
 *
 * Perks with RESOURCE_BONUS are applied before derived multipliers. Persist
 * those external offsets separately so they survive armor breakage.
 */
import type {DerivedWearableCopy} from "./equipment-derived-replay.ts";

export type ResourceKey="maxHp"|"maxMana";
type Totals={sum:number;count:number;flat:number};
type ResourceFormula=Totals&{raw:number;external:number;mechanic:number};
type ResourceCopy={characterItemId:number;itemId:number;
 stats:Partial<Record<ResourceKey,Totals>>};
export type EquipmentResourceReplay={
 formulas:Partial<Record<ResourceKey,ResourceFormula>>;
 copies:ResourceCopy[];
 applied:Partial<Record<ResourceKey,number>>;
};
const keys=["maxHp","maxMana"] as const;
const empty=():Totals=>({sum:0,count:0,flat:0});
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));

export function resourceCapacity(value:number,key:ResourceKey):number {
 return Math.max(key==="maxHp"?1:0,Math.floor(value));
}

export function buildEquipmentResourceReplay(input:{
 unmodifiedDerived:Readonly<Record<string,number>>;
 currentDerived:Readonly<Record<string,number>>;
 derivedModifiers:Readonly<Record<string,{factors:readonly number[];bonus:number}>>;
 externalResourceBonuses:Readonly<Partial<Record<ResourceKey,number>>>;
 mechanicByStat:Readonly<Record<string,number>>;
 activeDerivedAliases:Readonly<Record<string,string>>;
 copies:readonly DerivedWearableCopy[];
}):EquipmentResourceReplay|null{
 const totals:Partial<Record<ResourceKey,Totals>>={};
 const copies:ResourceCopy[]=[];
 const seen=new Set<number>();
 for(const copy of input.copies){
  if(!Number.isSafeInteger(copy.characterItemId)||copy.characterItemId<1||
   !Number.isSafeInteger(copy.itemId)||copy.itemId<1||
   seen.has(copy.characterItemId))return null;
  seen.add(copy.characterItemId);
  const perCopy:ResourceCopy={characterItemId:copy.characterItemId,
   itemId:copy.itemId,stats:{}};
  for(const effect of copy.effects){
   if(!effect||!finite(effect.value)||
    (effect.type!=="stat_bonus"&&effect.type!=="stat_multiplier"))continue;
   const key=input.activeDerivedAliases[effect.stat];
   if(key!=="maxHp"&&key!=="maxMana")continue;
   const one=perCopy.stats[key]??empty();
   const sum=totals[key]??empty();
   if(effect.type==="stat_bonus"){
    one.flat+=effect.value;sum.flat+=effect.value;
   }else{
    one.sum+=effect.value;one.count++;
    sum.sum+=effect.value;sum.count++;
   }
   perCopy.stats[key]=one;
   totals[key]=sum;
  }
  copies.push(perCopy);
 }
 const formulas:EquipmentResourceReplay["formulas"]={};
 for(const key of keys){
  const raw=input.unmodifiedDerived[key],current=input.currentDerived[key];
  if(!finite(raw)||!finite(current))continue;
  const source=input.derivedModifiers[key]??{factors:[],bonus:0};
  const used=totals[key]??empty();
  const external=input.externalResourceBonuses[key]??0;
  const mechanic=input.mechanicByStat[key]??1;
  const factorCount=source.factors.length-used.count;
  const factorSum=source.factors.reduce((s,n)=>s+n,0)-used.sum;
  const flat=source.bonus-used.flat;
  if(factorCount<0||![external,mechanic,factorSum,flat].every(finite)||
    source.factors.some(v=>!finite(v)))return null;
  formulas[key]={raw,external,mechanic,count:factorCount,sum:factorSum,flat};
 }
 if(!Object.keys(formulas).length)return null;
 const model:EquipmentResourceReplay={formulas,copies,applied:{}};
 const initial=evaluateEquipmentResources(model,seen);
 for(const key of keys){
  if(!formulas[key])continue;
  if(!finite(initial[key])||!near(initial[key],input.currentDerived[key]))
   return null;
 }
 model.applied=initial;
 return model;
}

/** Reuses the additivity convention for item/perk derived multipliers.
 * When basic stats change, rawDerived is the result from the exact frozen
 * configurable formula graph, before resource perk offsets.
 */
export function evaluateEquipmentResources(
 model:EquipmentResourceReplay,active:ReadonlySet<number>,
 rawDerived?:Readonly<Record<string,number>>
):Partial<Record<ResourceKey,number>>{
 const values:Partial<Record<ResourceKey,number>>={};
 for(const key of keys){
  const formula=model.formulas[key];
  if(!formula)continue;
  const raw=rawDerived?.[key]??formula.raw;
  if(!finite(raw))return {};
  let sum=formula.sum,count=formula.count,flat=formula.flat;
  for(const item of model.copies){
   if(!active.has(item.characterItemId))continue;
   const effect=item.stats[key];if(!effect)continue;
   sum+=effect.sum;count+=effect.count;flat+=effect.flat;
  }
  const output=((raw+formula.external)*(count?sum:1)+flat)*formula.mechanic;
  if(!finite(output))return {};
  values[key]=output;
 }
 return values;
}

/** Compute *integer* capacity deltas, not raw fractional formula differences.
 * Caller applies changes to the encounter pools without increasing current HP
 * or mana; this function never writes combat resources on its own.
 */
export function changedResourceCapacities(
 model:EquipmentResourceReplay,next:Partial<Record<ResourceKey,number>>
):Partial<Record<ResourceKey,number>>|null{
 const changes:Partial<Record<ResourceKey,number>>={};
 for(const key of keys){
  if(!model.formulas[key])continue;
  const before=model.applied[key],after=next[key];
  if(!finite(before)||!finite(after))return null;
  const delta=resourceCapacity(after,key)-resourceCapacity(before,key);
  if(delta)changes[key]=delta;
 }
 return changes;
}
