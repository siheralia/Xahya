/**
 * V2 inventory reconciliation, called for EVERY resolved world batch inside
 * the same locked CombatSession transaction. No inventory mutation may occur
 * for a declaration, a duplicate receipt or a read-only time advance.
 *
 * Uses official encounter snapshots (not the browser) and conditional SQL
 * updates against the original owned CharacterItem copy. This prevents both
 * stock duplication and a second concurrent fight from restoring wear.
 */
import type {CombatState,Side} from "./turn-engine.ts";

type Copy={characterItemId:number;itemId:number;durability:number};
export type InventoryMutation=
 |{kind:"CONSUME";characterId:number;characterItemId:number;
   itemId:number;units:number}
 |{kind:"DURABILITY";characterId:number;characterItemId:number;
   itemId:number;before:number;after:number;wear:number;repaired:number};

const sides=["PLAYER","NPC"] as const;
const integer=(n:unknown):n is number=>
 typeof n==="number"&&Number.isSafeInteger(n);
const copyIdsValid=(copy:Copy)=>
 integer(copy.characterItemId)&&copy.characterItemId>0&&
 integer(copy.itemId)&&copy.itemId>0&&
 integer(copy.durability)&&copy.durability>=0&&copy.durability<=100;

/** Projectiles retain a frozen snapshot of a *launched* weapon while in
 * flight; equipped and ground copies take precedence over shooter snapshots.
 * Otherwise a flying thrown weapon would temporarily vanish from inventory
 * reconciliation and its impact wear would be lost.
 */
function copies(state:CombatState,side:Side):Map<number,Copy>{
 const fighter=state.actors[side];
 const present=[fighter.equippedWeapon,fighter.offhandWeapon,
   ...(fighter.equippedWearables??[]),
   ...(state.droppedWeapons??[]).filter(x=>x.owner===side).map(x=>x.weapon)];
 const frozen=(state.timelineProjectiles??[])
   .filter(x=>x.owner===side).flatMap(x=>[
     x.shooter.equippedWeapon,x.shooter.offhandWeapon,
     ...(x.shooter.equippedWearables??[]),
   ]);
 const result=new Map<number,Copy>();
 for(const item of [...present,...frozen]){
   const id=item?.characterItemId;
   if(!item||id===undefined)continue;
   const stock={characterItemId:id,itemId:Number(item.itemId),
     durability:Number(item.durability??100)};
   if(!copyIdsValid(stock))
     throw new Error("El equipamiento V2 contiene una copia no verificable.");
   const previous=result.get(id);
   if(previous&&previous.itemId!==stock.itemId)
     throw new Error("La copia de inventario cambió de definición durante el combate.");
   // First authoritative occurrence wins over any frozen shooter snapshot.
   if(!previous)result.set(id,stock);
 }
 return result;
}
function repairedInStep(before:CombatState,after:CombatState,
 side:Side,id:number):number {
 const from=before.itemRepairsThisRound??[];
 const to=after.itemRepairsThisRound??[];
 const previous=from.filter(x=>x.by===side&&x.characterItemId===id&&
   x.round===after.round).reduce((n,x)=>n+x.restored,0);
 const current=to.filter(x=>x.by===side&&x.characterItemId===id&&
   x.round===after.round).reduce((n,x)=>n+x.restored,0);
 if(!integer(previous)||!integer(current)||current<previous||
   current>100)
   throw new Error("Autorreparación temporal de inventario inválida.");
 return current-previous;
}

/**
 * Pure audit: derive exact consumable deltas and durability updates.
 * Repeating an unchanged batch yields no writes. It rejects invented
 * copies and increases not backed by official self-repair receipts.
 */
