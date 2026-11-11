/**
 * Server-approved offensive skill on the shared V2 clock.
 *
 * Uses the official V1 combat skill + defense formulas in an ephemeral shadow,
 * including damage multipliers, AoE geometry, hybrid channels and the D2.4/D3.4
 * approved status rider. The shadow's PA, ticks, mana charges, cooldown state
 * and mutable HP are NEVER persisted directly: all accepted changes are
 * committed once, in one V2 simultaneous batch.
 *
 * This deliberately rejects movement+attack composites, external targets,
 * construction/summon/mirror side-effects and inventory operations until
 * those features have safe, conflict-aware V2 patches.
 */
import {
 applyCombatCommand,applyResolvedCombatSkill,defaultAttackSource,
 type CombatCommand,type CombatState,type Side,type PhysicalAttackSource,
} from "./turn-engine.ts";
import {timelineRoundOf,
 type ContinuousCombatTimeline,type TimelineEvent} from "./action-timeline.ts";
import {fieldPosition} from "./field-plane.ts";
import type {CombatSkillPlan} from "./skill-casting.ts";
import type {StatusStat} from "./summon-status.ts";
import {
 activeBlockSlot,isolatePhysicalShadow,weaponCopies,
} from "./timeline-basic-strike.ts";
import type {AuthorizedTimelineEffect} from "./timeline-batch-resolver.ts";

type Skill=Extract<CombatCommand,{kind:"CAST_SKILL"}>;
type Defend=Extract<CombatCommand,{kind:"DEFEND"}>;
type Dice={hit:number;critical:number;defense:number};
const SIDES=["PLAYER","NPC"] as const;
const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const validDice=(dice:Dice)=>dice!=null&&
 [dice.hit,dice.critical,dice.defense].every(v=>
   typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1);
const numericStats=[
 "strength","agility","speedValue","constitution","precision","dodge",
 "physicalAttack","physicalDefense","magicAttack","magicDefense",
 "critical","luck","race","maxHp",
] as const;
const allowedKeys=new Set(["kind","skillId","requestId","trajectory",
 "areaCenter","areaAngleDegrees","attackSource"]);

