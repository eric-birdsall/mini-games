import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS } from "../shared/maps.js";
import { WALLS, overlapsFootprint } from "../shared/map.js";
import { PARTY, partyScore } from "../shared/party.js";
import { breakoutView } from "../server/breakout.js";
import {
  HALF,
  HURDLE_H,
  LANE,
  TALL_H,
  buildBreakout,
  breakoutMapId,
  ensureBreakoutMap,
  laneX,
  pathAt,
  progressOf,
} from "../shared/breakout.js";

const B = PARTY.breakout;
// A Breakout game on a given course: you run first (or watch the bot).
function match({ seed = 7, bot = false, watch = false, level = "hard" } = {}) {
  const m = new Match("BRKT", bot || watch, "soak", true, "docks");
  m.botLevel = level;
  m.setParty("breakout", bot || watch);
  m.map = breakoutMapId(seed);
  ensureBreakoutMap(m.map);
  m.useLevel();
  if (watch) {
    m.addPlayer("d", "defender");
    m.addPlayer("bot", "attacker", true);
  } else {
    m.addPlayer("a", "attacker");
    if (bot) m.addPlayer("bot", "defender", true);
    else m.addPlayer("d", "defender");
  }
  return m;
}
function go(m) {
  for (const p of Object.values(m.players))
    if (!p.bot) m.action(p.id, { type: "ready" });
  for (let i = 0; i < 300 && m.phase !== "active"; i++) tick(m);
  assert.equal(m.phase, "active");
}
function tick(m, input = {}) {
  for (const p of Object.values(m.players)) if (!p.bot) p.input = { ...input };
  m.tick(1 / 30);
}
function run(m, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 30) && m.phase === "active"; i++)
    tick(m, input);
}
// Put the runner on the path, `s` m along it, facing the way.
function place(m, s) {
  const p = m.players.a,
    at = pathAt(MAPS[m.map].path, s);
  Object.assign(p, { x: at.x, z: at.z, y: 0, vy: 0, yaw: at.yaw, pitch: 0 });
  return p;
}

test("a course is the same from the same seed: one long hall of hurdles", () => {
  for (const seed of [1, 2, 3, 42, 999, 123456]) {
    const a = buildBreakout(seed),
      b = buildBreakout(seed);
    assert.deepEqual(
      a.walls.map((w) => [w.x, w.z, w.w, w.d]),
      b.walls.map((w) => [w.x, w.z, w.w, w.d]),
    );
    assert.equal(a.finishS - a.startS, B.length);
    // Straight north, and only hurdles, each across one or two lanes
    // (never all three), some low and some tall.
    assert.equal(a.path.points.length, 2);
    assert.equal(a.path.points[0].x, a.path.points[1].x);
    assert.ok(a.hazards.length > 50);
    for (const h of a.hazards) assert.equal(h.type, "hurdle");
    const hurdles = a.walls.filter((w) => w.breakout);
    assert.equal(hurdles.length, a.hazards.length);
    for (const [i, w] of hurdles.entries()) {
      const h = a.hazards[i];
      assert.ok(h.lanes.length === 1 || h.lanes.length === 2);
      assert.ok(w.w < HALF * 2 - 0.1, "never all three lanes");
      assert.equal(w.h, h.tall ? TALL_H : HURDLE_H);
      // The lanes it covers are exactly the lanes it's listed in.
      for (const lane of [-1, 0, 1])
        assert.equal(
          Math.abs(laneX(lane) - w.x) < w.w / 2,
          h.lanes.includes(lane),
        );
    }
    assert.ok(a.hazards.some((h) => h.tall));
    assert.ok(a.hazards.some((h) => !h.tall));
    assert.ok(a.hazards.slice(0, B.lowFirst).every((h) => !h.tall));
    for (let i = 1; i < a.hazards.length; i++)
      assert.ok(a.hazards[i].s - a.hazards[i - 1].s >= B.hurdleGapEnd[0] - 0.1);
    assert.ok(a.hazards[0].s >= a.startS + B.firstHurdle);
    assert.ok(a.hazards.at(-1).s < a.finishS);
  }
  assert.notDeepEqual(
    buildBreakout(1).hazards.map((h) => h.s),
    buildBreakout(2).hazards.map((h) => h.s),
  );
});

test("every lane is open all the way along, bar the hurdles", () => {
  for (const seed of [1, 5, 77, 2024]) {
    const map = buildBreakout(seed);
    for (const lane of [-1, 0, 1])
      for (let s = 1; s < map.path.length - 1; s += 0.5) {
        const at = pathAt(map.path, s),
          blocked = map.walls.filter(
            (w) => !w.breakout && overlapsFootprint(w, laneX(lane), at.z, 0.32),
          );
        assert.equal(blocked.length, 0, `seed ${seed} lane ${lane} at ${s} m`);
        assert.ok(Math.abs(progressOf(map.path, at) - s) < 0.01);
      }
  }
});

