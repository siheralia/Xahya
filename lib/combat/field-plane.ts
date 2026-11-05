import type {CombatFighter,Point} from "./turn-engine.ts";

/** Coordinates in metres on a horizontal plane. X is forward/back,
 * Y is lateral. The legacy 1-D position is the X projection.
 * The SVG is a 10 m × 10 m *viewport*, not a height model.
 */
export type FieldPoint=Point;
export const FIELD_VIEW_METERS=10;
export const COMPOSITE_MOVE_METERS=1;
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);

export function fieldPosition(actor:Pick<CombatFighter,"positionMeters"|"fieldPosition">):FieldPoint {
 const saved=actor.fieldPosition;
 return saved&&finite(saved.x)&&finite(saved.y)
  ?{x:saved.x,y:saved.y}:{x:actor.positionMeters,y:0};
}
export function fieldDistance(a:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 b:Pick<CombatFighter,"positionMeters"|"fieldPosition">):number{
 const x=fieldPosition(a),y=fieldPosition(b);
 return Math.hypot(x.x-y.x,x.y-y.y);
}
export function validatePlanarMove(move:unknown,maxMeters=COMPOSITE_MOVE_METERS):FieldPoint{
 if(!move||typeof move!=="object"||Array.isArray(move))throw new Error("Trazo de desplazamiento inválido.");
 const p=move as Partial<Point>;
 if(!finite(p.x)||!finite(p.y))throw new Error("Dibuja un desplazamiento válido.");
 const length=Math.hypot(p.x,p.y);
 if(length<0.01||length>maxMeters+1e-8)
  throw new Error("El desplazamiento dibujado debe medir entre 0,01 y "+maxMeters+" m.");
 return {x:p.x,y:p.y};
}
export function moveFighterOnField(actor:CombatFighter,move:Point){
 const start=fieldPosition(actor);
 actor.fieldPosition={x:start.x+move.x,y:start.y+move.y};
 actor.positionMeters=actor.fieldPosition.x; // backward compatibility
}
export function pointFromFieldView(actor:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 normalized:Point):FieldPoint{
 if(!finite(normalized.x)||!finite(normalized.y)||
  normalized.x<0||normalized.x>1||normalized.y<0||normalized.y>1)
  throw new Error("Selecciona un punto válido en el plano horizontal.");
 const center=fieldPosition(actor);
 return {x:center.x+(normalized.x-0.5)*FIELD_VIEW_METERS,
  y:center.y+(normalized.y-0.5)*FIELD_VIEW_METERS};
}
export function pointToFieldView(actor:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 world:Point):Point{
 const center=fieldPosition(actor);
 return {x:0.5+(world.x-center.x)/FIELD_VIEW_METERS,
  y:0.5+(world.y-center.y)/FIELD_VIEW_METERS};
}
export function previewPlanarMove(normalized:Point):Point{
 const dx=(normalized.x-0.5)*FIELD_VIEW_METERS;
 const dy=(normalized.y-0.5)*FIELD_VIEW_METERS;
 const length=Math.hypot(dx,dy);
 if(length<0.01)return {x:0,y:0};
 const multiplier=Math.min(1,COMPOSITE_MOVE_METERS/length);
 return {x:Math.round(dx*multiplier*1000)/1000,
  y:Math.round(dy*multiplier*1000)/1000};
}
