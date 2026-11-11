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
import type {CombatState,CombatLog,Side,Point,PhysicalAttackSource} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {timelineRoundOf} from "./action-timeline.ts";
import {narrateCombat,COMBAT_NARRATIVE_VERSION} from "./narration.ts";
import type {TimelineBatch,TimelineEvent} from "./action-timeline.ts";

type CopyWear={owner:Side;characterItemId:number;amount:number};
export type AuthorizedTimelineEffect={
  eventId:string;
  /** Damage dealt to the target, already computed from the common snapshot. */
  hpDamage?:Partial<Record<Side,number>>;
  /** Heal values are resolved at the same instant as damage. */
  hpHealing?:Partial<Record<Side,number>>;
  equipmentWear?:CopyWear[];
  /** Approved relative world displacement, e.g. a MOVE or measured knockback.
   * Concurrent displacement vectors add against the pre-impact coordinates. */
  positionDelta?:Partial<Record<Side,Point>>;
  /** Changing world position breaks a continuous physical stroke. */
  resetPhysicalStrokes?:Side[];
  /** Last measured endpoint for a hand / kick, unless interrupted by movement. */
  physicalStrokes?:Array<{owner:Side;source:PhysicalAttackSource;end:Point}>;
  /** Server-produced event log, not a command-supplied summary. */
  logs?:CombatLog[];
};

