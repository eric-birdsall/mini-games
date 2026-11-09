// Backyard Flier rules: the helicopter's flight, the endless course of gaps
// between tree branches and shrubs, crashes and scoring. Kept free of DOM
// and Three.js so it can be tested in Node.
//
// The helicopter stays at x = HELI_X while the yard scrolls past. Gravity
// pulls it down; each tap sets its climb speed to the level's `flap`, the
// way a one-button flier does. Gap k sits at course distance
// FIRST_GAP + k * spacing: a branch hangs down from the canopy above it and
// a shrub grows up from the grass below. Fly into either, or the grass, and
// the flight is over. Each gap whose middle you pass scores one.

// The yard's grass is at y = 0 and the canopy's underside at CEILING.
export const GROUND = 0;
export const CEILING = 10;
export const HELI_X = 0;
// The helicopter's hitbox (a bit smaller than it looks, so near misses feel
// fair) and each branch / shrub's half width.
export const HELI_HALF_W = 0.6;
export const HELI_HALF_H = 0.34;
export const OBSTACLE_HALF = 0.85;
export const FIRST_GAP = 10;
export const START_Y = 5;
// Gap middles stay this far from the grass and the canopy.
const LOW_MARGIN = 1.3;
const HIGH_MARGIN = 1.1;

// gap: the opening's height. speed: how fast the yard scrolls (units/s).
// spacing: distance between gaps. gravity / flap / fall: pull, climb speed
// after a tap, and top falling speed. drop / rise: how far one gap's middle
// can be below / above the last one's (climbing takes longer than falling,
// so rise is smaller and every gap can be reached).
export const FLIER_LEVELS = {
  easy: {
    gap: 3.9,
    speed: 3,
    spacing: 7.5,
    gravity: 16,
    flap: 5.8,
    fall: 9,
    drop: 2.4,
    rise: 1.9,
  },
  normal: {
    gap: 3.3,
    speed: 3.6,
    spacing: 6.8,
    gravity: 19,
    flap: 6.4,
    fall: 11,
    drop: 3,
    rise: 2.3,
  },
  hard: {
    gap: 2.8,
    speed: 4.3,
    spacing: 6.2,
    gravity: 21,
    flap: 6.8,
    fall: 12,
    drop: 3.5,
    rise: 2.6,
  },
};

export const flierLevel = (level) => FLIER_LEVELS[level] || FLIER_LEVELS.normal;

// Small seeded random generator (mulberry32) so a course can be replayed.
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

// The lowest and highest a gap's middle can be on a level.
export function gapRange(level) {
  const s = flierLevel(level);
  return {
    low: GROUND + LOW_MARGIN + s.gap / 2,
    high: CEILING - HIGH_MARGIN - s.gap / 2,
  };
}

// An endless course. course.at(k) is gap k: { k, x, y, gap, look } where x
// is its course distance, y its middle and look a number for picking how
// its branch and shrub are dressed. Gaps are made as they're asked for.
export function makeCourse(level, seed = 1) {
  const s = flierLevel(level);
  const { low, high } = gapRange(level);
  const random = seeded(seed);
  const gaps = [];
  return {
    level: s,
    at(k) {
      while (gaps.length <= k) {
        const i = gaps.length;
        const prev = i ? gaps[i - 1].y : (low + high) / 2;
        let move = random() * (s.drop + s.rise) - s.drop;
        // Turn back at the edges rather than piling up against them.
        if (prev + move > high || prev + move < low)
          move = Math.min(s.rise, Math.max(-s.drop, -move));
        const y = Math.min(high, Math.max(low, prev + move));
        gaps.push({
          k: i,
          x: FIRST_GAP + i * s.spacing,
          y: Math.round(y * 1000) / 1000,
          gap: s.gap,
          look: Math.floor(random() * 1000),
        });
      }
      return gaps[k];
    },
  };
}

export const newFlight = () => ({
  y: START_Y,
  vy: 0,
  distance: 0,
  score: 0,
  crashed: null, // null | "ground" | "branch" | "shrub"
});

// A tap: climb at the level's flap speed (ignored after a crash).
export function flap(flight, course) {
  if (!flight.crashed) flight.vy = course.level.flap;
}

// Gaps passed at a course distance: those whose middle is behind you.
export function gapsPassed(distance, course) {
  const s = course.level;
  if (distance < FIRST_GAP) return 0;
  return Math.floor((distance - FIRST_GAP) / s.spacing) + 1;
}

// What the helicopter at height y, course distance d, is touching, if
// anything: "ground", "branch" (the one above a gap) or "shrub" (below).
export function hitAt(y, d, course) {
  if (y - HELI_HALF_H <= GROUND) return "ground";
  const s = course.level;
  const reach = OBSTACLE_HALF + HELI_HALF_W;
  const first = Math.max(0, Math.floor((d - reach - FIRST_GAP) / s.spacing));
  for (let k = first; k <= first + 1; k++) {
    const g = course.at(k);
    if (Math.abs(g.x - d) >= reach) continue;
    if (y + HELI_HALF_H > g.y + g.gap / 2) return "branch";
    if (y - HELI_HALF_H < g.y - g.gap / 2) return "shrub";
  }
  return null;
}

// Move the flight on by dt seconds. Bumping the canopy just stops the climb.
export function stepFlight(flight, course, dt) {
  if (flight.crashed) return flight;
  const s = course.level;
  flight.vy = Math.max(-s.fall, flight.vy - s.gravity * dt);
  flight.y += flight.vy * dt;
  flight.distance += s.speed * dt;
  if (flight.y + HELI_HALF_H > CEILING) {
    flight.y = CEILING - HELI_HALF_H;
    if (flight.vy > 0) flight.vy = 0;
  }
  const hit = hitAt(flight.y, flight.distance, course);
  if (hit) {
    flight.crashed = hit;
    if (hit === "ground") flight.y = GROUND + HELI_HALF_H;
    return flight;
  }
  flight.score = gapsPassed(flight.distance, course);
  return flight;
}
