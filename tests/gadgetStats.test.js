import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { throwPath } from "../shared/throwing.js";
import { distance } from "../shared/map.js";
import { CONFIG, GADGETS } from "../shared/config.js";
import {
  GADGET_STATS,
  STAT_BUDGET,
  defaultStats,
  statTotal,
  statValue,
  validateStats,
} from "../shared/gadgetStats.js";
// Most of these tests cover 10-point builds; Upgrades tests opt in below.
function match() {
  const m = new Match("TEST");
  m.tuningMode = "free";
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  return m;
}
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}

test("standard issue builds use the untuned values and fit the budget", () => {
  for (const kind of Object.keys(GADGET_STATS)) {
    assert.equal(
      statTotal(defaultStats(kind)),
      3 * Object.keys(GADGET_STATS[kind]).length,
    );
    assert.equal(
      GADGET_STATS[kind][Object.keys(GADGET_STATS[kind])[0]].values.length,
      5,
    );
  }
  assert.equal(statValue({}, "smoke", "radius"), CONFIG.smokeRadius);
  assert.equal(statValue({}, "smoke", "duration"), CONFIG.smokeSeconds);
  assert.equal(statValue({}, "jammer", "radius"), CONFIG.jammerRadius);
  assert.equal(statValue({}, "jammer", "duration"), CONFIG.jammerSeconds);
  assert.equal(statValue({}, "scanner", "range"), CONFIG.scanRange);
  assert.equal(statValue({}, "scanner", "sweep"), CONFIG.scanSeconds);
  assert.equal(statValue({}, "disarm", "speed"), CONFIG.disarmSeconds);
  assert.equal(statValue({}, "tripwire", "hold"), CONFIG.trapSeconds);
  assert.equal(statValue({}, "sensor", "radius"), CONFIG.sensorRadius);
});

test("validation enforces 1–5 levels, every stat, and the 10-point cap", () => {
  assert.deepEqual(
    validateStats("jammer", { throw: 1, radius: 5, duration: 4 }),
    {
      throw: 1,
      radius: 5,
      duration: 4,
    },
  );
  assert.equal(
    validateStats("jammer", { throw: 3, radius: 5, duration: 3 }),
    null,
  );
  assert.equal(
    validateStats("jammer", { throw: 0, radius: 5, duration: 5 }),
    null,
  );
  assert.equal(
    validateStats("jammer", { throw: 1, radius: 6, duration: 1 }),
    null,
  );
  assert.equal(
    validateStats("jammer", { throw: 1.5, radius: 3, duration: 3 }),
    null,
  );
  assert.equal(validateStats("jammer", { radius: 5, duration: 5 }), null);
  assert.equal(validateStats("camera", { range: 3 }), null);
  assert.ok(STAT_BUDGET === 10);
});

test("server accepts valid tuning only during purchase and before Ready", () => {
  const m = match(),
    a = m.players.a;
  m.action("a", {
    type: "gadgetStats",
    gadget: "smoke",
    stats: { throw: 1, radius: 5, duration: 4 },
  });
  assert.deepEqual(a.gadgetStats.smoke, { throw: 1, radius: 5, duration: 4 });
  m.action("a", {
    type: "gadgetStats",
    gadget: "smoke",
    stats: { throw: 5, radius: 5, duration: 5 },
  });
  assert.deepEqual(a.gadgetStats.smoke, { throw: 1, radius: 5, duration: 4 });
  m.action("a", {
    type: "gadgetStats",
    gadget: "sensor",
    stats: { radius: 5, rearm: 1, shielding: 1 },
  });
  assert.equal(a.gadgetStats.sensor, undefined, "other team's gadget");
  m.action("a", { type: "ready" });
  m.action("a", {
    type: "gadgetStats",
    gadget: "smoke",
    stats: { throw: 3, radius: 3, duration: 3 },
  });
  assert.deepEqual(a.gadgetStats.smoke, { throw: 1, radius: 5, duration: 4 });
  m.reset();
  assert.deepEqual(
    a.gadgetStats.smoke,
    { throw: 1, radius: 5, duration: 4 },
    "kept across rounds",
  );
});

