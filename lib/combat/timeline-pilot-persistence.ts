/**
 * Trusted V2 pilot session boundary. NO historic V1 fight is ever converted.
 *
 * The V2 clock and V1-shaped battle snapshot are an indivisible pair under
 * the combatSession row lock. Inventory writes use deltas from two complete
 * server snapshots and occur in the same DB transaction.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import type {TimelineDeclarationSession} from "./timeline-declarations.ts";
import {publicTimelineSessionStatus} from "./timeline-declarations.ts";
import {combatClientView} from "./magic-area.ts";
import {resolveBasicTimelineWindow,type TimelineDice,
  assertBasicTimelineEligible} from "./timeline-basic-actions.ts";
import {weaponWearSinceSnapshot} from "./weapon-persistence.ts";

export const timelinePilotEnabled=()=>process.env.XAHYA_COMBAT_V2_PILOT==="true";

export function assertTimelinePilotCompatible(c:CombatState):void{
 if(c.version!==1||c.status!=="ACTIVE"||c.tick!==0||
   c.pending||c.actors.PLAYER.characterId===null||
   c.actors.NPC.characterId===null)
   throw new Error("La prueba V2 solo admite encuentros PvP nuevos y sin impactos pendientes.");
 assertBasicTimelineEligible(c);
 if(c.summons?.some(s=>s.chaosField||!s.chargesMigrated)||c.constructions?.some(s=>s.passive?.resistance?.steps))
   throw new Error("El encuentro incluye una construcción o criatura no migrada a V2.");
}
export function assertTimelinePair(c:CombatState,s:TimelineDeclarationSession):void{
 if(c.version!==1||s?.version!==2||c.tick!==s.clock.nowTick||
   !Number.isSafeInteger(c.tick)||c.tick<0||
   s.clock.actors.PLAYER.availableAtTick<s.clock.nowTick||
   s.clock.actors.NPC.availableAtTick<s.clock.nowTick)
   throw new Error("El reloj y el combate V2 no coinciden: se abortó su persistencia.");
}
export function timelinePilotClientView(c:CombatState,s:TimelineDeclarationSession){
 assertTimelinePair(c,s);
 return {state:combatClientView(c),timeline:publicTimelineSessionStatus(s)};
}

type Copy={characterItemId:number;itemId:number;durability:number};
export type TimelineInventoryDebit={
 side:Side;characterId:number;characterItemId:number;itemId:number;quantity:number;
};
export type TimelineEquipmentMutation={
 side:Side;characterId:number;characterItemId:number;itemId:number;
 before:number;after:number;repaired:number;worn:number;
};
export type TimelinePersistenceDelta={
 items:TimelineInventoryDebit[];equipment:TimelineEquipmentMutation[];
};
const sides=["PLAYER","NPC"] as const;
const numberCopy=(item:{characterItemId?:number;itemId?:number;durability?:number}
 |null|undefined):Copy|null=>{
 if(!item||!Number.isSafeInteger(item.characterItemId)||!item.characterItemId||
   !Number.isSafeInteger(item.itemId)||!item.itemId)return null;
 const durability=item.durability??100;
 if(!Number.isFinite(durability)||durability<0||durability>100)
   throw new Error("Durabilidad de copia de combate inválida.");
 return {characterItemId:item.characterItemId,itemId:item.itemId,durability};
};
function equippedCopies(c:CombatState,side:Side):Map<number,Copy>{
 const fighter=c.actors[side],copies=new Map<number,Copy>();
 const equipment=[fighter.equippedWeapon,fighter.offhandWeapon,
   ...(fighter.equippedWearables??[]),
   ...(c.droppedWeapons??[]).filter(x=>x.owner===side).map(x=>x.weapon)];
 for(const part of equipment){
   const copy=numberCopy(part);
   if(!copy)continue;
   const prior=copies.get(copy.characterItemId);
   if(prior&&(prior.itemId!==copy.itemId||prior.durability!==copy.durability))
     throw new Error("La copia de equipo tiene snapshots contradictorios.");
   copies.set(copy.characterItemId,copy);
 }
 return copies;
}

/** Diff between two ENCOUNTER states after one authorized batch. No direct
 * command can supply quantity, repair, item ID or resources to this routine.
 * Every detected mutation is persisted by the route or the DB tx aborts.
 */
