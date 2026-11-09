// Pond Fishing rules: what bites, when, and how long you have to reel in.
// Kept free of DOM and Three.js so it can be tested in Node.

export const CASTS_PER_ROUND = 10;

export const CATCHES = {
  littleFish: { name: "Little fish", icon: "🐟", points: 10, fish: true },
  bigFish: { name: "Big fish", icon: "🐟", points: 25, fish: true },
  goldenFish: { name: "Golden fish", icon: "✨", points: 50, fish: true },
  boot: { name: "Old boot", icon: "🥾", points: 2, junk: true },
  can: { name: "Soda can", icon: "🥫", points: 5, junk: true },
  sock: { name: "Soggy sock", icon: "🧦", points: 5, junk: true },
  cup: { name: "Paper cup", icon: "🥤", points: 5, junk: true },
};

// Seconds the bite indicator stays up, and how many fake-out nibbles come
// before the real bite.
export const FISHING_LEVELS = {
  easy: { window: 1.5, nibbles: [0, 1] },
  normal: { window: 1.05, nibbles: [1, 2] },
  hard: { window: 0.7, nibbles: [1, 3] },
};

export const fishingLevel = (level) =>
  FISHING_LEVELS[level] || FISHING_LEVELS.normal;

// distance is 0 (right by the dock) to 1 (the far side of the pond).
// Longer casts find bigger fish; junk is the same everywhere.
export function catchOdds(distance) {
  const d = Math.min(1, Math.max(0, distance));
  const odds = {
    littleFish: 0.5 - 0.26 * d,
    bigFish: 0.12 + 0.26 * d,
    goldenFish: 0.01 + 0.05 * d,
    boot: 0.12,
    can: 0.09,
    sock: 0.08,
  };
  odds.cup = 1 - Object.values(odds).reduce((sum, p) => sum + p, 0);
  return odds;
}

export function rollCatch(distance, random = Math.random) {
  let roll = random();
  const odds = Object.entries(catchOdds(distance));
  for (const [kind, chance] of odds) {
    roll -= chance;
    if (roll < 0) return kind;
  }
  return odds.at(-1)[0];
}

// Timeline for one cast, in seconds after the bobber lands.
export function planBite(level = "normal", random = Math.random) {
  const { window, nibbles } = fishingLevel(level);
  const count =
    nibbles[0] + Math.floor(random() * (nibbles[1] - nibbles[0] + 1));
  let t = 1.4 + random() * 1.6;
  const times = [];
  for (let i = 0; i < count; i++) {
    times.push(t);
    t += 0.8 + random() * 0.9;
  }
  return { nibbles: times, biteAt: t, window };
}

// What pressing reel at time t (after landing) does.
export function judgeReel(plan, t) {
  if (t < plan.biteAt) return "early";
  if (t <= plan.biteAt + plan.window) return "hooked";
  return "late";
}

export function fishingSummary(catches) {
  const fish = catches.filter((kind) => CATCHES[kind].fish);
  const junk = catches.filter((kind) => CATCHES[kind].junk);
  const rank = ["littleFish", "bigFish", "goldenFish"];
  const best = fish.reduce(
    (top, kind) => (rank.indexOf(kind) > rank.indexOf(top) ? kind : top),
    null,
  );
  return {
    score: catches.reduce((sum, kind) => sum + CATCHES[kind].points, 0),
    fish: fish.length,
    junk: junk.length,
    best,
  };
}
