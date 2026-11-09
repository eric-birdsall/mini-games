import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  MAX_YAW,
  createPlane,
  nextSetup,
  random,
  simulate,
  stepPlane,
  swipeThrow,
} from "../shared/paperPlane.js";

// Search aim and power for a throw that lands in the basket.
function solve(setup) {
  for (let power = 0; power <= 1; power += 0.01)
    for (let yaw = -MAX_YAW; yaw <= MAX_YAW; yaw += 0.01)
      if (simulate(yaw, power, setup).result === "in") return { yaw, power };
  return null;
}

test("every basket and breeze can be scored on every level", () => {
  for (const level of Object.keys(LEVELS)) {
    const l = LEVELS[level];
    // The corners of each level's range: nearest/farthest, far left/right,
    // strongest breeze each way.
    for (const z of [l.near, l.far])
      for (const x of [-l.side, l.side])
        for (const wind of [-l.wind, l.wind]) {
          const setup = { basket: { x, z: -z, radius: l.radius }, wind };
          assert.ok(solve(setup), `${level} ${x},${z} wind ${wind}`);
        }
  }
});

test("a straight throw at zero wind reports short and long correctly", () => {
  const setup = { basket: { x: 0, z: -6, radius: 0.44 }, wind: 0 };
  assert.equal(simulate(0, 0, setup).result, "short");
  assert.equal(simulate(0, 1, setup).result, "long");
});

test("a breeze carries the plane the way it blows", () => {
  const far = { basket: { x: 0, z: -40, radius: 0.44 }, wind: 0 };
  const still = simulate(0, 0.6, far).plane;
  const right = simulate(0, 0.6, { ...far, wind: 2 }).plane;
  const left = simulate(0, 0.6, { ...far, wind: -2 }).plane;
  assert.ok(Math.abs(still.x) < 1e-9);
  assert.ok(right.x > 0.3 && left.x < -0.3);
});

test("stepping in big or small chunks lands in the same place", () => {
  const setup = { basket: { x: 0.3, z: -6, radius: 0.44 }, wind: 1.3 };
  const a = createPlane(0.05, 0.6);
  const b = createPlane(0.05, 0.6);
  while (!stepPlane(a, setup, 1 / 20));
  while (!stepPlane(b, setup, 1 / 144));
  assert.equal(a.result, b.result);
  assert.ok(Math.abs(a.x - b.x) < 0.05 && Math.abs(a.z - b.z) < 0.05);
});

test("setups stay inside each level's range", () => {
  const rand = random(7);
  for (const level of Object.keys(LEVELS)) {
    const l = LEVELS[level];
    for (let i = 0; i < 200; i++) {
      const { basket, wind } = nextSetup(level, rand);
      assert.ok(-basket.z >= l.near && -basket.z <= l.far);
      assert.ok(Math.abs(basket.x) <= l.side);
      assert.ok(Math.abs(wind) <= l.wind + 1e-9);
    }
  }
});

test("a swipe up aims and sets power; a tap or downward drag does not throw", () => {
  assert.equal(swipeThrow(0, 0, 800), null);
  assert.equal(swipeThrow(0, 200, 800), null);
  const straight = swipeThrow(0, -300, 800);
  assert.equal(straight.yaw, 0);
  assert.ok(straight.power > 0.5 && straight.power < 1);
  assert.ok(swipeThrow(80, -300, 800).yaw > 0);
  assert.equal(swipeThrow(0, -2000, 800).power, 1);
  assert.equal(swipeThrow(-2000, -100, 800).yaw, -MAX_YAW);
});
