// Look & Find: static scenes and picture checklists for ages 4–7.
import { rng, shuffle } from "./foodFinder.js";
export { rng, shuffle };
export const OBJECTS = [
  {
    id: "rabbit",
    name: "rabbit",
    image: "1f407.svg",
  },
  {
    id: "fox",
    name: "fox",
    image: "1f98a.svg",
  },
  {
    id: "owl",
    name: "owl",
    image: "1f989.svg",
  },
  {
    id: "butterfly",
    name: "butterfly",
    image: "1f98b.svg",
  },
  {
    id: "snail",
    name: "snail",
    image: "1f40c.svg",
  },
  {
    id: "ladybug",
    name: "ladybug",
    image: "1f41e.svg",
  },
  {
    id: "bee",
    name: "bee",
    image: "1f41d.svg",
  },
  {
    id: "frog",
    name: "frog",
    image: "1f438.svg",
  },
  {
    id: "turtle",
    name: "turtle",
    image: "1f422.svg",
  },
  {
    id: "bird",
    name: "bird",
    image: "1f426.svg",
  },
  {
    id: "hedgehog",
    name: "hedgehog",
    image: "1f994.svg",
  },
  {
    id: "duck",
    name: "duck",
    image: "1f986.svg",
  },
  {
    id: "mushroom",
    name: "mushroom",
    image: "1f344.svg",
  },
  {
    id: "sunflower",
    name: "sunflower",
    image: "1f33b.svg",
  },
  {
    id: "leaf",
    name: "leaf",
    image: "1f341.svg",
  },
  {
    id: "apple",
    name: "apple",
    image: "1f34e.svg",
  },
  {
    id: "carrot",
    name: "carrot",
    image: "1f955.svg",
  },
  {
    id: "tent",
    name: "tent",
    image: "26fa.svg",
  },
  {
    id: "kite",
    name: "kite",
    image: "1fa81.svg",
  },
  {
    id: "boot",
    name: "boot",
    image: "1f97e.svg",
  },
  {
    id: "basket",
    name: "basket",
    image: "1f9fa.svg",
  },
  {
    id: "umbrella",
    name: "umbrella",
    image: "2602.svg",
  },
  {
    id: "telescope",
    name: "telescope",
    image: "1f52d.svg",
  },
  {
    id: "map",
    name: "map",
    image: "1f5fa.svg",
  },
  {
    id: "teddy-bear",
    name: "teddy bear",
    image: "1f9f8.svg",
  },
  {
    id: "train",
    name: "train",
    image: "1f682.svg",
  },
  {
    id: "car",
    name: "car",
    image: "1f697.svg",
  },
  {
    id: "fire-engine",
    name: "fire engine",
    image: "1f692.svg",
  },
  {
    id: "robot",
    name: "robot",
    image: "1f916.svg",
  },
  {
    id: "doll",
    name: "doll",
    image: "1f38e.svg",
  },
  {
    id: "puzzle-piece",
    name: "puzzle piece",
    image: "1f9e9.svg",
  },
  {
    id: "ball",
    name: "ball",
    image: "26bd.svg",
  },
  {
    id: "crayon",
    name: "crayon",
    image: "1f58d.svg",
  },
  {
    id: "paintbrush",
    name: "paintbrush",
    image: "1f58c.svg",
  },
  {
    id: "drum",
    name: "drum",
    image: "1f941.svg",
  },
  {
    id: "guitar",
    name: "guitar",
    image: "1f3b8.svg",
  },
  {
    id: "book",
    name: "book",
    image: "1f4d5.svg",
  },
  {
    id: "backpack",
    name: "backpack",
    image: "1f392.svg",
  },
  {
    id: "sock",
    name: "sock",
    image: "1f9e6.svg",
  },
  {
    id: "hat",
    name: "hat",
    image: "1f3a9.svg",
  },
  {
    id: "crown",
    name: "crown",
    image: "1f451.svg",
  },
  {
    id: "balloon",
    name: "balloon",
    image: "1f388.svg",
  },
  {
    id: "present",
    name: "present",
    image: "1f381.svg",
  },
  {
    id: "dinosaur",
    name: "dinosaur",
    image: "1f995.svg",
  },
  {
    id: "cookie",
    name: "cookie",
    image: "1f36a.svg",
  },
  {
    id: "pencil",
    name: "pencil",
    image: "270f.svg",
  },
  {
    id: "rocket",
    name: "rocket",
    image: "1f680.svg",
  },
  {
    id: "flying-saucer",
    name: "flying saucer",
    image: "1f6f8.svg",
  },
  {
    id: "satellite",
    name: "satellite",
    image: "1f6f0.svg",
  },
  {
    id: "alien",
    name: "alien",
    image: "1f47d.svg",
  },
  {
    id: "moon",
    name: "moon",
    image: "1f319.svg",
  },
  {
    id: "ringed-planet",
    name: "ringed planet",
    image: "1fa90.svg",
  },
  {
    id: "star",
    name: "star",
    image: "2b50.svg",
  },
  {
    id: "comet",
    name: "comet",
    image: "2604.svg",
  },
  {
    id: "globe",
    name: "globe",
    image: "1f30d.svg",
  },
  {
    id: "sun",
    name: "sun",
    image: "2600.svg",
  },
  {
    id: "crystal",
    name: "crystal",
    image: "1f48e.svg",
  },
  {
    id: "magnet",
    name: "magnet",
    image: "1f9f2.svg",
  },
  {
    id: "wrench",
    name: "wrench",
    image: "1f527.svg",
  },
  {
    id: "flashlight",
    name: "flashlight",
    image: "1f526.svg",
  },
  {
    id: "key",
    name: "key",
    image: "1f511.svg",
  },
  {
    id: "battery",
    name: "battery",
    image: "1f50b.svg",
  },
  {
    id: "clock",
    name: "clock",
    image: "23f0.svg",
  },
  {
    id: "flag",
    name: "flag",
    image: "1f6a9.svg",
  },
  {
    id: "sandwich",
    name: "sandwich",
    image: "1f96a.svg",
  },
  {
    id: "juice-box",
    name: "juice box",
    image: "1f9c3.svg",
  },
];
export const THEMES = [
  {
    id: "woodland",
    name: "Woodland Walk",
    description: "A little trail full of woodland surprises.",
    objects: [
      "rabbit",
      "fox",
      "owl",
      "butterfly",
      "snail",
      "ladybug",
      "bee",
      "frog",
      "turtle",
      "bird",
      "hedgehog",
      "duck",
      "mushroom",
      "sunflower",
      "leaf",
      "apple",
      "carrot",
      "tent",
      "kite",
      "boot",
      "basket",
      "umbrella",
      "telescope",
      "map",
    ],
  },
  {
    id: "playroom",
    name: "Toy Room",
    description: "Someone has been busy playing!",
    objects: [
      "teddy-bear",
      "train",
      "car",
      "fire-engine",
      "robot",
      "doll",
      "puzzle-piece",
      "ball",
      "crayon",
      "paintbrush",
      "drum",
      "guitar",
      "book",
      "backpack",
      "sock",
      "hat",
      "crown",
      "balloon",
      "present",
      "dinosaur",
      "duck",
      "cookie",
      "apple",
      "pencil",
    ],
  },
  {
    id: "space",
    name: "Space Camp",
    description: "A curious camp among the stars.",
    objects: [
      "rocket",
      "flying-saucer",
      "satellite",
      "robot",
      "alien",
      "moon",
      "ringed-planet",
      "star",
      "comet",
      "telescope",
      "globe",
      "sun",
      "crystal",
      "magnet",
      "wrench",
      "flashlight",
      "key",
      "battery",
      "clock",
      "flag",
      "backpack",
      "teddy-bear",
      "sandwich",
      "juice-box",
    ],
  },
];
export const LEVELS = {
  easy: { count: 12, finds: 5 },
  normal: { count: 18, finds: 6 },
  hard: { count: 24, finds: 8 },
};
export const objectById = (id) => OBJECTS.find((item) => item.id === id);
export function makeRound(themeId, level, random) {
  const theme = THEMES.find((item) => item.id === themeId) || THEMES[0];
  const settings = LEVELS[level] || LEVELS.normal;
  const objects = shuffle(theme.objects, random).slice(0, settings.count);
  return {
    objects,
    targets: shuffle(objects, random).slice(0, settings.finds),
  };
}
// Scatter the objects organically. A clear footprint keeps each picture readable
// and its touch target separate, even on portrait phones.
export function sceneLayout(count, width, height, random = rng(1)) {
  if (!count) return [];
  let size = Math.min(
    100,
    Math.sqrt((width * height) / count) * 0.64,
    width * 0.6,
    height * 0.6,
  );
  for (let attempt = 0; attempt < 30; attempt++, size *= 0.96) {
    const spots = [];
    for (let i = 0; i < count; i++) {
      let best = null,
        bestGap = -1;
      for (let tries = 0; tries < 100; tries++) {
        const point = {
          x: size * 0.64 + random() * (width - size * 1.28),
          y: size * 0.64 + random() * (height - size * 1.28),
        };
        const gap = spots.length
          ? Math.min(
              ...spots.map((p) => Math.hypot(p.x - point.x, p.y - point.y)),
            )
          : Infinity;
        if (gap > bestGap) {
          best = point;
          bestGap = gap;
        }
      }
      if (bestGap < size * 1.26) break;
      spots.push({ ...best, size, angle: (random() - 0.5) * 0.5 });
    }
    if (spots.length === count) return spots;
  }
  throw new Error("Could not fit the picture objects");
}
