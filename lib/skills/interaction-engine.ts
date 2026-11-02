/**
 * Declarative skill interactions for Xahya.
 * No eval, arbitrary scripts or skill-name special cases.
 * Environment is stored per combat encounter or maze room.
 */
export type MechanicEvent = "ACTIVATE" | "TURN" | "HIT" | "ENTER_FIELD";
export type MechanicTarget = "SELF" | "OPPONENT" | "ALL";
export type MechanicCondition =
  | { kind: "FIELD_MIN"; material: string; ppm: number }
  | { kind: "EXPOSURE_MIN"; material: string; amount: number }
  | { kind: "SKILL_ACTIVE"; skillId: number }
  | { kind: "STATUS"; status: string }
  | { kind: "EVENT"; event: MechanicEvent };

export type MechanicAction =
  | { kind: "CREATE_FIELD"; material: string; rings: { radius: number; ppm: number }[]; spreadMeters?: number; transferPercent?: number; durationTurns?: number }
  | { kind: "CHANGE_FIELD"; material: string; ppm: number }
  | { kind: "EXPOSE"; material: string; amount: number; target: MechanicTarget; fromField?: boolean }
  | { kind: "CLEANSE"; material: string; amount: number; target: MechanicTarget }
  | { kind: "STATUS"; status: string; target: MechanicTarget; durationTurns: number; stat?: string; multiplier?: number }
  | { kind: "MANA_WARD"; manaInvestment: number; level: number; target: "SELF"; durationTurns: number };

export type MechanicRule = {
  event: MechanicEvent;
  conditions?: MechanicCondition[];
  actions: MechanicAction[];
  // Skill that must also be approved and active; supports mineral + base-technique combinations.
  linkedSkillId?: number;
};
export type SkillMechanics = { family?: string; parentSkillId?: number; activationConditions?: MechanicCondition[]; rules?: MechanicRule[] };
export type FieldRing = { radius: number; ppm: number };
export type EnvironmentField = {
  id: string; sourceSkillId: number; ownerCharacterId: number; material: string;
  rings: FieldRing[]; spreadMeters: number; transferPercent: number;
  remainingTurns: number | null;
};
export type EnvironmentStatus = {
  sourceSkillId: number; status: string; actor: "PLAYER" | "NPC";
  remainingTurns: number; stat?: string; multiplier?: number;
  wardPpm?: number;
};
export type EnvironmentState = {
  turn: number; fields: EnvironmentField[];
  exposures: Record<string, number>; statuses: EnvironmentStatus[];
  distances: Partial<Record<"PLAYER" | "NPC", number>>;
};
export type MechanicsContext = {
  actor: "PLAYER" | "NPC";
  sourceSkillId: number; ownerCharacterId: number;
  activeSkillIds: readonly number[];
  approvedSkillIds: readonly number[];
  distances?: Partial<Record<"PLAYER" | "NPC", number>>;
  event: MechanicEvent;
};

const keyPattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const isKey = (x: unknown): x is string => typeof x === "string" && keyPattern.test(x);
const finite = (x: unknown, min = 0, max = 1000000): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
const integer = (x: unknown, min = 0, max = 1000000): x is number =>
  finite(x, min, max) && Number.isSafeInteger(x);

export const emptyEnvironment = (): EnvironmentState => ({ turn: 0, fields: [], exposures: {}, statuses: [], distances: {} });

export function parseEnvironment(value: unknown): EnvironmentState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyEnvironment();
  const raw = value as Partial<EnvironmentState>;
  return {
    turn: integer(raw.turn) ? raw.turn : 0,
    fields: Array.isArray(raw.fields) ? raw.fields.filter(f => !!f && isKey(f.material) && Array.isArray(f.rings)).slice(0, 100) : [],
    exposures: raw.exposures && typeof raw.exposures === "object" && !Array.isArray(raw.exposures) ? raw.exposures : {},
    distances: raw.distances && typeof raw.distances === "object" && !Array.isArray(raw.distances) ? raw.distances : {},
    statuses: Array.isArray(raw.statuses) ? raw.statuses.filter(s => !!s && isKey(s.status)).slice(0, 200) : [],
  };
}

