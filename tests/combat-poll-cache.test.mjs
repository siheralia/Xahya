import assert from "node:assert/strict";
import test from "node:test";
import { combatSnapshotEtag, combatEtagMatches } from "../lib/combat/poll-cache.ts";

test("identical personalized combat payload has the same HTTP ETag", () => {
  const snapshot = JSON.stringify({
    state: { round: 2, tick: 100, actors: { PLAYER: { hp: 20 } } },
    karma: { PLAYER: 30 },
    permissions: { PLAYER: true, NPC: false },
  });
  const tag = combatSnapshotEtag(snapshot);
  assert.match(tag, /^"[a-f0-9]{64}"$/);
  assert.equal(combatSnapshotEtag(snapshot), tag);
  assert.equal(combatEtagMatches(tag, tag), true);
  assert.equal(combatEtagMatches("W/" + tag, tag), true);
  assert.equal(combatEtagMatches('"other", W/' + tag, tag), true);
});

test("a changed encounter, karma or permissions forces a fresh body", () => {
  const payload = { state: { tick: 1 }, karma: { PLAYER: 30 }, permissions: { PLAYER: true } };
  const original = combatSnapshotEtag(JSON.stringify(payload));
  for (const changed of [
    { ...payload, state: { tick: 2 } },
    { ...payload, karma: { PLAYER: 31 } },
    { ...payload, permissions: { PLAYER: false } },
  ]) {
    assert.equal(combatEtagMatches(original, combatSnapshotEtag(JSON.stringify(changed))), false);
  }
  assert.equal(combatEtagMatches(null, original), false);
  assert.equal(combatEtagMatches('"stale"', original), false);
  assert.equal(combatEtagMatches("*", original), true);
});
