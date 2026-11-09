// Food Finder: about fifty foods are spread over a picnic blanket and the
// player is shown one to find. Pure logic (no DOM, no three.js) so it can be
// tested: the food list, the levels, the layout and picking what to find.

// Models from Kenney's Food Kit (CC0), in src/assets/food/<id>.glb.
export const FOODS = [
  { id: "apple", name: "apple" },
  { id: "banana", name: "banana" },
  { id: "carrot", name: "carrot" },
  { id: "broccoli", name: "broccoli" },
  { id: "burger", name: "burger" },
  { id: "pizza", name: "pizza" },
  { id: "donut-sprinkles", name: "donut" },
  { id: "cupcake", name: "cupcake" },
  { id: "cake-birthday", name: "birthday cake" },
  { id: "cookie-chocolate", name: "cookie" },
  { id: "ice-cream", name: "ice cream" },
  { id: "strawberry", name: "strawberry" },
  { id: "cherries", name: "cherries" },
  { id: "grapes", name: "grapes" },
  { id: "watermelon", name: "watermelon" },
  { id: "pineapple", name: "pineapple" },
  { id: "pear", name: "pear" },
  { id: "orange", name: "orange" },
  { id: "lemon", name: "lemon" },
  { id: "corn", name: "corn" },
  { id: "tomato", name: "tomato" },
  { id: "mushroom", name: "mushroom" },
  { id: "egg", name: "egg" },
  { id: "cheese", name: "cheese" },
  { id: "loaf", name: "bread" },
  { id: "croissant", name: "croissant" },
  { id: "pancakes", name: "pancakes" },
  { id: "waffle", name: "waffle" },
  { id: "hot-dog", name: "hot dog" },
  { id: "taco", name: "taco" },
  { id: "sandwich", name: "sandwich" },
  { id: "fries", name: "fries" },
  { id: "popsicle", name: "popsicle" },
  { id: "lollypop", name: "lollipop" },
  { id: "eggplant", name: "eggplant" },
  { id: "pumpkin", name: "pumpkin" },
  { id: "coconut", name: "coconut" },
  { id: "avocado", name: "avocado" },
  { id: "fish", name: "fish" },
  { id: "muffin", name: "muffin" },
  { id: "pie", name: "pie" },
  { id: "cabbage", name: "cabbage" },
  { id: "onion", name: "onion" },
  { id: "honey", name: "honey" },
  { id: "chocolate", name: "chocolate bar" },
  { id: "turkey", name: "turkey" },
  { id: "sundae", name: "sundae" },
  { id: "cup-coffee", name: "cup" },
  { id: "soda-can", name: "soda can" },
  { id: "paprika", name: "pepper" },
  { id: "rice-ball", name: "rice ball" },
  { id: "bacon", name: "bacon" },
  { id: "beet", name: "beet" },
  { id: "salad", name: "salad" },
  { id: "whole-ham", name: "ham" },
  { id: "bottle-ketchup", name: "ketchup" },
  { id: "peanut-butter", name: "peanut butter" },
  { id: "bowl-soup", name: "soup" },
  { id: "sushi-salmon", name: "sushi" },
  { id: "ginger-bread", name: "gingerbread man" },
  { id: "pudding", name: "pudding" },
  { id: "frappe", name: "milkshake" },
  { id: "carton", name: "milk" },
  { id: "corn-dog", name: "corn dog" },
  { id: "utensil-spoon", name: "spoon" },
  { id: "utensil-fork", name: "fork" },
  { id: "plate", name: "plate" },
  { id: "meat-ribs", name: "ribs" },
  { id: "egg-cooked", name: "fried egg" },
  { id: "frying-pan", name: "frying pan" },
  { id: "pot", name: "pot" },
  { id: "whisk", name: "whisk" },
  { id: "rollingPin", name: "rolling pin" },
  { id: "glass", name: "glass" },
  { id: "cooking-spatula", name: "spatula" },
];

export const FOOD_LEVELS = {
  easy: { count: 24, finds: 8 },
  normal: { count: 50, finds: 10 },
  hard: { count: 60, finds: 12 },
};
export const foodLevel = (level) => FOOD_LEVELS[level] || FOOD_LEVELS.normal;

// Wrong taps on one food before the right one starts to bounce.
export const HINT_AFTER_MISSES = 3;

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Foods may touch but not overlap by more than this share of their size.
export const MAX_OVERLAP = 0.2;
// Seen from the tilted camera, foods stand up into the row behind them, so
// keep a little more room front to back than side to side.
export const DEPTH_ROOM = 1.25;

