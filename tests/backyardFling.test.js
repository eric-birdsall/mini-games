import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIVE,
  FLING_LEVELS,
  RAMP_END,
  RAMP_HALF_WIDTH,
  RAMP_START,
  STAGES,
  STAGES_PER_ROUND,
  TRACK_LENGTH,
  TRACK_WIDTH,
  TABLE,
  blocksDown,
  blocksIn,
  clearRun,
  structuresIn,
  structuresLeft,
  surfaceY,
  createYard,
  flingLevel,
  landingSpot,
  newRun,
  rampHalfWidth,
  rampY,
  settled,
  stepRun,
  steerLimit,
  trackPoint,
} from "../shared/backyardFling.js";

const DT = 1 / 60;

// Drive one car, steering toward aimX on the ramp the way a player would.
function drive(stage, aimX, throttle = 0, limit = 30) {
  const yard = createYard(stage);
  const run = newRun();
  let t = 0;
  let driveTime = 0;
  let predicted = null;
  let landed = null;
  while (!settled(yard, run) && t < limit) {
    const steer =
      run.phase === "drive"
        ? Math.max(-1, Math.min(1, (aimX - run.x) * 1.5))
        : 0;
    stepRun(yard, run, DT, { steer, throttle });
    t += DT;
    if (run.phase === "drive") {
      driveTime += DT;
      if (run.z > RAMP_END - 1) predicted ??= landingSpot(run);
    }
    if (
      run.phase === "air" &&
      !landed &&
      run.flight > 0.2 &&
      run.y < surfaceY(run.x, run.z) + 0.6
    )
      landed = { x: run.x, z: run.z };
  }
  return { yard, run, t, driveTime, predicted, landed };
}

test("every yard has two or three block structures on the picnic table", () => {
  assert.ok(STAGES.length >= STAGES_PER_ROUND);
  for (let s = 0; s < STAGES.length; s++) {
    const n = structuresIn(s);
    assert.ok(n >= 2 && n <= 3, `yard ${s} has ${n} structures`);
    for (const p of STAGES[s].pieces) {
      assert.equal(p.kind, "block");
      assert.ok(Math.abs(p.x - TABLE.x) + p.w / 2 < TABLE.halfWidth);
      assert.ok(p.z - p.d / 2 > TABLE.near && p.z + p.d / 2 < TABLE.far);
      assert.ok(p.y - p.h / 2 >= TABLE.top - 1e-9);
    }
  }
});

test("the car comes down over the table when it flies straight", () => {
  for (const throttle of [-1, 0, 1]) {
    const { landed } = drive(0, 0, throttle);
    assert.equal(
      surfaceY(landed.x, landed.z),
      TABLE.top,
      JSON.stringify(landed),
    );
  }
});

test("easier levels get more cars; Hard hides the landing ring", () => {
  const { easy, normal, hard } = FLING_LEVELS;
  assert.ok(easy.cars > normal.cars && normal.cars > hard.cars);
  assert.equal(hard.marker, false);
  assert.equal(flingLevel("nope"), normal);
});

test("the track runs into the ramp, which flares out and rises to a lip", () => {
  const end = trackPoint(TRACK_LENGTH);
  assert.equal(end.z, RAMP_START);
  assert.ok(Math.abs(rampY(RAMP_START) - end.y) < 1e-9);
  assert.ok(Math.abs(rampHalfWidth(RAMP_START) - TRACK_WIDTH / 2) < 1e-9);
  assert.equal(rampHalfWidth(RAMP_END), RAMP_HALF_WIDTH);
  for (let z = RAMP_START; z < RAMP_END; z += 0.5)
    assert.ok(rampY(z + 0.5) >= rampY(z));
  assert.ok(rampY(RAMP_END) > rampY(RAMP_START) + 1);
});

test("the car rides the track by itself, then you steer on the ramp for a few seconds", () => {
  for (const aim of [-4, 0, 4]) {
    const { driveTime, run } = drive(0, aim);
    assert.ok(driveTime > 2 && driveTime < 4.5, `drove ${driveTime}s`);
    assert.ok(run.phase === "air" || run.phase === "done");
  }
  // Steering moves the car across, up to the rails.
  const left = drive(0, 10).landed;
  const right = drive(0, -10).landed;
  assert.ok(left.x > 2.5 && right.x < -2.5);
  assert.ok(left.x > right.x);
});

test("the car never leaves the ramp sideways", () => {
  const yard = createYard(0);
  const run = newRun();
  while (run.phase !== "air") {
    stepRun(yard, run, DT, { steer: run.z < 0 ? 1 : -1 });
    if (run.phase === "drive")
      assert.ok(Math.abs(run.x) <= steerLimit(run.z) + 1e-9);
  }
});

test("faster on the ramp flies further", () => {
  const slow = drive(0, 0, -1).landed.z;
  const normal = drive(0, 0, 0).landed.z;
  const fast = drive(0, 0, 1).landed.z;
  assert.ok(slow < normal && normal < fast, `${slow} ${normal} ${fast}`);
  assert.ok(DRIVE.slow < DRIVE.cruise && DRIVE.cruise < DRIVE.fast);
});

test("the landing ring shows where the car comes down", () => {
  for (const [aim, throttle] of [
    [0, 0],
    [2, 1],
    [-3, -1],
  ]) {
    const { predicted, landed } = drive(0, aim, throttle);
    assert.ok(
      Math.hypot(predicted.x - landed.x, predicted.z - landed.z) < 1.2,
      `predicted ${JSON.stringify(predicted)}, landed ${JSON.stringify(landed)}`,
    );
  }
});

test("the stacks stand still until something hits them", () => {
  for (let s = 0; s < STAGES.length; s++) {
    const yard = createYard(s);
    const idle = { phase: "done" };
    for (let i = 0; i < 600; i++) stepRun(yard, idle, DT);
    assert.equal(blocksDown(yard), 0, `yard ${s} fell over by itself`);
    assert.equal(structuresLeft(yard), structuresIn(s));
    for (const p of yard.pieces) {
      const { x, y, z } = p.body.position;
      assert.ok(Math.hypot(x - p.start.x, y - p.start.y, z - p.start.z) < 0.02);
    }
  }
});

test("steering at the structures knocks them down, and every shot settles soon", () => {
  for (let s = 0; s < STAGES_PER_ROUND; s++) {
    let hits = 0;
    let tries = 0;
    let best = 0;
    const toppled = new Set();
    for (let aim = -3.6; aim <= 3.61; aim += 0.9)
      for (const throttle of [0, 1]) {
        const { yard, t } = drive(s, aim, throttle);
        assert.ok(t < 20, `yard ${s} run took ${t.toFixed(1)}s`);
        const down = blocksDown(yard);
        if (down) hits++;
        best = Math.max(best, down);
        yard.structures.forEach((st, i) => st.down && toppled.add(i));
        tries++;
      }
    assert.ok(best >= 4, `yard ${s}: at best ${best} blocks in one run`);
    assert.ok(hits / tries > 0.4, `yard ${s}: only ${hits}/${tries} hit`);
    assert.equal(toppled.size, structuresIn(s), `yard ${s}: some never fall`);
  }
});

test("a spent car is cleared for the next one", () => {
  const { yard, run } = drive(0, 0);
  clearRun(yard, run);
  assert.equal(run.body, null);
  const next = newRun();
  assert.equal(next.phase, "track");
  stepRun(yard, next, DT);
  assert.equal(next.phase, "track");
});
