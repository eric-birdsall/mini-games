// Leaf Piles rules: the yard, falling leaves, raking, the leaf blower,
// scoring and the computer neighbours. Kept free of DOM and Three.js so it
// can be tested in Node.
//
// Four players share one square yard, one corner each. Leaves drift down
// from the trees around the fence and settle on the grass. Swing your rake
// and the leaves in front of you slide off the way you're facing. Whatever
// is lying in your corner when the timer runs out is your pile: a leaf is 1,
// a golden leaf 5. Piles aren't safe, so anyone can rake leaves back out of
// a rival's corner right up to the end. Best of three rounds.
//
// Coordinates: x runs left to right across the screen, z from the back fence
// (negative) to the front (positive). Critters face -z at rotation 0, so a
// facing angle f points along (-sin f, -cos f).

export const PLAYERS = 4;
export const YARD = 7; // half the yard's width: the fence is at ±YARD
export const CORNER_RADIUS = 3; // a corner pile is everything this close to it
export const ROUND_TIME = 60;
export const ROUNDS = 3;
export const WINS_NEEDED = 2;
export const GOLD_VALUE = 5;
export const PLAYER_RADIUS = 0.42;
export const WALK_SPEED = 3.6;
export const STEP = 1 / 60;

// The rake: a swing reaches REACH in front of you across ±ARC, and the
// leaves it catches slide about SLIDE metres the way you're facing.
export const RAKE = { reach: 1.65, arc: 1.05, slide: 3.1, cooldown: 0.4 };
// The leaf blower: hold the button and leaves in a long, wide cone keep
// blowing away from you, for BLOWER.time seconds.
export const BLOWER = {
  time: 6,
  reach: 2.8,
  arc: 0.75,
  push: 9,
  first: 14, // seconds into a round before the first one appears
  every: 16, // seconds after one is used before the next appears
  pickup: 0.75,
};
// People's swings within this angle of their own corner aim right at it.
export const ASSIST = 0.45;
const FRICTION = 3.2; // how fast a sliding leaf slows down (per second)
const FALL_TIME = 2.6;
const FALL_HEIGHT = 4.2;
const START_LEAVES = 30;
const FALLING_LEAVES = 150;
const GOLD_CHANCE = 0.05;
const LAST_FALL = ROUND_TIME - 6;

// Corners in play order: 0 front-left (you), 1 back-left, 2 back-right,
// 3 front-right (player 2 in a two-player game).
export const CORNERS = [
  { x: -YARD, z: YARD },
  { x: -YARD, z: -YARD },
  { x: YARD, z: -YARD },
  { x: YARD, z: YARD },
];

// The trees around the yard (just outside the fence) that the leaves fall
// from: two along each side.
export const TREES = [
  { x: -3.5, z: -YARD - 1.4 },
  { x: 3.5, z: -YARD - 1.4 },
  { x: -YARD - 1.4, z: -2.5 },
  { x: -YARD - 1.4, z: 2.5 },
  { x: YARD + 1.4, z: -2.5 },
  { x: YARD + 1.4, z: 2.5 },
  { x: -3.5, z: YARD + 1.4 },
  { x: 3.5, z: YARD + 1.4 },
];

// speed scales a neighbour's walking; think is how often it picks a new
// plan (seconds); aim is how far off its rake can point (radians); steal is
// how likely it goes after a rival's pile instead of loose leaves; slack is
// how often it dawdles instead of raking.
export const LEAF_LEVELS = {
  easy: { speed: 0.72, think: 0.9, aim: 0.45, steal: 0.08, slack: 0.3 },
  normal: { speed: 0.86, think: 0.55, aim: 0.25, steal: 0.22, slack: 0.12 },
  hard: { speed: 0.98, think: 0.3, aim: 0.1, steal: 0.38, slack: 0.03 },
};

export const leafLevel = (level) => LEAF_LEVELS[level] || LEAF_LEVELS.normal;

