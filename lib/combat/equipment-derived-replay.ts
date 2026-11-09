/**
 * Exact combat-only replay of configured DERIVED-stat equipment factors.
 *
 * The server has already resolved the configured basic -> derived graph. The
 * resulting unmodified derived values and the exact existing modifier lists
 * are captured at encounter creation. Replaying a change in armor/accessory
 * durability recomputes the additive-factor formula, never an inverse or an
 * approximation. This version deliberately DOES NOT recompute basic-stat
 * effects, HP/Mana maxima, or arbitrary configurable formula dependencies.
 */
import {WEARABLE_DIRECT_COMBAT_STATS,type WearableDirectCombatStat}
 from "./wearable-stat-bonus.ts";
import type {CombatFighter} from "./turn-engine.ts";
import type {CombatWearable} from "../items/combat-wearables.ts";

type StatKey=WearableDirectCombatStat;
export type DerivedCopyEffect={
 type:string;stat:string;value:number;
};
export type DerivedWearableCopy={
 characterItemId:number;itemId:number;effects:readonly DerivedCopyEffect[];
};
type Totals={factorSum:number;factorCount:number;flat:number};
type Formula=Totals&{raw:number;mechanic:number};
type Contribution={characterItemId:number;itemId:number;
 stats:Partial<Record<StatKey,Totals>>;attackTotalFactors:number[]};
export type EquipmentDerivedReplay={
 formulas:Partial<Record<StatKey,Formula>>;
 otherAttackFactorSum:number;otherAttackFactorCount:number;
 copies:Contribution[];
 applied:Partial<Record<StatKey,number>>;
};

const keys=WEARABLE_DIRECT_COMBAT_STATS;
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
const empty=():Totals=>({factorSum:0,factorCount:0,flat:0});
const amount=(value:unknown)=>typeof value==="number"&&Number.isFinite(value);
const validCopy=(c:DerivedWearableCopy)=>
 Number.isSafeInteger(c.characterItemId)&&c.characterItemId>0&&
 Number.isSafeInteger(c.itemId)&&c.itemId>0;

export function buildEquipmentDerivedReplay(input:{
 unmodifiedDerived:Readonly<Record<string,number>>;
 currentDerived:Readonly<Record<string,number>>;
 derivedModifiers:Readonly<Record<string,{factors:readonly number[];bonus:number}>>;
 attackFactors:readonly number[];
 mechanicByStat:Readonly<Record<string,number>>;
 activeDerivedAliases:Readonly<Record<string,string>>;
 copies:readonly DerivedWearableCopy[];
}):EquipmentDerivedReplay|null{
 const seen=new Set<number>();
 const contributions:Contribution[]=[];
 const extracted:Partial<Record<StatKey,Totals>>={};
 const allKeys=new Set<string>(keys);
 const extractedAttacks:number[]=[];
 for(const copy of input.copies){
  if(!validCopy(copy)||seen.has(copy.characterItemId))return null;
  seen.add(copy.characterItemId);
  const result:Contribution={characterItemId:copy.characterItemId,itemId:copy.itemId,
   stats:{},attackTotalFactors:[]};
  for(const effect of copy.effects){
   if(!effect||!amount(effect.value))continue;
   if(effect.type!=="stat_bonus"&&effect.type!=="stat_multiplier")continue;
   if(effect.stat==="ATTACK_TOTAL"&&effect.type==="stat_multiplier"){
    result.attackTotalFactors.push(effect.value);
    extractedAttacks.push(effect.value);
    continue;
   }
   const key=input.activeDerivedAliases[effect.stat]??
     input.activeDerivedAliases[effect.stat.toUpperCase()];
   if(!allKeys.has(key))continue;
   const stat=key as StatKey;
   const perCopy=result.stats[stat]??empty();
   const total=extracted[stat]??empty();
   if(effect.type==="stat_bonus"){
    perCopy.flat+=effect.value;total.flat+=effect.value;
   }else{
    perCopy.factorSum+=effect.value;perCopy.factorCount++;
    total.factorSum+=effect.value;total.factorCount++;
   }
   result.stats[stat]=perCopy;extracted[stat]=total;
  }
  contributions.push(result);
 }
 if(input.attackFactors.some(v=>!amount(v)))return null;
 const otherAttackFactorCount=input.attackFactors.length-extractedAttacks.length;
 const otherAttackFactorSum=input.attackFactors.reduce((a,b)=>a+b,0)-
  extractedAttacks.reduce((a,b)=>a+b,0);
 if(otherAttackFactorCount<0||!Number.isFinite(otherAttackFactorSum))return null;
 const formulas:Partial<Record<StatKey,Formula>>={};
 for(const key of keys){
  const raw=input.unmodifiedDerived[key];
  const current=input.currentDerived[key];
  // Some installations disable custom stats. Never invent a non-existent
  // derived stat just because an item once named it.
  if(!amount(raw)||!amount(current))continue;
  const source=input.derivedModifiers[key]??{factors:[],bonus:0};
  const taken=extracted[key]??empty();
  const factorCount=source.factors.length-taken.factorCount;
  const factorSum=source.factors.reduce((a,b)=>a+b,0)-taken.factorSum;
  const flat=source.bonus-taken.flat;
  const mechanic=input.mechanicByStat[key]??1;
  if(factorCount<0||![raw,current,factorSum,flat,mechanic].every(Number.isFinite)||
   !source.factors.every(Number.isFinite))return null;
  formulas[key]={raw,factorSum,factorCount,flat,mechanic};
 }
 const candidate:EquipmentDerivedReplay={
  formulas,otherAttackFactorSum,otherAttackFactorCount,
  copies:contributions,applied:{},
 };
 const initial=evaluateEquipmentDerived(candidate,new Set(contributions.map(c=>c.characterItemId)));
 for(const key of keys){
  if(!(key in formulas))continue;
  // Fail closed if unusual legacy math cannot be reproduced precisely.
  if(!near(initial[key]!,input.currentDerived[key]))return null;
 }
 candidate.applied=initial;
 return candidate;
}

