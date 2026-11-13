/**
 * Staff-approved encounter PASSIVE micro graphs in V2.
 *
 * V1's three reviewed phases are preserved:
 *  - PASSIVE: resistance multiplier while the approved charge pool is empty;
 *  - DAMAGE_RESOLVED: store only real mitigation from an actual contact;
 *  - TURN_START: regenerate an approved percentage of maximum HP when charged.
 *
 * Every resolved contact comes from a trusted V2 effect, so two simultaneous
 * hits compute against the SAME pre-impact resistance. The micro ledger is
 * then advanced once per contact, in deterministic event order, inside the
 * same atomic batch. No client-supplied graph, delta, or tick is accepted.
 */
import type {CombatLog,CombatState,Side} from "./turn-engine.ts";
import {executeMicroEvent,type EffectContainer} from "../effects/micro-modules.ts";
const sides=["PLAYER","NPC"] as const;

function approvedDefinition(effect:EffectContainer):boolean{
 if(effect.type!=="APPROVED_PASSIVE"||effect.steps.length!==1||
   effect.impactKind!==undefined||effect.requirements!==undefined)
   return false;
 const step=effect.steps[0];
 if(effect.trigger==="DAMAGE_RESOLVED")
   return step.kind==="STORE"&&
     /^S[1-9][0-9]*_CHARGE$/.test(step.accumulator)&&
     Number.isSafeInteger(step.capacity)&&step.capacity>=1&&step.capacity<=5&&
     typeof step.value==="object"&&step.value!==null&&
     "source" in step.value&&step.value.source==="EVENT"&&
     step.value.key==="MITIGATED_DAMAGE"&&step.when===undefined;
 if(effect.trigger==="PASSIVE")
   return step.kind==="MODIFIER"&&step.stat==="RESISTANCE"&&
     step.sourceTarget===undefined&&step.sourceElement===undefined&&
     typeof step.multiplier==="number"&&step.multiplier>=1&&
     step.multiplier<=1.3&&
     step.when?.length===1&&step.when[0].compare==="EQ"&&
     step.when[0].right===0&&
     typeof step.when[0].left==="object"&&
     "source" in step.when[0].left&&
     step.when[0].left.source==="CHARGES";
 if(effect.trigger==="TURN_START")
   return step.kind==="HEAL"&&
     typeof step.amount==="object"&&step.amount!==null&&
     "operator" in step.amount&&step.amount.operator==="PERCENT"&&
     step.amount.args.length===2&&
     typeof step.amount.args[0]==="object"&&
     step.amount.args[0]!==null&&
     "source" in step.amount.args[0]&&
     step.amount.args[0].source==="STAT"&&
     step.amount.args[0].key==="MAX_HP"&&
     Number.isSafeInteger(step.amount.args[1])&&
     (step.amount.args[1] as number)>=1&&
     (step.amount.args[1] as number)<=10&&
     step.when?.length===1&&step.when[0].compare==="GTE"&&
     step.when[0].right===1&&
     typeof step.when[0].left==="object"&&
     "source" in step.when[0].left&&
     step.when[0].left.source==="CHARGES";
 return false;
}

export function assertApprovedV2Passives(state:CombatState):void{
 const runtime=state.microEffects;
 if(!runtime)return;
 if(!Number.isSafeInteger(runtime.sequence)||runtime.sequence<0||
   runtime.sequence>=1_000_000_000)
   throw new Error("Secuencia de pasivas inválida para V2.");
 for(const side of sides){
   const defs=runtime.definitions[side]??[];
   if(defs.length>8||defs.some(e=>!approvedDefinition(e)))
     throw new Error("El encuentro contiene una pasiva sin resolutor V2 revisado.");
   const stores=defs.filter(e=>e.trigger==="DAMAGE_RESOLVED");
   const modifiers=defs.filter(e=>e.trigger==="PASSIVE");
   const healings=defs.filter(e=>e.trigger==="TURN_START");
   if(modifiers.length>1||healings.length>1||
     stores.length===0&&defs.length>0||
     stores.length>3)
     throw new Error("La combinación de pasivas excede los límites aprobados.");
   const pools=new Set(stores.map(e=>{
     const step=e.steps[0];
     return step.kind==="STORE"?step.accumulator:"";
   }));
   const referenced=defs.filter(e=>e.trigger!=="DAMAGE_RESOLVED");
   if(referenced.some(e=>{
     const source=e.steps[0].when?.[0]?.left;
     return typeof source!=="object"||source===null||
       !("key" in source)||!pools.has(String(source.key));
   }))
     throw new Error("La pasiva usa cargas sin una fuente aprobada.");
 }
}

