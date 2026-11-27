// Kite Day rules: the kite on its string, the wind and its gusts, the
// ribbons to fly through, the things to stay clear of, and (with two
// players) tangled strings. Kept free of DOM and Three.js so it can be
// tested in Node.
//
// The yard is seen side-on. x runs across (0 is the middle of the porch),
// y runs up from the grass. Each kite is tied to a spot on the porch and
// sits at the end of its string: angle `a` from straight up (positive
// leans right) and length `len`. Holding reel shortens the string and fills
// the kite with lift: it climbs back over your head and steadies. Letting
// go pays string out: the kite reaches farther, but with less lift it sags
// over to the side, sinks lower and wobbles. The wind leans every kite the
// way it blows, and a gust shoves it harder (the windsock and blowing
// leaves warn of one first). Steering pushes the kite sideways.

export const YARD_LEFT = -12;
export const YARD_RIGHT = 12;
export const YARD_TOP = 14.4;
export const PORCH_Y = 1.3; // where the string is held
export const HEDGE_Y = 1.7; // top of the hedges either side of the porch
export const PORCH_HALF = 2.6; // half the porch's width (no hedge there)
export const KITE_R = 0.45; // the kite's hitbox radius
export const MIN_LEN = 3;
export const MAX_LEN = 12.6;
export const START_LEN = 5;
export const ROUND_TIME = 120;
export const HEARTS = 3;
// After a bump: how long the kite tumbles, then how long it's safe.
export const TUMBLE_TIME = 1.8;
export const SAFE_TIME = 1.6;
export const TUG_COOLDOWN = 0.6;
const MAX_ANGLE = 1.42;

// The oak on the left (its canopy, as circles) and the power line on the
// right (a sagging wire between two poles, as straight pieces).
export const OAK = [
  { x: -10.4, y: 8.2, r: 2.3 },
  { x: -8.7, y: 10.3, r: 1.8 },
  { x: -11.2, y: 10.9, r: 1.6 },
];
export const OAK_TRUNK = { x: -10.2, top: 7 };
export const POLES = [
  { x: 5.6, y: 12.4 },
  { x: 12.4, y: 12.4 },
];
export const WIRE_SAG = 0.9;
export function wirePoints(n = 8) {
  const [a, b] = POLES;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f - WIRE_SAG * 4 * f * (1 - f),
    });
  }
  return pts;
}
const WIRE = wirePoints();

// base: how hard the steady breeze blows (it drifts between -base and
// +base). gust: how hard a gust shoves. gustEvery: seconds between gusts
// [min, max]; null for none. warn: seconds of warning before a gust.
// ribbonR: ribbon ring radius. crowEvery: seconds between crows, or null.
// hearts: false for no hearts to lose.
export const KITE_LEVELS = {
  easy: {
    name: "Breezy",
    base: 0.35,
    gust: 0.45,
    gustEvery: [7, 11],
    warn: 1.8,
    ribbonR: 1.05,
    crowEvery: null,
    hearts: false,
    wobble: 0.5,
  },
  normal: {
    name: "Gusty",
    base: 0.5,
    gust: 1.05,
    gustEvery: [4.5, 7.5],
    warn: 1.3,
    ribbonR: 0.85,
    crowEvery: [16, 24],
    hearts: true,
    wobble: 1,
  },
  hard: {
    name: "Blustery",
    base: 0.65,
    gust: 1.45,
    gustEvery: [3.2, 5.5],
    warn: 1.05,
    ribbonR: 0.72,
    crowEvery: [10, 16],
    hearts: true,
    wobble: 1.35,
  },
};
export const kiteLevel = (level) => KITE_LEVELS[level] || KITE_LEVELS.normal;

// The kite's handling. Reeling pulls string in at `reel` units/s and
// fills lift toward 1; letting go pays out at `payOut` and lift drains
// toward `slackLift`.
export const HANDLING = {
  reel: 3.4,
  payOut: 1.5,
  liftUp: 2.2,
  liftDown: 0.55,
  slackLift: 0.25,
  steer: 3.2, // angular push from steering
  spring: 3.4, // pull back toward the wind's lean
  sag: 2.2, // pull over to the side when slack
  damp: 2.6,
  lean: 0.55, // how far a wind of 1 leans the kite
  shove: 1.5, // how hard the wind pushes sideways
};

