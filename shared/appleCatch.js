// Backyard Apple Catch rules: what falls and when, where each basket is,
// scoring, and the computer neighbours. Kept free of DOM and Three.js so it
// can be tested in Node.
//
// Every player stands still under their own little apple tree. Their basket
// is in one of three spots: left (holding left), middle (no input, or both)
// or right (holding right). The same things fall in every lane at the same
// time, so it's a fair race. Several things can fall together: catch the
// apples and keep the basket out from under the pinecones.

export const APPLES_PER_ROUND = 100;
export const PINECONE_COST = 5;
export const LANES = 4;
export const LEFT = 0;
export const MIDDLE = 1;
export const RIGHT = 2;
// A branch shakes this long before something lets go.
export const WOBBLE = 0.55;
const FIRST_DROP = 1.8;

// fall / gap scale the fall time and the time between drops; cones is the
// chance any one thing is a pinecone; busy scales how often two or three
// things fall at once; accuracy is how often a computer neighbour picks the
// right spot.
export const APPLE_LEVELS = {
  easy: { fall: 1.2, gap: 1.15, cones: 0.22, busy: 0.7, accuracy: 0.6 },
  normal: { fall: 1, gap: 1, cones: 0.32, busy: 1, accuracy: 0.78 },
  hard: { fall: 0.85, gap: 0.88, cones: 0.4, busy: 1.25, accuracy: 0.9 },
};

export const appleLevel = (level) => APPLE_LEVELS[level] || APPLE_LEVELS.normal;

// Where the basket is for the held directions.
export const basketSpot = (left, right) =>
  left === right ? MIDDLE : left ? LEFT : RIGHT;

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

// A fixed random number for one neighbour and one group of drops.
export const chance = (seed, who, group) =>
  seeded(
    (seed ^ Math.imul(group + 1, 2654435761) ^ Math.imul(who + 1, 40503)) >>> 0,
  )();

// Every drop of the round, in time order:
//   { id, group, kind, spot, at, fall, land }
// Drops in the same group let go together (`at`) from different spots and
// land together (`land` = at + fall). A group never has pinecones in all
// three spots, and a three-drop group always has an apple. Exactly
// APPLES_PER_ROUND apples fall. Things fall faster, closer together and
// more of them at once as the round goes on.
export function dropPlan(level, seed = 1) {
  const s = appleLevel(level);
  const random = seeded(seed);
  const drops = [];
  let apples = 0;
  let at = FIRST_DROP;
  for (let group = 0; apples < APPLES_PER_ROUND; group++) {
    const progress = apples / APPLES_PER_ROUND;
    const two = Math.min(0.75, (0.18 + 0.5 * progress) * s.busy);
    const three = Math.max(0, Math.min(0.35, (0.3 * progress - 0.05) * s.busy));
    const roll = random();
    const size = group < 4 ? 1 : roll < three ? 3 : roll < three + two ? 2 : 1;
    const spots = [LEFT, MIDDLE, RIGHT];
    for (let i = 2; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const kinds = [];
    for (let i = 0; i < size; i++)
      kinds.push(group >= 4 && random() < s.cones ? "pinecone" : "apple");
    if (size === 3 && !kinds.includes("apple")) kinds[0] = "apple";
    const fall = (1.35 - 0.45 * progress) * s.fall;
    kinds.forEach((kind, i) => {
      if (kind === "apple" && apples >= APPLES_PER_ROUND) kind = "pinecone";
      if (kind === "apple") apples++;
      drops.push({
        id: drops.length,
        group,
        kind,
        spot: spots[i],
        at: Math.round(at * 1000) / 1000,
        fall,
        land: Math.round((at + fall) * 1000) / 1000,
      });
    });
    let gap = (1.35 - 0.6 * progress) * s.gap;
    // Now and then a quick follow-up.
    if (progress > 0.25 && random() < 0.12) gap *= 0.6;
    at += gap;
  }
  return drops;
}

// The apples still to land at time t (counting ones still in the tree).
export const applesLeft = (drops, t) =>
  drops.filter((d) => d.kind === "apple" && d.land > t).length;

// Score a catch. Pinecones take away five apples, but never below zero.
export function applyCatch(total, kind) {
  if (kind === "apple") return { total: total + 1, change: 1 };
  const lost = Math.min(total, PINECONE_COST);
  return { total: total - lost, change: lost ? -lost : 0 };
}

// The best spot for a group landing together: an apple with no pinecone,
// otherwise an empty spot, never a pinecone if there's a choice. Ties go to
// the middle, then left.
export function bestSpot(group) {
  const value = (spot) => {
    const d = group.find((g) => g.spot === spot);
    return !d ? 0 : d.kind === "apple" ? 1 : -PINECONE_COST;
  };
  return [MIDDLE, LEFT, RIGHT].reduce((a, b) => (value(b) > value(a) ? b : a));
}

// Where a computer neighbour puts its basket at time t, or null to leave it
// where it is. Once the next group is about to let go it usually picks the
// best spot for it, and otherwise one of the other two.
export function botSpot(drops, t, accuracy, seed, who) {
  // A group counts as "next" until a moment after it lands, so the basket
  // is still there when the catch is checked.
  const next = drops.find((d) => d.land > t - 0.05);
  if (!next || next.at - t > 0.15) return null;
  const group = drops.filter((d) => d.group === next.group);
  const best = bestSpot(group);
  const roll = chance(seed, who, next.group);
  if (roll < accuracy) return best;
  const others = [LEFT, MIDDLE, RIGHT].filter((s) => s !== best);
  return others[Math.floor(((roll - accuracy) / (1 - accuracy)) * 2) % 2];
}

// Everyone with the highest total (more than one means a tie).
export function winners(totals) {
  const top = Math.max(...totals);
  return totals.flatMap((total, i) => (total === top ? [i] : []));
}