// Small seeded random generator (mulberry32) so a round can be replayed.
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

export const facingVector = (f) => ({ x: -Math.sin(f), z: -Math.cos(f) });
export const facingOf = (x, z) => Math.atan2(-x, -z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function cornerOf(x, z) {
  for (let i = 0; i < PLAYERS; i++) {
    const c = CORNERS[i];
    if (Math.hypot(x - c.x, z - c.z) < CORNER_RADIUS) return i;
  }
  return -1;
}

export const leafValue = (leaf) => (leaf.kind === "gold" ? GOLD_VALUE : 1);

// Where each player starts: a little out of their corner, facing the middle.
export function startSpot(i) {
  const c = CORNERS[i];
  const x = c.x * 0.55;
  const z = c.z * 0.55;
  return { x, z, facing: facingOf(-x, -z) };
}

// A spot on the grass for a leaf: never inside a corner pile (no free
// points) and never right against the fence.
function landing(random, from, spread) {
  for (let tries = 0; tries < 30; tries++) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * spread;
    const x = clamp(from.x + Math.cos(a) * r, -YARD + 0.4, YARD - 0.4);
    const z = clamp(from.z + Math.sin(a) * r, -YARD + 0.4, YARD - 0.4);
    if (Math.hypot(x, z) > 0 && cornerOf(x, z) < 0 && minCorner(x, z) > 0.6)
      return { x, z };
  }
  return { x: (random() - 0.5) * 4, z: (random() - 0.5) * 4 };
}
const minCorner = (x, z) =>
  Math.min(...CORNERS.map((c) => Math.hypot(x - c.x, z - c.z) - CORNER_RADIUS));

// Every leaf of a round, in time order: { id, kind, at, from, x, z }. The
// first START_LEAVES are already on the grass at the go (at = 0, no from);
// the rest drift down from a tree (`from`, the canopy point) and land at
// (x, z) FALL_TIME after `at`. They come a little faster as the round goes.
export function leafPlan(seed = 1) {
  const random = seeded(seed);
  const leaves = [];
  const add = (at, from, spot) =>
    leaves.push({
      id: leaves.length,
      kind: random() < GOLD_CHANCE ? "gold" : "leaf",
      at: Math.round(at * 1000) / 1000,
      from,
      x: spot.x,
      z: spot.z,
    });
  for (let i = 0; i < START_LEAVES; i++)
    add(0, null, landing(random, { x: 0, z: 0 }, YARD - 1));
  for (let i = 0; i < FALLING_LEAVES; i++) {
    // Even spacing eased so the second half is busier, plus a little jitter.
    const f = (i + random() * 0.8) / FALLING_LEAVES;
    const at = 0.6 + LAST_FALL * (1 - (1 - f) ** 1.35) - FALL_TIME * f;
    const tree = TREES[Math.floor(random() * TREES.length)];
    const canopy = {
      x: tree.x * 0.86 + (random() - 0.5) * 1.6,
      z: tree.z * 0.86 + (random() - 0.5) * 1.6,
    };
    add(Math.max(0.3, at), canopy, landing(random, canopy, 4.6));
  }
  leaves.sort((a, b) => a.at - b.at);
  leaves.forEach((l, i) => (l.id = i));
  return leaves;
}

// A fresh round. players: [{ bot: boolean }]
export function newRound(seed, players, level = "normal") {
  const random = seeded(seed ^ 0x51ed27);
  return {
    seed,
    level,
    t: 0,
    random,
    plan: leafPlan(seed),
    next: 0, // the next plan leaf to drop
    leaves: [], // { id, kind, state: "falling" | "ground", x, z, vx, vz, at, from }
    blower: null, // { x, z } waiting on the grass
    blowerAt: BLOWER.first,
    players: players.map((p, i) => {
      const s = startSpot(i);
      return {
        corner: i,
        bot: !!p.bot,
        x: s.x,
        z: s.z,
        facing: s.facing,
        moving: 0,
        cooldown: 0,
        swing: 0, // counts down after a swing (for drawing)
        swings: 0,
        blower: 0, // seconds of leaf blower left
        blowing: false,
        // Bots only.
        plan: null,
        rethink: 0.2 + random() * 0.4,
      };
    }),
    events: [], // what happened this step, for sounds and pops
  };
}