export function validateSkillMechanics(value: unknown, ownSkillId?: number): string | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Mecánicas inválidas.";
  const mechanics = value as SkillMechanics;
  if (mechanics.family !== undefined && (typeof mechanics.family !== "string" || mechanics.family.length > 80))
    return "Familia de habilidades inválida.";
  if (mechanics.parentSkillId !== undefined && (!integer(mechanics.parentSkillId, 1) || mechanics.parentSkillId === ownSkillId))
    return "Habilidad madre inválida.";
  if (mechanics.activationConditions !== undefined && (!Array.isArray(mechanics.activationConditions) || mechanics.activationConditions.length > 10))
    return "Demasiadas condiciones de activación.";
  if (mechanics.rules !== undefined && (!Array.isArray(mechanics.rules) || mechanics.rules.length > 12))
    return "Máximo 12 reglas por habilidad.";
  const conditions = [...(mechanics.activationConditions ?? []), ...(mechanics.rules ?? []).flatMap(r => r.conditions ?? [])];
  for (const condition of conditions) {
    if (!condition || !["FIELD_MIN", "EXPOSURE_MIN", "SKILL_ACTIVE", "STATUS", "EVENT"].includes(condition.kind))
      return "Condición mecánica desconocida.";
    if ((condition.kind === "FIELD_MIN" || condition.kind === "EXPOSURE_MIN")
      && (!isKey(condition.material) || !finite(condition.kind === "FIELD_MIN" ? condition.ppm : condition.amount)))
      return "Concentración o exposición inválida.";
    if (condition.kind === "SKILL_ACTIVE" && !integer(condition.skillId, 1)) return "Habilidad vinculada inválida.";
    if (condition.kind === "STATUS" && !isKey(condition.status)) return "Estado requerido inválido.";
    if (condition.kind === "EVENT" && !["ACTIVATE", "TURN", "HIT", "ENTER_FIELD"].includes(condition.event))
      return "Evento requerido inválido.";
  }
  for (const rule of mechanics.rules ?? []) {
    if (!rule || !["ACTIVATE", "TURN", "HIT", "ENTER_FIELD"].includes(rule.event)
      || !Array.isArray(rule.actions) || rule.actions.length < 1 || rule.actions.length > 10
      || (rule.conditions !== undefined && (!Array.isArray(rule.conditions) || rule.conditions.length > 10)))
      return "Regla mecánica inválida.";
    if (rule.linkedSkillId !== undefined && (!integer(rule.linkedSkillId, 1) || rule.linkedSkillId === ownSkillId))
      return "Vínculo de habilidad inválido.";
    for (const action of rule.actions) {
      if (!action || !["CREATE_FIELD", "CHANGE_FIELD", "EXPOSE", "CLEANSE", "STATUS", "MANA_WARD"].includes(action.kind))
        return "Acción mecánica desconocida.";
      if (["CREATE_FIELD", "CHANGE_FIELD", "EXPOSE", "CLEANSE"].includes(action.kind)
        && !isKey((action as {material?:string}).material)) return "Material inválido.";
      if (action.kind === "CREATE_FIELD") {
        if (rule.event !== "ACTIVATE") return "Los campos deben crearse al activar, no automáticamente cada turno.";
        if (!Array.isArray(action.rings) || action.rings.length < 1 || action.rings.length > 12
          || action.rings.some((r, i) => !finite(r?.radius, 0.01, 1000) || !finite(r?.ppm) || (i > 0 && r.radius <= action.rings[i - 1].radius))
          || (action.spreadMeters !== undefined && !finite(action.spreadMeters, 0, 100))
          || (action.transferPercent !== undefined && !finite(action.transferPercent, 0, 100))
          || (action.durationTurns !== undefined && !integer(action.durationTurns, 1, 1000)))
          return "Zonas o dispersión inválidas.";
      }
      if ((action.kind === "CHANGE_FIELD" && !finite(action.ppm))
          || ((action.kind === "EXPOSE" || action.kind === "CLEANSE") && (!finite(action.amount) || !["SELF", "OPPONENT", "ALL"].includes(action.target))))
        return "Cantidad o objetivo inválido.";
      if (action.kind === "STATUS" && (!isKey(action.status) || !integer(action.durationTurns, 1, 1000)
        || !["SELF", "OPPONENT", "ALL"].includes(action.target)
        || (action.stat !== undefined && !isKey(action.stat))
        || (action.multiplier !== undefined && !finite(action.multiplier, 0, 100)))) return "Estado inválido.";
      if (action.kind === "MANA_WARD" && (rule.event !== "ACTIVATE" || !integer(action.manaInvestment, 1, 1000000)
        || !integer(action.level, 1, 100) || action.target !== "SELF"
        || !integer(action.durationTurns, 1, 1000))) return "Protección de maná inválida.";
    }
  }
  return null;
}

