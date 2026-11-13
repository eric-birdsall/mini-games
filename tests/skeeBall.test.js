import test from "node:test";
import assert from "node:assert/strict";
import {
  AIM_LIMIT,
  BALL_RADIUS,
  BOARD_LENGTH,
  CORNERS,
  LANE_HALF,
  RINGS,
  RING_CENTER,
  SKEE_LEVELS,
  aimPath,
  meterPower,
  newBall,
  pocketAt,
  predictLanding,
  skeeLevel,
  stepBall,
} from "../shared/skeeBall.js";

function roll(aim, power) {
  const ball = newBall(aim, power);
  const seen = { launched: false, back: false };
  for (let i = 0; i < 1200 && ball.phase !== "done"; i++) {
    const events = stepBall(ball, 1 / 60);
    seen.launched ||= events.launched;
    seen.back ||= events.back;
    assert.ok(
      Math.abs(ball.x) <= LANE_HALF + 1e-9,
      "ball stays between the rails",
    );
  }
  assert.equal(ball.phase, "done", "every roll finishes");
  return { ball, ...seen };
}

test("a soft roll comes back down the lane without scoring", () => {
  const { ball, back, launched } = roll(0, 0);
  assert.ok(back);
  assert.ok(!launched);
  assert.equal(ball.pocket, null);
  assert.equal(predictLanding(0, 0), null);
});

test("harder rolls land further up the board", () => {
  let last = -Infinity;
  for (let power = 0.1; power <= 0.8; power += 0.1) {
    const landing = predictLanding(0, power);
    assert.ok(landing, `power ${power.toFixed(1)} reaches the board`);
    assert.ok(landing.u > last, "further with more power");
    assert.ok(landing.u >= 0 && landing.u <= BOARD_LENGTH);
    last = landing.u;
  }
});

test("a straight roll at the right power scores 50", () => {
  const best = [];
  for (let power = 0; power <= 1; power += 0.02) {
    const { ball } = roll(0, power);
    if (ball.pocket?.points === 50) best.push(power);
  }
  assert.ok(best.length >= 3, "the 50 is reachable over a band of power");
  assert.ok(best[0] > 0.2 && best.at(-1) < 0.8, "and it's mid-meter");
});

test("the 100 pockets can be hit by aiming for a corner", () => {
  for (const side of [-1, 1]) {
    let hit = false;
    for (let a = 0.02; a <= AIM_LIMIT && !hit; a += 0.005)
      for (let power = 0.6; power <= 1 && !hit; power += 0.02)
        hit = roll(side * a, power).ball.pocket?.points === 100;
    assert.ok(hit, `the ${side < 0 ? "right" : "left"} 100 can be reached`);
  }
});

test("the landing guide matches where the ball lands", () => {
  for (const [aim, power] of [
    [0, 0.45],
    [0.03, 0.6],
    [-0.05, 0.3],
  ]) {
    const guess = predictLanding(aim, power);
    const { ball } = roll(aim, power);
    assert.ok(Math.abs(guess.x - ball.landing.x) < 1e-9);
    assert.ok(Math.abs(guess.u - ball.landing.u) < 1e-9);
  }
});

test("pockets score by ring, and banked balls skip the 100s", () => {
  const { x, u } = RING_CENTER;
  assert.equal(pocketAt(x, u).points, 50);
  let inner = 0;
  for (const ring of RINGS) {
    const mid = (inner + ring.radius) / 2;
    assert.equal(pocketAt(x, u + mid).points, ring.points);
    inner = ring.radius;
  }
  for (const corner of CORNERS) {
    assert.equal(pocketAt(corner.x, corner.u).points, 100);
    assert.notEqual(pocketAt(corner.x, corner.u, true).points, 100);
  }
  assert.equal(pocketAt(LANE_HALF - BALL_RADIUS, 0.02).points, 0);
});

test("the power meter swings up and back", () => {
  assert.equal(meterPower(0, 2), 0);
  assert.equal(meterPower(1, 2), 1);
  assert.ok(Math.abs(meterPower(0.5, 2) - 0.5) < 1e-9);
  assert.ok(meterPower(2, 2) < 1e-9);
});

test("levels", () => {
  assert.equal(skeeLevel("nope"), SKEE_LEVELS.normal);
  assert.ok(SKEE_LEVELS.easy.guide);
  assert.ok(!SKEE_LEVELS.hard.guide);
  assert.ok(SKEE_LEVELS.hard.meterPeriod < SKEE_LEVELS.easy.meterPeriod);
});

test("the aim line follows the ball", () => {
  for (const aim of [0, 0.03, -0.05, AIM_LIMIT]) {
    const { lane, board } = aimPath(aim);
    const ball = newBall(aim, 0.5);
    // Up the lane, the ball passes through every dot.
    for (const dot of lane) {
      while (ball.phase === "lane" && ball.s < dot.s) stepBall(ball, 1 / 240);
      if (ball.phase !== "lane") break;
      assert.ok(Math.abs(ball.x - dot.x) < 0.01, `lane dot at s=${dot.s}`);
    }
    // And it lands on the board line.
    const landing = predictLanding(aim, 0.5);
    const near = board.reduce((a, b) =>
      Math.abs(b.u - landing.u) < Math.abs(a.u - landing.u) ? b : a,
    );
    const at = board.findIndex((d) => d === near);
    const other = board[Math.min(board.length - 1, at + 1)];
    const slope = (other.x - near.x) / (other.u - near.u || 1);
    const x = near.x + slope * (landing.u - near.u);
    assert.ok(Math.abs(x - landing.x) < 0.02, `board line at aim ${aim}`);
  }
});
