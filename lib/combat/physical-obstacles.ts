import type {CombatConstruction} from "./constructs.ts";
import type {Point} from "./turn-engine.ts";

export type PhysicalCollider={radiusMeters:number;solidHeightMeters:number};
export type SolidIntersection={block:CombatConstruction;t:number};

const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
const point=(p:Point|undefined):p is Point=>!!p&&finite(p.x)&&finite(p.y);

/** Physical cylinders are opt-in. No size, position or vertical extent can be
 * inferred from an old BLOCK's decorative 6.6px map marker or canvas center.
 */
export function measuredBlock(block:CombatConstruction):boolean {
 return block.form==="BLOCK"&&block.tangible&&(block.durability??0)>0
  &&point(block.fieldPosition)&&finite(block.heightMeters)
  &&finite(block.footprintRadiusMeters)&&block.footprintRadiusMeters>0
  &&finite(block.solidHeightMeters)&&block.solidHeightMeters>0;
}

/** Dimensions are deliberately explicit when enabled. Old encounter blocks
 * with no geometry remain valid for their existing paid defense behavior.
 * Partial configuration is invalid; client fields never convey authority.
 */
export function validatePhysicalCollider(
 radius:unknown,height:unknown,base:unknown,position:Point|undefined,
):PhysicalCollider|undefined {
 if(radius===undefined&&height===undefined)return undefined;
 if(!finite(radius)||radius<0.1||radius>3)
  throw new Error("Indica un radio físico entre 0,1 y 3 m para el bloque.");
 if(!finite(height)||height<0.1||height>10)
  throw new Error("Indica una altura física entre 0,1 y 10 m para el bloque.");
 if(!point(position))
  throw new Error("Marca una posición horizontal real para el bloque sólido.");
 if(!finite(base)||base<0||base+height>10+1e-8)
  throw new Error("La base y la altura del bloque deben caber entre 0 y 10 m.");
 return {radiusMeters:radius,solidHeightMeters:height};
}

/** Earliest intersection of a 3D segment with the measured vertical cylinder.
 * Horizontal footprint and vertical height are both checked, not a sprite.
 */
export function measuredSegmentHit(
 block:CombatConstruction,from:Point,to:Point,startHeight:number,endHeight:number,
):number|null {
 if(!measuredBlock(block)||!point(from)||!point(to)||
    !finite(startHeight)||!finite(endHeight))return null;
 const c=block.fieldPosition!,r=block.footprintRadiusMeters!;
 const dx=to.x-from.x,dy=to.y-from.y;
 const fx=from.x-c.x,fy=from.y-c.y;
 const a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),q=fx*fx+fy*fy-r*r;
 let lo=0,hi=1;
 if(a<1e-12){
  if(q>0)return null;
 }else{
  const determinant=b*b-4*a*q;
  if(determinant<0)return null;
  const root=Math.sqrt(Math.max(0,determinant));
  lo=Math.max(0,(-b-root)/(2*a));
  hi=Math.min(1,(-b+root)/(2*a));
  if(lo>hi+1e-9)return null;
 }
 const base=block.heightMeters!,top=base+block.solidHeightMeters!;
 const dz=endHeight-startHeight;
 if(Math.abs(dz)<1e-12){
  if(startHeight<base-1e-9||startHeight>top+1e-9)return null;
 }else{
  const t0=(base-startHeight)/dz,t1=(top-startHeight)/dz;
  lo=Math.max(lo,Math.min(t0,t1),0);
  hi=Math.min(hi,Math.max(t0,t1),1);
 }
 return lo<=hi+1e-9?lo:null;
}

export function firstMeasuredObstacle(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,startHeight:number,endHeight:number,excludeId?:string,
):SolidIntersection|null {
 let first:SolidIntersection|null=null;
 for(const block of constructions??[]){
  if(block.id===excludeId)continue;
  const t=measuredSegmentHit(block,from,to,startHeight,endHeight);
  if(t===null)continue;
  if(!first||t<first.t-1e-9||(Math.abs(t-first.t)<1e-9&&block.id<first.block.id))
   first={block,t};
 }
 return first;
}