export function localPpm(state: EnvironmentState, material: string, distanceMeters = 0): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return 0;
  return state.fields.filter(f => f.material === material).reduce((sum, field) => {
    const ring = field.rings.find(r => distanceMeters <= r.radius);
    return sum + (ring?.ppm ?? 0);
  }, 0);
}
export const exposureKey = (actor: "PLAYER" | "NPC", material: string) => actor + ":" + material;

export function conditionsMet(
  conditions: readonly MechanicCondition[], state: EnvironmentState, ctx: MechanicsContext,
): boolean {
  return conditions.every(condition => {
    switch (condition.kind) {
      case "FIELD_MIN": return ctx.distances?.[ctx.actor] !== undefined && localPpm(state, condition.material, ctx.distances[ctx.actor]) >= condition.ppm;
      case "EXPOSURE_MIN": return (state.exposures[exposureKey(ctx.actor, condition.material)] ?? 0) >= condition.amount;
      case "SKILL_ACTIVE": return ctx.activeSkillIds.includes(condition.skillId);
      case "STATUS": return state.statuses.some(s => s.actor === ctx.actor && s.status === condition.status && s.remainingTurns > 0);
      case "EVENT": return condition.event === ctx.event;
    }
  });
}

export function manaWardReduction(manaInvestment: number, level: number): number {
  if (!finite(manaInvestment) || !finite(level, 1, 100)) return 0;
  return Math.floor(manaInvestment * level / 5);
}

function targetActors(target: MechanicTarget, actor: "PLAYER" | "NPC"): ("PLAYER" | "NPC")[] {
  return target === "ALL" ? ["PLAYER", "NPC"] : [target === "SELF" ? actor : actor === "PLAYER" ? "NPC" : "PLAYER"];
}