// Small seeded random generator (mulberry32) so a game can be replayed.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const between = (random, [lo, hi]) => lo + random() * (hi - lo);

// Where each player holds their string.
export const anchorsFor = (players) =>
  players === 2
    ? [
        { x: -1.6, y: PORCH_Y },
        { x: 1.6, y: PORCH_Y },
      ]
    : [{ x: 0, y: PORCH_Y }];

export function newKite(anchor) {
  return {
    anchor,
    a: 0.15 * Math.sign(anchor.x || 1),
    w: 0,
    len: START_LEN,
    lift: 1,
    x: anchor.x,
    y: anchor.y + START_LEN,
    score: 0,
    golds: 0,
    hearts: HEARTS,
    tumble: 0, // seconds left tumbling after a bump (0 when flying)
    safe: 0, // seconds left safe after coming back
    tug: 0, // tug cooldown
    bumped: null, // what it last hit: "oak" | "wire" | "hedge" | "crow"
    tangled: false,
    shake: 0, // a little random wobble, for the look
  };
}

// The steady breeze wanders slowly; gusts are scheduled ahead so the
// windsock can warn of each one.
export function newWind(level, random) {
  const s = kiteLevel(level);
  const wind = {
    s,
    random,
    t: 0,
    drift: random() * Math.PI * 2,
    gusts: [],
    next: s.gustEvery ? between(random, s.gustEvery) : Infinity,
  };
  planGusts(wind);
  return wind;
}

function planGusts(wind) {
  const { s, random } = wind;
  if (!s.gustEvery) return;
  while (wind.next < wind.t + 20) {
    const dir = random() < 0.5 ? -1 : 1;
    wind.gusts.push({
      at: wind.next,
      length: 1.4 + random() * 1.2,
      dir,
      power: s.gust * (0.75 + random() * 0.4),
    });
    wind.next += between(random, s.gustEvery);
  }
  wind.gusts = wind.gusts.filter((g) => g.at + g.length > wind.t - 1);
}

// The steady part of the wind at time t, -base..base, never quite still.
export function breezeAt(wind, t) {
  const { base } = wind.s;
  const v =
    Math.sin(t * 0.21 + wind.drift) * 0.7 +
    Math.sin(t * 0.53 + wind.drift * 2.3) * 0.3;
  return base * v;
}

// How hard a gust is blowing at time t (signed), easing in and out.
export function gustAt(wind, t) {
  let v = 0;
  for (const g of wind.gusts) {
    const f = (t - g.at) / g.length;
    if (f <= 0 || f >= 1) continue;
    v += g.dir * g.power * Math.sin(Math.PI * f) ** 0.6;
  }
  return v;
}

export const windAt = (wind, t) => breezeAt(wind, t) + gustAt(wind, t);

// The next gust that hasn't finished, if it's within its warning time
// (or already blowing): { dir, power, in } where `in` is seconds until it
// hits (0 once it's blowing).
export function gustWarning(wind, t = wind.t) {
  for (const g of wind.gusts) {
    if (g.at + g.length <= t) continue;
    const until = g.at - t;
    if (until > wind.s.warn) return null;
    return { dir: g.dir, power: g.power, in: Math.max(0, until) };
  }
  return null;
}

export function stepWind(wind, dt) {
  wind.t += dt;
  if (wind.next < wind.t + 20) planGusts(wind);
  return windAt(wind, wind.t);
}

// Where a kite would sit on a string of length len at angle a.
export const kitePoint = (anchor, len, a) => ({
  x: anchor.x + len * Math.sin(a),
  y: anchor.y + len * Math.cos(a),
});