// Room between two spots, in food sizes: 1 is just touching.
export const spotGap = (a, b) =>
  Math.hypot(a.x - b.x, (a.z - b.z) / DEPTH_ROOM);

// Spots for `count` foods scattered at random in a width × depth rectangle
// centred on 0. Each food is `size` across; no two are closer than
// (1 - MAX_OVERLAP) × size, and every food sits inside the rectangle.
// Foods are made as big as still lets them all fit somewhere random.
export function layoutSpots(count, width, depth, random) {
  const scatter = (size) => {
    const near = size * (1 - MAX_OVERLAP);
    const spanX = width - size;
    const spanZ = depth - size;
    if (spanX < 0 || spanZ < 0) return null;
    const spots = [];
    for (let i = 0; i < count; i++) {
      let spot = null;
      for (let tries = 0; tries < 600 && !spot; tries++) {
        const at = {
          x: (random() - 0.5) * spanX,
          z: (random() - 0.5) * spanZ,
        };
        if (spots.every((other) => spotGap(at, other) >= near)) spot = at;
      }
      if (!spot) return null;
      spots.push(spot);
    }
    return spots;
  };
  // Find about the biggest size that fits, then use a bit less so the foods
  // are loosely strewn rather than packed.
  let low = 0;
  let high = Math.min(width, depth, Math.sqrt((width * depth) / count) * 1.4);
  for (let step = 0; step < 14; step++) {
    const mid = (low + high) / 2;
    if (scatter(mid)) low = mid;
    else high = mid;
  }
  for (let size = low * 0.92; ; size *= 0.97) {
    const spots = scatter(size);
    if (spots) return { spots, size };
  }
}

// The foods that start on the blanket: `count` different ones.
export function startingFoods(count, random) {
  return shuffle(FOODS, random)
    .slice(0, Math.min(count, FOODS.length))
    .map((food) => food.id);
}

// What to find next: something on the blanket, not one of the last few.
export function pickTarget(onBlanket, recent, random) {
  const fresh = onBlanket.filter((id) => !recent.includes(id));
  const pool = fresh.length ? fresh : onBlanket;
  return pool[Math.floor(random() * pool.length)];
}

// A food to drop into the spot a found one left: one that isn't out yet.
export function replacementFood(onBlanket, random) {
  const spare = FOODS.filter((food) => !onBlanket.includes(food.id));
  if (!spare.length) return null;
  return spare[Math.floor(random() * spare.length)].id;
}

export const foodById = (id) => FOODS.find((food) => food.id === id);

// "the apple", "the cherries".
export const theFood = (id) => `the ${foodById(id)?.name ?? id}`;

// What the game says. A line is {text, keys}: `keys` are clips in the
// recorded voice (src/assets/food/voice.*, made by tools/make_food_voice.py
// from voicePhrases()), and `text` is spoken by the browser when the clips
// aren't loaded.
export const PRAISE = ["Yay!", "Yum!", "Great looking!", "You did it!"];
const COUNT_WORDS = { 8: "eight", 10: "ten", 12: "twelve" };

export const askLine = (id) => ({
  text: `Can you find ${theFood(id)}?`,
  keys: [`find_${id}`],
});

export const praiseLine = (index, id) => ({
  text: `${PRAISE[index]} You found ${theFood(id)}!`,
  keys: [`praise${index}`, `found_${id}`],
});

export const otherLine = (id, target) => ({
  text: `That's ${theFood(id)}. Can you find ${theFood(target)}?`,
  keys: [`that_${id}`, `find_${target}`],
});

export const doneLine = (finds) => ({
  text: `You found all ${COUNT_WORDS[finds] ?? finds} foods! Great job!`,
  keys: [`done_${finds}`],
});

// Every clip the lines above can ask for: {key: text}.
export function voicePhrases() {
  const phrases = {};
  for (const { id } of FOODS) {
    phrases[`find_${id}`] = `Can you find ${theFood(id)}?`;
    phrases[`found_${id}`] = `You found ${theFood(id)}!`;
    phrases[`that_${id}`] = `That's ${theFood(id)}.`;
  }
  PRAISE.forEach((word, index) => (phrases[`praise${index}`] = word));
  for (const { finds } of Object.values(FOOD_LEVELS))
    phrases[`done_${finds}`] = doneLine(finds).text;
  return phrases;
}
