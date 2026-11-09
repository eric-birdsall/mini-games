import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG, GADGETS, OBJECTIVE } from "../shared/config.js";
function training(team = "attacker") {
  const m = new Match("TRAIN", false, "seen", true);
  m.addPlayer("p", team);
  m.addPlayer("bot", team === "attacker" ? "defender" : "attacker", true);
  m.action("p", { type: "trainingStock", fill: "all" });
  return m;
}
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}

test("training stocks the chosen type of every gadget from both roles", () => {
  const m = training(),
    p = m.players.p;
  assert.equal(m.solo, true);
  // On a terminal map the sentinel bot patrols by default.
  assert.equal(m.botStill(m.players.bot), false);
  // Untyped gadgets, and the first (deployable) type of typed ones.
  for (const [k, g] of Object.entries(GADGETS).filter(([, g]) => !g.modeWeapon))
    assert.equal(
      p.inventory[k],
      g.type && g.type !== "deployable" ? 0 : g.limit,
      k,
    );
  m.action("p", { type: "selectType", gadget: "tripwireDecoy" });
  assert.equal(p.inventory.tripwireDecoy, GADGETS.tripwireDecoy.limit);
  assert.equal(p.inventory.tripwire, 0);
  m.action("p", { type: "ready" });
  assert.equal(m.phase, "active");
  assert.equal(m.snapshot("p").training, true);
});

test("training starts empty; carry none, some, or all of each gadget", () => {
  const m = new Match("TRAIN", false, "seen", true),
    p = (m.addPlayer("p", "attacker"), m.players.p);
  assert.ok(
    Object.values(p.inventory).every((n) => !n),
    "nothing by default",
  );
  assert.equal(p.equipped, null);
  m.action("p", { type: "trainingStock", gadget: "smoke", count: 1 });
  m.action("p", { type: "trainingStock", gadget: "tripwire", count: 99 });
  assert.equal(p.inventory.smoke, 1);
  assert.equal(p.inventory.tripwire, GADGETS.tripwire.limit, "capped");
  assert.equal(p.inventory.sensor, 0);
  // The count follows the gadget when its type changes.
  m.action("p", { type: "selectType", gadget: "tripwireDecoy" });
  assert.equal(p.inventory.tripwireDecoy, GADGETS.tripwire.limit);
  assert.equal(p.inventory.tripwire, 0);
  m.action("p", { type: "trainingStock", fill: "none" });
  assert.ok(Object.values(p.inventory).every((n) => !n));
  m.action("p", { type: "trainingStock", gadget: "smoke", count: 2 });
  m.action("p", { type: "ready" });
  Object.assign(p, { x: 0, z: 18, yaw: 0, equipped: "smoke" });
  m.use(p);
  assert.equal(p.inventory.smoke, 1);
  advance(m, 1);
  assert.equal(p.inventory.smoke, 2, "refills to the picked count");
  // Restart keeps the picks; outside training the message does nothing.
  m.action("p", { type: "restart" });
  assert.equal(p.inventory.smoke, 2);
  const solo = new Match("SOLO", true, "seen");
  solo.addPlayer("a", "attacker");
  solo.action("a", { type: "trainingStock", fill: "all" });
  assert.ok(Object.values(solo.players.a.inventory).every((n) => !n));
});

test("training refills used gadgets and never runs the clock down", () => {
  const m = training(),
    p = m.players.p;
  m.action("p", { type: "ready" });
  Object.assign(p, { x: 0, z: 18, yaw: 0, equipped: "smoke" });
  m.use(p);
  assert.equal(p.inventory.smoke, GADGETS.smoke.limit - 1);
  const time = m.time;
  advance(m, 2);
  assert.equal(p.inventory.smoke, GADGETS.smoke.limit);
  assert.equal(m.time, time);
});

test("other-role gadgets deploy for that role and affect the player", () => {
  const m = training("attacker"),
    p = m.players.p;
  m.action("p", { type: "ready" });
  m.gadgets = [];
  Object.assign(p, { x: 12, z: 8, yaw: 0, pitch: -1.2, equipped: "sensor" });
  m.use(p);
  const sensor = m.gadgets.find((g) => g.kind === "sensor");
  assert.ok(sensor, "sensor placed by an infiltrator");
  assert.equal(sensor.team, "defender");
  assert.equal(m.snapshot("p").gadgets[0].owner, "p", "nothing hidden");
  p.input = { forward: 1 };
  advance(m, 0.3);
  assert.ok(
    m.snapshot("p").events.some((e) => e.text.startsWith("Motion detected")),
    "the player sees the defender-side alert",
  );
});

