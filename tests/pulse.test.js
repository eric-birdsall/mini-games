import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { useMap } from "../shared/maps.js";
import { CONFIG, GADGETS } from "../shared/config.js";
import { THROWABLE } from "../shared/throwing.js";
// The pulse sensor: thrown; a second after landing, one pulse outlines every
// opponent within its radius, through walls, for a few seconds.
function match() {
  useMap("compound");
  const m = new Match("PULSE", false, "seen", false, "compound");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  return m;
}
const advance = (m, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
};
const land = (m, team, at, radius = 8, duration = 3) =>
  m.detonate({
    kind: "pulse",
    team,
    landing: { y: 0, ...at },
    radius,
    duration,
  });

test("both sides can buy and throw it", () => {
  assert.equal(GADGETS.pulse.team, "both");
  assert.ok(THROWABLE.includes("pulse"));
  const m = match();
  m.phase = "purchase";
  for (const id of ["a", "d"]) {
    m.action(id, { type: "buy", gadget: "pulse" });
    assert.equal(m.players[id].inventory.pulse, 1, id);
  }
});

test("a second after landing it outlines opponents in range, through walls", () => {
  const m = match(),
    d = m.players.d;
  // The sentinel 6 m away behind the warehouse wall; the infiltrator far off.
  Object.assign(d, { x: -14, z: 0, y: 0 });
  Object.assign(m.players.a, { x: 0, z: 23, y: 0 });
  land(m, "attacker", { x: -8, z: 0 });
  advance(m, CONFIG.pulseDelay - 0.2);
  assert.equal(m.reveals.attacker.d, undefined, "not yet");
  advance(m, 0.3);
  assert.ok(m.reveals.attacker.d > 2.5, "outlined for the infiltrators");
  assert.equal(m.pulses.length, 1, "the sweep is visible");
  assert.ok(
    m.events.some(
      (e) => e.team === "attacker" && /1 contact outlined/.test(e.text),
    ),
  );
  assert.ok(
    m.events.some((e) => e.team === "defender" && /swept you/.test(e.text)),
    "the sentinel is told",
  );
  advance(m, 3.2);
  assert.equal(m.reveals.attacker.d, undefined, "the outline fades");
});

test("it ignores your own side and anyone outside the radius", () => {
  const m = match();
  Object.assign(m.players.d, { x: 10, z: 0, y: 0 });
  Object.assign(m.players.a, { x: 0, z: 1, y: 0 });
  land(m, "attacker", { x: 0, z: 0 });
  advance(m, 1.2);
  assert.deepEqual(m.reveals.attacker, {}, "the sentinel 10 m off is clear");
  assert.deepEqual(m.reveals.defender, {}, "your own side isn't swept");
  assert.ok(m.events.some((e) => /no contacts/.test(e.text)));
  // A bigger pulse (upgraded radius) reaches them.
  land(m, "attacker", { x: 0, z: 0 }, 11);
  advance(m, 1.2);
  assert.ok(m.reveals.attacker.d > 0);
});

test("thrown from the hand, it flies, lands and pulses", () => {
  const m = match(),
    d = m.players.d;
  Object.assign(m.players.a, {
    x: 0,
    z: 20,
    y: 0,
    yaw: 0,
    pitch: 0.3,
    equipped: "pulse",
    inventory: { pulse: 1 },
  });
  Object.assign(d, { x: 0, z: 8, y: 0 });
  m.use(m.players.a);
  assert.equal(m.projectiles.length, 1);
  assert.equal(m.players.a.inventory.pulse, 0);
  advance(m, 4);
  assert.equal(m.projectiles.length, 0, "landed");
  assert.ok(
    m.events.some((e) => /Pulse:/.test(e.text)),
    "and pulsed",
  );
});
