/** Random, encounter-only training NPC race and perk selection from the active catalog. */
export type TrainingPerk = {id:number;name:string;effects:Array<{type:string;target:string;value:number}>};
export type TrainingRace = {id:number;name:string};
export type TrainingIdentity = {race:TrainingRace;perks:TrainingPerk[]};
export const TRAINING_BASE_PERK_KEYS:Record<string,string>={
 STR:"strength",AGI:"agility",CON:"constitution",INT:"intelligence",
 WIS:"wisdom",CHA:"charisma",SPI:"spirit",LUCK:"luck",
};
export const TRAINING_DERIVED_PERK_KEYS:Record<string,string>={
 PHYSICAL_ATTACK:"physicalAttack",MAGIC_ATTACK:"magicAttack",
 PHYSICAL_DEFENSE:"physicalDefense",MAGIC_DEFENSE:"magicDefense",
 PRECISION:"precision",DODGE:"dodge",CRITICAL:"critical",RACE:"race",
};
const allowed = new Set([...Object.keys(TRAINING_BASE_PERK_KEYS),...Object.keys(TRAINING_DERIVED_PERK_KEYS)]);
const index = (length:number,random:()=>number)=>Math.min(length-1,Math.floor(Math.max(0,Math.min(0.999999,random()))*length));
export function selectTrainingIdentity(
 races:readonly {id:number;name:string;active:boolean}[],
 perks:readonly {id:number;name:string;active:boolean;effects:unknown}[],
 links:readonly {raceId:number;perkId:number}[],random:()=>number,
):TrainingIdentity {
 const validRaces=races.filter(r=>r.active&&Number.isSafeInteger(r.id)&&r.id>0);
 const validPerks=perks.filter(p=>p.active&&Number.isSafeInteger(p.id)&&p.id>0&&
  Array.isArray(p.effects)&&p.effects.length>0&&(p.effects as unknown[]).every(e=>{
   if(!e||typeof e!=="object")return false;
   const effect=e as Record<string,unknown>;
   return effect.type==="STAT_BONUS"&&allowed.has(String(effect.target))&&
    typeof effect.value==="number"&&Number.isFinite(effect.value)&&Math.abs(effect.value)<=1000;
  })) as Array<{id:number;name:string;active:boolean;effects:TrainingPerk["effects"]}>;
 if(!validRaces.length || validPerks.length<3)
  throw new Error("El catálogo necesita al menos una raza y tres perks activos compatibles.");
 const race=validRaces[index(validRaces.length,random)];
 const racial=new Set(links.filter(l=>l.raceId===race.id).map(l=>l.perkId));
 const candidates=[...validPerks.filter(p=>racial.has(p.id)),...validPerks.filter(p=>!racial.has(p.id))];
 const chosen:TrainingPerk[]=[];
 while(chosen.length<3){
  // Prefer racial perks before borrowing general, non-duplicated abilities.
  const available=candidates.filter(p=>!chosen.some(c=>c.id===p.id));
  const racialAvailable=available.filter(p=>racial.has(p.id));
  const pool=racialAvailable.length?racialAvailable:available;
  const p=pool[index(pool.length,random)];
  chosen.push({id:p.id,name:p.name,effects:p.effects.map(e=>({...e}))});
 }
 return {race:{id:race.id,name:race.name},perks:chosen};
}
export function applyTrainingBasePerks<T extends Record<string,number>>(base:T,perks:readonly TrainingPerk[]):T {
 const result:Record<string,number>={...base};
 for(const perk of perks)for(const e of perk.effects){
  const key=TRAINING_BASE_PERK_KEYS[e.target];
  if(key&&Number.isFinite(result[key]))result[key]=Math.max(1,result[key]+e.value);
 }
 return result as T;
}
export function applyTrainingDerivedPerks<T extends Record<string,unknown>>(fighter:T,perks:readonly TrainingPerk[]):T {
 const result={...fighter} as Record<string,unknown>;
 for(const perk of perks)for(const e of perk.effects){
  const key=TRAINING_DERIVED_PERK_KEYS[e.target];
  const old=result[key];
  if(key&&typeof old==="number"&&Number.isFinite(old))result[key]=Math.max(0,old+e.value);
 }
 return result as T;
}