// Push the leaves in front of a player. reach / arc / strength describe the
// cone; `kick` is the speed given to each leaf it catches.
function push(round, p, reach, arc, kick, aim = p.facing) {
  const dir = facingVector(aim);
  let moved = 0;
  for (const leaf of round.leaves) {
    if (leaf.state !== "ground") continue;
    const dx = leaf.x - p.x;
    const dz = leaf.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > reach) continue;
    if (d > 0.25 && Math.abs(wrap(facingOf(dx, dz) - aim)) > arc) continue;
    const spread = (round.random() - 0.5) * 0.5;
    const v = facingVector(aim + spread);
    const speed = kick * (0.8 + round.random() * 0.35);
    leaf.vx = v.x * speed + dir.x * 0.2;
    leaf.vz = v.z * speed + dir.z * 0.2;
    leaf.hop = 0.35; // a little flutter up off the grass
    moved++;
  }
  return moved;
}

// One step of the round. input[i] = { x, z, rake } for each human player
// (x / z each -1..1, rake true while held); bots steer themselves.
export function step(round, input = [], dt = STEP) {
  const s = leafLevel(round.level);
  round.t += dt;
  round.events = [];
  const playing = round.t < ROUND_TIME;

  // Leaves start to fall.
  while (
    round.next < round.plan.length &&
    round.plan[round.next].at <= round.t
  ) {
    const plan = round.plan[round.next++];
    round.leaves.push({
      ...plan,
      state: plan.from ? "falling" : "ground",
      vx: 0,
      vz: 0,
      hop: 0,
    });
  }

  // The leaf blower turns up now and then in the middle of the yard.
  if (playing && !round.blower && round.t >= round.blowerAt) {
    const a = round.random() * Math.PI * 2;
    const r = round.random() * 2.2;
    round.blower = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    round.blowerAt = Infinity;
    round.events.push({ type: "blower" });
  }

  // Players.
  round.players.forEach((p, i) => {
    let want = { x: 0, z: 0, rake: false };
    if (!playing) want = { x: 0, z: 0, rake: false };
    else if (p.bot) want = botInput(round, i, s, dt);
    else if (input[i]) want = input[i];
    let { x, z } = want;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const speed = WALK_SPEED * (p.bot ? s.speed : 1);
    p.moving = Math.min(1, len);
    p.x += x * speed * dt;
    p.z += z * speed * dt;
    if (len > 0.15) {
      const target = facingOf(x, z);
      p.facing += wrap(target - p.facing) * Math.min(1, dt * 16);
    }
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.blower = Math.max(0, p.blower - dt);
    p.blowing = false;
    if (want.rake && playing) {
      // A little help for people: a swing that's nearly at your own corner
      // goes straight at it.
      if (!p.bot && want.aim === undefined) {
        const c = CORNERS[i];
        const home = facingOf(c.x - p.x, c.z - p.z);
        if (Math.abs(wrap(home - p.facing)) < ASSIST) want.aim = home;
      }
      if (p.blower > 0) {
        p.blowing = true;
        push(round, p, BLOWER.reach, BLOWER.arc, BLOWER.push, want.aim);
      } else if (p.cooldown === 0) {
        p.cooldown = RAKE.cooldown;
        p.swing = 0.3;
        p.swings++;
        const n = push(
          round,
          p,
          RAKE.reach,
          RAKE.arc,
          RAKE.slide * FRICTION,
          want.aim,
        );
        round.events.push({ type: "rake", who: i, leaves: n });
      }
    }
    if (p.blower === 0 && p.wasBlowing)
      round.events.push({ type: "blown", who: i });
    p.wasBlowing = p.blower > 0;
    // Pick up the blower.
    if (
      playing &&
      round.blower &&
      Math.hypot(p.x - round.blower.x, p.z - round.blower.z) < BLOWER.pickup
    ) {
      round.blower = null;
      p.blower = BLOWER.time;
      p.wasBlowing = true;
      round.blowerAt = round.t + BLOWER.time + BLOWER.every;
      round.events.push({ type: "pickup", who: i });
    }
  });

  // Bumps: players can't overlap, and nudge each other apart.
  const ps = round.players;
  for (let a = 0; a < ps.length; a++)
    for (let b = a + 1; b < ps.length; b++) {
      const dx = ps[b].x - ps[a].x;
      const dz = ps[b].z - ps[a].z;
      const d = Math.hypot(dx, dz);
      const min = PLAYER_RADIUS * 2;
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const overlap = (min - d) / 2;
      ps[a].x -= nx * overlap;
      ps[a].z -= nz * overlap;
      ps[b].x += nx * overlap;
      ps[b].z += nz * overlap;
      if (!ps[a].bumped || round.t - ps[a].bumped > 0.5) {
        ps[a].bumped = round.t;
        round.events.push({ type: "bump", who: a, other: b });
      }
    }
  for (const p of ps) {
    p.x = clamp(p.x, -YARD + PLAYER_RADIUS, YARD - PLAYER_RADIUS);
    p.z = clamp(p.z, -YARD + PLAYER_RADIUS, YARD - PLAYER_RADIUS);
  }

  // Leaves.
  const damp = Math.exp(-FRICTION * dt);
  for (const leaf of round.leaves) {
    if (leaf.state === "falling") {
      if (round.t >= leaf.at + FALL_TIME) {
        leaf.state = "ground";
        round.events.push({ type: "land", leaf: leaf.id });
      }
      continue;
    }
    // Walking through leaves scuffs them a little.
    for (const p of ps) {
      if (p.moving < 0.2) continue;
      const dx = leaf.x - p.x;
      const dz = leaf.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER_RADIUS && d > 1e-6) {
        leaf.vx += (dx / d) * 14 * dt;
        leaf.vz += (dz / d) * 14 * dt;
      }
    }
    leaf.x += leaf.vx * dt;
    leaf.z += leaf.vz * dt;
    leaf.vx *= damp;
    leaf.vz *= damp;
    leaf.hop = Math.max(0, leaf.hop - dt);
    // The fence stops them.
    const edge = YARD - 0.12;
    if (Math.abs(leaf.x) > edge) {
      leaf.x = Math.sign(leaf.x) * edge;
      leaf.vx *= -0.25;
    }
    if (Math.abs(leaf.z) > edge) {
      leaf.z = Math.sign(leaf.z) * edge;
      leaf.vz *= -0.25;
    }
  }
  return round;
}

