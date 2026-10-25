// Read-only, versioned PCH estimate. Never changes legacy skill behavior.
export const PCH_RULESET_VERSION = "draft-1";
const BASE = Object.freeze({
  DAMAGE_MULTIPLIER: 3, STAT_MULTIPLIER: 2, STAT_BONUS: 1,
  DAMAGE_REDUCTION: 3, DAMAGE_INCREASE: 2, RESOURCE_BONUS: 2,
  COMBAT_MULTIPLIER: 3, EQUIPMENT_SLOT_CAP: 5, NARRATIVE: 0,
  IGNORE_PHYS_DEF_MULTIPLIER: 4, IGNORE_PHYS_DEF_BONUS: 3,
  IGNORE_MAGIC_DEF_MULTIPLIER: 4, IGNORE_MAGIC_DEF_BONUS: 3,
  IGNORE_ALL_DEF_MULTIPLIER: 6, IGNORE_ALL_DEF_BONUS: 5,
  FINAL_DAMAGE_MULTIPLIER: 5, FINAL_DAMAGE_BONUS: 3,
  MAZE_UTILITY: 5,
});
const MULTIPLIERS = new Set(["DAMAGE_MULTIPLIER","STAT_MULTIPLIER","DAMAGE_REDUCTION","DAMAGE_INCREASE","COMBAT_MULTIPLIER","IGNORE_PHYS_DEF_MULTIPLIER","IGNORE_MAGIC_DEF_MULTIPLIER","IGNORE_ALL_DEF_MULTIPLIER","FINAL_DAMAGE_MULTIPLIER"]);
export function normalizeEffect(effect, source = "skill") {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) return { supported:false, reason:"INVALID_EFFECT", source };
  const raw = String(effect.type ?? "");
  const type = raw.toUpperCase();
  const target = String(effect.target ?? effect.stat ?? "");
  const value = Number(effect.value);
  if (!Object.hasOwn(BASE,type)) return { supported:false, reason:"UNKNOWN_EFFECT", type, source };
  if (type !== "NARRATIVE" && !Number.isFinite(value)) return { supported:false, reason:"INVALID_VALUE", type, source };
  return { supported:true, type, target, value: type === "NARRATIVE" ? 0 : value, source, description:String(effect.description ?? "") };
}
export function estimateSkillPch(skill) {
  const effects = Array.isArray(skill?.effect) ? skill.effect : [];
  const rows = effects.map(effect => {
    const normalized = normalizeEffect(effect);
    if (!normalized.supported) return { ...normalized, pch:null };
    const {type,value} = normalized;
    let extra = 0;
    if (MULTIPLIERS.has(type) && value > 1) extra = Math.ceil((value - 1)) * 2;
    if (type === "STAT_BONUS" && value > 10) extra = Math.ceil((value - 10) / 25);
    if (type === "FINAL_DAMAGE_MULTIPLIER" && value >= 3) extra += 2;
    return {...normalized, pch:BASE[type] + extra};
  });
  const unknown = rows.filter(row=>!row.supported);
  const effectPch = rows.reduce((sum,row)=>sum+(row.pch??0),0);
  // Free-text range/duration/cooldown cannot be priced reliably.
  const warnings = [];
  if (unknown.length) warnings.push("UNKNOWN_EFFECTS_REQUIRE_REVIEW");
  if (skill?.areaOfEffect) warnings.push("RANGE_NOT_PRICED");
  if (skill?.duration) warnings.push("DURATION_NOT_PRICED");
  if (skill?.cooldown) warnings.push("COOLDOWN_NOT_PRICED");
  if (rows.some(row=>row.type==="NARRATIVE")) warnings.push("NARRATIVE_REQUIRES_REVIEW");
  return {rulesetVersion:PCH_RULESET_VERSION, effectPch, totalPch:unknown.length?null:effectPch, provisional:true, rows, warnings};
}
export function normalizeItemEffect(effect) {
  if (!effect || typeof effect !== "object") return {supported:false,reason:"INVALID_EFFECT",source:"item"};
  const type = String(effect.type ?? "").toLowerCase();
  if (type === "stat_multiplier" && String(effect.stat)==="ATTACK_TOTAL") {
    return {supported:true,type:"STAT_MULTIPLIER",target:"ATTACK_TOTAL",value:Number(effect.value),source:"item",legacy:false};
  }
  if (type === "stat_bonus" || type === "stat_multiplier") return {supported:true,type:type.toUpperCase(),target:String(effect.stat??""),value:Number(effect.value),source:"item",legacy:true};
  return {supported:false,reason:"ITEM_ACTION_OR_UNKNOWN_REQUIRES_REVIEW",source:"item"};
}
export function statMultiplierFactor(value) {\n  if (!Number.isFinite(value) || value < 0) throw new TypeError("Invalid multiplier");\n  return value;\n}\nexport function applyStatOperation(base, effect) {\n  if (!Number.isFinite(base)) throw new TypeError("Invalid stat");\n  const type=String(effect?.type??"").toUpperCase();\n  const value=Number(effect?.value);\n  if (!Number.isFinite(value)) throw new TypeError("Invalid stat modifier");\n  if(type==="STAT_BONUS") return base+value;\n  if(type==="STAT_MULTIPLIER") return base*statMultiplierFactor(value);\n  throw new TypeError("Unsupported stat operation");\n}\n