/** Idempotence is handled by the caller: invoke only for actual events, never on GET. */
export function applyMechanicEvent(
  input: EnvironmentState, mechanics: SkillMechanics, ctx: MechanicsContext,
): {state: EnvironmentState; manaInvestment: number} {
  const state: EnvironmentState = {
    turn: input.turn, fields: input.fields.map(f => ({...f, rings:f.rings.map(r => ({...r}))})),
    exposures: {...input.exposures}, statuses: input.statuses.map(s => ({...s})), distances: {...input.distances},
  };
  if (!conditionsMet(mechanics.activationConditions ?? [], state, ctx)) return {state, manaInvestment:0};
  let manaInvestment = 0;
  for (const [index, rule] of (mechanics.rules ?? []).entries()) {
    if (rule.event !== ctx.event || (rule.linkedSkillId && !ctx.activeSkillIds.includes(rule.linkedSkillId))
      || !conditionsMet(rule.conditions ?? [], state, ctx)) continue;
    for (const action of rule.actions) {
      switch (action.kind) {
        case "CREATE_FIELD":
          if (state.fields.length >= 100) break;
          // The caster stands at the origin of their own newly created field.
          if(state.distances[ctx.actor]===undefined) state.distances[ctx.actor]=0;
          state.fields.push({
            id: ctx.sourceSkillId + ":" + state.turn + ":" + index + ":" + state.fields.length,
            sourceSkillId:ctx.sourceSkillId, ownerCharacterId:ctx.ownerCharacterId,
            material:action.material, rings:action.rings.map(r=>({...r})),
            spreadMeters:action.spreadMeters??0, transferPercent:action.transferPercent??50,
            remainingTurns:action.durationTurns??null,
          });
          break;
        case "CHANGE_FIELD": {
          let remaining = action.ppm;
          for (const f of state.fields.filter(f => f.material === action.material && f.ownerCharacterId === ctx.ownerCharacterId)) {
            if (remaining <= 0) break;
            const ring = f.rings[0];
            const used = Math.min(ring.ppm, remaining);
            ring.ppm -= used; remaining -= used;
          }
          break;
        }
        case "EXPOSE":
        case "CLEANSE":
          for (const actor of targetActors(action.target, ctx.actor)) {
            const key = exposureKey(actor, action.material);
            const ward = Math.max(0, ...state.statuses.filter(s => s.actor === actor && s.wardPpm && s.remainingTurns>0).map(s=>s.wardPpm??0));
            const distance = ctx.distances?.[actor];
            // A field-based exposure needs an explicitly measured distance.
            if (action.kind === "EXPOSE" && action.fromField && distance === undefined) continue;
            const amount = action.kind === "EXPOSE" && action.fromField
              ? localPpm(state, action.material, distance)
              : action.amount;
            const delta = action.kind === "EXPOSE" ? Math.max(0, amount - ward) : -amount;
            state.exposures[key] = Math.max(0, (state.exposures[key] ?? 0) + delta);
          }
          break;
        case "STATUS":
          for (const actor of targetActors(action.target, ctx.actor)) {
            // Refresh same source/status instead of duplicating passive stacks each turn.
            const old = state.statuses.find(s=>s.actor===actor && s.status===action.status && s.sourceSkillId===ctx.sourceSkillId);
            if (old) old.remainingTurns = Math.max(old.remainingTurns,action.durationTurns);
            else state.statuses.push({sourceSkillId:ctx.sourceSkillId,status:action.status,actor,remainingTurns:action.durationTurns,stat:action.stat,multiplier:action.multiplier});
          }
          break;
        case "MANA_WARD":
          manaInvestment += action.manaInvestment;
          state.statuses = state.statuses.filter(s=>!(s.sourceSkillId===ctx.sourceSkillId && s.status==="MANA_WARD" && s.actor===ctx.actor));
          state.statuses.push({sourceSkillId:ctx.sourceSkillId,status:"MANA_WARD",actor:ctx.actor,remainingTurns:action.durationTurns,wardPpm:manaWardReduction(action.manaInvestment,action.level)});
          break;
      }
    }
  }
  return {state, manaInvestment};
}

/** Conserves ring mass (ppm × annular area) when spreading to the next ring. */
export function advanceEnvironmentTurn(input: EnvironmentState): EnvironmentState {
  const state: EnvironmentState = {
    turn:input.turn+1, fields:[], exposures:{...input.exposures}, distances:{...input.distances},
    statuses:input.statuses.map(s=>({...s,remainingTurns:s.remainingTurns-1})).filter(s=>s.remainingTurns>0),
  };
  for (const old of input.fields) {
    if (old.remainingTurns !== null && old.remainingTurns <= 1) continue;
    const rings = old.rings.map(r=>({...r}));
    const areas = rings.map((r,i)=>Math.PI*(r.radius*r.radius-(i===0?0:rings[i-1].radius*rings[i-1].radius)));
    for(let i=rings.length-2;i>=0;i--){
      const moved = rings[i].ppm * old.transferPercent/100;
      rings[i].ppm -= moved;
      rings[i+1].ppm += moved*areas[i]/areas[i+1];
    }
    if (old.spreadMeters > 0) {
      const outer = rings[rings.length-1];
      const prevRadius = outer.radius;
      const newRadius = prevRadius + old.spreadMeters;
      outer.ppm *= (prevRadius*prevRadius - (rings.length>1?rings[rings.length-2].radius**2:0))
        / (newRadius*newRadius - (rings.length>1?rings[rings.length-2].radius**2:0));
      outer.radius = newRadius;
    }
    if (rings.some(r=>r.ppm>=50)) state.fields.push({...old,rings,remainingTurns:old.remainingTurns===null?null:old.remainingTurns-1});
  }
  return state;
}

export function activeStatMultipliers(state: EnvironmentState, actor:"PLAYER"|"NPC"): Record<string,number> {
  const factors:Record<string,number> = {};
  for(const status of state.statuses) {
    if(status.actor!==actor || !status.stat || status.multiplier===undefined || status.remainingTurns<=0)continue;
    factors[status.stat]=(factors[status.stat]??1)*status.multiplier;
  }
  return factors;
}
