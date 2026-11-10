import {PCH_PER_COIN} from "./pch.ts";

/**
 * UI-only quote. A creation coin adds 10 PCH to a shared balance; it is not a
 * hard 10-PCH limit per skill. The server still owns all reservations/refunds.
 */
export function skillPchBudgetQuote(total: number, balance: number, baseline?: number){
 const safeTotal=Number.isSafeInteger(total)&&total>=0?total:0;
 const safeBalance=Number.isSafeInteger(balance)&&balance>=0?balance:0;
 const safeBase=Number.isSafeInteger(baseline)&&baseline>=0?baseline:0;
 const due=Math.max(0,safeTotal-safeBase);
 const missing=Math.max(0,due-safeBalance);
 return {
  due, balance:safeBalance, missing, affordable:due>0&&missing===0,
  creationCoinsEquivalent:Math.ceil(missing/PCH_PER_COIN),
 };
}
