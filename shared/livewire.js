// Beach Ball Dodge (party kind "livewire") shares the float, pool, throw
// schedule and ball paths between client and server.
//
// Both players stand on a pool float. Bots on the pool deck throw beach
// balls straight across the pool, either along z (up and down the screen) or
// along x (side to side), never in an arc. A ball flies down one straight
// "lane": stand anywhere out of it and it misses you. One that hits you
// shoves you on in its direction; off the float is the pool water.
import { PARTY } from "./party.js";

const L = PARTY.livewire;
// Half the float's width (m), the distance from the centre to each side of
// the pool, and how high the float's top stands over the pool floor.
export const PLAT = L.platform / 2;
export const ARENA = PLAT + L.moat;
export const PLAT_H = 0.65;
// A ball's radius, and the height its middle flies at.
export const BALL_R = L.ballRadius;
export const BALL_Y = PLAT_H + L.ballHeight;
// How far from a lane's middle a ball still hits you (your middle).
export const HIT_HALF = L.ballRadius + L.hitPad;
// The farthest a lane can be from the float's centre line.
export const LANE_MAX = PLAT - 0.3;
// Fallen: this far below the float's top (and beyond the reach of a step
// back up onto it), you're in the pool water.
export const FALLEN_Y = PLAT_H - 0.5;

// A small seeded generator (mulberry32).
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which wave `t` s into the run falls in (1, 2, …), and what that wave sends:
// how fast, how often, which way balls may fly and what patterns can come.
export const waveAt = (t) => Math.floor(Math.max(0, t) / L.waveSeconds) + 1;
export function waveRules(wave) {
  const w = L.waves[Math.min(wave, L.waves.length) - 1],
    past = Math.max(0, wave - L.waves.length);
  return {
    speed: w.speed + past * L.speedStep,
    gap: Math.max(L.minGap, w.gap - past * L.gapStep),
    axes: w.axes,
    patterns: w.patterns,
  };
}

// A ball: `axis` is the one it flies along ("z": up and down the screen;
// "x": side to side), `dir` the way it goes (+1 or -1) and `lane` where it
// crosses that axis (its x for a "z" ball, its z for an "x" ball). Its bot
// lifts it at its side of the pool from `at`, and throws it at `launch`.
// Where it is along its axis at time t (in the bot's hands until launch).
export const wireStart = (w) => -w.dir * ARENA;
export const wireAt = (w, t) =>
  wireStart(w) + w.dir * w.speed * Math.max(0, t - w.launch);
// When it reaches the far side and is gone.
export const wireEnd = (w) => w.launch + (2 * ARENA) / w.speed;
// The stretch of time it spends over the float.
const overPlatform = (w) => [
  w.launch + L.moat / w.speed,
  w.launch + (L.moat + L.platform) / w.speed,
];

// Keep a lane on the float.
export const clampLane = (x) => Math.max(-LANE_MAX, Math.min(LANE_MAX, x));
// The second of two balls thrown side by side: `offset` m from the first,
// or the other way if that would be off the float.
export const partnerLane = (first, offset) =>
  Math.round(
    (Math.abs(first + offset) <= LANE_MAX ? first + offset : first - offset) *
      100,
  ) / 100;