export function timelinePersistenceDelta(before:CombatState,after:CombatState):
 TimelinePersistenceDelta{
 if(before.version!==1||after.version!==1||after.tick<before.tick)
   throw new Error("Transición de inventario temporal no autorizada.");
 const result:TimelinePersistenceDelta={items:[],equipment:[]};
 for(const side of sides){
   const characterId=before.actors[side].characterId;
   if(characterId!==after.actors[side].characterId)
     throw new Error("Cambió el propietario del inventario en combate.");
   const oldStock=before.consumables?.[side]??[];
   const newStock=after.consumables?.[side]??[];
   const keys=new Set<string>();
   for(const potion of oldStock){
     const key=potion.itemId+":"+String(potion.characterItemId);
     if(keys.has(key))throw new Error("Hay copias repetidas de consumible.");
     keys.add(key);
     const successor=newStock.filter(x=>x.itemId===potion.itemId&&
       x.characterItemId===potion.characterItemId);
     if(successor.length!==1||successor[0].action!==potion.action||
       successor[0].amount!==potion.amount)
       throw new Error("Una receta o copia de consumible cambió durante el combate.");
     const consumed=potion.quantity-successor[0].quantity;
     if(!Number.isSafeInteger(consumed)||consumed<0||consumed>potion.quantity)
       throw new Error("Se duplicaron o inventaron unidades de consumible.");
     if(consumed>0){
       if(characterId===null)continue; // encounter-only NPC stock
       if(!potion.characterItemId||
         !Number.isSafeInteger(potion.characterItemId))
         throw new Error("Consumible sin copia del inventario real.");
       result.items.push({side,characterId,characterItemId:potion.characterItemId,
         itemId:potion.itemId,quantity:consumed});
     }
   }
   if(newStock.some(x=>!keys.has(x.itemId+":"+String(x.characterItemId))))
     throw new Error("Apareció una copia nueva de consumible.");
   const first=equippedCopies(before,side),last=equippedCopies(after,side);
   for(const [id,prior] of first){
     const actual=last.get(id);
     if(!actual||actual.itemId!==prior.itemId)
       throw new Error("Un objeto equipado desapareció del inventario temporal.");
     const repaired=(after.itemRepairsThisRound??[])
       .filter(op=>op.by===side&&op.characterItemId===id&&
         op.round>before.round&&op.round<=after.round)
       .reduce((n,op)=>n+op.restored,0);
     if(!Number.isSafeInteger(repaired)||repaired<0||repaired>100_000)
       throw new Error("Reparación temporal imposible.");
     const worn=weaponWearSinceSnapshot(prior.durability,actual.durability,repaired);
     if(repaired===0&&actual.durability>prior.durability)
       throw new Error("Una copia recuperó integridad sin autorreparación.");
     if(worn>0||repaired>0){
       if(characterId===null)continue;
       result.equipment.push({side,characterId,characterItemId:id,
         itemId:prior.itemId,before:prior.durability,
         after:actual.durability,repaired,worn});
     }
   }
   if([...last.keys()].some(id=>!first.has(id)))
     throw new Error("Apareció un objeto equipado nuevo en el combate.");
 }
 return result;
}

export async function runTimelinePilotWindow(
 combat:CombatState,session:TimelineDeclarationSession,
 roll:()=>TimelineDice,
 persistStep:(before:CombatState,after:CombatState)=>Promise<void>,
):Promise<{combat:CombatState;timeline:TimelineDeclarationSession;steps:number}>{
 assertTimelinePair(combat,session);
 let current=combat,clock=session,steps=0;
 // Stop at most 128 individual autonomous pulses in one request to bound DB
 // latency and prevent an untrusted client from advancing infinite time.
 for(;steps<128;steps++){
   const result=await resolveBasicTimelineWindow(current,clock,roll);
   if(!result)break;
   if(result.combat.tick<=current.tick||result.timeline.clock.nowTick<=clock.clock.nowTick)
     throw new Error("El reloj no avanzó después de una resolución V2.");
   assertTimelinePair(result.combat,result.timeline);
   await persistStep(current,result.combat);
   current=result.combat;clock=result.timeline;
   if(current.status!=="ACTIVE")break;
 }
 if(steps===128&&current.status==="ACTIVE")
   throw new Error("El encuentro necesita demasiadas resoluciones automáticas.");
 return {combat:current,timeline:clock,steps};
}
