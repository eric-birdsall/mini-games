import test from "node:test";
import assert from "node:assert/strict";
import {
  MOVE,
  POND_Y,
  STAGES,
  jumpHeight,
  ledgesAt,
  newRun,
  perchCount,
  reachHeight,
  stageFor,
  stepRun,
} from "../shared/perchHop.js";

const idle = { x: 0, jump: false, jumpPressed: false, down: false };
const steps = (run, stage, input, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 120) stepRun(run, stage, input);
  return run;
};

test("every stage has ten perches inside the yard", () => {
  for (const [level, stage] of Object.entries(STAGES)) {
    assert.equal(perchCount(stage), 10, level);
    for (const l of stage.ledges) {
      assert.ok(l.x - l.w / 2 >= 0 && l.x + l.w / 2 <= stage.width, level);
      assert.ok(l.y > 0 && l.y < stage.height - 1.5, level);
    }
  }
  assert.equal(stageFor("nope"), STAGES.normal);
});

// Can you get from standing surface a to surface b? A conservative jump
// envelope: up to a little under a double jump's height, with less room
// across the higher you have to go. Moving ledges count at whichever of a
// few positions suits best. Springs throw you much higher.
function surfaces(stage) {
  const out = stage.blocks
    .filter((b) => b.top < 20)
    .map((b) => ({ spans: [[b.x0, b.x1, b.top]], spring: false }));
  for (const l of stage.ledges) {
    const spans = [];
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * (l.move?.period || 1);
      const at = ledgesAt(stage, t).find((s) => s.ledge === l);
      spans.push([at.x0, at.x1, at.top]);
    }
    out.push({ spans, spring: !!l.spring, ledge: l });
  }
  return out;
}

function canReach(a, b) {
  const up = a.spring
    ? jumpHeight(MOVE.bounce) + jumpHeight(MOVE.doubleJump)
    : reachHeight();
  for (const [ax0, ax1, ay] of a.spans)
    for (const [bx0, bx1, by] of b.spans) {
      const dy = by - ay;
      const gap = Math.max(0, bx0 - ax1, ax0 - bx1);
      if (dy > up - 0.45) continue;
      const across = dy <= 0 ? 5.5 : dy < up * 0.5 ? 4 : 2.8;
      if (gap <= across) return true;
    }
  return false;
}

test("every perch can be reached from the start", () => {
  for (const [level, stage] of Object.entries(STAGES)) {
    const all = surfaces(stage);
    const [sx, sy] = stage.start;
    const start = all.findIndex((s) =>
      s.spans.some(([x0, x1, y]) => sx >= x0 && sx <= x1 && y === sy),
    );
    assert.ok(start >= 0, level);
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const i = queue.shift();
      all.forEach((s, j) => {
        if (!seen.has(j) && canReach(all[i], s)) {
          seen.add(j);
          queue.push(j);
        }
      });
    }
    all.forEach((s, j) => {
      if (s.ledge?.perch)
        assert.ok(seen.has(j), `${level}: ${s.ledge.look} at ${s.ledge.x}`);
    });
  }
});

test("a jump climbs about its height and a double jump goes higher", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  stepRun(run, stage, { ...idle, jump: true, jumpPressed: true });
  let top = run.y;
  for (let i = 0; i < 120; i++) {
    stepRun(run, stage, { ...idle, jump: true });
    top = Math.max(top, run.y);
  }
  assert.ok(Math.abs(top - 1 - jumpHeight()) < 0.15);
  assert.equal(run.grounded, true);

  const two = newRun(stage);
  stepRun(two, stage, { ...idle, jump: true, jumpPressed: true });
  steps(two, stage, { ...idle, jump: true }, 0.35);
  stepRun(two, stage, { ...idle, jump: true, jumpPressed: true });
  let high = two.y;
  for (let i = 0; i < 160; i++) {
    stepRun(two, stage, { ...idle, jump: true });
    high = Math.max(high, two.y);
  }
  assert.ok(high > top + 1);
});

test("letting go early makes a short hop", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  stepRun(run, stage, { ...idle, jump: true, jumpPressed: true });
  let top = run.y;
  for (let i = 0; i < 120; i++) {
    stepRun(run, stage, idle);
    top = Math.max(top, run.y);
  }
  assert.ok(top - 1 < jumpHeight() * 0.6);
});

test("landing on a perch raises its flag once", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  const table = stage.ledges.findIndex((l) => l.look === "table");
  Object.assign(run, {
    x: stage.ledges[table].x,
    y: 4,
    grounded: false,
    on: null,
  });
  steps(run, stage, idle, 1);
  assert.equal(run.on, table);
  assert.equal(run.boarded[table], true);
  assert.equal(run.count, 1);
  steps(run, stage, { ...idle, jump: true, jumpPressed: true }, 0.01);
  steps(run, stage, idle, 1);
  assert.equal(run.count, 1);
});

