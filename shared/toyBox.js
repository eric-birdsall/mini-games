export const TOYS = [
  { name: "Teddy bear", icon: "🧸", color: "#d69a64" },
  { name: "Rocket", icon: "🚀", color: "#f18076" },
  { name: "Rubber duck", icon: "🦆", color: "#f5ce62" },
  { name: "Toy car", icon: "🚗", color: "#7ebddd" },
  { name: "Dinosaur", icon: "🦕", color: "#97c89b" },
  { name: "Soccer ball", icon: "⚽", color: "#e9e3dc" },
];
export const TOY_LEVELS = { easy: 0.085, normal: 0.065, hard: 0.045 };
export function createToyBox(random = Math.random, level = "normal") {
  const slots = Array.from({ length: 12 }, (_, i) => ({
    x: 0.13 + (i % 4) * 0.245 + (random() - 0.5) * 0.04,
    y: 0.19 + Math.floor(i / 4) * 0.3 + (random() - 0.5) * 0.04,
  }));
  // Shuffle slots, keeping toys separated and every target reachable.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return {
    toys: TOYS.map((toy, i) => ({ ...toy, ...slots[i], id: i })),
    target: 0,
    rescued: [],
    attempts: 0,
    radius: TOY_LEVELS[level] || TOY_LEVELS.normal,
  };
}
export function grabToy(state, x, y) {
  if (!state.toys.length) return { kind: "complete", toy: null };
  state.attempts++;
  const toy = state.toys.reduce((nearest, item) =>
    Math.hypot(item.x - x, item.y - y) <
    Math.hypot(nearest.x - x, nearest.y - y)
      ? item
      : nearest,
  );
  if (Math.hypot(toy.x - x, toy.y - y) > state.radius)
    return { kind: "miss", toy: null };
  if (toy.id !== state.target) return { kind: "wrong", toy };
  state.toys = state.toys.filter((item) => item !== toy);
  state.rescued.push(toy);
  state.target = state.toys[0]?.id ?? null;
  return { kind: state.toys.length ? "rescued" : "complete", toy };
}
