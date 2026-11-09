import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { clearSight, smokeBlocks, raySurface } from "../shared/map.js";
function match(solo = false) {
  const m = new Match("TEST", solo);
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.d, { x: 0, z: -16, yaw: Math.PI, pitch: 0 });
  Object.assign(m.players.a, { x: 0, z: -10 });
  return m;
}
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}
test("direct detection requires three continuous seconds and resets behind cover", () => {
  const m = match();
  advance(m, 1.5);
  assert.ok(m.pairs["d:a"] > 1.4);
  m.players.a.x = -11;
  m.players.a.z = -9;
  advance(m, 0.1);
  assert.equal(m.pairs["d:a"], 0);
  m.players.a.x = 0;
  m.players.a.z = -10;
  advance(m, 2);
  assert.equal(m.players.a.alive, true);
  advance(m, 1.1);
  assert.equal(m.players.a.alive, false);
  assert.equal(m.result.winner, "defender");
});
test("narrow viewing cone and maximum range are enforced", () => {
  const m = match();
  assert.equal(m.canDetect(m.players.d, m.players.a), true);
  m.players.d.yaw += 0.4;
  assert.equal(m.canDetect(m.players.d, m.players.a), false);
  m.players.d.yaw = Math.PI;
  m.players.a.z = 22;
  assert.equal(m.canDetect(m.players.d, m.players.a), false);
});
test("crouching behind low cover breaks sight", () => {
  const m = match();
  Object.assign(m.players.d, { x: -1, z: -4, yaw: Math.PI });
  Object.assign(m.players.a, { x: -1, z: 2 });
  assert.equal(m.canDetect(m.players.d, m.players.a), true);
  m.players.a.crouch = true;
  assert.equal(m.canDetect(m.players.d, m.players.a), false);
});
test("camera viewing cannot initiate or complete detection", () => {
  const m = match();
  m.gadgets.push({ id: 12, kind: "camera", x: 10, y: 2, z: -12, active: true });
  m.players.d.camera = 12;
  advance(m, 4);
  assert.equal(m.pairs["d:a"], 0);
  assert.equal(m.players.a.alive, true);
});
test("smoke obstructs authoritative sight and immediately clears progress", () => {
  const m = match();
  advance(m, 1);
  m.smokes.push({ x: 0, z: -13, radius: 4, remaining: 8 });
  advance(m, 0.1);
  assert.equal(m.pairs["d:a"], 0);
  assert.equal(
    smokeBlocks({ x: 0, y: 1, z: -16 }, { x: 0, y: 1, z: -10 }, m.smokes),
    true,
  );
});
test("timeout gives defenders victory", () => {
  const m = match();
  m.time = 0.01;
  m.tick(1 / 30);
  assert.equal(m.result.winner, "defender");
  assert.equal(m.result.reason, "Time expired");
});
test("decoy wires look nearly identical to enemies but only real traps restrain", () => {
  for (const kind of ["tripwire", "tripwireDecoy"]) {
    const m = match();
    m.players.d.alive = false;
    Object.assign(m.players.a, { x: 0, z: -10 });
    m.gadgets.push({
      id: 99,
      kind,
      team: "defender",
      owner: "d",
      x: -1,
      y: 0.3,
      z: -10,
      b: { x: 1, y: 0.3, z: -10 },
      active: true,
    });
    const seen = m.snapshot("a").gadgets[0];
    assert.equal(seen.kind, "tripwire");
    assert.equal(seen.tone, 1, "to the infiltrator, identical");
    assert.equal(
      m.snapshot("d").gadgets[0].tone,
      kind === "tripwire" ? 1 : 0.95,
      "the sentinel can tell its own decoys",
    );
    m.tick(1 / 30);
    assert.equal(m.players.a.immobile > 0, kind === "tripwire");
    assert.equal(m.players.a.alive, true);
  }
});
test("scanner cannot distinguish decoys, disarming consumes continuous interaction time", () => {
  const m = match();
  m.players.d.alive = false;
  Object.assign(m.players.a, {
    x: 0,
    z: -8,
    yaw: 0,
    equipped: "scanner",
    inventory: { scanner: 1, disarm: 1 },
  });
  m.gadgets.push({
    id: 1,
    kind: "tripwireDecoy",
    owner: "d",
    team: "defender",
    x: 0,
    y: 0.3,
    z: -10,
    active: true,
  });
  m.action("a", { type: "use" });
  advance(m, 1.6);
  assert.equal(m.players.a.signatures.length, 1);
  m.action("a", { type: "equip", gadget: "disarm" });
  m.players.a.pitch = -0.5;
  m.players.a.input = { interact: true };
  advance(m, 2.6);
  assert.equal(m.gadgets[0].active, false);
});
test("jammer disrupts electronics but preserves mechanical wires", () => {
  const m = match();
  m.players.d.alive = false;
  m.gadgets = [
    { id: 1, kind: "camera", team: "defender", x: 1, z: -10, active: true },
    { id: 2, kind: "sensor", team: "defender", x: 1, z: -10, active: true },
    { id: 3, kind: "tripwire", team: "defender", x: 1, z: -10, active: true },
    {
      id: 4,
      kind: "jammer",
      team: "attacker",
      x: 1,
      z: -10,
      active: true,
      remaining: 6,
    },
  ];
  m.tick(1 / 30);
  assert.equal(m.gadgets[0].jammed, true);
  assert.equal(m.gadgets[1].jammed, true);
  assert.equal(m.gadgets[2].jammed, false);
  advance(m, 6.1);
  assert.equal(m.gadgets[0].jammed, false);
});
test("economy enforces credits, role, inventory limits and hides enemy purchases", () => {
  const m = match();
  m.phase = "purchase";
  m.action("a", { type: "buy", gadget: "tripwire" });
  assert.deepEqual(m.players.a.inventory, {});
  for (let i = 0; i < 8; i++) m.action("a", { type: "buy", gadget: "smoke" });
  assert.equal(m.players.a.inventory.smoke, 3);
  assert.equal(m.players.a.credits, 250);
  m.action("a", { type: "buy", gadget: "jammer" });
  assert.equal(m.players.a.inventory.jammer, undefined);
  assert.equal(
    m.snapshot("d").players.find((p) => p.id === "a")?.inventory,
    undefined,
  );
});
test("both multiplayer players must ready before prep; all phases can repeat", () => {
  const m = match();
  m.phase = "purchase";
  m.action("a", { type: "ready" });
  assert.equal(m.phase, "purchase");
  m.action("d", { type: "ready" });
  assert.equal(m.phase, "prep");
  advance(m, 45.1);
  assert.equal(m.phase, "active");
  m.finish("defender", "test");
  m.action("a", { type: "restart" });
  assert.equal(m.phase, "purchase");
  assert.equal(m.players.a.credits, CONFIG.credits);
});
test("debug commands cannot mutate multiplayer, solo can switch teams", () => {
  const m = match();
  m.action("a", { type: "debug", key: "all" });
  assert.deepEqual(m.players.a.inventory, {});
  m.action("a", { type: "switch" });
  assert.equal(m.players.a.team, "attacker");
  const s = new Match("SOLO", true);
  s.addPlayer("a", "attacker");
  s.addPlayer("bot", "defender", true);
  s.action("a", { type: "switch" });
  assert.equal(s.players.a.team, "defender");
  assert.equal(s.players.bot.team, "attacker");
});
test("surface ray selects physical floors and walls, never free space", () => {
  const p = { x: 0, y: 0, z: 20, yaw: 0, pitch: -0.6, crouch: false };
  const hit = raySurface(p);
  assert.ok(hit);
  assert.equal(hit.y, 0);
  assert.equal(hit.normal.y, 1);
  p.pitch = 0.6;
  assert.equal(raySurface(p), null);
});
test("each defender attacker pair has separate detection progress", () => {
  const m = match();
  m.addPlayer("d2", "other");
  m.players.d2.team = "defender";
  Object.assign(m.players.d2, { x: 2, z: -16, yaw: 0 });
  advance(m, 1);
  assert.ok(m.pairs["d:a"] > 0);
  assert.equal(m.pairs["d2:a"], 0);
});