export function inventoryMutationsBetween(
 before:CombatState,after:CombatState,
):InventoryMutation[]{
 if(before.version!==1||after.version!==1||
   before.timelineMode!=="SHARED"||after.timelineMode!=="SHARED"||
   after.tick<before.tick)
   throw new Error("Estados V2 incompatibles para reconciliar inventario.");
 const changes:InventoryMutation[]=[];
 for(const side of sides){
   const characterId=before.actors[side].characterId;
   if(characterId===null)continue;
   if(!integer(characterId)||characterId<=0||
      after.actors[side].characterId!==characterId)
     throw new Error("La identidad del dueño de inventario cambió.");
   const oldStock=before.consumables?.[side]??[];
   const newStock=after.consumables?.[side]??[];
   const newById=new Map(newStock.map(x=>[x.characterItemId,x]));
   const oldIds=new Set<number>();
   for(const old of oldStock){
     const id=old.characterItemId;
     if(!integer(id)||id<=0||oldIds.has(id)||
       !integer(old.itemId)||old.itemId<=0||
       !integer(old.quantity)||old.quantity<0)
       throw new Error("La poción del encuentro carece de una copia auténtica.");
     oldIds.add(id);
     const next=newById.get(id);
     const quantity=next?.quantity??0;
     if(!integer(quantity)||quantity<0||quantity>old.quantity||
       next&&next.itemId!==old.itemId)
       throw new Error("La cantidad de consumible cambió sin autorización.");
     const used=old.quantity-quantity;
     if(used>0)changes.push({kind:"CONSUME",characterId,
       characterItemId:id,itemId:old.itemId,units:used});
   }
   for(const next of newStock){
     if(next.characterItemId!==undefined&&!oldIds.has(next.characterItemId))
       throw new Error("El combate añadió inventario que no existía.");
   }
   const oldCopies=copies(before,side),newCopies=copies(after,side);
   for(const [id,next] of newCopies){
     if(!oldCopies.has(id))
       throw new Error("Una acción temporal creó equipamiento ajeno al personaje.");
     const original=oldCopies.get(id)!;
     if(original.itemId!==next.itemId)
       throw new Error("La copia cambió de definición.");
   }
   for(const [id,original] of oldCopies){
     const next=newCopies.get(id);
     if(!next)throw new Error("Una copia del equipo desapareció en pleno combate.");
     const repaired=repairedInStep(before,after,side,id);
     const wear=original.durability+repaired-next.durability;
     if(!integer(wear)||wear<0||wear>100)
       throw new Error("Cambio de durabilidad fuera del desgaste o reparación autorizados.");
     if(repaired>0){
       const afterItem=[after.actors[side].equippedWeapon,
         after.actors[side].offhandWeapon,
         ...(after.actors[side].equippedWearables??[])]
         .find(x=>x?.characterItemId===id);
       if(!afterItem?.autoRepair||
         afterItem.lastAutoRepairRound!==after.round)
         throw new Error("La autorreparación no corresponde a una copia equipada.");
     }
     if(wear>0||repaired>0)changes.push({kind:"DURABILITY",
       characterId,characterItemId:id,itemId:original.itemId,
       before:original.durability,after:next.durability,wear,repaired});
   }
 }
 return changes;
}

/** SQL writes are CONDITIONAL, and must be called only from a
 * db.transaction that already locked the encounter's row.
 * If another encounter sold/used the last potion, rollback this entire batch.
 */
export async function commitV2InventoryMutations(
 before:CombatState,after:CombatState,tx:any,
):Promise<void>{
 const changes=inventoryMutationsBetween(before,after);
 if(!changes.length)return;
 const {db}=await import("../db");
 for(const change of changes){
   if(change.kind==="CONSUME"){
     const sql=db.raw.sql`
       UPDATE public."characterItem"
         SET quantity=quantity-${change.units}
       WHERE id=${change.characterItemId}
         AND "characterId"=${change.characterId}
         AND "itemId"=${change.itemId}
         AND quantity>=${change.units}
     `.affectedCount().build();
     if((await tx.execute(sql)).affectedRows!==1)
       throw new Error("El inventario real ya no tiene suficientes unidades de ese objeto.");
     await (tx.orm.public as any).CharacterItem.where({
       id:change.characterItemId,quantity:0,
     }).delete();
     continue;
   }
   const sql=change.repaired>0?db.raw.sql`
     UPDATE public."characterItem"
       SET durability=GREATEST(0,LEAST(100,
         LEAST(durability,${change.before})-${change.wear}+${change.repaired}))
     WHERE id=${change.characterItemId}
       AND "characterId"=${change.characterId}
       AND "itemId"=${change.itemId} AND quantity=1
   `.affectedCount().build():db.raw.sql`
     UPDATE public."characterItem"
       SET durability=LEAST(durability,${change.after})
     WHERE id=${change.characterItemId}
       AND "characterId"=${change.characterId}
       AND "itemId"=${change.itemId} AND quantity=1
   `.affectedCount().build();
   if((await tx.execute(sql)).affectedRows!==1)
     throw new Error("No se pudo guardar el desgaste de la copia equipada.");
 }
}
