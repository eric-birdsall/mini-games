// Visual navigation only: these zones never change collision or game rules.
const THEMES = {
  // Lane colours split at the lane walls; staging is the spawn bunker.
  compound: {
    lines: [21, -6],
    cuts: [-6, 10],
    colors: ["#258c9b", "#c99536", "#637bc4"],
    sky: "#8fd3ff",
    staging: "#65846e",
    plaza: "#a386b5",
  },
  lanes: {
    lines: [21, -6],
    cuts: [-8.25, 6.75],
    colors: ["#3b9c82", "#c18d39", "#507fc7"],
    sky: "#92d5ff",
    staging: "#7e899e",
    plaza: "#a681b6",
  },
  quad: {
    lines: [21, -6],
    cuts: [-9.5, 0, 9.5],
    colors: ["#358da5", "#c59336", "#8470b5", "#4c9970"],
    sky: "#95d2ff",
    staging: "#7e899e",
    plaza: "#b49272",
  },
  monolith: {
    lines: [31, -14],
    cuts: [-9.2, 9.2],
    colors: ["#398f99", "#c4a05b", "#8273b9"],
    sky: "#9ad6ff",
    staging: "#718c79",
    plaza: "#6383ae",
  },
  // Pier 9: cheerful garden buildings, sunny play blocks and waterfront blue.
  docks: {
    lines: [27, -18.5],
    cuts: [-10, 10],
    colors: ["#e6bd80", "#eba379", "#81c6dc"],
    sky: "#8fd8ff",
    staging: "#a9cd88",
    plaza: "#d7c58a",
  },
  // Relay Station: cable-yard green, switchyard amber, pump-yard teal;
  // both sites and the hall share the plaza colour.
  relay: {
    lines: [27, -8],
    cuts: [-9, 9],
    colors: ["#5f8f5a", "#c4923a", "#3f8f9a"],
    sky: "#93d4ff",
    staging: "#6f7f73",
    plaza: "#a07a9c",
  },
  // Hot Potato's court: a blue half (south) and a red half (north).
  court: {
    lines: [0.05, -0.05],
    cuts: [],
    colors: ["#e8e2cf"],
    sky: "#8fd3ff",
    staging: "#4f7fc0",
    plaza: "#c0604f",
  },
  // Breakout's hallways: one colour all the way (see shared/breakout.js).
  breakout: {
    lines: [1e4, -1e4],
    cuts: [],
    colors: ["#8c8fa0"],
    sky: "#9dd8ff",
    staging: "#8c8fa0",
    plaza: "#8c8fa0",
  },
  // Boulder Dash's channel: sandstone all the way (see shared/boulders.js).
  boulders: {
    lines: [1e4, -1e4],
    cuts: [],
    colors: ["#b9ae98"],
    sky: "#a6dcff",
    staging: "#b9ae98",
    plaza: "#b9ae98",
  },
  // Livewire's arena: dark basalt over the lava's glow (see
  // shared/livewire.js).
  crucible: {
    lines: [1e4, -1e4],
    cuts: [],
    colors: ["#fff0cf"],
    sky: "#b9e5ff",
    staging: "#fff0cf",
    plaza: "#fff0cf",
  },
};
export function mapTheme(id) {
  return (
    THEMES[id] ||
    (String(id).startsWith("breakout-") && THEMES.breakout) ||
    (String(id).startsWith("boulders-") && THEMES.boulders) ||
    THEMES.compound
  );
}
// Staging lies beyond the first line, the objective plaza beyond the second.
const lines = (t) => t.lines || [19, -6];
export function areaColor(id, x, z) {
  const t = mapTheme(id),
    [south, north] = lines(t);
  if (z > south) return t.staging;
  if (z < north) return t.plaza;
  const i = t.cuts.findIndex((c) => x < c);
  return t.colors[i < 0 ? t.colors.length - 1 : i];
}
export function colorZones(id, bounds) {
  const t = mapTheme(id),
    // Lines beyond the floor stop at its edge.
    [south, north] = lines(t).map((v) =>
      Math.max(-bounds.z, Math.min(bounds.z, v)),
    ),
    edges = [-bounds.x, ...t.cuts, bounds.x];
  return [
    {
      x: 0,
      z: (south + bounds.z) / 2,
      w: bounds.x * 2,
      d: bounds.z - south,
      color: t.staging,
    },
    {
      x: 0,
      z: (-bounds.z + north) / 2,
      w: bounds.x * 2,
      d: bounds.z + north,
      color: t.plaza,
    },
    ...t.colors.map((color, i) => ({
      x: (edges[i] + edges[i + 1]) / 2,
      z: (north + south) / 2,
      w: edges[i + 1] - edges[i],
      d: south - north,
      color,
    })),
  ];
}
