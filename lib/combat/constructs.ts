import {validateVariableResistance,withResistanceOwners,type VariableResistance} from "../skills/variable-resistance.ts";
import type {Point,Side} from "./turn-engine.ts";
import {attackAreaHits,type CombatAttackArea} from "./skill-area.ts";

export type ConstructionForm="FIELD"|"BLOCK"|"DECOR"|"MIRROR";
export type ConstructionPlan={material:string;label:string};
export type CombatConstruction={
 id:string;owner:Side;sourceSkillId:number;material:string;
 form:ConstructionForm;label:string;center:Point;createdRound:number;
 /** Horizontal position in metres; optional for encounters created earlier. */
 fieldPosition?:Point;
 /** Construction base height above the ground, in metres. */
 heightMeters?:number;
 /** Opt-in measured solid cylinder. Missing values on historical objects mean
  * their map sprite is NOT an authority for movement or line-of-sight blocking.
  */
 footprintRadiusMeters?:number;
 solidHeightMeters?:number;
 /** For mirrors only: longitudinal world coordinate (m) where it was summoned. */
 positionMeters?:number;
 /** A cosmetic construction cannot intercept attacks or affect stats. */
 tangible:boolean;durability?:number;hitCount?:number;
 /** A mirror acts independently once per round and reflects only incoming magic. */
 mirror?:{rayMultiplier:number;reflectionMultiplier:number;rangeMeters:number;attackType:"PIERCE";};
 passive?:{sourceSkillId:number;resistance:VariableResistance};
};
const MATERIAL=/^[A-Z][A-Z0-9_]{0,63}$/;
export function creationPlanFromEffect(effect:unknown):ConstructionPlan|null {
 if(!effect||typeof effect!=="object"||Array.isArray(effect))return null;
 const e=effect as Record<string,unknown>;
 if(e.type!=="NARRATIVE"||e.capability!=="CREATE"||typeof e.element!=="string")return null;
 const material=e.element.trim().toUpperCase();
 if(!MATERIAL.test(material))throw new Error("Elemento de construcción inválido.");
 return {material,label:material==="LIGHT"?"Objeto de luz":material==="EARTH"?"Arena":"Construcción de "+material};
}
/** Discover an approved, attached passive from configuration; never hardcode
 * Sikatā's name/ID. The explicit parent and activation condition must match.
 */
export function attachedCreationPassive(sourceSkillId:number,skills:ReadonlyArray<Record<string,unknown>>):
 {sourceSkillId:number;resistance:VariableResistance}|undefined {
 for(const skill of skills){
  if(skill.status!=="APPROVED"||skill.category!=="PASSIVE")continue;
  const mechanics=(skill.mechanics&&typeof skill.mechanics==="object"&&!Array.isArray(skill.mechanics))
   ?skill.mechanics as Record<string,unknown>:{};
  if(Number(mechanics.parentSkillId)!==sourceSkillId)continue;
  const conditions=Array.isArray(mechanics.activationConditions)?mechanics.activationConditions:[];
  if(!conditions.some(c=>c&&typeof c==="object"&&
   (c as Record<string,unknown>).kind==="SKILL_ACTIVE"&&Number((c as Record<string,unknown>).skillId)===sourceSkillId))continue;
  if(!mechanics.variableResistance||validateVariableResistance(mechanics.variableResistance))continue;
  return {sourceSkillId:Number(skill.id),resistance:withResistanceOwners(mechanics.variableResistance as VariableResistance)};
 }
 return undefined;
}
export function validateConstructionPlacement(raw:unknown):Point {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Selecciona dónde colocar la construcción.");
 const p=raw as Record<string,unknown>;
 if(typeof p.x!=="number"||typeof p.y!=="number"||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
  p.x<0||p.x>1||p.y<0||p.y>1)throw new Error("Posición de construcción inválida.");
 return {x:p.x,y:p.y};
}
export function resolveConstructionForm(material:string,requested:unknown,hasField:boolean):ConstructionForm {
 const form=requested??(material==="LIGHT"?"DECOR":"FIELD");
 if(!["FIELD","BLOCK","DECOR"].includes(String(form)))throw new Error("Forma de construcción inválida.");
 if(material==="MIRROR"&&form!=="MIRROR")throw new Error("El espejo requiere su forma propia.");
 if(material==="LIGHT"&&form!=="DECOR")throw new Error("Los objetos de luz de esta habilidad son decorativos.");
 if(form==="BLOCK"&&!hasField)throw new Error("Debes crear primero el campo de material.");
 if(form==="DECOR"&&material!=="LIGHT")throw new Error("La construcción de este material no es decorativa.");
 return form as ConstructionForm;
}