const SIDES:Side[]=["PLAYER","NPC"];
const finiteNonnegative=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1_000_000;
const copyKey=(owner:Side,id:number)=>owner+":"+id;
const SIDES_SET=new Set<string>(SIDES);
const validPosition=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  Math.abs(p.x)<=1_000_000&&Math.abs(p.y)<=1_000_000;
const validStroke=(p:Point)=>validPosition(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;

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
 if(original.status!=="ACTIVE"||batch.state.nowTick!==batch.atTick||!Number.isSafeInteger(batch.atTick)||
   batch.atTick<original.tick)
   throw new Error("El lote temporal no pertenece a un combate activo.");
 const ids=new Set(batch.events.map(e=>e.id));
 if(ids.size!==batch.events.length||effects.length!==batch.events.length||
   batch.events.some(e=>e.endsAtTick!==batch.atTick||e.status!=="RESOLVED"))
   throw new Error("Cada evento temporal debe tener exactamente un resultado autorizado.");
 const found=new Set<string>();
 const damages:Record<Side,number>={PLAYER:0,NPC:0};
 const healing:Record<Side,number>={PLAYER:0,NPC:0};
 const wear=new Map<string,{owner:Side;characterItemId:number;amount:number}>();
 const moved:Record<Side,Point>={PLAYER:{x:0,y:0},NPC:{x:0,y:0}};
 const clears=new Set<Side>();
 const strokes:Array<{owner:Side;source:PhysicalAttackSource;end:Point}>=[];
 const logs:CombatLog[]=[];
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
     if(!Number.isFinite(damages[side])||!Number.isFinite(healing[side]))
       throw new Error("Acumulación de daño fuera de rango.");
   }
   for(const item of effect.equipmentWear??[]){
     if(!SIDES.includes(item.owner)||!Number.isSafeInteger(item.characterItemId)||
       item.characterItemId<1||!finiteNonnegative(item.amount)||
       !Number.isSafeInteger(item.amount))
       throw new Error("Desgaste de equipamiento inválido.");
     const key=copyKey(item.owner,item.characterItemId);
     const previous=wear.get(key);
     const sum=(previous?.amount??0)+item.amount;
     if(!Number.isSafeInteger(sum))throw new Error("Desgaste acumulado fuera de rango.");
     wear.set(key,{...item,amount:sum});
   }
   for(const side of SIDES){
     const delta=effect.positionDelta?.[side];
     if(delta!==undefined){
       if(!validPosition(delta)||Math.hypot(delta.x,delta.y)>100)
         throw new Error("Desplazamiento temporal inválido.");
       moved[side].x+=delta.x;
       moved[side].y+=delta.y;
       if(!validPosition(moved[side]))
         throw new Error("Desplazamiento acumulado fuera de rango.");
     }
   }
   for(const side of effect.resetPhysicalStrokes??[]){
     if(!SIDES_SET.has(side))throw new Error("Reinicio de trayectoria inválido.");
     clears.add(side);
   }
   for(const stroke of effect.physicalStrokes??[]){
     if(!SIDES_SET.has(stroke.owner)||
       !["MAIN_HAND","OFF_HAND","FIST_RIGHT","FIST_LEFT","KICK"].includes(stroke.source)||
       !validStroke(stroke.end))
       throw new Error("Trayectoria física final inválida.");
     if(strokes.some(x=>x.owner===stroke.owner&&x.source===stroke.source))
       throw new Error("Dos acciones actualizaron la misma trayectoria.");
     strokes.push(stroke);
   }
   for(const entry of effect.logs??[]){
     if(!entry||!SIDES_SET.has(entry.by)||typeof entry.kind!=="string"||
       entry.kind.length>64||typeof entry.summary!=="string"||
       entry.summary.length>2000)
       throw new Error("Registro temporal inválido.");
     logs.push({...entry,tick:batch.atTick});
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
   if(copy===actor.equippedWeapon)actor.weaponIntegrity=copy.durability;
 }
 for(const side of SIDES){
   const delta=moved[side],fighter=next.actors[side];
   if(delta.x!==0||delta.y!==0){
     const current=fieldPosition(original.actors[side]);
     const to={x:current.x+delta.x,y:current.y+delta.y};
     if(!validPosition(to))throw new Error("Posición resultante inválida.");
     fighter.fieldPosition=to;
     fighter.positionMeters=to.x;
     // Forced displacement always breaks a stroke.
     clears.add(side);
   }
   if(clears.has(side)){
     if(next.physicalPathEnd)delete next.physicalPathEnd[side];
     if(next.physicalPathEnds)delete next.physicalPathEnds[side];
   }
 }
 for(const stroke of strokes){
   if(clears.has(stroke.owner))continue;
   next.physicalPathEnd??={};
   next.physicalPathEnd[stroke.owner]={...stroke.end};
   next.physicalPathEnds??={};
   next.physicalPathEnds[stroke.owner]??={};
   next.physicalPathEnds[stroke.owner]![stroke.source]={...stroke.end};
 }
 // Emit crossed round boundaries BEFORE the final batch's impact log.
 // Advanced time-driven buffs/upkeep remain a separate, guarded integration.
 const priorLog=next.narrativeHistory??next.log.slice();
 next.narrativeHistory=[...priorLog];
 for(const crossing of batch.crossedRoundBoundaries){
   const n=timelineRoundOf(crossing);
   const entry:CombatLog={kind:"ROUND",tick:crossing,by:"PLAYER",
     summary:"Comienza el turno "+n};
   next.narrativeHistory.push(entry);
   next.log.push(entry);
 }
 for(const entry of logs){
   next.narrativeHistory.push(entry);
   next.log.push(entry);
 }
 next.log=next.log.slice(-100);
 next.tick=batch.atTick;
 next.round=timelineRoundOf(batch.atTick);
 // A double KO is a draw. Never cancel the second simultaneous strike merely
 // because the first fighter reached zero HP while computing the batch.
 if(next.actors.PLAYER.hp<=0||next.actors.NPC.hp<=0){
   next.status="FINISHED";
   next.winner=next.actors.PLAYER.hp>0?"PLAYER":next.actors.NPC.hp>0?"NPC":null;
   const summary=next.winner
     ?next.actors[next.winner].name+" gana el combate"
     :"Ambos combatientes cayeron simultáneamente: empate";
   const end:CombatLog={kind:"END",tick:batch.atTick,by:next.winner??"PLAYER",
     against:next.winner?(next.winner==="PLAYER"?"NPC":"PLAYER"):"NPC",summary};
   next.narrativeHistory.push(end);
   next.log.push(end);
   next.log=next.log.slice(-100);
   next.narrativeText=narrateCombat(next.narrativeHistory,next.actors);
   next.narrativeVersion=COMBAT_NARRATIVE_VERSION;
 }
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
