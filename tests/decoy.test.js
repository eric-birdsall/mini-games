import { WALLS } from "../shared/map.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import {
  DEFAULT_DECOY_PROGRAM,
  validateProgram,
  decoyPath,
  stepDecoy,
} from "../shared/decoy.js";
import { CONFIG } from "../shared/config.js";
const advance = (m, s) => {
  for (let i = 0; i < Math.ceil(s * 30); i++) m.tick(1 / 30);
};
function solo() {
  const m = new Match("DECOY", true);
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.debug.stationary = true;
  return m;
}
function actor(program = DEFAULT_DECOY_PROGRAM) {
  return {
    id: "lure",
    x: 0,
    z: 18,
    y: 0,
    yaw: 0,
    pitch: 0,
    team: "attacker",
    owner: "a",
    alive: true,
    active: true,
    grounded: true,
    mark: { x: 0, z: 14 },
    program: structuredClone(program),
    step: 0,
    entered: -1,
    cycle: 0,
    remaining: 90,
  };
}
test("program validation bounds types, headings, durations, length, repeats and speeds", () => {
  assert.deepEqual(
    validateProgram(DEFAULT_DECOY_PROGRAM),
    DEFAULT_DECOY_PROGRAM,
  );
  for (const program of [
    { steps: [{ type: "teleport" }], repeats: 1 },
    { steps: [{ type: "look", heading: 360, duration: 1 }], repeats: 1 },
    { steps: [{ type: "move", speed: "jog" }], repeats: 1 },
    { steps: [{ type: "wait", duration: 31 }], repeats: 1 },
    { ...DEFAULT_DECOY_PROGRAM, repeats: 6 },
    {
      steps: Array.from({ length: 13 }, () => ({ type: "stand", duration: 1 })),
      repeats: 1,
    },
  ])
    assert.equal(validateProgram(program), null);
});
test("default decoy crouches, walks straight to the mark facing it, and lies down", () => {
  const d = actor();
  stepDecoy(d, 0.1);
  assert.equal(d.crouch, true);
  for (let i = 0; i < 100; i++) stepDecoy(d, 0.05);
  assert.ok(Math.abs(d.z - 14) < 0.1);
  assert.ok(Math.abs(d.yaw) < 0.001, "mark is due north: facing north");
  assert.equal(d.prone, true);
  assert.equal(d.step, 3);
  assert.equal(d.noise, "silent");
});
test("routing goes around cover and never moves through it", () => {
  const start = { x: 0, z: 12 },
    goal = { x: 0, z: 4 };
  const route = decoyPath(start, goal);
  assert.ok(route?.length > 1);
  const d = actor({
    steps: [{ type: "move", speed: "walk" }],
    repeats: 1,
  });
  Object.assign(d, start, { mark: goal });
  for (let i = 0; i < 500; i++) {
    stepDecoy(d, 0.033);
    assert.ok(
      !(Math.abs(d.x - 1) < 1.5 + 0.31 && Math.abs(d.z - 8) < 0.6 + 0.31),
    );
  }
  assert.ok(Math.hypot(d.x - goal.x, d.z - goal.z) < 0.1);
});
test("program is private, editable only during purchase before ready, and copied at trigger", () => {
  const m = solo();
  const program = { steps: [{ type: "wait", duration: 2 }], repeats: 2 };
  m.action("a", { type: "decoyProgram", program });
  assert.deepEqual(m.players.a.decoyProgram, program);
  assert.equal(
    m.snapshot("bot").players.find((p) => p.id === "a")?.decoyProgram,
    undefined,
  );
  m.phase = "active";
  m.time = 240;
  m.action("a", { type: "decoyProgram", program: DEFAULT_DECOY_PROGRAM });
  assert.deepEqual(m.players.a.decoyProgram, program);
});
test("trigger ray sets mark and spawns next to player, never trusts client coordinates", () => {
  const m = solo();
  m.phase = "active";
  m.time = 240;
  // Out of the spawn bunker, aiming at open ground ahead.
  Object.assign(m.players.a, {
    x: 0,
    z: 18,
    pitch: -0.3,
    inventory: { actorDecoy: 1 },
    equipped: "actorDecoy",
  });
  m.action("a", { type: "use", mark: { x: 999, z: 999 } });
  assert.equal(m.decoys.length, 1);
  const d = m.decoys[0];
  assert.ok(d.mark.z < 17);
  assert.ok(Math.hypot(d.x - m.players.a.x, d.z - m.players.a.z) < 1);
  assert.equal(m.players.a.inventory.actorDecoy, 0);
  assert.notEqual(d.program, m.players.a.decoyProgram);
});
test("invalid mark does not consume a decoy charge", () => {
  const m = solo();
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.a, {
    pitch: 0.5,
    inventory: { actorDecoy: 1 },
    equipped: "actorDecoy",
  });
  m.action("a", { type: "use" });
  assert.equal(m.decoys.length, 0);
  assert.equal(m.players.a.inventory.actorDecoy, 1);
});
test("visual detection can neutralize a decoy without ending the round or eliminating a real player", () => {
  const m = solo();
  m.phase = "active";
  m.time = 240;
  const bot = m.players.bot;
  Object.assign(bot, { x: 0, z: -16, yaw: Math.PI, pitch: 0 });
  const d = actor({ steps: [{ type: "wait", duration: 10 }], repeats: 1 });
  Object.assign(d, { x: 0, z: -10 });
  m.decoys.push(d);
  advance(m, 3.2);
  assert.equal(d.active, false);
  assert.equal(m.players.a.alive, true);
  assert.equal(m.phase, "active");
  assert.equal(m.stats.detections, 0);
});
test("developer fast ready skips preparation and sandbox grants equipped decoys immediately", () => {
  const m = solo();
  m.action("a", { type: "debug", key: "fastStart", value: true });
  m.action("a", { type: "ready" });
  assert.equal(m.phase, "active");
  assert.equal(m.time, CONFIG.roundSeconds);
  m.reset();
  m.action("a", { type: "debug", key: "decoyTest" });
  assert.equal(m.phase, "active");
  assert.equal(m.players.a.inventory.actorDecoy, 3);
  assert.equal(m.players.a.equipped, "actorDecoy");
});
test("multiplayer refuses sandbox and fast-start cheats", () => {
  const m = new Match("MULTI");
  m.addPlayer("a", "attacker");
  m.action("a", { type: "debug", key: "fastStart", value: true });
  m.action("a", { type: "debug", key: "decoyTest" });
  assert.equal(m.phase, "purchase");
  assert.equal(m.debug.fastStart, undefined);
  assert.equal(m.players.a.inventory.actorDecoy, undefined);
});
test("repeat sequencing is bounded and decoys expire without winning objectives", () => {
  const d = actor({
    steps: [
      { type: "stand", duration: 0.1 },
      { type: "prone", duration: 0.1 },
    ],
    repeats: 2,
  });
  for (let i = 0; i < 10; i++) stepDecoy(d, 0.1);
  assert.equal(d.cycle, 1);
  assert.equal(d.step, 2);
  stepDecoy(d, 100);
  assert.equal(d.active, false);
});

