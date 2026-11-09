/**
 * Spanish, factual equipment explanations for the combat client.
 * This module only reads the server-approved combat snapshot. Neither
 * equipment definition nor derived replay is accepted from the browser.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import type {CombatWearable} from "../items/combat-wearables.ts";

export const equipmentSlotName=(slot:string):string=>({
 HEAD:"Cabeza",BODY:"Torso",CHEST:"Pecho",ARMS:"Brazos",HANDS:"Manos",
 LEGS:"Piernas",FEET:"Pies",BACK:"Espalda",WAIST:"Cintura",
 NECK:"Cuello",OFF_HAND:"Mano secundaria (escudo)",
 ACCESSORY_1:"Accesorio 1",ACCESSORY_2:"Accesorio 2",
 ACCESSORY_3:"Accesorio 3",
} as Record<string,string>)[slot]??"Ranura: "+slot.replaceAll("_"," ");

export type EquipmentCondition="BROKEN"|"DAMAGED"|"INTACT";
export function equipmentCondition(item:Pick<CombatWearable,"durability">):EquipmentCondition{
 return item.durability<=0?"BROKEN":item.durability<=25?"DAMAGED":"INTACT";
}
export function nextAutoRepairRound(round:number,interval:number):number|null{
 if(!Number.isSafeInteger(round)||round<1||!Number.isSafeInteger(interval)||
   interval<1||interval>50)return null;
 return 2+Math.ceil(Math.max(0,round-1)/interval)*interval;
}
export function explainEquipmentRecovery(
 item:Pick<CombatWearable,"durability"|"autoRepair"|"autoRepairDisabled">,round:number,manaAvailable:number|undefined
):string{
 if(!item.autoRepair)return "Sin autorreparación: esta pieza no se recupera sola durante el combate.";
 if(item.autoRepairDisabled)return "Autorreparación desactivada: configuración incompatible.";
 const {manaCost,intervalTurns}=item.autoRepair;
 const nextRound=nextAutoRepairRound(round,intervalTurns);
 if(nextRound===null)return "La programación de reparación no es válida.";
 if(item.durability>=100)return "Durabilidad completa: no necesita reparación.";
 const cost="Cuesta "+manaCost+" maná y se activa al comienzo de la ronda "+nextRound+
  " (cada "+intervalTurns+" "+(intervalTurns===1?"ronda":"rondas")+").";
 if(manaAvailable===undefined)return "Autorreparación configurada. "+cost;
 if(manaAvailable<manaCost)
  return "Maná insuficiente: tienes "+manaAvailable+" y necesitas "+manaCost+
   ". "+cost+" Si no tienes maná al iniciarse esa ronda, no se reparará.";
 return "Autorreparación configurada. "+cost;
}
export type EquipmentEvent={
 type:"WEAR"|"BREAK"|"REPAIR"|"CAPACITY"|"STATS"|"ERROR";
 text:string;tick:number;item:string|null;
};
const eventTypes:Record<string,EquipmentEvent["type"]>={
 EQUIPMENT_WEAR:"WEAR",EQUIPMENT_BREAK:"BREAK",
 EQUIPMENT_REPAIR:"REPAIR",EQUIPMENT_CAPACITY:"CAPACITY",
 EQUIPMENT_STATS:"STATS",WEAPON_WEAR:"WEAR",WEAPON_BREAK:"BREAK",
 WEAPON_REPAIR:"REPAIR",WEAPON_REPAIR_SKIP:"ERROR",
};
export function recentEquipmentEvents(
 state:CombatState,side:Side,limit=5
):EquipmentEvent[]{
 return state.log.filter(e=>e.by===side&&e.kind in eventTypes)
  .slice(-Math.max(0,Math.min(limit,10))).reverse().map(e=>({
   type:eventTypes[e.kind],text:e.summary,tick:e.tick,item:e.weaponName??null,
  }));
}
export function combatEquipmentCounts(state:CombatState,side:Side){
 const items=state.actors[side].equippedWearables??[];
 return {
  total:items.length,
  broken:items.filter(item=>equipmentCondition(item)==="BROKEN").length,
  damaged:items.filter(item=>equipmentCondition(item)==="DAMAGED").length,
 };
}
