/** Parse the configured reach without inventing distances for legacy skills. */
export function parseConfiguredSkillRange(areaOfEffect:unknown):{area:string;rangeMeters:number|null} {
 const text=typeof areaOfEffect==="string"?areaOfEffect.trim():"";
 const match=/\s*\|\s*Alcance máximo:\s*(\d+)\s*m\s*$/i.exec(text);
 if(!match)return {area:text||"No especificada",rangeMeters:null};
 const value=Number(match[1]);
 return {area:text.slice(0,match.index).trim()||"Objetivo único",
   rangeMeters:Number.isSafeInteger(value)&&value>=0&&value<=100?value:null};
}
