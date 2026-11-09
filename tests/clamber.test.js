import { warehouseFixture } from "./fixtures/warehouse.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { WALLS } from "../shared/map.js";
import { findClamber } from "../shared/clamber.js";
import { CONFIG } from "../shared/config.js";
function match() {
  useMap("compound");
  const m = new Match("CLIMB", true);
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.a, {
    x: 4.65,
    y: 0,
    z: 11,
    yaw: -Math.PI / 2,
    input: { jump: true },
  });
  return m;
}
function advance(m, t) {
  for (let i = 0; i < Math.ceil(t * 30); i++) m.tick(1 / 30);
}
function geometry(boxes, run) {
  useMap("compound");
  const saved = [...WALLS];
  WALLS.splice(0, WALLS.length, ...boxes);
  try {
    run();
  } finally {
    WALLS.splice(0, WALLS.length, ...saved);
  }
}
const box = (x, z, w, d, h) => ({ x, z, w, d, h, kind: "cover" });
test("holding jump clambers onto a shipping container and stays there until released", () => {
  const m = match(),
    p = m.players.a;
  advance(m, 0.3);
  assert.ok(p.clamber);
  assert.ok(m.snapshot("a").me.clamber);
  advance(m, 0.6);
  assert.equal(p.y, 2.5);
  assert.ok(p.x > 5.32);
  assert.equal(p.clamber, null);
  advance(m, 1);
  assert.equal(p.y, 2.5);
});
test("a tap remains a regular jump instead of clambering", () => {
  const m = match(),
    p = m.players.a;
  advance(m, 0.1);
  p.input.jump = false;
  advance(m, 0.9);
  assert.equal(p.clamber, null);
  assert.equal(p.x, 4.65);
  assert.equal(p.y, 0);
});
test("reach, facing and maximum height reject invalid walls", () => {
  const m = match(),
    p = m.players.a;
  assert.ok(findClamber(p));
  p.yaw = Math.PI / 2;
  assert.equal(findClamber(p), null);
  p.yaw = -Math.PI / 2;
  p.x = 3.9;
  assert.equal(findClamber(p), null);
  geometry([box(0, 0, 4, 4, 6)], () =>
    assert.equal(
      findClamber({ x: -2.35, y: 0, z: 0, yaw: -Math.PI / 2 }),
      null,
    ),
  );
});
test("a blocked or narrow ledge is not a valid landing", () => {
  const p = { x: -2.35, y: 0, z: 0, yaw: -Math.PI / 2 };
  geometry([box(0, 0, 4, 4, 2), box(-1.4, 0, 0.6, 2, 4)], () =>
    assert.equal(findClamber(p), null),
  );
  geometry([box(-1.75, 0, 0.5, 4, 2)], () =>
    assert.equal(findClamber(p), null),
  );
});
test("clamber height is relative to the platform the player stands on", () => {
  geometry([box(0, 0, 4, 4, 3.6)], () => {
    const target = findClamber({ x: -2.35, y: 1.2, z: 0, yaw: -Math.PI / 2 });
    assert.equal(target?.y, 3.6);
  });
});
test("prone, trapped, camera, mirror and interacting players cannot start a clamber", () => {
  for (const setup of [
    (p) => (p.input.prone = true),
    (p) => (p.immobile = 3),
    (p) => {
      p.camera = 5;
    },
    (p) => {
      p.mirror = {};
      p.equipped = "cameraPortable";
    },
    (p) => (p.input.interact = true),
  ]) {
    const m = match(),
      p = m.players.a;
    m.gadgets.push({ id: 5, kind: "camera", active: true, x: 0, y: 2, z: -12 });
    setup(p);
    advance(m, 0.8);
    assert.equal(p.clamber, null);
    assert.ok(p.x < 5);
  }
});
test("clamber cannot cross the buy-phase staging boundary", () => {
  const m = match(),
    p = m.players.a;
  const line = MAPS.compound.buyLines.attacker;
  m.phase = "purchase";
  Object.assign(p, { x: 0, z: line + 0.4, yaw: 0 });
  geometry([box(0, line - 0.5, 4, 1, 2)], () => {
    advance(m, 1);
    assert.equal(p.clamber, null);
    assert.ok(p.z >= line);
  });
});
test("restraint cancels an in-progress clamber and reset clears it", () => {
  const m = match(),
    p = m.players.a;
  advance(m, 0.3);
  assert.ok(p.clamber);
  p.immobile = 2;
  m.tick(1 / 30);
  assert.equal(p.clamber, null);
  m.reset();
  assert.equal(p.jumpHeld, 0);
  assert.equal(p.clamberLatched, false);
});
test("a jump that falls just short of a ledge still pulls you up", () => {
  // Run at the container from 1.5 m out and only tap jump: once airborne,
  // pushing forward into the ledge mantles onto it.
  const m = match(),
    p = m.players.a;
  Object.assign(p, { x: 3.2, input: { forward: 1, jump: true } });
  advance(m, 0.1);
  p.input.jump = false;
  advance(m, 1.2);
  assert.equal(p.y, 2.5, `on top, ended at ${p.x}, ${p.y}`);
  // Without pushing forward, a jump next to it stays a jump.
  const still = match(),
    q = still.players.a;
  advance(still, 0.1);
  q.input.jump = false;
  advance(still, 1);
  assert.equal(q.y, 0);
});