test("auto run: with no input at all the runner sprints up the hall", () => {
  const m = match();
  go(m);
  const p = m.players.a,
    from = m.party.run.s;
  // No hurdles in the way for this one.
  m.party.run.hazards = [];
  assert.equal(m.time, B.runSeconds);
  run(m, 1);
  assert.ok(m.party.run.s - from > 4.5, `${m.party.run.s - from}`);
  assert.equal(p.x, 0);
  // Pushing back, crouching or sliding changes nothing.
  const at = m.party.run.s;
  run(m, 1, { forward: -1, crouch: true, slide: 3 });
  assert.ok(m.party.run.s - at > 4.5);
  assert.ok(!p.crouch && !p.slide);
});

test("the runner covers more ground each second as the run goes on", () => {
  const m = match();
  go(m);
  m.party.run.hazards = [];
  const start = m.party.run.s;
  run(m, 0.3);
  const early = m.party.run.s - start;
  run(m, 30);
  // Measure over the same stretch of clear ground at the later speed.
  place(m, start);
  run(m, 0.3);
  assert.ok(m.party.run.s - start > early * 3);
  assert.equal(m.phase, "active");
});

test("late-run speed cannot skip logs or get stuck against hay bales", () => {
  for (const tall of [false, true]) {
    const m = match();
    go(m);
    m.activeTime = 80;
    const h = m.party.run.hazards.find((h) => h.tall === tall);
    place(m, h.s - 0.7);
    only(m, h);
    run(m, 0.2);
    assert.equal(m.phase, "results");
    assert.equal(m.party.scores.a.tripped, true);
  }
});

test("left and right step one lane at a time, and stop at the edges", () => {
  const m = match();
  go(m);
  const p = m.players.a;
  m.party.run.hazards = [];
  run(m, 0.1, { side: 1 });
  run(m, 0.4);
  assert.equal(p.lane, 1);
  assert.ok(Math.abs(p.x - LANE) < 1e-6, `${p.x}`);
  // Holding it down is still one lane; there's no fourth.
  run(m, 0.5, { side: 1 });
  run(m, 0.3);
  assert.equal(p.lane, 1);
  run(m, 0.1, { side: -1 });
  run(m, 0.1);
  run(m, 0.1, { side: -1 });
  run(m, 0.5);
  assert.equal(p.lane, -1);
  assert.ok(Math.abs(p.x + LANE) < 1e-6, `${p.x}`);
});

test("the watcher stays in the booth, and the runner waits for the go", () => {
  const m = match();
  m.action("a", { type: "ready" });
  m.action("d", { type: "ready" });
  const booth = { ...MAPS[m.map].spawns.defender };
  tick(m, { forward: 1, sprint: true });
  assert.equal(m.phase, "prep");
  assert.equal(m.players.a.z, MAPS[m.map].spawns.attacker.z);
  for (let i = 0; i < 120 && m.phase !== "active"; i++) tick(m);
  run(m, 1);
  assert.deepEqual(
    { x: m.players.d.x, z: m.players.d.z },
    { x: booth.x, z: booth.z },
  );
  assert.ok(m.party.run.s > MAPS[m.map].startS + 3);
});

// Line the runner up in one of a hurdle's lanes, with only that hurdle on
// the course.
function only(m, h, lane = h.lanes[0]) {
  m.party.run.hazards = [h];
  const p = m.players.a;
  p.lane = lane;
  p.x = laneX(lane);
  return p;
}

test("a hurdle: jump it and you're clear; run into it and the run is over", () => {
  for (const jump of [true, false]) {
    const m = match({ seed: 11 });
    go(m);
    const h = m.party.run.hazards[0];
    only(m, h);
    // Auto run to 1.4 m short of it, then a running jump (or not).
    while (m.party.run.s < h.s - 1.4) tick(m);
    run(m, 0.1, { jump });
    run(m, 1);
    if (jump) {
      assert.equal(m.phase, "active");
      assert.ok(m.party.run.s > h.s + 4, "over it");
      assert.equal(breakoutView(m).run.cleared, 1);
    } else {
      assert.equal(m.phase, "results");
      assert.equal(m.result.reason, "Tripped on a log");
      const sc = m.party.scores.a;
      assert.equal(sc.tripped, true);
      assert.equal(sc.finished, false);
      assert.ok(Math.abs(sc.distance - (h.s - MAPS[m.map].startS)) < 1);
      assert.equal(
        partyScore("breakout", sc).text,
        `Ran ${Math.round(sc.distance)} m`,
      );
    }
  }
});

