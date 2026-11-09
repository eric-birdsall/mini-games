// Breakout's course (see PARTY.breakout in shared/party.js): one long,
// straight hallway running north, three lanes wide, built from a seed so the
// server and every client build the same one from the map id alone
// ("breakout-<seed>").
//
// The runner runs on their own (auto run) and only picks a lane and jumps.
// The obstacles are fixed hurdles across one or two of the three lanes,
// never all three. Low ones can be jumped; tall ones can't, so you switch to
// an open lane. Hurdles are walls like any other, and are listed as hazards
// too (the server checks for running into them, the bot reads them).
import { MAPS } from "./maps.js";
import { PARTY } from "./party.js";

const B = PARTY.breakout;
// Three lanes, LANE m apart, filling the hallway's floor; walls T thick.
export const LANE = 1.7;
export const LANES = [-1, 0, 1];
export const WIDTH = LANE * LANES.length;
export const HALF = WIDTH / 2;
const T = 0.4,
  WALL_H = 4,
  // Darker than the floor, so the hallway's shape reads at a run.
  WALL_COLOR = "#5f6672",
  BOOTH = 3;
// A low hurdle (jump it) and a tall one (well over a running jump: go
// around).
export const HURDLE_H = 0.4;
export const TALL_H = 2;
export const HURDLE_D = 0.35;
export const OBSTACLES = ["hurdle"];
const LOW_COLOR = "#d8692c",
  TALL_COLOR = "#7a4fc9";
// A lane's x (-1 west, 0 middle, 1 east).
export const laneX = (lane) => lane * LANE;
export const nearestLane = (x) =>
  Math.max(-1, Math.min(1, Math.round(x / LANE)));

export const breakoutMapId = (seed) => `breakout-${seed >>> 0}`;
export const isBreakoutMap = (id) =>
  typeof id === "string" && id.startsWith("breakout-");
// Build (once) and register the course a map id names.
export function ensureBreakoutMap(id) {
  if (!isBreakoutMap(id)) return null;
  if (!MAPS[id]) MAPS[id] = buildBreakout(Number(id.slice(9)) || 1);
  return MAPS[id];
}
export const newSeed = () => 1 + Math.floor(Math.random() * 0x7ffffffe);

