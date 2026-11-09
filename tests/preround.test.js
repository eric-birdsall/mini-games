import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap, preRoundLine, stagingGate } from "../shared/maps.js";
import { WALLS, BOUNDS, clearSight } from "../shared/map.js";
import { CONFIG } from "../shared/config.js";
// Before the round (buy phase and preparation) neither side may see the
// other: opponents aren't sent at all, and the staging gate stands between
// the two sides' areas.
// Hot Potato's court has no staging or preparation to speak of.
const mapIds = Object.keys(MAPS).filter((id) => !MAPS[id].court);

test("before the round your snapshot holds only your own side", () => {
  for (const training of [false, true]) {
    const m = new Match("HIDE", true, "seen", training, "docks");
    m.addPlayer("a", "attacker");
    m.addPlayer("bot", "defender", true);
    for (const phase of ["purchase", "prep"]) {
      m.phase = phase;
      assert.deepEqual(
        m.snapshot("a").players.map((p) => p.id),
        ["a"],
        `${phase}${training ? " (training)" : ""}`,
      );
    }
    m.phase = "active";
    assert.equal(m.snapshot("a").players.length, 2, "visible once it starts");
  }
  useMap("compound");
});

test("on every map without a spawn room, the staging gate blocks every sightline across it", () => {
  for (const id of mapIds.filter((id) => !MAPS[id].spawnRoom)) {
    const map = useMap(id),
      gate = stagingGate(map),
      saved = [...WALLS];
    WALLS.push(gate);
    try {
      assert.ok(gate.w >= BOUNDS.x * 2, `${id}: wall to wall`);
      const staging = [],
        rest = [];
      for (let x = -BOUNDS.x + 1; x < BOUNDS.x; x += 3) {
        for (let z = map.buyLines.attacker; z < BOUNDS.z; z += 2)
          staging.push({ x, z });
        for (let z = -BOUNDS.z + 1; z < gate.z - 0.2; z += 3)
          rest.push({ x, z });
      }
      // Eyes from the ground up to the top of the tallest stacks.
      for (const a of staging)
        for (const b of rest)
          for (const [ya, yb] of [
            [1.65, 1.65],
            [1.65, 6.9],
            [6.9, 1.65],
          ])
            assert.equal(
              clearSight({ ...a, y: ya }, { ...b, y: yb }),
              false,
              `${id}: ${a.x},${a.z} sees ${b.x},${b.z}`,
            );
    } finally {
      WALLS.splice(0, WALLS.length, ...saved);
    }
  }
  useMap("compound");
});
