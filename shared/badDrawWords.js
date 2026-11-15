export const BAD_DRAW_WORDS = Object.freeze({
  animals: [
    "elephant",
    "giraffe",
    "penguin",
    "dinosaur",
    "octopus",
    "turtle",
    "snake",
    "butterfly",
    "kangaroo",
    "flamingo",
    "shark",
    "rabbit",
    "spider",
    "whale",
    "snail",
    "owl",
    "crocodile",
    "duck",
    "zebra",
    "squirrel",
    "frog",
    "crab",
    "hedgehog",
    "jellyfish",
  ],
  objects: [
    "bicycle",
    "umbrella",
    "toothbrush",
    "scissors",
    "telescope",
    "balloon",
    "ladder",
    "guitar",
    "clock",
    "key",
    "hammer",
    "backpack",
    "flashlight",
    "kite",
    "crown",
    "snowman",
    "skateboard",
    "sailboat",
    "helicopter",
    "rocket",
    "tractor",
    "mailbox",
    "sunglasses",
    "traffic cone",
    "watering can",
    "wheelbarrow",
    "birdhouse",
    "shopping cart",
    "trampoline",
    "roller skates",
    "train",
    "vacuum cleaner",
  ],
  food: [
    "pizza",
    "banana",
    "hamburger",
    "watermelon",
    "ice cream",
    "carrot",
    "donut",
    "pretzel",
    "cupcake",
    "popcorn",
    "pineapple",
    "hot dog",
    "taco",
    "strawberry",
    "pancakes",
    "sandwich",
    "fried egg",
    "corn on the cob",
    "cheese",
    "cherries",
    "pumpkin",
    "broccoli",
    "mushroom",
    "lollipop",
  ],
  activities: [
    "swimming",
    "fishing",
    "skiing",
    "dancing",
    "sleeping",
    "jumping rope",
    "walking a dog",
    "brushing teeth",
    "building a sandcastle",
    "juggling",
    "blowing bubbles",
    "riding a horse",
    "bowling",
    "playing drums",
    "roasting marshmallows",
    "flying a kite",
  ],
  places: [
    "playground",
    "beach",
    "castle",
    "farm",
    "school",
    "volcano",
    "lighthouse",
    "igloo",
    "treehouse",
    "bridge",
    "tent",
    "pyramid",
  ],
});

/** Draw without replacement. On exhaustion, favor words this drawer has
 * seen least often and avoid repeating the previous word when possible. */
export function createWordPicker({
  words = Object.values(BAD_DRAW_WORDS).flat(),
  random = Math.random,
} = {}) {
  const bank = [...new Set(words.filter((word) => word?.trim()))];
  if (!bank.length) bank.push("kite");
  const used = new Set();
  const byDrawer = new Map();
  let previous;
  return (drawerId) => {
    const seen = byDrawer.get(drawerId) || new Map();
    byDrawer.set(drawerId, seen);
    if (used.size === bank.length) used.clear();
    const available = bank.filter((word) => !used.has(word));
    const distinct = available.filter((word) => word !== previous);
    const pool = distinct.length ? distinct : available;
    const count = (word) => seen.get(word) || 0;
    const min = Math.min(...pool.map(count));
    const candidates = pool.filter((word) => count(word) === min);
    const word = candidates[Math.floor(random() * candidates.length)];
    previous = word;
    used.add(word);
    seen.set(word, count(word) + 1);
    return word;
  };
}
