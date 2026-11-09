// Pool Noodle Chop rules: when each noodle drops, where its stripe is, how a
// swing is scored, and the computer neighbours' swings. Kept free of DOM and
// Three.js so it can be tested in Node.
//
// Every player stands at a chopping station with a foam sword. A rack above
// each station holds a pool noodle with a stripe around it. All the racks let
// go together, the noodles fall straight down, and each player gets one
// swing. The sword's blade sweeps flat at BLADE_Y; whatever part of the
// noodle is level with it then is where the cut lands.

export const ROUNDS = 5;
export const STATIONS = 4;
export const NOODLE_LENGTH = 1.5;
// Height of the noodle's bottom while it hangs in the rack.
export const HANG_BOTTOM = 2.7;
// Height of the blade's flat sweep.
export const BLADE_Y = 1.0;
export const PERFECT = 20;
export const TOO_HIGH = -5;
export const MISS = -10;
// Each point below a perfect cut is this much noodle below the stripe.
export const POINT_STEP = 0.05;
// The rack rattles this long before it lets go.
export const RATTLE = 0.45;

// gravity: how fast noodles fall (m/s², slower than real so it's playable).
// stripe: the stripe's width in metres. aim / spread: how early a computer
// neighbour swings on average, and how far off it can be (seconds).
export const NOODLE_LEVELS = {
  easy: { gravity: 2.2, stripe: 0.16, aim: 0.07, spread: 0.1 },
  normal: { gravity: 3, stripe: 0.12, aim: 0.03, spread: 0.045 },
  hard: { gravity: 4.2, stripe: 0.09, aim: 0.018, spread: 0.028 },
};

export const noodleLevel = (level) =>
  NOODLE_LEVELS[level] || NOODLE_LEVELS.normal;

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

// The five rounds: { release, stripe, width, gravity } where release is the
// seconds after the round starts that the racks let go (random, so nobody
// can count it), and stripe is the height of the stripe's middle above the
// noodle's bottom end.
export function roundPlan(level, seed = 1) {
  const s = noodleLevel(level);
  const random = seeded(seed);
  return Array.from({ length: ROUNDS }, (_, round) => ({
    round,
    release: Math.round((1.6 + random() * 1.4) * 1000) / 1000,
    stripe:
      Math.round((0.35 + random() * (NOODLE_LENGTH - 0.75)) * 1000) / 1000,
    width: s.stripe,
    gravity: s.gravity,
  }));
}

// Height of the noodle's bottom end at time t (round time).
export function noodleBottom(round, t) {
  const fall = Math.max(0, t - round.release);
  return HANG_BOTTOM - 0.5 * round.gravity * fall * fall;
}

// The round time when a point `height` above the noodle's bottom is level
// with the blade.
export function timeAtBlade(round, height) {
  const drop = HANG_BOTTOM + height - BLADE_Y;
  return round.release + Math.sqrt((2 * drop) / round.gravity);
}

// When the noodle's top has gone past the blade and it can't be cut any more.
export const lastChance = (round) => timeAtBlade(round, NOODLE_LENGTH);

// Where along the noodle a swing at time t (or null for no swing) lands:
// the height above the bottom end, or null if the blade missed the noodle.
export function cutAt(round, t) {
  if (t === null || t === undefined) return null;
  const height = BLADE_Y - noodleBottom(round, t);
  return height < 0 || height > NOODLE_LENGTH ? null : height;
}

// Score a cut (height above the noodle's bottom, or null for a miss).
//   perfect: the blade went through the stripe → 20
//   low: below the stripe → 19 down to 1, one less every POINT_STEP
//   high: above the stripe → −5
//   miss: no noodle → −10
export function scoreCut(round, height) {
  if (height === null) return { kind: "miss", points: MISS, off: null };
  const off = height - round.stripe;
  const half = round.width / 2;
  if (Math.abs(off) <= half) return { kind: "perfect", points: PERFECT, off };
  if (off > 0) return { kind: "high", points: TOO_HIGH, off };
  const below = -off - half;
  return {
    kind: "low",
    points: Math.max(1, PERFECT - 1 - Math.floor(below / POINT_STEP)),
    off,
  };
}

// Score a swing at time t (null if the player never swung).
export const scoreSwing = (round, t) => scoreCut(round, cutAt(round, t));

// Normal-ish random number (mean 0, about ±1).
function wobble(random) {
  return (random() + random() + random() - 1.5) * 1.4;
}

// When a computer neighbour swings in a round: aiming a touch early, as a
// careful player would, give or take its level's spread.
export function botSwing(round, level, seed, who) {
  const s = noodleLevel(level);
  const random = seeded(
    (seed ^
      Math.imul(round.round + 1, 2654435761) ^
      Math.imul(who + 1, 40503)) >>>
      0,
  );
  const target = timeAtBlade(round, round.stripe);
  return target - s.aim + wobble(random) * s.spread;
}

// Everyone with the highest total (more than one means a tie).
export function winners(totals) {
  const top = Math.max(...totals);
  return totals.flatMap((total, i) => (total === top ? [i] : []));
}
