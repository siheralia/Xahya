/**
 * Strict V2 basic physical projectile reservation. A projectile occupies
 * its action's wind-up PLUS measured flight time, never an instantaneous
 * ranged hit. This first increment intentionally holds the attacker busy
 * until impact; independent in-flight events will be a later migration.
 */
import {defaultAttackSource,effectiveWeaponReachMeters,turnTicks,weaponForSource,
 type CombatCommand,type CombatState,type Side} from "./turn-engine.ts";
import {fieldPosition} from "./field-plane.ts";
import {validateProjectileHeights} from "./physical-obstacles.ts";
import type {PhysicalAttackSource} from "./turn-engine.ts";

export type BasicProjectile=Extract<CombatCommand,{kind:"ATTACK"}>;
export const PROJECTILE_METERS_PER_TICK=0.25;
const sideOther=(s:Side):Side=>s==="PLAYER"?"NPC":"PLAYER";
const isPoint=(p:unknown):p is {x:number;y:number}=>{
 const v=p as {x?:number;y?:number}|null;
 return !!v&&typeof v.x==="number"&&typeof v.y==="number"&&
   Number.isFinite(v.x)&&Number.isFinite(v.y)&&
   v.x>=0&&v.x<=1&&v.y>=0&&v.y<=1;
};

export function physicalProjectileFlightTicks(
 combat:CombatState,owner:Side,attack:BasicProjectile,
):{flightTicks:number;source:PhysicalAttackSource;weaponCopyId?:number}{
 if(attack.kind!=="ATTACK"||attack.usesMagic===true||
   !(attack.rangedPhysical===true||attack.throwWeapon===true)||
   attack.planarMove!==undefined||attack.movementOrder!==undefined||
   attack.targetSummonId!==undefined||
   attack.targetConstructionId!==undefined||
   attack.areaAngleDegrees!==undefined||
   !isPoint(attack.areaCenter)||
   !attack.projectileHeights||
   attack.trajectory!==undefined&&attack.trajectory.length>0)
   throw new Error("El proyectil necesita puntería y alturas autorizadas, sin movimiento compuesto.");
 const source=attack.attackSource??defaultAttackSource(combat.actors[owner]);
 if(source!=="MAIN_HAND"&&source!=="OFF_HAND")
   throw new Error("Los proyectiles físicos requieren un arma equipada.");
 const weapon=weaponForSource(combat.actors[owner],source);
 if(!weapon||weapon.attackType!==attack.attackType||
   (weapon.durability??100)<=0||
   (attack.throwWeapon===true
     ?!weapon.throwable||!weapon.throwRangeMeters||
       !Number.isSafeInteger(weapon.characterItemId)||
       (weapon.characterItemId??0)<=0
     :weapon.mode!=="RANGED"))
   throw new Error("El arma no permite este disparo o lanzamiento.");
 const reach=effectiveWeaponReachMeters(combat.actors[owner],
   attack.throwWeapon===true,source);
 const from=fieldPosition(combat.actors[owner]);
 const to=fieldPosition(combat.actors[sideOther(owner)]);
 const horizontal=Math.hypot(to.x-from.x,to.y-from.y);
 if(!Number.isFinite(horizontal)||horizontal>reach+1e-8)
   throw new Error("El objetivo está fuera del alcance del proyectil.");
 const raw=attack.projectileHeights;
 const heights=validateProjectileHeights(raw.launchMeters,
   raw.impactMeters,raw.arcRiseMeters);
 // Piecewise path length includes the configured arc and vertical travel.
 // No speed/tick coefficient is accepted from a browser command.
 let distance=0,previous=heights.launchHeightMeters;
 for(let i=1;i<=16;i++){
   const t=i/16;
   const z=heights.launchHeightMeters+
     (heights.impactHeightMeters-heights.launchHeightMeters)*t+
     4*heights.arcRiseMeters*t*(1-t);
   distance+=Math.hypot(horizontal/16,z-previous);
   previous=z;
 }
 const flightTicks=Math.max(1,Math.ceil(distance/PROJECTILE_METERS_PER_TICK));
 if(!Number.isSafeInteger(flightTicks)||flightTicks>10000)
   throw new Error("El vuelo del proyectil excede el horizonte permitido.");
 return {flightTicks,source,
   ...(weapon.characterItemId?{weaponCopyId:weapon.characterItemId}:{})};
}
