import { calculateAttackTicks } from "./ticks";
import type { CombatAttackType } from "./ticks";
export type { CombatAttackType } from "./ticks";

export type CombatActor = "PLAYER" | "NPC";

export type CombatEvent = {
  actor: CombatActor;
  action: string;
  attackType: CombatAttackType;
  startedAtTick: number;
  completedAtTick: number;
  durationTicks: number;
};

export type PingPongResult = {
  currentTick: number;
  turn: number;
  activeActor: CombatActor;
  playerNextActionTick: number;
  npcNextActionTick: number;
  events: CombatEvent[];
};

/**
 * El combate es una línea temporal lógica. Cada petición de acción
 * avanza el reloj hasta el siguiente evento; nunca espera en tiempo real
 * ni depende de un cron por segundo.
 */
export function resolvePingPongAction(input: {
  currentTick: number;
  turn: number;
  playerAgility: number;
  npcAgility: number;
  playerAttackType?: CombatAttackType;
  npcAttackType?: CombatAttackType;
  playerAction?: string;
}): PingPongResult {
  const playerAttackType = input.playerAttackType ?? "CUT";
  const npcAttackType = input.npcAttackType ?? "CUT";
  const playerDuration = calculateAttackTicks(input.playerAgility, playerAttackType);
  const playerCompletedAt = input.currentTick + playerDuration;

  const npcDuration = calculateAttackTicks(input.npcAgility, npcAttackType);
  const npcCompletedAt = playerCompletedAt + npcDuration;

  return {
    currentTick: npcCompletedAt,
    turn: input.turn + 1,
    activeActor: "PLAYER",
    playerNextActionTick: npcCompletedAt,
    npcNextActionTick: npcCompletedAt + npcDuration,
    events: [
      {
        actor: "PLAYER",
        action: input.playerAction ?? "Ataque",
        attackType: playerAttackType,
        startedAtTick: input.currentTick,
        completedAtTick: playerCompletedAt,
        durationTicks: playerDuration,
      },
      {
        actor: "NPC",
        action: "Contraataque",
        attackType: npcAttackType,
        startedAtTick: playerCompletedAt,
        completedAtTick: npcCompletedAt,
        durationTicks: npcDuration,
      },
    ],
  };
}

export function calculateNextActionTick(currentTick: number, agility: number, attackType: CombatAttackType = "CUT") {
  return currentTick + calculateAttackTicks(agility, attackType);
}