test("holding jump cannot reset vertical velocity at the apex", () => {
  const m = match();
  m.players.d.alive = false;
  m.players.a.input = { jump: true };
  let highest = 0;
  for (let i = 0; i < 90; i++) {
    m.tick(1 / 30);
    highest = Math.max(highest, m.players.a.y);
  }
  assert.ok(highest < 1, `jump exceeded its ballistic height: ${highest}`);
});
test("destroyed camera releases the viewer and exit works with no cameras", () => {
  const m = match();
  m.players.d.camera = 45;
  m.tick(1 / 30);
  assert.equal(m.players.d.camera, null);
  m.players.d.camera = 99;
  m.action("d", { type: "camera", close: true });
  assert.equal(m.players.d.camera, null);
});
test("scripted attackers obey immobilization and can complete the waypoint route", () => {
  const m = new Match("SOLO", true);
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  m.players.d.alive = false;
  m.phase = "active";
  m.time = 240;
  m.players.bot.immobile = 2;
  advance(m, 1);
  assert.equal(m.players.bot.z, MAPS.compound.spawns.attacker.z);
  advance(m, 55);
  assert.equal(m.result?.winner, "attacker");
});

test("Removed mode ignores sustained sight outside capture distance", () => {
  const m = match();
  m.rule = "removed";
  advance(m, 4);
  assert.equal(m.players.a.alive, true);
  assert.equal(m.pairs["d:a"], 0);
});
test("Removed captures at close range regardless of facing or smoke", () => {
  const m = match();
  m.rule = "removed";
  Object.assign(m.players.a, { x: 0, z: -15 });
  m.players.d.yaw = 0;
  m.smokes.push({ x: 0, z: -15, radius: 4, remaining: 8 });
  m.tick(1 / 30);
  assert.equal(m.players.a.alive, false);
  assert.equal(m.result.reason, "Intruder captured at close range");
  assert.equal(m.result.captures, 1);
  assert.equal(m.result.detections, 0);
});
test("Removed capture respects walls, height, camera viewing, and alive state", () => {
  const m = match();
  m.rule = "removed";
  const d = m.players.d,
    a = m.players.a;
  Object.assign(d, { x: 5.4, z: -18 });
  Object.assign(a, { x: 6.6, z: -18 });
  assert.equal(m.canCapture(d, a), false);
  Object.assign(d, { x: 0, z: -16 });
  Object.assign(a, { x: 0, z: -15, y: 2 });
  assert.equal(m.canCapture(d, a), false);
  a.y = 0;
  d.camera = 4;
  assert.equal(m.canCapture(d, a), false);
  d.camera = null;
  d.alive = false;
  assert.equal(m.canCapture(d, a), false);
});
test("Seen does not instantly capture nearby attackers and rules persist on reset", () => {
  const m = match();
  m.players.a.z = -15;
  m.tick(1 / 30);
  assert.equal(m.players.a.alive, true);
  const removed = new Match("MODES", false, "removed");
  removed.addPlayer("a", "attacker");
  removed.reset();
  assert.equal(removed.snapshot("a").rule, "removed");
  assert.equal(new Match("INVALID", false, "anything").rule, "seen");
});
test("Removed capture is inactive during preparation", () => {
  const m = match();
  m.rule = "removed";
  m.phase = "prep";
  m.players.a.z = -15;
  advance(m, 1);
  assert.equal(m.players.a.alive, true);
});
test("detection counts any visible part of the intruder, not just the head", () => {
  const m = match(),
    d = m.players.d,
    a = m.players.a;
  // 3 m apart, the sentinel looking down at the intruder's legs: the head is
  // outside the 12° cone, the hips and knees are inside it.
  Object.assign(d, { x: 0, z: -16, yaw: Math.PI, pitch: -0.35 });
  Object.assign(a, { x: 0, z: -13 });
  const head = m.eye(a);
  assert.equal(m.inCone(d, head), false, "the head alone wouldn't count");
  assert.equal(m.canDetect(d, a), true, "the body does");
  advance(m, 1);
  assert.ok(m.pairs["d:a"] > 0.9, "the Seen bar fills");
});
