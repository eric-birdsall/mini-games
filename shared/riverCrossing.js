// River Crossing rules: the river's rows, drifting branches, stationary
// rocks, hopping and scoring. Kept free of DOM and Three.js so it can be
// tested in Node.
//
// The river is a grid. Rows run from the near bank (row 0) to the far bank
// (the last row). Columns run left to right from 0 to COLS - 1. The player's
// column is a number: whole on a bank or rock, fractional while riding a
// branch.

export const COLS = 9;
export const CROSSINGS_PER_ROUND = 3;
// How long one hop takes in the air (seconds).
export const HOP_TIME = 0.2;
// A branch wraps around after travelling this many columns, so it drifts in
// from one side after leaving the other.
export const LOOP = COLS + 10;
// The loop starts this far left of column 0, so a branch wraps out of sight.
const LOOP_START = -5;
// Landing this close to a branch end still counts as on the branch.
const GRACE = 0.2;
// How far past the river's edge a branch can carry you before you slip off.
const EDGE = 0.35;

export const RIVER_LEVELS = {
  easy: { speed: 0.7, length: 1, lives: 5 },
  normal: { speed: 1, length: 0, lives: 4 },
  hard: { speed: 1.3, length: -0.5, lives: 3 },
};

export const riverLevel = (level) => RIVER_LEVELS[level] || RIVER_LEVELS.normal;

// Each crossing is a list of river rows between the banks. "b" rows hold
// drifting branches, "r" rows hold rocks.
// [kind, speed (columns per second), branch length, branch count, rocks]
const CROSSINGS = [
  [
    ["b", 0.9, 3, 3],
    ["b", 1.1, 3, 3],
    ["r", 0, 0, 0, [1, 3, 5, 7]],
    ["b", 1.0, 3, 3],
    ["b", 1.3, 2.5, 3],
  ],
  [
    ["b", 1.1, 3, 3],
    ["b", 1.4, 2.5, 3],
    ["b", 1.2, 3, 3],
    ["r", 0, 0, 0, [0, 2, 4, 6, 8]],
    ["b", 1.6, 2.5, 3],
    ["b", 1.3, 2, 4],
    ["r", 0, 0, 0, [1, 4, 7]],
    ["b", 1.5, 2.5, 3],
  ],
  [
    ["b", 1.4, 2.5, 3],
    ["b", 1.8, 2, 3],
    ["r", 0, 0, 0, [2, 4, 6]],
    ["b", 1.6, 2, 4],
    ["b", 2.0, 2, 3],
    ["b", 1.5, 2.5, 3],
    ["r", 0, 0, 0, [0, 3, 5, 8]],
    ["b", 2.1, 2, 3],
    ["b", 1.7, 2, 4],
    ["b", 1.9, 2.5, 3],
  ],
];

export const crossingName = (n) =>
  ["", "Lazy river", "Rocky rapids", "Rushing waters"][n] || "";

// The rows of crossing n (1-based), banks included.
export function crossingPlan(n, level = "normal") {
  const { speed: pace, length: extra } = riverLevel(level);
  const source = CROSSINGS[Math.max(0, Math.min(CROSSINGS.length, n) - 1)];
  const rows = [{ kind: "bank" }];
  source.forEach(([kind, speed, length, count, rocks], i) => {
    if (kind === "r") {
      rows.push({ kind: "rocks", rocks });
      return;
    }
    // Alternate directions so neighbouring rows drift against each other.
    const dir = i % 2 === 0 ? 1 : -1;
    const len = Math.max(1.5, length + extra);
    const gap = LOOP / count;
    rows.push({
      kind: "branches",
      dir,
      speed: speed * pace,
      branches: Array.from({ length: count }, (_, b) => ({
        start: b * gap + ((i * 2.3) % gap),
        length: len,
      })),
    });
  });
  rows.push({ kind: "bank" });
  return rows;
}

