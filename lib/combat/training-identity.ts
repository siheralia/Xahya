import { parseDamagePerkEffect } from "./innate-traits.ts";

/** Training NPC identity: all active native racial perks plus exactly three extra catalog perks. */
export type TrainingPerkEffect = {type:string;target:string;value:number};
export type TrainingPerk = {
 id:number;name:string;effects:TrainingPerkEffect[];
 /** False when this perk has mechanics the combat engine cannot resolve. */
 mechanical:boolean;
};
export type TrainingRace = {id:number;name:string};
export type TrainingIdentity = {race:TrainingRace;racialPerks:TrainingPerk[];extraPerks:TrainingPerk[]};
export const TRAINING_BASE_PERK_KEYS:Record<string,string>={
 STR:"strength",AGI:"agility",CON:"constitution",INT:"intelligence",
 WIS:"wisdom",CHA:"charisma",SPI:"spirit",LUCK:"luck",
};
export const TRAINING_DERIVED_PERK_KEYS:Record<string,string>={
 PHYSICAL_ATTACK:"physicalAttack",MAGIC_ATTACK:"magicAttack",
 PHYSICAL_DEFENSE:"physicalDefense",MAGIC_DEFENSE:"magicDefense",
 PRECISION:"precision",DODGE:"dodge",CRITICAL:"critical",RACE:"race",
};
const validTargets=new Set([...Object.keys(TRAINING_BASE_PERK_KEYS),...Object.keys(TRAINING_DERIVED_PERK_KEYS)]);
const index=(length:number,random:()=>number)=>
 Math.min(length-1,Math.floor(Math.max(0,Math.min(0.999999,random()))*length));
type PerkRow={id:number;name:string;active:boolean;probability:unknown;effects:unknown};

function weightedIndex(items:readonly {weight:number}[],random:()=>number):number {
 const total=items.reduce((sum,item)=>sum+item.weight,0);
 let roll=Math.max(0,Math.min(0.9999999999999999,random()))*total;
 for(let i=0;i<items.length;i++) {
  roll-=items[i].weight;
  if(roll<0)return i;
 }
 return items.length-1;
}

/** Keep combat-compatible effects even if a perk also has maze or narrative effects. */
function parsedCombatEffects(value:unknown):TrainingPerkEffect[]|null {
 if(!Array.isArray(value)||value.length<1)return null;
 const effects:TrainingPerkEffect[]=[];
 for(const raw of value) {
  if(!raw||typeof raw!=="object")continue;
  const e=raw as Record<string,unknown>;
  const type=String(e.type??""),target=String(e.target??"");
  const num=e.value;
  if(typeof num!=="number"||!Number.isFinite(num)||Math.abs(num)>1000)continue;
  if(type==="STAT_BONUS"&&validTargets.has(target)) {
   effects.push({type,target,value:num});
  } else if(type==="RESOURCE_BONUS"&&["HP","MANA"].includes(target)&&num>=0) {
   effects.push({type,target,value:num});
  } else {
   const damage=parseDamagePerkEffect(raw);
   if(damage)effects.push(damage);
  }
 }
 return effects.length?effects:null;
}
function toTrainingPerk(row:PerkRow):TrainingPerk {
 const supported=parsedCombatEffects(row.effects);
 return {id:row.id,name:row.name,effects:supported??[],mechanical:supported!==null};
}
/**
 * All active perks linked to this NPC's race are innate, even at 0% probability.
 * The 3 extras are drawn WITHOUT replacement from active, nonempty catalog
 * perks with probability > 0% that are not linked to ANY race. The probability
 * field supplies each extra's relative draw weight; "Nada" is not a perk.
 * Effects that are not supported in combat remain visible, not fabricated.
 */
export function selectTrainingIdentity(
 races:readonly {id:number;name:string;active:boolean}[],
 perks:readonly PerkRow[],
 links:readonly {raceId:number;perkId:number}[],random:()=>number,
):TrainingIdentity {
 const validRaces=races.filter(r=>r.active&&Number.isSafeInteger(r.id)&&r.id>0);
 if(!validRaces.length)throw new Error("No hay razas activas para los NPC.");
 const race=validRaces[index(validRaces.length,random)];
 const perkById=new Map(perks.filter(p=>p.active&&Number.isSafeInteger(p.id)&&p.id>0)
  .map(p=>[p.id,p] as const));
 const racialIds=[...new Set(links.filter(l=>l.raceId===race.id).map(l=>l.perkId))];
 const racialPerks=racialIds.flatMap(id=>{
  const perk=perkById.get(id);
  return perk?[toTrainingPerk(perk)]:[];
 });
 // Exclude perks belonging to ANY race, not just the selected one. Otherwise
 // a Sombrío can receive a racial perk of Enano as a supposedly general extra.
 const allRacialIds=new Set(links.map(l=>l.perkId));
 const available=[...perkById.values()].flatMap(p=>{
  const weight=Number(p.probability);
  if(allRacialIds.has(p.id)||!Number.isFinite(weight)||weight<=0||weight>100||
     !Array.isArray(p.effects)||p.effects.length===0)return [];
  return [{perk:p,weight}];
 });
 if(available.length<3)
  throw new Error("El catálogo necesita tres perks generales activos con probabilidad mayor que 0%.");
 const extraPerks:TrainingPerk[]=[];
 for(let i=0;i<3;i++) {
  const drawn=available.splice(weightedIndex(available,random),1)[0];
  extraPerks.push(toTrainingPerk(drawn.perk));
 }
 return {race:{id:race.id,name:race.name},racialPerks,extraPerks};
}
export function allTrainingPerks(identity:TrainingIdentity):TrainingPerk[] {
 return [...identity.racialPerks,...identity.extraPerks];
}
export function applyTrainingBasePerks<T extends Record<string,number>>(base:T,perks:readonly TrainingPerk[]):T {
 const result:Record<string,number>={...base};
 for(const perk of perks)for(const e of perk.effects){
  const key=TRAINING_BASE_PERK_KEYS[e.target];
  if(e.type==="STAT_BONUS"&&key&&Number.isFinite(result[key]))
   result[key]=Math.max(1,result[key]+e.value);
 }
 return result as T;
}
export function applyTrainingDerivedPerks<T extends object>(fighter:T,perks:readonly TrainingPerk[]):T {
 const result={...fighter} as Record<string,unknown>;
 for(const perk of perks)for(const e of perk.effects){
  const key=TRAINING_DERIVED_PERK_KEYS[e.target],old=result[key];
  if(e.type==="STAT_BONUS"&&key&&typeof old==="number"&&Number.isFinite(old))
   result[key]=Math.max(0,old+e.value);
 }
 return result as T;
}
/** Character-resource perks are encounter-local; currencies and inventory are never credited. */
export function trainingResourceBonus(perks:readonly TrainingPerk[],target:"HP"|"MANA"):number {
 return perks.reduce((total,perk)=>total+perk.effects.reduce((sum,e)=>
  sum+(e.type==="RESOURCE_BONUS"&&e.target===target?e.value:0),0),0);
}
