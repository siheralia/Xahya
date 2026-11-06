/** Reusable authoritative compiler and geometry for summoned-creature fusion.
 * Fusion removes only already present, owner-controlled creatures. A chaos
 * field transforms deliberate movement, not attack trajectories or knockback.
 */
import {validateEffectContainers,type EffectContainer,type EntityBehaviorMode} from "../effects/micro-modules.ts";
import type {CombatState,Point,Side} from "./turn-engine.ts";
import type {SummonTemplate,SummonStat,SummonLink,CombatSummon} from "./summons.ts";
import {fieldPosition} from "./field-plane.ts";

export type ChaosFieldConfig={
 radiusMeters:number;rotationDegrees:90|180|270;rotateEachRound:boolean;
};
export type FusionPlan={
 sourceEntityKeys:string[];
 summon:SummonTemplate;
 chaosField?:ChaosFieldConfig;
};
type RecordLike=Record<string,unknown>;
const obj=(v:unknown):v is RecordLike=>!!v&&typeof v==="object"&&!Array.isArray(v);
const SOURCE=new Set(["PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI","MOVE_SPEED",
 "PRECISION","DODGE","STR","STRENGTH","MAGIC_ATTACK","MAGIC_DEFENSE",
 "CON","CRITICAL","LUCK","RACE","MASS_KG"]);
const DEST=new Set<SummonStat>(["PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI",
 "INTEGRITY","MOVE_SPEED","PRECISION","DODGE","STRENGTH","MAGIC_ATTACK",
 "MAGIC_DEFENSE","CON","CRITICAL","LUCK","RACE","MASS_KG"]);
const REQUIRED=["PHYSICAL_ATTACK","AGI","INTEGRITY"] as const;

/** Returns null for unrelated effect graphs; mixed or malformed fusion graphs fail closed. */
export function compileFusionPlan(effects:readonly unknown[],manaCost:number):FusionPlan|null{
 const composed=effects.filter(e=>obj(e)&&e.type==="COMPOSED") as Array<{module:EffectContainer}>;
 const hasFusion=composed.some(e=>e.module?.steps?.some(s=>s.kind==="FUSE_SUMMONS"||s.kind==="CHAOS_FIELD"));
 if(!hasFusion)return null;
 if(effects.length!==1||composed.length!==1||!obj(composed[0]?.module))
   throw new Error("La fusión necesita un único grafo modular sin efectos externos.");
 const module=composed[0].module;
 const invalid=validateEffectContainers([module]);
 if(invalid)throw new Error(invalid);
 if(module.trigger!=="ACTIVATE"||module.impactKind||module.requirements?.length)
   throw new Error("La fusión debe activarse directamente sin condiciones pendientes.");
 let plan:FusionPlan|null=null;
 let configuredBehavior=false;
 let configuredField=false;
 for(const step of module.steps){
   if(step.when?.length)throw new Error("La fusión no acepta condiciones sin resolutor.");
   if(step.kind==="FUSE_SUMMONS"){
     if(plan)throw new Error("Solo puede haber una fusión por habilidad.");
     if(step.manaCost!==manaCost)throw new Error("El maná de la habilidad no coincide con el de la fusión.");
     plan={
       sourceEntityKeys:[...step.sourceEntityKeys],
       summon:{entityKey:step.entityKey,label:step.label,manaCost:step.manaCost,
         maintenanceMana:step.maintenanceMana,durationTurns:step.durationTurns,
         controlRangeMeters:step.controlRangeMeters,hitLimit:step.hitLimit,
         links:[],contactEffects:[],
         behavior:{mode:"HOLD",allowedModes:["HOLD"],target:"USER",trigger:"COMMAND"}}
     };
   }else if(step.kind==="SET_ENTITY_STAT"||step.kind==="LINK_ENTITY_STAT"){
     if(!plan||step.entityKey!==plan.summon.entityKey)
       throw new Error("Los atributos deben pertenecer a la criatura fusionada.");
     if(!DEST.has(step.destStat as SummonStat))
       throw new Error("Estadística de la fusión no implementada.");
     if(plan.summon.links.some(x=>x.destStat===step.destStat))
       throw new Error("No puedes asignar dos veces la misma estadística fusionada.");
     let link:SummonLink;
     if(step.kind==="SET_ENTITY_STAT"){
       link={mode:"FIXED",destStat:step.destStat as SummonStat,value:step.value};
     }else{
       if(!SOURCE.has(step.sourceStat)||typeof step.factor!=="number"||
         !Number.isFinite(step.factor)||step.factor<0||step.factor>10)
         throw new Error("El vínculo dinámico necesita una estadística y factor válidos.");
       if(step.destStat==="INTEGRITY"&&step.sourceStat!=="PHYSICAL_DEFENSE")
         throw new Error("La integridad dinámica debe proceder de la defensa física.");
       link={mode:"LINK",sourceStat:step.sourceStat,
         destStat:step.destStat as SummonStat,factor:step.factor};
     }
     plan.summon.links.push(link);
   }else if(step.kind==="SET_ENTITY_BEHAVIOR"){
     if(!plan||configuredBehavior||step.entityKey!==plan.summon.entityKey||
       !["USER","OPPONENT"].includes(step.target))
       throw new Error("La fusión requiere un comportamiento propio autorizado.");
     plan.summon.behavior={mode:step.mode,allowedModes:[...step.allowedModes],
       target:step.target,trigger:step.trigger};
     configuredBehavior=true;
   }else if(step.kind==="CHAOS_FIELD"){
     if(!plan||configuredField||step.entityKey!==plan.summon.entityKey)
       throw new Error("El campo de caos debe pertenecer a una fusión única.");
     plan.chaosField={radiusMeters:step.radiusMeters,
       rotationDegrees:step.rotationDegrees,rotateEachRound:step.rotateEachRound};
     configuredField=true;
   }else{
     throw new Error("Micromódulo sin resolutor para fusión: "+step.kind);
   }
 }
 if(!plan)throw new Error("El grafo no contiene una fusión ejecutable.");
 if(!configuredBehavior||REQUIRED.some(key=>!plan!.summon.links.some(x=>x.destStat===key)))
   throw new Error("La fusión necesita comportamiento, ataque físico, agilidad e integridad.");
 return plan;
}