test("a running jump mantles onto a floating 3 m catwalk; standing can't reach it", () => {
  const saved = MAPS.docks.walls;
  MAPS.docks.walls = warehouseFixture();
  try {
    // Pier 9: the catwalk landing above the foot of the warehouse's south
    // ramp is 0.3 m thick with open space beneath it.
    const jumpAt = (input) => {
      const m = new Match("DECK", true, "seen", true, "docks");
      m.addPlayer("a", "attacker");
      m.phase = "active";
      m.time = 240;
      const p = m.players.a;
      Object.assign(p, { x: -12.5, y: 0, z: -11.5, yaw: 0, pitch: 0 });
      for (let i = 0; i < 60; i++) {
        p.input = input(i);
        m.tick(1 / 30);
      }
      return p;
    };
    const jumped = jumpAt((i) => ({ forward: 1, jump: i < 3 }));
    assert.equal(jumped.y, 3, "jump + forward grabs the edge");
    const standing = jumpAt(() => ({ jump: true }));
    assert.ok(standing.y < 2.5, "a standing hold-jump tops out at 2.6 m");
  } finally {
    MAPS.docks.walls = saved;
    useMap("compound");
  }
});

test("a thin railing is vaulted onto the floor behind it, not stood on", () => {
  const p = { x: -2.35, y: 0, z: 0, yaw: -Math.PI / 2 };
  // A 1 m railing, 12 cm thick: over it, down to the ground beyond.
  geometry([box(-1.7, 0, 0.12, 3, 1)], () => {
    const t = findClamber(p);
    assert.ok(t, "vaults");
    assert.equal(t.y, 0, "lands on the ground");
    assert.ok(t.x > -1.64 + CONFIG.playerRadius, "past the rail");
    assert.ok(t.over >= 1, "clears the top");
  });
  // Onto a platform behind a rail on its edge.
  geometry([box(-1.7, 0, 0.12, 3, 1.6), box(0, 0, 3.2, 3, 1.2)], () =>
    assert.equal(findClamber(p)?.y, 1.2),
  );
  // Not when the landing is more than vaultDrop below the top.
  geometry([box(-1.7, 0, 0.12, 3, 2)], () =>
    assert.equal(findClamber(p), null),
  );
});

test("warehouse fixture: from the ramp, hold jump vaults the rail onto the catwalk", () => {
  const saved = MAPS.docks.walls;
  MAPS.docks.walls = warehouseFixture();
  try {
    const m = new Match("VAULT", true, "seen", true, "docks");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    const p = m.players.a;
    Object.assign(p, { x: -12.45, z: 10, y: 3, vy: 0, yaw: -Math.PI / 2 });
    for (let i = 0; i < 30; i++) {
      p.input = {};
      m.tick(1 / 30);
    }
    assert.ok(p.y > 2 && p.y < 2.9, "on the ramp");
    for (let i = 0; i < 45; i++) {
      p.input = { jump: true };
      m.tick(1 / 30);
    }
    assert.equal(p.y, 3, "on the catwalk");
    assert.ok(p.x > -11.8, "past the rail");
    assert.equal(p.over, undefined);
    useMap("compound");
  } finally {
    MAPS.docks.walls = saved;
    useMap("compound");
  }
});

test("low garden fences keep runners inside the Boulder Dash course", () => {
  const fence = { x: 1.5, z: 0, w: 1.6, d: 4, h: 2.2, kind: "wall" };
  const player = { x: 0.3, y: 0, z: 0, yaw: -Math.PI / 2 };
  geometry([fence], () => assert.ok(findClamber(player)));
  geometry([{ ...fence, style: "gardenFence" }], () =>
    assert.equal(findClamber(player), null),
  );
});
