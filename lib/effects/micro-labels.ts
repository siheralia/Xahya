/**
 * Etiquetas de presentación para el editor modular.
 * Los identificadores persistidos y las reglas del motor NO se traducen.
 */
export const MICRO_STEP_LABELS: Record<string,string> = {
  READ_STAT:"Leer estadística",READ_STORED:"Consultar cargas guardadas",
  READ_ITEM:"Leer objeto",REPAIR_DURABILITY:"Restaurar durabilidad",
  CALCULATE:"Calcular valor",STORE:"Guardar cargas",CONSUME:"Consumir cargas",
  HEAL:"Curar",DAMAGE:"Causar daño",MODIFIER:"Multiplicar una estadística",
  BONUS:"Sumar bono",CAPABILITY:"Efecto narrativo",
  VARIABLE_RESISTANCE:"Resistencia variable",
  SELECT_TARGET:"Seleccionar objetivo",SELECT_STAT:"Seleccionar estadística",
  READ_HP_DAMAGE:"Leer daño real a HP",REQUIRE_CONTACT:"Comprobar contacto",
  SUMMON_ENTITY:"Invocar entidad",LINK_ENTITY_STAT:"Vincular estadística de entidad",
  SET_ENTITY_BEHAVIOR:"Configurar comportamiento",APPLY_STATUS:"Aplicar estado",
  READ_STATUSES:"Leer estados activos",INVERT_STATUS:"Invertir debilitamiento",
};
export const MICRO_SOURCE_LABELS: Record<string,string> = {
  EVENT:"Dato del suceso",STAT:"Estadística",CHARGES:"Cantidad de cargas",
  STORED_TOTAL:"Valor almacenado",OUTPUT:"Resultado de otro módulo",
};
export const MICRO_OPERATOR_LABELS: Record<string,string> = {
  ADD:"Sumar",SUBTRACT:"Restar",MULTIPLY:"Multiplicar",DIVIDE:"Dividir",
  MIN:"Elegir el menor",MAX:"Elegir el mayor",PERCENT:"Calcular porcentaje",
};
export const MICRO_TRIGGER_LABELS: Record<string,string> = {
  DAMAGE_RESOLVED:"Cuando se resuelve el daño",
  TURN_START:"Al empezar un turno",IMPACT:"Al producirse un impacto",
  PASSIVE:"Pasiva (siempre disponible)",
  ACTIVATE:"Al activar (habilidad o servicio)",
};
export const MICRO_COMPARISON_LABELS: Record<string,string> = {
  EQ:"Igual a",NE:"Distinto de",GT:"Mayor que",GTE:"Mayor o igual que",
  LT:"Menor que",LTE:"Menor o igual que",
};
export const MICRO_INPUT_LABELS: Record<string,string> = {
  ATTACK_SPEED:"Velocidad del ataque",INCOMING_DAMAGE:"Daño recibido",
  HIT_COUNT:"Número de impactos",HP_PERCENT:"Porcentaje de vida",
};
export const MICRO_FORMULA_LABELS: Record<string,string> = {
  PROGRESSIVE:"Progresiva",LINEAR:"Lineal",DECREASING:"Decreciente",
  THRESHOLD:"Por umbral",HITS:"Por cantidad de impactos",
};
export const MICRO_CONFIG_LABELS: Record<string,string> = {
  threshold:"Umbral",coefficient:"Coeficiente",
  minMultiplier:"Multiplicador mínimo",maxMultiplier:"Multiplicador máximo",
};
export const MICRO_STAT_LABELS: Record<string,string> = {
  STR:"Fuerza",AGI:"Agilidad",CON:"Constitución",INT:"Inteligencia",
  WIS:"Sabiduría",CHA:"Carisma",SPI:"Espíritu",LCK:"Suerte",
  HP:"Vida actual",MAX_HP:"Vida máxima",MANA:"Maná",
  magicDefense:"Defensa mágica",MAG_DEF:"Defensa mágica",
  MAGIC_DEF:"Defensa mágica",PHYS_DEF:"Defensa física",
  RESISTANCE:"Resistencia",ATTACK_SPEED:"Velocidad del ataque",
  PHYSICAL_ATTACK:"Ataque físico",MAGIC_ATTACK:"Ataque mágico",
  PHYS_ATK:"Ataque físico",MAGIC_ATK:"Ataque mágico",
  MITIGATED_DAMAGE:"Daño mitigado",INCOMING_DAMAGE:"Daño recibido",HP_DAMAGE:"Pérdida real de HP",
  DODGE:"Evasión",physicalAttack:"Ataque físico",physicalDefense:"Defensa física",
  chosenTarget:"Objetivo elegido",chosenStat:"Estadística elegida",hpDamage:"Daño efectivo",
  DIVINE_GRACE:"Gracia divina",ENERGY:"Energía",
  resistanceBase:"Defensa base",resistanceInput:"Variable de resistencia",
  OWNER_MAIN_HAND:"Arma principal del propietario",
  OWNER_OFFHAND:"Arma secundaria del propietario",
  SELECTED_ITEM:"Objeto seleccionado y autorizado",
  SOURCE_ITEM:"Objeto que contiene el efecto",
  selectedItem:"Objeto elegido",repairAmount:"Cantidad de reparación",
  storedTotal:"Total almacenado",calculated:"Resultado calculado",
  USER:"Usuario",OPPONENT:"Oponente",TOTAL:"Total",COUNT:"Cargas",
  ALL:"Todas",PHYSICAL:"Físico",MAGICAL:"Mágico",
};
export const MICRO_STAT_SUGGESTIONS = [
  "STR","AGI","CON","INT","WIS","CHA","SPI","LCK",
  "HP","MAX_HP","MANA","magicDefense","PHYSICAL_ATTACK","PHYSICAL_DEFENSE","DODGE","ATTACK_SPEED",
] as const;
export const MICRO_REFERENCE_SUGGESTIONS: Record<string,readonly string[]> = {
  STAT:MICRO_STAT_SUGGESTIONS,
  EVENT:["MITIGATED_DAMAGE","INCOMING_DAMAGE","HP_DAMAGE"],
};

/** Para textos visibles; no usar nunca el resultado como clave de almacenamiento. */
export function friendlyMicroKey(code:string):string {
  if(!code)return "";
  const known = MICRO_STAT_LABELS[code] ?? MICRO_INPUT_LABELS[code] ??
    MICRO_TRIGGER_LABELS[code] ?? MICRO_STEP_LABELS[code] ??
    MICRO_SOURCE_LABELS[code] ?? MICRO_FORMULA_LABELS[code] ??
    MICRO_OPERATOR_LABELS[code] ?? MICRO_CONFIG_LABELS[code];
  if(known)return known;
  const words=code.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_:-]+/g," ").trim();
  const lowered=words===words.toUpperCase()?words.toLowerCase():words;
  return lowered.charAt(0).toUpperCase()+lowered.slice(1);
}