// Where a player's middle can be and still stand on the float.
const STAND = PLAT - 0.35;
// Lanes along one axis that leave somewhere to stand: the widest stretch
// across the float that none of them reaches is at least this wide (m).
export const ROOM = 0.6;
export function leavesRoom(lanes) {
  const cuts = lanes
    .map((l) => [l - HIT_HALF, l + HIT_HALF])
    .sort((a, b) => a[0] - b[0]);
  let from = -STAND,
    widest = 0;
  for (const [a, b] of cuts) {
    widest = Math.max(widest, Math.min(a, STAND) - from);
    from = Math.max(from, b);
  }
  return Math.max(widest, STAND - from) >= ROOM;
}
// Every ball of a run, in launch order, up to `until` s. Each wave's gap
// separates one group of throws from the next; a group is a single ball, a
// double (two bots on the same side throwing together, doubleSpread m or
// more apart), a cross (one along each axis together) or, from the last
// wave on, a triple (a double crossed by a single). Never more than maxLive
// balls over the float at once: a group that would make it more waits.
//
// Lanes are picked when each bot lifts its ball (see settleLane): `aim`
// balls go where player `target` (0 or 1) stands then, others to `lane`, a
// random spot. A double's second ball follows its `partner`, `offset` m
// away.
export function wireSchedule(seed, until = 600) {
  const rand = rng(seed),
    wires = [],
    pick = (list) => list[Math.floor(rand() * list.length) % list.length],
    side = () => (rand() < 0.5 ? -1 : 1),
    spot = () => Math.round((rand() * 2 - 1) * LANE_MAX * 100) / 100;
  let t = L.firstAt,
    id = 1,
    target = 0;
  while (t < until) {
    const wave = waveAt(t),
      rules = waveRules(wave),
      pattern = pick(rules.patterns),
      speed = rules.speed,
      axis = pick(rules.axes),
      other = axis === "z" ? "x" : "z",
      dir = side(),
      // Each group's balls, as [axis, dir, partnered].
      group =
        pattern === "double"
          ? [
              [axis, dir, false],
              [axis, dir, true],
            ]
          : pattern === "cross"
            ? [
                [axis, dir, false],
                [other, side(), false],
              ]
            : pattern === "triple"
              ? [
                  [axis, dir, false],
                  [axis, dir, true],
                  [other, side(), false],
                ]
              : [[axis, dir, false]];
    let launch = t + L.warnSeconds;
    const live = (at) =>
      wires.filter((w) => {
        const [a, b] = overPlatform(w);
        return a < at + 0.01 && b > at - 0.01;
      }).length;
    // Over the float, this group adds its balls to whatever's there.
    const fits = (start) => {
      const [a, b] = overPlatform({ launch: start, speed });
      for (const at of [a, b, (a + b) / 2])
        if (live(at) + group.length > L.maxLive) return false;
      return true;
    };
    while (!fits(launch)) launch += 0.25;
    const first = id;
    for (const [ax, d, partnered] of group) {
      const ball = {
        id: id++,
        axis: ax,
        dir: d,
        speed,
        at: launch - L.warnSeconds,
        launch,
        lane: spot(),
      };
      if (partnered) {
        ball.partner = first;
        ball.offset =
          side() *
          Math.round((L.doubleSpread + rand() * 0.6) * 100) / 100;
      } else {
        ball.aim = rand() < L.aimChance;
        // Aimed balls take turns between the players.
        ball.target = ball.aim ? target++ % 2 : 0;
      }
      wires.push(ball);
    }
    t = launch - L.warnSeconds + rules.gap;
  }
  return wires.sort((a, b) => a.launch - b.launch || a.id - b.id);
}

// Where a ball's lane ends up once its bot lifts it at time `t`: at the
// targeted player's spot (`spots` lists the players' positions in turn
// order), beside its partner, or the random spot it was given. If that
// would close off the last place to stand across the float from the other
// balls along its axis still to come (or held up), it goes down the same
// lane as the nearest of them instead, so there's always somewhere safe.
export function settleLane(w, spots, balls, t = w.at) {
  let lane;
  if (w.partner) {
    const first = balls.find((b) => b.id === w.partner);
    lane = partnerLane(first ? first.lane : 0, w.offset);
  } else {
    const p = w.aim ? spots[w.target % Math.max(1, spots.length)] : null;
    lane = p ? clampLane(Math.round(across(w, p) * 100) / 100) : w.lane;
  }
  const others = balls
    .filter(
      (b) =>
        b !== w &&
        b.settled &&
        b.axis === w.axis &&
        b.at <= t &&
        wireAt(b, t) * b.dir < PLAT + HIT_HALF,
    )
    .map((b) => b.lane);
  if (!others.length || leavesRoom([...others, lane])) return lane;
  return others.reduce((a, b) =>
    Math.abs(b - lane) < Math.abs(a - lane) ? b : a,
  );
}

// How far a ball going `speed` m/s shoves whoever it hits (m).
export const shoveDistance = (speed) =>
  L.shove + Math.max(0, speed - L.waves[0].speed) * L.shoveGrowth;
// Where a player is along a ball's axis, and across it.
export const along = (w, p) => (w.axis === "z" ? p.z : p.x);
export const across = (w, p) => (w.axis === "z" ? p.x : p.z);
// Whether a player who went from `a` to `b` this tick was in the ball's
// lane (within HIT_HALF of it, plus `pad`).
export function inLane(w, a, b, pad = 0) {
  const lo = Math.min(across(w, a), across(w, b)),
    hi = Math.max(across(w, a), across(w, b)),
    reach = HIT_HALF + pad;
  return hi >= w.lane - reach && lo <= w.lane + reach;
}
// Whether ball `w`, moving from `from` to `to` along its axis this tick,
// reaches a player who went from `a` to `b` along it: their paths cross (or
// end up within catchReach).
export function catches(w, from, to, a, b) {
  const before = from - a,
    after = to - b;
  return (
    Math.sign(before) !== Math.sign(after) ||
    Math.abs(after) < L.catchReach ||
    Math.abs(before) < L.catchReach
  );
}
// Whether a point is on the float (with a player's radius of overhang).
export const onPlatform = (x, z, r = 0) =>
  Math.abs(x) < PLAT + r && Math.abs(z) < PLAT + r;
