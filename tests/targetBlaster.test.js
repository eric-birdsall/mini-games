import test from "node:test";
import assert from "node:assert/strict";
import {
  BLASTER_LEVELS,
  SHOT_COST,
  WAVES_PER_ROUND,
  blasterSummary,
  bullseyeRing,
  canFire,
  fire,
  hitPoints,
  pump,
  shotsLeft,
  targetX,
  wavePlan,
  waveStartPressure,
} from "../shared/targetBlaster.js";

test("each shot costs 10% of a full meter", () => {
  assert.equal(SHOT_COST, 0.1);
  let pressure = waveStartPressure();
  let shots = 0;
  while (fire(pressure).fired) {
    pressure = fire(pressure).pressure;
    shots++;
  }
  assert.equal(shots, 10);
  assert.equal(canFire(pressure), false);
  assert.deepEqual(fire(pressure), { fired: false, pressure });
});

test("pumping builds pressure up to a full meter", () => {
  assert.equal(pump(0, 0.2), 0.2);
  assert.equal(pump(0.95, 0.2), 1);
  assert.equal(canFire(pump(0, 0.05)), false);
  assert.equal(canFire(pump(0, 0.1)), true);
  assert.equal(shotsLeft(pump(0, 0.25)), 2);
  for (const { pump: gain } of Object.values(BLASTER_LEVELS))
    assert.ok(gain >= SHOT_COST, "one pump always earns at least a shot");
});

test("pressure resets to full at the start of every wave", () => {
  assert.equal(waveStartPressure(), 1);
  assert.equal(shotsLeft(waveStartPressure()), 10);
});

test("waves add sliding bullseyes and follow the level", () => {
  assert.equal(WAVES_PER_ROUND, 3);
  const kinds = (wave) => new Set(wavePlan(wave).map((t) => t.kind));
  assert.deepEqual([...kinds(1)].sort(), ["bottle", "can"]);
  assert.ok(kinds(2).has("bullseye"));
  assert.ok(wavePlan(3).filter((t) => t.kind === "bullseye").length >= 3);
  for (let wave = 1; wave <= WAVES_PER_ROUND; wave++) {
    const ids = wavePlan(wave).map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  const easy = wavePlan(3, "easy").find((t) => t.range);
  const hard = wavePlan(3, "hard").find((t) => t.range);
  assert.ok(easy.scale > hard.scale);
  assert.ok(easy.speed < hard.speed);
});

test("sliders stay inside their track; cans stay put", () => {
  const can = wavePlan(1)[0];
  assert.equal(targetX(can, 5), can.x);
  const slider = wavePlan(2).find((t) => t.range);
  for (let t = 0; t < 20; t += 0.1) {
    const x = targetX(slider, t);
    assert.ok(x >= slider.x - slider.range - 1e-9);
    assert.ok(x <= slider.x + slider.range + 1e-9);
  }
  assert.notEqual(targetX(slider, 0), targetX(slider, 1));
});

test("bullseye rings score more toward the middle", () => {
  assert.equal(bullseyeRing(0).points, 50);
  assert.equal(bullseyeRing(0.5).points, 30);
  assert.equal(bullseyeRing(0.9).points, 20);
  assert.equal(bullseyeRing(1.2), null);
  assert.equal(hitPoints("can"), 10);
  assert.equal(hitPoints("bottle"), 15);
  assert.equal(hitPoints("bullseye", 0.1), 50);
});

test("the summary adds points and works out accuracy", () => {
  const hits = [
    { kind: "can", points: 10 },
    { kind: "bottle", points: 15 },
    { kind: "bullseye", points: 50 },
    { kind: "bullseye", points: 20 },
  ];
  assert.deepEqual(blasterSummary(hits, 8), {
    score: 95,
    hits: 4,
    shots: 8,
    accuracy: 50,
    cans: 1,
    bottles: 1,
    bullseyes: 2,
    centres: 1,
  });
  assert.equal(blasterSummary([], 0).accuracy, 0);
});
