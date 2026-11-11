/**
 * V2 consumables: official one-copy HP/mana potions resolved only on their
 * deadline, using Xahya's existing V1 consumable action as a pure calculator.
 * The calculator's PA/ticks/receipt are discarded; the V2 scheduler already
 * reserved the action. Actual stock and resource changes commit together.
 */
import {
 applyResolvedCombatConsumable,turnTicks,
 type CombatCommand,type CombatState,type Side,
} from "./turn-engine.ts";
import type {CombatConsumable} from "../items/combat-consumables.ts";
import type {ContinuousCombatTimeline,TimelineEvent} from "./action-timeline.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type ItemCommand=Extract<CombatCommand,{kind:"USE_ITEM"}>;
const SIDES=["PLAYER","NPC"] as const;
export function simulateBasicTimelineConsumable(
 combat:CombatState,clock:ContinuousCombatTimeline,
 event:TimelineEvent,command:ItemCommand,
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.kind!=="ITEM"||event.status!=="RESOLVED"||
   event.endsAtTick!==clock.nowTick||event.paidAp!==1||
   event.durationTicks!==turnTicks(combat.actors[event.owner]))
   throw new Error("El consumible no ha llegado al tick de activación.");
 if(command.kind!=="USE_ITEM"||
   !/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId)||
   Object.keys(command).some(key=>
     !["kind","itemId","characterItemId","requestId"].includes(key)))
   throw new Error("El consumible contiene parámetros ajenos al catálogo.");
 const owner=event.owner;
 const matches=(combat.consumables?.[owner]??[]).filter(item=>
   item.itemId===command.itemId&&
   item.characterItemId===command.characterItemId);
 if(matches.length!==1||!Number.isSafeInteger(matches[0].quantity)||
   matches[0].quantity<1)
   throw new Error("El consumible no tiene una unidad disponible.");
 const approved:CombatConsumable=matches[0];
 if(!Number.isSafeInteger(approved.amount)||approved.amount<1||
   approved.amount>1000||
   !["HEAL_HP","RESTORE_MANA"].includes(approved.action))
   throw new Error("La receta oficial del consumible es inválida.");
 const shadow=structuredClone(combat);
 shadow.round=1;shadow.tick=0;shadow.pending=null;
 shadow.timelineMode=undefined;shadow.tieOpener=owner;
 shadow.log=[];shadow.narrativeHistory=[];
 shadow.activeBlocks={};shadow.mirrorRayQueue=[];
 for(const side of SIDES){
   shadow.actors[side].spentAp=0;
   shadow.actors[side].spentTicks=0;
 }
 const resolved=applyResolvedCombatConsumable(shadow,owner,approved,command.requestId);
 const beforeHp=combat.actors[owner].hp;
 const gainedHp=resolved.actors[owner].hp-beforeHp;
 const beforeMana=combat.mana?.[owner]?.current??0;
 const gainedMana=(resolved.mana?.[owner]?.current??0)-beforeMana;
 if(gainedHp<0||gainedMana<0||
   approved.action==="HEAL_HP"&&gainedMana!==0||
   approved.action==="RESTORE_MANA"&&gainedHp!==0||
   gainedHp>approved.amount||gainedMana>approved.amount)
   throw new Error("El consumible produjo efectos secundarios inesperados.");
 const after=(resolved.consumables?.[owner]??[]).filter(item=>
   item.itemId===approved.itemId&&
   item.characterItemId===approved.characterItemId);
 if(after.length!==1||after[0].quantity!==approved.quantity-1)
   throw new Error("El resolutor oficial no consumió exactamente una unidad.");
 for(const side of SIDES){
   if(side!==owner&&(resolved.actors[side].hp!==combat.actors[side].hp||
      resolved.mana?.[side]?.current!==combat.mana?.[side]?.current))
     throw new Error("El consumible modificó al otro combatiente.");
 }
 return {
   eventId:event.id,
   ...(gainedHp>0?{hpHealing:{[owner]:gainedHp}}:{}),
   ...(gainedMana>0?{manaRestored:{[owner]:gainedMana}}:{}),
   consumableUses:[{owner,itemId:approved.itemId,
     ...(approved.characterItemId!==undefined
       ?{characterItemId:approved.characterItemId}:{})}],
   logs:resolved.log.filter(entry=>entry.kind==="ITEM")
     .map(entry=>({...entry,tick:event.endsAtTick})),
 };
}
