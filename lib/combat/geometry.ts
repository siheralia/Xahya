import type { Point } from "./turn-engine";
import type { CombatAttackType } from "./ticks";

export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function segmentDistance(point:Point,a:Point,b:Point):number {
 const dx=b.x-a.x,dy=b.y-a.y;
 const length=dx*dx+dy*dy;
 if(length<1e-12)return distance(point,a);
 const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length));
 return distance(point,{x:a.x+t*dx,y:a.y+t*dy});
}
/** Arena-normalized impact against the defender's central hitbox. */
export function geometricContact(type:CombatAttackType,points:Point[],center:Point={x:0.5,y:0.5}):boolean {
 if(points.length===0)return false;
 const last=points[points.length-1];
 if(type==="PIERCE")return distance(last,center)<=0.065;
 if(type==="BLUNT")return distance(last,center)<=0.16;
 for(let i=1;i<points.length;i++)if(segmentDistance(center,points[i-1],points[i])<=0.10)return true;
 return points.length===1&&distance(last,center)<=0.10;
}