/** A ground-level point actor may leave an obstacle it was already inside
 * on a legacy encounter, but cannot enter or pass another solid footprint.
 * The same test covers diagonal moves and endpoints beyond the obstruction.
 */
export function blockingMovement(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,
):SolidIntersection|null {
 const candidates=(constructions??[]).filter(block=>{
  if(!measuredBlock(block))return false;
  const c=block.fieldPosition!,r=block.footprintRadiusMeters!;
  const startDistance=Math.hypot(from.x-c.x,from.y-c.y);
  const startInside=startDistance<r-1e-8;
  const outwardAtBoundary=Math.abs(startDistance-r)<=1e-8&&
   (from.x-c.x)*(to.x-from.x)+(from.y-c.y)*(to.y-from.y)>=0;
  const endOutside=Math.hypot(to.x-c.x,to.y-c.y)>r+1e-8;
  return !((startInside||outwardAtBoundary)&&endOutside);
 });
 return firstMeasuredObstacle(candidates,from,to,0,0);
}

export function assertMovementClear(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,
):void {
 const hit=blockingMovement(constructions,from,to);
 if(hit)throw new Error("El desplazamiento atraviesa el obstáculo "+hit.block.label+". Rodea el bloque o cambia la trayectoria.");
}

/** Map a defender-facing vertical stroke onto the measured world segment
 * between the two combatants. Depth progresses with the stroke's drawn
 * length; y=1 is ground, y=0 is 10m high. Sample EACH stroke segment so
 * curved arcs cannot bypass a wall merely because their endpoints are high.
 * Never use the automatic placeholder stroke for this interpretation.
 */
/** All measured barriers hit by a drawn physical stroke, nearest first.
 * A zigzag must not wear one construction more than once; all segments share
 * the same normalized depth, and equal-depth ties use a stable block id.
 * Pure geometry: durability is changed only by the combat resolver.
 */
export function coversAlongStroke(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,stroke:ReadonlyArray<Point>,excludeId?:string,
):SolidIntersection[] {
 if(stroke.length<2||stroke.some(p=>!point(p)||p.x<0||p.x>1||p.y<0||p.y>1))
  return [];
 const lengths=stroke.slice(1).map((p,i)=>Math.hypot(
  p.x-stroke[i].x,p.y-stroke[i].y));
 const total=lengths.reduce((n,m)=>n+m,0);
 const blocks=(constructions??[]).filter(b=>b.id!==excludeId&&measuredBlock(b));
 const hits=new Map<string,SolidIntersection>();
 let progress=0;
 for(let i=0;i<lengths.length;i++){
  const next=progress+(total>1e-9?lengths[i]/total:1/lengths.length);
  const start={x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress};
  const end={x:from.x+(to.x-from.x)*next,y:from.y+(to.y-from.y)*next};
  const startHeight=(1-stroke[i].y)*10,endHeight=(1-stroke[i+1].y)*10;
  for(const block of blocks){
   const t=measuredSegmentHit(block,start,end,startHeight,endHeight);
   if(t===null)continue;
   const globalT=progress+(next-progress)*t;
   const previous=hits.get(block.id);
   if(!previous||globalT<previous.t)
    hits.set(block.id,{block,t:globalT});
  }
  progress=next;
 }
 return [...hits.values()].sort((a,b)=>
  Math.abs(a.t-b.t)<=1e-9
   ?(a.block.id<b.block.id?-1:a.block.id>b.block.id?1:0)
   :a.t-b.t);
}

/** Backward-compatible first-cover query, using the same ordered intersections. */
export function firstCoverAlongStroke(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,stroke:ReadonlyArray<Point>,excludeId?:string,
):SolidIntersection|null {
 return coversAlongStroke(constructions,from,to,stroke,excludeId)[0]??null;
}

/** A ballistic arc is a deliberately selected spatial path, not a trajectory
 * inferred from the defender-facing vertical drawing. The rise is the extra
 * elevation AT THE MIDPOINT above the straight launch-to-impact line.
 * Zero rise is exactly the previous straight-shot geometry.
 */
