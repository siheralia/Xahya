/**
 * Approved construction / barrier / mirror creation for the V2 clock.
 *
 * A staff-reviewed CONSTRUCTION cast is measured in the existing V1 engine,
 * but only authorized results (one new structure, HP deltas, barrier wear,
 * mana, and the skill cooldown) enter the simultaneous V2 batch.
 *
 * A physical block has measured world geometry. Drawn canvas sprites alone
 * never become obstacles. A directed mirror uses its real world ray geometry.
 * Autonomous mirror rays on following rounds require their own world events.
 */
import {
 applyResolvedCombatSkill,applyCombatCommand,turnTicks,
 type CombatState,type CombatCommand,type Side,
} from "./turn-engine.ts";
import {timelineRoundOf,type ContinuousCombatTimeline,type TimelineEvent}
 from "./action-timeline.ts";
import {fieldPosition} from "./field-plane.ts";
import {measuredBlock} from "./physical-obstacles.ts";
import type {CombatConstruction} from "./constructs.ts";
import {firstMirrorAlongMagicRay} from "./constructs.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import {isolatePhysicalShadow,weaponCopies} from "./timeline-basic-strike.ts";

type Skill=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
type Defend=Extract<CombatCommand,{kind:"DEFEND"}>;
type Dice={hit:number;critical:number;defense:number};
const sides=["PLAYER","NPC"] as const;
const other=(s:Side):Side=>s==="PLAYER"?"NPC":"PLAYER";
const validDice=(d:Dice)=>d!=null&&
 [d.hit,d.critical,d.defense].every(v=>Number.isFinite(v)&&v>=0&&v<=1);
const validPoint=(p:unknown):p is {x:number;y:number}=>{
 const v=p as {x?:number;y?:number}|null;
 return !!v&&Number.isFinite(v.x)&&Number.isFinite(v.y);
};

/** Conservatively translate authorized physical wear. Any change of
 * material/position/ownership/resistance that is not a durability/hitCount
 * delta is rejected instead of silently overwritten.
 */
