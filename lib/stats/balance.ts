import { db } from "@/lib/db";
export const BALANCE_DEFAULTS = {
 casinoLow:10,casinoHigh:20,casinoPenaltyRate:0.02,casinoPenaltyMax:0.2,casinoBonusRate:0.008,casinoBonusMax:0.08,
 blackjackLow:10,blackjackHigh:20,blackjackRate:0.008,blackjackMax:0.08,
 mazeTrapRate:0.01,mazeTrapMax:0.75,mazeTreasureShare:0.6666666666666666,
 mazeItemBase:0.35,mazeItemRate:0.004,mazeItemMax:0.75,
 mazeMoneyRate:0.01,mazeMoneyMax:1
} as const;
export type BalanceSettings = Record<keyof typeof BALANCE_DEFAULTS,number>;
const KEY="statistics.balance.v1";
export async function readBalance(source:any=db):Promise<BalanceSettings>{
 const Model=(source.orm.public as any).AppSetting;
 const row=Model?await Model.where({key:KEY}).first():null;
 let parsed:Record<string,unknown>={};
 try{parsed=row?.value?JSON.parse(String(row.value)):{};}catch{}
 return Object.fromEntries(Object.entries(BALANCE_DEFAULTS).map(([key,def])=>[key,typeof parsed[key]==="number"&&Number.isFinite(parsed[key])?parsed[key]:def])) as BalanceSettings;
}
export async function writeBalance(input:BalanceSettings,source:any=db){
 const keys=Object.keys(BALANCE_DEFAULTS) as (keyof BalanceSettings)[];
 if(keys.some(k=>typeof input[k]!=="number"||!Number.isFinite(input[k])||input[k]<0||input[k]>100))throw new Error("Parámetros fuera de rango (0–100).");
 if(keys.filter(k=>/Max|Share|Base/.test(k)).some(k=>input[k]>1))throw new Error("Los límites de probabilidad deben estar entre 0 y 1.");
 if(input.casinoLow>input.casinoHigh||input.blackjackLow>input.blackjackHigh||input.mazeItemBase>input.mazeItemMax)throw new Error("Los umbrales no son consistentes.");
 const Model=(source.orm.public as any).AppSetting;
 if(!Model)throw new Error("Configuración no disponible.");
 const row=await Model.where({key:KEY}).first();
 if(row)await Model.where({id:row.id}).update({value:JSON.stringify(input)});
 else await Model.create({key:KEY,value:JSON.stringify(input)});
}