test("training detections and flag captures never end the session", () => {
  const m = training(),
    p = m.players.p,
    bot = m.players.bot;
  m.action("p", { type: "ready" });
  m.gadgets = [];
  Object.assign(bot, { x: 0, z: -16, yaw: Math.PI, pitch: 0 });
  Object.assign(p, { x: 0, z: -10 });
  advance(m, CONFIG.detectionSeconds + 0.5);
  assert.equal(p.alive, true);
  assert.equal(m.phase, "active");
  Object.assign(p, { x: OBJECTIVE.x, z: OBJECTIVE.z });
  bot.yaw = 0;
  p.input = { interact: true };
  advance(m, CONFIG.captureSeconds + 0.5);
  assert.equal(m.phase, "active");
  assert.equal(m.result, undefined);
});

test("training allows camera feeds for any role and blocks buying", () => {
  const m = training("attacker"),
    p = m.players.p;
  const credits = p.credits;
  m.action("p", { type: "buy", gadget: "smoke" });
  m.action("p", { type: "refund", gadget: "smoke" });
  assert.equal(p.credits, credits);
  assert.equal(p.inventory.smoke, GADGETS.smoke.limit);
  m.action("p", { type: "ready" });
  m.gadgets.push({
    id: 99,
    kind: "camera",
    owner: "p",
    team: "defender",
    x: 0,
    y: 1,
    z: 0,
    active: true,
  });
  m.action("p", { type: "camera" });
  assert.equal(p.camera, 99);
});

test("restart returns training to the loadout with full stock", () => {
  const m = training(),
    p = m.players.p;
  m.action("p", { type: "ready" });
  m.action("p", { type: "restart" });
  assert.equal(m.phase, "purchase");
  assert.equal(p.inventory.tripwire, GADGETS.tripwire.limit);
  assert.equal(m.botStill(m.players.bot), false);
});

test("training: choose the opponent's loadout; it deploys in the first seconds", () => {
  const m = training("attacker");
  m.action("p", { type: "botLoadout", gadget: "tripwire", count: 2 });
  m.action("p", { type: "botLoadout", gadget: "tripwireDecoy", count: 5 });
  m.action("p", { type: "botLoadout", gadget: "camera", count: 0 });
  m.action("p", { type: "botLoadout", gadget: "cameraDecoy", count: 1 });
  m.action("p", { type: "botLoadout", gadget: "sensorPortable", count: 1 });
  m.action("p", { type: "botLoadout", gadget: "smoke", count: 2 });
  assert.deepEqual(
    m.snapshot("p").botLoadout,
    {
      tripwire: 2,
      tripwireDecoy: 2,
      sensor: 1,
      cameraDecoy: 1,
      sensorPortable: 1,
    },
    "decoy wires capped by the 4 wire spots; smoke is not a sentinel gadget",
  );
  m.action("p", { type: "ready" });
  assert.equal(m.gadgets.length, 0, "nothing is out yet");
  advance(m, 0.9);
  assert.equal(m.gadgets.length, 1, "first device after 0.8 s");
  advance(m, 4);
  const kinds = m.gadgets.map((g) => g.kind).sort();
  assert.deepEqual(kinds, [
    "cameraDecoy",
    "sensor",
    "tripwire",
    "tripwire",
    "tripwireDecoy",
    "tripwireDecoy",
  ]);
  assert.ok(m.gadgets.every((g) => g.team === "defender" && g.owner === "bot"));
  assert.equal(m.players.bot.equipped, "sensorPortable", "worn sensor on");
});

test("training: an infiltrator opponent throws out smoke and jammers and cloaks", () => {
  const m = training("defender");
  m.action("p", { type: "botLoadout", gadget: "smoke", count: 1 });
  m.action("p", { type: "botLoadout", gadget: "jammer", count: 2 });
  m.action("p", { type: "botLoadout", gadget: "cloak", count: 1 });
  m.action("p", { type: "ready" });
  advance(m, 3);
  assert.equal(m.smokes.length, 1);
  assert.equal(m.gadgets.filter((g) => g.kind === "jammer").length, 2);
  assert.ok(m.players.bot.cloak > 0, "cloaked as soon as it can");
});

