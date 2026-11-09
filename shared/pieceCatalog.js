// The piece library both editors browse: categories, ready-sized presets of
// the piece types, search, and "My Pieces" (saved groups of pieces).
import {
  PIECE_TYPES,
  CUSTOM_SIZES,
  MAX_PIECES,
  MAX_BUILD_HEIGHT,
  pieceBase,
  pieceHeight,
  pieceTop,
} from "./customMap.js";

export const CATEGORIES = [
  { id: "walls", label: "Walls" },
  { id: "cover", label: "Cover" },
  { id: "climb", label: "Ramps & Stairs" },
  { id: "fences", label: "Railings & Fences" },
  { id: "platforms", label: "Platforms" },
  { id: "mine", label: "My Pieces" },
];
// Default colors when a piece has none of its own (the 2D planner, ghosts,
// thumbnails, and the drawn parts of fences and curves).
export const TYPE_COLORS = {
  wall: "#9a9e9d",
  wallDoor: "#9a9e9d",
  wallWindow: "#a3a7a5",
  wallCurve: "#8f9796",
  wallVault: "#9fa3a1",
  wallVent: "#9a9e9d",
  wallLeaf: "#6b5a48",
  wallL: "#9a9e9d",
  wallT: "#9a9e9d",
  wallSlit: "#9a9e9d",
  wallArch: "#a8a39a",
  wallCross: "#9a9e9d",
  wallU: "#9a9e9d",
  wallChicane: "#959b9a",
  pillbox: "#8b8f86",
  crenel: "#a39c8c",
  sandbags: "#b3a179",
  barrels: "#4f6f8a",
  crates: "#a5844f",
  tower: "#7a6a58",
  dais: "#a9a091",
  shelves: "#8a8f94",
  glassInf: "#7d8f97",
  glassSen: "#7d8f97",
  colonnade: "#a8a39a",
  hedge: "#4f7a44",
  container: "#a5543a",
  catwalk: "#6f7a82",
  ladder: "#c2a14a",
  deck: "#b9a47d",
  low: "#6f8f76",
  high: "#b0915a",
  coverRound: "#7a9a80",
  coverCurve: "#6f8f76",
  column: "#a8a39a",
  plat1: "#5f7488",
  plat2: "#4a6078",
  plat: "#3f566e",
  platRound: "#5a7390",
  ramp1: "#7f93a3",
  ramp2: "#6a8094",
  ramp: "#5f7689",
  stairs: "#8a8f9c",
  railing: "#c9ccc8",
  fence: "#aab2b5",
  gate: "#7c8489",
};
// w × d is the footprint at rotation 0 (w along x); h overrides the type's
// default rise. `key` is the 2D planner's shortcut.
export const PRESETS = [
  { id: "wall", t: "wall", w: 4, d: 0.5, key: "1" },
  { id: "wallDoor", t: "wallDoor", w: 4, d: 0.5 },
  { id: "wallWindow", t: "wallWindow", w: 6, d: 0.5 },
  { id: "wallCurve", t: "wallCurve", w: 4, d: 4 },
  { id: "wallHalf", t: "wall", name: "Half wall", w: 4, d: 0.5, h: 1.6 },
  { id: "wallVault", t: "wallVault", w: 4, d: 0.5 },
  { id: "wallVent", t: "wallVent", w: 4, d: 0.5 },
  { id: "wallLeaf", t: "wallLeaf", w: 4, d: 0.5 },
  { id: "wallL", t: "wallL", w: 4, d: 4 },
  { id: "wallT", t: "wallT", w: 6, d: 4 },
  { id: "wallSlit", t: "wallSlit", w: 4, d: 0.5 },
  { id: "wallArch", t: "wallArch", w: 4, d: 0.5 },
  { id: "wallCross", t: "wallCross", w: 4, d: 4 },
  { id: "wallU", t: "wallU", w: 4, d: 4 },
  { id: "wallChicane", t: "wallChicane", w: 6, d: 2.5 },
  { id: "pillar", t: "wall", name: "Square pillar", w: 1, d: 1 },
  { id: "pillbox", t: "pillbox", w: 5, d: 5 },
  { id: "glassInf", t: "glassInf", w: 4, d: 0.5 },
  { id: "glassSen", t: "glassSen", w: 4, d: 0.5 },
  { id: "low", t: "low", w: 2, d: 1, key: "2" },
  { id: "high", t: "high", w: 2, d: 1, key: "3" },
  { id: "coverRound", t: "coverRound", w: 1.5, d: 1.5 },
  { id: "coverCurve", t: "coverCurve", w: 3, d: 3 },
  { id: "column", t: "column", w: 1, d: 1 },
  { id: "silo", t: "column", name: "Round silo", w: 4, d: 4, h: 8 },
  { id: "colonnade", t: "colonnade", w: 8, d: 0.8 },
  { id: "barrier", t: "low", name: "Jersey barrier", w: 3, d: 0.6, h: 0.9 },
  { id: "crenel", t: "crenel", w: 6, d: 0.8 },
  { id: "sandbags", t: "sandbags", w: 3, d: 3 },
  { id: "barrels", t: "barrels", w: 1.5, d: 1.5 },
  { id: "crates", t: "crates", w: 2, d: 3 },
  { id: "shelves", t: "shelves", w: 4, d: 0.8 },
  { id: "hedge", t: "hedge", w: 3, d: 1 },
  { id: "container", t: "container", w: 6, d: 2.5 },
  { id: "ramp1", t: "ramp1", w: 2.5, d: 6, key: "6" },
  { id: "ramp2", t: "ramp2", w: 2.5, d: 6, key: "7" },
  { id: "ramp36", t: "ramp", name: "Ramp to 3.6 m", w: 2.5, d: 9, h: 3.6 },
  { id: "ladder", t: "ladder", w: 0.8, d: 0.5 },
  {
    id: "stairs12",
    t: "stairs",
    name: "Stairs to 1.2 m",
    w: 2,
    d: 2.5,
    h: 1.2,
  },
  {
    id: "stairs24",
    t: "stairs",
    name: "Stairs to 2.4 m",
    w: 2,
    d: 4.5,
    h: 2.4,
  },
  {
    id: "stairs43",
    t: "stairs",
    name: "Stairs to 4.3 m",
    w: 2,
    d: 7.5,
    h: 4.3,
  },
  {
    id: "stairsWide",
    t: "stairs",
    name: "Wide stairs to 2.4 m",
    w: 5,
    d: 4.5,
    h: 2.4,
  },
  { id: "railing", t: "railing", w: 4, d: 0.5 },
  { id: "fence", t: "fence", w: 6, d: 0.5 },
  { id: "fenceLow", t: "fence", name: "Low fence", w: 4, d: 0.5, h: 1.2 },
  { id: "gate", t: "gate", w: 3, d: 0.5 },
  { id: "deck", t: "deck", w: 4, d: 4, key: "F" },
  { id: "bridge", t: "deck", name: "Bridge deck", w: 2, d: 8 },
  { id: "plat1", t: "plat1", w: 4, d: 4, key: "4" },
  { id: "plat2", t: "plat2", w: 4, d: 4, key: "5" },
  { id: "plat36", t: "plat", name: "Platform 3.6 m", w: 4, d: 4, h: 3.6 },
  { id: "platRound", t: "platRound", w: 4, d: 4 },
  { id: "catwalk", t: "catwalk", w: 8, d: 2 },
  { id: "tower", t: "tower", w: 3, d: 3 },
  { id: "dais", t: "dais", w: 5, d: 5 },
].map((p) => ({
  ...p,
  name: p.name || PIECE_TYPES[p.t].name,
  h: p.h ?? PIECE_TYPES[p.t].h,
  cat: presetCategory(p.t),
}));
function presetCategory(t) {
  if (
    [
      "wall",
      "wallDoor",
      "wallWindow",
      "wallCurve",
      "wallVault",
      "wallVent",
      "wallLeaf",
      "wallL",
      "wallT",
      "wallSlit",
      "wallArch",
      "wallCross",
      "wallU",
      "wallChicane",
      "pillbox",
      "glassInf",
      "glassSen",
    ].includes(t)
  )
    return "walls";
  if (
    [
      "low",
      "high",
      "coverRound",
      "coverCurve",
      "column",
      "colonnade",
      "hedge",
      "container",
      "crenel",
      "sandbags",
      "barrels",
      "crates",
      "shelves",
    ].includes(t)
  )
    return "cover";
  if (PIECE_TYPES[t].ramp || t === "stairs" || t === "ladder") return "climb";
  if (PIECE_TYPES[t].see) return "fences";
  return "platforms";
}
export const presetById = (id) => PRESETS.find((p) => p.id === id);
const round = (v) => Math.round(v * 10) / 10;
// "4 × 0.5 m · 4 m tall"; ramps and stairs say how high they climb.
export function describeSize({ w, d, h, t }) {
  const climbs = PIECE_TYPES[t]?.ramp || t === "stairs";
  return `${round(w)} × ${round(d)} m · ${climbs ? `rises ${round(h)} m` : `${round(h)} m tall`}`;
}
// Case-insensitive search over names, categories and type names, within a
// category ("all" for every one). Saved groups match by name.
export function searchLibrary(query, category, mine = []) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const label = (cat) => CATEGORIES.find((c) => c.id === cat)?.label || "";
  const matches = (text) => words.every((w) => text.toLowerCase().includes(w));
  const presets = PRESETS.filter(
    (p) =>
      (category === "all" || category === p.cat) &&
      matches(`${p.name} ${label(p.cat)} ${PIECE_TYPES[p.t].name}`),
  ).map((p) => ({ kind: "preset", ...p }));
  const groups =
    category === "all" || category === "mine"
      ? mine
          .filter((g) => matches(`${g.name} my pieces`))
          .map((g) => ({ kind: "group", ...g, ...groupSize(g.pieces) }))
      : [];
  return [...presets, ...groups];
}

