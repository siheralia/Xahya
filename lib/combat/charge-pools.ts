/** Owner-scoped encounter charge ledger. Summons are charge PRODUCERS, not
 * wallets: a lunar charge must survive their expiration and be spendable by
 * an approved skill without assigning additional independent creature turns.
 */
import type {CombatState,Side} from "./turn-engine.ts";

export const MAX_COMBAT_CHARGES=6;
const safeCharge=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Math.min(MAX_COMBAT_CHARGES,Number(n)):0;

/** Read-only projection, including un-migrated summons from older encounters. */
export function combatChargeBalance(state:CombatState,side:Side,name:string):number{
 const current=safeCharge(state.combatCharges?.[side]?.[name]);
 const legacy=(state.summons??[]).filter(s=>s.owner===side&&!s.chargesMigrated)
   .reduce((sum,s)=>sum+safeCharge(s.charges?.[name]),0);
 return Math.min(MAX_COMBAT_CHARGES,current+legacy);
}

/** Runs only on a cloned or transaction-locked encounter. Each old summon is
 * migrated once even when different skills read or spend the same pool.
 */
export function ensureCombatChargePool(state:CombatState,side:Side):Record<string,number>{
 state.combatCharges??={};
 const pool=state.combatCharges[side]??={};
 for(const creature of state.summons??[]){
   if(creature.owner!==side||creature.chargesMigrated)continue;
   for(const [name,value] of Object.entries(creature.charges??{})){
     if(!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(name))continue;
     pool[name]=Math.min(MAX_COMBAT_CHARGES,safeCharge(pool[name])+safeCharge(value));
   }
   creature.chargesMigrated=true;
 }
 return pool;
}

export function creditCombatCharge(state:CombatState,side:Side,name:string):number{
 const pool=ensureCombatChargePool(state,side);
 const before=safeCharge(pool[name]);
 pool[name]=Math.min(MAX_COMBAT_CHARGES,before+1);
 return pool[name]-before;
}

export function spendCombatCharges(state:CombatState,side:Side,name:string,amount:number):number{
 if(!Number.isSafeInteger(amount)||amount<1||amount>MAX_COMBAT_CHARGES)
   throw new Error("La cantidad de cargas debe estar entre 1 y 6.");
 const pool=ensureCombatChargePool(state,side);
 const before=safeCharge(pool[name]);
 if(before<amount)throw new Error("No tienes suficientes cargas para activar esta habilidad.");
 pool[name]=before-amount;
 return pool[name];
}
