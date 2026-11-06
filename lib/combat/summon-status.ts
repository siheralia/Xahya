/** Deterministic, encounter-local statuses produced by a summon touch.
 * All modifications are applied to the authoritative CombatFighter snapshot,
 * and exactly undone as they expire. Never update the global character sheet.
 */
import type {CombatFighter,CombatState,Side} from "./turn-engine.ts";

export type StatusStat="strength"|"agility"|"speedValue"|"constitution"|
 "precision"|"dodge"|"physicalAttack"|"physicalDefense"|
 "magicAttack"|"magicDefense"|"critical"|"luck"|"race";
export type SummonStatus={
 id:string;sourceSummonId:string;by:Side;target:Side;stat:StatusStat;
 operation:"MULTIPLIER"|"BONUS";value:number;expiresAtRound:number;
 /** A delta in the authoritative fighter snapshot, including stacking. */
 appliedDelta:number;
};
const canonical:Record<string,StatusStat>={
 STR:"strength",STRENGTH:"strength",strength:"strength",
 AGI:"agility",AGILITY:"agility",agility:"agility",
 SPEED:"speedValue",MOVE_SPEED:"speedValue",speedValue:"speedValue",
 CON:"constitution",CONSTITUTION:"constitution",constitution:"constitution",
 PRECISION:"precision",precision:"precision",
 DODGE:"dodge",EVASION:"dodge",EVA:"dodge",dodge:"dodge",
 PHYSICAL_ATTACK:"physicalAttack",PHYS_ATK:"physicalAttack",physicalAttack:"physicalAttack",
 PHYSICAL_DEFENSE:"physicalDefense",PHYS_DEF:"physicalDefense",physicalDefense:"physicalDefense",
 MAGIC_ATTACK:"magicAttack",magicAttack:"magicAttack",
 MAGIC_DEFENSE:"magicDefense",MAGIC_DEF:"magicDefense",magicDefense:"magicDefense",
 CRITICAL:"critical",critical:"critical",LUCK:"luck",luck:"luck",
 RACE:"race",race:"race",
};
export function resolveStatusStat(key:string):StatusStat|null{
 return Object.prototype.hasOwnProperty.call(canonical,key)?canonical[key]:null;
}
export function isDebuffStatus(s:Pick<SummonStatus,"operation"|"value">):boolean{
 return s.operation==="MULTIPLIER"?s.value<1:s.value<0;
}
export function isBuffStatus(s:Pick<SummonStatus,"operation"|"value">):boolean{
 return s.operation==="MULTIPLIER"?s.value>1:s.value>0;
}
function numericStat(f:CombatFighter,stat:StatusStat):number{
 const value=f[stat];
 if(typeof value!=="number"||!Number.isFinite(value))throw new Error("La estadística efectiva no está disponible.");
 return value;
}
/** Re-evaluate the entire affected stat, stripping recorded prior deltas.
 * Keeps unrelated bonuses acquired while the status is active in the baseline.
 */
function rebuild(state:CombatState,target:Side,stat:StatusStat):void{
 const actor=state.actors[target],all=state.summonStatuses??[];
 const relevant=all.filter(s=>s.target===target&&s.stat===stat);
 const oldDeltas=relevant.reduce((total,s)=>total+(s.appliedDelta??0),0);
 let value=numericStat(actor,stat)-oldDeltas;
 if(!Number.isFinite(value))throw new Error("No se pudo recuperar la estadística previa.");
 for(const effect of relevant){
   const previous=value;
   value=effect.operation==="MULTIPLIER"?previous*effect.value:previous+effect.value;
   value=Math.max(0,Math.min(1_000_000,value));
   effect.appliedDelta=value-previous;
 }
 actor[stat]=value;
}
/** Rebuild before removing, then rebuild after removing. */
export function expireSummonStatuses(state:CombatState):void{
 const expiring=(state.summonStatuses??[]).filter(s=>s.expiresAtRound<=state.round);
 if(!expiring.length)return;
 const pairs=[...new Set(expiring.map(s=>s.target+":"+s.stat))];
 // Calculate baselines with all existing deltas still present.
 const baseline=new Map<string,number>();
 for(const key of pairs){
   const [side,stat]=key.split(":") as [Side,StatusStat];
   const total=(state.summonStatuses??[]).filter(s=>s.target===side&&s.stat===stat)
     .reduce((v,s)=>v+s.appliedDelta,0);
   baseline.set(key,numericStat(state.actors[side],stat)-total);
 }
 state.summonStatuses=state.summonStatuses?.filter(s=>s.expiresAtRound>state.round);
 for(const key of pairs){
   const [side,stat]=key.split(":") as [Side,StatusStat];
   state.actors[side][stat]=baseline.get(key)!;
   const active=(state.summonStatuses??[]).filter(s=>s.target===side&&s.stat===stat);
   for(const s of active)s.appliedDelta=0;
   rebuild(state,side,stat);
 }
}
export function applySummonStatus(state:CombatState,args:{
 id:string;sourceSummonId:string;by:Side;target:Side;stat:string;
 operation:"MULTIPLIER"|"BONUS";value:number;durationTurns:number;
}):SummonStatus{
 const stat=resolveStatusStat(args.stat);
 if(!stat)throw new Error("Estadística de estado no implementada: "+args.stat);
 if(!Number.isFinite(args.value)||
   args.operation==="MULTIPLIER"&&(args.value<0||args.value>3)||
   args.operation==="BONUS"&&Math.abs(args.value)>100000)
   throw new Error("Valor de estado fuera de límites.");
 if(!Number.isSafeInteger(args.durationTurns)||args.durationTurns<1||args.durationTurns>20)
   throw new Error("Duración de estado inválida.");
 if((state.summonStatuses?.length??0)>=100)throw new Error("Demasiados estados temporales.");
 const record:SummonStatus={id:args.id,sourceSummonId:args.sourceSummonId,by:args.by,
   target:args.target,stat,operation:args.operation,value:args.value,
   expiresAtRound:state.round+args.durationTurns,appliedDelta:0};
 state.summonStatuses??=[];
 state.summonStatuses.push(record);
 rebuild(state,args.target,stat);
 return record;
}
export function invertSummonStatus(state:CombatState,target:Side,statusId:string):SummonStatus|null{
 const status=state.summonStatuses?.find(s=>s.id===statusId&&s.target===target);
 if(!status||!isDebuffStatus(status))return null;
 status.value=status.operation==="MULTIPLIER"?2-status.value:-status.value;
 rebuild(state,target,status.stat);
 return status;
}
