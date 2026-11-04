/**
 * Xahya effect micro-modules, v1. A deterministic, side-effect-free encounter
 * evaluator. It DOES NOT bypass the existing combat damage/defense resolver.
 * DAMAGE and MODIFIER produce intents for that resolver; HEAL updates HP here.
 * No eval, arbitrary source code, database I/O, or skill-name special cases.
 */
export type MicroEvent = "DAMAGE_RESOLVED" | "TURN_START" | "IMPACT" | "PASSIVE";
export type ImpactKind = "CHARACTER" | "GROUND";
export type NumericExpr = number
  | { source: "EVENT" | "STAT" | "CHARGES" | "STORED_TOTAL" | "OUTPUT"; key: string }
  | { operator: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MIN" | "MAX" | "PERCENT"; args: NumericExpr[] };
export type MicroCondition = { left: NumericExpr; compare: "EQ" | "NE" | "GT" | "GTE" | "LT" | "LTE"; right: NumericExpr };
export type MicroStep = (
  | { kind: "STORE"; accumulator: string; capacity: number; value: NumericExpr }
  | { kind: "CONSUME"; accumulator: string; output: string; charges: "ALL" | number }
  | { kind: "HEAL"; amount: NumericExpr }
  | { kind: "DAMAGE"; amount: NumericExpr; channel: "PHYSICAL" | "MAGICAL"; element?: string; radiusMeters?: NumericExpr }
  | { kind: "MODIFIER"; stat: string; multiplier: NumericExpr }
) & { when?: MicroCondition[] };
export type EffectContainer = {
  id: string; name: string; type: string; description: string;
  trigger: MicroEvent; impactKind?: ImpactKind; requirements?: MicroCondition[]; steps: MicroStep[];
};
export type MicroAccumulator = { capacity: number; charges: number[] };
export type MicroState = { accumulators: Record<string, MicroAccumulator>; processed: string[] };
export type MicroContext = {
  /** Stable ID of this applied event, shared across all effects evaluated together. */
  eventId: string; ownerId: number; trigger: MicroEvent;
  impactKind?: ImpactKind;
  /** Resolved damage (mitigatedDamage etc.) computed by the regular combat engine. */
  event?: Record<string, number>;
  /** Owner's combat stats BEFORE this event, e.g. STR, HP, MAX_HP. */
  stats: Record<string, number>;
};
export type MicroIntent =
  | { kind: "HEAL"; requested: number; applied: number }
  | { kind: "DAMAGE"; amount: number; channel: "PHYSICAL" | "MAGICAL"; element?: string; radiusMeters?: number }
  | { kind: "MODIFIER"; stat: string; multiplier: number };
export type MicroResult = { state: MicroState; hp: number; intents: MicroIntent[]; skipped: boolean };

const KEY = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const MAX_AMOUNT = 1_000_000_000;
const own = (obj: object, k: string) => Object.prototype.hasOwnProperty.call(obj, k);
const validKey = (key: unknown): key is string => typeof key === "string" && KEY.test(key);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT;
const integer = (n: unknown, min: number, max: number): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
function fail(message: string): never { throw new Error("Micromódulo inválido: " + message); }
function bounded(value: number): number {
  if (!finite(value)) fail("resultado numérico fuera de límites");
  return value;
}
function checkExpr(expr: NumericExpr, depth = 0): void {
  if (depth > 8) fail("expresión demasiado profunda");
  if (typeof expr === "number") { if (!finite(expr)) fail("número inválido"); return; }
  if (!expr || typeof expr !== "object" || Array.isArray(expr)) fail("expresión inválida");
  if ("source" in expr) {
    if (!["EVENT", "STAT", "CHARGES", "STORED_TOTAL", "OUTPUT"].includes(expr.source) || !validKey(expr.key)) fail("referencia inválida");
    return;
  }
  if (!("operator" in expr) || !["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MIN", "MAX", "PERCENT"].includes(expr.operator)
    || !Array.isArray(expr.args) || expr.args.length < 1 || expr.args.length > 8
    || (["SUBTRACT", "DIVIDE", "PERCENT"].includes(expr.operator) && expr.args.length !== 2)) fail("operación inválida");
  for (const arg of expr.args) checkExpr(arg, depth + 1);
}
export function validateEffectContainers(effects: readonly EffectContainer[]): string | null {
  try {
    if (!Array.isArray(effects) || effects.length > 32) fail("máximo 32 contenedores");
    const ids = new Set<string>();
    for (const effect of effects) {
      if (!effect || !validKey(effect.id) || ids.has(effect.id) || !validKey(effect.type)
        || typeof effect.name !== "string" || !effect.name.trim() || effect.name.length > 120
        || typeof effect.description !== "string" || effect.description.length > 2000
        || !["DAMAGE_RESOLVED", "TURN_START", "IMPACT", "PASSIVE"].includes(effect.trigger)
        || !Array.isArray(effect.steps) || effect.steps.length < 1 || effect.steps.length > 24
        || (effect.impactKind !== undefined && (effect.trigger !== "IMPACT" || !["CHARACTER", "GROUND"].includes(effect.impactKind)))
      ) fail("contenedor o disparador inválido");
      ids.add(effect.id);
      if (effect.requirements !== undefined) {
        if (!Array.isArray(effect.requirements) || effect.requirements.length > 12) fail("demasiados requisitos");
        for (const condition of effect.requirements) {
          if (!condition || !["EQ", "NE", "GT", "GTE", "LT", "LTE"].includes(condition.compare)) fail("requisito inválido");
          checkExpr(condition.left); checkExpr(condition.right);
        }
      }
      const outputs = new Set<string>();
      for (const step of effect.steps) {
        if (!step || typeof step !== "object") fail("paso inválido");
        if (step.when !== undefined) {
          if (!Array.isArray(step.when) || step.when.length > 12) fail("demasiadas condiciones");
          for (const condition of step.when) {
            if (!condition || !["EQ", "NE", "GT", "GTE", "LT", "LTE"].includes(condition.compare)) fail("comparador desconocido");
            checkExpr(condition.left); checkExpr(condition.right);
          }
        }
        switch (step.kind) {
          case "STORE":
            if (!validKey(step.accumulator) || !integer(step.capacity, 1, 100)) fail("almacenamiento inválido");
            checkExpr(step.value); break;
          case "CONSUME":
            if (!validKey(step.accumulator) || !validKey(step.output) || outputs.has(step.output)
              || (step.charges !== "ALL" && !integer(step.charges, 1, 100))) fail("consumo inválido");
            outputs.add(step.output); break;
          case "HEAL": checkExpr(step.amount); break;
          case "DAMAGE":
            if (!["PHYSICAL", "MAGICAL"].includes(step.channel) || (step.element !== undefined && !validKey(step.element))) fail("tipo de daño inválido");
            checkExpr(step.amount); if (step.radiusMeters !== undefined) checkExpr(step.radiusMeters); break;
          case "MODIFIER":
            if (!validKey(step.stat)) fail("estadística inválida");
            checkExpr(step.multiplier); break;
          default: fail("operación desconocida");
        }
      }
    }
    return null;
  } catch (error) { return error instanceof Error ? error.message : "Configuración inválida"; }
}
export const emptyMicroState = (): MicroState => ({ accumulators: {}, processed: [] });
function storageKey(ownerId: number, accumulator: string): string { return ownerId + ":" + accumulator; }
function readAccumulator(state: MicroState, ownerId: number, name: string): MicroAccumulator | undefined {
  return own(state.accumulators, storageKey(ownerId, name)) ? state.accumulators[storageKey(ownerId, name)] : undefined;
}
export function totalStored(state: MicroState, ownerId: number, name: string): number {
  return bounded(readAccumulator(state, ownerId, name)?.charges.reduce((sum, value) => sum + value, 0) ?? 0);
}
export function chargeCount(state: MicroState, ownerId: number, name: string): number {
  return readAccumulator(state, ownerId, name)?.charges.length ?? 0;
}
export function parseMicroState(value: unknown): MicroState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyMicroState();
  const raw = value as Partial<MicroState>;
  const accumulators: MicroState["accumulators"] = {};
  if (raw.accumulators && typeof raw.accumulators === "object" && !Array.isArray(raw.accumulators)) {
    for (const [key, acc] of Object.entries(raw.accumulators).slice(0, 128)) {
      if (!/^\d+:[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key) || !acc || !integer(acc.capacity, 1, 100)
        || !Array.isArray(acc.charges) || acc.charges.length > acc.capacity || acc.charges.some(v => !finite(v) || v < 0)) continue;
      accumulators[key] = { capacity: acc.capacity, charges: [...acc.charges] };
    }
  }
  return { accumulators, processed: Array.isArray(raw.processed)
    ? raw.processed.filter((id): id is string => typeof id === "string" && id.length >= 1 && id.length <= 120).slice(0, 10000) : [] };
}
function evaluate(expr: NumericExpr, ctx: MicroContext, state: MicroState, outputs: Record<string, number>, hp: number, depth = 0): number {
  if (depth > 8) fail("profundidad excedida");
  if (typeof expr === "number") return bounded(expr);
  if ("source" in expr) {
    if (expr.source === "CHARGES") return chargeCount(state, ctx.ownerId, expr.key);
    if (expr.source === "STORED_TOTAL") return totalStored(state, ctx.ownerId, expr.key);
    const source = expr.source === "EVENT" ? (ctx.event ?? {}) : expr.source === "OUTPUT" ? outputs : ctx.stats;
    if (expr.source === "STAT" && expr.key === "HP") return hp;
    if (!own(source, expr.key) || !finite(source[expr.key])) fail("referencia no disponible: " + expr.source + ":" + expr.key);
    return source[expr.key];
  }
  const args = expr.args.map(arg => evaluate(arg, ctx, state, outputs, hp, depth + 1));
  switch (expr.operator) {
    case "ADD": return bounded(args.reduce((a,b)=>a+b,0));
    case "SUBTRACT": return bounded(args[0]-args[1]);
    case "MULTIPLY": return bounded(args.reduce((a,b)=>a*b,1));
    case "DIVIDE": if (args[1] === 0) fail("división entre cero"); return bounded(args[0]/args[1]);
    case "MIN": return bounded(Math.min(...args));
    case "MAX": return bounded(Math.max(...args));
    case "PERCENT": return bounded(args[0]*args[1]/100);
  }
}
function conditionsMet(conditions: MicroCondition[] | undefined, ctx: MicroContext, state: MicroState, outputs: Record<string, number>, hp: number): boolean {
  return (conditions ?? []).every(({left,compare,right}) => {
    const a = evaluate(left, ctx, state, outputs, hp), b = evaluate(right, ctx, state, outputs, hp);
    switch(compare) {
      case "EQ": return a === b; case "NE": return a !== b;
      case "GT": return a > b; case "GTE": return a >= b;
      case "LT": return a < b; case "LTE": return a <= b;
    }
  });
}
/**
 * Evaluate all effects in one atomic combat event. A repeated eventId is a no-op.
 * Caller supplies already-mitigated damage as event.MITIGATED_DAMAGE, and must
 * apply returned DAMAGE/MODIFIER intents using the existing combat resolver.
 */