/** Exactly reproduces Xahya's rule: item/perk multipliers add (×2+×3=×5).
 * If no multiplier is present, default to ×1, not ×0.
 */
export function evaluateEquipmentDerived(
 model:EquipmentDerivedReplay,active:ReadonlySet<number>
):Partial<Record<StatKey,number>>{
 const values:Partial<Record<StatKey,number>>={};
 let attackSum=model.otherAttackFactorSum;
 let attackCount=model.otherAttackFactorCount;
 for(const copy of model.copies){
  if(!active.has(copy.characterItemId))continue;
  attackSum+=copy.attackTotalFactors.reduce((a,b)=>a+b,0);
  attackCount+=copy.attackTotalFactors.length;
 }
 const attackFactor=attackCount>0?attackSum:1;
 for(const key of keys){
  const formula=model.formulas[key];if(!formula)continue;
  let factorSum=formula.factorSum,factorCount=formula.factorCount;
  let flat=formula.flat;
  for(const copy of model.copies){
   if(!active.has(copy.characterItemId))continue;
   const m=copy.stats[key];if(!m)continue;
   factorSum+=m.factorSum;factorCount+=m.factorCount;flat+=m.flat;
  }
  const result=(formula.raw*(factorCount>0?factorSum:1)+flat)*
   formula.mechanic*((key==="physicalAttack"||key==="magicAttack")?attackFactor:1);
  if(!Number.isFinite(result))return {};
  values[key]=result;
 }
 return values;
}

/** Update only the equipment component; keep encounter bonuses, statuses and
 * skill effects already applied to the current fighter unchanged.
 * Returns the actual deltas for narration, without double application.
 */
export function reconcileEquipmentDerived(
 fighter:CombatFighter,wearables:readonly CombatWearable[]
):Partial<Record<StatKey,number>>{
 const model=fighter.equipmentDerivedReplay;
 if(!model)return {};
 const matched=new Map(wearables.map(w=>[w.characterItemId,w]));
 const active=new Set<number>();
 for(const copy of model.copies){
  const item=matched.get(copy.characterItemId);
  if(item&&item.itemId===copy.itemId&&item.durability>0)active.add(copy.characterItemId);
 }
 const next=evaluateEquipmentDerived(model,active);
 const changes:Partial<Record<StatKey,number>>={};
 for(const key of keys){
  if(!(key in model.applied))continue;
  const old=model.applied[key],newValue=next[key];
  if(typeof old!=="number"||typeof newValue!=="number"||
   !Number.isFinite(newValue))continue;
  const delta=newValue-old;
  if(near(delta,0))continue;
  fighter[key]=Math.max(0,fighter[key]+delta);
  changes[key]=delta;
 }
 model.applied=next;
 return changes;
}
