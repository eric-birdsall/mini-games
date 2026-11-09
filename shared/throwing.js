// Thrown gadgets fly a ballistic arc, bounce off walls, and detonate where they
// come to rest. The server and the client's aiming preview both use
// throwPath, so the preview shows exactly where the server will land it.
import { WALLS, overlapsFootprint } from "./map.js";
import { eyeHeight } from "./movement.js";

export const THROWABLE = [
  "smoke",
  "jammer",
  "flashbang",
  "noisemaker",
  "pulse",
];
export const THROW_GRAVITY = 9.8;
export const THROW_STEP = 1 / 60;
// Aiming at the horizon still lobs slightly upward, like a real underhand toss.
export const LOFT = 0.12;
const RADIUS = 0.08;
const BOUNCE = 0.35;
const MAX_TIME = 5;

const inside = (q) =>
  WALLS.find(
    (w) =>
      !w.soft &&
      q.y < w.h + RADIUS &&
      q.y > (w.bottom || 0) - RADIUS &&
      overlapsFootprint(w, q.x, q.z, RADIUS),
  );

// Launch speed that reaches `range` metres on flat ground at the ideal angle.
export const throwSpeed = (range) => Math.sqrt(THROW_GRAVITY * range);

// The points the aiming arc is drawn through. It skips the first few so the
// tube starts ahead of the camera, but a curve needs at least two points: a
// throw that lands right away (say, aimed down from a container roof) keeps
// its whole short path, and at worst gets one point just above the landing.
export function arcPoints(path, skip = 6) {
  const points =
    path.points.length > skip + 2 ? path.points.slice(skip) : path.points;
  if (points.length >= 2) return points;
  const { x, y, z } = path.landing;
  return [
    { x, y: y + 0.5, z },
    { x, y, z },
  ];
}
export function throwPath(p, range) {
  const pitch = Math.min(1.45, p.pitch + LOFT),
    speed = throwSpeed(range);
  let pos = {
      x: p.x - Math.sin(p.yaw) * 0.3,
      y: p.y + eyeHeight(p) - 0.15,
      z: p.z - Math.cos(p.yaw) * 0.3,
    },
    vel = {
      x: -Math.sin(p.yaw) * Math.cos(pitch) * speed,
      y: Math.sin(pitch) * speed,
      z: -Math.cos(p.yaw) * Math.cos(pitch) * speed,
    };
  // Pressed against a wall, release from the body instead of inside the wall.
  if (inside(pos)) pos = { ...pos, x: p.x, z: p.z };
  const points = [{ ...pos }];
  for (let t = 0; t < MAX_TIME; t += THROW_STEP) {
    vel.y -= THROW_GRAVITY * THROW_STEP;
    let next = {
      x: pos.x + vel.x * THROW_STEP,
      y: pos.y + vel.y * THROW_STEP,
      z: pos.z + vel.z * THROW_STEP,
    };
    if (next.y <= RADIUS) {
      points.push({ ...next, y: 0 });
      break;
    }
    const hit = inside(next);
    if (hit) {
      if (pos.y >= hit.h + RADIUS && vel.y < 0) {
        // Came down on top of cover or a container: rest there.
        points.push({ ...next, y: hit.h });
        break;
      }
      if (hit.bottom && pos.y <= hit.bottom - RADIUS && vel.y > 0) {
        vel.y *= -BOUNCE;
        next.y = pos.y;
      }
      // Struck a side: bounce back off whichever face it crossed.
      else if (hit.shape === "cylinder") {
        const range = Math.hypot(pos.x - hit.x, pos.z - hit.z) || 1,
          nx = (pos.x - hit.x) / range,
          nz = (pos.z - hit.z) / range,
          dot = vel.x * nx + vel.z * nz;
        vel.x = (vel.x - (1 + BOUNCE) * dot * nx) * 0.7;
        vel.z = (vel.z - (1 + BOUNCE) * dot * nz) * 0.7;
        next.x = pos.x;
        next.z = pos.z;
      } else if (Math.abs(pos.x - hit.x) >= hit.w / 2 + RADIUS) {
        vel.x *= -BOUNCE;
        vel.z *= 0.7;
        next.x = pos.x;
      } else {
        vel.z *= -BOUNCE;
        vel.x *= 0.7;
        next.z = pos.z;
      }
    }
    pos = next;
    points.push({ ...pos });
  }
  const landing = points[points.length - 1];
  return {
    points,
    landing: { x: landing.x, y: landing.y, z: landing.z },
    time: (points.length - 1) * THROW_STEP,
  };
}

// Where a projectile is after `elapsed` seconds along its path.
export function pathPosition(points, elapsed) {
  const f = Math.min(points.length - 1, elapsed / THROW_STEP),
    i = Math.floor(f),
    a = points[i],
    b = points[Math.min(points.length - 1, i + 1)],
    k = f - i;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
  };
}

// A forgiving underhand toss, shared by the server and landing preview.
// Facing across the court gently straightens the toss and keeps it lofty.
export function potatoPath(p, range = 15) {
  const forward = p.team === "attacker" ? 0 : Math.PI;
  const offset = Math.atan2(
    Math.sin(p.yaw - forward),
    Math.cos(p.yaw - forward),
  );
  return throwPath(
    {
      ...p,
      yaw: Math.abs(offset) < Math.PI / 2 ? forward + offset * 0.65 : p.yaw,
      pitch: Math.max(0.35, Math.min(0.65, p.pitch)),
    },
    range,
  );
}