test("thrown smoke and jammer fly, land where predicted, and use tuned stats", () => {
  const m = match(),
    a = m.players.a;
  a.gadgetStats = {
    smoke: { throw: 5, radius: 4, duration: 1 },
    jammer: { throw: 1, radius: 5, duration: 4 },
  };
  m.phase = "active";
  m.time = 240;
  Object.assign(a, {
    x: -12,
    z: -24,
    yaw: -Math.PI / 2,
    pitch: 0.3,
    inventory: { smoke: 1, jammer: 1 },
  });
  a.equipped = "smoke";
  const smokePath = throwPath(a, 24);
  m.use(a);
  assert.equal(m.smokes.length, 0, "nothing deploys at your feet");
  assert.equal(m.projectiles.length, 1);
  assert.equal(m.snapshot("d").projectiles.length, 1, "opponents see it fly");
  advance(m, smokePath.time + 0.1);
  assert.equal(m.projectiles.length, 0);
  assert.equal(m.smokes[0].radius, 4.75);
  assert.ok(Math.abs(m.smokes[0].remaining - 4) < 0.2);
  assert.ok(distance(m.smokes[0], smokePath.landing) < 0.01);

  a.equipped = "jammer";
  const jammerPath = throwPath(a, 10);
  m.use(a);
  advance(m, jammerPath.time + 0.1);
  const jammer = m.gadgets.find((g) => g.kind === "jammer");
  assert.equal(jammer.stats.radius, 14);
  assert.ok(distance(jammer, jammerPath.landing) < 0.01);
  assert.ok(
    distance(a, smokePath.landing) > distance(a, jammerPath.landing) + 3,
    "higher throw range lands farther",
  );
});

test("throws bounce off walls and can land on top of cover", () => {
  // Thrown flat into the north perimeter wall from close range: bounces back.
  const wallThrow = throwPath({ x: 0, y: 0, z: -24, yaw: 0, pitch: -0.1 }, 24);
  assert.ok(wallThrow.landing.z > -26.5 && wallThrow.landing.z < -24);
  assert.equal(wallThrow.landing.y, 0);
  // Dropped onto the low cover block at (-1, 0): rests on top at 1.1 m.
  const lob = throwPath({ x: -1, y: 0, z: 3, yaw: 0, pitch: 0.7 }, 3);
  assert.ok(Math.abs(lob.landing.y - 1.1) < 1e-9, `landed at ${lob.landing.y}`);
});

test("tuned sensors re-alert and reveal movers for their reveal time", () => {
  const n = match();
  n.phase = "active";
  n.time = 240;
  Object.assign(n.players.a, { x: 20, z: 20 });
  Object.assign(n.players.d, { x: -20, z: 20 });
  n.gadgets.push({
    id: 1,
    kind: "sensor",
    x: 20,
    y: 0,
    z: 11,
    team: "defender",
    active: true,
    stats: { radius: 10, rearm: 2, reveal: 5 },
  });
  n.players.a.input = { forward: 1 };
  advance(n, 0.2);
  assert.ok(n.gadgets[0].lastAlert > 1.5 && n.gadgets[0].lastAlert <= 2);
  assert.deepEqual(n.snapshot("d").revealed, ["a"]);
  assert.deepEqual(n.snapshot("a").revealed, [], "only the sensor's team");
  n.players.a.input = {};
  advance(n, 4.5);
  assert.deepEqual(n.snapshot("d").revealed, ["a"], "5 s reveal");
  advance(n, 0.6);
  assert.deepEqual(n.snapshot("d").revealed, []);
});

test("tuned tripwire hold and trigger width apply when crossed", () => {
  const m = match(),
    a = m.players.a;
  m.phase = "active";
  m.time = 240;
  Object.assign(a, { x: 0, z: 0.55 });
  m.gadgets.push({
    id: 1,
    kind: "tripwire",
    x: -2,
    y: 0.3,
    z: 0,
    b: { x: 2, y: 0.3, z: 0 },
    team: "defender",
    active: true,
    stats: { hold: 7, width: 0.6, masking: 1 },
  });
  advance(m, 1 / 30);
  assert.equal(m.gadgets[0].active, false);
  assert.ok(a.immobile > 6.9);
});

test("opponents never receive tuning values", () => {
  const m = match();
  m.gadgets.push({
    id: 1,
    kind: "sensor",
    x: 0,
    y: 0,
    z: 0,
    owner: "d",
    team: "defender",
    active: true,
    stats: { radius: 10, rearm: 2, shielding: 1 },
  });
  assert.equal(m.snapshot("a").gadgets[0].stats, undefined);
  assert.equal(m.snapshot("d").gadgets[0].stats.radius, 10);
  assert.equal(
    m.snapshot("a").players.find((p) => p.id === "d")?.gadgetStats,
    undefined,
  );
});

