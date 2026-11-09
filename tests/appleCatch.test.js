import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLES_PER_ROUND,
  APPLE_LEVELS,
  LEFT,
  MIDDLE,
  PINECONE_COST,
  RIGHT,
  applesLeft,
  applyCatch,
  basketSpot,
  bestSpot,
  botSpot,
  chance,
  dropPlan,
  winners,
} from "../shared/appleCatch.js";

const groups = (drops) => {
  const map = new Map();
  for (const d of drops) map.set(d.group, [...(map.get(d.group) ?? []), d]);
  return [...map.values()];
};

test("the basket is in the middle unless left or right is held", () => {
  assert.equal(basketSpot(false, false), MIDDLE);
  assert.equal(basketSpot(true, false), LEFT);
  assert.equal(basketSpot(false, true), RIGHT);
  assert.equal(basketSpot(true, true), MIDDLE);
});

test("a round drops exactly 100 apples, with pinecones mixed in", () => {
  for (const level of Object.keys(APPLE_LEVELS))
    for (let seed = 1; seed < 20; seed++) {
      const drops = dropPlan(level, seed);
      assert.equal(
        drops.filter((d) => d.kind === "apple").length,
        APPLES_PER_ROUND,
      );
      assert.ok(drops.some((d) => d.kind === "pinecone"));
    }
});

test("harder levels have more pinecones and more things at once", () => {
  const stats = (level) => {
    let cones = 0,
      multi = 0,
      all = 0;
    for (let seed = 1; seed < 30; seed++) {
      const drops = dropPlan(level, seed);
      cones += drops.filter((d) => d.kind === "pinecone").length;
      multi += groups(drops).filter((g) => g.length > 1).length;
      all += groups(drops).length;
    }
    return { cones, multi: multi / all };
  };
  const easy = stats("easy");
  const hard = stats("hard");
  assert.ok(hard.cones > easy.cones);
  assert.ok(hard.multi > easy.multi);
});

test("things in a group fall together from different spots, with a safe spot left", () => {
  for (let seed = 1; seed < 40; seed++) {
    const drops = dropPlan("hard", seed);
    const all = groups(drops);
    assert.ok(
      all.some((g) => g.length === 3),
      "some triples",
    );
    for (const g of all) {
      assert.ok(g.length >= 1 && g.length <= 3);
      assert.equal(new Set(g.map((d) => d.spot)).size, g.length);
      assert.ok(g.every((d) => d.at === g[0].at && d.land === g[0].land));
      assert.ok(g.filter((d) => d.kind === "pinecone").length < 3);
      if (g.length === 3) assert.ok(g.some((d) => d.kind === "apple"));
      for (const d of g) assert.ok([LEFT, MIDDLE, RIGHT].includes(d.spot));
    }
    // The opening drops are single apples.
    for (const g of all.slice(0, 4))
      assert.deepEqual(
        g.map((d) => d.kind),
        ["apple"],
      );
  }
});

test("drops come in time order and speed up", () => {
  const drops = dropPlan("normal", 3);
  for (let i = 1; i < drops.length; i++)
    assert.ok(drops[i].at >= drops[i - 1].at);
  assert.ok(drops.at(-1).fall < drops[0].fall);
  // About a minute and a half.
  const end = drops.at(-1).land;
  assert.ok(end > 50 && end < 140, `${end}`);
});

test("the same seed gives the same round", () => {
  assert.deepEqual(dropPlan("hard", 99), dropPlan("hard", 99));
  assert.notDeepEqual(dropPlan("hard", 99), dropPlan("hard", 100));
});

test("apples left counts the ones still to land", () => {
  const drops = dropPlan("normal", 5);
  assert.equal(applesLeft(drops, 0), APPLES_PER_ROUND);
  assert.equal(applesLeft(drops, drops.at(-1).land + 1), 0);
});

test("apples add one; pinecones take five, never below zero", () => {
  assert.deepEqual(applyCatch(3, "apple"), { total: 4, change: 1 });
  assert.deepEqual(applyCatch(12, "pinecone"), {
    total: 12 - PINECONE_COST,
    change: -PINECONE_COST,
  });
  assert.deepEqual(applyCatch(2, "pinecone"), { total: 0, change: -2 });
  assert.deepEqual(applyCatch(0, "pinecone"), { total: 0, change: 0 });
});

test("the best spot catches an apple and avoids pinecones", () => {
  const d = (spot, kind) => ({ spot, kind });
  assert.equal(bestSpot([d(LEFT, "apple")]), LEFT);
  assert.equal(bestSpot([d(MIDDLE, "pinecone")]), LEFT);
  assert.equal(
    bestSpot([d(LEFT, "pinecone"), d(MIDDLE, "pinecone"), d(RIGHT, "apple")]),
    RIGHT,
  );
  assert.equal(bestSpot([d(LEFT, "pinecone"), d(RIGHT, "pinecone")]), MIDDLE);
});

test("a perfect player catches every apple and no pinecones", () => {
  const drops = dropPlan("hard", 8);
  let total = 0;
  let caught = 0;
  for (const g of groups(drops)) {
    const spot = bestSpot(g);
    const hit = g.find((d) => d.spot === spot);
    if (hit) {
      assert.equal(hit.kind, "apple");
      total = applyCatch(total, hit.kind).total;
      caught++;
    }
  }
  // Two apples at once can't both be caught, so a perfect round is under 100.
  assert.equal(total, caught);
  assert.ok(total <= APPLES_PER_ROUND && total > 60);
});

test("a neighbour waits, then picks a spot as the next group lets go", () => {
  const drops = [
    { id: 0, group: 0, kind: "apple", spot: RIGHT, at: 2, land: 3 },
    { id: 1, group: 0, kind: "pinecone", spot: MIDDLE, at: 2, land: 3 },
  ];
  assert.equal(botSpot(drops, 0, 1, 1, 1), null);
  assert.equal(botSpot(drops, 2, 1, 1, 1), RIGHT);
  // Never right: always one of the other two spots.
  const wrong = botSpot(drops, 2, 0, 1, 1);
  assert.ok(wrong === LEFT || wrong === MIDDLE);
  // Still holding the spot just after landing, then done.
  assert.equal(botSpot(drops, 3.02, 1, 1, 1), RIGHT);
  assert.equal(botSpot(drops, 4, 1, 1, 1), null);
});

test("neighbours make their own mistakes", () => {
  const rolls = [1, 2, 3].map((who) => chance(42, who, 7));
  assert.equal(new Set(rolls).size, 3);
  assert.equal(chance(42, 1, 7), rolls[0]);
});

test("winners lists everyone tied for the top", () => {
  assert.deepEqual(winners([40, 35, 12, 39]), [0]);
  assert.deepEqual(winners([30, 52, 1, 0]), [1]);
  assert.deepEqual(winners([20, 20, 3, 20]), [0, 1, 3]);
});
