// Playable maps. Each map is data: solid boxes, spawns, the flag, scripted
// bot behaviour and area names. useMap() swaps the shared WALLS / SPAWNS /
// OBJECTIVE in place, so collision, sight, throwing and rendering all follow
// the active map. The server activates a room's map before touching it.
import { WALLS, BOUNDS, clearSight } from "./map.js";
import { CONFIG, SPAWNS, OBJECTIVE, OBJECTIVES } from "./config.js";
import { PLAT, ARENA, PLAT_H } from "./livewire.js";

const wall = (x, z, w, d, h = 4) => ({ x, z, w, d, h, kind: "wall" });
const building = (x, z, w, d, h = 3.8) => ({ x, z, w, d, h, kind: "building" });
// Crates and low walls; taller ones (h > 2) stand as parapets on high ground.
const cover = (x, z, w, d, h = 1.1) => ({ x, z, w, d, h, kind: "cover" });
const container = (x, z, w, d) => ({ x, z, w, d, h: 2.5, kind: "container" });
const platform = (x, z, w, d, h) => ({ x, z, w, d, h, kind: "platform" });
// A solid tower: a large, tall building the renderer bands and caps.
const tower = (x, z, w, d, h) => ({ ...building(x, z, w, d, h), tower: true });
// A shipping container open at both ends: walk-through cover. Spread it into
// any map's walls, like stairs: ...openContainer(x, z, { axis: "z" }).
// (x, z) is its center and it runs `length` m along `axis`. Two corrugated
// side walls and a roof (`bottom` = headroom) make it; each piece carries the
// `shell` so maps register the opening and the renderer dresses it.
export function openContainer(
  x,
  z,
  {
    axis = "z",
    length = 6,
    width = 2.6,
    height = 2.6,
    name = "CONTAINER",
  } = {},
) {
  const t = 0.15,
    alongZ = axis === "z",
    shell = { name, x, z, axis, length, width, height, clearance: height - t },
    side = (offset) => ({
      x: alongZ ? x + offset : x,
      z: alongZ ? z : z + offset,
      w: alongZ ? t : length,
      d: alongZ ? length : t,
      // Up to the roof's underside, so no faces overlap with the roof.
      h: height - t,
      kind: "container",
      shell,
    });
  return [
    side(-(width - t) / 2),
    side((width - t) / 2),
    {
      x,
      z,
      w: alongZ ? width : length,
      d: alongZ ? length : width,
      h: height,
      bottom: height - t,
      kind: "container",
      shell,
    },
  ];
}
// L, T and U walls as flush slabs, which the renderer joins into one piece.
// (x, z) is the L's outside corner, or the middle of the T's bar or U's base.
// `toward` is the world direction its arms (L, U) or stem (T) run: "+z",
// "-z", "+x" or "-x"; an L's base runs across that one way, or the other
// with `flip`. `size` is the bar/base length, `arm` how far the arms reach.
export function shapeWall(
  type,
  x,
  z,
  { toward = "+z", size = 4, arm = 3, t = 0.6, h = 3, flip = false } = {},
) {
  const f = { "+z": [0, 1], "-z": [0, -1], "+x": [1, 0], "-x": [-1, 0] }[
      toward
    ],
    s = [-f[1] * (flip ? -1 : 1), f[0] * (flip ? -1 : 1)],
    // Local boxes [u0, u1, v0, v1]: u across, v along `toward`.
    local = {
      L: [
        [0, size, 0, t],
        [0, t, t, arm],
      ],
      T: [
        [-size / 2, size / 2, 0, t],
        [-t / 2, t / 2, t, arm],
      ],
      U: [
        [-size / 2, size / 2, 0, t],
        [-size / 2, -size / 2 + t, t, arm],
        [size / 2 - t, size / 2, t, arm],
      ],
    }[type];
  return local.map(([u0, u1, v0, v1]) => {
    const xs = [u0, u1].flatMap((u) =>
        [v0, v1].map((v) => x + u * s[0] + v * f[0]),
      ),
      zs = [u0, u1].flatMap((u) =>
        [v0, v1].map((v) => z + u * s[1] + v * f[1]),
      ),
      [x0, x1, z0, z1] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...zs),
        Math.max(...zs),
      ];
    return building((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h);
  });
}
// A ramp climbing from `base` to `top` over `length` m. (x, z) is the middle
// of its low end; it climbs `toward` ("+z", "-z", "+x" or "-x"). Collision
// sees thin columns, each a few cm higher than the last, so players walk it
// with the normal step-up; each column carries the `ramp`, and the renderer
// draws one smooth slope instead. A ramp with a base sits on what's below.
export function ramp(
  x,
  z,
  top,
  { toward = "+z", length = 6, width = 2.4, base = 0 } = {},
) {
  const [fx, fz] = { "+z": [0, 1], "-z": [0, -1], "+x": [1, 0], "-x": [-1, 0] }[
      toward
    ],
    n = Math.ceil((top - base) / 0.08),
    slice = length / n,
    shape = { x, z, toward, length, width, base, top };
  return Array.from({ length: n }, (_, i) => {
    const along = (i + 0.5) * slice;
    return {
      x: x + fx * along,
      z: z + fz * along,
      w: fx ? slice : width,
      d: fz ? slice : width,
      h: Math.round((base + ((top - base) * (i + 0.5)) / n) * 1000) / 1000,
      ...(base && { bottom: base }),
      kind: "ramp",
      ramp: shape,
    };
  });
}
// A walled room from corner (x0, z0) to (x1, z1), `h` m tall with `t` m
// walls. `openings` cut doors and windows: { side, at, w, window } where
// side is "-z", "+z", "-x" or "+x" and `at` is the opening's centre along
// that wall. Doors leave a lintel above 2.6 m; windows leave a 1 m sill and a
// lintel above 2.1 m (override with `sill`/`lintel` for upper windows).
// `skip` leaves out walls (say, one against the
// perimeter), and `roof` adds a ceiling at that height, cut into strips by
// `skylights` m gaps every `bay` m along z.
export function room(
  x0,
  z0,
  x1,
  z1,
  {
    h = 4,
    t = 0.4,
    openings = [],
    skip = [],
    roof,
    skylights = 0,
    bay = 6,
  } = {},
) {
  const out = [],
    piece = (x, z, w, d, top, bottom = 0) =>
      w > 0.05 &&
      d > 0.05 &&
      out.push({ ...building(x, z, w, d, top), ...(bottom && { bottom }) });
  for (const side of ["-z", "+z", "-x", "+x"]) {
    if (skip.includes(side)) continue;
    const alongX = side.endsWith("z"),
      fixed = { "-z": z0, "+z": z1, "-x": x0, "+x": x1 }[side],
      // Walls along x run over the corners; walls along z fit between them.
      [lo, hi] = alongX ? [x0 - t / 2, x1 + t / 2] : [z0 + t / 2, z1 - t / 2],
      span = (a, b, top, bottom = 0) =>
        alongX
          ? piece((a + b) / 2, fixed, b - a, t, top, bottom)
          : piece(fixed, (a + b) / 2, t, b - a, top, bottom);
    let at = lo;
    // Openings may share a horizontal span at different heights (e.g. a
    // ground-floor window and a separate catwalk window above it).
    const groups = new Map();
    for (const o of openings.filter((o) => o.side === side)) {
      const key = `${o.at}|${o.w}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    for (const holes of [...groups.values()].sort(
      (a, b) => a[0].at - b[0].at,
    )) {
      const o = holes[0],
        a = o.at - o.w / 2,
        b = o.at + o.w / 2;
      span(at, a, h);
      let floor = 0;
      const apertures = holes
        .map((o) => ({
          bottom: o.window ? (o.sill ?? 1) : 0,
          top: o.window ? (o.lintel ?? 2.1) : 2.6,
        }))
        .sort((a, b) => a.bottom - b.bottom);
      for (const hole of apertures) {
        if (hole.bottom > floor) span(a, b, hole.bottom, floor);
        floor = Math.max(floor, hole.top);
      }
      span(a, b, h, floor);
      at = b;
    }
    span(at, hi, h);
  }
  if (roof) {
    // Inside the walls (a skipped wall belongs to a neighbour), so no roof
    // face lines up with a wall face.
    const rx0 = x0 + t / 2,
      rx1 = x1 - t / 2,
      rz0 = z0 + t / 2,
      rz1 = z1 - t / 2,
      strip = bay - skylights;
    for (let z = rz0; z < rz1 - 0.05; z += bay) {
      const end = Math.min(rz1, z + strip);
      out.push({
        x: (rx0 + rx1) / 2,
        z: (z + end) / 2,
        w: rx1 - rx0,
        d: end - z,
        h: roof + 0.3,
        bottom: roof,
        kind: "roof",
      });
    }
  }
  return out;
}
// An invisible, tall barrier (the waterline): it blocks walking and
// throwing but isn't drawn.
const barrier = (x, z, w, d, h = 14) => ({
  x,
  z,
  w,
  d,
  h,
  kind: "wall",
  hidden: true,
});
// Stairs climbing to `top`, one 0.4 m step at a time (players step up
// automatically). (x, z) is the first step beside the platform edge; `dz` and
// `dx` give the direction steps descend away from it.
function stairs(x, z, top, { w = 3, dx = 0, dz = 0 } = {}) {
  const steps = [];
  for (let h = top - 0.4, i = 0; h > 0.05; h -= 0.4, i++)
    steps.push({
      x: x + dx * 0.6 * i,
      z: z + dz * 0.6 * i,
      w: dx ? 0.6 : w,
      d: dz ? 0.6 : w,
      h: Math.round(h * 100) / 100,
      kind: "stairs",
    });
  return steps;
}
const perimeter = [
  wall(-19, 0, 1, 54),
  wall(19, 0, 1, 54),
  wall(0, 27, 37, 1),
  wall(0, -27, 37, 1),
];

export const MAPS = {
  compound: {
    name: "The Compound",
    tagline: "Industrial compound / three approaches",
    // Spawn screens stop the teams seeing each other straight off spawn.
    // The warehouse's south wall has a 3 m door from the Left lane.
    walls: [
      ...WALLS.filter((w) => !(w.z === 16 && w.w === 14)),
      building(-17.75, 16, 4.5, 0.6),
      building(-9.25, 16, 6.5, 0.6),
      building(0, 20.5, 8, 0.6),
      building(0, -20.6, 8, 0.6),
    ],
    spawns: { attacker: { x: 0, z: 23 }, defender: { x: 0, z: -23 } },
    objective: { x: 0, z: -12 },
    // Before the round: infiltrators stay south of z 18, sentinels north of z -6.
    buyLines: { attacker: 18, defender: -6 },
    region: (x) =>
      x < -6 ? "warehouse" : x > 10 ? "east yard" : "central approach",
    botRoute: [
      { x: 5.2, z: 22.5 },
      { x: 5.2, z: 19.3 },
      { x: 3.7, z: 18 },
      { x: 3.7, z: 5 },
      { x: 3.7, z: -9 },
    ],
    // Where the scripted opponent puts each gadget it carries (training lets
    // you pick its loadout). Wires are anchored wall to wall; cameras face
    // out from their wall; thrown gadgets list their landing points.
    botSpots: {
      tripwire: [
        { x: -13.97, y: 0.32, z: 10, b: { x: -6.34, y: 0.32, z: 10 } },
        { x: 4.97, y: 1, z: 8, b: { x: 2.53, y: 1, z: 8 } },
        { x: -12, y: 0.32, z: 4.47, b: { x: -12, y: 0.32, z: -3.67 } },
        { x: 15.03, y: 1, z: 0, b: { x: 18.47, y: 1, z: 0 } },
      ],
      camera: [
        { x: 5.44, y: 2.5, z: -18, yaw: Math.PI / 2, pitch: -0.2 },
        { x: 11, y: 2.5, z: -21.44, yaw: Math.PI, pitch: -0.2 },
      ],
      sensor: [
        { x: 10, y: 0.07, z: -4 },
        { x: -3, y: 0.07, z: 12 },
        { x: -8, y: 0.07, z: -8 },
      ],
      jammer: [
        { x: 4, z: -10 },
        { x: -4, z: 4 },
      ],
      smoke: [
        { x: 3.7, z: 6 },
        { x: 3.7, z: -6 },
        { x: -2, z: -14 },
      ],
    },
  },
  lanes: {
    name: "The Lanes",
    tagline: "Three hallways / high ground and low",
    spawns: { attacker: { x: 0, z: 23 }, defender: { x: 0, z: -23.5 } },
    objective: { x: 0, z: -15 },
    // Before the round: infiltrators stay south of z 19, sentinels north of z -6.
    buyLines: { attacker: 19, defender: -6 },
    region: (x) =>
      x < -6 ? "west hallway" : x > 6 ? "east hallway" : "center ridge",
    // Narrow lanes of different widths cut through solid blocks, with short
    // hallways between them and more cover than open floor.
    walls: [
      ...perimeter,
      // West outer block, with two nooks cut into it.
      building(-17.25, -2, 2.5, 8),
      building(-17.25, 8, 2.5, 8),
      building(-17.25, 16.5, 2.5, 5),
      // West/center block, crossed by one short hallway (z 3–4.6), on to
      // the spawn bunker.
      building(-8.25, -1.5, 7.5, 9),
      building(-8.25, 12.8, 7.5, 16.4),
      // Center/east block, crossed by one hallway (z 6–7.6).
      building(6.75, 0, 4.5, 12),
      building(6.75, 14.3, 4.5, 13.4),
      // East outer block behind the catwalk.
      building(17.5, 6.5, 2, 25),
      // West hallway (4 m): staggered crates.
      cover(-14.9, 16, 1.4, 1.2),
      cover(-12.9, 10, 1.4, 1.2),
      cover(-14.9, 6, 1.4, 1.2),
      cover(-12.9, 0, 1.4, 1.2),
      cover(-14.9, -3.5, 1.4, 1.2),
      cover(-12.9, 13, 1.4, 1.2),
      cover(-14.9, 3, 1.4, 1.2),
      cover(-12.9, -5.5, 1.4, 1.2),
      // Center: a 3 m ridge (2 m up) with parapets, between 3 m trenches.
      platform(0, 5, 3, 14, 2),
      ...stairs(0, 12.3, 2, { dz: 1 }),
      ...stairs(0, -2.3, 2, { dz: -1 }),
      cover(-1, 8, 1, 0.4, 3.1),
      cover(1, 1, 1, 0.4, 3.1),
      cover(-3, 9, 1.2, 1.2),
      cover(-3.6, 2, 1.2, 1.2),
      cover(-3, -4, 1.2, 1.2),
      cover(2.4, 5, 1.2, 1.2),
      cover(2.4, -1, 1.2, 1.2),
      cover(2.4, 11, 1.2, 1.2),
      cover(2.4, 8, 1.2, 1.2),
      cover(-3, 12.5, 1.2, 1.2),
      cover(-3.6, -1.5, 1.2, 1.2),
      // East: a 3.5 m low path under a 4 m catwalk (2.4 m up).
      platform(14.5, 5.5, 4, 19, 2.4),
      ...stairs(14.5, 15.3, 2.4, { dz: 1 }),
      ...stairs(14.5, -4.3, 2.4, { dz: -1 }),
      cover(14.5, 10, 1.4, 0.4, 3.5),
      cover(15.5, 3, 1.2, 0.4, 3.5),
      cover(10.2, 13, 1.2, 1.2),
      cover(11.4, 9, 1.2, 1.2),
      cover(10.2, 1, 1.2, 1.2),
      cover(11.4, -3, 1.2, 1.2),
      cover(11.4, 5.5, 1.2, 1.2),
      cover(10.2, -5.5, 1.2, 1.2),
      cover(11.4, 16, 1.2, 1.2),
      // Defender plaza: dense cover around the flag, and a balcony.
      container(-12, -14, 3, 4),
      container(12, -17, 4, 3),
      cover(-5.5, -9, 1.6, 1.2),
      cover(6, -9, 1.6, 1.2),
      cover(-4, -12.5, 1.2, 1.6),
      cover(8, -13, 1.2, 1.6),
      cover(-8, -18, 1.6, 1.2),
      cover(5, -18.5, 1.4, 1.2),
      cover(-14, -8, 2, 1.2),
      cover(14, -8, 2, 1.2),
      cover(-15, -21, 1.6, 1.6),
      cover(15, -22.5, 1.6, 1.6),
      platform(-7, -24.75, 6, 3.5, 2.4),
      ...stairs(-3.7, -24.75, 2.4, { w: 3.5, dx: 1 }),
      // Attacker staging: crates and a raised loading dock.
      // Spawn screens stop the teams seeing each other straight off spawn.
      building(0, 20.5, 8, 0.6),
      building(0.5, -21, 7, 0.6),
      platform(-15.25, 23.75, 6.5, 5.5, 1.2),
      ...stairs(-11.7, 23.75, 1.2, { w: 5.5, dx: 1 }),
      cover(7.5, 22, 1.4, 1.2),
      cover(-6, 20.5, 1.4, 1.2),
      cover(12, 23, 1.6, 1.2),
    ],
    // Up the east trench beside the ridge, then across the plaza.
    botRoute: [
      { x: 5.2, z: 22.5 },
      { x: 5.2, z: 19.3 },
      { x: 3.9, z: 18 },
      { x: 3.9, z: -6 },
      { x: 2.5, z: -12.5 },
    ],
    botSpots: {
      tripwire: [
        { x: -15.97, y: 0.32, z: 8, b: { x: -12.03, y: 0.32, z: 8 } },
        { x: -4.47, y: 1, z: 6, b: { x: -1.53, y: 1, z: 6 } },
        { x: 1.53, y: 0.32, z: 9, b: { x: 4.47, y: 0.32, z: 9 } },
        { x: 9.03, y: 1, z: 4, b: { x: 12.47, y: 1, z: 4 } },
      ],
      camera: [
        { x: 9.94, y: 2, z: -17, yaw: Math.PI / 2, pitch: -0.2 },
        { x: -10.44, y: 2, z: -14, yaw: -Math.PI / 2, pitch: -0.2 },
      ],
      sensor: [
        { x: 0, y: 2.07, z: 4 },
        { x: -14, y: 0.07, z: 12 },
        { x: 9.5, y: 0.07, z: -10 },
      ],
      jammer: [
        { x: 3, z: -10 },
        { x: -2, z: -19 },
      ],
      smoke: [
        { x: 3.9, z: 10 },
        { x: 3.9, z: -3 },
        { x: 2, z: -12 },
      ],
    },
  },
  quad: {
    name: "The Quad",
    tagline: "Four lanes / shortcut and tunnels",
    spawns: { attacker: { x: 0, z: 23 }, defender: { x: 0, z: -23.5 } },
    objective: { x: 0, z: -15 },
    // Before the round: infiltrators stay south of z 19, sentinels north of z -6.
    buyLines: { attacker: 19, defender: -6 },
    region: (x) =>
      x < -7.5
        ? "west lane"
        : x < 0
          ? "inner west lane"
          : x < 7.5
            ? "inner east lane"
            : "east lane",
    // Four parallel lanes through solid blocks. The only way between lanes
    // on the way up is the shortcut hallway through the central block,
    // linking the two inner lanes.
    walls: [
      ...perimeter,
      // Outer blocks, each with two nooks.
      building(-17.25, -1.5, 2.5, 9),
      building(-17.25, 8.5, 2.5, 7),
      building(-17.25, 16.5, 2.5, 5),
      building(17.25, -1.5, 2.5, 9),
      building(17.25, 8.5, 2.5, 7),
      building(17.25, 16.5, 2.5, 5),
      // Blocks between the lanes.
      building(-9.5, 7.5, 5, 27),
      building(9.5, 7.5, 5, 27),
      // Central block, cut by the shortcut hallway at z 6.2–7.8.
      building(0, 0.1, 6, 12.4),
      building(0, 14.4, 6, 13.2),
      // West lane (4 m): staggered crates.
      cover(-15, 15, 1.4, 1.2),
      cover(-13, 10, 1.4, 1.2),
      cover(-15, 4, 1.4, 1.2),
      cover(-13, -1, 1.4, 1.2),
      cover(-15, -4.5, 1.4, 1.2),
      // Inner west lane (4 m).
      cover(-6, 14, 1.2, 1.2),
      cover(-4, 9, 1.2, 1.2),
      cover(-6, 4, 1.2, 1.2),
      cover(-4, -1, 1.2, 1.2),
      cover(-6, -4.5, 1.2, 1.2),
      // Inner east lane (4 m): crates along its west wall.
      cover(3.7, 15, 1.4, 1.2),
      cover(3.7, 9, 1.4, 1.2),
      cover(3.7, 3, 1.4, 1.2),
      cover(3.7, -2, 1.4, 1.2),
      // East lane (4 m).
      cover(13, 14, 1.4, 1.2),
      cover(15, 9, 1.4, 1.2),
      cover(13, 4, 1.4, 1.2),
      cover(15, -1, 1.4, 1.2),
      cover(13, -4.5, 1.4, 1.2),
      // Defender plaza: dense cover around the flag, and a balcony.
      container(-12, -14, 3, 4),
      container(12, -17, 4, 3),
      cover(-5.5, -9, 1.6, 1.2),
      cover(6, -9, 1.6, 1.2),
      cover(-4, -12.5, 1.2, 1.6),
      cover(8, -13, 1.2, 1.6),
      cover(-8, -18, 1.6, 1.2),
      cover(5, -18.5, 1.4, 1.2),
      cover(-14, -8, 2, 1.2),
      cover(14, -8, 2, 1.2),
      cover(-15, -21, 1.6, 1.6),
      cover(15, -22.5, 1.6, 1.6),
      platform(-7, -24.75, 6, 3.5, 2.4),
      ...stairs(-3.7, -24.75, 2.4, { w: 3.5, dx: 1 }),
      // Spawn screens stop the teams seeing each other straight off spawn.
      building(0, 20.5, 8, 0.6),
      building(0.5, -21, 7, 0.6),
      // Attacker staging.
      cover(7.5, 22, 1.4, 1.2),
      cover(-6, 22.5, 1.4, 1.2),
      cover(-13, 23, 1.6, 1.2),
      cover(13, 24, 1.6, 1.2),
    ],
    // Up the inner east lane, then across the plaza.
    botRoute: [
      { x: 5.2, z: 22.5 },
      { x: 5.6, z: 19.3 },
      { x: 5.6, z: -6 },
      { x: 2.5, z: -12.5 },
    ],
    botSpots: {
      tripwire: [
        { x: -15.97, y: 0.32, z: 8, b: { x: -12.03, y: 0.32, z: 8 } },
        { x: -6.97, y: 1, z: 11, b: { x: -3.03, y: 1, z: 11 } },
        { x: 3.03, y: 0.32, z: 12, b: { x: 6.97, y: 0.32, z: 12 } },
        { x: 12.03, y: 1, z: 6.5, b: { x: 15.97, y: 1, z: 6.5 } },
      ],
      camera: [
        { x: 9.94, y: 2, z: -17, yaw: Math.PI / 2, pitch: -0.2 },
        { x: -10.44, y: 2, z: -14, yaw: -Math.PI / 2, pitch: -0.2 },
      ],
      sensor: [
        { x: -14, y: 0.07, z: 12 },
        { x: 5.6, y: 0.07, z: 6 },
        { x: 9.5, y: 0.07, z: -10 },
      ],
      jammer: [
        { x: 3, z: -10 },
        { x: -2, z: -19 },
      ],
      smoke: [
        { x: 5.6, z: 10 },
        { x: 5.6, z: -3 },
        { x: 2, z: -12 },
      ],
    },
  },
  // A larger, monumental arena: towering stone slabs, mirrored bases at
  // each end, a raised altar in the courtyard and long side galleries.
  monolith: {
    name: "The Monolith",
    handPlaced: true,
    tagline: "Monumental arena / galleries and altar",
    size: { x: 26, z: 38 },
    spawns: { attacker: { x: 0, z: 34 }, defender: { x: 0, z: -34 } },
    objective: { x: 0, z: -24 },
    buyLines: { attacker: 27, defender: -14 },
    region: (x) =>
      x < -9 ? "west gallery" : x > 9 ? "east gallery" : "courtyard",
    walls: [
      // High framing walls: the arena reads as one enclosed monument.
      wall(-26.5, 0, 1, 78, 14),
      wall(26.5, 0, 1, 78, 14),
      wall(0, 38.5, 52, 1, 14),
      wall(0, -38.5, 52, 1, 14),
      // Spawn screens.
      building(0, 31.5, 9, 0.8, 5),
      building(0, -31.5, 9, 0.8, 5),
      // Staging: two raised terraces and crates.
      platform(-19, 32, 10, 8, 1.2),
      ...stairs(-13.7, 32, 1.2, { w: 8, dx: 1 }),
      platform(19, 32, 10, 8, 1.2),
      ...stairs(13.7, 32, 1.2, { w: 8, dx: -1 }),
      // Staging shapes: a T with its stem toward spawn and an L each side,
      // whose nooks face the attackers.
      ...shapeWall("T", 0, 23.5, { size: 6, arm: 2.6 }),
      ...shapeWall("L", -11, 23.8, { size: 3, arm: 2.2, flip: true }),
      ...shapeWall("L", 11, 23.8, { size: 3, arm: 2.2 }),
      // North lanes: a T each side, its stem pointing at the monoliths.
      ...shapeWall("T", -12.5, 20.1, { toward: "-z", size: 3, arm: 2.5 }),
      ...shapeWall("T", 12.5, 20.1, { toward: "-z", size: 3, arm: 2.5 }),
      // The north half keeps its monoliths; the south half is different on
      // purpose. Three large towers break the long views, none mirrored.
      building(0, 16, 5, 0.8, 7),
      building(-8, 12, 2, 6, 7),
      tower(9, 12, 4, 6, 16),
      tower(-6, -13, 6, 6, 15),
      // The south tower's wing screens the flag from the courtyard.
      building(1.5, -15.5, 9, 0.8, 7),
      tower(19.5, -31.5, 6, 6, 18),
      // The altar: a raised plinth in the courtyard, stairs on every side.
      platform(0, 0, 8, 8, 1.2),
      ...stairs(0, -4.3, 1.2, { w: 4, dz: -1 }),
      ...stairs(0, 4.3, 1.2, { w: 4, dz: 1 }),
      ...stairs(4.3, 0, 1.2, { w: 4, dx: 1 }),
      ...stairs(-4.3, 0, 1.2, { w: 4, dx: -1 }),
      // Side galleries (2.4 m) with stairs at both ends and the middle; a
      // hidden flank corridor runs behind each.
      platform(-19.5, 0, 7, 30, 2.4),
      ...stairs(-19.5, 15.3, 2.4, { dz: 1 }),
      // Its south end is a ramp, not stairs.
      ...ramp(-19.5, -21.3, 2.4, { toward: "+z", length: 6.3, width: 3 }),
      ...stairs(-15.7, 0, 2.4, { dx: 1 }),
      platform(19.5, 0, 7, 30, 2.4),
      ...stairs(19.5, 15.3, 2.4, { dz: 1 }),
      // Its south stairs climb from the east lane instead of the end.
      ...stairs(15.7, -13, 2.4, { dx: -1 }),
      ...stairs(15.7, 0, 2.4, { dx: -1 }),
      // Offset barriers on each gallery top: no straight view along it, but
      // a way through either side of the first and between the second pair.
      building(-19.5, 4, 3, 0.4, 4.4),
      building(-17.5, -5, 3, 0.4, 4.4),
      building(-21.5, -5, 3, 0.4, 4.4),
      building(19.5, 4, 3, 0.4, 4.4),
      building(17.5, -5, 3, 0.4, 4.4),
      building(21.5, -5, 3, 0.4, 4.4),
      // Flank corridors (3 m) behind the galleries: alternating stubs.
      building(-25.1, 6, 1.8, 0.8, 5),
      building(-23.8, -6, 1.6, 0.8, 5),
      building(25.1, 6, 1.8, 0.8, 5),
      building(23.8, -6, 1.6, 0.8, 5),
      // Courtyard sides: a slab on each flank of the altar.
      building(6.5, -8, 3, 0.8, 5),
      building(-6.5, 8, 3, 0.8, 5),
      // An L at two corners of the altar, a nook facing each corner.
      ...shapeWall("L", 6.5, 6.5, {
        toward: "-z",
        size: 3,
        arm: 3,
        flip: true,
      }),
      ...shapeWall("L", -6.5, -6.5, { size: 3, arm: 3, flip: true }),
      // Side lanes: an L in each quarter, its base reaching from the lane's
      // middle toward the gallery and its arm turning toward the gallery's
      // middle stairs. Gaps at both ends of every wall keep the lanes open.
      ...shapeWall("L", -10, 4, { toward: "-z", size: 4, flip: true }),
      ...shapeWall("L", 10, 4, { toward: "-z", size: 4 }),
      ...shapeWall("T", 12.5, -4.4, { toward: "-z", size: 3, arm: 3 }),
      // Defender plaza: a broken fence north of the flag (two Ls between
      // the plaza slabs) gives three ways in, plus the containers and Us.
      building(-12.5, -20, 4, 0.8, 5),
      building(12.5, -20, 4, 0.8, 5),
      ...shapeWall("L", -4, -19.5, {
        toward: "-z",
        size: 5,
        arm: 2.5,
        flip: true,
      }),
      ...shapeWall("L", 4, -19.5, { toward: "-z", size: 5, arm: 2.5 }),
      // A U each side of the flag, open toward the attackers.
      ...shapeWall("U", -9.6, -30.6, { size: 3.6, arm: 3, t: 0.5 }),
      ...shapeWall("U", 9.6, -30.6, { size: 3.6, arm: 3, t: 0.5 }),
      ...openContainer(-15, -24, {
        length: 5,
        width: 3,
        name: "WEST CONTAINER",
      }),
      ...openContainer(15, -24, {
        length: 5,
        width: 3,
        name: "EAST CONTAINER",
      }),
      platform(-19, -32, 10, 8, 1.6),
      ...stairs(-13.7, -32, 1.6, { w: 8, dx: 1 }),
      // A ramp up the overlook's north face.
      ...ramp(-21.5, -23.5, 1.6, { toward: "-z", length: 4.5, width: 2 }),
    ],
    // Down the courtyard's east side, past the altar, to the flag.
    botRoute: [
      { x: 6, z: 34 },
      { x: 6, z: 27 },
      { x: 5.8, z: 20 },
      { x: 5.8, z: -3 },
      { x: 3, z: -8 },
      { x: 3, z: -18 },
      { x: 2.5, z: -22 },
    ],
    botSpots: {
      tripwire: [
        { x: -15.97, y: 0.32, z: 12, b: { x: -9.03, y: 0.32, z: 12 } },
        { x: -15.97, y: 1, z: -13, b: { x: -9.03, y: 1, z: -13 } },
        { x: 14.03, y: 0.32, z: -4.7, b: { x: 15.97, y: 0.32, z: -4.7 } },
        { x: -2.97, y: 1, z: -12, b: { x: 1.5, y: 1, z: -12 } },
      ],
      camera: [
        { x: -13.44, y: 2, z: -25, yaw: -Math.PI / 2, pitch: -0.2 },
        { x: 13.44, y: 2, z: -25, yaw: Math.PI / 2, pitch: -0.2 },
      ],
      sensor: [
        { x: 0, y: 1.27, z: 0 },
        { x: -12, y: 0.07, z: 18 },
        { x: 12, y: 0.07, z: -16 },
      ],
      jammer: [
        { x: 3, z: -22 },
        { x: -3, z: -18 },
      ],
      smoke: [
        { x: 6, z: 10 },
        { x: 6, z: -6 },
        { x: 3, z: -20 },
      ],
    },
  },
  // Pier 9's neighborhood geometry is assembled after the shared spawn room.
  docks: {
    name: "Pier 9",
    tagline: "Three homes / front gardens, backyards and garden gates",
    handPlaced: true,
    lamps: [
      [-6, 25.5],
      [12, 25.5],
      [18, -28],
      [-24, -28],
    ],
    size: { x: 26, z: 38 },
    spawns: { attacker: { x: 0, z: 34 }, defender: { x: 0, z: -35.5 } },
    objective: { x: 0, z: -25.5 },
    terminals: [
      { id: "A", name: "Terminal A", x: -16, z: -15, yaw: 0 },
      { id: "B", name: "Terminal B", x: -4.5, z: -14, yaw: 0 },
      { id: "C", name: "Terminal C", x: 17.5, z: -14.5, yaw: 0 },
    ],
    plantDrops: ["B"],
    buyLines: { attacker: 27, defender: -18 },
    walls: [],
    botRoute: [],
    botSpots: {},
  },
};
// A spawn room: one long, roofed room along the map's edge. Its front
// (north) wall is mostly one-way glass, windows between pillars over a
// waist-high sill, see-through for infiltrators only (oneWay: "attacker":
// it still blocks movement, shots and throws, and everyone else's sight),
// with a glass door per lane that stands until infiltration starts.
// `zone` is where sentinels may never go; `exits` are just outside each
// door; `windows` and `lanes` are for drawing.
export function spawnRoom({
  x0,
  x1,
  z0,
  z1,
  doors,
  props = [],
  height = 3.2,
  sill = 0.9,
  header = 2.7,
  pillarEvery = 6,
  glassShare = 1,
}) {
  const t = 0.25,
    walls = [],
    windows = [],
    box = (xa, xb, za, zb, bottom, top, extra = {}) => ({
      x: (xa + xb) / 2,
      z: (za + zb) / 2,
      w: xb - xa,
      d: zb - za,
      ...(bottom ? { bottom } : {}),
      h: top,
      kind: "building",
      style: "bunker",
      ...extra,
    }),
    glass = { kind: "glass", oneWay: "attacker" };
  walls.push(box(x0, x1, z1, z1 + t, 0, height));
  walls.push(box(x0 - t, x0, z0 - t, z1 + t, 0, height));
  walls.push(box(x1, x1 + t, z0 - t, z1 + t, 0, height));
  walls.push(box(x0, x1, z0, z1, height - 0.2, height, { kind: "roof" }));
  // The front wall: doorways, and between them windows between pillars.
  const gaps = doors
      .map((d) => [d.x - d.width / 2, d.x + d.width / 2])
      .sort((a, b) => a[0] - b[0]),
    spans = [];
  let from = x0;
  for (const [a, b] of gaps) {
    spans.push([from, a]);
    walls.push(box(a, b, z0 - t, z0, header + 0.3, height));
    from = b;
  }
  spans.push([from, x1]);
  const pillar = 0.4,
    bays = [];
  for (const [a, b] of spans) {
    const n = Math.max(1, Math.round((b - a) / pillarEvery)),
      step = (b - a) / n,
      posts = Array.from({ length: n + 1 }, (_, i) => {
        const p = a + i * step;
        return i === 0
          ? [a, a + pillar]
          : i === n
            ? [b - pillar, b]
            : [p - pillar / 2, p + pillar / 2];
      });
    for (const [pa, pb] of posts)
      walls.push(box(pa, pb, z0 - t, z0, 0, height));
    for (let i = 0; i < n; i++) bays.push([posts[i][1], posts[i + 1][0]]);
  }
  // Only glassShare of the front is glass (doors included): the bays
  // furthest from any door are solid wall instead.
  const front = x1 - x0,
    doorGlass = doors.reduce((sum, d) => sum + d.width, 0),
    fromDoor = ([a, b]) =>
      Math.min(...doors.map((d) => Math.abs((a + b) / 2 - d.x))),
    solid = new Set();
  let glassWidth = doorGlass + bays.reduce((sum, [a, b]) => sum + b - a, 0);
  for (const bay of [...bays].sort((p, q) => fromDoor(q) - fromDoor(p))) {
    if (glassWidth / front <= glassShare + 0.02) break;
    solid.add(bay);
    glassWidth -= bay[1] - bay[0];
  }
  for (const bay of bays) {
    const [wa, wb] = bay;
    if (solid.has(bay)) {
      walls.push(box(wa, wb, z0 - t, z0, 0, height));
      continue;
    }
    walls.push(box(wa, wb, z0 - t, z0, 0, sill));
    const pane = box(wa, wb, z0 - t, z0, sill, header, glass);
    walls.push(pane);
    windows.push(pane);
    walls.push(box(wa, wb, z0 - t, z0, header, height));
  }
  return {
    walls: [...walls, ...props],
    props,
    windows,
    zone: [{ x0, x1, z0, z1 }],
    doors: doors.map((d) => ({
      ...box(
        d.x - d.width / 2,
        d.x + d.width / 2,
        z0 - t,
        z0,
        0,
        header + 0.3,
        glass,
      ),
      kind: "door",
    })),
    exits: doors.map((d) => ({ name: d.name, x: d.x, z: z0 - 0.8 })),
    lanes: doors.map((d) => ({
      name: d.name,
      color: d.color,
      to: d.to,
      door: { x: d.x, z: z0 - t / 2, w: d.width, d: t, h: header + 0.3 },
    })),
  };
}
// Pier 9's infiltrators start in a long bunker across the whole south edge.
// Its north wall is one-way glass: they can watch most of the map; the
// sentinels can't see in. Three glass doors face north, one per lane: Left
// (amber house), Centre (terracotta house) and Right (blue house). They open when
// infiltration starts.
{
  const locker = (x, w) => ({
    x,
    z: 37.45,
    w,
    d: 0.6,
    h: 2.2,
    kind: "building",
    style: "locker",
  });
  const crate = (x, z) => ({
    x,
    z,
    w: 1.2,
    d: 1.2,
    h: 1.1,
    kind: "cover",
    style: "crate",
  });
  MAPS.docks.spawnRoom = spawnRoom({
    x0: -25.75,
    x1: 25.75,
    z0: 31,
    z1: 37.75,
    // Windows between pillars every ~4 m; about two-thirds of the front is
    // glass, the bays furthest from the doors solid.
    pillarEvery: 4,
    glassShare: 2 / 3,
    doors: [
      {
        name: "Left",
        color: "#e8a33c",
        x: -18,
        width: 3,
        to: { x: -17.5, z: 8 },
      },
      { name: "Centre", color: "#3fa7d6", x: 0, width: 3, to: { x: 0, z: 4 } },
      {
        name: "Right",
        color: "#4ccf7f",
        x: 19,
        width: 3,
        to: { x: 18, z: 6 },
      },
    ],
    // Lockers along the back wall, the briefing map table (drawn with the
    // level on top) behind the spawn, and crates at the far ends.
    props: [
      locker(-21, 6),
      locker(-9, 6),
      locker(9, 6),
      locker(21, 6),
      {
        x: 0,
        z: 35.8,
        w: 1.8,
        d: 2.63,
        h: 0.95,
        kind: "cover",
        style: "maptable",
      },
      crate(-24.7, 32.2),
      crate(24.7, 32.2),
    ],
  });
  MAPS.docks.spawns.attacker = { x: 0, z: 33 };
  MAPS.docks.walls = MAPS.docks.walls
    .filter((w) => !(w.style === "trailer" && w.z > 26))
    .concat(MAPS.docks.spawnRoom.walls);
}
// RELAY STATION: built for plant & defend. Two uplink sites at the north
// corners, A (the dish yard, west) and B (the generator hall, east), each
// with three ways in: a main door from its own lane, a side door from the
// relay hall in the middle, and a back gap from the sentinels' service
// road. The lanes run straight up from the bunker: west, the cable yard
// (1.2 m embankment); centre, the switchyard (2.4 m gantry) into the relay
// hall, which forks to both sites; east, the pump yard (1.6 m loading
// dock). Each site keeps a raised lookout over its terminal, so a planted
// uplink can be held from cover, and the back gaps give the sentinels a
// retake from a side the planter isn't watching.
{
  const solid = (x0, x1, z0, z1, h, bottom = 0) => ({
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    w: x1 - x0,
    d: z1 - z0,
    h,
    ...(bottom ? { bottom } : {}),
    kind: "building",
  });
  // A wall across x at `z`, from x0 to x1, with doorways [a, b] (a lintel
  // above 2.6 m keeps the wall whole overhead).
  const across = (z, x0, x1, doors, h = 6, t = 0.4, lintel = true) => {
    const out = [];
    let at = x0;
    for (const [a, b] of [...doors, [x1, x1]]) {
      if (a - at > 0.05) out.push(solid(at, a, z - t / 2, z + t / 2, h));
      if (b > a && lintel) out.push(solid(a, b, z - t / 2, z + t / 2, h, 2.6));
      at = b;
    }
    return out;
  };
  // A lane wall along z at `x`, from z0 to z1, with open gaps [a, b].
  const along = (x, z0, z1, gaps, h = 6, t = 0.4) => {
    const out = [];
    let at = z0;
    for (const [a, b] of [...gaps, [z1, z1]]) {
      if (a - at > 0.05) out.push(solid(x - t / 2, x + t / 2, at, a, h));
      at = b;
    }
    return out;
  };
  const crate = (x, z, w, d, h = 1.1) => ({
    ...cover(x, z, w, d, h),
    style: "crate",
  });
  const spool = (x, z, size = 1.8) => ({
    x,
    z,
    w: size,
    d: size,
    h: 1.3,
    kind: "cover",
    shape: "cylinder",
  });
  const generator = (x, z, size, h) => ({
    x,
    z,
    w: size,
    d: size,
    h,
    kind: "tank",
    shape: "cylinder",
  });
  const rack = (x, z, w, d) => ({
    ...building(x, z, w, d, 2.6),
    style: "rack",
  });
  MAPS.relay = {
    name: "Relay Station",
    tagline: "Two uplink sites / hall between, road behind",
    handPlaced: true,
    size: { x: 26, z: 38 },
    lamps: [
      [-20, -31],
      [20, -31],
      [-4, 26],
      [13, 26],
    ],
    spawns: { attacker: { x: 0, z: 33 }, defender: { x: 0, z: -34 } },
    // The relay hall: the hub between the two sites.
    objective: { x: 0.3, z: -11.5 },
    // Two sites, ~48 m from the bunker doors and ~20 m from the sentinels'
    // spawn; 34 m (about 6 s sprinting) apart through the relay hall.
    terminals: [
      { id: "A", name: "Terminal A", x: -16.5, z: -16, yaw: 0 },
      { id: "B", name: "Terminal B", x: 17.5, z: -14.5, yaw: 0 },
    ],
    buyLines: { attacker: 27, defender: -26 },
    region: (x, z) =>
      z < -24
        ? "service road"
        : z < -8
          ? x < -9
            ? "dish yard"
            : x > 9
              ? "generator hall"
              : "relay hall"
          : x < -9
            ? "cable yard"
            : x > 9
              ? "pump yard"
              : "switchyard",
    walls: [
      // Framing walls.
      wall(-26.5, 0, 1, 78, 10),
      wall(26.5, 0, 1, 78, 10),
      wall(0, 38.5, 52, 1, 10),
      wall(0, -38.5, 52, 1, 10),

      // Lane walls, bunker to the sites. One connector each, staggered:
      // west mid-map, east further north.
      ...along(-9, -7.8, 30.75, [[3, 6]]),
      ...along(9, -7.8, 30.75, [[-3, 0]]),

      // A · CABLE YARD (west): a 1.2 m embankment along the west wall,
      // stairs at the south end and a ramp at the north; a walk-through
      // container and cable spools down the floor.
      platform(-22.5, 8, 7, 14, 1.2),
      ...stairs(-22.5, 15.3, 1.2, { w: 4, dz: 1 }),
      ...ramp(-22.5, -3.5, 1.2, { toward: "+z", length: 4.5, width: 3 }),
      ...openContainer(-14, 20, { length: 6, name: "CABLE CONTAINER" }),
      spool(-11.5, 12.5),
      spool(-16.5, 2.5),
      building(-14, 7, 4.5, 0.6, 3),
      building(-12.4, -2, 0.6, 4, 3),
      crate(-20, 25, 2.4, 1.2, 2.2),
      crate(-17.5, -5, 2, 1.2),
      cover(-11.5, 26.5, 1.2, 1.2),

      // B · SWITCHYARD (centre): a 2.4 m gantry, transformers breaking the
      // long views, and pallets screening the bunker door from the hall.
      platform(4, 8, 3, 14, 2.4),
      ...stairs(4, 15.3, 2.4, { w: 3, dz: 1 }),
      crate(0.5, 23, 3, 1.2, 2.2),
      { ...building(-4, 12, 3.4, 3.4, 3), style: "rack" },
      { ...building(-2.5, -2.5, 3, 3, 3), style: "rack" },
      crate(6.5, 23.5, 1.4, 1.4, 2.2),
      cover(-6.5, 5, 1.4, 1.4),
      cover(7, -3, 2.2, 1.2),
      cover(-6, 20, 1.2, 2.2),

      // C · PUMP YARD (east): a 1.6 m loading dock along the east wall
      // (ramp at the south end, stairs mid-way), a pump house, generators.
      platform(22.75, 5, 6.5, 20, 1.6),
      ...ramp(22.75, 19.5, 1.6, { toward: "-z", length: 4.5, width: 3 }),
      ...stairs(19.2, 5, 1.6, { w: 3, dx: -1 }),
      ...room(11, 17, 16.5, 23, {
        h: 3.2,
        roof: 2.9,
        openings: [
          { side: "+z", at: 13.75, w: 1.4 },
          { side: "-z", at: 14.5, w: 1.4 },
          { side: "+x", at: 20, w: 2, window: true },
        ],
      }),
      generator(14, 6, 3.4, 4),
      generator(14.5, 0.5, 3, 3.5),
      crate(12, 12, 2.2, 1.2),
      crate(18, 11, 1.2, 2.2, 2.2),
      cover(17.5, -3.5, 2, 1.2),
      crate(23, 25.5, 2.4, 1.2, 2.2),
      { ...crate(23.5, 8, 1.4, 1.4, 2.7) },
      { ...crate(21.2, -1.5, 1.2, 2.2, 2.7) },

      // The sites' south walls: one 3 m main door each from its lane.
      ...across(-8, -26, -9.2, [[-16.5, -13.5]]),
      ...across(-8, 9.2, 26, [[13.5, 16.5]]),
      // Their north walls: a 4 m back gap each onto the service road.
      ...across(-24, -26, -9.2, [[-15, -11]], 6, 0.4, false),
      ...across(-24, 9.2, 26, [[10, 13.5]], 6, 0.4, false),

      // SITE A · DISH YARD: the dish stands on a 1.6 m platform over the
      // terminal (the planter's lookout), stairs on its south face.
      platform(-22.75, -17, 6.5, 8, 1.6),
      ...stairs(-22.75, -12.7, 1.6, { w: 3, dz: 1 }),
      crate(-13, -12.5, 1.4, 1.4),
      cover(-14.5, -20.5, 3, 0.6, 1.1),
      crate(-11, -18, 1.2, 2.2, 2.2),
      crate(-20.5, -22.5, 1.4, 1.4),

      // SITE B · GENERATOR HALL: a 2.4 m mezzanine along the back wall
      // (the lookout), stairs down its east end, generators by the door.
      platform(20, -21.9, 12, 3.8, 2.4),
      ...stairs(23, -19.7, 2.4, { w: 3, dz: 1 }),
      generator(23, -11, 3.4, 4),
      crate(12.5, -12, 1.4, 1.4, 2.2),
      cover(15, -18, 2.4, 0.6, 1.1),
      crate(19.5, -10.5, 1.2, 1.2),

      // THE RELAY HALL: the middle lane's end, a roofed server hall with
      // a side door into each site and a back door to the road. Server
      // racks break the view from one side door to the other.
      ...room(-9, -24, 9, -8, {
        h: 6,
        roof: 5.4,
        skylights: 1.5,
        bay: 4,
        skip: [],
        openings: [
          { side: "+z", at: 0, w: 3 },
          { side: "-x", at: -13, w: 2.5 },
          { side: "+x", at: -19, w: 2.5 },
          { side: "-z", at: 4, w: 2.5 },
        ],
      }),
      rack(-3, -15.5, 1.2, 7),
      rack(3.5, -15, 1.2, 6),
      cover(-6.5, -21.5, 1.4, 1.4),
      cover(6.5, -10.5, 1.4, 1.4),

      // THE SERVICE ROAD: the sentinels' side, linking the three back
      // ways in. A screen in front of their spawn.
      building(0, -29.5, 8, 0.8, 4),
      crate(-18, -30, 2.2, 1.2),
      crate(18, -31, 1.2, 2.2, 2.2),
      cover(-8, -27, 1.4, 1.4),
      cover(9, -33.5, 1.4, 1.4),
    ],
    // Up the switchyard's west side and into the relay hall.
    botRoute: [
      { x: -5, z: 20 },
      { x: -5, z: -4 },
      { x: 0, z: -7 },
    ],
    routeProfiles: [
      {
        name: "Cable yard",
        low: { x: -16, z: 10 },
        high: { x: -22.5, z: 8 },
        height: 1.2,
      },
      {
        name: "Switchyard",
        low: { x: -5, z: 7 },
        high: { x: 4, z: 8 },
        height: 2.4,
      },
      {
        name: "Pump yard",
        low: { x: 17, z: 8 },
        high: { x: 22.75, z: 5 },
        height: 1.6,
      },
    ],
    brief: "Plant on A or B, then hold it. Pick a lane.",
    approaches: [
      [
        "Left · Cable yard",
        "the 1.2 m embankment and a walk-through container, to site A's main door.",
      ],
      [
        "Centre · Switchyard",
        "the 2.4 m gantry, then the relay hall: a side door into each site.",
      ],
      [
        "Right · Pump yard",
        "the 1.6 m loading dock past the pump house, to site B's main door.",
      ],
      [
        "Connectors",
        "a gap in each lane wall (west mid-map, east further north) and a crawl vent from the bunker end of the cable yard.",
      ],
      [
        "Sites",
        "A: the dish platform overlooks the terminal. B: the mezzanine does. Both have a back gap from the sentinels' service road.",
      ],
    ],
    botSpots: {
      tripwire: [
        { x: -16.47, y: 1, z: -8, b: { x: -13.53, y: 1, z: -8 } },
        { x: 13.53, y: 1, z: -8, b: { x: 16.47, y: 1, z: -8 } },
        { x: -1.47, y: 0.32, z: -8, b: { x: 1.47, y: 0.32, z: -8 } },
      ],
      camera: [
        { x: -18, y: 3, z: -23.78, yaw: Math.PI, pitch: -0.25 },
        { x: 25.98, y: 3, z: -14, yaw: Math.PI / 2, pitch: -0.2 },
      ],
      sensor: [
        { x: -14, y: 0.07, z: -11 },
        { x: 14, y: 0.07, z: -11.5 },
        { x: 0.3, y: 0.07, z: -10 },
      ],
      jammer: [
        { x: -15, z: -18 },
        { x: 16, z: -17 },
      ],
      smoke: [
        { x: -15, z: -6 },
        { x: 15, z: -6 },
        { x: 0, z: -5 },
      ],
    },
  };
  // The infiltrators' bunker across the south edge, like Pier 9's: one-way
  // glass, a door per lane.
  const locker = (x, w) => ({
    x,
    z: 37.45,
    w,
    d: 0.6,
    h: 2.2,
    kind: "building",
    style: "locker",
  });
  MAPS.relay.spawnRoom = spawnRoom({
    x0: -25.75,
    x1: 25.75,
    z0: 31,
    z1: 37.75,
    pillarEvery: 4,
    glassShare: 2 / 3,
    doors: [
      {
        name: "Left",
        color: "#e8a33c",
        x: -17.5,
        width: 3,
        to: { x: -16, z: 10 },
      },
      { name: "Centre", color: "#3fa7d6", x: 0, width: 3, to: { x: -5, z: 7 } },
      {
        name: "Right",
        color: "#4ccf7f",
        x: 17.5,
        width: 3,
        to: { x: 17, z: 8 },
      },
    ],
    props: [
      locker(-21, 6),
      locker(-9, 6),
      locker(9, 6),
      locker(21, 6),
      {
        x: 0,
        z: 35.8,
        w: 1.8,
        d: 2.63,
        h: 0.95,
        kind: "cover",
        style: "maptable",
      },
      crate(-24.7, 32.2, 1.2, 1.2),
      crate(24.7, 32.2, 1.2, 1.2),
    ],
  });
  MAPS.relay.walls.push(...MAPS.relay.spawnRoom.walls);
}
// Each terminal is a waist-high console: solid for movement, sight and
// throwing; drawn by the client (with its screen), not as a plain box.
for (const map of Object.values(MAPS))
  for (const t of map.terminals || [])
    map.walls.push({
      x: t.x,
      z: t.z,
      w: 1,
      d: 0.7,
      h: 1.2,
      kind: "terminal",
      hidden: true,
    });
// Route identities and staggered sight screens. Heights are measured from
// the shared ground plane: low routes remain at 0 while terraces/ridges rise.
const screen = (x, z, w, d, h = 5.5) => building(x, z, w, d, h);
MAPS.compound.tagline = "Warehouse terrace / broken courtyard / east overlook";
MAPS.compound.walls.push(
  // Break the central and exterior end-to-end views with alternating turns.
  screen(3.8, 3.5, 3.6, 0.65, 4.2),
  screen(-1, -6.8, 8, 0.65, 4.2),
  screen(16, 6, 5, 0.65, 4.2),
  screen(10, -5.5, 7, 0.65, 4.2),
  // Low warehouse terrace, mid courtyard perch, and high east overlook.
  platform(-17, 0, 2, 4, 0.8),
  ...stairs(-17, 2.3, 0.8, { w: 2, dz: 1 }),
  platform(-3.8, 11, 2.2, 4, 1.6),
  ...stairs(-3.8, 13.3, 1.6, { w: 2.2, dz: 1 }),
  cover(-4.7, 11, 0.4, 2.4, 2.7),
  platform(16, -8, 3, 4, 2.4),
  ...stairs(14.2, -8, 2.4, { w: 4, dx: -1 }),
  cover(16.9, -8, 0.4, 2.6, 3.5),
);
MAPS.compound.botRoute = [
  { x: 5.2, z: 22.5 },
  { x: 5.2, z: 19.3 },
  { x: 3.7, z: 18 },
  { x: 3.7, z: 5 },
  { x: 1.2, z: 5 },
  { x: 1.2, z: 2 },
  { x: 3.7, z: 2 },
  { x: 3.7, z: -9 },
];
MAPS.lanes.botSpots.sensor[0] = { x: 0, y: 2.07, z: 6 };
MAPS.quad.botSpots.tripwire[1] = {
  x: -6.97,
  y: 1.92,
  z: 11,
  b: { x: -3.03, y: 1.92, z: 11 },
};
MAPS.lanes.tagline = "West terrace / screened ridge / high east walk";
MAPS.lanes.walls = MAPS.lanes.walls.filter(
  (w) => !(w.kind === "cover" && w.x === -14.9 && w.z === 16),
);
// Tall lane dividers keep raised positions local rather than exposing every lane.
for (const w of MAPS.lanes.walls) if (w.kind === "building") w.h = 6;
MAPS.lanes.walls.push(
  platform(-14.9, 12, 1.4, 4, 1.2),
  ...stairs(-14.9, 14.3, 1.2, { w: 1.4, dz: 1 }),
  screen(-14.9, 7, 2.2, 0.65),
  screen(-13.1, 1.5, 2.2, 0.65),
  screen(-3.5, 7, 2, 0.65),
  screen(3.5, 3, 2, 0.65),
  screen(2.5, -3, 2, 0.65),
  // Break views along the 2 m ridge and 2.4 m catwalk, too.
  screen(-0.6, 4, 1.8, 0.65, 4.4),
  screen(0.6, 0, 1.8, 0.65, 4.4),
  screen(13.7, 7, 2.4, 0.65),
  screen(15.3, 0, 2.4, 0.65),
  screen(10.15, 4, 2.3, 0.65),
  screen(11.35, -1, 2.3, 0.65),
);
MAPS.lanes.botRoute = [
  { x: 5.2, z: 22.5 },
  { x: 5.2, z: 19.3 },
  { x: 3.9, z: 18 },
  { x: 3.9, z: 4 },
  { x: 2, z: 4 },
  { x: 2, z: 1.9 },
  { x: 3.9, z: 1.9 },
  { x: 3.9, z: -6 },
  { x: 2.5, z: -12.5 },
];
MAPS.quad.tagline = "Four staggered routes / low court to high walk";
// Remove crates which would obstruct the new terrace stairs or low bypasses.
MAPS.quad.walls = MAPS.quad.walls.filter(
  (w) =>
    !(
      w.kind === "cover" &&
      [
        [-15, 15],
        [-6, 14],
        [-4, 9],
        [-6, 4],
        [-4, -1],
        [3.7, 15],
        [13, 14],
        [15, 9],
      ].some(([x, z]) => w.x === x && w.z === z)
    ),
);
for (const w of MAPS.quad.walls) if (w.kind === "building") w.h = 6;
MAPS.quad.walls.push(
  // A: a low loading terrace with a sheltered floor-level bypass.
  platform(-15.1, 11, 1.8, 5, 1.2),
  ...stairs(-15.1, 13.8, 1.2, { w: 1.8, dz: 1 }),
  screen(-14.8, 6, 2.4, 0.65),
  screen(-13.2, 0, 2.4, 0.65),
  // B: a mid-height gallery; the shortcut stays at ground level.
  platform(-5.8, 11.5, 2.4, 5, 1.6),
  ...stairs(-5.8, 14.3, 1.6, { w: 2.4, dz: 1 }),
  screen(-6.4, 12, 1.2, 0.65, 3.8),
  screen(-4.2, 4, 2.4, 0.65),
  screen(-5.8, -2, 2.4, 0.65),
  // C: mostly low ground, with a shallow shelf and opposing doglegs.
  platform(3.8, 11.5, 1.6, 4, 0.8),
  ...stairs(3.8, 13.8, 0.8, { w: 1.6, dz: 1 }),
  screen(5.8, 5, 2.4, 0.65),
  screen(4.2, -1, 2.4, 0.65),
  // D: the highest walkway, screened in both directions, plus a low bypass.
  platform(14.8, 9.5, 2.4, 9, 2.4),
  ...stairs(14.8, 14.3, 2.4, { w: 2.4, dz: 1 }),
  screen(14.2, 11, 1.2, 0.65),
  screen(15.4, 7, 1.2, 0.65),
  screen(13.2, 2, 2.4, 0.65),
  screen(14.8, -3, 2.4, 0.65),
);
MAPS.quad.botRoute = [
  { x: 5.2, z: 22.5 },
  { x: 5.6, z: 19.3 },
  { x: 5.6, z: 6.5 },
  { x: 3.8, z: 6.5 },
  { x: 3.8, z: 4.1 },
  { x: 6.2, z: 4.1 },
  { x: 6.2, z: -6 },
  { x: 2.5, z: -12.5 },
];
// Tight corners must be reached before the bot starts its next leg.
for (const map of Object.values(MAPS))
  map.botRoute = map.botRoute.map((p) => ({ ...p, radius: 0.12 }));
// Testable route samples: each low bypass still joins the objective, while
// stairs create optional high positions with their own interrupted views.
MAPS.compound.routeProfiles = [
  {
    name: "Warehouse terrace",
    low: { x: -15, z: 0 },
    high: { x: -17, z: 0 },
    height: 0.8,
  },
  {
    name: "Courtyard perch",
    low: { x: 0, z: 11 },
    high: { x: -3.8, z: 11 },
    height: 1.6,
  },
  {
    name: "East overlook",
    low: { x: 11, z: -10 },
    high: { x: 16, z: -8 },
    height: 2.4,
  },
];
MAPS.lanes.routeProfiles = [
  {
    name: "West terrace",
    low: { x: -13, z: 8 },
    high: { x: -14.9, z: 12 },
    height: 1.2,
  },
  {
    name: "Center ridge",
    low: { x: 3.9, z: 8 },
    high: { x: 0, z: 6 },
    height: 2,
  },
  {
    name: "East catwalk",
    low: { x: 10.75, z: 7 },
    high: { x: 15.7, z: 7 },
    height: 2.4,
  },
];
MAPS.quad.routeProfiles = [
  {
    name: "A / Low terrace",
    low: { x: -13, z: 7 },
    high: { x: -15.1, z: 11 },
    height: 1.2,
  },
  {
    name: "B / Mid gallery",
    low: { x: -3.8, z: 11.5 },
    high: { x: -5.2, z: 11.5 },
    height: 1.6,
  },
  {
    name: "C / Low shelf",
    low: { x: 5.6, z: 11.5 },
    high: { x: 3.8, z: 11.5 },
    height: 0.8,
  },
  {
    name: "D / High walk",
    low: { x: 12.8, z: 6.5 },
    high: { x: 15.5, z: 11 },
    height: 2.4,
  },
];
MAPS.monolith.routeProfiles = [
  {
    name: "Courtyard altar",
    low: { x: 6.5, z: 0 },
    high: { x: 0, z: 0 },
    height: 1.2,
  },
  {
    name: "West gallery",
    low: { x: -12.5, z: 2 },
    high: { x: -19.5, z: 0 },
    height: 2.4,
  },
  {
    name: "Plaza overlook",
    low: { x: -11.5, z: -26.5 },
    high: { x: -19, z: -32 },
    height: 1.6,
  },
];
// Briefing copy: the infiltrator's one-liner and the Field Manual's ways in.
Object.assign(MAPS.compound, {
  brief: "Pick a lane: Left, Centre or Right.",
  approaches: [
    [
      "Left · Warehouse",
      "west interior, narrow with cover. Terminal A is just past its north end.",
    ],
    ["Centre · Courtyard", "fast and exposed; Terminal B is straight ahead."],
    [
      "Right · Service yard",
      "east flank, long and concealed. Terminal C is near the overlook.",
    ],
    [
      "Connectors",
      "one each side, mid-map: the warehouse wall cut, and a gap in the east yard wall.",
    ],
  ],
});
Object.assign(MAPS.lanes, {
  brief: "Pick a hallway: Left, Centre or Right.",
  approaches: [
    [
      "Left · West terrace",
      "1.2 m terrace over a screened low route, to Terminal A.",
    ],
    [
      "Centre · Center ridge",
      "2 m ridge broken by staggered screens, to Terminal B.",
    ],
    [
      "Right · East catwalk",
      "the 2.4 m high walk; the floor runs beside it, to Terminal C.",
    ],
    ["Connectors", "one short hallway through each divider block."],
  ],
});
Object.assign(MAPS.quad, {
  brief: "Choose your lane.",
  approaches: [
    [
      "Left · Low terrace",
      "west lane with a 1.2 m loading terrace, to Terminal A.",
    ],
    [
      "Inner left · Mid gallery",
      "inner lane with a 1.6 m gallery, to Terminal B.",
    ],
    [
      "Inner right · Low court",
      "inner lane, mostly low ground, to Terminal B.",
    ],
    ["Right · High walk", "east lane with the 2.4 m walkway, to Terminal C."],
    [
      "Connectors",
      "one between each pair of lanes: the A–B tunnel, the central shortcut and the C–D tunnel.",
    ],
  ],
});
// Pier 9: three neighboring homes. Keep the lane boundaries, gate locations,
// spawn room and objectives; all garden screening is authoritative geometry.
{
  const map = MAPS.docks;
  const fence = (x, z, w, d, h = 2.8) => ({
    x,
    z,
    w,
    d,
    h,
    kind: "building",
    style: "gardenFence",
    color: "#fff6e5",
  });
  const hedge = (x, z, w, d, h = 2.4) => ({
    x,
    z,
    w,
    d,
    h,
    kind: "building",
    style: "hedge",
    color: "#467a3b",
  });
  map.tagline = "Three homes / front gardens, backyards and garden gates";
  map.region = (x, z) =>
    z > 30.75
      ? "neighborhood staging"
      : z < -25
        ? "back lane"
        : `${x < -10 ? "A" : x > 10.9 ? "C" : "B"} ${z > 8 ? "front yard" : z < -8 ? "backyard" : "house"}`;
  map.houses = [
    { id: "A", x: -18, z: 0, w: 10, d: 16, color: "#efd2a0" },
    { id: "B", x: 0, z: 0, w: 12, d: 16, color: "#da9b83" },
    { id: "C", x: 17, z: 0, w: 8, d: 16, color: "#94bdc3", singleStory: true },
  ];
  const home = {
    id: "MY HOUSE",
    x: 0,
    z: 46,
    w: 50,
    d: 16,
    singleStory: true,
    color: "#b8c99c",
    spawn: true,
  };
  map.houses.push(home);
  const seekerHome = { ...home, id: "SEEKERS HOUSE", z: -46, team: "defender" };
  map.houses.push(seekerHome);
  map.size = { x: 28, z: 58 };
  map.spawnRoom = spawnRoom({
    x0: -25,
    x1: 25,
    z0: 38,
    z1: 54,
    height: 3.9,
    doors: [
      {
        name: "Front door",
        x: 0,
        width: 2.4,
        color: "#3fa7d6",
        to: { x: 0, z: 8 },
      },
      {
        name: "Garage",
        x: -18,
        width: 6,
        color: "#e8a33c",
        to: { x: -18, z: 8 },
      },
    ],
  });
  map.spawnRoom.residential = true;
  // The house shell below supplies the single-story spawn home.
  map.spawnRoom.walls = [];
  map.spawns.attacker = { x: 0, z: 48 };
  const sideDoor = {
    x: 25,
    z: 46,
    w: 0.4,
    d: 2.4,
    h: 2.6,
    kind: "door",
    oneWay: "attacker",
  };
  map.spawnRoom.doors.push(sideDoor);
  map.spawnRoom.exits.push({ name: "Side door", x: 25.6, z: 46 });
  map.spawnRoom.windows = [];
  map.passages = [];
  map.gardenGates = [
    { x: -10, z: 4 },
    { x: 10.9, z: -4 },
  ];
  map.walls = [
    // Match the lane dividers; tall hidden extensions prevent roof escapes.
    ...[-28.5, 28.5].flatMap((x) => [
      ...[
        [-45.25, 25.5],
        [0, 53],
        [45.25, 25.5],
      ].flatMap(([z, d]) => [
        fence(x, z, 1, d),
        { ...fence(x, z, 1, d, 64), bottom: 2.8, hidden: true, see: true },
      ]),
      ...[-29.5, 29.5].flatMap((z) => [
        { ...fence(x, z, 1, 6), style: "estateGate", see: true },
        { ...fence(x, z, 1, 6, 64), bottom: 2.8, hidden: true, see: true },
      ]),
    ]),
    ...[-58.5, 58.5].flatMap((z) => [
      fence(0, z, 56, 1),
      { ...fence(0, z, 56, 1, 64), bottom: 2.8, hidden: true, see: true },
    ]),
    ...map.spawnRoom.walls,
    ...map.walls.filter((w) => w.kind === "terminal"),
  ];
  // Alternating hedge screens break both perimeter sightlines, leaving room
  // to weave around each end rather than sealing the outer passages.
  for (const side of [-1, 1]) {
    for (const z of [-20, 20]) map.walls.push(hedge(side * 27, z, 2, 1.2, 2.4));
    for (const z of [-12, 12])
      if (!(side === 1 && z === 12))
        map.walls.push(hedge(side * 24.75, z, 2.5, 1.2, 2.4));
  }
  // Stagger connections so crossing all three lanes requires a turn.
  for (const { x, z } of map.gardenGates) {
    const low = -24,
      high = 26.35,
      halfGap = 2.65;
    map.walls.push(
      fence(x, (low + z - halfGap) / 2, 0.3, z - halfGap - low),
      fence(x, (z + halfGap + high) / 2, 0.3, high - z - halfGap),
    );
  }
  for (const house of map.houses) {
    const { x, z, w, d, color } = house;
    map.walls.push(
      ...room(
        x - w / 2,
        (house.team === "defender" ? 46 : z) - d / 2,
        x + w / 2,
        (house.team === "defender" ? 46 : z) + d / 2,
        {
          h: 3.8,
          openings: (house.openings = house.spawn
            ? [
                { side: "-z", at: 0, w: 2.4 },
                { side: "-z", at: -18, w: 6 },
                { side: "+x", at: 46, w: 2.4 },
                ...[-10, -5, 5, 10, 15, 20].map((at) => ({
                  side: "-z",
                  at,
                  w: 2.4,
                  window: true,
                  sill: 1,
                  lintel: 2.6,
                })),
              ]
            : [
                { side: "+z", at: x, w: 2.4 },
                { side: "-z", at: x, w: 2.4 },
                // Side doors follow the staggered garden connections.
                { side: "+x", at: house.id === "B" ? -4 : 4, w: 2.5 },
                { side: "-x", at: house.id === "C" ? -4 : 4, w: 2.5 },
                {
                  side: "+z",
                  at: x - Math.min(3.5, w / 2 - 1.5),
                  w: 2.2,
                  window: true,
                  sill: 0.9,
                  lintel: 2.5,
                },
                {
                  side: "-z",
                  at: x + Math.min(3.5, w / 2 - 1.5),
                  w: 2.2,
                  window: true,
                  sill: 0.9,
                  lintel: 2.5,
                },
              ]),
        },
      ).map((p) => ({
        ...p,
        ...(house.team === "defender" && { z: -p.z }),
        style: "house",
        color,
      })),
    );
    if (house.singleStory) {
      map.walls.push({
        x,
        z,
        w,
        d,
        bottom: 3.8,
        h: 4.1,
        kind: "roof",
        style: "house",
        color,
      });
    } else {
      // A 3.9 m upper floor, with a full-height opening above the stairs.
      const left = x - w / 2 + 0.2,
        right = x + w / 2 - 0.2;
      const stairX = left + 1.3;
      const slab = (xa, xb, za, zb) => ({
        x: (xa + xb) / 2,
        z: (za + zb) / 2,
        w: xb - xa,
        d: zb - za,
        bottom: 3.6,
        h: 3.9,
        kind: "roof",
        style: "house",
        color,
      });
      map.walls.push(
        slab(left + 2.6, right, z - 7.8, z + 7.8),
        slab(left, left + 2.6, z - 7.8, z - 4.3),
        slab(left, left + 2.6, z + 2.3, z + 7.8),
        ...stairs(stairX, z - 4, 3.9, { w: 2.6, dz: 1 }),
        ...room(x - w / 2, z - 8, x + w / 2, z + 8, {
          h: 3.2,
          roof: 3.2,
          openings: (house.upperOpenings = [-1, 1].flatMap((side) =>
            [-2.5, 2.5].map((dx) => ({
              side: side < 0 ? "-z" : "+z",
              at: x + dx,
              w: 2.2,
              window: !(house.id === "B" && side < 0 && dx === 2.5),
            })),
          )),
        }).map((piece) => ({
          ...piece,
          bottom: (piece.bottom || 0) + 3.9,
          h: piece.h + 3.9,
          style: "house",
          color,
        })),
        // Upstairs partition leaves a broad passage beside the stair landing.
        {
          ...building(x + 1.8, z, w / 2 - 1, 0.3, 6.7),
          bottom: 3.9,
          style: "house",
          color,
        },
        {
          x: left + 2.65,
          z: z - 1,
          w: 0.12,
          d: 6.6,
          bottom: 3.9,
          h: 4.9,
          kind: "cover",
          style: "house",
          color,
        },
      );
      house.upperFloor = 3.9;
      house.stair = { x: stairX, z: z + 1.8, topZ: z - 4.8 };
    }
    if (house.spawn) {
      const sign = house.team === "defender" ? -1 : 1;
      // The attached garage shares the house roof and west exterior wall.
      // A normal interior doorway connects it to the main living space.
      map.walls.push(
        ...room(-25, 38, -12, 54, {
          h: 3.8,
          skip: ["-x", "-z", "+z"],
          openings: [{ side: "+x", at: 46, w: 2.4 }],
        }).map((p) => ({ ...p, z: p.z * sign, style: "house", color })),
      );
      continue;
    }
    // Offset hedges screen front and back gardens without sealing the path.
    map.walls.push(
      hedge(x - 3.8, 17, 3.8, 1.3),
      hedge(x + 3.6, 24, 3.2, 1.4),
      // Lane C's hedge runs beside the west deck edge, meeting the rear wall.
      house.id === "C"
        ? hedge(x - 3.65, z - d / 2 - 1.5, 1.3, 3)
        : hedge(x + 3.5, -11, 3, 1.3),
      hedge(x + 3.7, -20, 3.5, 1.4),
      ...(house.id === "C"
        ? []
        : [
            {
              ...cover(x + 3.5, 12, 2, 1, 0.75),
              style: "planter",
              color: "#a87953",
            },
          ]),
      {
        ...cover(x - 3.5, -23, 2.4, 1.4, 1.1),
        style: "gardenTable",
        color: "#a87953",
      },
    );
    // An indoor partition breaks the straight front-door to back-door view.
    map.walls.push({
      ...building(x + 1.5, -1, 5, 0.3, 2.8),
      style: "house",
      color,
    });
  }
  // Attached garage opens onto a driveway clear of the street and gate routes.
  map.garage = { x: 23, z: 4, w: 4, d: 8 };
  map.walls.push(
    ...room(21.4, 0, 25, 8, {
      h: 3,
      roof: 3,
      skip: ["-x"],
      openings: [
        { side: "+z", at: 23, w: 3 },
        { side: "-x", at: 4, w: 2.5 },
      ],
    }).map((p) => ({ ...p, style: "house", color: "#94bdc3" })),
  );
  map.homeGarages = [1, -1].map((side) => ({
    x: -18,
    z: 46 * side,
    w: 13,
    d: 16,
    side,
  }));
  map.spawns.defender = { x: 0, z: -48 };
  map.spawnYaw = { attacker: 0, defender: Math.PI };
  // Low picket runs frame the lawns, leaving front paths and driveways open.
  const picket = (x, z, w, d) => ({
    ...fence(x, z, w, d, 1.15),
    style: "picketFence",
    see: true,
    color: "#fff6e5",
  });
  for (const side of [-1, 1]) {
    for (const [x, w] of [
      [-24, 2],
      [-7.5, 10],
      [13, 23],
    ])
      map.walls.push(picket(x, 32.8 * side, w, 0.16));
    for (const x of [-24.5, 24.5])
      map.walls.push(picket(x, 35.4 * side, 0.16, 4.8));
  }
  // Each yard spans its lane, with only a pedestrian gate at the house path.
  for (const [left, right, gate] of [
    [-28, -10, -18],
    [-10, 10.9, 0],
    [10.9, 28, 17],
  ])
    for (const z of [-24, 25])
      for (const [a, b] of [
        [left, gate - 1.2],
        [gate + 1.2, right],
      ])
        map.walls.push(picket((a + b) / 2, z, b - a, 0.16));
  map.parkedCars = [
    { x: -16, z: 28.3, w: 4.6, d: 1.9, color: "#b95e47" },
    { x: 8, z: 30.7, w: 4.6, d: 1.9, color: "#557b96" },
    { x: 23, z: 11.5, w: 1.9, d: 4.6, color: "#e1bd65" },
  ];
  for (const car of map.parkedCars) {
    map.walls.push(
      { ...car, h: 1, kind: "building", style: "parkedCar" },
      {
        ...car,
        w: car.w * 0.58,
        d: car.d * 0.68,
        bottom: 1,
        h: 1.65,
        kind: "building",
        style: "parkedCar",
      },
    );
  }
  map.botRoute = [
    { x: 0, z: 40 },
    { x: 0, z: 34 },
    { x: 0, z: 29 },
    { x: 0, z: 12 },
    { x: 0, z: 4 },
    { x: -8, z: 4 },
    { x: -8, z: -17 },
    { x: 0, z: -25.5 },
  ];
  // Old industrial gadget anchors no longer describe solid surfaces.
  map.botSpots = {
    tripwire: [
      { x: -19.17, y: 1, z: 8, b: { x: -16.83, y: 1, z: 8 } },
      { x: -1.17, y: 0.32, z: 8, b: { x: 1.17, y: 0.32, z: 8 } },
      { x: 16.83, y: 1, z: -8, b: { x: 19.17, y: 1, z: -8 } },
    ],
    camera: [
      { x: -16, y: 2.5, z: 8.22, yaw: Math.PI, pitch: -0.2 },
      { x: 20, y: 2.5, z: -8.22, yaw: 0, pitch: -0.2 },
    ],
    sensor: [
      { x: 0, y: 0.07, z: 12 },
      { x: -18, y: 0.07, z: -17 },
      { x: 18, y: 0.07, z: -17 },
    ],
    jammer: [
      { x: 0, z: -23 },
      { x: 18, z: -25 },
    ],
    smoke: [
      { x: -18, z: 12 },
      { x: 0, z: 12 },
      { x: 18, z: 12 },
    ],
  };
  // Raised garden decks keep optional elevation without industrial catwalks.
  map.routeProfiles = map.houses
    .filter((h) => !h.spawn && h.id !== "A")
    .map(({ id, x }) => {
      if (id === "C") {
        // A low timber deck meets the rear doorway, with a full-width step.
        map.walls.push(
          {
            ...platform(x, -10, 6, 4, 0.4),
            style: "backDeck",
            color: "#9a704d",
          },
          {
            ...platform(x, -12.3, 6, 0.6, 0.2),
            style: "backDeck",
            color: "#9a704d",
          },
        );
        return {
          name: "C back deck",
          low: { x, z: -13 },
          high: { x, z: -10 },
          height: 0.4,
        };
      }
      const height = 3.9;
      // The deck meets B's upstairs rear door; stairs descend toward the yard.
      map.walls.push(
        {
          ...platform(x + 1, -10.1, 8, 3.8, height),
          bottom: 3.6,
          style: "backDeck",
          color: "#9a704d",
        },
        ...stairs(x + 3.5, -12.3, height, { w: 2.4, dz: -1 }).flatMap((p) => [
          {
            ...p,
            bottom: Math.max(0, p.h - 0.18),
            style: "backDeck",
            color: "#9a704d",
          },
          ...[-1.3, 1.3].map((dx) => ({
            x: p.x + dx,
            z: p.z,
            w: 0.12,
            d: 0.58,
            bottom: p.h,
            h: p.h + 1.05,
            kind: "cover",
            style: "stairRail",
            color: "#eee5d4",
          })),
        ]),
        ...[
          [-3.1, -10.1, 0.2, 4],
          [5.1, -10.1, 0.2, 4],
          [-0.4, -12.1, 5.2, 0.2],
        ].map(([dx, z, w, d]) => ({
          x: x + dx,
          z,
          w,
          d,
          bottom: height,
          h: height + 1.1,
          kind: "cover",
          style: "gardenFence",
          color: "#eee5d4",
        })),
        ...[-2.7, 4.7].map((dx) => ({
          x: x + dx,
          z: -11.6,
          w: 0.22,
          d: 0.22,
          h: 3.6,
          kind: "building",
          color: "#9a704d",
        })),
      );
      return {
        name: "B second-story deck",
        low: { x: x + 3.5, z: -18 },
        high: { x: x + 3.5, z: -10 },
        height,
      };
    });
  // A's former platform becomes a closed pool enclosure beside the yard path.
  map.pool = { x: -22.5, z: -16, w: 6.2, d: 10 };
  map.walls = map.walls.filter(
    (p) =>
      !(
        p.style === "hedge" &&
        p.x + p.w / 2 > -26.5 &&
        p.x - p.w / 2 < -18.5 &&
        p.z + p.d / 2 > -21.9 &&
        p.z - p.d / 2 < -10.1
      ),
  );
  map.walls.push(
    { ...platform(-22.5, -16, 7, 10.8, 0.16), style: "pool", color: "#eee5d4" },
    // Occupy the closed enclosure as well as its edges: no clamber landing
    // or vault path from nearby furniture may enter the pool.
    {
      x: -22.5,
      z: -16,
      w: 7.6,
      d: 11.6,
      h: 64,
      kind: "building",
      hidden: true,
      see: true,
    },
    ...[
      [-26.3, -16, 0.18, 11.6],
      [-18.7, -16, 0.18, 11.6],
      [-22.5, -10.2, 7.42, 0.18],
      [-22.5, -21.8, 7.42, 0.18],
    ].flatMap(([x, z, w, d]) => [
      {
        x,
        z,
        w,
        d,
        h: 1.35,
        kind: "building",
        style: "poolFence",
        color: "#304744",
        see: true,
      },
      {
        x,
        z,
        w,
        d,
        bottom: 1.35,
        h: 64,
        kind: "building",
        hidden: true,
        see: true,
      },
    ]),
  );
  map.brief =
    "Leave my house, cross the lawn and street, then choose A, B or C. Explore upstairs via indoor stairs.";
  map.approaches = [
    [
      "A · Amber house",
      "Front garden, house and a screened backyard around Terminal A.",
    ],
    [
      "B · Terracotta house",
      "A central home with side doors leading to both neighboring gardens.",
    ],
    ["C · Blue house", "Front lawn and a private backyard around Terminal C."],
    [
      "Garden gates",
      "Open gates and paths connect the side yards at mid-map; the back lane links all three gardens.",
    ],
  ];
}
Object.assign(MAPS.monolith, {
  brief: "Pick a lane: Left, Centre or Right.",
  approaches: [
    [
      "Left · West gallery",
      "2.4 m gallery and the hidden flank behind it, to Terminal A.",
    ],
    [
      "Centre · Courtyard",
      "past the monoliths and over the altar, to Terminal B.",
    ],
    ["Right · East gallery", "2.4 m gallery and its flank, to Terminal C."],
    ["Connectors", "one gap in each lane wall, beside the altar."],
    ["Underpasses", "beneath both galleries, lane to flank."],
  ],
});
// Every open container is a walk-through passage: on the minimap, kept clear
// of generated cover, and checked by the tunnel tests.
for (const map of Object.values(MAPS))
  for (const w of map.walls)
    if (w.shell && w.bottom) {
      const { name, x, z, axis, length, width, clearance } = w.shell;
      (map.passages ||= []).push({
        name,
        x,
        z,
        w: axis === "z" ? width : length,
        d: axis === "z" ? length : width,
        axis,
        clearance,
        container: true,
      });
    }
// Stealth cover pass. `bottom` is the underside of an elevated solid; `h`
// remains its absolute top, shared by collision, rays and rendering.
function passage(map, name, x, z, width, depth, axis = "x", clearance = 2.2) {
  const cut = { x, z, w: width, d: depth },
    next = [];
  for (const w of map.walls) {
    const left = Math.max(w.x - w.w / 2, x - width / 2),
      right = Math.min(w.x + w.w / 2, x + width / 2),
      north = Math.max(w.z - w.d / 2, z - depth / 2),
      south = Math.min(w.z + w.d / 2, z + depth / 2);
    if (left >= right || north >= south || w.bottom) {
      next.push(w);
      continue;
    }
    const piece = (x1, x2, z1, z2) => {
      if (x2 - x1 > 0.02 && z2 - z1 > 0.02)
        next.push({
          ...w,
          x: (x1 + x2) / 2,
          z: (z1 + z2) / 2,
          w: x2 - x1,
          d: z2 - z1,
        });
    };
    piece(w.x - w.w / 2, left, w.z - w.d / 2, w.z + w.d / 2);
    piece(right, w.x + w.w / 2, w.z - w.d / 2, w.z + w.d / 2);
    piece(left, right, w.z - w.d / 2, north);
    piece(left, right, south, w.z + w.d / 2);
    if (w.h > clearance + 0.1)
      next.push({
        x: (left + right) / 2,
        z: (north + south) / 2,
        w: right - left,
        d: south - north,
        h: w.h,
        bottom: clearance,
        kind: "roof",
      });
  }
  map.walls = next;
  (map.passages ||= []).push({
    ...cut,
    name,
    axis,
    clearance,
    bay: name.includes("HIDE BAY"),
  });
}
passage(MAPS.compound, "WAREHOUSE CUT", -6, 8, 1.4, 2.6);
passage(MAPS.compound, "CONTAINER RUN", 7, 10, 2, 6.2, "z", 2.1);
passage(MAPS.compound, "EAST SERVICE TUNNEL", 13, 0, 2.7, 8.2, "z", 2.1);
passage(MAPS.quad, "A–B SERVICE TUNNEL", -9.5, 1.5, 5.2, 2.6);
passage(MAPS.quad, "C–D SERVICE TUNNEL", 9.5, 8.5, 5.2, 2.6);
// Recessed bays let someone let a patrol pass instead of remaining in its lane.
passage(MAPS.lanes, "WEST HIDE BAY", -17, 8, 2.2, 2.8);
passage(MAPS.lanes, "RIDGE HIDE BAY", -5.2, 8, 1.8, 2.8);
passage(MAPS.quad, "A HIDE BAY", -17, 8, 2.2, 2.8);
passage(MAPS.quad, "B HIDE BAY", -8, 6, 2.2, 2.8);
passage(MAPS.quad, "D HIDE BAY", 17, 0, 2.2, 2.8);
// These crates otherwise seal the turn between the existing D-lane screens.
MAPS.quad.walls = MAPS.quad.walls.filter(
  (w) =>
    !(
      w.kind === "cover" &&
      ((w.x === 15 && w.z === -1) || (w.x === 13 && w.z === 4))
    ),
);
// Gallery underpasses give the flanks a second exit into the courtyard.
// Both end staircases remain available above the underpasses.
passage(MAPS.monolith, "WEST GALLERY UNDERPASS", -19.5, 10, 8, 2.8, "x", 2.05);
passage(MAPS.monolith, "EAST GALLERY UNDERPASS", 19.5, -10, 8, 2.8, "x", 2.05);
// A crawl vent: a steel duct `length` m along `axis`, cut through whatever it
// crosses, with `clearance` m of headroom: room to crouch or crawl, not to
// stand (you're kept crouched inside; see lowCeiling).
function vent(map, name, x, z, length, axis = "x", clearance = 1.2) {
  const width = 1.2,
    t = 0.1,
    alongX = axis === "x",
    duct = (offset, across, h, bottom) => ({
      x: alongX ? x : x + offset,
      z: alongX ? z + offset : z,
      w: alongX ? length : across,
      d: alongX ? across : length,
      h,
      ...(bottom && { bottom }),
      kind: "cover",
      style: "vent",
      color: "#8e959b",
    });
  passage(
    map,
    name,
    x,
    z,
    alongX ? length : width,
    alongX ? width : length,
    axis,
    clearance,
  );
  map.passages.at(-1).vent = true;
  map.walls.push(
    duct(-(width - t) / 2, t, clearance),
    duct((width - t) / 2, t, clearance),
    // The lid tucks 2 cm into any wall it crosses, so no faces meet flush.
    duct(0, width + 0.04, clearance + 0.2, clearance),
  );
}
vent(MAPS.compound, "WAREHOUSE VENT", -6, -1, 2.4);
vent(MAPS.lanes, "EAST BLOCK VENT", 6.75, 11, 5.1);
vent(MAPS.quad, "C–D VENT", 9.5, -2.5, 5.6);
vent(MAPS.relay, "CABLE YARD VENT", -9, 22, 2.4);

// The older maps' data terminals (see dedicatedLanes), kept clear of the
// generated cover.
const TERMINALS = {
  compound: [
    { id: "A", x: -15, z: -9 },
    { id: "B", x: 1, z: -9.5 },
    { id: "C", x: 12, z: -13 },
  ],
  lanes: [
    { id: "A", x: -14, z: -11 },
    { id: "B", x: 0, z: -10 },
    { id: "C", x: 12, z: -11 },
  ],
  quad: [
    { id: "A", x: -14, z: -11 },
    { id: "B", x: 0, z: -10 },
    { id: "C", x: 14, z: -11 },
  ],
  monolith: [
    { id: "A", x: -13, z: -16.5 },
    { id: "B", x: 0, z: -21 },
    { id: "C", x: 13, z: -16.5 },
  ],
};
// Cover chains across previously empty yards and plazas. Keep existing stairs,
// device sites, route samples and the immediate objective area unobstructed.
for (const [id, map] of Object.entries(MAPS)) {
  // Hand-placed maps (The Monolith, Pier 9) use larger designed pieces.
  if (map.handPlaced) continue;
  const candidates = [];
  const protectedPoints = [
    map.spawns.attacker,
    map.spawns.defender,
    map.objective,
    ...(TERMINALS[id] || []).map((t) => ({ x: t.x, z: t.z + 1 })),
    ...map.routeProfiles.map((r) => r.low),
    ...Object.values(map.botSpots).flat(),
  ];
  const add = (x, z, w, d, h) => {
    if (
      map.walls.some(
        (b) =>
          ["stairs", "ramp"].includes(b.kind) &&
          Math.abs(x - b.x) < (w + b.w) / 2 + 1.6 &&
          Math.abs(z - b.z) < (d + b.d) / 2 + 1.6,
      )
    )
      return;
    if (id === "compound" && Math.abs(x) < 1.8 && z > 12) return;
    if (
      protectedPoints.some(
        (p) => Math.hypot(x - p.x, z - p.z) < Math.max(w, d) / 2 + 1.2,
      )
    )
      return;
    if (
      map.passages.some(
        (p) =>
          Math.abs(x - p.x) < p.w / 2 + w / 2 + 0.7 &&
          Math.abs(z - p.z) < p.d / 2 + d / 2 + 0.7,
      )
    )
      return;
    if (
      map.walls.some(
        (b) =>
          !b.bottom &&
          Math.abs(x - b.x) < (w + b.w) / 2 + 0.55 &&
          Math.abs(z - b.z) < (d + b.d) / 2 + 0.55,
      )
    )
      return;
    map.walls.push({ ...cover(x, z, w, d, h), stealthCover: true });
  };
  // Interleaved standing-height refuges and crouch-height links; gaps around
  // each piece give two ways out, rather than long blind dead ends.
  for (let row = 0, z = -21; z <= 17; z += 4, row++)
    for (let col = 0, x = -15; x <= 15; x += 4, col++) {
      candidates.push([
        x + (row % 2 ? 1 : 0),
        z,
        col % 2 ? 1.6 : 2,
        1.2,
        (col + Math.round(z)) % 3 === 0 ? 2.15 : 1.15,
      ]);
    }
  for (const c of candidates) add(...c);
  // A standing-height L at each side of the objective makes a refuge from
  // plaza crossfire without enclosing the flag itself.
  for (const sign of [-1, 1]) {
    add(map.objective.x + sign * 4.2, map.objective.z + 2.8, 2.2, 0.65, 2.2);
    add(map.objective.x + sign * 5, map.objective.z + 1.8, 0.65, 2, 2.2);
  }
}

// The Lanes clearance pass: thin wall-hugging baffles replace bulky lane crates.
// Keep at least 1 m for an intended opening (the player is 0.64 m across).
const lanes = MAPS.lanes;
for (const w of lanes.walls) {
  if (w.kind === "building" && Math.abs(w.d - 0.65) < 0.001) w.d = 0.24;
  if (w.kind === "cover" && w.z >= -6 && w.z <= 19 && w.w < 2 && w.d >= 1) {
    w.w = 0.5;
    w.d = 1.3;
    w.style = "panel";
  }
}
// Carry the widened platform edges down their stairs as well.
for (const w of lanes.walls.filter((w) => w.kind === "stairs")) {
  if (w.x === 14.5 && Math.abs(w.w - 3) < 0.001) {
    w.x += 0.25;
    w.w += 0.5;
  }
  if (w.x === -14.9 && Math.abs(w.w - 1.4) < 0.001) {
    w.x -= 0.2;
    w.w += 0.4;
  }
}
const gapBetween = (a, b, axis) => {
  const size = axis === "x" ? "w" : "d",
    other = axis === "x" ? "z" : "x",
    span = axis === "x" ? "d" : "w";
  const overlap =
    Math.min(a[other] + a[span] / 2, b[other] + b[span] / 2) -
    Math.max(a[other] - a[span] / 2, b[other] - b[span] / 2);
  const gap = Math.abs(a[axis] - b[axis]) - (a[size] + b[size]) / 2;
  return overlap > 0.05 && gap > 0.001 && gap < 1 ? gap : null;
};
// Snap small panels against their neighboring structure, never leave a sliver
// behind them. Wider gaps remain real walking routes.
for (const w of lanes.walls.filter(
  (w) => w.kind === "cover" && w.style === "panel",
)) {
  for (const axis of ["x", "z"]) {
    let nearest = null;
    for (const b of lanes.walls.filter(
      (b) => b !== w && !b.bottom && b.kind !== "stairs" && b.kind !== "cover",
    )) {
      const gap = gapBetween(w, b, axis);
      if (gap !== null && (!nearest || gap < nearest.gap)) nearest = { b, gap };
    }
    if (nearest) w[axis] += Math.sign(nearest.b[axis] - w[axis]) * nearest.gap;
  }
}
// Round tanks in the broad plaza: genuine circular footprints, not invisible
// square collision boxes. Existing route and device sites stay available.
for (const [x, z, r, h] of [
  [-5.5, -9, 0.75, 1.25],
  [6, -9, 0.75, 2.1],
  [-4, -12.5, 0.7, 1.25],
  [8, -13, 0.7, 2.1],
  [-8, -18, 0.75, 1.25],
  [5, -18.5, 0.7, 1.25],
]) {
  const w = lanes.walls.find(
    (w) => w.kind === "cover" && w.x === x && w.z === z,
  );
  if (w)
    Object.assign(w, {
      shape: "cylinder",
      w: r * 2,
      d: r * 2,
      h,
      kind: "tank",
    });
}
// Stable, irregular set dressing: the same cover layout in every client/room.
// Attached pieces leave no rear slit; freestanding props keep 1 m clearance.
const detailedLaneCover = [];
const footprintGap = (a, b) => {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2),
    dz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
  if (b.shape === "cylinder") {
    const x = Math.max(0, Math.abs(a.x - b.x) - a.w / 2),
      z = Math.max(0, Math.abs(a.z - b.z) - a.d / 2);
    return Math.max(0, Math.hypot(x, z) - b.w / 2);
  }
  return Math.hypot(dx, dz);
};
function addLaneProp(p, attached = false) {
  if (
    [
      lanes.spawns.attacker,
      lanes.spawns.defender,
      lanes.objective,
      ...TERMINALS.lanes,
    ].some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 3.4)
  )
    return;
  if (
    lanes.routeProfiles.some(
      (r) => Math.hypot(p.x - r.low.x, p.z - r.low.z) < 1.25,
    )
  )
    return;
  if (
    lanes.passages.some(
      (b) =>
        Math.abs(p.x - b.x) < (p.w + b.w) / 2 + 0.8 &&
        Math.abs(p.z - b.z) < (p.d + b.d) / 2 + 0.8,
    )
  )
    return;
  let anchored = false;
  for (const b of lanes.walls.filter((w) => !w.bottom)) {
    const dx = Math.abs(p.x - b.x) - (p.w + b.w) / 2,
      dz = Math.abs(p.z - b.z) - (p.d + b.d) / 2;
    if (
      attached &&
      ["building", "wall", "platform", "seam"].includes(b.kind) &&
      ((Math.abs(dx) < 0.001 && dz < -0.1) ||
        (Math.abs(dz) < 0.001 && dx < -0.1))
    ) {
      anchored = true;
      continue;
    }
    // Low step/ledge lips still need readable gaps at ground level.
    if (footprintGap(p, b) < 1.05) return;
  }
  if (attached && !anchored) return;
  p.laneDetail = true;
  lanes.walls.push(p);
  detailedLaneCover.push(p);
}
let propIndex = 0;
for (const [x, zs, edge] of [
  [-15.75, [-4.8, -1.5, 4.8, 9.5, 16.5], "left"],
  [-12.25, [-3, 6, 12, 17.5], "right"],
  [-4.25, [1, 5, 10, 16.5], "left"],
  [-1.75, [2, 6, 10], "right"],
  [4.25, [0, 5, 9, 14, 17], "right"],
  [1.75, [3, 7, 10], "left"],
  [9.25, [3, 7, 17], "left"],
  [12.25, [0, 7, 12], "right"],
])
  for (const z of zs) {
    const type = propIndex++ % 3,
      wide = type === 2 ? 0.75 : 0.5,
      p = {
        x: x + ((edge === "left" ? 1 : -1) * (wide - 0.5)) / 2,
        z,
        w: wide,
        d: type === 1 ? 1.8 : 1.1,
        h: type === 0 ? 1.35 : type === 1 ? 1.1 : 0.8,
        kind: type === 2 ? "platform" : "cover",
        style: type === 0 ? "crate" : type === 1 ? "halfwall" : "ledge",
      };
    addLaneProp(p, true);
  }
// Seeded jitter and shuffled placement avoid a regular grid of identical boxes.
let propSeed = 9173;
const propRandom = () => {
  propSeed = (Math.imul(propSeed, 1664525) + 1013904223) >>> 0;
  return propSeed / 4294967296;
};
const plazaCandidates = [];
for (let z = -25; z <= -7; z += 2.6)
  for (let x = -17; x <= 17; x += 2.6)
    plazaCandidates.push({
      x: x + (propRandom() - 0.5) * 1.1,
      z: z + (propRandom() - 0.5) * 1.1,
      order: propRandom(),
    });
plazaCandidates.sort((a, b) => a.order - b.order);
for (const spot of plazaCandidates) {
  const type = Math.floor(propRandom() * 4),
    horizontal = propRandom() > 0.5;
  addLaneProp({
    x: spot.x,
    z: spot.z,
    w: type === 1 ? (horizontal ? 2 : 0.3) : type === 2 ? 1.6 : 1.1,
    d: type === 1 ? (horizontal ? 0.3 : 2) : type === 2 ? 1 : 1.1,
    h: type === 0 ? 1.05 : type === 1 ? 1.1 : type === 2 ? 0.8 : 1.75,
    kind: type === 2 ? "platform" : "cover",
    style: type === 1 ? "halfwall" : type === 2 ? "ledge" : "crate",
  });
  if (detailedLaneCover.length >= 36) break;
}
// Half walls on raised routes provide cover at the elevation people use.
for (const [x, z, base, w] of [
  [1.35, 11, 2, 0.3],
  [1.35, 8, 2, 0.3],
  [1.35, 2, 2, 0.3],
  [16.25, 12, 2.4, 0.5],
  [16.25, 8, 2.4, 0.5],
  [16.25, 4, 2.4, 0.5],
  [16.25, -2, 2.4, 0.5],
]) {
  const p = {
    x,
    z,
    w,
    d: 1.2,
    bottom: base,
    h: base + 1.1,
    kind: "cover",
    style: "halfwall",
    laneDetail: true,
  };
  const obstacles = lanes.walls.filter(
    (b) => b.h > base + 0.01 && (b.bottom || 0) < p.h,
  );
  if (
    obstacles.some((b) => {
      const dx = Math.abs(p.x - b.x) - (p.w + b.w) / 2,
        dz = Math.abs(p.z - b.z) - (p.d + b.d) / 2;
      if (
        ["building", "wall"].includes(b.kind) &&
        Math.abs(dx) < 0.001 &&
        dz < -0.1
      )
        return false;
      return footprintGap(p, b) < 1.05;
    })
  )
    continue;
  lanes.walls.push(p);
  detailedLaneCover.push(p);
}
lanes.detailCoverCount = detailedLaneCover.length;

// Seal remaining narrow seams, including platform-to-wall slits. Only fill
// the actual shared span and to the lower surface's height, so no new tall
// blockers appear above a terrace. Roof openings and stairs are excluded.
for (let pass = 0; pass < 6; pass++) {
  const solids = lanes.walls.filter(
    (w) => !w.bottom && w.kind !== "stairs" && w.shape !== "cylinder",
  );
  const fills = [];
  for (let i = 0; i < solids.length; i++)
    for (const b of solids.slice(i + 1)) {
      const a = solids[i];
      for (const axis of ["x", "z"]) {
        const gap = gapBetween(a, b, axis);
        if (gap === null) continue;
        const size = axis === "x" ? "w" : "d",
          other = axis === "x" ? "z" : "x",
          span = axis === "x" ? "d" : "w",
          lo = Math.max(a[other] - a[span] / 2, b[other] - b[span] / 2),
          hi = Math.min(a[other] + a[span] / 2, b[other] + b[span] / 2),
          left = a[axis] < b[axis] ? a : b,
          right = left === a ? b : a;
        const fill = {
          x: 0,
          z: 0,
          w: 0,
          d: 0,
          h: Math.min(a.h, b.h),
          kind: "seam",
        };
        fill[axis] =
          (left[axis] + left[size] / 2 + right[axis] - right[size] / 2) / 2;
        fill[size] = gap;
        fill[other] = (lo + hi) / 2;
        fill[span] = hi - lo;
        if (
          !lanes.walls.some(
            (w) =>
              !w.bottom &&
              w.h >= fill.h &&
              Math.abs(w.x - fill.x) + fill.w / 2 <= w.w / 2 + 0.001 &&
              Math.abs(w.z - fill.z) + fill.d / 2 <= w.d / 2 + 0.001,
          )
        )
          fills.push(fill);
      }
    }
  if (!fills.length) break;
  lanes.walls.push(...fills);
}

// Pier 9-style lanes on the older maps. The infiltrators start in a bunker
// across the south edge with a glass door per lane; solid lane walls, each
// with one connector to the next lane, run from it toward the plaza; and
// three data terminals replace the flag, one where each side lane ends and
// one in the middle. Runs after the cover passes, so it clears what they put
// in the bunker, in front of its doors, against a lane wall or on a terminal.
function dedicatedLanes(map, { depth = 5, doors, dividers, terminals, route }) {
  const size = map.size || { x: 18.5, z: 26.5 },
    x0 = -size.x + 0.25,
    x1 = size.x - 0.25,
    z1 = size.z - 0.25,
    z0 = z1 - depth,
    // The front wall's outer face.
    front = z0 - 0.25,
    table = { w: 1.8, d: (1.8 * size.z) / size.x },
    locker = (x) => ({
      x,
      z: z1 - 0.3,
      w: size.x * 0.23,
      d: 0.6,
      h: 2.2,
      kind: "building",
      style: "locker",
    }),
    crate = (x) => ({
      x,
      z: z0 + 0.6,
      w: 1.2,
      d: 1.2,
      h: 1.1,
      kind: "cover",
      style: "crate",
    });
  const room = spawnRoom({
    x0,
    x1,
    z0,
    z1,
    pillarEvery: 4,
    glassShare: 2 / 3,
    doors: doors.map((d, i) => ({
      width: 3,
      color: ["#e8a33c", "#3fa7d6", "#b07cf0", "#4ccf7f"][
        doors.length === 3 && i === 2 ? 3 : i
      ],
      ...d,
    })),
    props: [
      ...[-0.8, -0.35, 0.35, 0.8].map((f) => locker(f * size.x)),
      {
        x: 0,
        z: z1 - table.d / 2,
        ...table,
        h: 0.95,
        kind: "cover",
        style: "maptable",
      },
      // In the front corners, flush with the walls: no slits behind them.
      crate(x0 + 0.6),
      crate(x1 - 0.6),
    ],
  });
  // Lane walls: solid from `z[0]` to `z[1]` but for the connector `gaps`.
  const solids = [];
  for (const { x, z, gaps = [], t = 0.6, h = 6 } of dividers) {
    let at = z[0];
    for (const [a, b] of [...gaps, [z[1], z[1]]]) {
      if (a - at > 0.05) solids.push(building(x, (at + a) / 2, t, a - at, h));
      at = b;
    }
  }
  const consoles = terminals.map((t) => ({
      x: t.x,
      z: t.z,
      w: 1,
      d: 0.7,
      h: 1.2,
      kind: "terminal",
      hidden: true,
    })),
    near = (w, b, pad = 0) =>
      Math.abs(w.x - b.x) < (w.w + b.w) / 2 + pad &&
      Math.abs(w.z - b.z) < (w.d + b.d) / 2 + pad,
    bunker = { x: 0, z: (front + z1) / 2, w: x1 - x0, d: z1 - front },
    doorways = doors.map((d) => ({ x: d.x, z: front - 1, w: 4, d: 2 })),
    loose = (w) =>
      ["cover", "tank", "seam"].includes(w.kind) ||
      w.stealthCover ||
      w.laneDetail;
  const kept = [];
  for (const w of map.walls) {
    if (w.kind === "wall") {
      kept.push(w);
      continue;
    }
    if (near(w, bunker, 1)) {
      // Long lane blocks that reach the bunker stop at its front wall.
      if (w.z > front - 1.5 || w.bottom) continue;
      const north = w.z - w.d / 2,
        south = Math.min(w.z + w.d / 2, front);
      Object.assign(w, { z: (north + south) / 2, d: south - north });
    }
    // Clear the way out of each door, but never a lane block beside it.
    if (w.w * w.d < 12 && doorways.some((d) => near(w, d))) continue;
    if (
      loose(w) &&
      (solids.some((b) => near(w, b, 0.7)) ||
        consoles.some((b) => near(w, b, 1.6)))
    )
      continue;
    kept.push(w);
  }
  map.walls = [...kept, ...solids, ...room.walls, ...consoles];
  map.passages = (map.passages || []).filter((p) => !near(p, bunker, 0.5));
  map.spawnRoom = room;
  // Facing the door nearest the middle (The Quad's middle is a lane block).
  const [ahead] = [...doors].sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  map.spawns.attacker = { x: ahead.x, z: z0 + 1.5 };
  map.buyLines.attacker = z0 - 4;
  map.terminals = terminals.map((t) => ({
    name: `Terminal ${t.id}`,
    yaw: 0,
    ...t,
  }));
  // The bot leaves by the door nearest its route's first point.
  map.botRoute = route.map((p) => ({ ...p, radius: 0.12 }));
}
dedicatedLanes(MAPS.compound, {
  doors: [
    { name: "Left", x: -14, to: { x: -14, z: 8 } },
    { name: "Centre", x: 2, to: { x: 2, z: 4 } },
    { name: "Right", x: 14, to: { x: 14, z: 8 } },
  ],
  dividers: [
    // The warehouse's east wall (its cut is the Left | Centre connector),
    // carried on to the bunker.
    { x: -6, z: [16, front(MAPS.compound)], h: 3.8 },
    // Centre | Right: one gap mid-map.
    { x: 10, z: [-2, front(MAPS.compound)], gaps: [[3, 6]], h: 4.5 },
  ],
  terminals: TERMINALS.compound,
  route: [
    { x: 3.7, z: 18 },
    { x: 3.7, z: 5 },
    { x: 1.2, z: 5 },
    { x: 1.2, z: 2 },
    { x: 3.7, z: 2 },
    { x: 3.7, z: -6 },
  ],
});
// The lane blocks are in the map itself; the connectors are the west
// hallway (z 3–4.6) and the east hallway (z 6–7.6).
dedicatedLanes(MAPS.lanes, {
  doors: [
    { name: "Left", x: -14.25, to: { x: -14, z: 8 } },
    { name: "Centre", x: 0, to: { x: 0, z: 6 } },
    { name: "Right", x: 11, to: { x: 11, z: 8 } },
  ],
  dividers: [],
  terminals: TERMINALS.lanes,
  route: [
    { x: 3.9, z: 18 },
    { x: 3.9, z: 4 },
    { x: 2, z: 4 },
    { x: 2, z: 1.9 },
    { x: 3.9, z: 1.9 },
    { x: 3.9, z: -6 },
  ],
});
// Four lanes, a door each; the two inner ones share Terminal B. Connectors:
// the A–B and C–D tunnels and the shortcut between the inner lanes.
dedicatedLanes(MAPS.quad, {
  doors: [
    { name: "Left", x: -14, to: { x: -14, z: 8 } },
    { name: "Inner left", x: -5, to: { x: -5, z: 6 } },
    { name: "Inner right", x: 5, to: { x: 5, z: 10 } },
    { name: "Right", x: 14, to: { x: 14, z: 6 } },
  ],
  dividers: [],
  terminals: TERMINALS.quad,
  route: [
    { x: 5.6, z: 19 },
    { x: 5.6, z: 6.5 },
    { x: 3.8, z: 6.5 },
    { x: 3.8, z: 4.1 },
    { x: 6.2, z: 4.1 },
    { x: 6.2, z: -6 },
  ],
});
// West gallery and flank, courtyard, east gallery and flank, split by tall
// walls with one gap each beside the altar.
dedicatedLanes(MAPS.monolith, {
  depth: 6.75,
  doors: [
    { name: "Left", x: -17.5, to: { x: -19.5, z: 8 } },
    { name: "Centre", x: 0, to: { x: 0, z: 6 } },
    { name: "Right", x: 17.5, to: { x: 19.5, z: 8 } },
  ],
  dividers: [-9.2, 9.2].map((x) => ({
    x,
    z: [-14, front(MAPS.monolith, 6.75)],
    gaps: [[-2, 1]],
    h: 7,
  })),
  terminals: TERMINALS.monolith,
  route: [
    { x: 5.8, z: 27 },
    { x: 5.8, z: -3 },
    { x: 3, z: -8 },
    { x: 3, z: -18 },
  ],
});
// Vents through The Monolith's lane walls, cut once dedicatedLanes builds them.
vent(MAPS.monolith, "WEST WALL VENT", -9.2, 6, 2.4);
vent(MAPS.monolith, "EAST WALL VENT", 9.2, -6, 2.4);
// Plant & defend on the older maps: like Pier 9, the mode leaves out the
// middle Terminal B (the sentinels' nearest), and A and C become sites in
// their own right. Each gets a wall on its middle side with a side door
// from the plaza, a back wall toward the sentinels with a back gap for a
// retake, and a 1.6 m lookout over the terminal for holding a planted
// uplink; its lane's mouth is the main way in. Loose cover in the way of a
// new piece goes, so nothing leaves a slit behind it.
function plantSites(map, { pieces, keep = () => false, sites }) {
  const near = (w, p, pad) =>
      Math.abs(w.x - p.x) < (w.w + p.w) / 2 + pad &&
      Math.abs(w.z - p.z) < (w.d + p.d) / 2 + pad,
    loose = (w) =>
      ["cover", "tank"].includes(w.kind) || w.stealthCover || w.laneDetail;
  map.walls = map.walls.filter(
    (w) => keep(w) || !loose(w) || !pieces.some((p) => near(w, p, 0.7)),
  );
  map.walls.push(...pieces.map((p) => ({ ...p, plantSite: true })));
  map.plantDrops = ["B"];
  map.approaches.push(["Sites", sites]);
}
// A site wall along z at `x` (from z0 to z1) or across x at `z` (from x0
// to x1), solid but for the open `gaps`.
const siteWall = (axis, at, from, to, gaps = [], h = 4.5, t = 0.4) => {
  const out = [];
  let a = from;
  for (const [g0, g1] of [...gaps, [to, to]]) {
    if (g0 - a > 0.05)
      out.push(
        axis === "z"
          ? building(at, (a + g0) / 2, t, g0 - a, h)
          : building((a + g0) / 2, at, g0 - a, t, h),
      );
    a = g1;
  }
  return out;
};
// A 1.6 m lookout against the back wall, its stairs down the whole of the
// south face (no slit beside them).
const siteLookout = (x0, x1, z0, z1) => [
  platform((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 1.6),
  ...stairs((x0 + x1) / 2, z1 + 0.3, 1.6, { w: x1 - x0, dz: 1 }),
];
const siteCrate = (x, z, h = 1.1) => ({
  ...cover(x, z, 1.4, 1.4, h),
  style: "crate",
});
// The Lanes and The Quad share a plaza: A at its west end, C at its east,
// each beside a container. Walls stand 0.3 m clear of the containers'
// corridors and meet the lane blocks at z -6. The plaza pieces on the
// walls' lines (a tank on The Lanes, a crate on The Quad) step inside.
for (const id of ["lanes", "quad"]) {
  for (const w of MAPS[id].walls) {
    if (w.x === -8 && w.z === -18) Object.assign(w, { x: -6.5, z: -18.6 });
    if (w.x === 8 && w.z === -13) Object.assign(w, { x: 6.5, z: -15.2 });
  }
  plantSites(MAPS[id], {
    pieces: [
      // Site A: side door mid-site, back gap at the north-east corner.
      ...siteWall("z", -8.5, -20.2, -6, [[-11, -8.5]]),
      ...siteWall("x", -20, -18.5, -11.5),
      ...siteLookout(-18.5, -14.8, -19.8, -16.8),
      siteCrate(-11, -7.8),
      // Site C, mirrored.
      ...siteWall("z", 8.5, -20.2, -6, [[-11, -8.5]]),
      ...siteWall("x", -20, 11.5, 18.5),
      ...siteLookout(15, 18.5, -19.8, -16.8),
      siteCrate(11, -7.8),
    ],
    sites:
      "plant mode keeps A and C, walled sites where the side lanes meet the plaza: a side door from the plaza, a back gap toward the sentinels and a 1.6 m lookout over each terminal.",
  });
}
// The Compound: site A is the yard north of the warehouse (its north door
// is the main way in), walled along the warehouse's east wall line. Site C
// already has its north wall, back gap and 2.4 m overlook; a wall from the
// yard's crates to its west wall leaves one side door. The courtyard's
// north screen reaches west to meet site A's wall (no slit between).
Object.assign(
  MAPS.compound.walls.find(
    (w) => w.kind === "building" && w.x === -1 && w.z === -6.8,
  ),
  { x: -1.4, w: 8.8 },
);
plantSites(MAPS.compound, {
  pieces: [
    ...siteWall("z", -6, -18.2, -3.7, [[-12.5, -10]]),
    ...siteWall("x", -18, -18.5, -5.8, [[-12, -9]]),
    ...siteLookout(-18.5, -14.8, -17.8, -14.8),
    ...siteWall("z", 6, -12.5, -8.5, [], 3.8, 1),
  ],
  // The crates at the right lane's mouth carry the new wall on.
  keep: (w) => w.kind === "cover" && w.x === 8 && w.z === -7,
  sites:
    "plant mode keeps A and C. A: out of the warehouse's north door, a side door from the courtyard and a back gap; a 1.6 m lookout over the terminal. C: up from the service yard, a side door and a back gap; the 2.4 m overlook holds it.",
});
// The Monolith's A and C are already sites: the lane in front, the
// courtyard beside, the defender plaza behind, and each gallery's end
// overlooking its terminal. They gain a crate beside each terminal.
plantSites(MAPS.monolith, {
  pieces: [siteCrate(-10.8, -17), siteCrate(10.8, -17)],
  sites:
    "plant mode keeps A and C: each between a gallery's end and the tower wing, reached from its lane, the courtyard or the defender plaza; the gallery overlooks the terminal.",
});
// Where a map's spawn bunker's front wall will stand (see dedicatedLanes).
function front(map, depth = 5) {
  return (map.size || { z: 26.5 }).z - 0.25 - depth - 0.25;
}
// Railings line every high edge (a fall of RAIL_FROM m or more) that isn't
// already met by stairs, a ramp, a wall or a parapet, so high ground reads
// as one guarded shelf instead of loose fragments. They're too tall to vault
// down from, so each long run keeps a drop gap (marked on the floor) about
// every DROP_EVERY m: you come down there or by the stairs, nowhere else.
const RAIL_FROM = 1.6,
  DROP_EVERY = 8,
  DROP_GAP = 1.4;
function railEdges(map) {
  const solids = map.walls.filter(
    (w) => !w.railing && !w.soft && w.kind !== "gate",
  );
  // The highest top at (x, z) standing no higher than `floor`.
  const topAt = (x, z, floor) => {
    let top = 0;
    for (const w of solids) {
      if ((w.bottom || 0) > floor + 0.1) continue;
      const inside =
        w.shape === "cylinder"
          ? Math.hypot(x - w.x, z - w.z) < w.w / 2
          : Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2;
      if (inside) top = Math.max(top, w.h);
    }
    return top;
  };
  // Whether a drop at `u` lands on level, open floor (not onto a crate),
  // a body's width across.
  const clearLanding = (at, u) => {
    const tops = [];
    for (const v of [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45])
      for (const out of [0.3, 0.7, 1.1]) tops.push(topAt(...at(u + v, out), 0));
    return Math.max(...tops) - Math.min(...tops) < 0.3;
  };
  // Nearest first: 0, +0.1, -0.1, +0.2...
  const shifts = Array.from({ length: 51 }, (_, i) =>
    i % 2 ? (i + 1) / 20 : -i / 20,
  );
  const rails = [];
  map.drops = [];
  for (const p of solids.filter(
    (w) => w.kind === "platform" && !w.bottom && w.h >= RAIL_FROM,
  )) {
    const sides = [];
    for (const [nx, nz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const alongX = nz !== 0,
        edge = alongX ? p.z + (nz * p.d) / 2 : p.x + (nx * p.w) / 2,
        from = alongX ? p.x - p.w / 2 : p.z - p.d / 2,
        length = alongX ? p.w : p.d,
        at = (u, out) =>
          alongX ? [from + u, edge + nz * out] : [edge + nx * out, from + u];
      // Open drop along the edge, sampled every 10 cm. (A slot too narrow
      // to land in, against a wall just beyond, isn't one.)
      const runs = [],
        low = (u, out) => topAt(...at(u, out), p.h) < p.h - 0.45;
      for (let u = 0.05; u < length; u += 0.1) {
        const open =
          Math.abs(topAt(...at(u, -0.2), p.h) - p.h) < 0.05 &&
          low(u, 0.2) &&
          low(u, 0.9);
        const last = runs.at(-1);
        if (open && last && u - last[1] < 0.15) last[1] = u;
        else if (open) runs.push([u, u]);
      }
      sides.push({ runs, at, alongX, length });
    }
    // Every platform keeps a way down besides its stairs: a short run gets
    // a gap only if no other edge of this platform has one.
    const span = ([u0, u1]) => u1 - u0;
    let dropped = sides.some((s) => s.runs.some((r) => span(r) > 6));
    const longest = sides
      .flatMap((s) => s.runs)
      .reduce((a, r) => (!a || span(r) > span(a) ? r : a), null);
    for (const { runs, at, alongX, length } of sides)
      for (const run of runs) {
        const a = Math.max(0, run[0] - 0.05),
          b = Math.min(length, run[1] + 0.05),
          gaps =
            b - a > 6
              ? Math.max(1, Math.floor((b - a) / DROP_EVERY))
              : !dropped && run === longest && b - a >= 2.5
                ? 1
                : 0,
          cuts = [a];
        for (let i = 1; i <= gaps; i++) {
          const ideal = a + ((b - a) * i) / (gaps + 1),
            reach = Math.min((b - a) / (gaps + 1) / 2, 2.5) - DROP_GAP / 2,
            mid =
              shifts
                .filter((s) => Math.abs(s) <= reach)
                .map((s) => ideal + s)
                .find((u) => clearLanding(at, u)) ?? ideal;
          cuts.push(mid - DROP_GAP / 2, mid + DROP_GAP / 2);
          const [x, z] = at(mid, -0.3);
          map.drops.push({ x, z, axis: alongX ? "x" : "z", h: p.h });
        }
        cuts.push(b);
        for (let i = 0; i < cuts.length; i += 2) {
          if (cuts[i + 1] - cuts[i] < 0.5) continue;
          const [x0, z0] = at(cuts[i], -0.04),
            [x1, z1] = at(cuts[i + 1], -0.04);
          rails.push(railing(x0, z0, x1, z1, p.h));
        }
      }
  }
  map.walls.push(...rails);
}
// A see-through railing from (x0, z0) to (x1, z1), along x or z, standing
// `h` m on a floor `base` m up. It stops you and shots, not sight; the
// renderer draws its posts and rails.
function railing(x0, z0, x1, z1, base = 0, h = 1) {
  return {
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    w: Math.max(Math.abs(x1 - x0), 0.08),
    d: Math.max(Math.abs(z1 - z0), 0.08),
    h: base + h,
    ...(base && { bottom: base }),
    kind: "cover",
    see: true,
    hidden: true,
    railing: true,
  };
}
for (const map of Object.values(MAPS)) railEdges(map);
// The attacker bot's routes: via points following its main approach, then one through
// each route profile's low ground (plus The Monolith's flank corridors).
// Profile routes are via points; the bot paths between them around walls.
MAPS.monolith.botVias = [
  {
    name: "West flank",
    vias: [
      { x: -24.5, z: 20 },
      { x: -24.5, z: -20 },
    ],
  },
  {
    name: "East flank",
    vias: [
      { x: 24.5, z: 20 },
      { x: 24.5, z: -20 },
    ],
  },
];
for (const map of Object.values(MAPS)) {
  map.approaches.push([
    "Covered cuts & hiding bays",
    map.passages
      .filter((p) => !p.bay)
      .map((p) => p.name.toLowerCase())
      .join(", ") +
      ". Use the dashed minimap openings to change routes; duck behind the new cover chains in the plaza.",
  ]);
}
for (const map of Object.values(MAPS))
  map.botRoutes = [
    { name: "Main route", vias: map.botRoute },
    ...map.routeProfiles.map((r) => ({ name: r.name, vias: [r.low] })),
    ...(map.botVias || []),
  ];
// Spawns sit just behind a spawn screen, so facing straight ahead shows
// only that wall. Turn the least from `forward` (toward the enemy side) that
// gives a 10 m standing view past the screen (turning left on a tie).
// Uses the active WALLS, so call it once the map's walls are live.
function spawnYaw(p, forward) {
  const view = (yaw) => {
    let d = 0;
    while (
      d < 10 &&
      clearSight(
        { x: p.x, y: 1.65, z: p.z },
        {
          x: p.x - Math.sin(yaw) * (d + 0.5),
          y: 1.65,
          z: p.z - Math.cos(yaw) * (d + 0.5),
        },
      )
    )
      d += 0.5;
    return d;
  };
  for (let turn = 0; turn <= Math.PI / 2; turn += Math.PI / 36) {
    const open = [forward + turn, forward - turn].find(
      (yaw) => view(yaw) >= 10,
    );
    if (open !== undefined) return open;
  }
  return forward;
}
// Hot Potato's court (shared/party.js): 16 × 24 m, mirror-symmetric about
// the centre line (z = 0), with two low crates a side to bounce grenades
// off. Added after the shared map passes above, which dress the big maps.
// Not on the map list: the game picks it itself.
MAPS.court = {
  name: "The Court",
  tagline: "Hot Potato / two halves and a centre line",
  brief: "Keep your half clear.",
  approaches: [],
  court: true,
  handPlaced: true,
  size: { x: 8, z: 12 },
  walls: [
    wall(-8.5, 0, 1, 26),
    wall(8.5, 0, 1, 26),
    wall(0, 12.5, 18, 1),
    wall(0, -12.5, 18, 1),
    // A high lob mustn't sail out over the walls.
    barrier(-8.5, 0, 1, 26),
    barrier(8.5, 0, 1, 26),
    barrier(0, 12.5, 18, 1),
    barrier(0, -12.5, 18, 1),
    ...[-1, 1].flatMap((side) => [
      cover(-4, 6 * side, 1.2, 1.2, 0.9),
      cover(4, 6 * side, 1.2, 1.2, 0.9),
    ]),
  ],
  spawns: { attacker: { x: 0, z: 10.5 }, defender: { x: 0, z: -10.5 } },
  spawnYaw: { attacker: 0, defender: Math.PI },
  objective: { x: 0, z: 0 },
  // Before the round each side keeps to its own half.
  buyLines: { attacker: 0.35, defender: -0.35 },
  region: (x, z) => (z >= 0 ? "south half" : "north half"),
  botRoute: [],
  botRoutes: [],
  botSpots: {},
  routeProfiles: [],
  passages: [],
};
// Beach Ball Dodge uses a square float in a pool, with a deck for the throwing bots.
MAPS.crucible = {
  name: "Pool Party",
  tagline: "Beach Ball Dodge / pool party",
  brief: "Dodge the beach balls. Stay on the float!",
  approaches: [],
  court: true,
  handPlaced: true,
  livewire: true,
  size: { x: ARENA + 0.5, z: ARENA + 0.5 },
  walls: [
    { ...platform(0, 0, PLAT * 2, PLAT * 2, PLAT_H), hidden: true },
    wall(-ARENA - 0.5, 0, 1, ARENA * 2 + 2, 0.05),
    wall(ARENA + 0.5, 0, 1, ARENA * 2 + 2, 0.05),
    wall(0, ARENA + 0.5, ARENA * 2 + 2, 1, 0.05),
    wall(0, -ARENA - 0.5, ARENA * 2 + 2, 1, 0.05),
  ],
  spawns: { attacker: { x: -1.1, z: 0.8 }, defender: { x: 1.1, z: 0.8 } },
  spawnYaw: { attacker: 0, defender: 0 },
  objective: { x: 0, z: 0 },
  // No lines to keep behind: both start on the platform.
  buyLines: { attacker: -100, defender: 100 },
  region: () => "pool float",
  botRoute: [],
  botRoutes: [],
  botSpots: {},
  routeProfiles: [],
  passages: [],
};
MAPS.yard = {
  name: "Sprinkler Yard",
  tagline: "Sprinkler Dodge / stay dry",
  brief: "Dodge the marked spray zones!",
  court: true,
  handPlaced: true,
  sprinklers: true,
  approaches: [],
  size: { x: 5.5, z: 5.5 },
  walls: [
    { ...wall(-6, 0, 1, 13, 1.3), style: "hedge", color: "#438c45" },
    { ...wall(6, 0, 1, 13, 1.3), style: "hedge", color: "#438c45" },
    { ...wall(0, -6, 11, 0.2, 1.2), style: "picketFence", color: "#fff4dc" },
    { ...wall(0, 6, 11, 0.2, 1.2), style: "picketFence", color: "#fff4dc" },
  ],
  spawns: { attacker: { x: -2, z: 3 }, defender: { x: 2, z: 3 } },
  spawnYaw: { attacker: 0, defender: 0 },
  objective: { x: 0, z: 0 },
  buyLines: { attacker: -100, defender: 100 },
  region: () => "backyard lawn",
  botRoute: [],
  botRoutes: [],
  botSpots: {},
  routeProfiles: [],
  passages: [],
};
export const DEFAULT_MAP = "compound";
// The infiltration maps (not Hot Potato's court or Livewire's arena).
export const mapIds = Object.keys(MAPS).filter((id) => !MAPS[id].court);
// Maps players can pick right now. The others stay built and tested; add
// their ids back here to offer them again.
export const ENABLED_MAPS = [
  "docks",
  "relay",
  "compound",
  "lanes",
  "quad",
  "monolith",
];
let active = null;
export const activeMap = () => MAPS[active];

// Before the round, how far each side may go (a z line): infiltrators stay
// in staging; sentinels behind their own line while buying, then (setting
// up) anywhere at least prepGap short of the staging gate. Null once the
// round is on.
export function preRoundLine(map, team, phase) {
  if (phase === "purchase") return map.buyLines[team];
  if (phase !== "prep") return null;
  // A spawn room's doors hold its infiltrators instead of a line.
  if (team === "attacker") return map.spawnRoom ? null : map.buyLines.attacker;
  // A spawn room's exits hold them instead (see Match.offLimits).
  return map.spawnRoom ? null : map.buyLines.attacker - CONFIG.prepGap;
}
// The staging gate: wall to wall, tall enough that no sightline passes
// over it, just north of the staging line. Solid only before the round.
export function stagingGate(map) {
  const width = (map.size?.x || 18.5) * 2 + 2;
  return {
    x: 0,
    z: map.buyLines.attacker - 0.5,
    w: width,
    d: 0.3,
    h: 14,
    kind: "gate",
  };
}
// Make `id` the map that collision, sight, throwing and drawing use.
export function useMap(id) {
  const next = MAPS[id] ? id : DEFAULT_MAP;
  if (next === active) return MAPS[active];
  active = next;
  const map = MAPS[active];
  WALLS.splice(0, WALLS.length, ...map.walls);
  Object.assign(BOUNDS, map.size || { x: 18.5, z: 26.5 });
  // A spawn room faces you at its centre door (it's shut while you buy).
  map.spawnYaw ||= {
    attacker: map.spawnRoom ? 0 : spawnYaw(map.spawns.attacker, 0),
    defender: spawnYaw(map.spawns.defender, Math.PI),
  };
  Object.assign(SPAWNS.attacker, map.spawns.attacker, {
    yaw: map.spawnYaw.attacker,
  });
  Object.assign(SPAWNS.defender, map.spawns.defender, {
    yaw: map.spawnYaw.defender,
  });
  Object.assign(OBJECTIVE, map.objective);
  useObjectives();
  return map;
}
// Fill OBJECTIVES for the active map and objective mode: plant & defend
// leaves out the map's plantDrops. Matches on one server share OBJECTIVES,
// so each sets it again whenever it runs.
export function useObjectives(mode = "extract") {
  const map = MAPS[active],
    drop = mode === "plant" ? map.plantDrops || [] : [];
  OBJECTIVES.splice(
    0,
    OBJECTIVES.length,
    ...(map.terminals
      ?.filter((t) => !drop.includes(t.id))
      .map((t) => ({ ...t, terminal: true })) || [
      { id: "flag", name: "Flag", ...map.objective },
    ]),
  );
}
// Apply the default map on load, so its spawn screens and spawns are live
// before anything else runs.
useMap(DEFAULT_MAP);
