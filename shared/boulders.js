// Boulder Dash's channel (see PARTY.boulders in shared/party.js): one long,
// steep, straight channel built from a seed, so the server and every client
// build the same one from the map id alone ("boulders-<seed>"). It climbs
// north (-z) from a flat start pad to a landing at the top, where boulders
// come out of a portal and roll back down. Recesses cut into the side walls
// alternate left and right, further apart the higher you go.
//
// Distances along the channel are `s`: 0 at the foot of the slope, `length`
// at its top; the start pad is below 0 and the landing beyond `length`.
import { MAPS, ramp } from "./maps.js";
import { PARTY } from "./party.js";

const D = PARTY.boulders;
// The channel floor is WIDTH m wall to wall; each recess goes DEPTH m into
// its wall and is NOOK m long, room for both players.
export const WIDTH = 4;
export const DEPTH = 1.4;
export const NOOK = 2.6;
const T = 0.5,
  // Low garden fences; their boundary style prevents climbing out.
  WALL_UP = 2.2,
  START = 7,
  LANDING = 9,
  WALL_COLOR = "#c69a65";

export const bouldersMapId = (seed) => `boulders-${seed >>> 0}`;
export const isBouldersMap = (id) =>
  typeof id === "string" && id.startsWith("boulders-");
// Build (once) and register the channel a map id names.
export function ensureBouldersMap(id) {
  if (!isBouldersMap(id)) return null;
  if (!MAPS[id]) MAPS[id] = buildBoulders(Number(id.slice(9)) || 1);
  return MAPS[id];
}

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

export function buildBoulders(seed) {
  const rand = rng(seed),
    recesses = [];
  // The recesses, alternating walls (which one first is the seed's), each
  // gap a little longer than the last, give or take a metre.
  let s = 6,
    side = rand() < 0.5 ? -1 : 1;
  for (let i = 0; i < D.recesses; i++) {
    recesses.push({ id: i + 1, s: Math.round(s * 10) / 10, side });
    const f = i / Math.max(1, D.recesses - 2);
    s += D.gapMin + (D.gapMax - D.gapMin) * Math.min(1, f) + (rand() - 0.5) * 2;
    side = -side;
  }
  const length = Math.round((recesses.at(-1).s + 10) * 10) / 10,
    rise = D.slope * length,
    // The foot of the slope, with the whole thing centred on the origin.
    z0 = (length + LANDING - START) / 2,
    zOf = (s) => z0 - s,
    groundOf = (s) => D.slope * Math.max(0, Math.min(length, s)),
    outer = WIDTH / 2 + DEPTH;
  const walls = [
    // The slope itself, as wide as the channel and its recesses.
    ...ramp(0, z0, rise, { toward: "-z", length, width: outer * 2 }).map(
      (w) => ({ ...w, color: "#a88958" }),
    ),
    // The landing at the top.
    {
      x: 0,
      z: zOf(length + LANDING / 2),
      w: outer * 2,
      d: LANDING,
      h: rise,
      kind: "platform",
      color: "#a88958",
    },
    // The back wall behind the start pad, and the portal wall at the top.
    {
      x: 0,
      z: z0 + START + T / 2,
      w: (outer + T) * 2,
      d: T,
      h: WALL_UP,
      kind: "wall",
      style: "gardenFence",
      color: WALL_COLOR,
    },
    {
      x: 0,
      z: zOf(length + LANDING) - T / 2,
      w: (outer + T) * 2,
      d: T,
      h: rise + WALL_UP + 1.5,
      kind: "wall",
      style: "gardenFence",
      color: WALL_COLOR,
    },
  ];
  // The side walls: solid beside the channel, cut back to a thin back wall
  // where there's a recess. Pieces at most 8 m long, each as tall as the
  // floor at its top end needs.
  for (const sd of [-1, 1]) {
    const cuts = recesses
        .filter((r) => r.side === sd)
        .map((r) => [r.s - NOOK / 2, r.s + NOOK / 2]),
      marks = [-START, length + LANDING];
    for (const [a, b] of cuts) marks.push(a, b);
    for (let v = -START + 8; v < length + LANDING; v += 8) marks.push(v);
    marks.sort((a, b) => a - b);
    for (let i = 1; i < marks.length; i++) {
      const a = marks[i - 1],
        b = marks[i];
      if (b - a < 0.01) continue;
      const nook = cuts.some(([c0, c1]) => a >= c0 - 1e-6 && b <= c1 + 1e-6),
        w = nook ? T : DEPTH + T;
      walls.push({
        x: sd * (outer + T - w / 2),
        z: zOf((a + b) / 2),
        w,
        d: b - a,
        h: groundOf(b) + WALL_UP,
        kind: "wall",
        style: "gardenFence",
        color: WALL_COLOR,
      });
    }
  }
  for (const r of recesses)
    Object.assign(r, {
      x: r.side * (WIDTH / 2 + DEPTH / 2),
      z: zOf(r.s),
      y: groundOf(r.s),
    });
  const finishS = length + 1,
    spawnZ = z0 + 3;
  return {
    name: "Boulder Dash",
    tagline: "A backyard hill / boulders on the way down",
    brief: "Climb. Duck into the recesses. Dash for the next.",
    approaches: [],
    boulders: true,
    handPlaced: true,
    seed,
    size: { x: outer + T + 1, z: (START + length + LANDING) / 2 + T + 1 },
    walls,
    recesses,
    length,
    rise,
    z0,
    finishS,
    // Where boulders come out, near the portal.
    releaseS: length + LANDING - 2.2,
    finish: { x: 0, z: zOf(finishS) },
    spawns: {
      attacker: { x: -1, z: spawnZ },
      defender: { x: 1, z: spawnZ },
    },
    spawnYaw: { attacker: 0, defender: 0 },
    objective: { x: 0, z: zOf(finishS) },
    // Nobody is held behind a line; the race holds them itself.
    buyLines: { attacker: -1e4, defender: 1e4 },
    region: () => "channel",
    botRoute: [],
    botRoutes: [],
    botSpots: {},
    routeProfiles: [],
    passages: [],
  };
}
// How far up the channel a point is, and where `s` is.
export const sOf = (map, z) => map.z0 - z;
export const zOf = (map, s) => map.z0 - s;
// The height of the floor `s` m up the channel.
export const groundAt = (map, s) =>
  D.slope * Math.max(0, Math.min(map.length, s));
// A boulder's lane: a full-width one fills the channel; a half-width one
// rolls down the middle of its half (half -1 is west, 1 east).
export const laneX = (half) => (half * WIDTH) / 4;