// ---- My Pieces: a saved group is its pieces relative to (0, 0, 0). ----
export const MAX_GROUPS = 60;
export const MAX_GROUP_PIECES = 100;
export function groupSize(pieces) {
  return {
    w:
      Math.max(...pieces.map((p) => p.x1)) -
      Math.min(...pieces.map((p) => p.x0)),
    d:
      Math.max(...pieces.map((p) => p.z1)) -
      Math.min(...pieces.map((p) => p.z0)),
    h: Math.max(...pieces.map(pieceTop)) - Math.min(...pieces.map(pieceBase)),
  };
}
// The selected pieces, shifted so their footprint starts at x = z = 0 and
// their lowest base sits at y = 0. Ids are dropped; looks are kept.
export function makeGroup(pieces, name) {
  if (!pieces.length || pieces.length > MAX_GROUP_PIECES) return null;
  const x = Math.min(...pieces.map((p) => p.x0)),
    z = Math.min(...pieces.map((p) => p.z0)),
    y = Math.min(...pieces.map(pieceBase));
  return {
    id: `group-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name:
      String(name || "")
        .replace(/[^\w .'·()-]/g, "")
        .trim()
        .slice(0, 32) || "My piece",
    pieces: pieces.map((p) => {
      const copy = {
        ...structuredClone(p),
        x0: p.x0 - x,
        x1: p.x1 - x,
        z0: p.z0 - z,
        z1: p.z1 - z,
      };
      delete copy.id;
      const base = round(pieceBase(p) - y);
      if (base) copy.y = base;
      else delete copy.y;
      return copy;
    }),
  };
}
// Saved groups from storage, keeping only well-formed ones.
export function cleanGroups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (g) =>
        g &&
        typeof g.id === "string" &&
        typeof g.name === "string" &&
        Array.isArray(g.pieces) &&
        g.pieces.length &&
        g.pieces.length <= MAX_GROUP_PIECES &&
        g.pieces.every(
          (p) =>
            p &&
            PIECE_TYPES[p.t] &&
            [p.x0, p.x1, p.z0, p.z1].every(Number.isFinite),
        ),
    )
    .slice(0, MAX_GROUPS);
}
// A group's pieces placed with its footprint centred on (x, z), its lowest
// base at y, turned clockwise `turns` times; null if it won't fit the map.
export function placeGroup(def, group, { x, y = 0, z }, turns = 0) {
  let pieces = structuredClone(group.pieces);
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) pieces = turnGroup(pieces);
  const size = groupSize(pieces),
    grid = (v) => Math.round(v * 2) / 2,
    dx = grid(x - size.w / 2),
    dz = grid(z - size.d / 2),
    s = CUSTOM_SIZES[def.size];
  if (def.pieces.length + pieces.length > MAX_PIECES) return null;
  for (const p of pieces) {
    p.x0 += dx;
    p.x1 += dx;
    p.z0 += dz;
    p.z1 += dz;
    p.y = round(pieceBase(p) + y);
    if (!p.y) delete p.y;
    if (
      p.x0 < -s.x ||
      p.x1 > s.x ||
      p.z0 < -s.z ||
      p.z1 > s.z ||
      pieceBase(p) + pieceHeight(p) > MAX_BUILD_HEIGHT
    )
      return null;
  }
  return pieces;
}
// A quarter turn clockwise about the group's own origin (like rotatePieces).
function turnGroup(pieces) {
  const d = Math.max(...pieces.map((p) => p.z1));
  return pieces.map((p) => ({
    ...p,
    x0: d - p.z1,
    x1: d - p.z0,
    z0: p.x0,
    z1: p.x1,
    ...(p.dir
      ? { dir: { "-z": "+x", "+x": "+z", "+z": "-x", "-x": "-z" }[p.dir] }
      : {}),
  }));
}
