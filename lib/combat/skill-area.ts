import {parseSkillArea} from "../skills/area-of-effect.ts";

/** Local defender-facing 10 × 10 m projection, not a world map of either combatant. */
export const AREA_CANVAS_METERS=10;
export type CombatAttackArea=
 | {shape:"CIRCLE"|"SELF_FIELD";radiusMeters:number;radiusNormalized:number}
 | {shape:"STRIP";lengthMeters:number;widthMeters:number;
    lengthNormalized:number;widthNormalized:number}
 | {shape:"CONE";radiusMeters:number;radiusNormalized:number;openingDegrees:number}
 | {shape:"SWEEP";innerRadiusMeters:number;outerRadiusMeters:number;
    innerRadiusNormalized:number;outerRadiusNormalized:number;openingDegrees:number};
export type OrientedCombatArea=Extract<CombatAttackArea,{shape:"STRIP"|"CONE"|"SWEEP"}>;
export const isOrientedCombatArea=(area:CombatAttackArea|undefined|null):area is OrientedCombatArea=>
 area?.shape==="STRIP"||area?.shape==="CONE"||area?.shape==="SWEEP";

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
 if(parsed.kind==="CONE"){
  const radiusMeters=parsed.radiusMeters!;
  return {shape:"CONE",radiusMeters,radiusNormalized:radiusMeters/AREA_CANVAS_METERS,
   openingDegrees:parsed.openingDegrees!};
 }
 if(parsed.kind==="SWEEP"){
  const innerRadiusMeters=parsed.innerRadiusMeters!,outerRadiusMeters=parsed.outerRadiusMeters!;
  return {shape:"SWEEP",innerRadiusMeters,outerRadiusMeters,
   innerRadiusNormalized:innerRadiusMeters/AREA_CANVAS_METERS,
   outerRadiusNormalized:outerRadiusMeters/AREA_CANVAS_METERS,
   openingDegrees:parsed.openingDegrees!};
 }
 if(parsed.kind==="LEGACY"&&/(?:área|circular|círculo|radio|explosión|cono|línea|rectángulo|franja|barrido)/i.test(parsed.label))
  throw new Error(/radio/i.test(parsed.label)
   ?"El radio del área es inválido o aún no compatible. Configura un radio de 0,1 a 10 m.":
   "Área de ataque aún no compatible. Selecciona un área tipada y configura sus dimensiones.");
 return null;
}
/** Orientation is a per-launch integer. It never comes from untrusted skill descriptions. */
export function validateAreaDirection(value:unknown):number {
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>=360)
  throw new Error("La dirección del área debe ser un ángulo entero de 0 a 359°.");
 return value;
}
/** Backward compatible export for existing strip UI/tests. */
export const validateStripAngle=validateAreaDirection;
export function circularAreaHits(center:{x:number;y:number},target:{x:number;y:number},area:CombatAttackArea):boolean {
 if(area.shape!=="CIRCLE"&&area.shape!=="SELF_FIELD")throw new Error("Esta área no es circular.");
 return Math.hypot(center.x-target.x,center.y-target.y)<=area.radiusNormalized+1e-9;
}
/** Rotate the target into the strip's local frame. Width and length are full
 * dimensions, centered at the chosen point; never read the caster's invented 2D coordinates.
 */
export function rectangularAreaHits(
 center:{x:number;y:number},target:{x:number;y:number},
 area:Extract<CombatAttackArea,{shape:"STRIP"}>,angleDegrees:number,
):boolean {
 const radians=validateAreaDirection(angleDegrees)*Math.PI/180;
 const dx=target.x-center.x,dy=target.y-center.y;
 const along=dx*Math.cos(radians)+dy*Math.sin(radians);
 const across=-dx*Math.sin(radians)+dy*Math.cos(radians);
 return Math.abs(along)<=area.lengthNormalized/2+1e-9
  &&Math.abs(across)<=area.widthNormalized/2+1e-9;
}
/** Exact point-in-sector/annulus. 0° faces right, 90° faces down in the SVG plane.
 * The visible polygon and authoritative hit test use the same center/direction.
 */
export function angularAreaHits(
 center:{x:number;y:number},target:{x:number;y:number},
 area:Extract<CombatAttackArea,{shape:"CONE"|"SWEEP"}>,angleDegrees:number,
):boolean {
 const direction=validateAreaDirection(angleDegrees)*Math.PI/180;
 const dx=target.x-center.x,dy=target.y-center.y;
 const radius=Math.hypot(dx,dy);
 if(area.shape==="CONE"&&radius>area.radiusNormalized+1e-9)return false;
 if(area.shape==="SWEEP"&&(radius<area.innerRadiusNormalized-1e-9||radius>area.outerRadiusNormalized+1e-9))
  return false;
 if(radius<=1e-12)return area.shape==="CONE";
 const offset=Math.atan2(Math.sin(Math.atan2(dy,dx)-direction),Math.cos(Math.atan2(dy,dx)-direction));
 return Math.abs(offset)<=area.openingDegrees*Math.PI/360+1e-9;
}
export function attackAreaHits(
 center:{x:number;y:number},target:{x:number;y:number},
 area:CombatAttackArea,angleDegrees?:number,
):boolean {
 if(area.shape==="STRIP")return rectangularAreaHits(center,target,area,validateAreaDirection(angleDegrees));
 if(area.shape==="CONE"||area.shape==="SWEEP")return angularAreaHits(center,target,area,validateAreaDirection(angleDegrees));
 if(area.shape==="SELF_FIELD")throw new Error("El campo propio usa alcance longitudinal, no epicentro.");
 return circularAreaHits(center,target,area);
}
/** SVG sector path in normalized canvas coordinates scaled to 100. Same aperture as hit test. */
export function angularAreaSvgPath(
 center:{x:number;y:number},area:Extract<CombatAttackArea,{shape:"CONE"|"SWEEP"}>,
 angleDegrees:number,scale=100,
):string {
 const direction=validateAreaDirection(angleDegrees);
 const half=area.openingDegrees/2;
 const largeArc=area.openingDegrees>180?1:0;
 const polar=(radius:number,angle:number)=>{
  const rad=angle*Math.PI/180;
  return [(center.x+radius*Math.cos(rad))*scale,(center.y+radius*Math.sin(rad))*scale].join(" ");
 };
 const inner=area.shape==="SWEEP"?area.innerRadiusNormalized:0;
 const outer=area.shape==="SWEEP"?area.outerRadiusNormalized:area.radiusNormalized;
 const start=direction-half,end=direction+half;
 const outerStart=polar(outer,start),outerEnd=polar(outer,end);
 if(area.shape==="CONE")
  return "M "+center.x*scale+" "+center.y*scale+" L "+outerStart+
   " A "+outer*scale+" "+outer*scale+" 0 "+largeArc+" 1 "+outerEnd+" Z";
 const innerEnd=polar(inner,end),innerStart=polar(inner,start);
 return "M "+innerStart+" L "+outerStart+
  " A "+outer*scale+" "+outer*scale+" 0 "+largeArc+" 1 "+outerEnd+
  " L "+innerEnd+" A "+inner*scale+" "+inner*scale+" 0 "+largeArc+" 0 "+innerStart+" Z";
}
