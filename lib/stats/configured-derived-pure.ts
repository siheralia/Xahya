import {calculateDerivedStats,type BaseStats} from "./derived.ts";

/** Frozen catalog recipe used both by sheets and persisted combat sessions. */
export type SnapshotStatDefinition = {
 key:string; name:string; code:string; kind:"basic"|"derived";
 active?:boolean; defaultValue?:number; formula?:string; order?:number;
};

/** Small arithmetic parser: intentionally never evaluates JavaScript. */
function evaluateExpression(expression: string, resolve: (key: string) => number): number {
  const tokens: string[] = [];
  const tokenPattern = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/%,])/gy;
  let offset = 0;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) throw new Error("Token inválido");
    tokens.push(match[1]);
    offset = tokenPattern.lastIndex;
  }
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  function primary(): number {
    const token = take();
    if (token === undefined) throw new Error("Expresión incompleta");
    if (token === "+" || token === "-") {
      const value = primary();
      return token === "-" ? -value : value;
    }
    if (token === "(") {
      const value = sum();
      if (take() !== ")") throw new Error("Falta cerrar paréntesis");
      return value;
    }
    if (/^\d/.test(token)) return Number(token);
    if (/^[A-Za-z_]/.test(token)) {
      if (token === "min" || token === "max") {
        if (take() !== "(") throw new Error("Se esperaba paréntesis");
        const left = sum();
        if (take() !== ",") throw new Error("Se esperaba coma");
        const right = sum();
        if (take() !== ")") throw new Error("Falta cerrar función");
        return token === "min" ? Math.min(left, right) : Math.max(left, right);
      }
      return resolve(token);
    }
    throw new Error("Valor inválido");
  }
  function product(): number {
    let value = primary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = take();
      const right = primary();
      if ((op === "/" || op === "%") && right === 0) throw new Error("División entre cero");
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (cursor !== tokens.length || !Number.isFinite(result)) throw new Error("Resultado no válido");
  return result;
}

/** Evaluate the same formula snapshot without a DB call or JS eval. */
export function calculateConfiguredDerivedSnapshot(
  stats: BaseStats & Record<string, number>,
  definitions: readonly SnapshotStatDefinition[],
): ReturnType<typeof calculateDerivedStats> & Record<string, number> {
  const fallback = calculateDerivedStats(stats);
  if (!definitions.length) return fallback;
  const active = definitions.filter((entry) => entry.active !== false);
  const byKey = new Map(active.map((entry) => [entry.key, entry]));
  const values: Record<string, number> = {};
  for (const definition of active.filter((entry) => entry.kind === "basic")) {
    const candidate = Number(stats[definition.key] ?? definition.defaultValue ?? 0);
    values[definition.key] = Number.isFinite(candidate) ? candidate : 0;
  }
  // Keep legacy basic keys available even if a catalog entry was temporarily disabled.
  for (const [key, value] of Object.entries(stats)) {
    if (Number.isFinite(Number(value)) && !(key in values)) values[key] = Number(value);
  }
  const resolving = new Set<string>();
  const resolved = new Set<string>();
  function resolve(key: string): number {
    if (key in values && (resolved.has(key) || byKey.get(key)?.kind === "basic")) return values[key];
    const definition = byKey.get(key);
    if (!definition || definition.kind !== "derived") {
      if (key in fallback) return Number((fallback as Record<string, number>)[key]);
      throw new Error("Referencia de estadística desconocida: " + key);
    }
    if (resolved.has(key)) return values[key];
    if (resolving.has(key)) throw new Error("Dependencia circular en " + key);
    resolving.add(key);
    try {
      const result = evaluateExpression(String(definition.formula ?? ""), resolve);
      values[key] = Math.floor(result * 100) / 100;
      resolved.add(key);
      return values[key];
    } finally {
      resolving.delete(key);
    }
  }
  for (const definition of active.filter((entry) => entry.kind === "derived")) {
    try {
      resolve(definition.key);
    } catch {
      values[definition.key] = keyInFallback(definition.key, fallback)
        ? Number((fallback as Record<string, number>)[definition.key])
        : 0;
      resolved.add(definition.key);
    }
  }
  const output = { ...fallback, ...values } as ReturnType<typeof calculateDerivedStats> & Record<string, number>;
  // Required combat stats are invariant parts of the combat contract.
  for (const key of ["physicalAttack", "physicalDefense", "magicAttack", "magicDefense"]) {
    if (!Number.isFinite(output[key])) output[key] = Number((fallback as any)[key] ?? 0);
  }
  return output;
}
function keyInFallback(key: string, fallback: ReturnType<typeof calculateDerivedStats>): boolean {
  return Object.prototype.hasOwnProperty.call(fallback, key);
}
