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
export function firstCoverAlongStroke(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 from:Point,to:Point,stroke:ReadonlyArray<Point>,excludeId?:string,
):SolidIntersection|null {
 if(stroke.length<2||stroke.some(p=>!point(p)||p.x<0||p.x>1||p.y<0||p.y>1))
  return null;
 const lengths=stroke.slice(1).map((p,i)=>Math.hypot(
  p.x-stroke[i].x,p.y-stroke[i].y));
 const total=lengths.reduce((n,m)=>n+m,0);
 let progress=0;
 let first:SolidIntersection|null=null;
 for(let i=0;i<lengths.length;i++){
  const next=progress+(total>1e-9?lengths[i]/total:1/lengths.length);
  const start={x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress};
  const end={x:from.x+(to.x-from.x)*next,y:from.y+(to.y-from.y)*next};
  const startHeight=(1-stroke[i].y)*10,endHeight=(1-stroke[i+1].y)*10;
  const hit=firstMeasuredObstacle(constructions,start,end,startHeight,endHeight,excludeId);
  if(hit){
   const globalT=progress+(next-progress)*hit.t;
   if(!first||globalT<first.t-1e-9||
      (Math.abs(globalT-first.t)<1e-9&&hit.block.id<first.block.id))
    first={block:hit.block,t:globalT};
  }
  progress=next;
 }
 return first;
}
