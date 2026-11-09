import test from "node:test";
import assert from "node:assert/strict";
import {
  CATCHES,
  FISHING_LEVELS,
  catchOdds,
  fishingSummary,
  judgeReel,
  planBite,
  rollCatch,
} from "../shared/pondFishing.js";

test("catch odds add up and favour big fish on long casts", () => {
  for (const d of [0, 0.5, 1]) {
    const odds = catchOdds(d);
    const total = Object.values(odds).reduce((sum, p) => sum + p, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    for (const p of Object.values(odds)) assert.ok(p > 0);
    assert.deepEqual(Object.keys(odds).sort(), Object.keys(CATCHES).sort());
  }
  assert.ok(catchOdds(1).bigFish > catchOdds(0).bigFish);
  assert.ok(catchOdds(1).goldenFish > catchOdds(0).goldenFish);
  assert.ok(catchOdds(1).littleFish < catchOdds(0).littleFish);
});

test("every roll lands on a known catch", () => {
  for (let i = 0; i <= 100; i++)
    assert.ok(CATCHES[rollCatch(0.5, () => i / 100.0001)]);
  assert.equal(
    rollCatch(0, () => 0),
    "littleFish",
  );
  assert.equal(
    rollCatch(0, () => 0.99999),
    "cup",
  );
});

test("bites come after the nibbles and the window follows the level", () => {
  for (const [level, { window, nibbles }] of Object.entries(FISHING_LEVELS)) {
    for (const r of [0, 0.5, 0.999]) {
      const plan = planBite(level, () => r);
      assert.equal(plan.window, window);
      assert.ok(plan.nibbles.length >= nibbles[0]);
      assert.ok(plan.nibbles.length <= nibbles[1]);
      for (const t of plan.nibbles) assert.ok(t < plan.biteAt);
    }
  }
});

test("reeling is early, hooked or late", () => {
  const plan = { nibbles: [1], biteAt: 3, window: 1 };
  assert.equal(judgeReel(plan, 1), "early");
  assert.equal(judgeReel(plan, 3), "hooked");
  assert.equal(judgeReel(plan, 4), "hooked");
  assert.equal(judgeReel(plan, 4.01), "late");
});

test("the summary adds points and picks the best fish", () => {
  const summary = fishingSummary(["littleFish", "boot", "bigFish", "can"]);
  assert.deepEqual(summary, { score: 42, fish: 2, junk: 2, best: "bigFish" });
  assert.equal(fishingSummary(["boot"]).best, null);
});