export function diffConstructionWorld(
 before:Readonly<CombatConstruction[]>|undefined,
 after:Readonly<CombatConstruction[]>|undefined,
):{
 created:CombatConstruction[];
 wear:NonNullable<AuthorizedTimelineEffect["constructionWear"]>;
}{
 const original=before??[],finished=after??[];
 const previous=new Map(original.map(c=>[c.id,c]));
 const current=new Map(finished.map(c=>[c.id,c]));
 if(previous.size!==original.length||current.size!==finished.length)
   throw new Error("Las construcciones contienen identificadores repetidos.");
 const created=finished.filter(c=>!previous.has(c.id))
   .map(c=>structuredClone(c));
 const wear:NonNullable<AuthorizedTimelineEffect["constructionWear"]>=[];
 for(const old of original){
   const updated=current.get(old.id);
   const oldShape={...old,durability:undefined,hitCount:undefined};
   const nextShape=updated?{...updated,durability:undefined,hitCount:undefined}:oldShape;
   if(JSON.stringify(oldShape)!==JSON.stringify(nextShape))
     throw new Error("La construcción cambió su geometría sin autorización temporal.");
   const starting=old.durability??0;
   const ending=updated?.durability??0;
   if(!Number.isFinite(starting)||!Number.isFinite(ending)||
     ending>starting||starting<0||ending<0)
     throw new Error("Una construcción fue reparada o alterada sin autorización.");
   const oldHits=old.hitCount??0,afterHits=updated?.hitCount??oldHits+1;
   if(!Number.isSafeInteger(afterHits)||afterHits<oldHits||
     afterHits-oldHits>10)
     throw new Error("Impactos de construcción fuera de la regla aprobada.");
   if(ending<starting||afterHits>oldHits){
     wear.push({id:old.id,amount:starting-ending,
       hitCountDelta:afterHits-oldHits});
   }
   if(!updated&&ending!==0)
     throw new Error("Una construcción fue retirada antes de agotar su durabilidad.");
 }
 return {created,wear};
}
export function simulateApprovedTimelineConstruction(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Skill,plan:CombatSkillPlan,hitDice:Dice,defenseDice:Dice,
 preparedDefense:Defend={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.kind!=="SKILL"||event.status!=="RESOLVED"||
   event.endsAtTick!==clock.nowTick||
   event.paidAp!==1||event.durationTicks!==turnTicks(combat.actors[event.owner])||
   !validDice(hitDice)||!validDice(defenseDice))
   throw new Error("La construcción no llegó al tick autorizado.");
 if(command.kind!=="CAST_SKILL"||plan.category!=="CONSTRUCTION"||
   command.skillId!==plan.id||!plan.construction||
   !Number.isSafeInteger(plan.cost)||plan.cost<0||
   !/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId)||
   !validPoint(command.areaCenter)||
   Object.keys(command).some(k=>!["kind","skillId","requestId",
     "areaCenter","constructionFieldPoint","constructionHeightMeters",
     "constructionFootprintRadiusMeters","constructionSolidHeightMeters",
     "constructionForm","constructionLabel"].includes(k)))
   throw new Error("La creación requiere un plan y coordenadas oficiales.");
 if((combat.constructions?.length??0)>=120||
   (combat.summons?.length??0)>0||
   (combat.droppedWeapons?.length??0)>0||
   Object.values(combat.microEffects?.definitions??{}).some(v=>v?.length))
   throw new Error("Hay entidades que necesitan un resolutor de interacción avanzado.");
 const owner=event.owner,target=other(owner);
 const mana=combat.mana?.[owner]?.current;
 if(mana===undefined||!Number.isFinite(mana)||mana<plan.cost)
   throw new Error("Maná insuficiente para construir.");
 const round=timelineRoundOf(event.endsAtTick);
 const cooldown=combat.skillCooldowns?.[owner]?.[String(plan.id)]??0;
 if(cooldown===-1||cooldown>round)
   throw new Error("La creación todavía está en enfriamiento.");
 const preWear={
   PLAYER:weaponCopies(combat,"PLAYER"),NPC:weaponCopies(combat,"NPC"),
 };
 const shadow=isolatePhysicalShadow(combat,owner);
 shadow.round=round;
 shadow.tick=(round-1)*100;
 const launched=applyResolvedCombatSkill(shadow,owner,plan,{
   requestId:command.requestId,areaCenter:command.areaCenter,
   constructionFieldPoint:command.constructionFieldPoint,
   constructionHeightMeters:command.constructionHeightMeters,
   constructionFootprintRadiusMeters:command.constructionFootprintRadiusMeters,
   constructionSolidHeightMeters:command.constructionSolidHeightMeters,
   constructionForm:command.constructionForm,
   constructionLabel:command.constructionLabel,
 },hitDice);
 if(Boolean(launched.pending)!==Boolean(plan.mirror))
   throw new Error("La creación dejó un ataque inesperado pendiente.");
 const resolved=plan.mirror
   ?applyCombatCommand(launched,target,preparedDefense,defenseDice):launched;
 if(resolved.pending)
   throw new Error("El espejo no pudo resolver su primer rayo.");
 const constructionDelta=diffConstructionWorld(
   combat.constructions,resolved.constructions);
 if(constructionDelta.created.length!==1||
   !constructionDelta.created[0]||
   constructionDelta.created[0].sourceSkillId!==plan.id||
   constructionDelta.created[0].owner!==owner)
   throw new Error("La habilidad no creó exactamente una construcción aprobada.");
 const created=constructionDelta.created[0];
 if(plan.mirror&&created.form!=="MIRROR"||
   !plan.mirror&&created.form==="MIRROR")
   throw new Error("Se alteró la forma del espejo autorizado.");
 const spent=mana-(resolved.mana?.[owner]?.current??NaN);
 if(spent!==plan.cost)
   throw new Error("El coste de creación no coincide con el plan.");
 const targetSpent=(combat.mana?.[target]?.current??NaN)-
   (resolved.mana?.[target]?.current??NaN);
 if(targetSpent!==(plan.mirror&&preparedDefense.defense==="MAGIC_FIELD"?1:0))
   throw new Error("La creación modificó los recursos del objetivo.");
 const nextCooldown=resolved.skillCooldowns?.[owner]?.[String(plan.id)];
 if(typeof nextCooldown!=="number"||!Number.isSafeInteger(nextCooldown))
   throw new Error("Enfriamiento de creación no registrado.");
 const hpDamage:NonNullable<AuthorizedTimelineEffect["hpDamage"]>={};
 const equipmentWear:NonNullable<AuthorizedTimelineEffect["equipmentWear"]>=[];
 for(const side of sides){
   const damage=combat.actors[side].hp-resolved.actors[side].hp;
   if(!Number.isFinite(damage)||damage<0)
     throw new Error("La creación produjo curación no declarada.");
   if(damage>0)hpDamage[side]=damage;
   const final=weaponCopies(resolved,side);
   for(const [characterItemId,initialDurability] of preWear[side]){
     const remaining=final.get(characterItemId);
     if(remaining===undefined||remaining>initialDurability)
       throw new Error("La creación alteró equipamiento sin autorización.");
     if(remaining<initialDurability)
       equipmentWear.push({owner:side,characterItemId,
         amount:initialDurability-remaining});
   }
   if(JSON.stringify(fieldPosition(combat.actors[side]))!==
      JSON.stringify(fieldPosition(resolved.actors[side])))
     throw new Error("La creación desplazó a un personaje sin orden.");
 }
 return {
   eventId:event.id,constructionsCreated:constructionDelta.created,
   constructionWear:constructionDelta.wear,
   hpDamage,equipmentWear,manaSpent:{[owner]:spent},
   skillCooldowns:[{owner,skillId:plan.id,nextAvailableRound:nextCooldown}],
   logs:resolved.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END")
     .map(x=>({...x,tick:event.endsAtTick})),
 };
}

/** Mirror rays from the NEXT round are not an instantaneous attack from
 * creation. Emit actual boundary timestamps, not invented timeouts.
 * Until the autonomous batch-merger is installed these are read-only plans.
 */
export function scheduleMirrorRayTicks(
 combat:CombatState,fromTick:number,toTick:number,
):Array<{tick:number;constructionId:string;owner:Side}>{
 if(!Number.isSafeInteger(fromTick)||!Number.isSafeInteger(toTick)||
   fromTick<0||toTick<fromTick||toTick-fromTick>100_000)
   throw new Error("Horizonte de rayos de espejo inválido.");
 const rays:Array<{tick:number;constructionId:string;owner:Side}>=[];
 for(const mirror of combat.constructions??[]){
   if(mirror.form!=="MIRROR"||!mirror.mirror||
     !mirror.tangible||(mirror.durability??0)<=0)continue;
   for(let tick=(Math.floor(fromTick/100)+1)*100;tick<=toTick;tick+=100){
     if(timelineRoundOf(tick)<=mirror.createdRound)continue;
     rays.push({tick,constructionId:mirror.id,owner:mirror.owner});
     if(rays.length>256)throw new Error("Demasiados rayos autónomos previstos.");
   }
 }
 return rays.sort((a,b)=>a.tick-b.tick||
   a.constructionId.localeCompare(b.constructionId));
}
export {firstMirrorAlongMagicRay,measuredBlock};
