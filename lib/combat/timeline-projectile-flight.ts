/**
 * Autonomous V2 projectile. Its action occupies only the wind-up; the
 * authoritative world queue resolves its separate future impact.
 */
import {defaultAttackSource,effectiveWeaponReachMeters,turnTicks,weaponForSource,
 type CombatCommand,type CombatState,type CombatFighter,type Side,type Point} from "./turn-engine.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";
import type {ContinuousCombatTimeline,TimelineEvent} from "./action-timeline.ts";
import {simulateBasicPhysicalTimelineHit} from "./timeline-basic-strike.ts";
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


/** All geometry and command data are server-authored and kept encounter-local. */
export type TimelineFlyingProjectile={
 id:string;owner:Side;launchTick:number;impactTick:number;
 flightTicks:number;origin:Point;target:Point;
 shooter:CombatFighter;command:BasicProjectile;
};
type Dice={hit:number;critical:number;defense:number};
type Defense=Extract<CombatCommand,{kind:"DEFEND"}>;

/** A shot commits its release, not its damage, after normal weapon wind-up. */
export function simulateTimelineProjectileLaunch(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:BasicProjectile,
):AuthorizedTimelineEffect {
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.kind!=="ATTACK"||event.status!=="RESOLVED"||
   clock.nowTick!==event.endsAtTick||event.paidAp!==1||
   !Number.isSafeInteger(event.projectileFlightTicks)||
   event.projectileFlightTicks!<1||
   !event.projectileOrigin||!event.projectileTarget)
   throw new Error("El proyectil no tiene una reserva temporal de salida.");
 const owner=event.owner,other=sideOther(owner);
 const validation=structuredClone(combat);
 validation.actors[owner].fieldPosition={...event.projectileOrigin};
 validation.actors[owner].positionMeters=event.projectileOrigin.x;
 validation.actors[other].fieldPosition={...event.projectileTarget};
 validation.actors[other].positionMeters=event.projectileTarget.x;
 const approved=physicalProjectileFlightTicks(validation,owner,command);
 const item=weaponForSource(combat.actors[owner],approved.source);
 const preparation=turnTicks(combat.actors[owner],
   item?command.attackType:undefined);
 if(approved.flightTicks!==event.projectileFlightTicks||
   event.durationTicks!==preparation)
   throw new Error("La preparación o el vuelo ya no coincide con su reserva.");
 const projectile:TimelineFlyingProjectile={
   id:event.id,owner,launchTick:event.endsAtTick,
   impactTick:event.endsAtTick+approved.flightTicks,
   flightTicks:approved.flightTicks,
   origin:{...event.projectileOrigin},target:{...event.projectileTarget},
   shooter:structuredClone(combat.actors[owner]),
   command:structuredClone(command),
 };
 if(!Number.isSafeInteger(projectile.impactTick)||
   projectile.impactTick<=event.endsAtTick)
   throw new Error("El horizonte del proyectil es inválido.");
 return {eventId:event.id,projectilesLaunched:[projectile],
   ...(command.throwWeapon?{resetPhysicalStrokes:[owner]}:{}),
   logs:[{kind:"PROJECTILE",tick:event.endsAtTick,by:owner,against:other,
     weaponName:item?.name,summary:combat.actors[owner].name+
       " disparó "+(item?.name??"un proyectil")+
       "; llegará al tick "+projectile.impactTick}]};
}

/** Independently impact from frozen origin/attacker into the current world's
 * defenses. The shooter may have moved, changed equipment, or fallen.
 * Leaving the frozen world target's hitbox makes the shot miss.
 */
