import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  FOODS,
  PRAISE,
  askLine,
  doneLine,
  otherLine,
  praiseLine,
  voicePhrases,
  FOOD_LEVELS,
  foodLevel,
  layoutSpots,
  MAX_OVERLAP,
  spotGap,
  pickTarget,
  replacementFood,
  rng,
  startingFoods,
  theFood,
} from "../shared/foodFinder.js";

test("every food has a model and a unique id", () => {
  const ids = new Set(FOODS.map((food) => food.id));
  assert.equal(ids.size, FOODS.length);
  for (const food of FOODS)
    assert.ok(
      existsSync(new URL(`../src/assets/food/${food.id}.glb`, import.meta.url)),
      `${food.id}.glb`,
    );
});

test("food names are distinct so every prompt has one answer", () => {
  const names = new Set(FOODS.map((food) => food.name));
  assert.equal(names.size, FOODS.length);
});

test("every level fits on the blanket with foods to spare", () => {
  for (const level of Object.values(FOOD_LEVELS)) {
    assert.ok(level.count < FOODS.length);
    assert.ok(level.finds <= level.count);
  }
  assert.equal(foodLevel("nope"), FOOD_LEVELS.normal);
});

test("layout scatters foods inside the area, overlapping at most 20%", () => {
  for (const [count, width, depth] of [
    [24, 1.6, 1],
    [50, 1.8, 1],
    [50, 0.6, 1],
    [60, 2.2, 1],
  ]) {
    const { spots, size } = layoutSpots(count, width, depth, rng(7));
    assert.equal(spots.length, count);
    // Big enough to tap: at least two thirds of an evenly shared area.
    assert.ok(size > Math.sqrt((width * depth) / count) * 0.66, `${size}`);
    for (const spot of spots) {
      assert.ok(Math.abs(spot.x) + size / 2 <= width / 2 + 1e-9);
      assert.ok(Math.abs(spot.z) + size / 2 <= depth / 2 + 1e-9);
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        assert.ok(spotGap(spots[i], spots[j]) >= size * (1 - MAX_OVERLAP));
  }
});

test("layout is not a grid", () => {
  const { spots } = layoutSpots(50, 1.8, 1, rng(5));
  // On a grid most foods share a row (or column) with others.
  const rows = new Set(spots.map((spot) => spot.z.toFixed(3)));
  const cols = new Set(spots.map((spot) => spot.x.toFixed(3)));
  assert.ok(rows.size > 40 && cols.size > 40);
});

test("targets come from the blanket and skip recent ones", () => {
  const random = rng(3);
  const onBlanket = startingFoods(30, random);
  assert.equal(new Set(onBlanket).size, 30);
  const recent = onBlanket.slice(0, 6);
  for (let i = 0; i < 50; i++) {
    const target = pickTarget(onBlanket, recent, random);
    assert.ok(onBlanket.includes(target));
    assert.ok(!recent.includes(target));
  }
});

test("a replacement is never already on the blanket", () => {
  const random = rng(11);
  const onBlanket = startingFoods(42, random);
  for (let i = 0; i < 30; i++)
    assert.ok(!onBlanket.includes(replacementFood(onBlanket, random)));
  assert.equal(
    replacementFood(
      FOODS.map((food) => food.id),
      random,
    ),
    null,
  );
});

test("prompts read naturally", () => {
  assert.equal(theFood("loaf"), "the bread");
  assert.equal(theFood("cherries"), "the cherries");
});

test("every line the game says has recorded clips", async () => {
  const { readFileSync } = await import("node:fs");
  const recorded = JSON.parse(
    readFileSync(new URL("../src/assets/food/voice.json", import.meta.url)),
  );
  const phrases = voicePhrases();
  assert.deepEqual(Object.keys(recorded).sort(), Object.keys(phrases).sort());
  const lines = [];
  for (const { id } of FOODS) {
    lines.push(askLine(id), otherLine(id, "apple"));
    PRAISE.forEach((_, i) => lines.push(praiseLine(i, id)));
  }
  for (const { finds } of Object.values(FOOD_LEVELS))
    lines.push(doneLine(finds));
  for (const line of lines) {
    for (const key of line.keys) assert.ok(recorded[key], key);
    // The fallback text says the same words as the clips.
    const spoken = line.keys.map((key) => phrases[key]).join(" ");
    assert.equal(spoken, line.text);
  }
});
