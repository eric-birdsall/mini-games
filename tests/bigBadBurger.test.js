import test from "node:test";
import assert from "node:assert/strict";
import {
  INGREDIENTS,
  LEVELS,
  createStack,
  drop,
  layer,
  lean,
  milestone,
  nextKind,
  random,
  slideSpeed,
  slideX,
  stackTop,
  topple,
} from "../shared/bigBadBurger.js";

test("a perfectly centred burger never topples, however tall", () => {
  const stack = createStack();
  const rand = random(7);
  let kind = "";
  for (let i = 0; i < 100; i++) {
    kind = nextKind(kind, rand);
    const { fell, perfect } = drop(stack, kind, 0, "normal");
    assert.equal(fell, null);
    assert.ok(perfect);
  }
  assert.equal(stack.length, 101);
});

test("layers sit on top of each other", () => {
  const stack = createStack();
  drop(stack, "patty", 0.1, "normal");
  drop(stack, "cheese", 0.2, "normal");
  assert.equal(stack[1].y, INGREDIENTS.bun.height);
  assert.equal(stack[2].y, INGREDIENTS.bun.height + INGREDIENTS.patty.height);
  assert.equal(stackTop(stack), stack[2].y + INGREDIENTS.cheese.height);
});

test("a drop close to the layer below snaps right on top", () => {
  for (const level of Object.keys(LEVELS)) {
    const stack = createStack();
    const near = drop(stack, "patty", LEVELS[level].perfect * 0.9, level);
    assert.ok(near.perfect);
    assert.equal(stack[1].x, 0);
    const far = drop(stack, "cheese", LEVELS[level].perfect * 2, level);
    assert.ok(!far.perfect);
  }
});

test("missing the burger completely is a miss", () => {
  const stack = createStack();
  const { fell } = drop(stack, "tomato", 1.2, "normal");
  assert.ok(fell?.missed);
  assert.equal(fell.index, 1);
});

test("hanging more than halfway off tips that layer over", () => {
  const stack = createStack();
  // The bun is 1.15 wide, so its right edge is at 0.575.
  assert.equal(drop(stack, "patty", 0.5, "hard").fell, null);
  const s2 = createStack();
  const { fell } = drop(s2, "patty", 0.65, "hard");
  assert.equal(fell.side, 1);
  assert.equal(fell.index, 1);
  assert.ok(!fell.missed);
});

test("a lean can be saved by leaning back the other way", () => {
  // Two pieces each well to the right would topple from the bottom...
  const leaning = createStack();
  drop(leaning, "patty", 0.4, "hard");
  const tipped = drop(leaning, "patty", 0.8, "hard").fell;
  assert.ok(tipped);
  // ...but the second one brought back over the middle keeps it up.
  const saved = createStack();
  drop(saved, "patty", 0.4, "hard");
  assert.equal(drop(saved, "patty", 0.05, "hard").fell, null);
});

test("the stack fails at the lowest layer that can't carry its load", () => {
  const stack = [
    createStack()[0],
    layer("patty", 0.45),
    layer("patty", 0.9),
    layer("patty", 1.3),
  ];
  let y = 0;
  for (const l of stack) {
    l.y = y;
    y += l.height;
  }
  const fell = topple(stack, 0);
  assert.equal(fell.index, 1);
  assert.equal(fell.pivot, 0.575);
});

test("sauce (grip) lets the balance point go a little past the edge", () => {
  const stack = [createStack()[0], layer("patty", 0.6)];
  stack[1].y = stack[0].height;
  assert.ok(topple(stack, 0));
  assert.equal(topple(stack, 0.05), null);
});

test("lean reports how close the burger is to toppling and which way", () => {
  const stack = createStack();
  assert.equal(lean(stack).amount, 0);
  drop(stack, "patty", -0.4, "hard");
  const l = lean(stack);
  assert.equal(l.side, -1);
  assert.ok(l.amount > 0.5 && l.amount <= 1);
});

test("the slide goes edge to edge and back", () => {
  const r = LEVELS.normal.range;
  assert.ok(Math.abs(slideX("normal", -r) + r) < 1e-9);
  assert.ok(Math.abs(slideX("normal", 0)) < 1e-9);
  assert.ok(Math.abs(slideX("normal", r) - r) < 1e-9);
  assert.ok(Math.abs(slideX("normal", 2 * r) - 0) < 1e-9);
  assert.ok(Math.abs(slideX("normal", 3 * r) + r) < 1e-9);
  for (let d = -10; d < 10; d += 0.37)
    assert.ok(Math.abs(slideX("normal", d)) <= r + 1e-9);
});

test("the slide speeds up as the burger grows, up to a cap", () => {
  for (const level of Object.keys(LEVELS)) {
    assert.equal(slideSpeed(level, 1), LEVELS[level].speed);
    assert.ok(slideSpeed(level, 10) > slideSpeed(level, 2));
    assert.equal(slideSpeed(level, 1000), LEVELS[level].top);
  }
});

test("the next ingredient is never the same twice in a row", () => {
  const rand = random(3);
  let kind = "patty";
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const next = nextKind(kind, rand);
    assert.notEqual(next, kind);
    assert.ok(INGREDIENTS[next]);
    seen.add(next);
    kind = next;
  }
  assert.equal(seen.size, 7);
});

test("milestones cheer at 10, 20 and 30 layers", () => {
  assert.match(milestone(10), /BIG/);
  assert.match(milestone(20), /BAD/);
  assert.match(milestone(30), /BIG BAD BURGER/);
  assert.equal(milestone(11), "");
  assert.match(milestone(40), /40/);
});
