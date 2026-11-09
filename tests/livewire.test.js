import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS } from "../shared/maps.js";
import { PARTY, partyScore } from "../shared/party.js";
import {
  PLAT,
  ARENA,
  PLAT_H,
  HIT_HALF,
  LANE_MAX,
  wireSchedule,
  wireAt,
  wireEnd,
  waveAt,
  waveRules,
  shoveDistance,
  inLane,
  settleLane,
  partnerLane,
  leavesRoom,
} from "../shared/livewire.js";
import { safeSpot } from "../server/livewire.js";
import { parseLaunch } from "../src/launch.js";

const L = PARTY.livewire;
// A Beach Ball Dodge run: you against the bot, or a friend.
function match({ bot = true, level = "hard" } = {}) {
  const m = new Match("LIVE", bot, "soak", true, "docks");
  m.botLevel = level;
  m.setParty("livewire", bot);
  m.addPlayer("a", "attacker");
  if (bot) m.addPlayer("bot", "defender", true);
  else m.addPlayer("d", "defender");
  return m;
}
// Ready up and run to the go; no balls unless a test sends them.
function go(m, { wires = [] } = {}) {
  for (const p of Object.values(m.players))
    if (!p.bot) m.action(p.id, { type: "ready" });
  for (let i = 0; i < 400 && m.phase !== "active"; i++) tick(m);
  assert.equal(m.phase, "active");
  m.party.run.wires = wires;
}
function tick(m, input = {}) {
  for (const p of Object.values(m.players)) if (!p.bot) p.input = { ...input };
  m.tick(1 / 30);
}
function run(m, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 30) && m.phase === "active"; i++)
    tick(m, input);
}
function place(m, id, x, z) {
  const p = m.players[id];
  Object.assign(p, { x, z, y: PLAT_H, vy: 0, grounded: true });
  m.party.run.runners[id].last = { x, z };
  return p;
}
// A ball thrown now (or `after` s from now) along `axis`, going `dir`, down
// `lane` (already settled: not aimed).
const wire = (
  m,
  axis,
  dir,
  { speed = 4, after = 0, id = 1, lane = 0 } = {},
) => {
  const launch = m.party.run.t + after;
  return {
    id,
    axis,
    dir,
    speed,
    lane,
    aim: false,
    at: launch - L.warnSeconds,
    launch,
  };
};

test("a run's balls are the same from the same seed, and differ between seeds", () => {
  assert.deepEqual(wireSchedule(7, 200), wireSchedule(7, 200));
  assert.notDeepEqual(wireSchedule(7, 200), wireSchedule(8, 200));
});

test("the waves bring in the balls one thing at a time, faster each wave", () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    const wires = wireSchedule(seed, 240);
    const inWave = (n) =>
      wires.filter((w) => waveAt(w.launch - L.warnSeconds) === n);
    // Wave 1: up and down the screen only, one at a time.
    for (const w of inWave(1)) assert.equal(w.axis, "z");
    assert.equal(inWave(1)[0].speed, L.waves[0].speed);
    // Speeds only go up.
    for (let i = 1; i < wires.length; i++)
      assert.ok(wires[i].speed >= wires[i - 1].speed - 1e-9);
    // Every ball flies straight along one axis, with its lane on the float.
    for (const w of wires) {
      assert.ok(["x", "z"].includes(w.axis));
      assert.ok(Math.abs(w.dir) === 1);
      assert.ok(Math.abs(w.lane) <= LANE_MAX);
    }
    // The first bot holds its ball up for warnSeconds, two seconds in.
    assert.equal(wires[0].launch - wires[0].at, L.warnSeconds);
    assert.equal(wires[0].at, L.firstAt);
  }
  assert.deepEqual(waveRules(1).axes, ["z"]);
  assert.deepEqual(waveRules(2).axes, ["z", "x"]);
  assert.ok(!waveRules(2).patterns.includes("double"));
  assert.ok(waveRules(3).patterns.includes("double"));
  assert.ok(waveRules(4).patterns.includes("cross"));
  assert.ok(waveRules(5).patterns.includes("triple"));
  assert.equal(waveRules(30).gap, L.minGap);
});