// Where a leaf is drawn while it's falling: { x, y, z, f } with f 0..1.
export function fallingAt(leaf, t) {
  const f = clamp((t - leaf.at) / FALL_TIME, 0, 1);
  const ease = 1 - (1 - f) ** 1.6;
  const sway = Math.sin(t * 3.1 + leaf.id) * 0.45 * (1 - f);
  return {
    x: leaf.from.x + (leaf.x - leaf.from.x) * ease + sway,
    y: FALL_HEIGHT * (1 - f),
    z: leaf.from.z + (leaf.z - leaf.from.z) * ease,
    f,
  };
}

// Each corner's pile: points (golden leaves count GOLD_VALUE) and leaves.
export function piles(leaves) {
  const out = CORNERS.map(() => ({ points: 0, leaves: 0, gold: 0 }));
  for (const leaf of leaves) {
    if (leaf.state !== "ground") continue;
    const c = cornerOf(leaf.x, leaf.z);
    if (c < 0) continue;
    out[c].points += leafValue(leaf);
    out[c].leaves++;
    if (leaf.kind === "gold") out[c].gold++;
  }
  return out;
}

// Everyone with the highest total (more than one means a tie).
export function winners(totals) {
  const top = Math.max(...totals);
  return totals.flatMap((total, i) => (total === top ? [i] : []));
}

