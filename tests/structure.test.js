import { test } from "node:test";
import assert from "node:assert/strict";
import { structureGroups, structureEdges } from "../src/structure.js";

const box = (x, z, w, d, h, kind = "wall", extra = {}) => ({
  x,
  z,
  w,
  d,
  h,
  kind,
  ...extra,
});
// Segments as [[x1,y1,z1,x2,y2,z2], ...] rounded, for easy matching.
const segments = (walls) => {
  const e = structureEdges(walls),
    out = [];
  for (let i = 0; i < e.length; i += 6)
    out.push(e.slice(i, i + 6).map((v) => Math.round(v * 100) / 100));
  return out;
};

test("a wall split into two flush pieces is one structure with no seam line", () => {
  const walls = [box(-1, 0, 2, 0.5, 3), box(1, 0, 2, 0.5, 3)];
  assert.equal(new Set(structureGroups(walls)).size, 1);
  // Nothing drawn along the seam plane x = 0 except where it meets nothing.
  const seam = segments(walls).filter(
    (s) => Math.abs(s[0]) < 0.02 && Math.abs(s[3]) < 0.02,
  );
  assert.deepEqual(seam, [], "no vertical or top line at the seam");
  // The outer corners are still outlined: 4 verticals at x = ±2.
  const verticals = segments(walls).filter(
    (s) => s[1] !== s[4] && Math.abs(Math.abs(s[0]) - 2) < 0.01,
  );
  assert.equal(verticals.length, 4);
});

test("stair steps and their platform are one structure, outlined as steps", () => {
  const walls = [
    box(0, 0, 2, 2, 1.2, "platform"),
    box(0, 1.3, 2, 0.6, 0.8, "stairs"),
    box(0, 1.9, 2, 0.6, 0.4, "stairs"),
  ];
  assert.equal(new Set(structureGroups(walls)).size, 1);
  const lines = segments(walls);
  // Each step keeps its nosing (front top edge, along x).
  for (const [y, z] of [
    [0.8, 1.6],
    [0.4, 2.2],
  ])
    assert.ok(
      lines.some(
        (s) =>
          s[1] === s[4] &&
          Math.abs(s[1] - y) < 0.02 &&
          Math.abs(s[2] - z) < 0.02,
      ),
      `nosing at y ${y}`,
    );
  // But no vertical line where a step's side meets the next step's side
  // below the lower step's top.
  assert.ok(
    !lines.some(
      (s) =>
        s[1] !== s[4] &&
        Math.abs(s[2] - 1.6) < 0.01 &&
        Math.min(s[1], s[4]) < 0.39,
    ),
  );
});

test("different kinds and edge-only contact stay separate structures", () => {
  assert.equal(
    new Set(structureGroups([box(0, 0, 1, 1, 1, "cover"), box(1, 0, 1, 1, 1)]))
      .size,
    2,
  );
  assert.equal(
    new Set(structureGroups([box(0, 0, 1, 1, 1), box(1, 1, 1, 1, 1)])).size,
    2,
    "touching only along an edge",
  );
});
