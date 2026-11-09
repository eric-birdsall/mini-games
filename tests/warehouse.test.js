import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { clearSight } from "../shared/map.js";
import { freeDecoyPoint, decoyPath } from "../shared/decoy.js";

// The old warehouse is now three homes, each with traversable interiors.
test("neighborhood homes have front, back and side doors with solid window sills", () => {
  useMap("docks");
  for (const { x, w } of MAPS.docks.houses) {
    for (const z of [-8, 8]) {
      assert.ok(freeDecoyPoint({ x, z }), "open doorway");
      assert.ok(clearSight({ x, z: z - 1, y: 1.65 }, { x, z: z + 1, y: 1.65 }));
    }
    assert.ok(
      decoyPath({ x, z: 12 }, { x, z: -18 }),
      "route around indoor partition",
    );
    for (const side of [-1, 1])
      assert.ok(
        freeDecoyPoint({ x: x + (side * w) / 2, z: 4 }),
        "side door to gate path",
      );
    const wx = x - 3.5;
    assert.ok(
      clearSight({ x: wx, z: 7, y: 1.65 }, { x: wx, z: 9, y: 1.65 }),
      "front window",
    );
    assert.equal(
      clearSight({ x: wx, z: 7, y: 0.5 }, { x: wx, z: 9, y: 0.5 }),
      false,
      "solid sill",
    );
  }
  useMap("compound");
});

test("garden hedges block both standing and crouched sightlines", () => {
  useMap("docks");
  for (const h of MAPS.docks.walls.filter((w) => w.style === "hedge"))
    for (const y of [0.8, 1.65])
      assert.equal(
        clearSight(
          { x: h.x, z: h.z - h.d / 2 - 0.5, y },
          { x: h.x, z: h.z + h.d / 2 + 0.5, y },
        ),
        false,
      );
  useMap("compound");
});

test("fence holes are short crawl openings without metal ducts", () => {
  useMap("docks");
  const map = MAPS.docks;
  assert.equal(map.passages.filter((p) => p.vent).length, 2);
  assert.ok(!map.walls.some((w) => w.style === "vent"));
  for (const { x, z } of map.passages.filter((p) => p.vent)) {
    assert.ok(clearSight({ x: x - 0.6, z, y: 0.7 }, { x: x + 0.6, z, y: 0.7 }));
    assert.equal(
      clearSight({ x: x - 0.6, z, y: 1.65 }, { x: x + 0.6, z, y: 1.65 }),
      false,
    );
    const m = new Match("HOLE", true, "seen", true, "docks");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    Object.assign(m.players.a, { x: x - 1, z, y: 0, yaw: -Math.PI / 2 });
    for (let i = 0; i < 45; i++) {
      m.players.a.input = { forward: 1, crouch: true };
      m.tick(1 / 30);
    }
    assert.ok(m.players.a.x > x + 0.5, "crouched player crosses fence");
  }
  useMap("compound");
});

test("remaining garden decks can be reached from the backyard", () => {
  for (const profile of MAPS.docks.routeProfiles) {
    const m = new Match("DECK", true, "seen", true, "docks");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    const upstairs = profile.height === 3.9;
    Object.assign(m.players.a, { x: profile.high.x, z: upstairs ? -18 : -12.5, y: 0, yaw: Math.PI });
    for (let i = 0; i < (upstairs ? 68 : 30); i++) {
      m.players.a.input = { forward: 1 };
      m.tick(1 / 30);
    }
    assert.equal(m.players.a.y, profile.height, profile.name);
  }
  useMap("compound");
});