// --- Four-player seats ------------------------------------------------------
//
// In the four-player game each controller (or a keyboard half) takes a
// corner. Seat n (player n + 1) is SEAT_ORDER[n]: player 1 front left,
// player 2 front right (as in the two-player game), then the back corners.
// A seat is { pad: gamepadIndex } or { keys: "wasd" | "arrows" }; null is a
// computer neighbour. `seats` is indexed by corner.
export const SEAT_ORDER = [0, 3, 1, 2];
export const SEAT_NAMES = [
  "Front left",
  "Front right",
  "Back left",
  "Back right",
];
export const sameSeat = (a, b) =>
  !!a && !!b && a.pad === b.pad && a.keys === b.keys;
export const playerNumber = (corner) => SEAT_ORDER.indexOf(corner) + 1;

// Sit `who` in the lowest free seat. Already seated, or the yard full: no change.
export function joinSeat(seats, who) {
  if (seats.some((s) => sameSeat(s, who))) return seats;
  const corner = SEAT_ORDER.find((c) => !seats[c]);
  if (corner === undefined) return seats;
  const out = [...seats];
  out[corner] = who;
  return out;
}

export function leaveSeat(seats, who) {
  return seats.map((s) => (sameSeat(s, who) ? null : s));
}

// A controller stick (x, y in -1..1, y down) as a walk input: a round dead
// zone for drift, then rescaled so a gentle push walks slowly.
export function stickWalk(x, y, dead = 0.2) {
  const len = Math.hypot(x, y);
  if (len < dead) return { x: 0, z: 0 };
  const scale = Math.min(1, (len - dead) / (1 - dead)) / len;
  return { x: x * scale, z: y * scale };
}

// The match so far. rounds: [[points per player], ...]. Every player tied
// for the most points in a round wins that round. The match is over once
// someone has WINS_NEEDED wins or ROUNDS rounds are played; then the most
// wins takes it, and a tie on wins goes to the most points over all rounds.
export function matchState(rounds) {
  const wins = Array(PLAYERS).fill(0);
  const points = Array(PLAYERS).fill(0);
  for (const r of rounds) {
    for (const i of winners(r)) wins[i]++;
    r.forEach((p, i) => (points[i] += p));
  }
  const over = rounds.length >= ROUNDS || wins.some((w) => w >= WINS_NEEDED);
  let champs = [];
  if (over) {
    const most = winners(wins);
    if (most.length === 1) champs = most;
    else {
      const top = Math.max(...most.map((i) => points[i]));
      champs = most.filter((i) => points[i] === top);
    }
  }
  return { wins, points, over, champs };
}

// --- Computer neighbours ---------------------------------------------------
//
// A neighbour picks a leaf (or a clump) worth moving, walks round behind it
// so its corner is straight ahead, and rakes. Most of the time it goes for
// loose leaves near it; sometimes it raids the biggest rival pile instead.
// It grabs the leaf blower if it's close. Less skilled neighbours walk
// slower, rethink less often, aim worse and dawdle more.

