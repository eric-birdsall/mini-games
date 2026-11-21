import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  OBJECTS,
  THEMES,
  LEVELS,
  makeRound,
  rng,
  sceneLayout,
} from "../shared/lookAndFind.js";

test("all themes have unique recognizable objects and bundled images", () => {
  assert.equal(new Set(OBJECTS.map((o) => o.id)).size, OBJECTS.length);
  for (const object of OBJECTS)
    assert.ok(
      existsSync(
        new URL(`../src/assets/look-and-find/${object.image}`, import.meta.url),
      ),
      object.id,
    );
  for (const theme of THEMES) {
    assert.equal(new Set(theme.objects).size, theme.objects.length);
    assert.ok(theme.objects.length >= LEVELS.hard.count);
    assert.equal(
      new Set(theme.objects.map((id) => OBJECTS.find((o) => o.id === id).image))
        .size,
      theme.objects.length,
      "Every clue image has exactly one answer",
    );
    theme.objects.forEach((id) => assert.ok(OBJECTS.some((o) => o.id === id)));
  }
});
test("every mode can finish without replacements or duplicate targets", () => {
  for (const theme of THEMES)
    for (const level of Object.keys(LEVELS))
      for (let seed = 1; seed < 40; seed++) {
        const round = makeRound(theme.id, level, rng(seed));
        assert.equal(round.objects.length, LEVELS[level].count);
        assert.equal(new Set(round.targets).size, LEVELS[level].finds);
        assert.ok(round.targets.every((id) => round.objects.includes(id)));
        const remaining = new Set(round.targets);
        for (const id of [...round.targets].reverse()) remaining.delete(id);
        assert.equal(remaining.size, 0);
      }
});
test("objects remain inside the playable scene and do not cover one another", () => {
  for (const [w, h] of [
    [362, 480],
    [1280, 600],
    [816, 220],
    [360, 260],
  ])
    for (const { count } of Object.values(LEVELS)) {
      const spots = sceneLayout(count, w, h, rng(17));
      for (const p of spots) {
        assert.ok(p.x - p.size * 0.6 >= 0 && p.x + p.size * 0.6 <= w);
        assert.ok(p.y - p.size * 0.6 >= 0 && p.y + p.size * 0.6 <= h);
        for (const other of spots)
          if (p !== other)
            assert.ok(Math.hypot(p.x - other.x, p.y - other.y) >= p.size * 1.1);
      }
    }
});

test("the same seed produces the same scene, without regular rows", () => {
  const first = sceneLayout(24, 900, 600, rng(71));
  assert.deepEqual(first, sceneLayout(24, 900, 600, rng(71)));
  assert.ok(new Set(first.map((p) => Math.round(p.x))).size > 20);
  assert.ok(new Set(first.map((p) => Math.round(p.y))).size > 20);
});

test("the whole area fits on one screen with readable objects", () => {
  // Play area after the clue tray and progress insets, phone to desktop.
  for (const [w, h] of [
    [362, 560],
    [1484, 340],
    [816, 220],
  ]) {
    const spots = sceneLayout(64, w, h, rng(71));
    assert.equal(spots.length, 64);
    for (const p of spots) {
      assert.ok(p.size >= 20 && p.size <= 62);
      assert.ok(p.x - p.size / 2 >= 0 && p.x + p.size / 2 <= w);
      assert.ok(p.y - p.size / 2 >= 0 && p.y + p.size / 2 <= h);
    }
  }
});
