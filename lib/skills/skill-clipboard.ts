import type { VariableResistance } from "./variable-resistance";
/** Printable, shareable summary of a single character skill. */
export type ShareableSkillEffect = {
  type:string;
  target?:string;
  value?:number;
  description?:string;
  element?:string | null;
  durationTurns?:number;
  durationMovements?:number;
  targetKind?:string;
  targetReference?:string;
  activationCondition?:string;
};
export type ShareableSkill = {
  name:string;
  category:string;
  status?:string;
  description?:string | null;
  cost?:number;
  pchCost?:number;
  maintenanceCost?:number;
  accumulationCost?:number;
  accumulationPerTick?:number;
  duration?:string | null;
  areaOfEffect?:string | null;
  speed?:string | null;
  cooldown?:string | null;
  condition?:string | null;
  effect?: readonly ShareableSkillEffect[];
  effectRequirements?: readonly {effect:string;element?:string}[];
  mechanics?: {family?:string;parentSkillId?:number;variableResistance?:VariableResistance};
};

const categories:Record<string,string> = {
  OFFENSIVE:"Ofensiva",PASSIVE:"Pasiva",SUPPORT:"Soporte",UTILITY:"Utilidad",BASIC:"Básica",
};
const statuses:Record<string,string> = {
  APPROVED:"Aprobada",PENDING:"Pendiente de aprobación",REJECTED:"Rechazada",
};

export function formatSkillForClipboard(
  skill:ShareableSkill,
  labels?:{effects?:Readonly<Record<string,string>>;targets?:Readonly<Record<string,string>>},
):string {
  const lines = [
    `*HABILIDAD: ${skill.name}*`,
    `Categoría: ${categories[skill.category]??skill.category}`,
    ...(skill.status ? [`Estado: ${statuses[skill.status]??skill.status}`] : []),
    `Maná por uso: ${Number(skill.cost??0)}`,
    ...(Number.isFinite(skill.pchCost) ? [`Costo de construcción: ${skill.pchCost} PCH`] : []),
    ...(Number(skill.maintenanceCost??0)>0 ? [`Mantenimiento por turno: ${skill.maintenanceCost} maná`] : []),
    ...(Number(skill.accumulationPerTick??0)>0 ? [`Acumulaciones por tick: ${skill.accumulationPerTick}`] : []),
    ...(Number(skill.accumulationCost??0)>0 ? [`Costo de acumulación: ${skill.accumulationCost}`] : []),
    ...(skill.duration ? [`Duración: ${skill.duration}`] : []),
    ...(skill.areaOfEffect ? [`Área: ${skill.areaOfEffect}`] : []),
    ...(skill.speed ? [`Velocidad: ${skill.speed}`] : []),
    ...(skill.cooldown ? [`Cooldown: ${skill.cooldown}`] : []),
    ...(skill.condition ? [`Condición: ${skill.condition}`] : []),
    ...(skill.mechanics?.family ? [`Familia: ${skill.mechanics.family}`] : []),
    ...(skill.mechanics?.parentSkillId ? [`Habilidad madre: #${skill.mechanics.parentSkillId}`] : []),
    ...(skill.description ? ["",skill.description] : []),
    ...(skill.mechanics?.variableResistance ? [
      "", "*RESISTENCIA VARIABLE*",
      `Base: ${skill.mechanics.variableResistance.baseStat}`,
      `Variable: ${skill.mechanics.variableResistance.input}`,
      `Fórmula: ${skill.mechanics.variableResistance.formula}`,
      `Máximo: ×${skill.mechanics.variableResistance.maxMultiplier}; mínimo: ×${skill.mechanics.variableResistance.minMultiplier}; umbral: ${skill.mechanics.variableResistance.threshold}; coeficiente: ${skill.mechanics.variableResistance.coefficient}`,
    ] : []),
  ];
  if(skill.effect?.length) {
    lines.push("","*EFECTOS*");
    for(const effect of skill.effect) {
      const label = effect.type==="NARRATIVE"
        ? (effect.description?.trim() || labels?.effects?.[effect.type] || "Efecto narrativo")
        : (labels?.effects?.[effect.type] || effect.type);
      const detail = [
        effect.type==="NARRATIVE" ? null : (effect.target ? labels?.targets?.[effect.target]??effect.target : null),
        effect.type==="NARRATIVE" ? null : (effect.value!==undefined ? `Potencia: ${effect.value}` : null),
        effect.element && effect.element!=="NEUTRAL" ? `Elemento: ${effect.element}` : null,
        effect.targetKind && effect.targetKind!=="SELF" ? `Destino: ${effect.targetKind}` : null,
        effect.targetReference ? `Referencia: ${effect.targetReference}` : null,
        effect.durationTurns ? `${effect.durationTurns} turno(s)` : null,
        effect.durationMovements ? `${effect.durationMovements} movimiento(s)` : null,
        effect.activationCondition && effect.activationCondition!=="NONE" ? `Condición del efecto: ${effect.activationCondition}` : null,
      ].filter(Boolean);
      lines.push(`• ${label}${detail.length?" · "+detail.join(" · "):""}`);
    }
  }
  if(skill.effectRequirements?.length) {
    lines.push("","*REQUISITOS*");
    for(const req of skill.effectRequirements) {
      lines.push(`• ${labels?.effects?.[req.effect]??req.effect}${req.element?" + "+req.element:""}`);
    }
  }
  return lines.join("\n");
}
