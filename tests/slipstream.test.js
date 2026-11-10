import test from "node:test";
import assert from "node:assert/strict";
import {
  racer,
  stepRacer,
  course,
  botInput,
  rivalStyle,
  COURSE_LENGTH,
} from "../shared/slipstream.js";
test("automatic sprint and continuous steering stay within track", () => {
  const r = racer("test");
  for (let i = 0; i < 120; i++) stepRacer(r, { steer: 1 }, 1 / 60, i / 60, []);
  assert.ok(r.z > 19);
  assert.equal(r.x, 5.6);
});
test("course contains only slip n slides and mudpiles", () => {
  assert.deepEqual([...new Set(course().map((item) => item.kind))].sort(), [
    "mud",
    "slide",
  ]);
});
test("mud slows racers, clears boosts, and releases them when they steer out", () => {
  const r = racer("mud");
  const items = [{ id: "mud", kind: "mud", x: 0, z: 4, width: 3, length: 12 }];
  r.boost = 2;
  r.chain = 3;
  for (let i = 0; i < 30; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.ok(r.speed < 5);
  assert.equal(r.boost, 0);
  assert.equal(r.chain, 0);
  assert.equal(r.mudEntries, 1);
  for (let i = 30; i < 90; i++)
    stepRacer(r, { steer: 1 }, 1 / 60, i / 60, items);
  assert.equal(r.mud, false);
  assert.ok(r.speed > 9);
});
test("distinct slip n slides chain; staying on a slide does not add stacks", () => {
  const r = racer("boost");
  const items = [
    { id: "a", kind: "slide", x: 0, z: 2, width: 3, length: 8 },
    { id: "b", kind: "slide", x: 0, z: 12, width: 3, length: 8 },
  ];
  for (let i = 0; i < 20; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.equal(r.chain, 1);
  for (let i = 20; i < 70; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  assert.equal(r.chain, 2);
  assert.ok(r.speed > 15);
});
test("AI completes course and a finished racer remains stopped", () => {
  const items = course(),
    r = racer("bot");
  let elapsed = 0;
  while (r.finish === null && elapsed < 75) {
    stepRacer(r, botInput(r, items, 1), 1 / 120, elapsed, items);
    elapsed += 1 / 120;
  }
  assert.equal(r.z, COURSE_LENGTH);
  assert.ok(r.finish < 75);
  const finish = r.finish;
  stepRacer(r, { steer: 1 }, 1, elapsed, items);
  assert.equal(r.finish, finish);
  assert.equal(r.z, COURSE_LENGTH);
});

test("difficulty produces progressively faster rivals on the complete course", () => {
  const items = course();
  const times = ["easy", "normal", "hard"].map((level) => {
    const r = racer(level);
    let elapsed = 0;
    while (r.finish === null && elapsed < 75) {
      stepRacer(r, botInput(r, items, 1, level), 1 / 120, elapsed, items);
      elapsed += 1 / 120;
    }
    assert.notEqual(r.finish, null);
    return r.finish;
  });
  assert.ok(times[0] > times[1], `${times}`);
  assert.ok(times[1] > times[2], `${times}`);
});

test("no mudpile sits on a slip n slide", () => {
  const items = course();
  const slides = items.filter((o) => o.kind === "slide");
  for (const mud of items.filter((o) => o.kind === "mud"))
    for (const s of slides)
      assert.ok(
        Math.abs(mud.x - s.x) >= (mud.width + s.width) / 2 ||
          Math.abs(mud.z - s.z) >= (mud.length + s.length) / 2,
        `${mud.id} overlaps ${s.id}`,
      );
});

const runDive = (items) => {
  const r = racer("diver");
  stepRacer(r, { dive: true }, 1 / 60, 0, items);
  for (let i = 1; i < 40; i++) stepRacer(r, {}, 1 / 60, i / 60, items);
  return r;
};
test("a belly dive onto a slip n slide gives a small boost on landing", () => {
  const slide = [{ id: "s", kind: "slide", x: 0, z: 15, width: 3, length: 30 }];
  const plain = racer("plain");
  for (let i = 0; i < 40; i++) stepRacer(plain, {}, 1 / 60, i / 60, slide);
  const r = runDive(slide);
  assert.ok(r.diveBoost > 0);
  assert.equal(r.flop, 0);
  assert.ok(r.speed > plain.speed + 0.5, `${r.speed} vs ${plain.speed}`);
});
test("a belly flop on grass stops the racer, who gets up a second later", () => {
  const r = runDive([]);
  assert.equal(r.landedOnGrass, true);
  assert.equal(r.diveBoost, 0);
  assert.ok(r.flop > 0);
  for (let i = 0; i < 20; i++) stepRacer(r, { steer: 1 }, 1 / 60, 1, []);
  assert.ok(r.speed < 0.5, `${r.speed}`);
  assert.equal(r.x, 0, "no steering while flat on the grass");
  const z = r.z;
  stepRacer(r, { dive: true }, 1 / 60, 1, []);
  assert.equal(r.dive, 0, "no new dive while getting up");
  for (let i = 0; i < 60; i++) stepRacer(r, {}, 1 / 60, 1, []);
  assert.equal(r.flop, 0);
  for (let i = 0; i < 40; i++) stepRacer(r, {}, 1 / 60, 2, []);
  assert.ok(r.speed > 9, `${r.speed}`);
  assert.ok(r.z > z);
});
test("rivals never belly flop on the full course", () => {
  const items = course();
  for (const level of ["easy", "normal", "hard"]) {
    const r = racer(level);
    let elapsed = 0,
      dives = 0;
    while (r.finish === null && elapsed < 75) {
      const before = r.dive;
      stepRacer(r, botInput(r, items, 1, level), 1 / 120, elapsed, items);
      if (r.dive > before) dives++;
      assert.equal(r.landedOnGrass, false, `${level} flopped at ${r.z}`);
      elapsed += 1 / 120;
    }
    assert.ok(dives > 3, `${level} dove ${dives} times`);
  }
});
test("a belly dive that lands in mud gives no boost", () => {
  // The hop covers about 4 m, so this mud starts after takeoff.
  const r = runDive([
    { id: "mud", kind: "mud", x: 0, z: 6, width: 3, length: 6 },
  ]);
  assert.equal(r.landedInMud, true);
  assert.equal(r.diveBoost, 0);
  assert.ok(r.speed < 10);
});
test("holding dive does not start a new dive until the last one ends", () => {
  const r = racer("hold");
  stepRacer(r, { dive: true }, 1 / 60, 0, []);
  const first = r.dive;
  stepRacer(r, { dive: true }, 0.2, 0, []);
  assert.ok(r.dive < first);
});

test("rivals with their own style finish at different times", () => {
  const items = course();
  const rivals = [0, 1, 2].map((i) => {
    const r = racer(`rival${i}`, [-4, 1.5, 4][i]);
    let n = i + 1;
    r.style = rivalStyle(() => ((n = (n * 9301 + 49297) % 233280) / 233280));
    return r;
  });
  let elapsed = 0;
  while (rivals.some((r) => r.finish === null) && elapsed < 75) {
    rivals.forEach((r, i) =>
      stepRacer(r, botInput(r, items, i + 1), 1 / 120, elapsed, items),
    );
    elapsed += 1 / 120;
  }
  const times = rivals.map((r) => r.finish.toFixed(2));
  assert.equal(new Set(times).size, 3);
  assert.ok(rivals.every((r) => r.finish < 75));
});
test("rivals slip up: belly flops and mudpiles, but never wallow", () => {
  const items = course();
  let n = 7;
  const rand = () => (n = (n * 9301 + 49297) % 233280) / 233280;
  let flops = 0,
    muds = 0;
  for (let race = 0; race < 12; race++) {
    const r = racer(`rival${race}`, 1.5);
    r.style = rivalStyle(rand);
    let elapsed = 0;
    while (r.finish === null && elapsed < 75) {
      const flop = r.flop;
      stepRacer(r, botInput(r, items, 2), 1 / 60, elapsed, items);
      if (r.flop > flop) flops++;
      elapsed += 1 / 60;
    }
    assert.ok(r.finish < 75);
    assert.ok(r.mudEntries <= 8, `${r.mudEntries} mudpiles`);
    muds += r.mudEntries;
  }
  assert.ok(flops > 0, "no belly flops");
  assert.ok(muds > 0, "no mudpiles");
});
