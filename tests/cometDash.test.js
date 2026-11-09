import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  PHYSICS,
  createCourse,
  createRunner,
  extend,
  jumpPath,
  reach,
  respawnPoint,
  speedAt,
  step,
  trim,
} from "../shared/cometDash.js";

const DT = 1 / 60;

// A careful player: jumps at the very edge (holding the jump), takes the
// second jump at the top only when the first would come up short, and
// dashes into crystals.
function bot(runner, course) {
  const input = { jump: false, jumpHeld: true, dash: false };
  const here = course.platforms.find(
    (p) => p.x <= runner.x + PHYSICS.width / 2 && p.x + p.w > runner.x,
  );
  const next = course.platforms.find(
    (p) => p.x + p.w > runner.x + PHYSICS.width / 2,
  );
  if (runner.grounded && here) {
    if (runner.x >= here.x + here.w - 0.4 - runner.speed * DT)
      input.jump = true;
  } else if (
    !runner.grounded &&
    !here &&
    next &&
    runner.vy <= 0 &&
    runner.airJumps > 0
  ) {
    const drop = runner.y - next.y;
    const t = drop > 0 ? Math.sqrt((2 * drop) / PHYSICS.gravity) : 0;
    const lands = runner.x + runner.speed * t + PHYSICS.width / 2;
    if (lands < next.x + 0.6) input.jump = true;
  }
  const crystal = course.crystals.find(
    (c) => c.alive && c.x > runner.x && c.x - runner.x < 2.2,
  );
  if (crystal && runner.cooldown <= 0 && !runner.dashUsed) input.dash = true;
  return input;
}

function run(level, seed, distance) {
  const course = createCourse(level, seed);
  const runner = createRunner(0, 0);
  const tally = { smash: 0, sparkle: 0, jumps: 0, airJumps: 0 };
  for (let frame = 0; runner.x < distance && frame < 200000; frame++) {
    extend(course, runner.x + 120);
    trim(course, runner.x - 40);
    const events = step(runner, course, bot(runner, course), DT);
    for (const e of events) {
      if (e.type === "crash" || e.type === "fall")
        return { ...tally, died: e, x: runner.x };
      if (e.type === "smash") tally.smash++;
      if (e.type === "sparkle") tally.sparkle++;
      if (e.type === "jump") tally.jumps++;
      if (e.type === "airJump") tally.airJumps++;
    }
  }
  return { ...tally, died: null, x: runner.x };
}

test("every course can be run without losing a star", () => {
  for (const level of Object.keys(LEVELS))
    for (let seed = 1; seed <= 12; seed++) {
      const result = run(level, seed * 7919, 2500);
      assert.equal(
        result.died,
        null,
        `${level} seed ${seed * 7919}: ${result.died?.what ?? result.died?.type} at ${result.x?.toFixed(1)}`,
      );
      if (level !== "easy") assert.ok(result.smash > 0, `${level} smashes`);
      assert.ok(result.sparkle > 0);
    }
});

test("easy never needs the second jump; harder levels do", () => {
  const easy = run("easy", 99, 2000);
  assert.equal(easy.airJumps, 0);
  const hard = run("hard", 99, 2000);
  assert.ok(hard.airJumps > 0);
});

test("never jumping loses a star at the first gap", () => {
  const course = extend(createCourse("normal", 3), 200);
  const runner = createRunner(0, 0);
  const idle = { jump: false, jumpHeld: false, dash: false };
  let end = null;
  for (let i = 0; i < 2000 && !end; i++)
    end = step(runner, course, idle, DT).find(
      (e) => e.type === "fall" || e.type === "crash",
    );
  assert.ok(end);
  assert.ok(end.x > 33 && end.x < 150, `lost at ${end.x}`);
});

test("running into a crystal crashes unless dashing (or on easy)", () => {
  const make = (level) => {
    const course = createCourse(level, 5);
    course.crystals = [{ x: 6, y: 0, alive: true }];
    course.sparkles = [];
    return course;
  };
  const idle = { jump: false, jumpHeld: false, dash: false };
  const until = (runner, course, input) => {
    for (let i = 0; i < 120; i++) {
      const e = step(runner, course, i === 0 ? input : idle, DT).find((e) =>
        ["crash", "smash", "knock"].includes(e.type),
      );
      if (e) return e.type;
    }
  };
  assert.equal(until(createRunner(0, 0), make("normal"), idle), "crash");
  assert.equal(until(createRunner(0, 0), make("easy"), idle), "knock");
  assert.equal(
    until(createRunner(4.5, 0), make("hard"), { ...idle, dash: true }),
    "smash",
  );
  const blinking = createRunner(0, 0);
  blinking.safe = 5;
  assert.equal(until(blinking, make("normal"), idle), undefined);
});

test("holding the jump goes higher, and the second jump higher still", () => {
  const top = (path) => Math.max(...path.map(([, y]) => y));
  const tap = (() => {
    const course = {
      platforms: [],
      crystals: [],
      sparkles: [],
      level: "normal",
    };
    const r = createRunner(0, 0);
    r.grounded = true;
    let best = 0;
    step(r, course, { jump: true, jumpHeld: false, dash: false }, DT);
    for (let i = 0; i < 60; i++) {
      step(r, course, { jump: false, jumpHeld: false, dash: false }, DT);
      best = Math.max(best, r.y);
    }
    return best;
  })();
  assert.ok(top(jumpPath(10, 1)) > tap + 0.5);
  assert.ok(top(jumpPath(10, 2)) > top(jumpPath(10, 1)) + 1);
  assert.ok(reach(10, 0, 2).far > reach(10, 0, 1).far);
  assert.equal(reach(10, 30, 1), null);
});

test("dashing in the air flies level and gives the second jump back", () => {
  const course = { platforms: [], crystals: [], sparkles: [], level: "normal" };
  const r = createRunner(0, 5);
  r.grounded = false;
  r.offGround = 1;
  r.airJumps = 0;
  r.lastTop = 5;
  step(r, course, { jump: false, jumpHeld: false, dash: true }, DT);
  const y = r.y;
  for (let i = 0; i < 10; i++)
    step(r, course, { jump: false, jumpHeld: false, dash: false }, DT);
  assert.ok(Math.abs(r.y - y) < 0.05);
  assert.equal(r.airJumps, 1);
  assert.ok(r.speed > speedAt("normal", r.x) * 1.5);
  // Only one dash until landing.
  for (let i = 0; i < 40; i++)
    step(r, course, { jump: false, jumpHeld: false, dash: i === 0 }, DT);
  assert.equal(r.dash <= 0, true);
});

test("speed rises with distance and tops out", () => {
  for (const [level, l] of Object.entries(LEVELS)) {
    assert.equal(speedAt(level, 0), l.speed);
    assert.ok(speedAt(level, 500) > l.speed);
    assert.equal(speedAt(level, 1e6), l.top);
  }
});

test("starting again lands on an island with no crystal right ahead", () => {
  const course = extend(createCourse("hard", 11), 600);
  for (const x of [50, 150, 300, 450]) {
    const at = respawnPoint(course, x);
    assert.ok(at.x >= x);
    const p = course.platforms.find((p) => p.x <= at.x && p.x + p.w > at.x);
    assert.ok(p, `on an island at ${at.x}`);
    assert.equal(p.y, at.y);
    assert.ok(
      !course.crystals.some((c) => c.alive && c.x > at.x && c.x < at.x + 10),
    );
  }
});