/** Angle is always a nonzero quarter turn. Cycling never yields zero degrees. */
export function chaosRotationDegrees(config:ChaosFieldConfig,createdRound:number,round:number):90|180|270{
 const base=(config.rotationDegrees/90)-1;
 const phase=config.rotateEachRound?Math.max(0,round-createdRound):0;
 return (90*(1+(base+phase)%3)) as 90|180|270;
}

/** Nearest hostile field affects the movement, evaluated from its START point.
 * No client field ID or arbitrary angle is ever accepted. */
export function activeChaosField(state:CombatState,side:Side):{
 summon:CombatSummon;config:ChaosFieldConfig;degrees:90|180|270;
}|null{
 const actor=state.actors[side];
 const start=fieldPosition(actor);
 const sources=(state.summons??[]).filter(s=>s.owner!==side&&s.chaosField&&
   s.integrity>0&&s.expiresAtRound>state.round).map(s=>({
      summon:s,config:s.chaosField!,
      distance:Math.hypot(start.x-s.fieldPosition.x,start.y-s.fieldPosition.y)
   })).filter(x=>x.distance<=x.config.radiusMeters+1e-8)
   .sort((a,b)=>a.distance-b.distance||a.summon.id.localeCompare(b.summon.id));
 const chosen=sources[0];
 return chosen?{summon:chosen.summon,config:chosen.config,
   degrees:chaosRotationDegrees(chosen.config,chosen.summon.createdRound,state.round)}:null;
}

export function rotateChaosVector(vector:Point,degrees:90|180|270):Point{
 if(!Number.isFinite(vector.x)||!Number.isFinite(vector.y))
   throw new Error("Vector de movimiento inválido.");
 const changed=degrees===90?{x:-vector.y,y:vector.x}:
   degrees===180?{x:-vector.x,y:-vector.y}:{x:vector.y,y:-vector.x};
 // Avoid -0 in serialized vectors, signed-zero diffs and UI previews.
 return {x:changed.x===0?0:changed.x,y:changed.y===0?0:changed.y};
}
export function distortChaosMove(state:CombatState,side:Side,vector:Point):Point{
 const field=activeChaosField(state,side);
 return field?rotateChaosVector(vector,field.degrees):vector;
}