export function simulateAutonomousTimelineProjectile(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 attackDice:Dice,defenseDice:Dice,
 posture:Defense={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect {
 if(combat.status!=="ACTIVE"||clock.version!==2||
   event.kind!=="AUTO_PROJECTILE"||event.status!=="RESOLVED"||
   event.endsAtTick!==clock.nowTick)
   throw new Error("El impacto autónomo no corresponde al reloj.");
 const projectile=(combat.timelineProjectiles??[]).find(p=>
   "WORLD:AUTO_PROJECTILE:"+event.endsAtTick+":"+
     encodeURIComponent(p.id)===event.id);
 if(!projectile||projectile.owner!==event.owner||
   projectile.impactTick!==event.endsAtTick||
   projectile.impactTick-projectile.launchTick!==projectile.flightTicks)
   throw new Error("El proyectil fue alterado o ya ha impactado.");
 const owner=projectile.owner,target=sideOther(owner);
 const simulation=structuredClone(combat);
 simulation.actors[owner]=structuredClone(projectile.shooter);
 simulation.actors[owner].fieldPosition={...projectile.origin};
 simulation.actors[owner].positionMeters=projectile.origin.x;
 const defender=simulation.actors[target],actual=fieldPosition(defender);
 defender.fieldPosition={...projectile.target};
 defender.positionMeters=projectile.target.x;
 const radius=projectile.command.attackType==="BLUNT"?.17:
   projectile.command.attackType==="CUT"?.11:.07;
 const missed=Math.hypot(actual.x-projectile.target.x,
   actual.y-projectile.target.y)>radius+1e-8;
 // The real V1 resolver still performs hit/contact, cover, mitigation and
 // shield wear. A miss changes only the relative aim point in the V1 shadow.
 const attack:BasicProjectile=missed
   ?{...projectile.command,areaCenter:{x:0,y:0}}
   :projectile.command;
 const source=projectile.command.attackSource??
   defaultAttackSource(projectile.shooter);
 const sourceItem=weaponForSource(projectile.shooter,source);
 const virtual:TimelineEvent={...event,kind:"ATTACK",paidAp:1,
   projectileFlightTicks:projectile.flightTicks,
   durationTicks:turnTicks(projectile.shooter,
     sourceItem?projectile.command.attackType:undefined)+projectile.flightTicks};
 const defense:Defense=posture.defense==="COUNTER"
   ?{kind:"DEFEND",defense:"NONE"}:posture;
 const effect=simulateBasicPhysicalTimelineHit(simulation,clock,virtual,
   attack,attackDice,defenseDice,defense);
 if((effect.hpDamage?.[owner]??0)>0||
   effect.positionDelta?.[owner]!==undefined||
   (effect.weaponThrows?.length??0)!==(projectile.command.throwWeapon?1:0))
   throw new Error("El proyectil intentó alterar al tirador actual.");
 const sourceId=sourceItem?.characterItemId;
 const sourceWear=(effect.equipmentWear??[])
   .filter(w=>w.owner===owner&&w.characterItemId===sourceId)
   .reduce((sum,w)=>sum+w.amount,0);
 const equipmentWear=(effect.equipmentWear??[])
   .filter(w=>w.owner!==owner);
 // Worn bow copies may be updated only if still genuinely equipped.
 const equipped=weaponForSource(combat.actors[owner],source);
 if(!projectile.command.throwWeapon&&equipped&&
   equipped.characterItemId===sourceId)
   equipmentWear.push(...(effect.equipmentWear??[]).filter(w=>
     w.owner===owner&&w.characterItemId===sourceId));
 if((effect.equipmentWear??[]).some(w=>
   w.owner===owner&&w.characterItemId!==sourceId))
   throw new Error("Desgaste no autorizado del tirador congelado.");
 const {weaponThrows:discardThrows,physicalStrokes:discardStrokes,
   resetPhysicalStrokes:discardReset,...safe}=effect;
 void discardThrows;void discardStrokes;void discardReset;
 return {...safe,eventId:event.id,equipmentWear,
   projectilesImpacted:[{id:projectile.id,owner,
     weaponWear:projectile.command.throwWeapon?sourceWear:0}],
   ...(missed?{logs:[...(safe.logs??[]),{kind:"PROJECTILE",
     tick:event.endsAtTick,by:owner,against:target,
     summary:"El proyectil de "+projectile.shooter.name+
       " pasó por la posición original del objetivo."}]}:{})};
}
