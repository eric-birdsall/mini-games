import assert from "node:assert/strict";
import test from "node:test";
import {
  BAD_DRAW,
  createDrift,
  drawStick,
  roundResult,
} from "../shared/badDraw.js";
import { BAD_DRAW_WORDS, createWordPicker } from "../shared/badDrawWords.js";

test("drift changes smoothly, varies by seed and stays within the logical ink offset", () => {
  const drift = createDrift(41);
  const points = Array.from({ length: 1201 }, (_, i) =>
    drift(i * BAD_DRAW.sampleMs),
  );
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(
    points.every(({ x, y }) => Math.hypot(x, y) <= BAD_DRAW.amplitude + 1e-9),
  );
  assert.ok(
    points.slice(1).every((point, i) => distance(point, points[i]) < 4),
  );
  assert.ok(points.some((point) => distance(point, points[0]) > 20));
  assert.deepEqual(drift(1250), createDrift(41)(1250));
  assert.notDeepEqual(drift(1250), createDrift(17)(1250));
  assert.notDeepEqual(drift(1250), drift(4250));
});

test("the deadline beats a simultaneous Correct; the score uses remaining time", () => {
  const end = BAD_DRAW.duration;
  assert.deepEqual(roundResult(true, end, 0), {
    success: true,
    remaining: end,
    score: 100,
  });
  assert.equal(roundResult(true, end, 15_000).score, 75);
  assert.equal(roundResult(true, end, 30_000).score, 50);
  assert.equal(roundResult(true, end, end - 1).success, true);
  assert.deepEqual(roundResult(true, end, end), {
    success: false,
    remaining: 0,
    score: 0,
  });
  assert.equal(roundResult(true, end, end + 1).score, 0);
});

test("the controller dead zone ignores stick noise without making diagonals faster", () => {
  assert.deepEqual(drawStick(0.06, 0.06), { x: 0, y: 0 });
  assert.deepEqual(drawStick(1, 0), { x: 1, y: 0 });
  const { x, y } = drawStick(1, 1);
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9);
  assert.equal(x, y);
  assert.ok(drawStick(0.5, 0).x > 0 && drawStick(0.5, 0).x < 0.5);
});

test("the session word bank is deterministic with host randomness and exhausts before repeating", () => {
  const prompts = Object.values(BAD_DRAW_WORDS).flat();
  const bank = new Set(prompts);
  assert.ok(bank.size >= 1000);
  assert.equal(bank.size, prompts.length);
  const make = () => createWordPicker({ random: () => 0.42 });
  const first = make(),
    second = make();
  let previous;
  const count = bank.size;
  for (let i = 0; i < count + 1; i++) {
    const drawer = i % 2;
    const word = first(drawer);
    assert.equal(word, second(drawer));
    assert.notEqual(word, previous);
    if (i < count) assert.ok(bank.delete(word));
    previous = word;
  }
  assert.equal(bank.size, 0);
  assert.equal(createWordPicker({ words: [] })("solo"), "kite");
  const only = createWordPicker({ words: ["owl"] });
  assert.equal(only(1), only(1));
});

test("after exhaustion a drawer gets a word they haven't seen when one is available", () => {
  const pick = createWordPicker({
    words: ["kite", "owl", "frog"],
    random: () => 0,
  });
  assert.equal(pick("a"), "kite");
  assert.equal(pick("b"), "owl");
  assert.equal(pick("b"), "frog");
  assert.equal(pick("a"), "owl");
});
