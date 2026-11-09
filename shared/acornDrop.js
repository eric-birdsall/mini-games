// Acorn Drop: a pegboard game on a backyard fence. Your critter picks up an
// acorn on a little ledge beside the fence and you walk it out along the top
// rail; drop it and it bounces down through rows of pegs into one of the
// flower pots along the bottom. After each drop the critter walks back to
// the ledge for the next acorn. Each pot is worth one
// to five flowers, and every pot grows something, so there's no losing drop.
//
// Everything happens in the fence's plane: x runs across (the board spans
// LEFT..RIGHT), y runs up from the grass. The acorn is a circle, the pegs
// are circles and the pot dividers are short upright sticks.

export const ACORNS_PER_ROUND = 5;
export const POTS = 9;
export const LEFT = -POTS / 2;
export const RIGHT = POTS / 2;
// Flowers for each pot, left to right: the middle is the big one, and the
// two outside pots are a nice surprise.
export const POT_VALUES = [2, 1, 3, 4, 5, 4, 3, 1, 2];

export const ACORN_RADIUS = 0.17;
export const PEG_RADIUS = 0.09;
export const DIVIDER_RADIUS = 0.05;
export const FLOOR_Y = 0.2; // bottom of the pots
export const DIVIDER_TOP = 1.1; // top of the sticks between the pots
export const RAIL_Y = 7.8; // top of the fence rail the critter walks on
export const DROP_Y = 8.18; // where an acorn is let go (in the critter's paws)
export const REACH = 4.1; // how far either side of the middle you can drop
// The ledge beside the fence where the critter picks up each acorn.
export const HOME_X = LEFT - 0.85;
// How fast the critter heads back to the ledge after a drop (m/s).
export const RETURN_SPEED = 3.6;
const PEG_TOP = 6.85;
const PEG_BOTTOM = 1.75;

const GRAVITY = 14;
const FLOOR_BOUNCE = 0.35;
const STEP = 1 / 240;

// rows: rows of pegs; walk: how fast you walk the critter along the rail;
// bounce: how lively peg hits are; slide: how much speed along the peg
// survives a hit; jiggle: the random sideways kick each hit adds. Like any
// pegboard, where you drop only nudges the odds: fewer rows (Easy) keeps
// the acorn a little nearer where it was let go.
export const DROP_LEVELS = {
  easy: { rows: 7, walk: 2.6, bounce: 0.5, slide: 0.8, jiggle: 0.06 },
  normal: { rows: 9, walk: 2.9, bounce: 0.5, slide: 0.8, jiggle: 0.12 },
  hard: { rows: 11, walk: 3.2, bounce: 0.55, slide: 0.8, jiggle: 0.22 },
};
export const dropLevel = (level) => DROP_LEVELS[level] || DROP_LEVELS.normal;

/**
 * The pegs for a level: staggered rows, every other row shifted half a pot.
 * The shifted rows also get a half peg on each side wall so acorns can't
 * slide straight down the edge.
 */
export function pegLayout(level) {
  const { rows } = dropLevel(level);
  const pegs = [];
  for (let row = 0; row < rows; row++) {
    const y = PEG_TOP - ((PEG_TOP - PEG_BOTTOM) * row) / (rows - 1);
    const shifted = row % 2 === 1;
    const first = LEFT + (shifted ? 1 : 0.5);
    const count = shifted ? POTS - 1 : POTS;
    for (let i = 0; i < count; i++) pegs.push({ x: first + i, y, row });
    if (shifted)
      for (const x of [LEFT, RIGHT]) pegs.push({ x, y, row, wall: true });
  }
  return pegs;
}

/** x positions of the sticks between the pots. */
export const dividers = () =>
  Array.from({ length: POTS - 1 }, (_, i) => LEFT + i + 1);

export const potCentre = (pot) => LEFT + pot + 0.5;
export const potAt = (x) =>
  Math.min(POTS - 1, Math.max(0, Math.floor(x - LEFT)));

/** The critter can walk from its ledge to the far end of the rail. */
export const clampWalk = (x) => Math.min(REACH, Math.max(HOME_X, x));

/** Walk the critter dir (-1 left, 1 right) for dt seconds. */
export const walk = (x, dir, dt, level) =>
  clampWalk(x + Math.sign(dir) * dropLevel(level).walk * dt);

/** Walk toward a spot at `speed`, stopping on it. */
export function walkToward(x, target, speed, dt) {
  const goal = clampWalk(target);
  const step = speed * dt;
  return Math.abs(goal - x) <= step ? goal : x + Math.sign(goal - x) * step;
}

/** Only over the board can an acorn be let go (not from the ledge). */
export const canDrop = (x) => x >= -REACH - 1e-9 && x <= REACH + 1e-9;