export const isSafeRow = (row) => row.kind === "bank" || row.kind === "rocks";

const wrap = (value, size) => ((value % size) + size) % size;

// Where a branch's left end is at time t. Branches travel along a loop
// wider than the river, starting off its left edge.
export function branchLeft(row, branch, t) {
  return wrap(branch.start + row.dir * row.speed * t, LOOP) + LOOP_START;
}

// The branch under column x at time t, or -1. Columns are cell centres, so a
// cell spans x - 0.5 to x + 0.5.
export function branchAt(row, x, t, grace = GRACE) {
  if (row.kind !== "branches") return -1;
  return row.branches.findIndex((branch) => {
    const left = branchLeft(row, branch, t) - 0.5;
    return x >= left - grace && x <= left + branch.length + grace;
  });
}

// The rock at (or close enough to) column x, or -1.
export function rockAt(row, x) {
  if (row.kind !== "rocks") return -1;
  return row.rocks.findIndex((col) => Math.abs(col - x) <= 0.55);
}

export const clampCol = (x) => Math.max(0, Math.min(COLS - 1, x));

// Where a hop from (row, x) in direction (dx, dRow) aims. Hops from solid
// ground go cell to cell; hops off a branch keep the drifted column so you
// land straight ahead.
export function hopTarget(rows, from, dx, dRow) {
  const row = Math.max(0, Math.min(rows.length - 1, from.row + dRow));
  let x = from.x + dx;
  if (isSafeRow(rows[from.row])) x = Math.round(x);
  if (rows[row].kind === "bank" || dRow === 0) x = clampCol(x);
  return { row, x };
}

// What happens when a hop lands on (row, x) at time t.
//   { safe: true, x, branch } — landed; x snaps to the rock or bank cell
//   { safe: false }           — splash
export function land(rows, row, x, t) {
  const here = rows[row];
  if (here.kind === "bank") return { safe: true, x: clampCol(Math.round(x)) };
  if (here.kind === "rocks") {
    const rock = rockAt(here, x);
    return rock < 0 ? { safe: false } : { safe: true, x: here.rocks[rock] };
  }
  if (x < -EDGE || x > COLS - 1 + EDGE) return { safe: false };
  const branch = branchAt(here, x, t);
  return branch < 0 ? { safe: false } : { safe: true, x, branch };
}

// Riding a branch: drift with it. Returns the new column, or null if the
// branch carried you off the edge of the river.
export function drift(row, x, dt) {
  const next = x + row.dir * row.speed * dt;
  return next < -EDGE || next > COLS - 1 + EDGE ? null : next;
}

// Still standing on the branch after drifting? Branches move with you, so
// this only fails at the river's edge, where the branch wraps away.
export function stillOnBranch(row, x, t) {
  return branchAt(row, x, t, GRACE + 0.1) >= 0;
}

// --- Scoring ----------------------------------------------------------------
export const ROW_POINTS = 10;
export const CROSSING_POINTS = 100;
export const LIFE_POINTS = 25;

// Quick crossings earn a bonus that shrinks to nothing at twice the par time.
export function timeBonus(seconds, rows) {
  const par = rows * 2.2;
  return Math.max(0, Math.round((par * 2 - seconds) * 5));
}

export function riverSummary(crossings, splashes, livesLeft) {
  const done = crossings.filter((c) => c.done);
  const score = crossings.reduce(
    (sum, c) =>
      sum +
      c.furthest * ROW_POINTS +
      (c.done ? CROSSING_POINTS + timeBonus(c.time, c.rows) : 0),
    0,
  );
  // Every heart left over is worth a bonus, once the whole river is crossed.
  const finished = done.length === CROSSINGS_PER_ROUND;
  return {
    score: score + (finished ? livesLeft * LIFE_POINTS : 0),
    crossed: done.length,
    splashes,
    time: Math.round(done.reduce((sum, c) => sum + c.time, 0)),
  };
}