test("you can jump up through a ledge and drop back down through it", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  const table = stage.ledges.findIndex((l) => l.look === "table");
  run.x = stage.ledges[table].x;
  stepRun(run, stage, { ...idle, jump: true, jumpPressed: true });
  steps(run, stage, { ...idle, jump: true }, 1.2);
  assert.equal(run.on, table);
  stepRun(run, stage, { ...idle, down: true, downPressed: true });
  steps(run, stage, idle, 1);
  assert.equal(run.on, "block");
  assert.equal(run.y, 1);
});

test("walls stop you and the pond ends the run off Easy", () => {
  const stage = STAGES.normal;
  const run = newRun(stage);
  steps(run, stage, { ...idle, x: -1 }, 1.5);
  assert.ok(run.x >= 0.3 - 1e-9);
  steps(run, stage, { ...idle, x: 1 }, 3);
  assert.equal(run.splashed, true);
  assert.ok(run.y < POND_Y);

  const easy = STAGES.easy;
  const kid = newRun(easy);
  steps(kid, easy, { ...idle, x: 1 }, 2);
  assert.equal(kid.splashed, false);
  assert.ok(kid.splashes >= 1);
});

test("moving ledges carry you and springs bounce you high", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  const pad = stage.ledges.findIndex((l) => l.move);
  const at = ledgesAt(stage, 0)[pad];
  Object.assign(run, {
    x: (at.x0 + at.x1) / 2,
    y: at.top + 0.5,
    grounded: false,
    on: null,
  });
  steps(run, stage, idle, 0.3);
  assert.equal(run.on, pad);
  const x = run.x;
  steps(run, stage, idle, 1);
  assert.notEqual(run.x, x);
  assert.equal(run.on, pad);

  const spring = stage.ledges.findIndex((l) => l.spring);
  const b = newRun(stage);
  Object.assign(b, {
    x: stage.ledges[spring].x,
    y: 2,
    grounded: false,
    on: null,
  });
  let top = 0;
  for (let i = 0; i < 240; i++) {
    stepRun(b, stage, idle);
    top = Math.max(top, b.y);
  }
  assert.ok(top > 1 + jumpHeight() + 1);
});

test("the run is done when every perch is boarded", () => {
  const stage = STAGES.easy;
  const run = newRun(stage);
  run.boarded = stage.ledges.map((l) => !!l.perch);
  const last = stage.ledges.findIndex((l) => l.look === "table");
  run.boarded[last] = false;
  run.count = run.total - 1;
  Object.assign(run, {
    x: stage.ledges[last].x,
    y: 4,
    grounded: false,
    on: null,
  });
  steps(run, stage, idle, 1);
  assert.equal(run.done, true);
});

// The same question with the real controls: from each place you can stand,
// try a spread of run-ups, jumps, double jumps and steering, and see where
// you land. Every perch must turn up.
function hop(stage, from, x, y, t0, dir, runup, second, steer) {
  const run = newRun(stage);
  Object.assign(run, { t: t0, x, y, on: from, grounded: true });
  let t = 0;
  let jumped = -1;
  let doubled = false;
  while (t < 4) {
    const input = { x: 0, jump: false, jumpPressed: false, down: false };
    if (t < runup) input.x = dir;
    else {
      if (jumped < 0) {
        input.jumpPressed = true;
        jumped = t;
      }
      input.jump = true;
      if (second >= 0 && !doubled && t - jumped >= second) {
        input.jumpPressed = true;
        doubled = true;
      }
      input.x = t - jumped < steer ? dir : 0;
    }
    stepRun(run, stage, input);
    t += 1 / 120;
    if (run.splashed) return null;
    if (jumped >= 0 && t - jumped > 0.05 && run.grounded) return run.on;
  }
  return null;
}

test("every perch can be reached with the real controls", () => {
  for (const [level, stage] of Object.entries(STAGES)) {
    const standOn = (from, t0) => {
      if (typeof from === "number") {
        const l = ledgesAt(stage, t0)[from];
        return [l.x0 + 0.1, l.x1 - 0.1, l.top];
      }
      return [from.x0 + 0.35, from.x1 - 0.35, from.top];
    };
    const ground = stage.blocks.filter((b) => b.top < 20);
    const queue = [...ground];
    const reached = new Set();
    while (queue.length) {
      const from = queue.shift();
      const moving = typeof from === "number" && stage.ledges[from].move;
      for (const t0 of moving ? [0, 0.8, 1.6, 2.4] : [0]) {
        const [x0, x1, y] = standOn(from, t0);
        for (let x = x0; x <= x1 + 1e-9; x += 0.5)
          for (const dir of [-1, 0, 1])
            for (const second of [-1, 0.15, 0.3, 0.45])
              for (const steer of [0.2, 0.5, 9]) {
                const on = hop(
                  stage,
                  typeof from === "number" ? from : "block",
                  x,
                  y,
                  t0,
                  dir,
                  0.15,
                  second,
                  steer,
                );
                if (typeof on === "number" && !reached.has(on)) {
                  reached.add(on);
                  queue.push(on);
                }
              }
      }
    }
    stage.ledges.forEach((l, i) => {
      if (l.perch)
        assert.ok(reached.has(i), `${level}: ${l.look} at ${l.x}, ${l.y}`);
    });
  }
});
