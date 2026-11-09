import { CONFIG } from "./config.js";
import { WALLS, STEP, segmentBox, overlapsFootprint } from "./map.js";
const smooth = (t) => t * t * (3 - 2 * t);
function clearBody(p) {
  const r = CONFIG.playerRadius - 0.015;
  return !WALLS.some(
    (w) =>
      !w.soft &&
      w.h > p.y + 0.01 &&
      (w.bottom || 0) < p.y + 1.8 &&
      overlapsFootprint(w, p.x, p.z, r),
  );
}
// What you'd stand on at (x, z), no higher than `top`: the highest surface
// there, or the ground.
function floorBelow(x, z, top) {
  let floor = 0;
  for (const w of WALLS)
    if (
      !w.soft &&
      w.h <= top + 0.01 &&
      w.h > floor &&
      overlapsFootprint(w, x, z, 0)
    )
      floor = w.h;
  return floor;
}
// The first face in front must have a reachable top. A wide top is climbed
// onto; a thin one (a railing, a half wall) is vaulted: over it and down
// onto the floor just behind, if that's at most vaultDrop below its top.
// baseHeight is the footing the climb starts from (a minimum rise keeps a
// step from counting); reachFrom is how high you are now, so a jump reaches
// up to clamberHeight above its peak. Faces are probed every 0.25 m from the
// feet to arm's reach, so a thin deck with open space beneath it (a 0.3 m
// catwalk) still has an edge to grab; anything low enough to step onto (the
// next step of a ramp) is passed over rather than stopping the search.
export function findClamber(p, baseHeight = p.y, reachFrom = baseHeight) {
  const dx = -Math.sin(p.yaw),
    dz = -Math.cos(p.yaw);
  let hit = null;
  for (let up = 0.1; up <= 2.1; up += 0.25) {
    const a = { x: p.x, y: p.y + up, z: p.z },
      b = {
        x: a.x + dx * CONFIG.clamberReach,
        y: a.y,
        z: a.z + dz * CONFIG.clamberReach,
      };
    for (const w of WALLS) {
      if (w.soft || w.h <= p.y + STEP) continue;
      const t = segmentBox(a, b, w);
      if (t !== null && (!hit || t < hit.t)) hit = { w, t };
    }
    if (hit) break;
  }
  if (!hit || hit.w.style === "gardenFence") return null;
  const { w, t } = hit,
    r = CONFIG.playerRadius + 0.04,
    rise = w.h - baseHeight;
  if (
    rise < 0.5 ||
    w.h - Math.max(baseHeight, reachFrom) > CONFIG.clamberHeight ||
    w.h <= p.y + 0.05
  )
    return null;
  const inset = CONFIG.playerRadius + 0.06,
    along = CONFIG.clamberReach * t;
  let target;
  if (w.shape === "cylinder") target = { x: w.x, y: w.h, z: w.z };
  else if (w.w >= r * 2 && w.d >= r * 2)
    target = {
      x: Math.max(
        w.x - w.w / 2 + r,
        Math.min(w.x + w.w / 2 - r, p.x + dx * (along + inset)),
      ),
      y: w.h,
      z: Math.max(
        w.z - w.d / 2 + r,
        Math.min(w.z + w.d / 2 - r, p.z + dz * (along + inset)),
      ),
    };
  else {
    // Too thin to stand on: land just past its far side, clearing it (and
    // a sloped rail's taller next slice) by 25 cm.
    const thick = Math.abs(dx) * w.w + Math.abs(dz) * w.d,
      x = p.x + dx * (along + thick + inset + 0.05),
      z = p.z + dz * (along + thick + inset + 0.05),
      y = floorBelow(x, z, w.h);
    if (w.h - y > CONFIG.vaultDrop) return null;
    target = { x, y, z, over: w.h + 0.25 };
  }
  // Sweep the lift and the pull-over, using the same path as the simulation.
  const climb = { from: { x: p.x, y: p.y, z: p.z }, to: target };
  for (let i = 0; i <= 24; i++)
    if (!clearBody(clamberPosition(climb, i / 24))) return null;
  return target;
}
// Lift, then pull over. A vault (climb.to.over) lifts to just above the
// rail, crosses it, and drops onto the landing at the end.
export function clamberPosition(climb, t) {
  t = Math.max(0, Math.min(1, t));
  const { from, to } = climb;
  if (to.over === undefined) {
    const lift = smooth(Math.min(1, t / 0.65)),
      pull = smooth(Math.max(0, (t - 0.65) / 0.35));
    return {
      x: from.x + (to.x - from.x) * pull,
      y: from.y + (to.y - from.y) * lift,
      z: from.z + (to.z - from.z) * pull,
    };
  }
  const top = Math.max(to.over, to.y),
    lift = smooth(Math.min(1, t / 0.5)),
    pull = smooth(Math.min(1, Math.max(0, (t - 0.5) / 0.35))),
    drop = smooth(Math.max(0, (t - 0.85) / 0.15));
  return {
    x: from.x + (to.x - from.x) * pull,
    y: from.y + (top - from.y) * lift + (to.y - top) * drop,
    z: from.z + (to.z - from.z) * pull,
  };
}
