import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeFinishedCombats} from "../lib/combat/ranking-stats.ts";

function completed(playerId, opponentId, winner, options = {}) {
  return {
    playerCharacterId: playerId, status: "FINISHED",
    npcStats: {opponentCharacterId: opponentId},
    lastAction: {combatV1: {
      version: 1, status: "FINISHED", winner,
      actors: {PLAYER: {characterId: playerId}, NPC: {characterId: opponentId}},
    }},
    ...options,
  };
}

const zeroPvp = {
  pvpWins: 0, pvpLosses: 0, pvpDraws: 0, pvpTotal: 0, pvpWinRate: 0,
};

test("training wins, losses and mutual knockouts contribute one encounter to the player", () => {
  const standings = summarizeFinishedCombats([
    completed(11, null, "PLAYER"),
    completed(11, null, "NPC"),
    completed(11, null, null),
  ]);
  assert.deepEqual(standings.get(11), {
    combatWins: 1, combatLosses: 1, combatDraws: 1,
    combatTotal: 3, combatWinRate: 33.33,
    ...zeroPvp,
  });
  assert.equal(standings.size, 1, "anonymous training NPCs never appear in rankings");
});

test("PvP counts the outcome for both participants, including a victory for the NPC-side character", () => {
  const standings = summarizeFinishedCombats([
    completed(1, 2, "NPC"),
    completed(2, 1, "PLAYER"),
    completed(1, 2, null),
  ], new Map([[1, 100], [2, 200]]));
  assert.deepEqual(standings.get(1), {
    combatWins: 0, combatLosses: 2, combatDraws: 1, combatTotal: 3, combatWinRate: 0,
    pvpWins: 0, pvpLosses: 2, pvpDraws: 1, pvpTotal: 3, pvpWinRate: 0,
  });
  assert.deepEqual(standings.get(2), {
    combatWins: 2, combatLosses: 0, combatDraws: 1, combatTotal: 3, combatWinRate: 66.67,
    pvpWins: 2, pvpLosses: 0, pvpDraws: 1, pvpTotal: 3, pvpWinRate: 66.67,
  });
});

test("PvP wins exclude sparring, system characters and same-owner alternate characters", () => {
  const owners = new Map([[1, 10], [2, 20], [3, 10]]);
  // Character 4 has a SYSTEM owner, so it is absent from the player map.
  const standings = summarizeFinishedCombats([
    completed(1, 2, "PLAYER"),
    completed(1, 2, null),
    completed(2, 1, "NPC"),
    completed(1, 3, "PLAYER"),
    completed(1, 4, "PLAYER"),
    completed(1, null, "PLAYER"),
  ], owners);
  assert.equal(standings.get(1)?.combatWins, 5);
  assert.deepEqual({
    pvpWins: standings.get(1)?.pvpWins,
    pvpLosses: standings.get(1)?.pvpLosses,
    pvpDraws: standings.get(1)?.pvpDraws,
    pvpTotal: standings.get(1)?.pvpTotal,
    pvpWinRate: standings.get(1)?.pvpWinRate,
  }, {pvpWins: 2, pvpLosses: 0, pvpDraws: 1, pvpTotal: 3, pvpWinRate: 66.67});
  assert.equal(standings.get(2)?.pvpLosses, 2);
  assert.equal(standings.get(3)?.pvpWins, 0);
  assert.equal(standings.get(4)?.pvpWins, 0);
});

test("active, legacy, invalid and inconsistent fights do not invent a win or inflate totals", () => {
  const valid = completed(5, 6, "PLAYER");
  const standings = summarizeFinishedCombats([
    valid,
    completed(5, 6, "NPC", {status: "ACTIVE"}),
    completed(5, 6, "NPC", {lastAction: {}}),
    completed(5, 6, undefined),
    completed(5, 6, "NPC", {lastAction: {combatV1: {version: 1,status:"ACTIVE",winner:"NPC",
      actors:{PLAYER:{characterId:5},NPC:{characterId:6}}}}}),
    completed(5, 5, "PLAYER"),
    completed(5, 6, "PLAYER", {npcStats: {opponentCharacterId: 7}}),
    completed(5, 6, "PLAYER", {playerCharacterId: 9}),
  ]);
  assert.equal(standings.get(5)?.combatTotal, 1);
  assert.equal(standings.get(6)?.combatLosses, 1);
  assert.equal(standings.size, 2);
});

test("experimental V2 encounters cannot farm victories or win rates",()=>{
 const normal=completed(12,null,"PLAYER");
 const laboratory=completed(12,null,"PLAYER");
 laboratory.lastAction.combatV2={version:2,clock:{nowTick:30}};
 const stats=summarizeFinishedCombats([normal,laboratory]);
 assert.equal(stats.get(12)?.combatWins,1);
 assert.equal(stats.get(12)?.combatTotal,1);
});

test("rankings endpoint is management-protected and includes authoritative saved sessions", () => {
  const api = readFileSync(new URL("../app/api/management/rankings/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../app/management/rankings/page.tsx", import.meta.url), "utf8");
  assert.match(api, /\["GM","ADMIN"\]/);
  assert.match(api, /CombatSession\.where\(\{status:"FINISHED"\}\)\.all\(\)/);
  assert.match(api, /summarizeFinishedCombats/);
  assert.match(ui, /combatWins/);
  assert.match(ui, /combatWinRate/);
  assert.match(api, /summarizeFinishedCombats\(combatSessions, pvpOwners\)/);
  assert.match(api, /String\(owner\.role\) !== "SYSTEM"/);
  assert.match(ui, /\["Victorias PvP", "pvpWins"/);
  assert.match(ui, /row\.pvpTotal > 0/);
});
