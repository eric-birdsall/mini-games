import { eyeHeight } from "./movement.js";
import { CONFIG } from "./config.js";
// Solid cuboids serve rendering, collision, placement, and authoritative sight tests.
export const WALLS = [
  { x: -19, z: 0, w: 1, d: 54, h: 4, kind: "wall" },
  { x: 19, z: 0, w: 1, d: 54, h: 4, kind: "wall" },
  { x: 0, z: 27, w: 39, d: 1, h: 4, kind: "wall" },
  { x: 0, z: -27, w: 39, d: 1, h: 4, kind: "wall" },
  { x: -6, z: 6, w: 0.6, d: 20, h: 3.8, kind: "building" },
  { x: -13, z: 16, w: 14, d: 0.6, h: 3.8, kind: "building" },
  { x: -15, z: -4, w: 8, d: 0.6, h: 3.8, kind: "building" },
  { x: -11, z: 5, w: 5, d: 1, h: 3.8, kind: "building" },
  { x: -16, z: 10, w: 4, d: 1, h: 3.8, kind: "building" },
  { x: 7, z: 10, w: 4, d: 6, h: 2.5, kind: "container" },
  { x: 13, z: 0, w: 4, d: 8, h: 2.5, kind: "container" },
  { x: 8, z: -7, w: 4, d: 3, h: 1.1, kind: "cover" },
  { x: 1, z: 8, w: 3, d: 1.2, h: 1.1, kind: "cover" },
  { x: -1, z: 0, w: 3, d: 1.2, h: 1.1, kind: "cover" },
  { x: 1, z: -5, w: 2.5, d: 1.2, h: 1.1, kind: "cover" },
  { x: -11, z: -12, w: 4, d: 5, h: 2.5, kind: "container" },
  { x: 6, z: -19, w: 1, d: 7, h: 3.8, kind: "building" },
  { x: 11, z: -22, w: 10, d: 1, h: 3.8, kind: "building" },
  { x: -4, z: -20, w: 5, d: 1, h: 1.1, kind: "cover" },
  { x: 13, z: 18, w: 3, d: 2, h: 1.1, kind: "cover" },
  { x: 15, z: -13, w: 3, d: 3, h: 1.1, kind: "cover" },
  { x: -15, z: -21, w: 3, d: 2, h: 1.1, kind: "cover" },
];
// Inner half-extents of the active map's floor (set by useMap in maps.js).
export const BOUNDS = { x: 18.5, z: 26.5 };
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Shape-aware footprint shared by movement, landings, decoys and throwing.
export function overlapsFootprint(w, x, z, radius = 0) {
  if (w.shape === "cylinder")
    return Math.hypot(x - w.x, z - w.z) < w.w / 2 + radius;
  return (
    Math.abs(x - w.x) < w.w / 2 + radius && Math.abs(z - w.z) < w.d / 2 + radius
  );
}
export function segmentBox(a, b, box, pad = 0) {
  if (box.shape === "cylinder") {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      ox = a.x - box.x,
      oz = a.z - box.z,
      r = box.w / 2 + pad,
      aa = dx * dx + dz * dz,
      cc = ox * ox + oz * oz - r * r;
    let lo = 0,
      hi = 1;
    if (aa < 1e-12) {
      if (cc > 0) return null;
    } else {
      const bb = 2 * (ox * dx + oz * dz),
        disc = bb * bb - 4 * aa * cc;
      if (disc < 0) return null;
      lo = Math.max(lo, (-bb - Math.sqrt(disc)) / (2 * aa));
      hi = Math.min(hi, (-bb + Math.sqrt(disc)) / (2 * aa));
    }
    const dy = b.y - a.y,
      bottom = (box.bottom || 0) - pad,
      top = box.h + pad;
    if (Math.abs(dy) < 1e-12) {
      if (a.y < bottom || a.y > top) return null;
    } else {
      const t1 = (bottom - a.y) / dy,
        t2 = (top - a.y) / dy;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    }
    return lo <= hi ? lo : null;
  }
  let lo = 0,
    hi = 1;
  for (const [key, min, max] of [
    ["x", box.x - box.w / 2 - pad, box.x + box.w / 2 + pad],
    ["y", (box.bottom || 0) - pad, box.h + pad],
    ["z", box.z - box.d / 2 - pad, box.z + box.d / 2 + pad],
  ]) {
    const v = b[key] - a[key];
    if (Math.abs(v) < 1e-8) {
      if (a[key] < min || a[key] > max) return null;
    } else {
      let t1 = (min - a[key]) / v,
        t2 = (max - a[key]) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1);
      hi = Math.min(hi, t2);
      if (lo > hi) return null;
    }
  }
  return lo;
}
export function smokeBlocks(a, b, smokes) {
  return smokes.some((s) => {
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((s.x - a.x) * dx + (s.z - a.z) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
    return (
      Math.hypot(a.x + t * dx - s.x, a.z + t * dz - s.z) < s.radius &&
      a.y + (b.y - a.y) * t < 4
    );
  });
}
// Whether a looks through to b. `viewer` is the looking side, for one-way
// glass: a wall with oneWay: "attacker" is see-through to infiltrators only.
// See-through walls (`see`: fences, gates, railings) never block sight; both
// still block movement, shots and throws (see clearShot).
export function clearSight(a, b, smokes = [], viewer = null) {
  return (
    !WALLS.some(
      (w) =>
        !w.see &&
        !(viewer && w.oneWay === viewer) &&
        segmentBox(a, b, w) !== null,
    ) && !smokeBlocks(a, b, smokes)
  );
}
// Whether something physical (a throw, a reach, a wire) gets from a
// to b: every wall blocks it, see-through or not.
export function clearShot(a, b, smokes = []) {
  return (
    !WALLS.some((w) => segmentBox(a, b, w) !== null) &&
    !smokeBlocks(a, b, smokes)
  );
}
// Whether a ceiling too low to stand under (a crawl vent's lid) is over you.
export function lowCeiling(p) {
  return WALLS.some(
    (w) =>
      !w.soft &&
      w.bottom > p.y + 0.1 &&
      w.bottom < p.y + CONFIG.standingEye + 0.15 &&
      overlapsFootprint(w, p.x, p.z, CONFIG.playerRadius),
  );
}
// Ledges up to STEP above your feet are stepped onto, so stairs (and low
// lips) can be walked up; anything taller blocks you.
export const STEP = 0.45;
export function movePlayer(p, dx, dz) {
  const radius = 0.32,
    over = (x, z, w) => overlapsFootprint(w, x, z, radius);
  // Soft pieces (hedges) are pushed through; everything else is solid.
  const allowed = (x, z) =>
    !WALLS.some(
      (w) =>
        !w.soft &&
        w.h - p.y > STEP &&
        (w.bottom || 0) < p.y + eyeHeight(p) + 0.15 &&
        over(x, z, w),
    );
  if (allowed(p.x + dx, p.z)) p.x += dx;
  if (allowed(p.x, p.z + dz)) p.z += dz;
  for (const w of WALLS)
    if (!w.soft && w.h > p.y && w.h - p.y <= STEP && over(p.x, p.z, w)) {
      p.y = w.h;
      p.vy = 0;
      p.grounded = true;
    }
  // Walking down a ramp: stay on it rather than hopping off each column.
  if (!p.grounded || p.vy > 0) return;
  let floor = 0;
  for (const w of WALLS)
    if (!w.soft && w.h <= p.y + 0.001 && over(p.x, p.z, w))
      floor = Math.max(floor, w.h);
  if (p.y - floor <= 0.15) p.y = floor;
}
export function raySurface(p, range = 7) {
  const a = { x: p.x, y: p.y + eyeHeight(p), z: p.z };
  const dir = {
    x: -Math.sin(p.yaw) * Math.cos(p.pitch),
    y: Math.sin(p.pitch),
    z: -Math.cos(p.yaw) * Math.cos(p.pitch),
  };
  const b = {
    x: a.x + dir.x * range,
    y: a.y + dir.y * range,
    z: a.z + dir.z * range,
  };
  let t = Infinity,
    wall = null;
  for (const w of WALLS) {
    if (w.soft) continue;
    const hit = segmentBox(a, b, w);
    if (hit !== null && hit < t) {
      t = hit;
      wall = w;
    }
  }
  if (dir.y < 0) {
    const ground = -a.y / (dir.y * range);
    if (ground >= 0 && ground <= 1 && ground < t) {
      t = ground;
      wall = null;
    }
  }
  if (t > 1) return null;
  const point = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
  let normal = { x: 0, y: 1, z: 0 };
  if (wall) {
    const sides = [
      {
        v: Math.abs(point.x - (wall.x - wall.w / 2)),
        n: { x: -1, y: 0, z: 0 },
      },
      { v: Math.abs(point.x - (wall.x + wall.w / 2)), n: { x: 1, y: 0, z: 0 } },
      {
        v: Math.abs(point.z - (wall.z - wall.d / 2)),
        n: { x: 0, y: 0, z: -1 },
      },
      { v: Math.abs(point.z - (wall.z + wall.d / 2)), n: { x: 0, y: 0, z: 1 } },
      { v: Math.abs(point.y - wall.h), n: { x: 0, y: 1, z: 0 } },
      { v: Math.abs(point.y - (wall.bottom || 0)), n: { x: 0, y: -1, z: 0 } },
    ];
    if (wall.shape === "cylinder") {
      const radial = Math.hypot(point.x - wall.x, point.z - wall.z) || 1;
      sides.splice(0, 4, {
        v: Math.abs(radial - wall.w / 2),
        n: {
          x: (point.x - wall.x) / radial,
          y: 0,
          z: (point.z - wall.z) / radial,
        },
      });
    }
    normal = sides.sort((a, b) => a.v - b.v)[0].n;
  }
  return { ...point, normal, wall: !!wall };
}
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