/** Horizontal interception size of a magical mirror (0.7 m diameter).
 * This is a combat rule, not inferred from the sprite on the aiming canvas.
 * A mirror without an explicitly recorded world position cannot block a ray.
 */
export const MIRROR_RAY_INTERCEPT_RADIUS_METERS=0.35;

/** Find the FIRST defender-owned mirror between the source and the target
 * along a directed, single-target magical ray. World coordinates here are
 * horizontal metres, NOT the 0..1 defender-facing vertical aiming canvas.
 *
 * A mirror near the target but off the actual path must not reflect it.
 * Legacy mirrors without a finite fieldPosition retain their other behavior,
 * but cannot gain invented ray interception from positionMeters or center.
 */
export function firstMirrorAlongMagicRay(
 constructions:ReadonlyArray<CombatConstruction>|undefined,
 defender:Side,from:Point,to:Point,excludeId?:string,
):{mirror:CombatConstruction;t:number}|null {
 const valid=(p:Point|undefined):p is Point=>
  !!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 if(!valid(from)||!valid(to))return null;
 const dx=to.x-from.x,dy=to.y-from.y,dist2=dx*dx+dy*dy;
 if(dist2<=1e-12)return null;
 const radius=MIRROR_RAY_INTERCEPT_RADIUS_METERS;
 let first:{mirror:CombatConstruction;t:number}|null=null;
 for(const mirror of constructions??[]){
  if(mirror.id===excludeId||mirror.owner!==defender||mirror.form!=="MIRROR"||
     !mirror.tangible||!mirror.mirror||(mirror.durability??0)<=0||
     !valid(mirror.fieldPosition))continue;
  const x=mirror.fieldPosition.x-from.x,y=mirror.fieldPosition.y-from.y;
  const tCenter=(x*dx+y*dy)/dist2;
  if(tCenter<=0||tCenter>=1)continue;
  const perpendicular2=Math.max(0,x*x+y*y-tCenter*tCenter*dist2);
  if(perpendicular2>radius*radius+1e-9)continue;
  const tEntry=tCenter-Math.sqrt(Math.max(0,radius*radius-perpendicular2)/dist2);
  // The ray must actually meet the mirror AFTER it leaves its origin.
  // Mirrors containing the launch point are not an intervening obstacle.
  if(tEntry<=1e-9||tEntry>=1)continue;
  if(!first||tEntry<first.t-1e-9||
     (Math.abs(tEntry-first.t)<=1e-9&&mirror.id<first.mirror.id))
   first={mirror,t:tEntry};
 }
 return first;
}

/** True only when the actual approved attack footprint touches a tangible
 * construction. Targeted circles/strips/sectors use the vertical defender-
 * facing projection; their coordinates are NOT world-map positions.
 *
 * A SELF_FIELD has no detachable epicenter. It uses the measured horizontal
 * distance from its caster to the block instead. Old blocks without a
 * measured fieldPosition cannot be assigned a fabricated world location.
 */
export function constructionInAreaFootprint(
 construction:CombatConstruction,area:CombatAttackArea,
 center:Point|undefined,angleDegrees:number|undefined,casterWorld:Point,
):boolean {
 if(!construction.tangible||(construction.durability??0)<=0)return false;
 if(area.shape==="SELF_FIELD"){
  const world=construction.fieldPosition;
  if(!world||!Number.isFinite(world.x)||!Number.isFinite(world.y))return false;
  return Math.hypot(world.x-casterWorld.x,world.y-casterWorld.y)<=area.radiusMeters+1e-9;
 }
 if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.y))return false;
 return attackAreaHits(center,construction.center,area,angleDegrees);
}