test("never more than three balls over the float at once", () => {
  for (const seed of [1, 5, 77, 1234]) {
    const wires = wireSchedule(seed, 400);
    for (let t = 0; t < 400; t += 0.1) {
      const over = wires.filter((w) => {
        const at = wireAt(w, t);
        return t > w.launch && Math.abs(at) < PLAT;
      });
      assert.ok(over.length <= L.maxLive, `seed ${seed} at ${t.toFixed(1)}`);
    }
  }
});

test("there's always somewhere on the float out of every ball's way", () => {
  for (const seed of [1, 5, 77, 1234]) {
    const wires = wireSchedule(seed, 400);
    // Settle every lane as if both players stood on the worst spots.
    const spots = [
      { x: 0, z: 0 },
      { x: LANE_MAX, z: -LANE_MAX },
    ];
    for (const w of wires) {
      w.lane = settleLane(w, spots, wires);
      w.settled = true;
    }
    for (let t = 0; t < 400; t += 0.1) {
      const over = wires.filter(
        (w) => t > w.at && wireAt(w, t) * w.dir < PLAT + 0.5,
      );
      for (const axis of ["x", "z"])
        assert.ok(
          leavesRoom(over.filter((w) => w.axis === axis).map((w) => w.lane)),
          `seed ${seed} at ${t.toFixed(1)}: nowhere safe`,
        );
    }
  }
});

test("bots aim at the players, a double's second ball beside the first", () => {
  const spots = [
    { x: 1.2, z: -0.5 },
    { x: -2, z: 0.7 },
  ];
  const aimed = { axis: "z", aim: true, target: 0, lane: 0 };
  assert.equal(settleLane(aimed, spots, []), 1.2);
  assert.equal(settleLane({ ...aimed, axis: "x", target: 1 }, spots, []), 0.7);
  // Off the edge, the lane stays on the float.
  assert.equal(
    settleLane(aimed, [{ x: 9, z: 0 }], []),
    LANE_MAX,
  );
  assert.equal(settleLane({ ...aimed, aim: false, lane: -0.4 }, spots, []), -0.4);
  // Partners keep their distance, flipping to the other side at the edge.
  assert.equal(partnerLane(0, 2), 2);
  assert.equal(partnerLane(1.5, 2), -0.5);
  const first = { id: 1, lane: -1 };
  assert.equal(settleLane({ partner: 1, offset: -2.2 }, spots, [first]), 1.2);
  // In a run, the lane is picked as the bot lifts the ball.
  const m = match({ bot: false });
  go(m);
  place(m, "a", 1.3, 0.4);
  place(m, "d", -1.8, -1);
  m.party.run.wires = [
    { ...wire(m, "z", 1, { after: L.warnSeconds + 0.1 }), aim: true, target: 0 },
  ];
  tick(m);
  tick(m);
  tick(m);
  tick(m);
  assert.ok(m.party.run.wires[0].settled);
  assert.equal(m.party.run.wires[0].lane, 1.3);
});

test("before the go both players wait on the platform, standing on it", () => {
  const m = match();
  m.action("a", { type: "ready" });
  for (let i = 0; i < 400 && m.phase !== "active"; i++) {
    tick(m, { forward: 1, sprint: true });
    if (m.phase === "prep") {
      const map = MAPS.crucible;
      for (const p of Object.values(m.players)) {
        assert.equal(p.y, PLAT_H);
        assert.equal(p.x, map.spawns[p.team].x);
      }
    }
  }
  assert.equal(m.map, "crucible");
  assert.equal(m.phase, "active");
  assert.ok(m.party.run.wires.length > 50);
});

test("a ball hits someone standing in its lane: shoved on, stunned", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", 0, 0);
  place(m, "d", 2, 2);
  // Up the screen (−z) from the bottom side, down the middle.
  m.party.run.wires = [wire(m, "z", -1, { speed: 4 })];
  const a = m.players.a;
  let hit = false;
  for (let i = 0; i < 30 * 5 && !hit; i++) {
    tick(m);
    hit = m.party.run.runners.a.trips === 1;
  }
  assert.ok(hit, "hit");
  assert.ok(a.immobile > 0.3, "stunned");
  assert.ok(m.party.run.runners.a.grace > 1, "a moment's grace");
  run(m, L.shoveSeconds + 0.1);
  // Shoved on up the screen, as far as a 4 m/s ball throws you.
  assert.ok(
    Math.abs(a.z + shoveDistance(4)) < 0.25,
    `shoved to ${a.z.toFixed(2)}`,
  );
  assert.ok(Math.abs(a.x) < 0.05);
  // Out of its lane, the other player was missed.
  run(m, 3);
  assert.equal(m.party.run.runners.d.trips, 0);
});

