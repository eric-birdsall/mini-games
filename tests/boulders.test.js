import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { PARTY, partyScore } from "../shared/party.js";
import {
  WIDTH,
  NOOK,
  buildBoulders,
  bouldersMapId,
  ensureBouldersMap,
  zOf,
  groundAt,
} from "../shared/boulders.js";
import { crushes, lastRecess } from "../server/boulders.js";

const D = PARTY.boulders;
// A Boulder Dash race on a given channel: you against the bot, or a friend.
function match({ seed = 7, bot = true, level = "hard" } = {}) {
  const m = new Match("BLDR", bot, "soak", true, "docks");
  m.botLevel = level;
  m.setParty("boulders", bot);
  m.map = bouldersMapId(seed);
  ensureBouldersMap(m.map);
  m.useLevel();
  m.addPlayer("a", "attacker");
  if (bot) m.addPlayer("bot", "defender", true);
  else m.addPlayer("d", "defender");
  return m;
}
function go(m) {
  for (const p of Object.values(m.players))
    if (!p.bot) m.action(p.id, { type: "ready" });
  for (let i = 0; i < 300 && m.phase !== "active"; i++) tick(m);
  assert.equal(m.phase, "active");
  // No boulders unless a test lets them go.
  m.party.race.next = 1e9;
}
function tick(m, input = {}) {
  for (const p of Object.values(m.players)) if (!p.bot) p.input = { ...input };
  m.tick(1 / 30);
}
function run(m, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 30) && m.phase === "active"; i++)
    tick(m, input);
}
// Put a player `s` m up the channel at `x`, facing up it.
function place(m, id, s, x = 0) {
  const map = MAPS[m.map],
    p = m.players[id];
  Object.assign(p, {
    x,
    z: zOf(map, s),
    y: groundAt(map, s),
    vy: 0,
    yaw: 0,
    pitch: 0,
  });
  m.party.race.climbers[id].s = s;
  return p;
}
const boulder = (m, s, half = 0) => {
  const b = {
    id: m.nextId++,
    half,
    x: (half * WIDTH) / 4,
    s,
    r: half ? D.halfRadius : D.fullRadius,
    v: D.speed,
  };
  m.party.race.boulders.push(b);
  return b;
};

test("a channel is the same from the same seed, recesses alternating and spreading out", () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const a = buildBoulders(seed),
      b = buildBoulders(seed);
    assert.deepEqual(
      a.walls.map((w) => [w.x, w.z, w.w, w.d, w.h]),
      b.walls.map((w) => [w.x, w.z, w.w, w.d, w.h]),
    );
    assert.equal(a.recesses.length, D.recesses);
    for (let i = 1; i < a.recesses.length; i++)
      assert.equal(a.recesses[i].side, -a.recesses[i - 1].side);
    const gaps = a.recesses.slice(1).map((r, i) => r.s - a.recesses[i].s);
    assert.ok(gaps[0] < 9.2 && gaps.at(-1) > 10.8, gaps.join(","));
    assert.ok(a.length > 110 && a.length < 145, `${a.length}`);
    assert.ok(Math.abs(a.rise - a.length * D.slope) < 1e-9);
  }
  assert.notDeepEqual(
    buildBoulders(1).recesses.map((r) => r.s),
    buildBoulders(2).recesses.map((r) => r.s),
  );
});

test("the slope is walkable in both directions at normal speed", () => {
  const m = match({ bot: false });
  go(m);
  const p = place(m, "a", 10, -1),
    z = p.z;
  run(m, 2, { forward: 1, sprint: true });
  const climbed = z - p.z;
  assert.ok(Math.abs(climbed - CONFIG.walkSpeed * 2) < 0.05, `${climbed}`);
  // And standing on the floor, up there.
  assert.ok(
    Math.abs(p.y - groundAt(MAPS[m.map], m.party.race.climbers.a.s)) < 0.2,
  );
  const back = p.z;
  p.yaw = Math.PI;
  run(m, 1, { forward: 1, sprint: true });
  assert.ok(Math.abs(p.z - back - CONFIG.walkSpeed) < 0.05, `${p.z - back}`);
});

test("a full-width boulder flattens you in the channel, not in a recess", () => {
  const m = match({ bot: false }),
    map = MAPS[m.map];
  go(m);
  const nook = map.recesses[2];
  // Standing in the open just past it.
  place(m, "a", nook.s + 3, 0);
  place(m, "d", nook.s, nook.x);
  boulder(m, nook.s + 6);
  run(m, 1);
  const c = m.party.race.climbers;
  assert.equal(c.a.hits, 1);
  assert.equal(c.d.hits, 0);
  // Put back in the last recess they passed, held a moment.
  const a = m.players.a;
  assert.ok(Math.abs(a.x - nook.x) < 0.05 && Math.abs(a.z - nook.z) < 0.05);
  assert.ok(a.immobile > 0);
  assert.equal(lastRecess(map, nook.s + 3), nook);
  // Below the first recess, back to the start.
  assert.equal(lastRecess(map, map.recesses[0].s - NOOK), null);
});

