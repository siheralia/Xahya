/**
 * Authorized autonomous creature and mirror effects for the shared V2 clock.
 *
 * Every action uses the existing live V1 attack, defense, geometry, contact,
 * and magical reflection calculators in a THROWAWAY state. Only whitelisted
 * deltas enter an atomic V2 batch; no additional player PA, creature fee, or
 * mirror spell cost is generated at an automatic tick.
 */
import {
 applyCombatCommand,beginNextMirrorRay,progressAutonomousSummons,
 type CombatCommand,type CombatState,type Side,type Point,
} from "./turn-engine.ts";
import {timelineRoundOf,type ContinuousCombatTimeline}
 from "./action-timeline.ts";
import type {WorldTimelineEvent} from "./timeline-world-batch.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import {fieldPosition} from "./field-plane.ts";
import {weaponCopies,isolatePhysicalShadow}
 from "./timeline-basic-strike.ts";
import {diffConstructionWorld} from "./timeline-construction-world.ts";
import {assertEquipmentOnlyShadowStats} from "./timeline-equipment-replay.ts";
import type {CombatSummon} from "./summons.ts";
import {isDebuffStatus,reconcileSummonStatusStat,
 type StatusStat,type SummonStatus} from "./summon-status.ts";
import {creditCombatCharge} from "./charge-pools.ts";

type Dice={hit:number;critical:number;defense:number};
type Defense=Extract<CombatCommand,{kind:"DEFEND"}>;
const sides=["PLAYER","NPC"] as const;
const rival=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const stats=["strength","agility","speedValue","constitution",
 "precision","dodge","physicalAttack","physicalDefense",
 "magicAttack","magicDefense","critical","luck","race","maxHp"] as const;
const validDice=(d:Dice)=>d&&
 [d.hit,d.critical,d.defense].every(v=>Number.isFinite(v)&&v>=0&&v<=1);
function validateEvent(
 clock:ContinuousCombatTimeline,event:WorldTimelineEvent,
 kind:WorldTimelineEvent["kind"],hit:Dice,defense:Dice,
):void{
 if(clock.version!==2||event.kind!==kind||event.status!=="RESOLVED"||
   event.endsAtTick!==clock.nowTick||event.startsAtTick!==event.endsAtTick||
   event.paidAp!==0||event.durationTicks!==0||
   !event.sourceEntityId||!validDice(hit)||!validDice(defense))
   throw new Error("El acontecimiento autónomo carece de un tick autorizado.");
}
function calcShadow(snapshot:CombatState,side:Side,tick:number):CombatState{
 const shadow=isolatePhysicalShadow(snapshot,side);
 shadow.round=timelineRoundOf(tick);
 shadow.tick=tick;
 return shadow;
}
/** The original status objects can have recalculated appliedDelta values
 * after a new approved contact; their identity and rule MUST be unchanged.
 */