test("standing just out of the lane, the ball misses; jumping doesn't help", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", 0, HIT_HALF + 0.05);
  place(m, "d", 0, -1);
  // Side to side along z = −1: d is in its lane.
  m.party.run.wires = [wire(m, "x", 1, { speed: 4, lane: -1 })];
  for (let i = 0; i < 30 * 5; i++) {
    const eta = (0 - wireAt(m.party.run.wires[0], m.party.run.t)) / 4;
    m.players.d.input = { jump: eta < 0.3 && eta > 0.2 };
    m.players.a.input = {};
    m.tick(1 / 30);
  }
  assert.equal(m.party.run.runners.a.trips, 0);
  assert.equal(m.party.run.runners.d.trips, 1);
  assert.ok(inLane({ axis: "z", lane: 0 }, { x: 0.6, z: 0 }, { x: 0.6, z: 0 }));
  assert.ok(!inLane({ axis: "z", lane: 0 }, { x: 0.8, z: 0 }, { x: 0.8, z: 0 }));
});

test("balls pass through you during your grace", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", 0, 0);
  place(m, "d", -PLAT + 0.5, PLAT - 0.5);
  // A crossing ball, 0.4 s behind the first: it gets to you while you're
  // still stunned (the shove carries you along the first one's lane).
  m.party.run.wires = [
    wire(m, "z", 1, { speed: 4, id: 1 }),
    wire(m, "x", 1, { speed: 4, after: 0.4, id: 2, lane: 0.6 }),
  ];
  run(m, 6);
  assert.equal(m.party.run.runners.a.trips, 1);
});

test("a fast ball throws you further than a slow one", () => {
  assert.equal(shoveDistance(L.waves[0].speed), L.shove);
  assert.ok(shoveDistance(7) > shoveDistance(5));
  // From the middle, a fast late ball puts you off the float.
  assert.ok(shoveDistance(10) > PLAT + 0.32);
});

test("off the edge is the pool water: the run ends and the other player wins", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", PLAT - 0.5, 0);
  place(m, "d", 0, 0);
  // Walk off the east edge.
  for (let i = 0; i < 60 && m.phase === "active"; i++) {
    m.players.a.input = { side: 1 };
    m.players.d.input = {};
    m.players.a.yaw = 0;
    m.tick(1 / 30);
  }
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "d");
  assert.equal(m.result.reason, "Splash! Into the pool");
  assert.ok(m.party.scores.a.fell);
  assert.ok(!m.party.scores.d.fell);
  // No climbing back out.
  assert.ok(m.players.a.y < PLAT_H);
});

test("play again: a fresh run, back on the platform", () => {
  const m = match({ bot: false });
  go(m);
  const seed = m.party.run.seed;
  place(m, "a", PLAT - 0.4, 0);
  place(m, "d", 0, 0);
  for (let i = 0; i < 60 && m.phase === "active"; i++) {
    m.players.a.input = { side: 1 };
    m.players.a.yaw = 0;
    m.players.d.input = {};
    m.tick(1 / 30);
  }
  assert.equal(m.phase, "results");
  m.action("a", { type: "restart" });
  assert.equal(m.phase, "purchase");
  assert.equal(m.map, "crucible");
  go(m);
  assert.notEqual(m.party.run.seed, seed);
  assert.equal(m.players.a.y, PLAT_H);
  assert.equal(m.party.run.runners.a.trips, 0);
  assert.ok(!m.party.run.runners.a.fell);
});

test("a hit at the edge shoves you into the pool water", () => {
  const m = match({ bot: false });
  go(m);
  place(m, "a", 0, -PLAT + 0.6);
  place(m, "d", PLAT - 0.5, PLAT - 0.5);
  // Coming up the screen: it shoves a up, over the edge.
  m.party.run.wires = [wire(m, "z", -1, { speed: 4 })];
  run(m, 8);
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "d");
});

