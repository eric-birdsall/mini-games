import test from "node:test";
import assert from "node:assert/strict";
import {
  COLS,
  CROSSINGS_PER_ROUND,
  CROSSING_POINTS,
  LIFE_POINTS,
  ROW_POINTS,
  branchAt,
  branchLeft,
  crossingPlan,
  drift,
  hopTarget,
  isSafeRow,
  land,
  riverLevel,
  riverSummary,
  rockAt,
  timeBonus,
} from "../shared/riverCrossing.js";

test("every crossing runs bank to bank with branches and rocks between", () => {
  for (let n = 1; n <= CROSSINGS_PER_ROUND; n++) {
    const rows = crossingPlan(n);
    assert.equal(rows[0].kind, "bank");
    assert.equal(rows.at(-1).kind, "bank");
    const middle = rows.slice(1, -1);
    assert.ok(middle.some((row) => row.kind === "branches"));
    assert.ok(middle.some((row) => row.kind === "rocks"));
    assert.ok(middle.every((row) => row.kind !== "bank"));
    for (const row of middle.filter((r) => r.kind === "rocks"))
      assert.ok(row.rocks.every((c) => c >= 0 && c < COLS));
  }
  assert.ok(crossingPlan(3).length > crossingPlan(1).length);
});

test("neighbouring branch rows drift in opposite directions", () => {
  const rows = crossingPlan(1).filter((r) => r.kind === "branches");
  assert.equal(rows[0].dir, -rows[1].dir);
});

test("harder levels drift faster on shorter branches", () => {
  const branchRow = (level) =>
    crossingPlan(2, level).find((r) => r.kind === "branches");
  const easy = branchRow("easy");
  const hard = branchRow("hard");
  assert.ok(easy.speed < hard.speed);
  assert.ok(easy.branches[0].length > hard.branches[0].length);
  assert.ok(riverLevel("easy").lives > riverLevel("hard").lives);
  assert.equal(riverLevel("nonsense"), riverLevel("normal"));
});

test("branches drift, wrap around and are always somewhere to catch", () => {
  const row = crossingPlan(1)[1];
  const branch = row.branches[0];
  const a = branchLeft(row, branch, 0);
  const b = branchLeft(row, branch, 0.5);
  assert.ok(Math.abs(b - a - row.dir * row.speed * 0.5) < 1e-9);
  // Within one loop every column gets a branch.
  for (let col = 0; col < COLS; col++) {
    let seen = false;
    for (let t = 0; t < 30 && !seen; t += 0.05)
      seen = branchAt(row, col, t) >= 0;
    assert.ok(seen, `column ${col} gets a branch`);
  }
});

test("hops go cell to cell from solid ground and straight ahead off a branch", () => {
  const rows = crossingPlan(1);
  assert.deepEqual(hopTarget(rows, { row: 0, x: 4 }, 0, 1), { row: 1, x: 4 });
  assert.deepEqual(hopTarget(rows, { row: 0, x: 0 }, -1, 0), { row: 0, x: 0 });
  assert.deepEqual(hopTarget(rows, { row: 0, x: 4 }, 0, -1), { row: 0, x: 4 });
  assert.deepEqual(hopTarget(rows, { row: 1, x: 3.4 }, 0, 1), {
    row: 2,
    x: 3.4,
  });
  const last = rows.length - 1;
  assert.deepEqual(hopTarget(rows, { row: last - 1, x: 9.2 }, 0, 1), {
    row: last,
    x: COLS - 1,
  });
});

test("landing: banks are safe, rocks only where they are, water splashes", () => {
  const rows = crossingPlan(1);
  assert.deepEqual(land(rows, 0, 3.2, 0), { safe: true, x: 3 });
  const rockRow = rows.findIndex((r) => r.kind === "rocks");
  const rock = rows[rockRow].rocks[0];
  assert.deepEqual(land(rows, rockRow, rock + 0.4, 0), { safe: true, x: rock });
  assert.equal(rockAt(rows[rockRow], rock + 1), -1);
  assert.deepEqual(land(rows, rockRow, rock + 1, 0), { safe: false });
  assert.ok(isSafeRow(rows[rockRow]));

  const row = rows[1];
  let onBranch, inWater;
  for (let t = 0; t < 20; t += 0.05) {
    if (branchAt(row, 4, t) >= 0) onBranch ??= t;
    else inWater ??= t;
  }
  assert.equal(land(rows, 1, 4, onBranch).safe, true);
  assert.equal(land(rows, 1, 4, inWater).safe, false);
  assert.equal(land(rows, 1, -2, onBranch).safe, false);
});

test("riding a branch carries you, and off the edge into the water", () => {
  const row = crossingPlan(1)[1];
  const x = drift(row, 4, 1);
  assert.ok(Math.abs(x - (4 + row.dir * row.speed)) < 1e-9);
  const edge = row.dir > 0 ? COLS - 1 + 0.3 : -0.3;
  assert.equal(drift(row, edge, 1), null);
});

test("scoring adds rows, crossings, speed and leftover hearts", () => {
  assert.ok(timeBonus(5, 7) > timeBonus(20, 7));
  assert.equal(timeBonus(1000, 7), 0);
  const crossings = [
    { done: true, furthest: 6, rows: 6, time: 10 },
    { done: true, furthest: 9, rows: 9, time: 18 },
    { done: false, furthest: 3, rows: 11, time: 0 },
  ];
  const summary = riverSummary(crossings, 4, 0);
  assert.equal(
    summary.score,
    18 * ROW_POINTS + 2 * CROSSING_POINTS + timeBonus(10, 6) + timeBonus(18, 9),
  );
  assert.equal(summary.crossed, 2);
  assert.equal(summary.splashes, 4);
  assert.equal(summary.time, 28);

  const all = crossings.map((c) => ({ ...c, done: true, furthest: c.rows }));
  const won = riverSummary(all, 0, 3);
  const noHearts = riverSummary(all, 0, 0);
  assert.equal(won.score - noHearts.score, 3 * LIFE_POINTS);
});
