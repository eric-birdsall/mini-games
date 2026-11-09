import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG, GADGETS, ruleOf } from "../shared/config.js";
import { throwPath } from "../shared/throwing.js";
// Soak: Plant's rule. Water balloons (as in Splash) in a real match: every
// gadget, a winner and a loser, splashHits splashes and you're out. There
// are no guns anywhere.
function game(rule, training = false) {
  const m = new Match("WEAPONS", false, rule, training, "compound");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.a, { x: 0, z: 18, y: 0, yaw: 0, pitch: 0 });
  Object.assign(m.players.d, { x: 0, z: 10, y: 0, yaw: Math.PI, pitch: 0 });
  return m;
}
function wait(m, s = 0.5) {
  for (let i = 0; i < Math.ceil(s * 30); i++) m.tick(1 / 30);
}
// The pitch that brings p's balloon down through chest height `d` m ahead
// (facing north).
function lob(p, d) {
  let best = 0,
    miss = Infinity;
  for (let pitch = -0.6; pitch < 0.6; pitch += 0.005) {
    const { points } = throwPath({ ...p, pitch }, CONFIG.balloonRange),
      down = points.findIndex(
        (q, i) => i > 0 && q.y < 1.2 && points[i - 1].y >= 1.2,
      ),
      rest = Math.abs((points[down] || points.at(-1)).z - (p.z - d));
    if (rest < miss) [best, miss] = [pitch, rest];
  }
  return best;
}

test("there's no sidearm: no such gadget, and the old Shoot rule plays Soak", () => {
  assert.equal(GADGETS.sidearm, undefined);
  assert.equal(ruleOf("shoot"), "soak");
  const m = game("shoot");
  assert.equal(m.rule, "soak");
  assert.equal(m.players.a.equipped, "balloon");
  assert.equal(m.players.a.inventory.sidearm, undefined);
});

test("Soak is a real match, not kid-friendly training", () => {
  const m = game("soak");
  assert.equal(m.training, false);
  assert.equal(m.kid, false);
  // Every gadget is on offer, not just Splash's four.
  assert.ok(m.canUse(m.players.d, GADGETS.camera));
  assert.ok(m.canUse(m.players.d, GADGETS.tripwire));
});

test("Soak: three splashes put you out, and the thrower's side wins", () => {
  const m = game("soak"),
    a = m.players.a,
    d = m.players.d;
  a.pitch = lob(a, 8);
  for (let i = 1; i <= CONFIG.splashHits; i++) {
    m.attack(a);
    wait(m, 1.2);
    assert.equal(d.hits, i, `splash ${i}`);
  }
  assert.equal(d.alive, false);
  assert.equal(m.result.winner, "attacker");
  assert.equal(a.inventory.balloon, 1, "balloons never run out");
});

test("mode weapons reset each round and cannot be bought or refunded", () => {
  const m = game("soak", true),
    a = m.players.a;
  m.phase = "purchase";
  m.action("a", { type: "refund", gadget: "balloon" });
  assert.equal(a.inventory.balloon, 1);
  m.reset();
  assert.equal(a.inventory.balloon, 1);
  assert.equal(a.equipped, "balloon");
  assert.equal(a.hits, 0);
  const seen = game("seen");
  assert.equal(seen.players.a.inventory.balloon, undefined);
});

test("Spear mode is gone: asking for it plays Seen, with no weapon", () => {
  const m = game("spear");
  assert.equal(m.rule, "seen");
  assert.equal(m.players.a.equipped, null);
  assert.equal(Object.keys(m.players.a.inventory).length, 0);
});

test("Soak does not eliminate by sight or proximity", () => {
  const m = game("soak");
  wait(m, 4);
  assert.ok(m.players.a.alive && m.players.d.alive);
  m.players.d.z = 17;
  wait(m, 2);
  assert.ok(m.players.a.alive && m.players.d.alive);
});

test("spent gadgets retain their slot order, while refunds before play remove unused slots", () => {
  const m = game("seen"),
    a = m.players.a;
  a.inventory = { smoke: 1, jammer: 1 };
  a.equipped = "smoke";
  m.snapshot("a");
  m.use(a);
  assert.equal(a.inventory.smoke, 0);
  assert.deepEqual(m.snapshot("a").me.slots, ["smoke", "jammer"]);
  a.equipped = "jammer";
  m.use(a);
  assert.deepEqual(m.snapshot("a").me.slots, ["smoke", "jammer"]);
  m.reset();
  assert.deepEqual(m.snapshot("a").me.slots, []);
});

test("balloons can't be thrown in preparation or when restrained, and say why", () => {
  const m = game("soak"),
    a = m.players.a;
  m.phase = "prep";
  m.action("a", { type: "use" });
  assert.equal(m.projectiles.length, 0);
  assert.ok(
    m.events.some((e) => e.text.includes("unlock when infiltration starts")),
  );
  m.phase = "active";
  a.immobile = 2;
  m.use(a);
  assert.equal(m.projectiles.length, 0);
  a.immobile = 0;
  m.use(a);
  assert.equal(m.projectiles.length, 1);
});

test("explicit throw triggers apply current aim and throw once per press", () => {
  const m = game("soak"),
    p = m.players.a;
  p.yaw = Math.PI / 2;
  m.action("a", { type: "input", input: { fire: 1, yaw: 0, pitch: 0 } });
  assert.equal(m.projectiles.length, 1);
  assert.ok(
    Math.abs(m.projectiles[0].points.at(-1).x) < 0.5,
    "thrown along the same input packet's aim",
  );
  const thrown = new Set(m.projectiles.map((t) => t.id)),
    seen = () => m.projectiles.forEach((t) => thrown.add(t.id));
  wait(m);
  m.action("a", { type: "input", input: { fire: 1, yaw: 0, pitch: 0 } });
  seen();
  assert.equal(thrown.size, 1, "a held or duplicate press doesn't throw again");
  wait(m, 0.3);
  m.action("a", { type: "input", input: { fire: 2, yaw: 0, pitch: 0 } });
  seen();
  assert.equal(thrown.size, 2, "a new press throws");
  assert.equal(m.stats.equipment, 0, "balloons aren't devices");
});

test("a Soak bot throws at you once it's seen you, and can win", () => {
  const m = game("soak"),
    a = m.players.a,
    d = m.players.d;
  d.bot = true;
  m.debug.stationary = true;
  wait(m, 0.2);
  assert.equal(a.hits, 0, "it reacts first");
  wait(m, 12);
  assert.ok(a.hits > 0 || !a.alive, "it gets you wet");
  assert.equal(a.inventory.sidearm, undefined);
});
