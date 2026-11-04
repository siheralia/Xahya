/**
 * A circular combat area is an explicitly configured part of an approved skill.
 * The 2D target canvas is a LOCAL ten-meter projection, independent of the
 * characters' longitudinal positionMeters (used only for attack reach).
 * Other descriptions keep their historic single-target behavior. Unsupported
 * descriptions that explicitly claim a geometric area fail closed.
 */
export const AREA_CANVAS_METERS = 10;
export type CombatAttackArea = {
 shape:"CIRCLE";radiusMeters:number;radiusNormalized:number;
};
export function compileCombatAttackArea(area:unknown):CombatAttackArea|null {
 const raw=typeof area==="string"?area.trim():"";
 const match=/^(?:área\s+circular\s+de\s+|círculo\s+de\s+|radio\s*(?::|de)?\s*)(\d+(?:[.,]\d+)?)\s*m(?:\s+de\s+radio)?$/i.exec(raw);
 if(match){
  const radiusMeters=Number(match[1].replace(",","."));
  if(!Number.isFinite(radiusMeters)||radiusMeters<=0||radiusMeters>AREA_CANVAS_METERS)
   throw new Error("El radio del área debe ser mayor que 0 y como máximo 10 m.");
  return {shape:"CIRCLE",radiusMeters,radiusNormalized:radiusMeters/AREA_CANVAS_METERS};
 }
 if(/(?:área|circular|círculo|radio|explosión|cono|línea|rectángulo)/i.test(raw)&&
    !/^(?:Objetivo único|Contacto|Instantánea)$/i.test(raw))
  throw new Error("Área de ataque aún no compatible. Usa «Área circular de 3 m» o «Radio 3 m».");
 return null;
}
/** Geometric contact for area skills: only explicit circles use this rule.
 * The defender is the center marker (0.5,0.5); no implicit second target.
 */
export function circularAreaHits(center:{x:number;y:number},target:{x:number;y:number},area:CombatAttackArea):boolean {
 return Math.hypot(center.x-target.x,center.y-target.y)<=area.radiusNormalized+1e-9;
}
