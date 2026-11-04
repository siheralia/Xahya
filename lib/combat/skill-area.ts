import {parseSkillArea} from "../skills/area-of-effect.ts";

/** A local 10 × 10 m drawing plane until combat supports true 2D movement. */
export const AREA_CANVAS_METERS=10;
export type CombatAttackArea={
 shape:"CIRCLE"|"SELF_FIELD";radiusMeters:number;radiusNormalized:number;
};
/** Never interpret an unspecified area or legacy numeric free text as a circle. */
export function compileCombatAttackArea(raw:unknown,rangeMeters?:number|null):CombatAttackArea|null {
 const parsed=parseSkillArea(raw);
 if(parsed.kind==="SELF_FIELD"){
  // Self-centered sweeps use the skill's actual configured reach as radius.
  // The caster cannot choose a detached impact point.
  if(typeof rangeMeters!=="number"||!Number.isFinite(rangeMeters)||rangeMeters<=0||rangeMeters>AREA_CANVAS_METERS)
   throw new Error("El campo alrededor del usuario necesita un alcance de 0,1 a 10 m.");
  return {shape:"SELF_FIELD",radiusMeters:rangeMeters,radiusNormalized:rangeMeters/AREA_CANVAS_METERS};
 }
 if(parsed.kind==="CIRCLE"){
  const radiusMeters=parsed.radiusMeters!;
  return {shape:"CIRCLE",radiusMeters,radiusNormalized:radiusMeters/AREA_CANVAS_METERS};
 }
 if(parsed.kind==="LEGACY"&&/(?:área|circular|círculo|radio|explosión|cono|línea|rectángulo)/i.test(parsed.label))
  throw new Error("Área de ataque aún no compatible. Selecciona un círculo con radio de 0,1 a 10 m.");
 return null;
}
export function circularAreaHits(center:{x:number;y:number},target:{x:number;y:number},area:CombatAttackArea):boolean {
 return Math.hypot(center.x-target.x,center.y-target.y)<=area.radiusNormalized+1e-9;
}
