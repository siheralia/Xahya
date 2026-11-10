import {PCH_PER_COIN,PCH_PER_UPGRADE_COIN} from "./pch.ts";

/** Presentation only: never authorizes a purchase or overrides server PCH. */
export type SkillPchBudget={
  total:number;
  payable:number;
  baseline:number|null;
  referenceCoinPch:number;
  coinsWorth:number;
  singleCoinRemainder:number|null;
  balance:number|null;
  remaining:number|null;
  shortfall:number|null;
  affordable:boolean|null;
  requiresIncreasedPrice:boolean;
  provisional:boolean;
};

export function quoteSkillPchBudget({
  total,baseline,balance,provisional=false,genericSpecialization=false,
}:{
  total:number;baseline?:number;balance?:number;provisional?:boolean;genericSpecialization?:boolean;
}):SkillPchBudget|null{
  if(!Number.isSafeInteger(total)||total<0)return null;
  if(baseline!==undefined&&(!Number.isSafeInteger(baseline)||baseline<0))return null;
  if(balance!==undefined&&(!Number.isSafeInteger(balance)||balance<0))return null;
  const isUpgrade=baseline!==undefined;
  const payable=baseline!==undefined?Math.max(0,total-baseline):total;
  const referenceCoinPch=isUpgrade&&!genericSpecialization?PCH_PER_UPGRADE_COIN:PCH_PER_COIN;
  const remaining=balance===undefined?null:balance-payable;
  return {
    total,payable,baseline:baseline??null,referenceCoinPch,
    coinsWorth:Math.ceil(payable/referenceCoinPch),
    singleCoinRemainder:payable<=referenceCoinPch?referenceCoinPch-payable:null,
    balance:balance??null,remaining,
    shortfall:balance===undefined?null:Math.max(0,payable-balance),
    affordable:balance===undefined?null:balance>=payable,
    requiresIncreasedPrice:baseline!==undefined&&!genericSpecialization&&total<=baseline,
    provisional,
  };
}