function sameOldStatuses(before:SummonStatus[],after:SummonStatus[]):boolean{
 return before.every(status=>{
   const current=after.find(s=>s.id===status.id);
   if(!current)return false;
   const {appliedDelta:_old,...base}=status;
   const {appliedDelta:_new,...next}=current;
   return JSON.stringify(base)===JSON.stringify(next);
 });
}
function coreEffect(
 before:CombatState,after:CombatState,event:WorldTimelineEvent,
):AuthorizedTimelineEffect{
 if(after.pending||after.round!==timelineRoundOf(event.endsAtTick)||
   JSON.stringify(before.combatCharges??{})!==
     JSON.stringify(after.combatCharges??{})||
   JSON.stringify(before.consumables??{})!==JSON.stringify(after.consumables??{})||
   JSON.stringify(before.droppedWeapons??[])!==JSON.stringify(after.droppedWeapons??[]))
   throw new Error("La acción autónoma alteró un estado sin resolutor V2.");
 const hpDamage:NonNullable<AuthorizedTimelineEffect["hpDamage"]>={};
 const positionDelta:NonNullable<AuthorizedTimelineEffect["positionDelta"]>={};
 const equipmentWear:NonNullable<AuthorizedTimelineEffect["equipmentWear"]>=[];
 const oldStatuses=before.summonStatuses??[];
 const newStatuses=after.summonStatuses??[];
 if(!sameOldStatuses(oldStatuses,newStatuses))
   throw new Error("El familiar alteró estados antiguos sin permiso.");
 for(const side of sides){
   const damage=before.actors[side].hp-after.actors[side].hp;
   if(!Number.isFinite(damage)||damage<0)
     throw new Error("La acción autónoma curó HP sin un módulo de curación.");
   if(damage>0)hpDamage[side]=damage;
   const from=fieldPosition(before.actors[side]);
   const to=fieldPosition(after.actors[side]);
   if(from.x!==to.x||from.y!==to.y)
     positionDelta[side]={x:to.x-from.x,y:to.y-from.y};
   const initial=weaponCopies(before,side),final=weaponCopies(after,side);
   for(const [characterItemId,integrity] of initial){
     const actual=final.get(characterItemId);
     if(actual===undefined||actual>integrity)
       throw new Error("El mundo modificó inventario o reparó equipamiento.");
     if(actual<integrity)equipmentWear.push({
       owner:side,characterItemId,amount:integrity-actual});
   }
   // Validate equipment and approved contact-state deltas together
   // after collecting all actual inventory wear.
 }
 assertEquipmentOnlyShadowStats(before,after,equipmentWear);
 const structures=diffConstructionWorld(before.constructions,after.constructions);
 if(structures.created.length)
   throw new Error("La acción autónoma creó una construcción imprevista.");
 return {
   eventId:event.id,hpDamage,positionDelta,equipmentWear,
   constructionWear:structures.wear,
   logs:after.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END").map(x=>({
     ...x,tick:event.endsAtTick,
     summary:x.summary.replace(/; esperando reacción$/,""),
   })),
 };
}
/** Creature status values were already selected by the official V1 approved
 * template, including RANDOM/COMBAT selectors, then converted into a patch.
 * Inversions and charge transfers require a separate reversible V2 patch.
 */
function approvedNewStatuses(
 before:CombatState,after:CombatState,event:WorldTimelineEvent,
 creature:CombatSummon,
):NonNullable<AuthorizedTimelineEffect["summonContactStatuses"]>{
 const existing=new Set((before.summonStatuses??[]).map(s=>s.id));
 const fresh=(after.summonStatuses??[]).filter(s=>!existing.has(s.id));
 if(fresh.length>(creature.contactEffects?.length??0)||
   fresh.some(s=>s.sourceSummonId!==creature.id||s.by!==creature.owner||
     !creature.contactEffects?.some(e=>e.kind==="APPLY_STATUS"&&
       e.target===(s.target===creature.owner?"USER":"OPPONENT"))))
   throw new Error("El familiar generó estados no definidos por su habilidad.");
 const round=timelineRoundOf(event.endsAtTick);
 return fresh.map((status,i)=>({
   id:"V2_SUMMON:"+event.owner+":"+event.endsAtTick+":"+
     creature.sourceSkillId+":"+creature.id.slice(-60)+":"+i,
   sourceSummonId:creature.id,by:status.by,target:status.target,
   stat:status.stat as StatusStat,operation:status.operation,
   value:status.value,durationTurns:status.expiresAtRound-round,
 }));
}

/** Convert only the inversions the official V1 creature actually
 * performed into reversible V2 deltas. No new status or wallet from
 * client data is accepted, and every inversion is tied to an approved
 * creature-contact micromodule and its exact mana fee.
 */
