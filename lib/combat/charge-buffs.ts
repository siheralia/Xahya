/** Safe, server-compiled use of owner-scoped charge pools.
 * Compositions remain generic: no skill is identified by name.
 */
import {validateEffectContainers,type EffectContainer} from "../effects/micro-modules.ts";
import {resolveStatusStat} from "./summon-status.ts";

export type ChargeBuffPlan={
 accumulator:string;minCharges:number;maxCharges:number;
 perChargePercent:number;stats:string[];durationTurns:number;
};
const object=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==="object"&&!Array.isArray(x);

/** Null for unrelated skill graphs. Once a charge-related step is present
 * every action MUST be recognized; unsupported combinations fail closed.
 */
export function compileChargeBuff(effects:readonly unknown[],manaCost:number):ChargeBuffPlan|null{
 const composite=effects.filter(e=>object(e)&&e.type==="COMPOSED") as {module:EffectContainer}[];
 const chargeKinds=new Set(["CONSUME_COMBAT_CHARGES","APPLY_CHARGE_BUFF"]);
 const touchesCharges=composite.some(e=>Array.isArray(e.module?.steps)&&
   e.module.steps.some(step=>chargeKinds.has(step?.kind)));
 if(!touchesCharges)return null;
 if(effects.length!==1||composite.length!==1||!object(composite[0]?.module))
   throw new Error("La habilidad de cargas solo admite un grafo modular.");
 const [module]=composite.map(e=>e.module);
 const validationError=validateEffectContainers([module]);
 if(validationError)throw new Error(validationError);
 if(module.trigger!=="ACTIVATE"||module.impactKind||module.requirements?.length||
   module.steps.length!==2||module.steps.some(step=>step.when?.length))
   throw new Error("La potenciación por cargas necesita activación directa y dos pasos sin condiciones.");
 const [consume,buff]=module.steps;
 if(consume.kind!=="CONSUME_COMBAT_CHARGES"||buff.kind!=="APPLY_CHARGE_BUFF")
   throw new Error("Conecta primero el consumo de cargas y después la potenciación.");
 if(!object(buff.charges)||buff.charges.source!=="OUTPUT"||buff.charges.key!==consume.output)
   throw new Error("La potenciación debe conectarse directamente al conteo gastado.");
 if(consume.manaCost!==manaCost)
   throw new Error("El maná de la habilidad debe coincidir con el coste del micromódulo de cargas.");
 if(!Array.isArray(buff.stats)||buff.stats.some(stat=>!resolveStatusStat(stat))||
   new Set(buff.stats.map(stat=>resolveStatusStat(stat))).size!==buff.stats.length)
   throw new Error("Las estadísticas de la potenciación deben ser válidas y distintas.");
 if(consume.maxCharges>6||buff.perChargePercent*consume.maxCharges>200)
   throw new Error("La potenciación supera los límites permitidos.");
 return {
   accumulator:consume.accumulator,minCharges:consume.minCharges,maxCharges:consume.maxCharges,
   perChargePercent:buff.perChargePercent,stats:[...buff.stats],durationTurns:buff.durationTurns,
 };
}
