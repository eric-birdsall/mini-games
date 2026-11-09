import test from "node:test";
import assert from "node:assert/strict";
import { createMemory, pressMemory, advanceMemory } from "../shared/memory.js";

test("watch phase ignores inputs; each cleared round grows the remembered route", () => {
  const state = createMemory(() => 0);
  assert.equal(pressMemory(state, 0), "ignored");
  for (let round = 1; round <= 7; round++) {
    assert.equal(state.sequence.length, round);
    state.phase = "recall";
    for (let i = 0; i < round; i++) pressMemory(state, 0);
    assert.equal(state.cleared, round);
    assert.equal(state.phase, round === 7 ? "won" : "complete");
    advanceMemory(state, () => 0);
  }
  assert.equal(state.sequence.length, 7);
});
test("mistakes reset progress, keep the route, and use exactly three chances", () => {
  const state = createMemory(() => 0.5);
  const sequence = [...state.sequence];
  for (let lives = 2; lives >= 0; lives--) {
    state.phase = "recall";
    assert.equal(pressMemory(state, 0), lives ? "retry" : "lost");
    assert.equal(state.lives, lives);
    assert.equal(state.cursor, 0);
    assert.deepEqual(state.sequence, sequence);
    assert.equal(state.cleared, 0);
  }
  assert.equal(pressMemory(state, 4), "ignored");
});
test("partial recall does not count as a cleared round", () => {
  const state = createMemory(() => 0);
  state.sequence = [0, 8, 4];
  state.phase = "recall";
  assert.equal(pressMemory(state, 0), "correct");
  assert.equal(pressMemory(state, 8), "correct");
  assert.equal(state.cleared, 0);
  assert.equal(pressMemory(state, 4), "complete");
  assert.equal(state.cleared, 1);
});

test("difficulty sets the available chances and preserves the loss rules", () => {
  for (const [level, chances] of [
    ["easy", 5],
    ["normal", 3],
    ["hard", 2],
  ]) {
    const state = createMemory(() => 0, level);
    assert.equal(state.lives, chances);
    for (let remaining = chances - 1; remaining >= 0; remaining--) {
      state.phase = "recall";
      assert.equal(pressMemory(state, 1), remaining ? "retry" : "lost");
      assert.equal(state.lives, remaining);
    }
  }
});

test("each difficulty generates every round within its firefly count", () => {
  for (const [level, count] of [
    ["easy", 4],
    ["normal", 4],
    ["hard", 4],
  ]) {
    const state = createMemory(() => 0.99999, level);
    assert.equal(state.flies, count);
    assert.deepEqual(state.sequence, [count - 1]);
    for (let round = 1; round < 7; round++) {
      state.phase = "recall";
      for (const fly of state.sequence) pressMemory(state, fly);
      advanceMemory(state, () => 0.99999);
      assert.equal(state.sequence.length, round + 1);
      assert.ok(state.sequence.every((fly) => fly >= 0 && fly < count));
    }
  }
});
