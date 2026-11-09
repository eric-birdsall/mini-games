import test from "node:test";
import assert from "node:assert/strict";
import {
  ACORN_RADIUS,
  DROP_LEVELS,
  DROP_Y,
  LEFT,
  HOME_X,
  REACH,
  RETURN_SPEED,
  POTS,
  POT_VALUES,
  RIGHT,
  createAcorn,
  dividers,
  flowersFor,
  canDrop,
  clampWalk,
  walk,
  walkToward,
  pegLayout,
  potAt,
  potCentre,
  stepAcorn,
} from "../shared/acornDrop.js";

// Drop an acorn at x and run it until it falls into a pot (or time runs out).
function drop(level, x, seed = 1, limit = 20) {
  const pegs = pegLayout(level);
  const acorn = createAcorn(x, seed);
  let events = 0;
  while (acorn.pot === null && acorn.t < limit)
    if (stepAcorn(acorn, pegs, level, 1 / 60) === "pot") events++;
  return { acorn, events };
}

const sweep = (count = 160) =>
  Array.from({ length: count + 1 }, (_, i) => -REACH + (2 * REACH * i) / count);

test("every pot grows one to five flowers, the middle most, mirrored", () => {
  assert.equal(POT_VALUES.length, POTS);
  for (const value of POT_VALUES) assert.ok(value >= 1 && value <= 5);
  assert.deepEqual(POT_VALUES, [...POT_VALUES].reverse());
  assert.equal(POT_VALUES[(POTS - 1) / 2], 5);
  assert.equal(Math.max(...POT_VALUES), 5);
  for (let n = 1; n <= 5; n++) assert.ok(POT_VALUES.includes(n), `${n} pot`);
});

test("pots split the board evenly", () => {
  assert.equal(potAt(LEFT), 0);
  assert.equal(potAt(LEFT - 1), 0);
  assert.equal(potAt(RIGHT), POTS - 1);
  assert.equal(potAt(RIGHT + 1), POTS - 1);
  for (let pot = 0; pot < POTS; pot++) assert.equal(potAt(potCentre(pot)), pot);
  assert.equal(dividers().length, POTS - 1);
});

test("flowers add up across the round", () => {
  assert.equal(flowersFor([]), 0);
  assert.equal(flowersFor([4, 4, 0]), 5 + 5 + POT_VALUES[0]);
});

test("harder levels have more rows of pegs, all on the board", () => {
  const rows = (level) => new Set(pegLayout(level).map((p) => p.row)).size;
  assert.ok(rows("easy") < rows("normal"));
  assert.ok(rows("normal") < rows("hard"));
  for (const level of Object.keys(DROP_LEVELS))
    for (const peg of pegLayout(level)) {
      assert.ok(peg.x >= LEFT && peg.x <= RIGHT);
      assert.ok(peg.y > 1.1 && peg.y < DROP_Y - ACORN_RADIUS);
    }
});

test("the shifted rows have half pegs on both walls", () => {
  for (const level of Object.keys(DROP_LEVELS)) {
    const walls = pegLayout(level).filter((p) => p.wall);
    assert.ok(walls.length >= 4);
    for (const peg of walls) assert.ok(peg.x === LEFT || peg.x === RIGHT);
    assert.ok(walls.every((p) => p.row % 2 === 1));
  }
});

test("the critter walks the rail from its ledge, which is off the board", () => {
  assert.ok(HOME_X < LEFT, "the ledge is beside the fence");
  assert.equal(canDrop(HOME_X), false);
  assert.equal(canDrop(0), true);
  assert.equal(canDrop(REACH), true);
  assert.equal(clampWalk(-99), HOME_X);
  assert.equal(clampWalk(99), REACH);
  for (const level of Object.keys(DROP_LEVELS)) {
    let x = HOME_X;
    for (let i = 0; i < 600 && !canDrop(x); i++) x = walk(x, 1, 1 / 60, level);
    assert.ok(canDrop(x), `${level}: walking right reaches the board`);
    for (let i = 0; i < 600; i++) x = walk(x, 1, 1 / 60, level);
    assert.equal(x, REACH, "and stops at the far end");
    assert.equal(walk(x, 0, 1, level), x, "standing still stays put");
  }
  assert.ok(DROP_LEVELS.easy.walk <= DROP_LEVELS.hard.walk);
});

test("after a drop the critter walks back to the ledge and stops there", () => {
  let x = REACH;
  let t = 0;
  while (x !== HOME_X && t < 10) {
    x = walkToward(x, HOME_X, RETURN_SPEED, 1 / 60);
    t += 1 / 60;
  }
  assert.equal(x, HOME_X);
  assert.ok(t < 3.5, `the trip home takes ${t}s`);
  assert.equal(walkToward(x, HOME_X, RETURN_SPEED, 1), HOME_X);
  // Walking toward a tapped spot past the end stops at the end.
  assert.equal(walkToward(REACH - 0.01, 50, 3, 1), REACH);
});

test("every drop lands in a pot, once, in good time", () => {
  for (const level of Object.keys(DROP_LEVELS))
    for (const [i, x] of sweep().entries()) {
      const { acorn, events } = drop(level, x, 7919 + i);
      assert.notEqual(acorn.pot, null, `${level} at ${x} never landed`);
      assert.equal(events, 1);
      assert.ok(acorn.t < 15, `${level} at ${x} took ${acorn.t}s`);
    }
});

test("an acorn stays on the board and above the pot floor", () => {
  const pegs = pegLayout("hard");
  const acorn = createAcorn(RIGHT + 3, 5);
  assert.ok(acorn.x <= RIGHT - ACORN_RADIUS);
  for (let i = 0; i < 60 * 12; i++) {
    stepAcorn(acorn, pegs, "hard", 1 / 60);
    assert.ok(acorn.x >= LEFT + ACORN_RADIUS - 1e-6);
    assert.ok(acorn.x <= RIGHT - ACORN_RADIUS + 1e-6);
    assert.ok(acorn.y >= 0.2 + ACORN_RADIUS - 1e-6);
  }
});

test("every pot can be reached on every level", () => {
  for (const level of Object.keys(DROP_LEVELS)) {
    const hit = new Set();
    for (const [i, x] of sweep(200).entries())
      for (const seed of [1, 2])
        hit.add(drop(level, x, seed * 31 + i).acorn.pot);
    assert.equal(hit.size, POTS, `${level} reached ${[...hit]}`);
  }
});

test("no pot hogs the acorns", () => {
  for (const level of Object.keys(DROP_LEVELS)) {
    const counts = Array(POTS).fill(0);
    let n = 0;
    for (const [i, x] of sweep(200).entries())
      for (const seed of [1, 2]) {
        counts[drop(level, x, seed * 97 + i).acorn.pot]++;
        n++;
      }
    for (const count of counts)
      assert.ok(count / n < 0.25, `${level} ${counts}`);
  }
});

test("the same drop from the same seed lands the same way", () => {
  const a = drop("normal", 0.37, 12345).acorn;
  const b = drop("normal", 0.37, 12345).acorn;
  assert.equal(a.pot, b.pot);
  assert.equal(a.t, b.t);
});
