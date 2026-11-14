/**
 * Frozen scheduling tempo for V2. An action keeps the completion deadline
 * authorized at declaration. Effects changing speed affect later actions.
 */
import {turnTicks,type CombatFighter} from "./turn-engine.ts";
import type {CombatAttackType} from "./ticks.ts";
import type {TimelineEvent} from "./action-timeline.ts";

export function reservedTimelineTurnTicks(
 fighter:CombatFighter,event:Pick<TimelineEvent,
 "startsAtTick"|"endsAtTick"|"durationTicks"|"reservedSpeedValue">,
 attackType?:CombatAttackType,
):number{
 if(!Number.isSafeInteger(event.startsAtTick)||
   !Number.isSafeInteger(event.endsAtTick)||
   !Number.isSafeInteger(event.durationTicks)||
   event.endsAtTick-event.startsAtTick!==event.durationTicks)
   throw new Error("El intervalo temporal reservado fue alterado.");
 // Existing experimental sessions without a frozen speed keep V2.29 semantics.
 if(event.reservedSpeedValue===undefined)return turnTicks(fighter,attackType);
 const speed=event.reservedSpeedValue;
 if(!Number.isFinite(speed)||speed<1||speed>1_000_000)
   throw new Error("Velocidad temporal congelada inválida.");
 return turnTicks({...fighter,speedValue:speed},attackType);
}
