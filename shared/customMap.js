// Player-built maps (the map builder). A map is a small definition:
//   { v: 1, name, size: "small" | "medium" | "large",
//     pieces: [{ t, x0, z0, x1, z1, dir?, y?, h?, color?, opacity?, slim?,
//       win? }],
//     spawns: { attacker: { x, z }, defender: { x, z } },
//     terminals: [{ x, z }, { x, z }, { x, z }] } (older maps have two)
// Piece types (t) are listed in PIECE_TYPES. Every piece fills the
// rectangle (x0, z0)–(x1, z1); its `shape` (see pieceShapes.js) decides
// what stands inside it. Directional pieces (`dir: true`: ramps, stairs,
// curves) face `dir` ("+z", "-z", "+x" or "-x"); ramps and stairs climb
// toward it. Straight walls, fences and railings run along their longer side.
// A window wall's `win` { x0, y0, x1, y1 } is its one opening, in metres
// along the wall from its start and above its base.
// Infiltrators start in the south (larger z), sentinels in the north.
// Definitions come from players (and over the network), so everything is
// validated and clamped before it becomes a map.
import { MAPS, useMap, activeMap, ramp } from "./maps.js";
import { decoyPath } from "./decoy.js";
import { WALLS } from "./map.js";
import { pieceParts, arcColliders, partCovers } from "./pieceShapes.js";