function upgradeMatch() {
  const m = match();
  m.tuningMode = "upgrades";
  return m;
}
const upgrade = (m, gadget, stat, type = "upgrade") =>
  m.action("a", { type, gadget, stat });

test("upgrades mode: every property starts Normal and free tuning is ignored", () => {
  const m = upgradeMatch(),
    a = m.players.a;
  m.action("a", {
    type: "gadgetStats",
    gadget: "smoke",
    stats: { throw: 2, radius: 5, duration: 3 },
  });
  assert.equal(a.gadgetStats.smoke, undefined);
  assert.equal(statValue(m.builds(a), "smoke", "radius"), CONFIG.smokeRadius);
});

test("upgrades mode: buying needs the gadget, costs credits, caps at 2 per gadget", () => {
  const m = upgradeMatch(),
    a = m.players.a;
  upgrade(m, "jammer", "radius");
  assert.equal(a.upgrades.jammer?.radius, undefined, "must own the gadget");
  m.action("a", { type: "buy", gadget: "jammer" });
  upgrade(m, "jammer", "radius");
  upgrade(m, "jammer", "duration");
  upgrade(m, "jammer", "radius");
  upgrade(m, "jammer", "throw");
  upgrade(m, "jammer", "bogus");
  assert.deepEqual(
    a.upgrades.jammer,
    { radius: 1, duration: 1 },
    "2 upgrades per gadget in total",
  );
  assert.equal(a.credits, CONFIG.credits - GADGETS.jammer.cost - 200);
  assert.equal(statValue(m.builds(a), "jammer", "radius"), 12);
  assert.equal(statValue(m.builds(a), "jammer", "duration"), 7.5);
  assert.equal(statValue(m.builds(a), "jammer", "throw"), 16);
  upgrade(m, "jammer", "duration", "downgrade");
  upgrade(m, "jammer", "radius");
  assert.deepEqual(
    a.upgrades.jammer,
    { radius: 2, duration: 0 },
    "or both on one",
  );
  upgrade(m, "jammer", "radius");
  assert.equal(a.upgrades.jammer.radius, 2);
  upgrade(m, "sensor", "radius");
  assert.equal(a.upgrades.sensor?.radius, undefined, "other team's gadget");
});

test("upgrades mode: selling an upgrade or the last gadget refunds credits", () => {
  const m = upgradeMatch(),
    a = m.players.a;
  m.action("a", { type: "buy", gadget: "smoke" });
  m.action("a", { type: "buy", gadget: "smoke" });
  upgrade(m, "smoke", "radius");
  upgrade(m, "smoke", "radius");
  upgrade(m, "smoke", "radius", "downgrade");
  upgrade(m, "smoke", "throw");
  assert.deepEqual(a.upgrades.smoke, { radius: 1, throw: 1 });
  m.action("a", { type: "refund", gadget: "smoke" });
  assert.deepEqual(
    a.upgrades.smoke,
    { radius: 1, throw: 1 },
    "one still owned",
  );
  m.action("a", { type: "refund", gadget: "smoke" });
  assert.equal(a.upgrades.smoke, undefined);
  assert.equal(a.credits, CONFIG.credits);
});

test("upgrades mode: deployed gadgets use upgraded values; upgrades clear each round", () => {
  const m = upgradeMatch(),
    a = m.players.a;
  m.action("a", { type: "buy", gadget: "smoke" });
  upgrade(m, "smoke", "radius");
  m.phase = "active";
  m.time = 240;
  Object.assign(a, { x: 0, z: 23, yaw: 0 });
  a.equipped = "smoke";
  m.use(a);
  advance(m, 3);
  assert.equal(m.smokes[0].radius, 4.75);
  m.reset();
  assert.deepEqual(a.upgrades, {});
});

test("Upgrades is the default; the dev switch is solo-only and resets the round", () => {
  assert.equal(new Match("NEW").tuningMode, "upgrades");
  const m = new Match("TEST", true);
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  const a = m.players.a;
  m.action("a", { type: "buy", gadget: "smoke" });
  m.action("a", { type: "debug", key: "tuningMode", value: "free" });
  assert.equal(m.tuningMode, "free");
  assert.equal(m.snapshot("a").tuningMode, "free");
  assert.equal(a.credits, CONFIG.credits);
  m.action("a", { type: "debug", key: "tuningMode", value: "nonsense" });
  assert.equal(m.tuningMode, "free");

  const multi = new Match("MULTI");
  multi.addPlayer("a", "attacker");
  multi.action("a", { type: "debug", key: "tuningMode", value: "free" });
  assert.equal(multi.tuningMode, "upgrades");
});