test("training: looking at a device you placed for the other side never marks it", () => {
  const m = training("attacker"),
    p = m.players.p;
  m.action("p", { type: "ready" });
  m.gadgets = [];
  Object.assign(p, { x: 0, z: 5, yaw: 0, pitch: -Math.atan(1.35 / 3) });
  m.gadgets.push(
    {
      id: 901,
      kind: "tripwire",
      owner: "p",
      team: "defender",
      x: -1,
      y: 0.3,
      z: 2,
      b: { x: 1, y: 0.3, z: 2 },
      active: true,
    },
    {
      id: 902,
      kind: "tripwire",
      owner: "bot",
      team: "defender",
      x: -1,
      y: 0.3,
      z: 2.2,
      b: { x: 1, y: 0.3, z: 2.2 },
      active: true,
    },
  );
  advance(m, 3);
  assert.ok(!m.gadgets[0].marked, "yours isn't marked");
  assert.equal(m.gadgets[1].marked, true, "the opponent's is still spotted");
  // An infiltrator's look only marks; neither wire is destroyed.
  assert.ok(m.gadgets.every((g) => g.active));
});

test("training: switch sides mid-round and your own tripwire becomes the enemy's", () => {
  const m = training("defender"),
    p = m.players.p;
  m.action("p", { type: "ready" });
  m.gadgets = [];
  const wire = {
    id: 951,
    kind: "tripwire",
    owner: "p",
    team: "defender",
    x: -1,
    y: 0.3,
    z: 2,
    b: { x: 1, y: 0.3, z: 2 },
    active: true,
  };
  m.gadgets.push(wire);
  m.action("p", { type: "debug", key: "swapSides" });
  assert.equal(p.team, "attacker");
  assert.equal(m.players.bot.team, "defender");
  assert.equal(m.phase, "active", "the round keeps going");
  assert.equal(wire.owner, "bot", "it now belongs to the other side");
  // Look at it from 3 m away: as an infiltrator now, you mark it.
  Object.assign(p, { x: 0, z: 5, yaw: 0, pitch: -Math.atan(1.35 / 3) });
  advance(m, 2.2);
  assert.equal(wire.marked, true);
  assert.equal(wire.active, true, "marked, not destroyed");

  // A second wire on open floor, walked into instead: it catches you.
  const trap = {
    ...wire,
    id: 952,
    active: true,
    owner: "bot",
    x: -13,
    z: -7,
    b: { x: -11, y: 0.3, z: -7 },
  };
  m.gadgets.push(trap);
  Object.assign(p, {
    x: -12,
    z: -6,
    yaw: 0,
    pitch: 0.4,
    input: { forward: 1 },
  });
  advance(m, 0.6);
  assert.ok(p.immobile > 0, "restrained by the switched wire");
});

test("switching sides with the round kept is training-only", () => {
  const m = new Match("SOLO", true);
  m.addPlayer("p", "attacker");
  m.addPlayer("bot", "defender", true);
  m.action("p", { type: "debug", key: "swapSides" });
  assert.equal(m.players.p.team, "attacker");
});

test("pausing a solo match freezes the bot and the clock", () => {
  const m = new Match("SOLO", true, "seen");
  m.addPlayer("p", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  const bot = m.players.bot;
  m.action("p", { type: "input", input: { paused: true } });
  const at = { x: bot.x, z: bot.z, time: m.time };
  advance(m, 3);
  assert.deepEqual({ x: bot.x, z: bot.z, time: m.time }, at);
  m.action("p", { type: "input", input: {} });
  advance(m, 1);
  assert.ok(m.time < at.time);
});

test("free roam: training with no opponent survives play, switching and swapping", () => {
  const m = new Match("ROAM", false, "seen", true, "pier9");
  m.noBot = true;
  m.addPlayer("p", "attacker");
  m.action("p", { type: "trainingStock", fill: "all" });
  m.action("p", { type: "ready" });
  advance(m, 5);
  assert.equal(m.phase, "active");
  assert.equal(m.botPlayer, undefined);
  assert.equal(m.snapshot("p").noBot, true);
  m.action("p", { type: "switch" });
  assert.equal(m.players.p.team, "defender");
  assert.equal(m.botPlayer, undefined, "switching teams adds no bot");
  m.action("p", { type: "ready" });
  m.action("p", { type: "debug", key: "swapSides" });
  m.action("p", { type: "debug", key: "stationary" });
  advance(m, 5);
  assert.equal(m.players.p.team, "attacker");
});
