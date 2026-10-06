import { calculateActionTicks } from "./ticks";

export type CombatAction = {
  id: string;
  characterId: number;
  name: string;
  agility: number;
  speedModifier?: number;
  remainingTicks: number;
  startedAtTick: number;
  completesAtTick: number;
  status: "QUEUED" | "EXECUTING" | "COMPLETED";
};

export function createCombatAction(input: {
  id: string;
  characterId: number;
  name: string;
  agility: number;
  currentTick: number;
  speedModifier?: number;
}): CombatAction {
  const duration = calculateActionTicks(input.agility, input.speedModifier ?? 1);

  return {
    id: input.id,
    characterId: input.characterId,
    name: input.name,
    agility: input.agility,
    speedModifier: input.speedModifier ?? 1,
    remainingTicks: duration,
    startedAtTick: input.currentTick,
    completesAtTick: input.currentTick + duration,
    status: "EXECUTING",
  };
}

export function advanceCombatAction(
  action: CombatAction,
  elapsedTicks: number,
): CombatAction {
  const elapsed = Math.max(0, Math.trunc(elapsedTicks));
  const remainingTicks = Math.max(0, action.remainingTicks - elapsed);

  return {
    ...action,
    remainingTicks,
    status: remainingTicks === 0 ? "COMPLETED" : "EXECUTING",
  };
}