// A small seeded generator (mulberry32).
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBreakout(seed) {
  const rand = rng(seed),
    // Room behind the start line for the camera, then the run, then a
    // little past the exit.
    startS = 8,
    finishS = startS + B.length,
    length = finishS + 4,
    // Built with the back wall at z = 0 and the hallway heading north (-z),
    // then centred on the origin.
    oz = -length / 2,
    z0 = -oz,
    wall = (x, z, w, d, extra = {}) => ({
      x,
      z,
      w,
      d,
      h: WALL_H,
      kind: "wall",
      color: WALL_COLOR,
      ...extra,
    });
  const walls = [
    // Down each side, and across both ends.
    wall(-HALF - T / 2, 0, T, length + 2 * T),
    wall(HALF + T / 2, 0, T, length + 2 * T),
    wall(0, z0 + T / 2, WIDTH + 2 * T, T),
    wall(0, -z0 - T / 2, WIDTH + 2 * T, T),
  ];
  // The one watching waits in a sealed booth off to the side.
  const bx = -HALF - T - 2 - BOOTH / 2,
    bz = z0 - BOOTH;
  walls.push(
    wall(bx - BOOTH / 2 - T / 2, bz, T, BOOTH + 2 * T),
    wall(bx + BOOTH / 2 + T / 2, bz, T, BOOTH + 2 * T),
    wall(bx, bz - BOOTH / 2 - T / 2, BOOTH + 2 * T, T),
    wall(bx, bz + BOOTH / 2 + T / 2, BOOTH + 2 * T, T),
  );

  // Hurdles all the way along: a clear stretch off the line, then one every
  // gap m (closing up along the hall), never too close to the end. Each
  // blocks one lane or two side by side, so one lane is always open.
  const hazards = [],
    lerp = (a, b, f) => a + (b - a) * f;
  let s = startS + B.firstHurdle,
    id = 1;
  while (s < finishS - 6) {
    const z = z0 - s,
      f = (s - startS) / B.length,
      tall = id > B.lowFirst && rand() < lerp(B.tall[0], B.tall[1], f),
      wide = rand() < 0.5,
      // One lane (any of the three), or two (west pair or east pair).
      lanes = wide
        ? rand() < 0.5
          ? [-1, 0]
          : [0, 1]
        : [LANES[Math.floor(rand() * 3)]],
      x = (laneX(lanes[0]) + laneX(lanes.at(-1))) / 2,
      w = lanes.length * LANE,
      h = tall ? TALL_H : HURDLE_H;
    walls.push({
      x,
      z,
      w,
      d: HURDLE_D,
      h,
      kind: "cover",
      color: tall ? TALL_COLOR : LOW_COLOR,
      breakout: "hurdle",
    });
    hazards.push({ id: id++, type: "hurdle", x, z, s, w, h, tall, lanes });
    const gap = [
      lerp(B.hurdleGap[0], B.hurdleGapEnd[0], f),
      lerp(B.hurdleGap[1], B.hurdleGapEnd[1], f),
    ];
    s += gap[0] + rand() * (gap[1] - gap[0]);
    s = Math.round(s * 10) / 10;
  }

  // The way through: up the middle lane, back wall to end wall.
  const path = withLengths([
      { x: 0, z: z0 },
      { x: 0, z: -z0 },
    ]),
    finish = pathAt(path, finishS),
    start = pathAt(path, startS);
  return {
    name: "Breakout",
    tagline: "Three lanes / run as far as you can",
    brief:
      "Auto run. Jump the logs, switch lanes around the hay bales. Hit one and you're out.",
    approaches: [],
    breakout: true,
    handPlaced: true,
    seed,
    size: { x: Math.abs(bx) + BOOTH / 2 + T + 1, z: z0 + T + 1 },
    walls,
    hazards,
    path,
    startS,
    finishS,
    finish: { x: finish.x, z: finish.z },
    spawns: {
      attacker: { x: start.x, z: start.z },
      defender: { x: bx, z: bz },
    },
    spawnYaw: { attacker: 0, defender: 0 },
    objective: { x: finish.x, z: finish.z - 1 },
    // Nobody is held behind a line; the run holds them itself.
    buyLines: { attacker: -1e4, defender: 1e4 },
    region: () => "hallway",
    botRoute: [],
    botRoutes: [],
    botSpots: {},
    routeProfiles: [],
    passages: [],
  };
}

// The path's points with the distance along it to each.
function withLengths(points) {
  let s = 0;
  const out = points.map((p, i) => {
    if (i) s += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    return { x: p.x, z: p.z, s };
  });
  return { points: out, length: s };
}
// Where on the path `s` m along it is, and which way it heads there (as a
// yaw: 0 is north, -z).
export function pathAt(path, s) {
  const pts = path.points;
  s = Math.max(0, Math.min(path.length, s));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    if (s <= b.s || i === pts.length - 1) {
      const len = b.s - a.s || 1,
        f = Math.max(0, Math.min(1, (s - a.s) / len)),
        dx = b.x - a.x,
        dz = b.z - a.z;
      return {
        x: a.x + dx * f,
        z: a.z + dz * f,
        yaw: Math.atan2(-dx, -dz),
      };
    }
  }
  return { x: pts[0].x, z: pts[0].z, yaw: 0 };
}
// How far along the path a point is: the nearest point on the nearest
// stretch.
export function progressOf(path, p) {
  const pts = path.points;
  let best = Infinity,
    at = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      len2 = dx * dx + dz * dz || 1,
      f = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2),
      ),
      d = Math.hypot(a.x + dx * f - p.x, a.z + dz * f - p.z);
    if (d < best - 1e-6) {
      best = d;
      at = a.s + f * Math.sqrt(len2);
    }
  }
  return at;
}
