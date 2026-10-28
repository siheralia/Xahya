"use client";

import { useState } from "react";

export const SKILL_FIELD_HELP = {
  name: "Nombre con el que aparecerá la habilidad en tu ficha.",
  description: "Explica qué hace la habilidad y cómo se usa durante el juego.",
  category: "Clasifica la habilidad: ofensiva, pasiva, soporte, utilidad o básica.",
  effectType: "Define qué hace el efecto: daño, mejora de estadísticas, defensa, recursos u otra acción.",
  effectTarget: "Estadística, recurso o aspecto que modifica el tipo de efecto seleccionado. Algunos tipos no requieren objetivo.",
  effectPower: "Magnitud del efecto. En efectos multiplicadores, 100 equivale a ×1 y 150 a ×1,5.",
  effectRecipient: "Indica quién o qué recibe el efecto: tú, otro personaje, un oponente o un objeto.",
  effectReference: "Identificador opcional del personaje, oponente u objeto concreto cuando haga falta distinguirlo.",
  effectCondition: "Requisito para activar el efecto, como tener poca vida o estar de noche.",
  effectDuration: "Cuántos turnos o movimientos dura el efecto; instantáneo ocurre al activarse.",
  effects: "Son las acciones concretas que ejecuta la habilidad. Cada efecto contribuye al precio PCH.",
  cost: "Maná que se consume cada vez que utilizas la habilidad. Más maná puede reducir el precio de creación en PCH.",
  duration: "Tiempo durante el cual permanece activa. Instantánea significa que ocurre al usarla.",
  cooldown: "Tiempo o condición que debe pasar antes de poder usarla nuevamente.",
  speed: "Determina la velocidad de activación. La velocidad distinta a la predeterminada aumenta el precio PCH.",
  areaOfEffect: "Objetivo único afecta a uno solo; un área puede alcanzar varios objetivos.",
  maxRangeMeters: "Distancia máxima a la que puedes utilizar la habilidad. Cinco metros no modifica el PCH; más distancia cuesta más y menos distancia descuenta.",
  maintenanceCost: "Maná que se consume por cada turno que permanece activa. Solo aplica a duraciones no instantáneas.",
  accumulationPerTick: "Cantidad de acumulaciones que gana la habilidad en cada tick o actualización de su estado.",
  accumulationCost: "Maná que se consume por acumulación cuando la habilidad acumula cargas.",
  condition: "Requisito que debe cumplirse para activar o mantener una habilidad pasiva.",
  pch: "Puntos de Creación de Habilidad. Se calculan según los efectos, el maná, la velocidad y el alcance.",
} as const;

export type SkillHelpKey = keyof typeof SKILL_FIELD_HELP;

export function SkillFieldHelp({ field }: { field: SkillHelpKey }) {
  const [open, setOpen] = useState(false);
  return <span className="relative ml-2 inline-flex align-middle">
    <button type="button" aria-label={`Ayuda sobre ${field}`} aria-expanded={open} onClick={() => setOpen(value => !value)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false); }} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/60 text-xs font-bold text-cyan-300 hover:bg-cyan-900/40 focus-visible:outline-2 focus-visible:outline-cyan-400">?</button>
    {open && <span role="tooltip" className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[75vw] rounded-lg border border-cyan-700 bg-zinc-950 p-3 text-left text-xs font-normal leading-relaxed text-zinc-100 shadow-xl">{SKILL_FIELD_HELP[field]}</span>}
  </span>;
}