export type MeasuredProjectileFlight={
 from:Point;to:Point;launchHeightMeters:number;impactHeightMeters:number;
 arcRiseMeters?:number;
};
export const MAX_PROJECTILE_ARC_RISE_METERS=5;
export const PROJECTILE_ARC_SEGMENTS=64;
export function projectileHeightAt(flight:MeasuredProjectileFlight,t:number):number {
 const rise=flight.arcRiseMeters??0;
 return flight.launchHeightMeters+
  (flight.impactHeightMeters-flight.launchHeightMeters)*t+
  4*rise*t*(1-t);
}
export function validateProjectileHeights(
 launch:unknown,impact:unknown,arcRise:unknown=0,
):{launchHeightMeters:number;impactHeightMeters:number;arcRiseMeters:number} {
 if(!finite(launch)||!finite(impact)||launch<0||launch>10||impact<0||impact>10)
  throw new Error("Indica alturas de salida e impacto del proyectil entre 0 y 10 m.");
 if(!finite(arcRise)||arcRise<0||arcRise>MAX_PROJECTILE_ARC_RISE_METERS)
  throw new Error("El arco del proyectil debe elevarse entre 0 y 5 m.");
 // A parabola can climb above BOTH endpoints, even if the UI shows legal
 // values. Verify the analytic vertex to reject impossible 10m+ flights.
 const delta=impact-launch;
 const vertex=arcRise>0?Math.max(0,Math.min(1,0.5+delta/(8*arcRise))):0;
 const maxAltitude=Math.max(launch,impact,launch+delta*vertex+
   4*arcRise*vertex*(1-vertex));
 if(maxAltitude>10+1e-8)
  throw new Error("El arco del proyectil supera la altura máxima de 10 m.");
 return {launchHeightMeters:launch,impactHeightMeters:impact,arcRiseMeters:arcRise};
}

/** Ordered cylinder intersections along the measured projectile arc.
 * Sample 64 straight 3D chords (at most 1.3mm chord error for a 5m rise)
 * and compute an exact intersection for EVERY piece; never infer a collider
 * from a decorative map sprite. A barrier touched more than once wears once.
 */
export function coversAlongProjectileFlight(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 flight:MeasuredProjectileFlight,excludeId?:string,
):SolidIntersection[] {
 if(!point(flight.from)||!point(flight.to))return [];
 const {launchHeightMeters,impactHeightMeters,arcRiseMeters}=flight;
 if(!finite(launchHeightMeters)||!finite(impactHeightMeters)||
  !finite(arcRiseMeters??0)||launchHeightMeters<0||impactHeightMeters<0||
  launchHeightMeters>10||impactHeightMeters>10||
  (arcRiseMeters??0)<0||(arcRiseMeters??0)>MAX_PROJECTILE_ARC_RISE_METERS)
  return [];
 const steps=(arcRiseMeters??0)>0?PROJECTILE_ARC_SEGMENTS:1;
 const blockers=(constructions??[]).filter(c=>c.id!==excludeId&&measuredBlock(c));
 const hits=new Map<string,SolidIntersection>();
 const pointAt=(t:number)=>({
  x:flight.from.x+(flight.to.x-flight.from.x)*t,
  y:flight.from.y+(flight.to.y-flight.from.y)*t,
 });
 for(let i=0;i<steps;i++){
  const t0=i/steps,t1=(i+1)/steps;
  const from=pointAt(t0),to=pointAt(t1);
  const h0=projectileHeightAt(flight,t0),h1=projectileHeightAt(flight,t1);
  for(const block of blockers){
   const localT=measuredSegmentHit(block,from,to,h0,h1);
   if(localT===null)continue;
   const globalT=t0+(t1-t0)*localT;
   const previous=hits.get(block.id);
   if(!previous||globalT<previous.t)
    hits.set(block.id,{block,t:globalT});
  }
 }
 return [...hits.values()].sort((a,b)=>
  Math.abs(a.t-b.t)<=1e-9
   ?a.block.id.localeCompare(b.block.id)
   :a.t-b.t);
}
