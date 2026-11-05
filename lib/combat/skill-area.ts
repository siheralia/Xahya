import {parseSkillArea} from "../skills/area-of-effect.ts";

/** Local defender-facing 10 × 10 m projection, not a world map of either combatant. */
export const AREA_CANVAS_METERS=10;
export type CombatAttackArea=
 | {shape:"CIRCLE"|"SELF_FIELD";radiusMeters:number;radiusNormalized:number}
 | {shape:"STRIP";lengthMeters:number;widthMeters:number;
    lengthNormalized:number;widthNormalized:number};

/** No inferred radius, width or caster position from arbitrary narrative text. */
export function compileCombatAttackArea(raw:unknown,rangeMeters?:number|null):CombatAttackArea|null {
 const parsed=parseSkillArea(raw);
 if(parsed.kind==="SELF_FIELD"){
  if(typeof rangeMeters!=="number"||!Number.isFinite(rangeMeters)||rangeMeters<=0||rangeMeters>AREA_CANVAS_METERS)
   throw new Error("El campo alrededor del usuario necesita un alcance de 0,1 a 10 m.");
  return {shape:"SELF_FIELD",radiusMeters:rangeMeters,radiusNormalized:rangeMeters/AREA_CANVAS_METERS};
 }
 if(parsed.kind==="CIRCLE"){
  const radiusMeters=parsed.radiusMeters!;
  return {shape:"CIRCLE",radiusMeters,radiusNormalized:radiusMeters/AREA_CANVAS_METERS};
 }
 if(parsed.kind==="STRIP"){
  const lengthMeters=parsed.lengthMeters!,widthMeters=parsed.widthMeters!;
  return {shape:"STRIP",lengthMeters,widthMeters,
   lengthNormalized:lengthMeters/AREA_CANVAS_METERS,
   widthNormalized:widthMeters/AREA_CANVAS_METERS};
 }
 if(parsed.kind==="LEGACY"&&/(?:área|circular|círculo|radio|explosión|cono|línea|rectángulo|franja)/i.test(parsed.label))
  throw new Error("Área de ataque aún no compatible. Selecciona un área tipada y configura sus dimensiones.");
 return null;
}
export function validateStripAngle(value:unknown):number {
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>=360)
  throw new Error("La dirección de la franja debe ser un ángulo entero de 0 a 359°.");
 return value;
}
export function circularAreaHits(center:{x:number;y:number},target:{x:number;y:number},area:CombatAttackArea):boolean {
 if(area.shape==="STRIP")throw new Error("La franja necesita comprobación rectangular.");
 return Math.hypot(center.x-target.x,center.y-target.y)<=area.radiusNormalized+1e-9;
}
/** Rotate the target into the strip's local frame. Width and length are full
 * dimensions, centered at the chosen point; never read the caster's invented 2D coordinates.
 */
export function rectangularAreaHits(
 center:{x:number;y:number},target:{x:number;y:number},
 area:Extract<CombatAttackArea,{shape:"STRIP"}>,angleDegrees:number,
):boolean {
 const radians=validateStripAngle(angleDegrees)*Math.PI/180;
 const dx=target.x-center.x,dy=target.y-center.y;
 const along=dx*Math.cos(radians)+dy*Math.sin(radians);
 const across=-dx*Math.sin(radians)+dy*Math.cos(radians);
 return Math.abs(along)<=area.lengthNormalized/2+1e-9
  &&Math.abs(across)<=area.widthNormalized/2+1e-9;
}
export function attackAreaHits(
 center:{x:number;y:number},target:{x:number;y:number},
 area:CombatAttackArea,angleDegrees?:number,
):boolean {
 if(area.shape==="STRIP")return rectangularAreaHits(center,target,area,validateStripAngle(angleDegrees));
 if(area.shape==="SELF_FIELD")throw new Error("El campo propio usa alcance longitudinal, no epicentro.");
 return circularAreaHits(center,target,area);
}