export const CUSTOM_SIZES = {
  small: { x: 13, z: 19, label: "Small · 26 × 38 m" },
  medium: { x: 18.5, z: 26.5, label: "Medium · 37 × 53 m" },
  large: { x: 26, z: 38, label: "Large · 52 × 76 m" },
};
// `kind` is the collision/rendering class of a plain box piece; `see` pieces
// can be seen through (sight and cameras) but block movement and shots.
export const PIECE_TYPES = {
  wall: { name: "Wall", h: 4, kind: "building" },
  wallDoor: {
    name: "Wall with doorway",
    h: 4,
    kind: "building",
    shape: "door",
  },
  wallWindow: {
    name: "Wall with windows",
    h: 4,
    kind: "building",
    shape: "window",
  },
  wallVault: {
    name: "Wall with vault window",
    h: 4,
    kind: "building",
    shape: "vault",
  },
  wallVent: {
    name: "Wall with crawl vent",
    h: 4,
    kind: "building",
    shape: "vent",
  },
  wallLeaf: {
    name: "Wall with door",
    h: 4,
    kind: "building",
    shape: "leafDoor",
  },
  wallL: {
    name: "Corner wall (L)",
    h: 4,
    kind: "building",
    shape: "L",
    dir: true,
  },
  wallT: {
    name: "T-junction wall",
    h: 4,
    kind: "building",
    shape: "T",
    dir: true,
  },
  wallSlit: {
    name: "Wall with peek slit",
    h: 4,
    kind: "building",
    shape: "slit",
  },
  wallArch: { name: "Archway", h: 4, kind: "building", shape: "arch" },
  wallCross: {
    name: "Cross wall (+)",
    h: 4,
    kind: "building",
    shape: "cross",
  },
  wallU: {
    name: "Alcove wall (U)",
    h: 4,
    kind: "building",
    shape: "U",
    dir: true,
  },
  wallChicane: {
    name: "Chicane wall",
    h: 4,
    kind: "building",
    shape: "chicane",
  },
  pillbox: {
    name: "Pillbox",
    h: 3,
    kind: "building",
    shape: "pillbox",
    dir: true,
  },
  glassInf: {
    name: "One-way glass: infiltrators see through",
    h: 2.6,
    kind: "building",
    shape: "glass",
    oneWay: "attacker",
  },
  glassSen: {
    name: "One-way glass: sentinels see through",
    h: 2.6,
    kind: "building",
    shape: "glass",
    oneWay: "defender",
  },
  wallCurve: {
    name: "Curved wall",
    h: 4,
    kind: "building",
    shape: "arc",
    dir: true,
  },
  deck: { name: "Floor / bridge deck", h: 0.3, kind: "platform" },
  low: { name: "Low cover", h: 1.1, kind: "cover" },
  high: { name: "High cover", h: 2.2, kind: "cover" },
  coverRound: { name: "Round cover", h: 1.1, kind: "cover", shape: "cyl" },
  coverCurve: {
    name: "Curved cover",
    h: 1.1,
    kind: "cover",
    shape: "arc",
    dir: true,
  },
  column: { name: "Column", h: 4, kind: "building", shape: "cyl" },
  colonnade: { name: "Colonnade", h: 4, kind: "building", shape: "cols" },
  crenel: {
    name: "Battlement cover",
    h: 1.8,
    kind: "cover",
    shape: "crenel",
  },
  sandbags: {
    name: "Sandbag nest",
    h: 1.1,
    kind: "cover",
    shape: "nest",
    dir: true,
  },
  barrels: { name: "Barrels", h: 1.1, kind: "cover", shape: "barrels" },
  crates: {
    name: "Crate stack",
    h: 2.2,
    kind: "cover",
    shape: "crates",
    dir: true,
  },
  hedge: { name: "Hedge", h: 1.8, kind: "cover", shape: "hedge", soft: true },
  container: {
    name: "Shipping container",
    h: 2.6,
    kind: "container",
    shape: "container",
  },
  plat1: { name: "Platform 1.2 m", h: 1.2, kind: "platform" },
  plat2: { name: "Platform 2.4 m", h: 2.4, kind: "platform" },
  plat: { name: "Platform", h: 3.6, kind: "platform" },
  catwalk: { name: "Catwalk", h: 1.35, kind: "platform", shape: "catwalk" },
  platRound: {
    name: "Round platform",
    h: 1.2,
    kind: "platform",
    shape: "cyl",
  },
  tower: {
    name: "Watchtower",
    h: 3.6,
    kind: "platform",
    shape: "tower",
  },
  dais: {
    name: "Stepped dais",
    h: 0.9,
    kind: "platform",
    shape: "dais",
  },
  ramp1: { name: "Ramp to 1.2 m", h: 1.2, ramp: true, dir: true },
  ramp2: { name: "Ramp to 2.4 m", h: 2.4, ramp: true, dir: true },
  ramp: { name: "Ramp", h: 3.6, ramp: true, dir: true },
  stairs: {
    name: "Stairs",
    h: 2.4,
    kind: "platform",
    shape: "stairs",
    dir: true,
  },
  ladder: { name: "Ladder", h: 4, kind: "cover", shape: "ladder" },
  railing: {
    name: "Railing",
    h: 1.05,
    kind: "cover",
    shape: "railing",
    see: true,
  },
  fence: { name: "Fence", h: 2.2, kind: "cover", shape: "fence", see: true },
  shelves: {
    name: "Storage shelves",
    h: 2.4,
    kind: "cover",
    shape: "shelves",
    see: true,
  },
  gate: {
    name: "Barred gate",
    h: 2.6,
    kind: "building",
    shape: "gate",
    see: true,
  },
};
export const MAX_PIECES = 400;
// The faintest a piece may be drawn, so a solid piece never vanishes.
export const MIN_PIECE_OPACITY = 0.1;
// A slim piece is drawn this far in from each face (and below its top), so
// faces flush with a neighbor's don't flicker. Only the look: placement,
// size and collision are unchanged.
export const SLIM_INSET = 0.01;
export function ensurePieceIds(def) {
  const reserved = new Set(
    def.pieces
      .map((p) => p.id)
      .filter(
        (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(id),
      ),
  );
  const used = new Set();
  let n = 1;
  for (const p of def.pieces) {
    if (
      typeof p.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,48}$/.test(p.id) ||
      used.has(p.id)
    ) {
      while (used.has(`piece-${n}`) || reserved.has(`piece-${n}`)) n++;
      p.id = `piece-${n++}`;
    }
    used.add(p.id);
  }
  return def;
}
export const MAX_BUILD_HEIGHT = 32;
export const CUSTOM_BOUNDARY_HEIGHT = MAX_BUILD_HEIGHT + 10;
export const pieceBase = (p) => p.y ?? 0;
export const pieceHeight = (p) => p.h ?? PIECE_TYPES[p.t].h;
export const pieceTop = (p) => pieceBase(p) + pieceHeight(p);
export const partsOf = (p) => pieceParts(p, PIECE_TYPES[p.t]);
// Top of a flat surface, the actual local height on a sloped ramp, or the
// top of whichever part of a shaped piece (a step, a curve) is under (x, z).
export function pieceSurface(p, x, z) {
  const type = PIECE_TYPES[p.t];
  if (type.shape)
    return Math.max(
      0,
      ...partsOf(p)
        .filter(
          (part) =>
            (part.solid || part.k === "arc") &&
            !part.see &&
            !part.soft &&
            !part.leaf &&
            partCovers(part, x, z),
        )
        .map((part) => part.y1),
    );
  if (!type.ramp) return pieceTop(p);
  const fraction =
    p.dir === "+x"
      ? (x - p.x0) / (p.x1 - p.x0)
      : p.dir === "-x"
        ? (p.x1 - x) / (p.x1 - p.x0)
        : p.dir === "+z"
          ? (z - p.z0) / (p.z1 - p.z0)
          : (p.z1 - z) / (p.z1 - p.z0);
  return pieceBase(p) + Math.max(0, Math.min(1, fraction)) * pieceHeight(p);
}