test("a half-width boulder only hits its own side", () => {
  const map = buildBoulders(5),
    b = { half: -1, x: -WIDTH / 4, s: 20, r: D.halfRadius },
    at = (x) => ({ x, y: groundAt(map, 20), z: zOf(map, 20) });
  assert.ok(crushes(map, b, at(-1), 20));
  assert.ok(!crushes(map, b, at(1.1), 20));
  const full = { half: 0, x: 0, s: 20, r: D.fullRadius };
  assert.ok(crushes(map, full, at(1.8), 20));
  assert.ok(!crushes(map, full, at(WIDTH / 2 + 0.5), 20));
});

test("boulders roll down faster and faster and break up at the foot", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", -3, -1);
  place(m, "d", -3, 1);
  const b = boulder(m, 40);
  run(m, 1);
  assert.ok(b.v > D.speed && b.s < 40 - D.speed);
  run(m, 5);
  assert.equal(m.party.race.boulders.length, 0);
});

test("the release rhythm lets boulders go, more often later on", () => {
  const m = match({ bot: false });
  go(m);
  m.party.race.next = D.firstAt;
  place(m, "a", -3, -1);
  place(m, "d", -3, 1);
  run(m, 30);
  const early = m.party.race.released;
  assert.ok(early >= 5 && early <= 12, `${early}`);
});

test("first to the top wins; out of time, the higher climb wins", () => {
  let m = match({ bot: false });
  go(m);
  const map = MAPS[m.map];
  place(m, "a", map.finishS - 0.5, 0);
  place(m, "d", 50, 0);
  m.players.a.yaw = 0;
  run(m, 1, { forward: 1 });
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "a");
  assert.ok(m.result.final);
  assert.ok(m.party.scores.a.finished);
  assert.match(partyScore("boulders", m.party.scores.a).text, /Top in/);

  m = match({ bot: false });
  go(m);
  place(m, "a", 30, -1);
  place(m, "d", 60, 1);
  tick(m);
  m.time = 0.01;
  tick(m);
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "d");
  assert.match(partyScore("boulders", m.party.scores.d).text, /Reached 60 m/);
  // Play again: a new channel, straight back to the briefing.
  const before = m.map;
  m.action("a", { type: "restart" });
  assert.notEqual(m.map, before);
  assert.equal(m.phase, "purchase");
});

test("fewer hits breaks a tie in height", () => {
  const a = partyScore("boulders", { finished: false, best: 40, hits: 1 }),
    b = partyScore("boulders", { finished: false, best: 40, hits: 3 }),
    c = partyScore("boulders", { finished: true, time: 80, hits: 9 });
  assert.ok(a.rank < b.rank && c.rank < a.rank);
});

test("the hard bot climbs the channel, hiding as it goes", () => {
  let tops = 0,
    hits = 0;
  for (const seed of [3, 11, 29, 47]) {
    const m = match({ seed, level: "hard" });
    go(m);
    m.party.race.next = D.firstAt;
    // You stand on the start pad, out of it.
    run(m, D.raceSeconds + 1);
    const c = m.party.race.climbers.bot;
    hits += c.hits;
    if (c.done) tops++;
    assert.ok(c.best > 60, `seed ${seed}: ${c.best}`);
  }
  assert.ok(tops >= 2, `${tops} of 4 topped out`);
  assert.ok(hits <= 20, `${hits} hits`);
});

test("Boulder Dash uses normal walking speed and ignores sprint and stance inputs", () => {
  const distanceFor = (extra) => {
    const m = match({ bot: false });
    go(m);
    const p = place(m, "a", 15, -1),
      start = p.z;
    run(m, 1, { forward: 1, ...extra });
    assert.equal(p.crouch, false);
    assert.equal(p.prone, false);
    assert.equal(p.slide, null);
    return start - p.z;
  };
  const normal = distanceFor({});
  assert.ok(Math.abs(normal - CONFIG.walkSpeed) < 0.05, `${normal}`);
  for (const extra of [
    { sprint: true },
    { crouch: true },
    { prone: true },
    { sprint: true, crouch: true, slide: 1 },
  ])
    assert.ok(Math.abs(distanceFor(extra) - normal) < 0.001);
});