function pickTarget(round, i, s) {
  const p = round.players[i];
  const home = CORNERS[i];
  const random = round.random;
  if (round.blower) {
    const d = Math.hypot(round.blower.x - p.x, round.blower.z - p.z);
    if (d < 4 + s.steal * 6) return { type: "blower" };
  }
  if (random() < s.slack) {
    const a = random() * Math.PI * 2;
    return {
      type: "wander",
      x: clamp(p.x + Math.cos(a) * 2, -YARD + 1, YARD - 1),
      z: clamp(p.z + Math.sin(a) * 2, -YARD + 1, YARD - 1),
      until: round.t + 0.8,
    };
  }
  const ground = round.leaves.filter((l) => l.state === "ground");
  const mine = (l) => cornerOf(l.x, l.z) === i;
  const skipped = (l) => (p.skip?.get(l.id) ?? 0) > round.t;
  let pool = [];
  let raid = -1;
  // A raid on the biggest rival pile: only one neighbour raids a corner at a
  // time, and each waits a while between raids.
  if (round.t >= (p.nextRaid ?? 0) && random() < s.steal) {
    const pile = piles(round.leaves);
    let rival = -1;
    pile.forEach((q, c) => {
      if (c !== i && (rival < 0 || q.points > pile[rival].points)) rival = c;
    });
    const taken = round.players.some(
      (o, k) => k !== i && o.plan?.raid === rival,
    );
    if (rival >= 0 && !taken && pile[rival].points >= 4) {
      pool = ground.filter((l) => cornerOf(l.x, l.z) === rival && !skipped(l));
      if (pool.length) raid = rival;
    }
  }
  if (!pool.length)
    pool = ground.filter((l) => {
      if (mine(l) || skipped(l)) return false;
      // Leave rivals' piles alone unless raiding.
      return cornerOf(l.x, l.z) < 0;
    });
  if (!pool.length) return null;
  // Score each leaf: value, how close it is, how close it already is to home,
  // and how many others are lying next to it (a clump is worth a swing).
  let best = null;
  let bestScore = -Infinity;
  for (const l of pool) {
    const near = Math.hypot(l.x - p.x, l.z - p.z);
    const toHome = Math.hypot(l.x - home.x, l.z - home.z);
    let clump = 0;
    for (const o of pool)
      if (Math.abs(o.x - l.x) < 1 && Math.abs(o.z - l.z) < 1) clump++;
    // Keep out of each other's way: leaves someone else is standing by or
    // already going for are worth less.
    let crowd = 0;
    round.players.forEach((o, k) => {
      if (k === i) return;
      if (Math.hypot(o.x - l.x, o.z - l.z) < 1.6) crowd++;
      const t = o.plan?.leaf !== undefined && round.leaves[o.plan.leaf];
      if (t && Math.hypot(t.x - l.x, t.z - l.z) < 1.4) crowd++;
    });
    // Raking it home would mean standing in someone else's corner: only
    // worth it on a raid.
    const hx = home.x - l.x;
    const hz = home.z - l.z;
    const hd = Math.hypot(hx, hz) || 1;
    const stand = cornerOf(l.x - (hx / hd) * 0.85, l.z - (hz / hd) * 0.85);
    if (raid < 0 && stand >= 0 && stand !== i) crowd += 1.4;
    const score =
      leafValue(l) * 2 +
      clump * 0.9 -
      near * 0.8 -
      toHome * 0.45 -
      crowd * 2.5 +
      random() * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = l;
    }
  }
  if (raid >= 0) {
    p.nextRaid = round.t + 7;
    return { type: "leaf", leaf: best.id, raid, until: round.t + 4 };
  }
  return { type: "leaf", leaf: best.id };
}

const skipLeaf = (round, p, id, seconds = 5) => {
  p.skip ??= new Map();
  p.skip.set(id, round.t + seconds);
};

const leafWorth = (round, id, i) => {
  const leaf = round.leaves[id];
  return leaf && leaf.state === "ground" && cornerOf(leaf.x, leaf.z) !== i;
};