export function executeMicroEvent(input: MicroState, effects: readonly EffectContainer[], ctx: MicroContext): MicroResult {
  const error = validateEffectContainers(effects);
  if (error) throw new Error(error);
  if (!integer(ctx.ownerId, 1, 2_147_483_647) || !validKey(ctx.eventId) || !["DAMAGE_RESOLVED", "TURN_START", "IMPACT", "PASSIVE"].includes(ctx.trigger)
    || !ctx.stats || !finite(ctx.stats.HP) || !finite(ctx.stats.MAX_HP) || ctx.stats.MAX_HP < 1 || ctx.stats.HP < 0 || ctx.stats.HP > ctx.stats.MAX_HP)
    fail("contexto de combate inválido");
  const state = parseMicroState(input);
  const requestKey = ctx.ownerId + ":" + ctx.eventId + ":" + ctx.trigger;
  if (ctx.trigger !== "PASSIVE" && state.processed.includes(requestKey)) return {state, hp:ctx.stats.HP, intents:[], skipped:true};
  if (ctx.trigger !== "PASSIVE" && state.processed.length >= 10000) fail("registro de eventos lleno");
  const intents: MicroIntent[] = [];
  let hp = ctx.stats.HP;
  for (const effect of effects) {
    if (effect.trigger !== ctx.trigger || (effect.impactKind && effect.impactKind !== ctx.impactKind)) continue;
    const outputs: Record<string, number> = {};
    if (!conditionsMet(effect.requirements,ctx,state,outputs,hp)) continue;
    for (const step of effect.steps) {
      if (!conditionsMet(step.when,ctx,state,outputs,hp)) continue;
      switch(step.kind) {
        case "STORE": {
          const value = evaluate(step.value,ctx,state,outputs,hp);
          if (value <= 0) break;
          const key = storageKey(ctx.ownerId,step.accumulator);
          const acc = state.accumulators[key];
          if (acc && acc.capacity !== step.capacity) fail("capacidad conflictiva para: " + step.accumulator);
          if (!acc) {
            if (Object.keys(state.accumulators).length >= 128) fail("demasiados acumuladores");
            state.accumulators[key] = {capacity:step.capacity,charges:[]};
          }
          if (state.accumulators[key].charges.length < step.capacity) state.accumulators[key].charges.push(value);
          break;
        }
        case "CONSUME": {
          const acc = readAccumulator(state,ctx.ownerId,step.accumulator);
          const amount = step.charges === "ALL" ? (acc?.charges.length ?? 0) : Math.min(step.charges, acc?.charges.length ?? 0);
          const spent = acc?.charges.splice(0, amount) ?? [];
          outputs[step.output] = bounded(spent.reduce((sum,v)=>sum+v,0));
          break;
        }
        case "HEAL": {
          const requested = Math.max(0,evaluate(step.amount,ctx,state,outputs,hp));
          const applied = Math.min(requested,ctx.stats.MAX_HP-hp);
          hp = bounded(hp + applied);
          intents.push({kind:"HEAL",requested,applied});
          break;
        }
        case "DAMAGE": {
          const amount = Math.max(0,evaluate(step.amount,ctx,state,outputs,hp));
          const radiusMeters = step.radiusMeters === undefined ? undefined : evaluate(step.radiusMeters,ctx,state,outputs,hp);
          if (radiusMeters !== undefined && (radiusMeters < 0 || radiusMeters > 1000)) fail("radio de daño fuera de límites");
          intents.push({kind:"DAMAGE",amount,channel:step.channel,element:step.element,radiusMeters});
          break;
        }
        case "MODIFIER": {
          const multiplier = evaluate(step.multiplier,ctx,state,outputs,hp);
          if (multiplier < 0 || multiplier > 100) fail("multiplicador fuera de límites");
          intents.push({kind:"MODIFIER",stat:step.stat,multiplier});
          break;
        }
      }
    }
  }
  if (ctx.trigger !== "PASSIVE") state.processed.push(requestKey);
  return {state,hp,intents,skipped:false};
}
