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

/** Display-only camera: show both fighters with room for a 1 m step.
 * A close duel fills the map (2.6–4 m), unlike the old fixed 10 m view.
 * Manual zoom in focuses on the acting character when the rival is far away.
 */
export type FieldViewport={center:FieldPoint;spanMeters:number};
export function battleFieldViewport(
 actor:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 rival:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 zoom=1,
):FieldViewport{
 const a=fieldPosition(actor),b=fieldPosition(rival);
 const distance=Math.hypot(b.x-a.x,b.y-a.y);
 const fitSpan=Math.max(2.6,distance+2);
 const factor=Number.isFinite(zoom)?Math.max(0.35,Math.min(2,zoom)):1;
 const center=factor<1
  ?{x:a.x+(b.x-a.x)*factor/2,y:a.y+(b.y-a.y)*factor/2}
  :{x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 return {center,spanMeters:Math.max(1.8,fitSpan*factor)};
}
export function fieldToViewport(viewport:FieldViewport,world:Point):Point{
 return {x:0.5+(world.x-viewport.center.x)/viewport.spanMeters,
  y:0.5+(world.y-viewport.center.y)/viewport.spanMeters};
}
export function viewportToField(viewport:FieldViewport,normalized:Point):Point{
 return {x:viewport.center.x+(normalized.x-0.5)*viewport.spanMeters,
  y:viewport.center.y+(normalized.y-0.5)*viewport.spanMeters};
}
export function previewViewportMove(viewport:FieldViewport,actor:Pick<CombatFighter,"positionMeters"|"fieldPosition">,
 normalized:Point):Point{
 const world=viewportToField(viewport,normalized),start=fieldPosition(actor);
 const dx=world.x-start.x,dy=world.y-start.y,length=Math.hypot(dx,dy);
 if(length<0.01)return {x:0,y:0};
 const factor=Math.min(1,COMPOSITE_MOVE_METERS/length);
 return {x:Math.round(dx*factor*1000)/1000,
  y:Math.round(dy*factor*1000)/1000};
}
