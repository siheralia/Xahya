/**
 * Opt-in wear for equipped armor and accessories. A verified HP impact can
 * wear one specific copy; it NEVER changes the damage already resolved.
 * Legacy items without this effect remain unchanged.
 */
export const EQUIPPED_WEAR_EFFECT="durability_wear_on_hit" as const;
export type EquipmentWearChannel="ALL"|"PHYSICAL"|"MAGICAL";
export type EquipmentWearRule={
 type:typeof EQUIPPED_WEAR_EFFECT;
 wearPercent:number;
 channel:EquipmentWearChannel;
};
export type WearableItemType="ARMOR"|"ACCESSORY";
export type WearableSlot="HEAD"|"BODY"|"FEET"|"ARMS"|"BACK"|"ACCESSORY_1"|"ACCESSORY_2";

const armorSlots=new Set<WearableSlot>(["HEAD","BODY","FEET","ARMS","BACK"]);
const accessorySlots=new Set<WearableSlot>(["ACCESSORY_1","ACCESSORY_2"]);
export function wearableSlotAllowed(itemType:WearableItemType,slot:string):slot is WearableSlot{
 return itemType==="ARMOR"?armorSlots.has(slot as WearableSlot):accessorySlots.has(slot as WearableSlot);
}
export function compileEquippedWear(rawEffects:unknown,itemType:string):EquipmentWearRule|null{
 if(!Array.isArray(rawEffects))return null;
 const matches=rawEffects.filter(x=>x&&typeof x==="object"&&!Array.isArray(x)&&
   (x as Record<string,unknown>).type===EQUIPPED_WEAR_EFFECT);
 if(!matches.length)return null;
 if(matches.length!==1||!["ARMOR","ACCESSORY"].includes(itemType))
   throw new Error("El desgaste por impacto solo permite un efecto por armadura o accesorio.");
 const value=matches[0] as Record<string,unknown>;
 if(Object.keys(value).some(key=>!["type","wearPercent","channel"].includes(key)))
   throw new Error("Campos de desgaste desconocidos.");
 if(!Number.isSafeInteger(value.wearPercent)||Number(value.wearPercent)<1||Number(value.wearPercent)>100)
   throw new Error("El desgaste debe ser un porcentaje entero entre 1 y 100.");
 if(!["ALL","PHYSICAL","MAGICAL"].includes(String(value.channel)))
   throw new Error("Selecciona desgaste físico, mágico o ambos.");
 return {type:EQUIPPED_WEAR_EFFECT,wearPercent:value.wearPercent as number,
   channel:value.channel as EquipmentWearChannel};
}
export function defaultEquippedWear():EquipmentWearRule{
 return {type:EQUIPPED_WEAR_EFFECT,wearPercent:10,channel:"PHYSICAL"};
}
/** Only resolved nonzero HP impact counts. A miss, dodge, barrier absorption,
 * or fully prevented attack does not damage equipment. Values cap at 0..100.
 */
export function equipmentWearFromHit(
 current:number,appliedHpDamage:number,magic:boolean,rule:EquipmentWearRule
):number{
 if(!Number.isSafeInteger(current)||current<0||current>100||
   !Number.isSafeInteger(appliedHpDamage)||appliedHpDamage<0||appliedHpDamage>1_000_000)
   throw new Error("Impacto o durabilidad inválidos.");
 if(!compileEquippedWear([rule],"ARMOR"))
   throw new Error("Regla de desgaste inválida.");
 if(current===0||appliedHpDamage===0||
   (rule.channel==="MAGICAL"&&!magic)||(rule.channel==="PHYSICAL"&&magic))return 0;
 return Math.min(current,Math.max(1,Math.ceil(appliedHpDamage*rule.wearPercent/100)));
}