test("the hurdles are low enough to clear with a jump from anywhere close", () => {
  // Every take-off point from 1.4 m to 2.8 m out clears it (a jump from
  // the hurdle's foot can't get up in time).
  for (let d = 1.4; d <= 2.81; d += 0.2) {
    const m = match({ seed: 11 });
    go(m);
    const h = m.party.run.hazards[0];
    only(m, h);
    while (m.phase === "active" && m.party.run.s < h.s - d) tick(m);
    run(m, 0.1, { jump: true });
    run(m, 1);
    assert.equal(m.phase, "active", `from ${d.toFixed(1)} m`);
  }
});

test("a tall hurdle can't be jumped; an open lane beside it is clear", () => {
  for (const jump of [true, false]) {
    const m = match({ seed: 11 });
    go(m);
    const h = MAPS[m.map].hazards.find((x) => x.tall);
    place(m, h.s - 6);
    only(m, h);
    while (m.party.run.s < h.s - 1.8) tick(m);
    run(m, 0.1, { jump });
    run(m, 1.5);
    assert.equal(m.phase, "results", jump ? "jumped" : "ran");
    assert.equal(m.result.reason, "Bumped into the hay bales");
  }
  // In a lane it doesn't cover, you run straight past.
  const m = match({ seed: 11 });
  go(m);
  const h = MAPS[m.map].hazards.find((x) => x.tall),
    open = [-1, 0, 1].find((l) => !h.lanes.includes(l));
  place(m, h.s - 6);
  only(m, h, open);
  run(m, 2.5);
  assert.equal(m.phase, "active");
  assert.ok(m.party.run.s > h.s + 4);
});

test("sliding across into a hurdle beside you trips you too", () => {
  const m = match({ seed: 11 });
  go(m);
  const h = MAPS[m.map].hazards.find((x) => x.tall && x.lanes.length === 1),
    lane = h.lanes[0],
    from = lane === 1 ? 0 : lane + 1;
  place(m, h.s - 0.3);
  only(m, h, from);
  run(m, 0.1, { side: Math.sign(lane - from) });
  run(m, 0.5);
  assert.equal(m.phase, "results");
});

test("one run: going further is better, and the hall's end is a backstop", () => {
  const m = match({ seed: 3 });
  go(m);
  const map = MAPS[m.map];
  m.party.run.hazards = [];
  place(m, map.finishS - 1.5);
  run(m, 1);
  assert.equal(m.phase, "results");
  assert.equal(m.result.reason, "Ran the whole hall");
  assert.equal(m.result.final, true);
  const sc = m.party.scores.a;
  assert.equal(sc.finished, true);
  const tripped = { finished: false, tripped: true, distance: 240, time: 60 };
  assert.equal(partyScore("breakout", tripped).text, "Ran 240 m");
  assert.ok(
    partyScore("breakout", sc).rank < partyScore("breakout", tripped).rank,
  );
  assert.ok(
    partyScore("breakout", tripped).rank <
      partyScore("breakout", { ...tripped, distance: 100 }).rank,
  );
});

test("no second half: the run is final, and again is a fresh course", () => {
  const m = match();
  const course = m.map;
  go(m);
  // Into a hurdle: tripped, and that's the game.
  m.party.run.hazards = [MAPS[m.map].hazards[0]];
  only(m, m.party.run.hazards[0]);
  run(m, 6);
  assert.equal(m.phase, "results");
  assert.equal(m.result.half, 1);
  assert.equal(m.result.final, true);
  m.action("a", { type: "restart" });
  assert.equal(m.party.half, 1);
  assert.notEqual(m.map, course);
  assert.ok(MAPS[m.map]?.breakout);
  // You run again; nobody swaps in to chase or run instead.
  assert.equal(m.players.a.team, "attacker");
  assert.equal(m.players.d.team, "defender");
});

test("the bot runs the course: on Hard it gets a good way along", () => {
  let best = 0;
  for (const seed of [5, 6, 7]) {
    const m = match({ seed, watch: true, level: "hard" });
    m.action("d", { type: "ready" });
    for (let i = 0; i < 300 && m.phase !== "active"; i++) tick(m);
    run(m, 120);
    best = Math.max(
      best,
      m.party.scores.bot?.distance ?? m.party.run.best - MAPS[m.map].startS,
    );
  }
  assert.ok(best > 150, `${best}`);
});

test("walls stay put: the active course's walls are its own", () => {
  const m = match({ seed: 9 });
  m.useLevel();
  assert.equal(WALLS.length, MAPS[m.map].walls.length);
});