// Steer: -1..1. reel: true while held. wind: the wind now.
export function stepKite(kite, input, wind, level, dt) {
  const h = HANDLING;
  const s = kiteLevel(level);
  kite.tug = Math.max(0, kite.tug - dt);
  kite.safe = Math.max(0, kite.safe - dt);
  if (kite.tumble > 0) {
    // Falling out of the sky, then fetched back to the porch.
    kite.tumble -= dt;
    kite.w += Math.sign(kite.a || 1) * 3 * dt;
    kite.a = clamp(kite.a + kite.w * dt, -MAX_ANGLE, MAX_ANGLE);
    kite.len = Math.max(MIN_LEN, kite.len - 1.2 * dt);
    Object.assign(kite, kitePoint(kite.anchor, kite.len, kite.a));
    kite.y = Math.max(0.4, kite.y - (TUMBLE_TIME - kite.tumble) * 5);
    if (kite.tumble <= 0) relaunch(kite, wind);
    return kite;
  }

  const reel = !!input.reel;
  const steer = clamp(input.steer || 0, -1, 1);
  if (reel) {
    kite.len = Math.max(MIN_LEN, kite.len - h.reel * dt);
    kite.lift = Math.min(1, kite.lift + h.liftUp * dt);
  } else {
    kite.len = Math.min(MAX_LEN, kite.len + h.payOut * dt);
    kite.lift = Math.max(h.slackLift, kite.lift - h.liftDown * dt);
  }
  if (input.tug && kite.tug <= 0) {
    kite.tug = TUG_COOLDOWN;
    kite.lift = 1;
    kite.len = Math.max(MIN_LEN, kite.len - 0.6);
    kite.w -= Math.sign(kite.a) * 0.9;
  }

  const lift = kite.lift;
  const target = clamp(wind * h.lean, -1, 1);
  // Slack string: the kite sags over toward whichever side it's leaning.
  const side = Math.sign(kite.a || wind || 1);
  const sag = h.sag * (1 - lift) * side * (0.35 + Math.abs(Math.sin(kite.a)));
  // A wobble that grows with slack, the wind and tangles.
  kite.shake += dt * (3 + Math.abs(wind) * 2);
  const wobble =
    s.wobble *
    (Math.sin(kite.shake * 2.3) + Math.sin(kite.shake * 3.7 + 1)) *
    (0.25 + (1 - lift) * 0.9 + (kite.tangled ? 1.4 : 0)) *
    (0.4 + Math.abs(wind));
  const accel =
    steer * h.steer * (kite.tangled ? 0.5 : 1) +
    h.spring * (0.35 + 0.65 * lift) * (target - kite.a) +
    wind * h.shove * 0.35 +
    sag +
    wobble * 0.6 -
    h.damp * kite.w;
  kite.w += accel * dt;
  kite.a += kite.w * dt;
  if (Math.abs(kite.a) > MAX_ANGLE) {
    kite.a = Math.sign(kite.a) * MAX_ANGLE;
    kite.w = 0;
  }
  let p = kitePoint(kite.anchor, kite.len, kite.a);
  // The edges of the yard (and the top of the sky) stop the kite.
  const xMax = YARD_RIGHT - KITE_R;
  const xMin = YARD_LEFT + KITE_R;
  if (p.x > xMax || p.x < xMin) {
    const edge = p.x > xMax ? xMax : xMin;
    const s2 = clamp((edge - kite.anchor.x) / kite.len, -1, 1);
    kite.a = Math.asin(s2);
    kite.w = 0;
    p = kitePoint(kite.anchor, kite.len, kite.a);
  }
  if (p.y > YARD_TOP - KITE_R) {
    kite.len = Math.max(
      MIN_LEN,
      (YARD_TOP - KITE_R - kite.anchor.y) / Math.cos(kite.a),
    );
    p = kitePoint(kite.anchor, kite.len, kite.a);
  }
  kite.x = p.x;
  kite.y = p.y;
  return kite;
}

