export const EFFECT_CATALOG = [
  { type: "DAMAGE_MULTIPLIER", label: "Daño ×", mode: "multiplier", targets: ["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"] },
  { type: "STAT_MULTIPLIER", label: "Estadística ×", mode: "multiplier", targets: ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK","HP","MANA","PHYS_ATK","MAGIC_ATK","DEF","MAG_DEF","PRECISION","CRITICAL","DISCOVERY","MIRACLE","INTIMIDATION","CONQUEST","RACE","DODGE","STEALTH","DETECTION","ATTACK_TOTAL"] },
  { type: "STAT_BONUS", label: "Estadística +", mode: "bonus", targets: ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK","HP","MANA","PHYS_ATK","MAGIC_ATK","DEF","MAG_DEF","PRECISION","CRITICAL","DISCOVERY","MIRACLE","INTIMIDATION","CONQUEST","RACE","DODGE","STEALTH","DETECTION","ATTACK_TOTAL"] },
  { type: "DAMAGE_REDUCTION", label: "Daño recibido reducido ×", mode: "multiplier", targets: ["ALL","PHYSICAL","MAGICAL"] },
  { type: "DAMAGE_INCREASE", label: "Daño recibido aumentado ×", mode: "multiplier", targets: ["ALL","PHYSICAL","MAGICAL"] },
  { type: "RESOURCE_BONUS", label: "Recurso +", mode: "bonus", targets: ["HP","MANA","MONEY","LEVEL_UP_POINTS"] },
  { type: "COMBAT_MULTIPLIER", label: "Combate ×", mode: "multiplier", targets: ["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"] },
  { type: "EQUIPMENT_SLOT_CAP", label: "Límite de equipo +", mode: "bonus", targets: [] },
  { type: "SUMMON_MIRROR", label: "Invocar espejo", mode: "special", targets: [] },
  { type: "MIRROR_RAY", label: "Rayo de espejo", mode: "special", targets: [] },
  { type: "MAGIC_REFLECTION", label: "Reflejar magia", mode: "special", targets: [] },
  { type: "NARRATIVE", label: "Narrativo", mode: "text", targets: ["OTHER"] },
  { type: "IGNORE_PHYS_DEF_MULTIPLIER", label: "Ignorar defensa física ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_PHYS_DEF_BONUS", label: "Ignorar defensa física +", mode: "bonus", targets: [] },
  { type: "IGNORE_MAGIC_DEF_MULTIPLIER", label: "Ignorar defensa mágica ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_MAGIC_DEF_BONUS", label: "Ignorar defensa mágica +", mode: "bonus", targets: [] },
  { type: "IGNORE_ALL_DEF_MULTIPLIER", label: "Ignorar defensas ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_ALL_DEF_BONUS", label: "Ignorar defensas +", mode: "bonus", targets: [] },
  { type: "FINAL_DAMAGE_MULTIPLIER", label: "Daño final ocasionado ×", mode: "multiplier", targets: [] },
  { type: "FINAL_DAMAGE_BONUS", label: "Daño final ocasionado +", mode: "bonus", targets: [] },
  { type: "MAZE_UTILITY", label: "Capacidad de laberinto", mode: "special", targets: ["INVISIBILITY","FLOATING"] },
] as const;

export type SkillEffectType = typeof EFFECT_CATALOG[number]["type"];
export const EFFECT_TYPES = EFFECT_CATALOG.map(e => e.type) as readonly SkillEffectType[];
export const EFFECT_LABELS = Object.fromEntries(EFFECT_CATALOG.map(e => [e.type, e.label])) as Record<SkillEffectType, string>;
export const EFFECT_TARGETS = Object.fromEntries(EFFECT_CATALOG.map(e => [e.type, e.targets])) as unknown as Record<SkillEffectType, readonly string[]>;

/** Targets for configurable statistics; legacy codes remain valid for existing effects. */
export type EffectTargetOption = { key: string; label: string };
const TARGET_LABELS: Record<string,string> = {
 STR:"Fuerza",AGI:"Agilidad",CON:"Constitución",INT:"Inteligencia",WIS:"Sabiduría",CHA:"Carisma",SPI:"Espíritu",LCK:"Suerte",
 HP:"Vida",MANA:"Maná",MONEY:"Dinero",KARMA:"Karma",LEVEL_UP_POINTS:"Puntos de nivel",
 PHYS_ATK:"Ataque físico",MAGIC_ATK:"Ataque mágico",ATTACK_TOTAL:"Ataque total",DEF:"Defensa física",MAG_DEF:"Defensa mágica",
 PRECISION:"Precisión",CRITICAL:"Crítico",DISCOVERY:"Descubrimiento",MIRACLE:"Milagro",INTIMIDATION:"Intimidación",CONQUEST:"Conquista",
 RACE:"Raza",DODGE:"Evasión",STEALTH:"Sigilo",DETECTION:"Detección",ALL:"Todo el daño",PHYSICAL:"Daño físico",MAGICAL:"Daño mágico",
 INVISIBILITY:"Invisibilidad",FLOATING:"Flotar",OTHER:"Otro"
};
export function resolveEffectTargets(
 type:string,
 statistics:ReadonlyArray<{key:string;name:string;kind:"basic"|"derived";active?:boolean;code?:string}>,
):EffectTargetOption[] {
 const fixed=(EFFECT_TARGETS as Record<string,readonly string[]>)[type]??[];
 const configured=statistics.filter(s=>s.active!==false&&Boolean(s.key)).map(s=>({key:s.code||s.key,label:s.name||TARGET_LABELS[s.code||s.key]||s.key}));
 if(type==="STAT_BONUS"||type==="STAT_MULTIPLIER"){
   return configured.length?configured:fixed.map(key=>({key,label:TARGET_LABELS[key]??key}));
 }
 if(type==="DAMAGE_MULTIPLIER"||type==="COMBAT_MULTIPLIER"){
   const derived=configured.filter(s=>["physicalAttack","magicAttack","PHYS_ATK","MAGIC_ATK"].includes(s.key));
   return derived.length?[...derived,{key:"ATTACK_TOTAL",label:"Ataque total"}]:fixed.map(key=>({key,label:TARGET_LABELS[key]??key}));
 }
 return fixed.map(key=>({key,label:TARGET_LABELS[key]??key}));
}

/** Shared validation for perk and skill effect targets. */
export function validateEffectTarget(type: string, target: string, statistics: Parameters<typeof resolveEffectTargets>[1]): boolean {
  const allowed = resolveEffectTargets(type, statistics);
  return allowed.length === 0 || allowed.some((entry) => entry.key === target);
}
