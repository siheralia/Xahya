/** Training NPC identity: all active native racial perks plus exactly three extra catalog perks. */
export type TrainingPerkEffect = {type:string;target:string;value:number};
export type TrainingPerk = {
 id:number;name:string;effects:TrainingPerkEffect[];
 /** False when a racial perk has mechanics the current combat engine cannot resolve. */
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
type PerkRow={id:number;name:string;active:boolean;effects:unknown};

/** Entire perk must be interpretable, not an unsupported action silently ignored. */
function parsedCombatEffects(value:unknown):TrainingPerkEffect[]|null {
 if(!Array.isArray(value)||value.length<1)return null;
 const effects:TrainingPerkEffect[]=[];
 for(const raw of value) {
  if(!raw||typeof raw!=="object")return null;
  const e=raw as Record<string,unknown>;
  const type=String(e.type??""),target=String(e.target??"");
  const num=e.value;
  if(typeof num!=="number"||!Number.isFinite(num)||Math.abs(num)>1000)return null;
  if(!(type==="STAT_BONUS"&&validTargets.has(target)) &&
     !(type==="RESOURCE_BONUS"&&["HP","MANA"].includes(target)&&num>=0))return null;
  effects.push({type,target,value:num});
 }
 return effects;
}
function toTrainingPerk(row:PerkRow):TrainingPerk {
 const supported=parsedCombatEffects(row.effects);
 return {id:row.id,name:row.name,effects:supported??[],mechanical:supported!==null};
}
/**
 * Every active perk linked to the selected race is intrinsic. Extra perks are
 * drawn separately from active, combat-compatible catalog entries not already
 * granted by that race. Their IDs cannot overlap, even for races with 3+ perks.
 * Unsupported intrinsic effects remain visible but grant no invented mechanics.
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
 const inherited=new Set(racialPerks.map(p=>p.id));
 const available=[...perkById.values()].filter(p=>!inherited.has(p.id)&&parsedCombatEffects(p.effects)!==null);
 if(available.length<3)
  throw new Error("El catálogo necesita tres perks adicionales activos y compatibles.");
 const extraPerks:TrainingPerk[]=[];
 for(let i=0;i<3;i++) {
  const chosen=available.splice(index(available.length,random),1)[0];
  extraPerks.push(toTrainingPerk(chosen));
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
