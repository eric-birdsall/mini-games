import test from "node:test";
import assert from "node:assert/strict";
import { createMemory, pressMemory, advanceMemory } from "../shared/memory.js";

test("watch phase ignores inputs; rounds keep growing with no last round", () => {
  const state = createMemory(() => 0);
  assert.equal(pressMemory(state, 0), "ignored");
  for (let round = 1; round <= 30; round++) {
    assert.equal(state.sequence.length, round);
    state.phase = "recall";
    for (let i = 0; i < round; i++) pressMemory(state, 0);
    assert.equal(state.cleared, round);
    assert.equal(state.phase, "complete");
    advanceMemory(state, () => 0);
  }
  assert.equal(state.sequence.length, 31);
});
test("one mistake ends the run, at every difficulty", () => {
  for (const level of ["easy", "normal", "hard"]) {
    const state = createMemory(() => 0.5, level);
    state.phase = "recall";
    assert.equal(pressMemory(state, 0), "lost");
    assert.equal(state.cleared, 0);
    assert.equal(pressMemory(state, 2), "ignored");
  }
});
test("practice mistakes replay the same route instead of ending", () => {
  const state = createMemory(() => 0.5);
  state.practice = true;
  const sequence = [...state.sequence];
  state.phase = "recall";
  assert.equal(pressMemory(state, 0), "retry");
  assert.equal(state.cursor, 0);
  assert.deepEqual(state.sequence, sequence);
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
