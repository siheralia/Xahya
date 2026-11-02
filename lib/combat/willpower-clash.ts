/**
 * Choque de voluntades: reglas puras, reutilizables para habilidades de imposición.
 * Las tiradas aleatorias se generan exclusivamente en el servidor.
 */
export const WILLPOWER_STAT_LABELS={
  wisdom:"WIS · Instinto, percepción de intenciones y experiencia",
  charisma:"CHA · Seguridad, presencia y determinación",
  spirit:"SPI · Voluntad sobrenatural y resistencia mágica",
  constitution:"CON · Resistencia física del cuerpo",
} as const;
export type WillpowerStat=keyof typeof WILLPOWER_STAT_LABELS;
export type WillpowerStats=Partial<Record<WillpowerStat,number>>;
export const DEFAULT_ATTACK_STAT:WillpowerStat="spirit";

export function allowedWillpowerDefenses(bodyCoercion:boolean):WillpowerStat[]{
  return bodyCoercion
    ? ["wisdom","charisma","spirit","constitution"]
    : ["wisdom","charisma","spirit"];
}
function checkedStat(stats:WillpowerStats,key:WillpowerStat):number{
  const value=stats[key];
  if(typeof value!=="number"||!Number.isFinite(value)||value<0)
    throw new Error("Estadística de voluntad no disponible: "+key);
  return value;
}
export function strongestWillpowerDefense(stats:WillpowerStats,bodyCoercion=false){
  const options=allowedWillpowerDefenses(bodyCoercion);
  // Stable order breaks equal-stat ties; players may choose manually in future PvP.
  return options.map(stat=>({stat,value:checkedStat(stats,stat)}))
    .reduce((best,candidate)=>candidate.value>best.value?candidate:best);
}
export function resolveWillpowerClash(input:{
  attacker:WillpowerStats;
  defender:WillpowerStats;
  attackRoll:number;
  defenseRoll:number;
  attackStat?:WillpowerStat;
  defenseStat?:WillpowerStat;
  bodyCoercion?:boolean;
}){
  const attackStat=input.attackStat??DEFAULT_ATTACK_STAT;
  const bodyCoercion=input.bodyCoercion===true;
  if(![input.attackRoll,input.defenseRoll].every(roll=>Number.isSafeInteger(roll)&&roll>=1&&roll<=20))
    throw new Error("Las tiradas deben estar entre 1 y 20.");
  const allowed=allowedWillpowerDefenses(bodyCoercion);
  if(input.defenseStat!==undefined&&!allowed.includes(input.defenseStat))
    throw new Error("Esta situación no permite utilizar CON.");
  const chosen=input.defenseStat!==undefined
    ? {stat:input.defenseStat,value:checkedStat(input.defender,input.defenseStat)}
    : strongestWillpowerDefense(input.defender,bodyCoercion);
  const attackValue=checkedStat(input.attacker,attackStat);
  const attackTotal=input.attackRoll+attackValue;
  const defenseTotal=input.defenseRoll+chosen.value;
  return {
    attackerStat:attackStat,attackerValue:attackValue,defenderStat:chosen.stat,
    defenderValue:chosen.value,attackRoll:input.attackRoll,defenseRoll:input.defenseRoll,
    attackTotal,defenseTotal,
    success:attackTotal>defenseTotal,
    resisted:attackTotal<=defenseTotal,
  };
}
