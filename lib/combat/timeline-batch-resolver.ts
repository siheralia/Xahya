/**
 * Atomic commit stage for the v2 timeline. All strikes in the same completion
 * batch are evaluated against the SAME pre-impact snapshot. The scheduler
 * never applies these effects while the other actor is still choosing.
 *
 * The caller is responsible for validating attacks, collision, skills,
 * defenses, equipment, permissions and server dice BEFORE building an effect.
 * This module commits already-authorized HP and equipment wear, not combat
 * formulas; it does not execute any untrusted client-supplied effect.
 */
import type {CombatState,Side} from "./turn-engine.ts";
import type {TimelineBatch,TimelineEvent} from "./action-timeline.ts";

type CopyWear={owner:Side;characterItemId:number;amount:number};
export type AuthorizedTimelineEffect={
  eventId:string;
  /** Damage dealt to the target, already computed from the common snapshot. */
  hpDamage?:Partial<Record<Side,number>>;
  /** Heal values are resolved at the same instant as damage. */
  hpHealing?:Partial<Record<Side,number>>;
  equipmentWear?:CopyWear[];
};

const SIDES:Side[]=["PLAYER","NPC"];
const finiteNonnegative=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1_000_000;
const copyKey=(owner:Side,id:number)=>owner+":"+id;

/** Simultaneous damage and healing: a lethal blow does not cancel a second
 * attack that also finished on this tick. Both can fall to zero HP.
 *
 * This atomic stage deliberately rejects unsupported world modifications:
 * positions, inventories, buffs, construction durability, status effects and
 * mana require their own conflict-safe effect types, not a silent overwrite
 * of one combatant's snapshot.
 */
export function commitAuthorizedTimelineBatch(
 original:CombatState,batch:TimelineBatch,
 effects:readonly AuthorizedTimelineEffect[],
):CombatState {
 if(original.status!=="ACTIVE"||!Number.isSafeInteger(batch.atTick)||
   batch.atTick<original.tick)
   throw new Error("El lote temporal no pertenece a un combate activo.");
 const ids=new Set(batch.events.map(e=>e.id));
 if(ids.size!==batch.events.length||effects.length!==batch.events.length)
   throw new Error("Cada evento temporal debe tener exactamente un resultado autorizado.");
 const found=new Set<string>();
 const damages:Record<Side,number>={PLAYER:0,NPC:0};
 const healing:Record<Side,number>={PLAYER:0,NPC:0};
 const wear=new Map<string,{owner:Side;characterItemId:number;amount:number}>();
 for(const effect of effects){
   if(!ids.has(effect.eventId)||found.has(effect.eventId))
     throw new Error("Resultado temporal duplicado o ajeno al lote.");
   found.add(effect.eventId);
   for(const side of SIDES){
     const damage=effect.hpDamage?.[side]??0;
     const heal=effect.hpHealing?.[side]??0;
     if(!finiteNonnegative(damage)||!finiteNonnegative(heal))
       throw new Error("Daño o curación temporal inválida.");
     damages[side]+=damage;healing[side]+=heal;
     if(!Number.isSafeInteger(damages[side])||!Number.isSafeInteger(healing[side]))
       throw new Error("Acumulación de daño fuera de rango.");
   }
   for(const item of effect.equipmentWear??[]){
     if(!SIDES.includes(item.owner)||!Number.isSafeInteger(item.characterItemId)||
       item.characterItemId<1||!finiteNonnegative(item.amount)||
       !Number.isSafeInteger(item.amount))
       throw new Error("Desgaste de equipamiento inválido.");
     const key=copyKey(item.owner,item.characterItemId);
     const previous=wear.get(key);
     wear.set(key,{...item,amount:(previous?.amount??0)+item.amount});
   }
 }
 const next=structuredClone(original);
 // Damage is not canceled by a heal or by a simultaneous lethal attack.
 for(const side of SIDES){
   const actor=next.actors[side];
   const base=original.actors[side].hp;
   actor.hp=Math.min(actor.maxHp,Math.max(0,base-damages[side]+healing[side]));
 }
 for(const item of wear.values()){
   const actor=next.actors[item.owner];
   const candidates=[actor.equippedWeapon,actor.offhandWeapon,...(actor.equippedWearables??[]),
     ...(next.droppedWeapons??[]).filter(w=>w.owner===item.owner).map(w=>w.weapon)];
   const copy=candidates.find(c=>c?.characterItemId===item.characterItemId);
   if(!copy)throw new Error("El desgaste apunta a una copia no equipada ni arrojada.");
   copy.durability=Math.max(0,(copy.durability??100)-item.amount);
 }
 next.tick=batch.atTick;
 // The existing engine's FINISHED / winner / on-kill cleanup must be applied
 // by the integration layer. This module intentionally does not invent a
 // winner when simultaneous lethal strikes occur.
 return next;
}

export type TimelineAuthorizedResolver=(
 snapshot:Readonly<CombatState>,event:Readonly<TimelineEvent>,
 batch:Readonly<TimelineBatch>,
)=>AuthorizedTimelineEffect|Promise<AuthorizedTimelineEffect>;

/** Evaluate independent effects against one immutable pre-impact snapshot.
 * The caller must persist the resulting combat state AND batch.state in one
 * locked transaction; never save just one of the two.
 */
export async function resolveAuthorizedTimelineBatch(
 original:CombatState,batch:TimelineBatch,
 resolve:TimelineAuthorizedResolver,
):Promise<CombatState> {
 const effects=await Promise.all(batch.events.map(event=>resolve(
   structuredClone(original),structuredClone(event),batch)));
 return commitAuthorizedTimelineBatch(original,batch,effects);
}