test("in together: fewer trips wins; same trips, a draw", () => {
  const fewer = { fell: true, time: 40, trips: 1 },
    more = { fell: true, time: 40, trips: 3 },
    stayed = { fell: false, time: 40, trips: 9 };
  assert.ok(
    partyScore("livewire", fewer).rank < partyScore("livewire", more).rank,
  );
  // Still on the float beats any fall, however many trips.
  assert.ok(
    partyScore("livewire", stayed).rank < partyScore("livewire", fewer).rank,
  );
  // Falling later beats falling sooner.
  assert.ok(
    partyScore("livewire", { fell: true, time: 50, trips: 5 }).rank <
      partyScore("livewire", fewer).rank,
  );
  assert.equal(partyScore("livewire", more).text, "Splashed at 0:40.0");
  assert.equal(partyScore("livewire", stayed).text, "Stayed dry");

  const m = match({ bot: false });
  go(m);
  place(m, "a", PLAT - 0.4, 0);
  place(m, "d", -PLAT + 0.4, 0);
  for (let i = 0; i < 60 && m.phase === "active"; i++) {
    m.players.a.input = { side: 1 };
    m.players.d.input = { side: -1 };
    m.players.a.yaw = m.players.d.yaw = 0;
    m.tick(1 / 30);
  }
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, null);
});

test("the bot steps out of the balls' way and back to the middle", () => {
  const saved = { ...L.botMiss },
    step = L.botMissStep;
  L.botMiss.hard = 0;
  L.botMissStep = 0;
  try {
    const m = match({ level: "hard" });
    go(m);
    place(m, "a", PLAT - 0.5, PLAT - 0.5);
    place(m, "bot", 0, 0);
    m.party.run.runners.a.grace = 1e9;
    m.party.run.wires = [
      wire(m, "z", 1, { after: 1.2, id: 1, lane: 0 }),
      wire(m, "x", -1, { speed: 5, after: 4, id: 2, lane: 0.3 }),
      // A cross: both at once.
      wire(m, "z", -1, { speed: 6, after: 8, id: 3, lane: -0.4 }),
      wire(m, "x", 1, { speed: 6, after: 8, id: 4, lane: 0.2 }),
    ];
    for (const w of m.party.run.wires) w.at = m.party.run.t;
    run(m, 14);
    m.party.run.runners.a.grace = 1e9;
    assert.equal(m.party.run.runners.bot.trips, 0);
    assert.ok(Math.hypot(m.players.bot.x, m.players.bot.z) < 1.2);
  } finally {
    Object.assign(L.botMiss, saved);
    L.botMissStep = step;
  }
});

test("the bot falls in the end, Easy sooner than Hard", () => {
  const fallsAt = (level) => {
    const times = [];
    for (let k = 0; k < 6; k++) {
      const m = match({ level });
      go(m);
      m.party.run.wires = wireSchedule(100 + k, 600);
      while (m.phase === "active") {
        m.party.run.runners.a.grace = 1e9;
        tick(m);
      }
      assert.ok(m.party.scores.bot.fell, `${level} bot fell`);
      times.push(m.party.scores.bot.time);
    }
    return times.sort((a, b) => a - b)[3];
  };
  const easy = fallsAt("easy"),
    hard = fallsAt("hard");
  assert.ok(
    easy < hard,
    `easy ${easy.toFixed(0)} s, hard ${hard.toFixed(0)} s`,
  );
  assert.ok(easy > 15 && hard < 300, `easy ${easy} hard ${hard}`);
});

test("it's on the menu and the quick start", () => {
  assert.equal(
    parseLaunch("?type=solo&objective=livewire").objective,
    "livewire",
  );
  assert.equal(PARTY.livewire.map, "crucible");
  assert.ok(MAPS.crucible.court, "kept off the map list");
  assert.equal(ARENA, PLAT + L.moat);
  assert.ok(wireEnd({ launch: 0, speed: 2 }) === (ARENA * 2) / 2);
  // A smaller float in the same 13 m pool.
  assert.ok(L.platform < 7);
  assert.equal(ARENA * 2, 13);
});