function approvedInversions(
 before:CombatState,after:CombatState,creature:CombatSummon,
):{inversions:NonNullable<AuthorizedTimelineEffect["summonInversions"]>;
   manaSpent:number;validation:CombatState}{
 const originals=before.summonStatuses??[];
 const modified=(after.summonStatuses??[]).filter(current=>{
   const old=originals.find(s=>s.id===current.id);
   return old&&old.value!==current.value;
 });
 const recipes=(creature.contactEffects??[]).filter(e=>e.kind==="INVERT_STATUS");
 if(modified.length>recipes.length)
   throw new Error("El familiar alteró más estados de los autorizados.");
 const seen=new Set<number>();
 const changes:NonNullable<AuthorizedTimelineEffect["summonInversions"]>=[];
 let manaSpent=0;
 const validation=structuredClone(after);
 const predicted=structuredClone(before);
 for(const status of modified){
   const old=originals.find(s=>s.id===status.id)!;
   if(!isDebuffStatus(old)||old.operation!==status.operation||
     status.target!==old.target||status.by!==old.by||
     status.sourceSummonId!==old.sourceSummonId||
     status.stat!==old.stat||
     Math.abs(status.value-(
       old.operation==="MULTIPLIER"?2-old.value:-old.value))>1e-8)
     throw new Error("Inversión sin estado debilitante original.");
   const index=recipes.findIndex((recipe,i)=>!seen.has(i)&&
     recipe.target===(status.target===creature.owner?"USER":"OPPONENT"));
   if(index<0)throw new Error("La inversión no pertenece a un módulo de contacto aprobado.");
   const recipe=recipes[index];
   if(recipe.kind!=="INVERT_STATUS"||recipe.manaCost<0||
     !Number.isSafeInteger(recipe.manaCost))
     throw new Error("El coste de inversión no está autorizado.");
   seen.add(index);
   manaSpent+=recipe.manaCost;
   const restored=validation.summonStatuses?.find(s=>s.id===status.id);
   if(!restored)throw new Error("Falta el estado a restaurar.");
   restored.value=old.value;
   reconcileSummonStatusStat(validation,status.target,status.stat);
   if(recipe.chargeAccumulator)
     creditCombatCharge(predicted,creature.owner,recipe.chargeAccumulator);
   changes.push({id:status.id,sourceSummonId:creature.id,
     owner:creature.owner,target:status.target,
     ...(recipe.chargeAccumulator?{
       chargeAccumulator:recipe.chargeAccumulator,
     }:{})});
 }
 if(JSON.stringify(predicted.combatCharges??{})!==
   JSON.stringify(after.combatCharges??{}))
   throw new Error("El familiar intentó crear cargas fuera de su inversión.");
 validation.combatCharges=structuredClone(before.combatCharges);
 return {inversions:changes,manaSpent,validation};
}

/** One creature's scheduled turn: FOLLOW can maintain ally contact bonuses,
 * ATTACK can hit a fighter or an enemy summon, and chasing uses the real
 * obstacle and speed rules. The other creatures are inert in this SHADOW
 * so that they receive their own independent world events, not free moves.
 */
