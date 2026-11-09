/** Results for character leaderboards, calculated from authoritative saved combat outcomes. */
export type CharacterCombatRecord = {
  combatWins: number;
  combatLosses: number;
  combatDraws: number;
  combatTotal: number;
  combatWinRate: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  pvpTotal: number;
  pvpWinRate: number;
};

type SavedCombat = {
  status?: unknown;
  playerCharacterId?: unknown;
  npcStats?: unknown;
  lastAction?: unknown;
};

type Outcome = "WIN" | "LOSS" | "DRAW";

const emptyRecord = (): CharacterCombatRecord => ({
  combatWins: 0, combatLosses: 0, combatDraws: 0,
  combatTotal: 0, combatWinRate: 0,
  pvpWins: 0, pvpLosses: 0, pvpDraws: 0,
  pvpTotal: 0, pvpWinRate: 0,
});

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function characterId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Count each completed, versioned encounter exactly once per participating
 * character. Training NPCs have no characterId: their result affects only the
 * player's record. PvP contributes a win/loss/draw to both characters.
 * PvP-only metrics require two registered characters owned by different,
 * non-SYSTEM users. Fighting one's own characters cannot farm PvP wins.
 *
 * Ignore older unversioned sessions without a persisted winner rather than
 * guessing from HP or treating an unfinished fight as a loss.
 */
export function summarizeFinishedCombats(
  sessions: readonly SavedCombat[],
  pvpOwners: ReadonlyMap<number, number> = new Map(),
): Map<number, CharacterCombatRecord> {
  const standings = new Map<number, CharacterCombatRecord>();

  function add(id: number, outcome: Outcome, pvp: boolean) {
    const record = standings.get(id) ?? emptyRecord();
    record.combatTotal += 1;
    if (outcome === "WIN") record.combatWins += 1;
    if (outcome === "LOSS") record.combatLosses += 1;
    if (outcome === "DRAW") record.combatDraws += 1;
    if (pvp) {
      record.pvpTotal += 1;
      if (outcome === "WIN") record.pvpWins += 1;
      if (outcome === "LOSS") record.pvpLosses += 1;
      if (outcome === "DRAW") record.pvpDraws += 1;
    }
    standings.set(id, record);
  }

  for (const session of sessions) {
    if (session.status !== "FINISHED") continue;
    const battle = object(object(session.lastAction)?.combatV1);
    if (!battle || battle.version !== 1 || battle.status !== "FINISHED") continue;
    if (battle.winner !== "PLAYER" && battle.winner !== "NPC" && battle.winner !== null) continue;

    const actors = object(battle.actors);
    const player = object(actors?.PLAYER);
    const opponent = object(actors?.NPC);
    const playerId = characterId(session.playerCharacterId);
    if (!player || !opponent || playerId === null || characterId(player.characterId) !== playerId) continue;

    const opponentId = characterId(opponent.characterId);
    const storedOpponentId = characterId(object(session.npcStats)?.opponentCharacterId);
    // The combat state and session identity must agree on who fought.
    if (opponentId !== storedOpponentId || opponentId === playerId) continue;

    const playerOwner = pvpOwners.get(playerId);
    const opponentOwner = opponentId === null ? undefined : pvpOwners.get(opponentId);
    const isPvp = playerOwner !== undefined && opponentOwner !== undefined && playerOwner !== opponentOwner;

    add(playerId, battle.winner === null ? "DRAW" : battle.winner === "PLAYER" ? "WIN" : "LOSS", isPvp);
    if (opponentId !== null) {
      add(opponentId, battle.winner === null ? "DRAW" : battle.winner === "NPC" ? "WIN" : "LOSS", isPvp);
    }
  }

  for (const record of standings.values()) {
    // Two decimal places; ties can be resolved by the larger match sample.
    record.combatWinRate = Math.round((record.combatWins / record.combatTotal) * 10000) / 100;
    record.pvpWinRate = record.pvpTotal > 0
      ? Math.round((record.pvpWins / record.pvpTotal) * 10000) / 100 : 0;
  }
  return standings;
}
