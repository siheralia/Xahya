/**
 * D4.1: presentation-only explanations for the player's combat skill roster.
 * Server-side approval, resources, costs, ranges and execution remain authoritative.
 */
import type {CombatSkillPreview} from "./skill-preview.ts";

type Skill=Pick<CombatSkillPreview,
 "executable"|"requirementsSatisfied"|"disabledReason"|"skillKind"|
 "manaCost"|"rangeMeters"|"attackArea"|"usesMagic">;

export type CombatSkillCastGates={
 busy:boolean;
 canUseSkill:boolean;
 invalidAttackMovement:boolean;
 round:number;
 nextRound:number;
 mana:number|null;
 missingAim:boolean;
 outOfRange:boolean;
 missingCharges:boolean;
 missingFusion:boolean;
};

/** Every reason returned here corresponds to a gate already enforced by the roster.
 * Do not infer executable permission from these messages. */
export function combatSkillBlockers(skill:Skill,gates:CombatSkillCastGates):string[]{
 if(!skill.executable)
  return [skill.disabledReason??(skill.requirementsSatisfied
   ?"No existe todavía un resolutor aprobado para esta habilidad."
   :"Faltan requisitos para utilizar esta habilidad.")];

 const messages:string[]=[];
 if(!skill.requirementsSatisfied)
  messages.push("No cumples todos los requisitos de esta habilidad.");
 if(gates.busy)
  messages.push("Se está procesando otra acción. Espera a que termine antes de enviar otra.");
 if(!gates.canUseSkill&&!gates.busy)
  messages.push("Espera tu iniciativa o termina primero la reacción pendiente.");
 if(gates.invalidAttackMovement&&gates.canUseSkill)
  messages.push("El movimiento combinado necesita un trazo válido y PA/ticks suficientes. Revisa el plano de movimiento.");
 if(gates.nextRound===-1)
  messages.push("Esta habilidad ya se utilizó una vez en el encuentro.");
 else if(gates.nextRound>gates.round)
  messages.push("En recuperación: disponible a partir de la ronda "+gates.nextRound+".");
 if(gates.mana===null)
  messages.push("Este encuentro no tiene la reserva de maná necesaria para habilidades. Inicia uno nuevo.");
 else if(gates.mana<skill.manaCost)
  messages.push("Maná insuficiente: necesitas "+skill.manaCost+" y tienes "+gates.mana+".");
 if(gates.missingFusion)
  messages.push("Faltan criaturas activas requeridas para esta fusión.");
 if(gates.missingCharges)
  messages.push("No tienes suficientes cargas para la cantidad seleccionada.");
 if(gates.outOfRange)
  messages.push(skill.rangeMeters===null
   ?"El objetivo está fuera del alcance permitido."
   :"Objetivo fuera de alcance (máximo "+skill.rangeMeters+" m). Acércate antes de lanzar.");
 if(gates.missingAim)
  messages.push(skill.skillKind==="CONSTRUCTION"
   ?"Marca la ubicación de la construcción en el terreno."
   :skill.attackArea
    ?"Prepara el área y señala su posición en el plano."
    :"Marca el objetivo en el plano de magia.");
 return messages;
}
