import test from "node:test";
import assert from "node:assert/strict";
import {
  CEILING,
  FIRST_GAP,
  FLIER_LEVELS,
  GROUND,
  HELI_HALF_H,
  HELI_HALF_W,
  OBSTACLE_HALF,
  START_Y,
  flap,
  gapRange,
  gapsPassed,
  hitAt,
  makeCourse,
  newFlight,
  stepFlight,
} from "../shared/backyardFlier.js";

const DT = 1 / 120;

test("courses are endless, replayable and keep gaps inside the yard", () => {
  for (const level of Object.keys(FLIER_LEVELS)) {
    const { low, high } = gapRange(level);
    const s = FLIER_LEVELS[level];
    const course = makeCourse(level, 42);
    let prev = (low + high) / 2;
    for (let k = 0; k < 400; k++) {
      const g = course.at(k);
      assert.equal(g.x, FIRST_GAP + k * s.spacing);
      assert.ok(g.y >= low - 1e-9 && g.y <= high + 1e-9);
      assert.ok(g.y - g.gap / 2 > GROUND + 1);
      assert.ok(g.y + g.gap / 2 < CEILING - 1);
      assert.ok(g.y - prev <= s.rise + 1e-6);
      assert.ok(prev - g.y <= s.drop + 1e-6);
      prev = g.y;
    }
    const again = makeCourse(level, 42);
    assert.deepEqual(again.at(50), course.at(50));
  }
});

test("harder levels have smaller gaps and scroll faster", () => {
  const { easy, normal, hard } = FLIER_LEVELS;
  assert.ok(easy.gap > normal.gap && normal.gap > hard.gap);
  assert.ok(easy.speed < normal.speed && normal.speed < hard.speed);
});

test("without taps the helicopter falls and crashes on the grass", () => {
  const course = makeCourse("normal", 1);
  const flight = newFlight();
  let t = 0;
  while (!flight.crashed && t < 10) {
    stepFlight(flight, course, DT);
    t += DT;
  }
  assert.equal(flight.crashed, "ground");
  assert.equal(flight.y, GROUND + HELI_HALF_H);
  assert.equal(flight.score, 0);
  assert.ok(t < 2);
});

test("a tap climbs, and the canopy stops the climb without a crash", () => {
  const course = makeCourse("easy", 1);
  const flight = newFlight();
  flap(flight, course);
  stepFlight(flight, course, DT);
  assert.ok(flight.y > START_Y && flight.vy > 0);
  for (let i = 0; i < 200; i++) {
    flap(flight, course);
    stepFlight(flight, course, DT);
  }
  assert.equal(flight.crashed, null);
  assert.ok(flight.y + HELI_HALF_H <= CEILING + 1e-9);
});

test("touching a branch or shrub at a gap crashes; the middle is clear", () => {
  const course = makeCourse("normal", 3);
  const g = course.at(0);
  assert.equal(hitAt(g.y, g.x, course), null);
  assert.equal(hitAt(g.y + g.gap / 2, g.x, course), "branch");
  assert.equal(hitAt(g.y - g.gap / 2, g.x, course), "shrub");
  // Well before the first gap nothing is in the way except the grass.
  assert.equal(hitAt(CEILING - 1, 0, course), null);
  assert.equal(hitAt(GROUND, 0, course), "ground");
});

test("each gap whose middle is passed scores one", () => {
  const course = makeCourse("normal", 1);
  const s = course.level;
  assert.equal(gapsPassed(FIRST_GAP - 0.01, course), 0);
  assert.equal(gapsPassed(FIRST_GAP, course), 1);
  assert.equal(gapsPassed(FIRST_GAP + s.spacing * 3 + 0.1, course), 4);
});

test("a careful flier can thread gap after gap", () => {
  // Tap whenever you're below where you want to be and sinking. (This
  // simple flier overshoots now and then on hard, so it flies easy / normal.)
  for (const level of ["easy", "normal"])
    for (let seed = 1; seed <= 40; seed++) {
      const course = makeCourse(level, seed);
      const flight = newFlight();
      const s = course.level;
      while (!flight.crashed && flight.score < 25) {
        // Line up with the gap ahead; once inside it, lean toward the next.
        const reach = OBSTACLE_HALF + HELI_HALF_W;
        const k = Math.max(0, gapsPassed(flight.distance, course) - 1);
        const here = course.at(k);
        const next = course.at(k + 1);
        let aim;
        if (here.x + reach < flight.distance) aim = next.y - 0.35;
        else if (flight.distance < here.x - reach - 1) aim = here.y - 0.35;
        else
          aim = Math.min(
            here.y + here.gap / 2 - HELI_HALF_H - 1.25,
            Math.max(here.y - here.gap / 2 + HELI_HALF_H + 0.15, next.y - 0.35),
          );
        if (flight.y < aim && flight.vy < 0.5) flap(flight, course);
        stepFlight(flight, course, DT);
        if (flight.distance > FIRST_GAP + s.spacing * 40) break;
      }
      assert.equal(flight.crashed, null, `${level} seed ${seed}`);
      assert.ok(flight.score >= 25);
    }
});

test("every gap on every level leaves time to drop or climb to the next", () => {
  for (const level of Object.keys(FLIER_LEVELS)) {
    const s = FLIER_LEVELS[level];
    // Time between leaving one gap and reaching the next.
    const clear = (s.spacing - 2 * (OBSTACLE_HALF + HELI_HALF_W)) / s.speed;
    assert.ok(clear > 0.7, level);
    // Falling from a hover, and climbing with taps (about 60% of flap speed
    // on average), both cover the biggest move in that time.
    assert.ok(0.5 * s.gravity * clear ** 2 > s.drop * 1.5, level);
    assert.ok(s.flap * 0.6 * clear > s.rise, level);
  }
});
