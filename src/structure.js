// Maps are built from boxes, and many structures are several boxes: each
// stair step, a wall split around an underpass, a platform and its stairs.
// These helpers make such pieces read as one: a shared shade per structure,
// and outlines only where the combined solid has a real corner.
import { overlapsFootprint } from "../shared/map.js";

const TOUCH = 0.02;
const range = (w) => ({
  x: [w.x - w.w / 2, w.x + w.w / 2],
  y: [w.bottom || 0, w.h],
  z: [w.z - w.d / 2, w.z + w.d / 2],
});
const joins = (a, b) =>
  a.kind === b.kind ||
  (["stairs", "platform", "ramp"].includes(a.kind) &&
    ["stairs", "platform", "ramp"].includes(b.kind));

// Index of the structure each wall belongs to: walls of a kind (stairs,
// ramps and platforms count as one kind) that share a face, not just an edge.
export function structureGroups(walls) {
  const parent = walls.map((_, i) => i),
    find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i]))),
    boxes = walls.map(range);
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      if (walls[i].shape || walls[j].shape || !joins(walls[i], walls[j]))
        continue;
      let touching = true,
        overlapping = 0;
      for (const k of ["x", "y", "z"]) {
        const [a0, a1] = boxes[i][k],
          [b0, b1] = boxes[j][k];
        if (a0 > b1 + TOUCH || b0 > a1 + TOUCH) touching = false;
        if (Math.min(a1, b1) - Math.max(a0, b0) > TOUCH) overlapping++;
      }
      if (touching && overlapping >= 2) parent[find(i)] = find(j);
    }
  return walls.map((_, i) => find(i));
}

// Outline segments [x1, y1, z1, x2, y2, z2, ...] for every box edge that is
// a real corner of the combined solid. Edges where two pieces meet flush
// (a seam) or that lie inside another piece are left out.
export function structureEdges(walls) {
  const out = [],
    eps = 0.02,
    boxes = walls.map(range);
  const solidIn = (p, near) =>
    p.y < 0 ||
    near.some(
      (w) =>
        p.y > (w.bottom || 0) && p.y < w.h && overlapsFootprint(w, p.x, p.z),
    );
  walls.forEach((w, i) => {
    // Ramps are outlined as one slope by the renderer; barriers are unseen.
    if (w.shape || w.ramp || w.hidden) return;
    const b = boxes[i],
      near = walls.filter((o, j) => {
        if (o.shape) return overlapsFootprint(o, w.x, w.z, Math.max(w.w, w.d));
        return ["x", "y", "z"].every(
          (k) =>
            boxes[j][k][0] <= b[k][1] + 0.05 &&
            b[k][0] <= boxes[j][k][1] + 0.05,
        );
      });
    for (const axis of ["x", "y", "z"]) {
      const [u, v] = ["x", "y", "z"].filter((k) => k !== axis);
      for (const su of [0, 1])
        for (const sv of [0, 1]) {
          const [lo, hi] = b[axis],
            pieces = Math.max(1, Math.ceil((hi - lo) / 0.25)),
            step = (hi - lo) / pieces,
            du = su ? 1 : -1,
            dv = sv ? 1 : -1;
          let start = null;
          for (let n = 0; n <= pieces; n++) {
            let visible = false;
            if (n < pieces) {
              const p = {
                  [axis]: lo + (n + 0.5) * step,
                  [u]: b[u][su],
                  [v]: b[v][sv],
                },
                q = (a, c) =>
                  solidIn(
                    { ...p, [u]: p[u] + a * eps, [v]: p[v] + c * eps },
                    near,
                  ),
                // Quadrants: the box's own is (-du, -dv).
                outU = q(du, -dv),
                outV = q(-du, dv),
                outUV = q(du, dv);
              const count = 1 + outU + outV + outUV;
              // Flush with a neighbor (a flat run) or buried: no corner.
              visible = !(count === 4 || (count === 2 && !outUV));
            }
            if (visible && start === null) start = lo + n * step;
            if (!visible && start !== null) {
              const end = lo + n * step,
                nudge = (k, s) => b[k][s] + (s ? 0.006 : -0.006);
              for (const t of [start, end])
                out.push(
                  ...["x", "y", "z"].map((k) =>
                    k === axis ? t : k === u ? nudge(u, su) : nudge(v, sv),
                  ),
                );
              start = null;
            }
          }
        }
    }
  });
  return out;
}