export function simulateApprovedTimelineOffense(
 combat:CombatState,clock:ContinuousCombatTimeline,event:TimelineEvent,
 command:Skill,plan:CombatSkillPlan,attackDice:Dice,defenseDice:Dice,
 preparedDefense:Defend={kind:"DEFEND",defense:"NONE"},
):AuthorizedTimelineEffect{
 if(combat.status!=="ACTIVE"||combat.pending||clock.version!==2||
   event.status!=="RESOLVED"||event.kind!=="SKILL"||
   event.endsAtTick!==clock.nowTick||
   !validDice(attackDice)||!validDice(defenseDice))
   throw new Error("La habilidad ofensiva no ha llegado a su impacto temporal.");
 if(command.kind!=="CAST_SKILL"||!plan||command.skillId!==plan.id||
   plan.category!=="OFFENSE"||!plan.attackType||event.paidAp!==1||
   !Number.isSafeInteger(plan.cost)||plan.cost<0||
   !/^[a-zA-Z0-9:_-]{12,100}$/.test(command.requestId)||
   Object.keys(command).some(key=>!allowedKeys.has(key))||
   command.planarMove!==undefined||command.targetSummonId!==undefined||
   command.targetConstructionId!==undefined||
   command.movementOrder!==undefined||
   plan.construction||plan.summons?.length||plan.fusion||plan.chargeBuff)
   throw new Error("La habilidad requiere un resolutor ofensivo avanzado.");
 if((combat.constructions?.length??0)>0||(combat.summons?.length??0)>0||
   (combat.droppedWeapons?.length??0)>0||
   Object.values(combat.microEffects?.definitions??{}).some(x=>x?.length))
   throw new Error("Existen entidades o módulos que requieren otro resolutor V2.");
 const owner=event.owner,target=other(owner);
 const mana=combat.mana?.[owner];
 if(!mana||!Number.isFinite(mana.current)||mana.current<plan.cost)
   throw new Error("Maná insuficiente para resolver la habilidad.");
 const hitRound=timelineRoundOf(event.endsAtTick);
 const cooldown=combat.skillCooldowns?.[owner]?.[String(plan.id)]??0;
 if(cooldown===-1||cooldown>hitRound)
   throw new Error("La habilidad continúa en enfriamiento.");
 const copies={PLAYER:weaponCopies(combat,"PLAYER"),NPC:weaponCopies(combat,"NPC")};
 const shadow=isolatePhysicalShadow(combat,owner);
 // Fresh V1 initiative is merely a calculator shell. The V2 scheduler
 // already took the PA and owns the actual action duration.
 shadow.round=hitRound;
 shadow.tick=(hitRound-1)*100;
 const launched=applyResolvedCombatSkill(shadow,owner,plan,{
   requestId:command.requestId,
   trajectory:command.trajectory,areaCenter:command.areaCenter,
   areaAngleDegrees:command.areaAngleDegrees,
   attackSource:command.attackSource,
 },attackDice);
 if(!launched.pending||launched.pending.against!==target)
   throw new Error("No se pudo iniciar el impacto ofensivo aprobado.");
 const source:PhysicalAttackSource=launched.pending.attackSource??
   defaultAttackSource(combat.actors[owner]);
 const isMagic=launched.pending.usesMagic;
 const isArea=Boolean(launched.pending.attackArea);
 const chosenBlock=!isMagic&&!launched.pending.hybridContact
   ?activeBlockSlot(combat,clock,target,event.endsAtTick):null;
 const chosenDefense:Defend=chosenBlock
   ?{kind:"DEFEND",defense:"BLOCK",weaponSlot:chosenBlock}:preparedDefense;
 // Magic fields pay their own once-per-window mana charge when the defensive
 // REACT action finishes; each V1 shadow's incidental charge is discarded.
 const resolved=applyCombatCommand(launched,target,chosenDefense,defenseDice);
 if(resolved.pending)
   throw new Error("La técnica dejó una defensa pendiente fuera del reloj.");
 const actualCost=mana.current-(resolved.mana?.[owner]?.current??NaN);
 if(actualCost!==plan.cost)
   throw new Error("El coste de la habilidad no coincide con el plan aprobado.");
 const defenderCost=(combat.mana?.[target]?.current??NaN)-
   (resolved.mana?.[target]?.current??NaN);
 if(defenderCost!==(chosenDefense.defense==="MAGIC_FIELD"?1:0))
   throw new Error("El impacto modificó recursos del rival sin autorización.");
 const nextCooldown=resolved.skillCooldowns?.[owner]?.[String(plan.id)];
 if(nextCooldown===undefined||!Number.isSafeInteger(nextCooldown))
   throw new Error("Falta el enfriamiento aprobado de la habilidad.");
 const hpDamage:NonNullable<AuthorizedTimelineEffect["hpDamage"]>={};
 const equipmentWear:NonNullable<AuthorizedTimelineEffect["equipmentWear"]>=[];
 const positionDelta:NonNullable<AuthorizedTimelineEffect["positionDelta"]>={};
 const oldStatuses=combat.summonStatuses??[],newStatuses=resolved.summonStatuses??[];
 const knownIds=new Set(oldStatuses.map(x=>x.id));
 const added=newStatuses.filter(x=>!knownIds.has(x.id));
 if(added.length>1||added.some(x=>
   x.by!==owner||x.target!==target||
   x.sourceSummonId!=="SKILL:"+plan.id||
   !x.id.startsWith("MODULAR_CONTACT:")||
   !(plan.approvedHostileStatus||plan.approvedHybridContact)))
   throw new Error("El golpe creó estados fuera del módulo ofensivo autorizado.");
 const hostileStatuses:NonNullable<AuthorizedTimelineEffect["hostileStatuses"]>=
   added.map(status=>({
     owner,target,skillId:plan.id,
     id:"V2_HOSTILE:"+event.id,
     stat:status.stat as StatusStat,
     operation:status.operation,value:status.value,
     durationTurns:status.expiresAtRound-hitRound,
   }));
 for(const side of SIDES){
   const old=combat.actors[side],after=resolved.actors[side];
   const hpLost=old.hp-after.hp;
   if(!Number.isFinite(hpLost)||hpLost<0)
     throw new Error("El impacto ofensivo creó curación no declarada.");
   if(hpLost>0)hpDamage[side]=hpLost;
   const start=fieldPosition(old),end=fieldPosition(after);
   if(start.x!==end.x||start.y!==end.y)
     positionDelta[side]={x:end.x-start.x,y:end.y-start.y};
   const resultCopies=weaponCopies(resolved,side);
   for(const [characterItemId,integrity] of copies[side]){
     const afterDurability=resultCopies.get(characterItemId);
     if(afterDurability===undefined||afterDurability>integrity)
       throw new Error("La habilidad alteró inventario sin mecanismo temporal.");
     if(afterDurability<integrity)equipmentWear.push({
       owner:side,characterItemId,amount:integrity-afterDurability,
     });
   }
   for(const key of numericStats){
     const beforeValue=old[key],afterValue=after[key];
     if(beforeValue===afterValue)continue;
     const beforeStatusDelta=oldStatuses.filter(s=>s.target===side&&s.stat===key)
       .reduce((v,s)=>v+s.appliedDelta,0);
     const afterStatusDelta=newStatuses.filter(s=>s.target===side&&s.stat===key)
       .reduce((v,s)=>v+s.appliedDelta,0);
     const expected=(beforeValue??0)+afterStatusDelta-beforeStatusDelta;
     if(typeof afterValue!=="number"||
       Math.abs(afterValue-expected)>1e-7)
       throw new Error("El ataque cambió estadísticas sin un estado modular autorizado.");
   }
 }
 if(JSON.stringify(combat.constructions??[])!==JSON.stringify(resolved.constructions??[])||
   JSON.stringify(combat.summons??[])!==JSON.stringify(resolved.summons??[])||
   JSON.stringify(combat.droppedWeapons??[])!==JSON.stringify(resolved.droppedWeapons??[])||
   JSON.stringify(combat.combatCharges??{})!==JSON.stringify(resolved.combatCharges??{}))
   throw new Error("El ataque produjo efectos de mundo aún no soportados en V2.");
 const ending=!isMagic&&!isArea?resolved.physicalPathEnds?.[owner]?.[source]:undefined;
 const physicalStrokes=ending?[{owner,source,end:{...ending}}]:[];
 const logs=resolved.log.filter(x=>x.kind!=="ROUND"&&x.kind!=="END")
   .map(entry=>({...entry,tick:event.endsAtTick,
     summary:entry.summary.replace(/; esperando reacción$/,"")}));
 return {
   eventId:event.id,hpDamage,equipmentWear,positionDelta,
   physicalStrokes,logs,
   manaSpent:{[owner]:actualCost},hostileStatuses,
   skillCooldowns:[{owner,skillId:plan.id,nextAvailableRound:nextCooldown}],
 };
}
