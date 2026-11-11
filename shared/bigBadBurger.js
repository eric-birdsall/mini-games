// Big Bad Burger: the stacking rules, shared by the game and its tests.
//
// The burger is a column of layers seen from the front. Each layer has a
// centre x, a width and a weight; the bottom bun sits on the plate at x = 0.
// The next ingredient slides back and forth above the stack, and dropping it
// lands it at wherever it was. A layer only stays up while the balance point
// of everything resting on a layer stays over the part they actually touch,
// so leaning one way has to be saved by leaning back the other way.

export const INGREDIENTS = {
  bun: { name: "bun", width: 1.15, height: 0.26, weight: 1.4 },
  patty: { name: "patty", width: 1.05, height: 0.22, weight: 3 },
  cheese: { name: "cheese", width: 1.12, height: 0.05, weight: 0.6 },
  tomato: { name: "tomato", width: 0.92, height: 0.1, weight: 1 },
  lettuce: { name: "lettuce", width: 1.2, height: 0.08, weight: 0.4 },
  onion: { name: "onion", width: 0.86, height: 0.08, weight: 0.6 },
  pickles: { name: "pickles", width: 0.82, height: 0.06, weight: 0.5 },
  bacon: { name: "bacon", width: 1.22, height: 0.07, weight: 0.8 },
};
// What can come next, with patties and cheese a bit more often.
const DECK = [
  "patty",
  "patty",
  "cheese",
  "cheese",
  "tomato",
  "lettuce",
  "onion",
  "pickles",
  "bacon",
];

export const LEVELS = {
  // range: how far either side the ingredient slides. speed: units per
  // second at the start, growing by `ramp` per layer up to `top`.
  // perfect: a drop this close to the layer below snaps right on top.
  // grip: sauce! how far past the edge the balance point may go.
  // ring: show a landing ring where the dropped piece will land.
  easy: {
    range: 1.0,
    speed: 0.75,
    ramp: 0.03,
    top: 1.9,
    perfect: 0.09,
    grip: 0.1,
    ring: true,
  },
  normal: {
    range: 1.35,
    speed: 1.05,
    ramp: 0.05,
    top: 2.9,
    perfect: 0.06,
    grip: 0.05,
  },
  hard: {
    range: 1.6,
    speed: 1.4,
    ramp: 0.07,
    top: 3.8,
    perfect: 0.035,
    grip: 0,
  },
};
export const burgerLevel = (level) => LEVELS[level] ?? LEVELS.normal;

// A small seeded random so a round can be replayed in tests.
export function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

export function layer(kind, x = 0) {
  const { width, height, weight } = INGREDIENTS[kind];
  return { kind, x, width, height, weight };
}

export function createStack() {
  const bun = layer("bun");
  bun.y = 0;
  return [bun];
}

export const stackTop = (stack) => {
  const top = stack[stack.length - 1];
  return top.y + top.height;
};

// The next ingredient, never the same as the one just placed.
export function nextKind(previous, rand = Math.random) {
  const choices = DECK.filter((k) => k !== previous);
  return choices[Math.floor(rand() * choices.length)];
}

// How fast the ingredient slides once the burger is `layers` tall.
export function slideSpeed(level, layers) {
  const l = burgerLevel(level);
  return Math.min(l.top, l.speed + l.ramp * Math.max(0, layers - 1));
}

// Back-and-forth motion: a triangle wave between -range and +range.
// `travel` is the total distance moved so far.
export function slideX(level, travel) {
  const r = burgerLevel(level).range;
  const p = (((travel + r) % (4 * r)) + 4 * r) % (4 * r);
  return p < 2 * r ? p - r : 3 * r - p;
}

// Where the stack fails, if it does: the lowest layer whose load (it and
// everything above) has its balance point beyond the part of the layer below
// it is resting on. Returns null when the burger stands, or
// { index, pivot, side } with `pivot` the edge it tips over (-1 left, 1 right).
export function topple(stack, grip = 0) {
  let weight = 0;
  let moment = 0;
  let failed = null;
  for (let i = stack.length - 1; i >= 1; i--) {
    const l = stack[i];
    weight += l.weight;
    moment += l.weight * l.x;
    const com = moment / weight;
    const below = stack[i - 1];
    const lo = Math.max(below.x - below.width / 2, l.x - l.width / 2);
    const hi = Math.min(below.x + below.width / 2, l.x + l.width / 2);
    // Nothing touching at all: it slid right off.
    if (hi <= lo)
      return {
        index: i,
        pivot: l.x < below.x ? lo : hi,
        side: Math.sign(l.x - below.x) || 1,
        missed: true,
      };
    // Keep looking down: the lowest failure takes the most with it.
    if (com < lo - grip) failed = { index: i, pivot: lo, side: -1 };
    else if (com > hi + grip) failed = { index: i, pivot: hi, side: 1 };
  }
  return failed;
}

// How close the burger is to falling over, from 0 (dead centre) to 1 (about
// to go), and which way it leans. Used for the wobble and the warning.
export function lean(stack, grip = 0) {
  let weight = 0;
  let moment = 0;
  let worst = 0;
  let side = 0;
  for (let i = stack.length - 1; i >= 1; i--) {
    const l = stack[i];
    weight += l.weight;
    moment += l.weight * l.x;
    const com = moment / weight;
    const below = stack[i - 1];
    const lo = Math.max(below.x - below.width / 2, l.x - l.width / 2) - grip;
    const hi = Math.min(below.x + below.width / 2, l.x + l.width / 2) + grip;
    const mid = (lo + hi) / 2;
    const half = Math.max(1e-6, (hi - lo) / 2);
    const amount = Math.abs(com - mid) / half;
    if (amount > worst) {
      worst = amount;
      side = Math.sign(com - mid);
    }
  }
  return { amount: Math.min(1, worst), side };
}

// Drop `kind` at `x` onto the stack. Returns what happened:
//   { perfect, fell: null | topple() result }
// The layer is added to the stack either way (a fallen one tips with the rest).
export function drop(stack, kind, x, level) {
  const l = burgerLevel(level);
  const below = stack[stack.length - 1];
  const item = layer(kind, x);
  const perfect = Math.abs(x - below.x) <= l.perfect;
  if (perfect) item.x = below.x;
  item.y = stackTop(stack);
  stack.push(item);
  return { perfect, fell: topple(stack, l.grip) };
}

// Milestones worth a cheer.
export function milestone(layers) {
  if (layers === 10) return "That's a BIG burger!";
  if (layers === 20) return "That's a BAD burger!";
  if (layers === 30) return "BIG BAD BURGER!!";
  if (layers > 30 && layers % 10 === 0) return `${layers} layers! Unstoppable!`;
  return "";
}