function relaunch(kite, wind) {
  kite.tumble = 0;
  kite.safe = SAFE_TIME;
  kite.len = START_LEN;
  kite.lift = 1;
  kite.a = clamp((wind || 0) * HANDLING.lean, -0.6, 0.6);
  kite.w = 0;
  Object.assign(kite, kitePoint(kite.anchor, kite.len, kite.a));
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function segmentDistance(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const f = clamp(
    ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  return dist(px, py, a.x + dx * f, a.y + dy * f);
}

// What a kite at (x, y) is touching, if anything (crows passed in).
export function hazardAt(x, y, crows = []) {
  for (const c of OAK)
    if (dist(x, y, c.x, c.y) < c.r + KITE_R * 0.7) return "oak";
  for (let i = 1; i < WIRE.length; i++)
    if (segmentDistance(x, y, WIRE[i - 1], WIRE[i]) < KITE_R * 0.8)
      return "wire";
  if (y < HEDGE_Y + KITE_R * 0.4 && Math.abs(x) > PORCH_HALF) return "hedge";
  for (const c of crows)
    if (dist(x, y, c.x, c.y) < 0.55 + KITE_R) return "crow";
  return null;
}

// A bump: tumble, and lose a heart if loseHeart.
export function bump(kite, what, loseHeart = true) {
  kite.bumped = what;
  kite.tumble = TUMBLE_TIME;
  kite.w = Math.sign(kite.a || 1) * 1.5;
  if (loseHeart) kite.hearts = Math.max(0, kite.hearts - 1);
}

// Do two strings (anchor → kite) cross?
export function stringsCross(k1, k2) {
  const a = k1.anchor;
  const b = { x: k1.x, y: k1.y };
  const c = k2.anchor;
  const d = { x: k2.x, y: k2.y };
  const cross = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// --- Ribbons -------------------------------------------------------------
// Each ribbon is a ring floating somewhere a kite can reach, clear of the
// oak, the wire and the hedges. It hangs around for a while, then drifts
// off and a new one appears. Gold ones sit high and far out (a long, steady
// string) and are worth three.
export const RIBBON_LIFE = [9, 13];
export const GOLD_POINTS = 3;
export const ribbonCount = (players) => (players === 2 ? 5 : 3);
const COLORS = ["coral", "sky", "lime", "violet", "sun"];

export function makeRibbon(level, random, anchors, others = [], t = 0) {
  const s = kiteLevel(level);
  for (let tries = 0; tries < 200; tries++) {
    const anchor = anchors[Math.floor(random() * anchors.length)];
    const gold = random() < 0.18;
    const len = gold ? 10.4 + random() * 1.6 : MIN_LEN + 1.8 + random() * 6.6;
    const a = (random() * 2 - 1) * (gold ? 0.55 : 1.05);
    const p = kitePoint(anchor, len, a);
    const r = s.ribbonR * (gold ? 0.85 : 1);
    if (p.x < YARD_LEFT + r + 0.4 || p.x > YARD_RIGHT - r - 0.4) continue;
    if (p.y > YARD_TOP - r - 0.3 || p.y < HEDGE_Y + r + 1.4) continue;
    if (OAK.some((c) => dist(p.x, p.y, c.x, c.y) < c.r + r + 0.5)) continue;
    if (WIRE.some((w) => dist(p.x, p.y, w.x, w.y) < r + 0.9)) continue;
    if (others.some((o) => dist(p.x, p.y, o.x, o.y) < o.r + r + 1.6)) continue;
    return {
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      r,
      gold,
      color: gold ? "gold" : COLORS[Math.floor(random() * COLORS.length)],
      born: t,
      until: t + between(random, RIBBON_LIFE) * (gold ? 0.8 : 1),
      id: Math.floor(random() * 1e9),
    };
  }
  return null;
}

// --- Crows ---------------------------------------------------------------
// Now and then a crow flaps across the yard at some height. It starts
// CROW_LEAD units off the side, so its caw (and the arrow at the edge)
// gives warning before it flies in.
export const CROW_LEAD = 5.5;
export function makeCrow(random) {
  const dir = random() < 0.5 ? 1 : -1;
  return {
    dir,
    x: dir > 0 ? YARD_LEFT - CROW_LEAD : YARD_RIGHT + CROW_LEAD,
    y: 6 + random() * 6.5,
    speed: 2.6 + random() * 1.2,
    bob: random() * 6,
  };
}

// --- A whole game ----------------------------------------------------------
export function newGame(level, players = 1, seed = 1) {
  const random = seeded(seed);
  const anchors = anchorsFor(players);
  const game = {
    level,
    players,
    random,
    t: 0,
    timeLeft: ROUND_TIME,
    wind: newWind(level, random),
    windNow: 0,
    kites: anchors.map((a) => newKite(a)),
    ribbons: [],
    crows: [],
    nextCrow: kiteLevel(level).crowEvery
      ? between(random, kiteLevel(level).crowEvery)
      : Infinity,
    over: false,
  };
  game.windNow = windAt(game.wind, 0);
  for (const k of game.kites) (relaunch(k, game.windNow), (k.safe = 0));
  fillRibbons(game);
  return game;
}

function fillRibbons(game) {
  const anchors = game.kites.map((k) => k.anchor);
  while (game.ribbons.length < ribbonCount(game.players)) {
    const r = makeRibbon(
      game.level,
      game.random,
      anchors,
      [...game.ribbons, ...game.kites.map((k) => ({ x: k.x, y: k.y, r: 0.6 }))],
      game.t,
    );
    if (!r) break;
    game.ribbons.push(r);
  }
}

// Move the whole game on by dt. inputs: one { steer, reel, tug } per
// player. Returns the things that happened this step, for sounds and
// sparkles: [{ type: "ribbon", kite, ribbon } | { type: "bump", kite, what }
// | { type: "tangle" } | { type: "untangle" } | { type: "crow" } |
// { type: "over", why }].
export function stepGame(game, inputs, dt) {
  const events = [];
  if (game.over) return events;
  game.t += dt;
  game.timeLeft = Math.max(0, ROUND_TIME - game.t);
  game.windNow = stepWind(game.wind, dt);
  const s = kiteLevel(game.level);

  // Crows.
  if (game.t >= game.nextCrow) {
    game.crows.push(makeCrow(game.random));
    game.nextCrow = game.t + between(game.random, s.crowEvery);
    events.push({ type: "crow" });
  }
  for (const c of game.crows) {
    c.x += c.dir * c.speed * dt;
    c.bob += dt * 2.2;
    c.y += Math.sin(c.bob) * 0.4 * dt;
  }
  game.crows = game.crows.filter((c) =>
    c.dir > 0 ? c.x < YARD_RIGHT + 2 : c.x > YARD_LEFT - 2,
  );

  game.kites.forEach((k, i) =>
    stepKite(k, inputs[i] || {}, game.windNow, game.level, dt),
  );

  // Tangles (two players): crossed strings slow and shake both kites.
  if (game.kites.length === 2) {
    const [a, b] = game.kites;
    const crossed = !a.tumble && !b.tumble && stringsCross(a, b);
    if (crossed !== a.tangled)
      events.push({ type: crossed ? "tangle" : "untangle" });
    a.tangled = b.tangled = crossed;
  }

  for (const [i, k] of game.kites.entries()) {
    if (k.tumble > 0) continue;
    for (const r of [...game.ribbons]) {
      if (dist(k.x, k.y, r.x, r.y) > r.r + KITE_R * 0.4) continue;
      k.score += r.gold ? GOLD_POINTS : 1;
      if (r.gold) k.golds++;
      game.ribbons.splice(game.ribbons.indexOf(r), 1);
      events.push({ type: "ribbon", kite: i, ribbon: r });
    }
    if (k.safe > 0) continue;
    const what = hazardAt(k.x, k.y, game.crows);
    if (what) {
      bump(k, what, s.hearts && game.players === 1);
      events.push({ type: "bump", kite: i, what });
    }
  }

  game.ribbons = game.ribbons.filter((r) => r.until > game.t);
  fillRibbons(game);

  if (
    s.hearts &&
    game.players === 1 &&
    game.kites[0].hearts <= 0 &&
    !game.kites[0].tumble
  ) {
    game.over = true;
    events.push({ type: "over", why: "hearts" });
  } else if (game.timeLeft <= 0) {
    game.over = true;
    events.push({ type: "over", why: "time" });
  }
  return events;
}
