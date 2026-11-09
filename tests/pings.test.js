import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG } from "../shared/config.js";
function advance(m, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
}
function match() {
  const m = new Match("PING", false, "seen");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  return m;
}

test("a ping is seen by your own side only, then expires", () => {
  const m = match();
  m.action("a", { type: "ping", x: 3, y: 0, z: -4 });
  assert.deepEqual(
    m.snapshot("a").pings.map(({ x, z }) => [x, z]),
    [[3, -4]],
  );
  assert.equal(m.snapshot("d").pings.length, 0, "hidden from the other side");
  advance(m, CONFIG.pingSeconds - 1);
  assert.equal(m.snapshot("a").pings.length, 1);
  advance(m, 1.5);
  assert.equal(m.snapshot("a").pings.length, 0);
});

test("one ping each: a new one moves it, the same spot again clears it", () => {
  const m = match();
  m.action("a", { type: "ping", x: 3, y: 0, z: -4 });
  advance(m, 0.5);
  m.action("a", { type: "ping", x: -6, y: 0, z: 2 });
  assert.deepEqual(
    m.snapshot("a").pings.map(({ x, z }) => [x, z]),
    [[-6, 2]],
  );
  advance(m, 0.5);
  m.action("a", { type: "ping", x: -6.5, y: 0, z: 2.5 });
  assert.equal(m.snapshot("a").pings.length, 0);
});

test("pings stay in the arena, ignore junk, and can't be spammed", () => {
  const m = match();
  m.action("a", { type: "ping", x: "x", y: 0, z: 0 });
  m.action("a", { type: "ping", x: NaN, y: 0, z: 0 });
  assert.equal(m.pings.length, 0);
  m.action("a", { type: "ping", x: 500, y: 99, z: -500 });
  const [p] = m.pings;
  assert.ok(p.x <= 30 && p.z >= -30 && p.y <= 12, "clamped to the map");
  m.action("a", { type: "ping", x: 1, y: 0, z: 1 });
  assert.equal(m.pings[0].x, p.x, "too soon after the last one");
});
