import test from "node:test";
import assert from "node:assert/strict";
import {
  racer,
  stepRacer,
  course,
  botInput,
  COURSE_LENGTH,
} from "../shared/slipstream.js";
test("automatic sprint and continuous steering stay within track", () => {
  const r = racer("test");
  for (let i = 0; i < 120; i++) stepRacer(r, { steer: 1 }, 1 / 60, i / 60, []);
  assert.ok(r.z > 19);
  assert.equal(r.x, 5.6);
});
test("course contains only slip n slides and mudpiles", () => {
  assert.deepEqual([...new Set(course().map((item) => item.kind))].sort(), [
    "mud",
    "slide",
  ]);
});
test("mud slows racers, clears boosts, and releases them when they steer out", () => {
  const r = racer("mud");
  const items = [{ id: "mud", kind: "mud", x: 0, z: 4, width: 3, length: 12 }];
  r.boost = 2;
  r.chain = 3;
  for (let i = 0; i < 30; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.ok(r.speed < 5);
  assert.equal(r.boost, 0);
  assert.equal(r.chain, 0);
  assert.equal(r.mudEntries, 1);
  for (let i = 30; i < 90; i++)
    stepRacer(r, { steer: 1 }, 1 / 60, i / 60, items);
  assert.equal(r.mud, false);
  assert.ok(r.speed > 9);
});
test("distinct slip n slides chain; staying on a slide does not add stacks", () => {
  const r = racer("boost");
  const items = [
    { id: "a", kind: "slide", x: 0, z: 2, width: 3, length: 8 },
    { id: "b", kind: "slide", x: 0, z: 12, width: 3, length: 8 },
  ];
  for (let i = 0; i < 20; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.equal(r.chain, 1);
  for (let i = 20; i < 70; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.equal(r.chain, 2);
  assert.ok(r.speed > 15);
});
test("AI completes course and a finished racer remains stopped", () => {
  const items = course(),
    r = racer("bot");
  let elapsed = 0;
  while (r.finish === null && elapsed < 75) {
    stepRacer(r, botInput(r, items, 1), 1 / 120, elapsed, items);
    elapsed += 1 / 120;
  }
  assert.equal(r.z, COURSE_LENGTH);
  assert.ok(r.finish < 75);
  const finish = r.finish;
  stepRacer(r, { steer: 1 }, 1, elapsed, items);
  assert.equal(r.finish, finish);
  assert.equal(r.z, COURSE_LENGTH);
});

test("difficulty produces progressively faster rivals on the complete course", () => {
  const items = course();
  const times = ["easy", "normal", "hard"].map((level) => {
    const r = racer(level);
    let elapsed = 0;
    while (r.finish === null && elapsed < 75) {
      stepRacer(r, botInput(r, items, 1, level), 1 / 120, elapsed, items);
      elapsed += 1 / 120;
    }
    assert.notEqual(r.finish, null);
    return r.finish;
  });
  assert.ok(times[0] > times[1], `${times}`);
  assert.ok(times[1] > times[2], `${times}`);
});