function botInput(round, i, s, dt) {
  const p = round.players[i];
  const home = CORNERS[i];
  // Between plans it pauses a moment (its reaction time), then commits to
  // the next one for a few seconds.
  const done =
    !p.plan ||
    round.t > p.plan.until ||
    (p.plan.type === "blower" && !round.blower) ||
    (p.plan.type === "leaf" && !leafWorth(round, p.plan.leaf, i));
  if (done) {
    if (p.plan) {
      p.plan = null;
      p.rethink = s.think * (0.6 + round.random() * 0.8);
    }
    p.rethink -= dt;
    if (p.rethink > 0) {
      // Don't stand about in someone else's corner while deciding.
      const in_ = cornerOf(p.x, p.z);
      if (in_ >= 0 && in_ !== i) {
        const d = Math.hypot(p.x, p.z) || 1;
        return { x: -p.x / d, z: -p.z / d, rake: false };
      }
      return { x: 0, z: 0, rake: false };
    }
    p.plan = pickTarget(round, i, s);
    if (p.plan) p.plan.until ??= round.t + 8;
    p.check = { x: p.x, z: p.z, t: round.t, swings: p.swings };
    p.aimError = (round.random() - 0.5) * 2 * s.aim;
  }
  const plan = p.plan;
  if (!plan) return { x: 0, z: 0, rake: false };
  const walkTo = (x, z, stop = 0.15) => {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) return { x: 0, z: 0, d };
    // Slow down on the last bit so it doesn't overshoot.
    const k = Math.min(1, d / 0.5) / d;
    return { x: dx * k, z: dz * k, d };
  };
  if (plan.type === "blower" && round.blower) {
    const w = walkTo(round.blower.x, round.blower.z, 0);
    return { x: w.x, z: w.z, rake: false };
  }
  if (plan.type === "wander") {
    const w = walkTo(plan.x, plan.z);
    return { x: w.x, z: w.z, rake: false };
  }
  const leaf = round.leaves[plan.leaf];
  // Stuck (boxed in by the fence or other players, getting nowhere): give up
  // on this leaf for a while and go elsewhere.
  const c = p.check;
  if (Math.hypot(p.x - c.x, p.z - c.z) > 0.5 || p.swings !== c.swings) {
    c.x = p.x;
    c.z = p.z;
    c.t = round.t;
    c.swings = p.swings;
  } else if (round.t - c.t > 1.4) {
    skipLeaf(round, p, leaf.id);
    plan.until = 0;
    return { x: 0, z: 0, rake: false };
  }
  // Stand behind the leaf with home straight ahead (as near as the fence
  // allows), then swing home-wards, or straight at the leaf if home-wards
  // would miss it.
  const hx = home.x - leaf.x;
  const hz = home.z - leaf.z;
  const hd = Math.hypot(hx, hz) || 1;
  const back = p.blower > 0 ? 1.5 : 0.85;
  const sx = clamp(leaf.x - (hx / hd) * back, -YARD + 0.5, YARD - 0.5);
  const sz = clamp(leaf.z - (hz / hd) * back, -YARD + 0.5, YARD - 0.5);
  const w = walkTo(sx, sz, 0.25);
  const lx = leaf.x - p.x;
  const lz = leaf.z - p.z;
  const ld = Math.hypot(lx, lz);
  const homeward = facingOf(hx, hz);
  const atLeaf = facingOf(lx, lz);
  const reach = p.blower > 0 ? BLOWER.reach : RAKE.reach;
  if (w.d < 0.5 && ld < reach * 0.95) {
    let aim = homeward;
    if (Math.abs(wrap(atLeaf - homeward)) > 0.75) {
      // Home-wards misses: rake at the leaf, if that still helps.
      if ((lx * hx + lz * hz) / (ld * hd || 1) < 0.25) {
        skipLeaf(round, p, leaf.id);
        p.plan.until = 0;
        return { x: 0, z: 0, rake: false };
      }
      aim = atLeaf;
    }
    aim += p.aimError;
    p.facing += wrap(aim - p.facing) * Math.min(1, dt * 14);
    const ready = Math.abs(wrap(aim - p.facing)) < 0.25;
    return { x: 0, z: 0, rake: ready, aim: p.facing };
  }
  return { x: w.x, z: w.z, rake: false };
}