function random(acorn) {
  // Small LCG so a drop replays the same way from the same seed.
  acorn.rng = (Math.imul(acorn.rng, 1664525) + 1013904223) >>> 0;
  return acorn.rng / 2 ** 32;
}

export function createAcorn(x, seed = 1) {
  return {
    x: Math.min(RIGHT - ACORN_RADIUS, Math.max(LEFT + ACORN_RADIUS, x)),
    y: DROP_Y,
    vx: 0,
    vy: 0,
    angle: 0,
    t: 0,
    still: 0,
    pot: null, // set once it drops below the pot rims
    hits: 0,
    rng: seed >>> 0 || 1,
    touching: new Set(),
    // Pegs (by index) and dividers ("d0"…) newly touched; the game drains
    // this to wobble pegs and play sounds.
    newHits: [],
  };
}

// Push the acorn out of a circle at (cx, cy) and bounce it off.
function collide(acorn, cx, cy, radius, key, { bounce, slide }, jiggle) {
  const dx = acorn.x - cx;
  const dy = acorn.y - cy;
  const reach = ACORN_RADIUS + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) {
    acorn.touching.delete(key);
    return;
  }
  let d = Math.sqrt(d2);
  let nx = dx / d;
  let ny = dy / d;
  if (d < 1e-6) {
    // Dead centre: pick a side.
    nx = random(acorn) < 0.5 ? -1 : 1;
    ny = 0;
    d = 0;
  }
  acorn.x = cx + nx * reach;
  acorn.y = cy + ny * reach;
  const vn = acorn.vx * nx + acorn.vy * ny;
  if (vn < 0) {
    const tx = -ny;
    const ty = nx;
    const vt = (acorn.vx * tx + acorn.vy * ty) * slide;
    const out = -vn * bounce;
    acorn.vx = nx * out + tx * vt;
    acorn.vy = ny * out + ty * vt;
    if (!acorn.touching.has(key)) {
      acorn.touching.add(key);
      acorn.hits++;
      acorn.vx += (random(acorn) * 2 - 1) * jiggle;
      acorn.newHits.push(key);
    }
  }
}

/**
 * Move an acorn on by dt seconds. Returns "pot" on the step it drops into
 * a pot (acorn.pot is then set), otherwise null.
 */
export function stepAcorn(acorn, pegs, level, dt) {
  const settings = dropLevel(level);
  const { bounce, jiggle } = settings;
  const walls = dividers();
  let event = null;
  for (let left = dt; left > 1e-9; left -= STEP) {
    const h = Math.min(STEP, left);
    acorn.t += h;
    acorn.vy -= GRAVITY * h;
    acorn.x += acorn.vx * h;
    acorn.y += acorn.vy * h;

    for (let i = 0; i < pegs.length; i++)
      if (Math.abs(pegs[i].y - acorn.y) < 0.4)
        collide(acorn, pegs[i].x, pegs[i].y, PEG_RADIUS, i, settings, jiggle);
    if (acorn.y - ACORN_RADIUS < DIVIDER_TOP)
      walls.forEach((x, i) =>
        collide(
          acorn,
          x,
          Math.min(DIVIDER_TOP, Math.max(FLOOR_Y, acorn.y)),
          DIVIDER_RADIUS,
          `d${i}`,
          settings,
          0,
        ),
      );

    // The fence posts on either side.
    if (acorn.x - ACORN_RADIUS < LEFT) {
      acorn.x = LEFT + ACORN_RADIUS;
      acorn.vx = Math.abs(acorn.vx) * bounce;
    } else if (acorn.x + ACORN_RADIUS > RIGHT) {
      acorn.x = RIGHT - ACORN_RADIUS;
      acorn.vx = -Math.abs(acorn.vx) * bounce;
    }
    // The bottom of the pot.
    if (acorn.y - ACORN_RADIUS < FLOOR_Y) {
      acorn.y = FLOOR_Y + ACORN_RADIUS;
      if (acorn.vy < 0) acorn.vy = -acorn.vy * FLOOR_BOUNCE;
      acorn.vx *= 0.96;
    }

    // Rolling look.
    acorn.angle -= (acorn.vx / ACORN_RADIUS) * h;

    // Never get stuck balanced on a peg: nudge it off.
    const speed = Math.hypot(acorn.vx, acorn.vy);
    if (acorn.pot === null && speed < 0.15) {
      acorn.still += h;
      if (acorn.still > 0.5) {
        acorn.vx += (random(acorn) < 0.5 ? -1 : 1) * 0.8;
        acorn.still = 0;
      }
    } else acorn.still = 0;

    if (acorn.pot === null && acorn.y < DIVIDER_TOP - ACORN_RADIUS) {
      acorn.pot = potAt(acorn.x);
      event = "pot";
    }
  }
  return event;
}

/** Flowers earned by a list of pots landed in. */
export const flowersFor = (pots) =>
  pots.reduce((sum, pot) => sum + POT_VALUES[pot], 0);