function run(
 state:CombatState,side:Side,trigger:"TURN_START"|"DAMAGE_RESOLVED",
 payload?:Record<string,number>,
):void{
 const runtime=state.microEffects;
 if(!runtime)return;
 const defs=runtime.definitions[side]??[];
 if(!defs.some(x=>x.trigger===trigger))return;
 if(runtime.sequence>=1_000_000_000-1)
   throw new Error("Demasiadas activaciones pasivas en la sesión.");
 const actor=state.actors[side];
 const result=executeMicroEvent(runtime.state,defs,{
   eventId:"CombatEvent"+(++runtime.sequence),ownerId:side==="PLAYER"?1:2,
   trigger,stats:{HP:actor.hp,MAX_HP:actor.maxHp,STR:actor.strength,
     PHYSICAL_DEFENSE:actor.physicalDefense,MAGIC_DEFENSE:actor.magicDefense},
   event:payload,
 });
 if(trigger==="DAMAGE_RESOLVED"&&result.intents.length)
   throw new Error("Una pasiva de mitigación no puede emitir efectos adicionales.");
 if(trigger==="TURN_START"){
   if(result.intents.some(x=>x.kind!=="HEAL"))
     throw new Error("La regeneración intentó aplicar un efecto no autorizado.");
   for(const intent of result.intents){
     if(intent.kind!=="HEAL"||intent.applied<=0)continue;
     actor.hp=result.hp;
     const log:CombatLog={kind:"REGEN",tick:state.tick,by:side,
       healingPoints:intent.applied,
       summary:actor.name+" regeneró "+intent.applied+" HP al comenzar el turno"};
     state.log.push(log);
     state.narrativeHistory??=[];
     state.narrativeHistory.push(log);
   }
 }
 runtime.state=result.state;
}

/** Called only while crossing actual 100-tick turn boundaries, after
 * status expiry and upkeep and BEFORE simultaneous attacks finish. */
export function applyV2ApprovedPassiveRoundStart(state:CombatState):void{
 assertApprovedV2Passives(state);
 for(const side of sides)run(state,side,"TURN_START");
}

/** Contact is from a completed trusted hit, never inferred from an HTTP
 * declaration. Zero mitigation does not fill a charge, as in V1. */
export function applyV2ApprovedPassiveContact(
 state:CombatState,entry:CombatLog,
):void{
 if(entry.kind!=="RESOLVE"||entry.contact!==true||!entry.against)return;
 // A RESOLVE can also describe damage to another summon or a cover item,
 // neither of which is a character's DAMAGE_RESOLVED micro event.
 if(!state.microEffects?.definitions[entry.against]?.some(e=>
   e.trigger==="DAMAGE_RESOLVED")||
   entry.mitigatedByResistance===undefined)return;
 const prevented=entry.mitigatedByResistance;
 if(typeof prevented!=="number"||!Number.isFinite(prevented)||prevented<0)
   throw new Error("Daño mitigado inválido para el micromódulo pasivo.");
 run(state,entry.against,"DAMAGE_RESOLVED",{
   MITIGATED_DAMAGE:prevented,
   APPLIED_DAMAGE:Math.max(0,entry.damage??0),
   UNPROTECTED_DAMAGE:Math.max(0,entry.damage??0)+prevented,
 });
}
