import test from "node:test";
import assert from "node:assert/strict";
import {
  BLADE_Y,
  MISS,
  NOODLE_LENGTH,
  NOODLE_LEVELS,
  PERFECT,
  POINT_STEP,
  ROUNDS,
  TOO_HIGH,
  botSwing,
  cutAt,
  lastChance,
  noodleBottom,
  roundPlan,
  scoreCut,
  scoreSwing,
  timeAtBlade,
  winners,
} from "../shared/poolNoodle.js";

const round = {
  round: 0,
  release: 2,
  stripe: 0.7,
  width: 0.12,
  gravity: 3,
};

test("a game has five rounds with the stripe somewhere on the noodle", () => {
  for (const level of Object.keys(NOODLE_LEVELS))
    for (let seed = 1; seed < 30; seed++) {
      const plan = roundPlan(level, seed);
      assert.equal(plan.length, ROUNDS);
      for (const r of plan) {
        assert.ok(r.release >= 1.6 && r.release <= 3);
        assert.ok(r.stripe - r.width / 2 > 0.2);
        assert.ok(r.stripe + r.width / 2 < NOODLE_LENGTH - 0.2);
      }
    }
  assert.deepEqual(roundPlan("normal", 7), roundPlan("normal", 7));
});

test("the noodle hangs until release, then falls faster and faster", () => {
  const start = noodleBottom(round, 0);
  assert.equal(noodleBottom(round, 1.9), start);
  const a = start - noodleBottom(round, 2.2);
  const b = noodleBottom(round, 2.2) - noodleBottom(round, 2.4);
  assert.ok(a > 0 && b > a);
});

test("timeAtBlade puts that part of the noodle level with the blade", () => {
  for (const h of [0, 0.3, 0.7, NOODLE_LENGTH]) {
    const t = timeAtBlade(round, h);
    assert.ok(Math.abs(BLADE_Y - noodleBottom(round, t) - h) < 1e-9);
    assert.ok(Math.abs(cutAt(round, t) - h) < 1e-9);
  }
});

test("swinging before the noodle arrives or after it has passed misses", () => {
  assert.equal(cutAt(round, null), null);
  assert.equal(cutAt(round, 1), null);
  assert.equal(cutAt(round, timeAtBlade(round, 0) - 0.01), null);
  assert.equal(cutAt(round, lastChance(round) + 0.01), null);
  assert.deepEqual(scoreSwing(round, null), {
    kind: "miss",
    points: MISS,
    off: null,
  });
});

test("cutting through the stripe is perfect", () => {
  for (const h of [0.7, 0.65, 0.75, 0.641, 0.759])
    assert.equal(scoreCut(round, h).points, PERFECT);
  assert.equal(scoreSwing(round, timeAtBlade(round, 0.7)).kind, "perfect");
});

test("below the stripe loses a point every few centimetres, never below 1", () => {
  const edge = round.stripe - round.width / 2;
  assert.equal(scoreCut(round, edge - 0.001).points, 19);
  assert.equal(scoreCut(round, edge - POINT_STEP - 0.001).points, 18);
  assert.equal(scoreCut(round, edge - 3 * POINT_STEP - 0.001).points, 16);
  assert.equal(scoreCut(round, 0).points, 7);
  const long = { ...round, stripe: 1.3 };
  assert.equal(scoreCut(long, 0.01).points, 1);
  let last = PERFECT;
  for (let h = edge; h >= 0; h -= 0.01) {
    const { points, kind } = scoreCut(round, h);
    assert.ok(points <= last && points >= 1);
    if (h < edge - 0.001) assert.equal(kind, "low");
    last = points;
  }
});

test("above the stripe costs points, and a miss costs more", () => {
  assert.deepEqual(
    { ...scoreCut(round, 0.8), off: 0 },
    { kind: "high", points: TOO_HIGH, off: 0 },
  );
  assert.equal(scoreCut(round, NOODLE_LENGTH).points, TOO_HIGH);
  assert.ok(MISS < TOO_HIGH && TOO_HIGH < 0);
});

test("computer neighbours swing near the stripe, better on harder levels", () => {
  const average = (level) => {
    let total = 0;
    let n = 0;
    for (let seed = 1; seed < 60; seed++)
      for (const r of roundPlan(level, seed))
        for (let who = 1; who < 4; who++) {
          total += scoreSwing(r, botSwing(r, level, seed, who)).points;
          n++;
        }
    return total / n;
  };
  const easy = average("easy");
  const normal = average("normal");
  const hard = average("hard");
  assert.ok(easy > 0, `easy ${easy}`);
  assert.ok(hard > normal && normal > easy, `${easy} ${normal} ${hard}`);
  assert.ok(hard < PERFECT);
  const r = roundPlan("normal", 3)[0];
  assert.equal(botSwing(r, "normal", 3, 1), botSwing(r, "normal", 3, 1));
  assert.notEqual(botSwing(r, "normal", 3, 1), botSwing(r, "normal", 3, 2));
});

test("winners lists everyone tied for the top total", () => {
  assert.deepEqual(winners([40, 72, 10, 5]), [1]);
  assert.deepEqual(winners([-5, 30, 30, 0]), [1, 2]);
});