const DIRS = ["+z", "-z", "+x", "-x"];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const snap = (v) => Math.round(v * 2) / 2;

// A fresh map: spawns at each end, a terminal either side of the north half
// and one between them.
export function blankCustomMap(size = "medium") {
  const s = CUSTOM_SIZES[size] || CUSTOM_SIZES.medium;
  return {
    v: 1,
    name: "New map",
    size,
    pieces: [],
    spawns: {
      attacker: { x: 0, z: snap(s.z - 3) },
      defender: { x: 0, z: snap(-s.z + 3) },
    },
    terminals: [
      { x: snap(-s.x / 2), z: snap(-s.z / 2) },
      { x: 0, z: snap(-s.z / 4) },
      { x: snap(s.x / 2), z: snap(-s.z / 2) },
    ],
  };
}

// Clean a definition, or say what's wrong with it: { def } or { error }.
export function validateCustomMap(raw) {
  if (!raw || typeof raw !== "object") return { error: "Not a map." };
  const size = CUSTOM_SIZES[raw.size] ? raw.size : null;
  if (!size) return { error: "Unknown map size." };
  const s = CUSTOM_SIZES[size],
    inside = (p, margin = 0.5) =>
      p &&
      Number.isFinite(num(p.x)) &&
      Number.isFinite(num(p.z)) &&
      Math.abs(num(p.x)) <= s.x - margin &&
      Math.abs(num(p.z)) <= s.z - margin,
    point = (p) => ({ x: snap(num(p.x)), z: snap(num(p.z)) });
  if (!Array.isArray(raw.pieces) || raw.pieces.length > MAX_PIECES)
    return { error: `A map holds at most ${MAX_PIECES} pieces.` };
  const pieces = [],
    ids = new Set();
  for (const p of raw.pieces) {
    if (!p || !PIECE_TYPES[p.t]) return { error: "Unknown piece." };
    let [x0, x1] = [num(p.x0), num(p.x1)].sort((a, b) => a - b),
      [z0, z1] = [num(p.z0), num(p.z1)].sort((a, b) => a - b);
    if (![x0, x1, z0, z1].every(Number.isFinite))
      return { error: "A piece has no position." };
    x0 = Math.max(-s.x, snap(x0));
    x1 = Math.min(s.x, snap(x1));
    z0 = Math.max(-s.z, snap(z0));
    z1 = Math.min(s.z, snap(z1));
    if (x1 - x0 < 0.5 || z1 - z0 < 0.5) continue;
    const y = p.y === undefined ? 0 : Number(p.y),
      h = p.h === undefined ? PIECE_TYPES[p.t].h : Number(p.h);
    if (
      !Number.isFinite(y) ||
      !Number.isFinite(h) ||
      y < 0 ||
      h < 0.1 ||
      h > 12 ||
      y + h > MAX_BUILD_HEIGHT
    )
      return {
        error: `Piece elevations must be nonnegative; thickness/rise 0.1–12 m; top at most ${MAX_BUILD_HEIGHT} m.`,
      };
    if (
      p.color !== undefined &&
      (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color))
    )
      return {
        error:
          "Piece colors must be six-digit hex colors (for example #5588aa).",
      };
    // Opacity is only how a piece looks: see-through pieces stay solid.
    const opacity =
      p.opacity === undefined ? 1 : Math.round(Number(p.opacity) * 100) / 100;
    if (!(opacity >= MIN_PIECE_OPACITY && opacity <= 1))
      return {
        error: `Piece opacity must be between ${MIN_PIECE_OPACITY * 100}% and 100%.`,
      };
    const base = Math.round(y * 10) / 10,
      height = Math.round(h * 10) / 10;
    if (
      p.id !== undefined &&
      (typeof p.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,48}$/.test(p.id) ||
        ids.has(p.id))
    )
      return { error: "Piece identifiers must be unique." };
    if (p.id) ids.add(p.id);
    const piece = {
      ...(p.id ? { id: p.id } : {}),
      t: p.t,
      x0,
      z0,
      x1,
      z1,
      ...(p.color ? { color: p.color.toLowerCase() } : {}),
      ...(opacity < 1 ? { opacity } : {}),
      ...(p.slim ? { slim: true } : {}),
      ...(base ? { y: base } : {}),
      ...(height !== PIECE_TYPES[p.t].h ? { h: height } : {}),
    };
    if (PIECE_TYPES[p.t].dir) piece.dir = DIRS.includes(p.dir) ? p.dir : "-z";
    // A window wall's own opening: X along the wall, Y above its base.
    if (PIECE_TYPES[p.t].shape === "window" && p.win !== undefined) {
      const w = p.win,
        keys = ["x0", "y0", "x1", "y1"];
      if (!w || !keys.every((k) => Number.isFinite(Number(w[k]))))
        return { error: "Window openings need X and Y start and end (m)." };
      piece.win = Object.fromEntries(
        keys.map((k) => [k, Math.round(Number(w[k]) * 10) / 10]),
      );
    }
    pieces.push(piece);
  }
  const attacker = raw.spawns?.attacker,
    defender = raw.spawns?.defender;
  if (!inside(attacker) || !inside(defender))
    return { error: "Place both spawns inside the map." };
  if (num(attacker.z) < num(defender.z) + 10)
    return {
      error:
        "The infiltrator spawn must be at least 10 m south of the sentinel spawn.",
    };
  if (
    !Array.isArray(raw.terminals) ||
    ![2, 3].includes(raw.terminals.length) ||
    !raw.terminals.every((t) => inside(t, 1.5))
  )
    return { error: "Place three terminals inside the map." };
  return {
    def: {
      v: 1,
      name:
        String(raw.name || "Custom map")
          .replace(/[^\w .'·-]/g, "")
          .trim()
          .slice(0, 24) || "Custom map",
      size,
      pieces,
      spawns: { attacker: point(attacker), defender: point(defender) },
      terminals: raw.terminals.map(point),
    },
  };
}

// A stable id for a definition, so the same map shares one id.
export function customMapId(def) {
  const text = JSON.stringify(def);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `custom-${(h >>> 0).toString(36)}`;
}

// The walls, spawns, terminals, lines and bot route the game needs.
export function buildCustomMap(def) {
  const s = CUSTOM_SIZES[def.size],
    box = (x0, x1, z0, z1, h, extra = {}) => ({
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      w: x1 - x0,
      d: z1 - z0,
      h,
      ...extra,
    }),
    walls = [
      // Perimeter stays ten metres above the maximum legal piece top.
      box(-s.x - 1, s.x + 1, -s.z - 1, -s.z, CUSTOM_BOUNDARY_HEIGHT, {
        kind: "wall",
      }),
      box(-s.x - 1, s.x + 1, s.z, s.z + 1, CUSTOM_BOUNDARY_HEIGHT, {
        kind: "wall",
      }),
      box(-s.x - 1, -s.x, -s.z, s.z, CUSTOM_BOUNDARY_HEIGHT, { kind: "wall" }),
      box(s.x, s.x + 1, -s.z, s.z, CUSTOM_BOUNDARY_HEIGHT, { kind: "wall" }),
    ];
  // Shaped pieces' thin or curved parts are drawn from `decor`; their
  // collision is in `walls` (hidden where the decor draws them).
  const decor = [];
  for (const [pieceIndex, p] of def.pieces.entries()) {
    const type = PIECE_TYPES[p.t],
      base = pieceBase(p),
      top = pieceTop(p),
      tag = {
        pieceIndex,
        pieceId: p.id,
        ...(p.color ? { color: p.color } : {}),
        ...(p.opacity ? { opacity: p.opacity } : {}),
        ...(p.slim ? { slim: true } : {}),
      };
    if (type.ramp) {
      const along = p.dir === "+z" || p.dir === "-z",
        length = along ? p.z1 - p.z0 : p.x1 - p.x0,
        width = along ? p.x1 - p.x0 : p.z1 - p.z0,
        // (x, z) is the middle of the ramp's low end.
        x = p.dir === "+x" ? p.x0 : p.dir === "-x" ? p.x1 : (p.x0 + p.x1) / 2,
        z = p.dir === "+z" ? p.z0 : p.dir === "-z" ? p.z1 : (p.z0 + p.z1) / 2;
      walls.push(
        ...ramp(x, z, top, { toward: p.dir, length, width, base }).map((w) => ({
          ...w,
          ...tag,
        })),
      );
      continue;
    }
    const visual = [],
      solid = (part) =>
        part.k === "cyl"
          ? {
              x: part.x,
              z: part.z,
              w: part.r * 2,
              d: part.r * 2,
              h: part.y1,
              shape: "cylinder",
            }
          : box(part.x0, part.x1, part.z0, part.z1, part.y1);
    for (const part of partsOf(p)) {
      if (part.k === "arc") visual.push(part);
      for (const c of part.k === "arc" ? arcColliders(part) : [part]) {
        if (!c.solid) {
          visual.push(c);
          continue;
        }
        walls.push({
          ...solid(c),
          ...tag,
          ...(c.y0 ? { bottom: c.y0 } : {}),
          ...(c.hidden ? { hidden: true } : {}),
          ...(c.see ? { see: true } : {}),
          ...(c.soft ? { soft: true } : {}),
          ...(c.oneWay ? { oneWay: c.oneWay } : {}),
          ...(c.ladder ? { ladder: true } : {}),
          ...(c.leaf ? { leaf: true } : {}),
          kind: type.kind,
        });
      }
    }
    if (visual.length) decor.push({ ...tag, t: p.t, parts: visual });
  }
  const terminals = def.terminals.map((t, i) => {
    const id = "ABC"[i];
    return { id, name: `Terminal ${id}`, x: t.x, z: t.z, yaw: 0 };
  });
  for (const t of terminals)
    walls.push({
      x: t.x,
      z: t.z,
      w: 1,
      d: 0.7,
      h: 1.2,
      kind: "terminal",
      hidden: true,
    });
  const { attacker, defender } = def.spawns,
    route = [{ x: attacker.x, z: attacker.z - 3 }];
  return {
    name: def.name,
    tagline: "Custom map · built in the map builder",
    brief: "A player-built map. Find your way in.",
    custom: true,
    handPlaced: true,
    def,
    size: { x: s.x, z: s.z },
    walls,
    decor,
    spawns: { attacker: { ...attacker }, defender: { ...defender } },
    terminals,
    objective: {
      x: terminals.reduce((sum, t) => sum + t.x, 0) / terminals.length,
      z: terminals.reduce((sum, t) => sum + t.z, 0) / terminals.length,
    },
    buyLines: {
      attacker: Math.max(attacker.z - 4, defender.z + 6),
      defender: Math.min(defender.z + 4, attacker.z - 6),
    },
    botRoute: route,
    botRoutes: [{ name: "Main route", vias: route }],
    routeProfiles: [],
    botSpots: {},
    passages: [],
    lamps: [],
    approaches: [["Custom map", "built in the map builder."]],
    region: () => "the map",
  };
}

// The builder door p can reach (within `reach` m, and faced unless
// `anywhere`): the nearest leaf on the active map, open or shut.
export function doorNear(p, reach = 1.8, anywhere = false) {
  let best = null;
  for (const w of activeMap().walls) {
    if (!w.leaf) continue;
    const dx = w.x - p.x,
      dz = w.z - p.z,
      d = Math.hypot(dx, dz);
    // Facing it within 60°, judged level (close up it's below the eye).
    const facing =
      (-Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz) / (d || 1) >
      Math.cos(Math.PI / 3);
    if (d < reach && (!best || d < best.d) && (anywhere || facing))
      best = { w, d };
  }
  return best?.w || null;
}
// Builder doors: a door's leaf is solid only while it's shut. `open` holds
// the piece indices of open doors; the active map's leaves follow it.
export function applyDoors(open) {
  for (let i = WALLS.length - 1; i >= 0; i--)
    if (WALLS[i].leaf) WALLS.splice(i, 1);
  for (const w of activeMap().walls)
    if (w.leaf && !open.has(w.pieceIndex)) WALLS.push(w);
}

// Make a definition playable under its id (idempotent). Returns the id.
export function registerCustomMap(def) {
  const id = customMapId(def);
  if (!MAPS[id]) MAPS[id] = buildCustomMap(def);
  return id;
}

// What's wrong (errors stop play) or worth a look (warnings), for the
// builder's checklist: validity, then whether each spawn can walk to each
// terminal (the bots' own path planner).
export function checkCustomMap(raw) {
  const { def, error } = validateCustomMap(raw);
  if (error) return { errors: [error], warnings: [], checks: [] };
  const id = customMapId(def),
    previous = Object.keys(MAPS).find((k) => MAPS[k] === activeMap()),
    map = MAPS[id] || buildCustomMap(def),
    added = !MAPS[id];
  if (added) MAPS[id] = map;
  const checks = [],
    errors = [];
  try {
    useMap(id);
    for (const [team, label] of [
      ["attacker", "Infiltrators"],
      ["defender", "Sentinels"],
    ])
      for (const t of map.terminals) {
        const front = { x: t.x, z: t.z + 1.2 },
          ok = !!decoyPath(map.spawns[team], front);
        checks.push({ ok, text: `${label} can reach ${t.name}` });
        if (!ok) errors.push(`${label} can't reach ${t.name}.`);
      }
  } finally {
    if (added) delete MAPS[id];
    useMap(previous || "compound");
  }
  // Older maps have two terminals, and either one wins them.
  const warnings =
    map.terminals.length < 3
      ? [
          "Only two terminals, so either one wins. Place a third to make it two of three.",
        ]
      : [];
  return { errors, warnings, checks, def };
}
