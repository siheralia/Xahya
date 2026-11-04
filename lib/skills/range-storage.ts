import {normalizeSkillArea} from "./area-of-effect.ts";

/**
 * areaOfEffect remains the single DB column for compatibility with skills,
 * templates, copies and upgrades. The UI holds reach separately; this is the
 * one canonical serializer so no write can append the range twice.
 */
export function serializeSkillRange(area:string|null|undefined,range:unknown):string {
 const meters=Number(range);
 if(!Number.isSafeInteger(meters)||meters<0||meters>100)
  throw new Error("Distancia máxima inválida.");
 return normalizeSkillArea(area)+" | Alcance máximo: "+meters+" m";
}
