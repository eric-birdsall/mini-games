import test from "node:test";
import assert from "node:assert/strict";
import { createToyBox, grabToy, TOY_LEVELS } from "../shared/toyBox.js";

test("all six requested toys can be rescued in order", () => {
  const state = createToyBox();
  for (let i = 0; i < 6; i++) {
    const target = state.toys.find((t) => t.id === state.target);
    assert.equal(
      grabToy(state, target.x, target.y).kind,
      i === 5 ? "complete" : "rescued",
    );
  }
  assert.equal(state.rescued.length, 6);
  assert.equal(state.attempts, 6);
  assert.equal(grabToy(state, 0.5, 0.5).kind, "complete");
  assert.equal(state.attempts, 6);
});
test("misses and incorrect toys remain available without advancing the mission", () => {
  const state = createToyBox();
  assert.equal(grabToy(state, 0, 0).kind, "miss");
  const wrong = state.toys[1];
  assert.equal(grabToy(state, wrong.x, wrong.y).kind, "wrong");
  assert.equal(state.target, 0);
  assert.equal(state.toys.length, 6);
  assert.equal(state.attempts, 2);
});
test("difficulty changes the grab tolerance", () => {
  for (const level of Object.keys(TOY_LEVELS)) {
    const state = createToyBox(() => 0.5, level);
    const target = state.toys[0];
    assert.equal(
      grabToy(state, target.x + 0.07, target.y).kind,
      level === "easy" ? "rescued" : "miss",
    );
  }
});