const routeLength = (start, route) => {
  let total = 0,
    at = start;
  for (const p of route) {
    total += Math.hypot(p.x - at.x, p.z - at.z);
    at = p;
  }
  return total;
};
test("routes take the shortest way around cover, pulled taut", () => {
  // Isolate the routing algorithm from the evolving map layout.
  const saved = [...WALLS];
  WALLS.splice(0, WALLS.length, { x: 1, z: 8, w: 3, d: 1.2, h: 1.1 });
  try {
    // Cover block at x -0.5..2.5: going round its west end is shortest.
    const start = { x: 0, z: 12 },
      route = decoyPath(start, { x: 0, z: 4 });
    assert.ok(route.length <= 3, `${route.length} waypoints`);
    assert.ok(
      route.some((p) => p.x < 0),
      "west of the block",
    );
    assert.ok(routeLength(start, route) < 8.8, routeLength(start, route));
  } finally {
    WALLS.splice(0, WALLS.length, ...saved);
  }
});
test("routes through The Lanes' screened hallways stay bounded and never clip a wall", async () => {
  const { useMap } = await import("../shared/maps.js");
  const { WALLS, segmentBox } = await import("../shared/map.js");
  useMap("lanes");
  const start = { x: -14, z: 8 },
    route = decoyPath(start, { x: 3.9, z: 8 });
  assert.ok(route, "west hallway → center trench");
  assert.ok(routeLength(start, route) < 40);
  let at = start;
  for (const p of route) {
    assert.ok(
      !WALLS.some(
        (w) => segmentBox({ ...at, y: 0.3 }, { ...p, y: 0.3 }, w, 0.3) !== null,
      ),
      `segment to ${JSON.stringify(p)} clips a wall`,
    );
    at = p;
  }
  useMap("compound");
});