export function simulateAutonomousTimelineSummon(
 combat:CombatState,clock:ContinuousCombatTimeline,
 event:WorldTimelineEvent,hitDice:Dice,defenseDice:Dice,
 preparedDefense:Defense={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect{
 validateEvent(clock,event,"AUTO_SUMMON",hitDice,defenseDice);
 const creature=(combat.summons??[]).find(s=>s.id===event.sourceEntityId&&s.owner===event.owner);
 // A 100-tick upkeep may expire the creature at exactly its due tick. That
 // disappearance has already been committed to this common snapshot.
 if(!creature)return {eventId:event.id};
 if(creature.integrity<=0||!creature.chargesMigrated||creature.chaosField)
   throw new Error("El familiar requiere un resolutor avanzado de efectos.");
 if(creature.autoNextTick!==event.endsAtTick||
   ["HOLD","MANUAL"].includes(creature.behavior.mode))
   throw new Error("El familiar no tenía este turno autónomo reservado.");
 const initial=calcShadow(combat,event.owner,event.endsAtTick);
 const hostile=creature.targetId?.startsWith("SUMMON:")
   ?combat.summons?.find(s=>s.id===creature.targetId!.slice(7)&&
     s.owner!==event.owner&&s.integrity>0):undefined;
 // Each extra creature is a bystander in this V1 shadow. The hostile
 // target must remain present but must not receive a free second action.
 const selected:CombatSummon[]=[structuredClone(creature)];
 if(hostile){
   const passiveTarget:CombatSummon=structuredClone(hostile);
   passiveTarget.behavior.mode="HOLD";
   selected.push(passiveTarget);
 }
 initial.summons=selected;
 const advanced=progressAutonomousSummons(initial,hitDice);
 let settled=advanced;
 if(advanced.pending){
   if(advanced.pending.summonId!==creature.id||
     advanced.pending.against!==rival(event.owner))
     throw new Error("El familiar creó un ataque ajeno a su propia iniciativa.");
   settled=applyCombatCommand(advanced,rival(event.owner),
     preparedDefense,defenseDice);
 }
 const current=settled.summons?.find(s=>s.id===creature.id);
 if(!current||typeof current.autoNextTick!=="number"||
   current.autoNextTick<=event.endsAtTick||
   !Number.isSafeInteger(current.autoSpentAp)||
   typeof current.autoRound!=="number")
   throw new Error("El familiar no completó su intervalo de iniciativa.");
 const updates:NonNullable<AuthorizedTimelineEffect["summonUpdates"]>=[
   {id:creature.id,owner:creature.owner,
     fieldPosition:{...current.fieldPosition},
     autoNextTick:current.autoNextTick,
     autoRound:current.autoRound,
     autoSpentAp:current.autoSpentAp},
 ];
 const impacts:NonNullable<AuthorizedTimelineEffect["summonImpacts"]>=[];
 if(hostile){
   const impacted=settled.summons?.find(s=>s.id===hostile.id);
   const left=impacted?.integrity??0,old=hostile.integrity;
   const hitDelta=(impacted?.hitCount??hostile.hitCount+1)-hostile.hitCount;
   if(left>old||hitDelta<0||hitDelta>1)
     throw new Error("Daño a invocación ajena inválido.");
   if(left<old||hitDelta>0)impacts.push({
     id:hostile.id,owner:hostile.owner,damage:old-left,
     hitCountDelta:Math.max(1,hitDelta),
   });
 }
 const approved=approvedInversions(combat,settled,creature);
 for(const side of sides){
   const initial=combat.mana?.[side]?.current??0;
   const actual=settled.mana?.[side]?.current??0;
   const defensiveCost=advanced.pending&&
     side===rival(event.owner)&&
     preparedDefense.defense==="MAGIC_FIELD"?1:0;
   const cost=(side===creature.owner?approved.manaSpent:0)+defensiveCost;
   if(initial-actual!==cost)
     throw new Error("El familiar modificó el maná fuera de su contacto aprobado.");
 }
 const effect=coreEffect(combat,approved.validation,event);
 const statuses=approvedNewStatuses(combat,settled,event,creature);
 return {...effect,summonUpdates:updates,summonImpacts:impacts,
   summonContactStatuses:statuses,
   summonInversions:approved.inversions,
   ...(approved.manaSpent>0?{
     manaSpent:{[creature.owner]:approved.manaSpent},
   }:{})};
}

/** The recurring ray is launched from the placed mirror with exactly the
 * V1 directed-ray pending data and is resolved using the V1 defensive
 * and reflection rules. No caster mana or PA is charged.
 */
export function simulateAutonomousTimelineMirror(
 combat:CombatState,clock:ContinuousCombatTimeline,
 event:WorldTimelineEvent,hitDice:Dice,defenseDice:Dice,
 preparedDefense:Defense={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect{
 validateEvent(clock,event,"AUTO_MIRROR",hitDice,defenseDice);
 const mirror=(combat.constructions??[]).find(c=>
   c.id===event.sourceEntityId&&c.owner===event.owner&&
   c.form==="MIRROR"&&c.mirror&&(c.durability??0)>0);
 if(!mirror)return {eventId:event.id};
 if(timelineRoundOf(event.endsAtTick)<=mirror.createdRound||
   event.endsAtTick%100!==0)
   throw new Error("El espejo no está listo para otro disparo.");
 const shadow=calcShadow(combat,event.owner,event.endsAtTick);
 shadow.mirrorRayQueue=[mirror.id];
 beginNextMirrorRay(shadow);
 let result=shadow;
 if(shadow.pending){
   if(shadow.pending.mirrorId!==mirror.id||!shadow.pending.mirrorAuto||
     shadow.pending.against!==rival(event.owner))
     throw new Error("El rayo automático no pertenece al espejo autorizado.");
   result=applyCombatCommand(shadow,rival(event.owner),
     preparedDefense,defenseDice);
 }
 const effect=coreEffect(combat,result,event);
 if((result.summonStatuses??[]).length!==(combat.summonStatuses??[]).length)
   throw new Error("El espejo creó estados fuera de su fórmula.");
 for(const side of sides){
   const old=combat.mana?.[side]?.current??0;
   const now=result.mana?.[side]?.current??0;
   const expected=shadow.pending&&side===rival(event.owner)&&
     preparedDefense.defense==="MAGIC_FIELD"?1:0;
   if(old-now!==expected)
     throw new Error("El espejo modificó maná sin una acción autorizada.");
 }
 return effect;
}
