import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCustomMap,
  validateCustomMap,
  buildCustomMap,
  registerCustomMap,
  PIECE_TYPES,
  partsOf,
  pieceSurface,
  SLIM_INSET,
} from "../shared/customMap.js";
import { slimPart } from "../shared/pieceShapes.js";
import { useMap } from "../shared/maps.js";
import { movePlayer, clearSight, clearShot, STEP } from "../shared/map.js";
import {
  PRESETS,
  CATEGORIES,
  searchLibrary,
  makeGroup,
  placeGroup,
  cleanGroups,
  describeSize,
} from "../shared/pieceCatalog.js";
import { rotatePieces } from "../shared/builderTools.js";
// The expanded piece library: every shape validates, builds and collides as
// drawn; see-through pieces pass sight but not movement or shots; the
// catalog searches; My Pieces groups save and place.

const piece = (preset, x = 0, z = 0, extra = {}) => ({
  t: preset.t,
  x0: x,
  x1: x + preset.w,
  z0: z,
  z1: z + preset.d,
  ...(preset.h !== PIECE_TYPES[preset.t].h ? { h: preset.h } : {}),
  ...(PIECE_TYPES[preset.t].dir ? { dir: "-z" } : {}),
  ...extra,
});
const mapWith = (...pieces) => {
  const d = blankCustomMap("medium");
  d.pieces.push(...pieces);
  const { def, error } = validateCustomMap(d);
  assert.equal(error, undefined);
  return def;
};

test("every preset validates, builds, and lists in a category", () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const p of PRESETS) {
    assert.ok(cats.has(p.cat), p.id);
    const def = mapWith(piece(p, -2, -2));
    const map = buildCustomMap(def);
    assert.ok(
      map.walls.some((w) => w.pieceIndex === 0),
      `${p.id} collides`,
    );
    assert.ok(partsOf(def.pieces[0]).length, p.id);
  }
});

test("a doorway lets players walk through; a window wall does not", () => {
  const door = PRESETS.find((p) => p.id === "wallDoor");
  useMap(registerCustomMap(mapWith(piece(door, -2, 0))));
  const p = { x: 0, z: 2, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 20; i++) movePlayer(p, 0, -0.2);
  assert.ok(p.z < -1, `walked through the doorway to ${p.z}`);
  const side = { x: -1.5, z: 2, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 20; i++) movePlayer(side, 0, -0.2);
  assert.ok(side.z > 0, "the wall beside the door still blocks");
  const windows = PRESETS.find((p) => p.id === "wallWindow");
  useMap(registerCustomMap(mapWith(piece(windows, -3, 0))));
  const q = { x: -1.5, z: 2, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 20; i++) movePlayer(q, 0, -0.2);
  assert.ok(q.z > 0);
  // ...but you can see (and shoot) through the window opening.
  const eye = (z) => ({ x: -1.5, y: 1.6, z });
  assert.ok(clearSight(eye(2), eye(-2)));
  assert.ok(!clearSight({ ...eye(2), y: 0.5 }, { ...eye(-2), y: 0.5 }));
  useMap("compound");
});

test("fences, gates and railings pass sight but block movement and shots", () => {
  for (const id of ["fence", "gate", "railing"]) {
    const preset = PRESETS.find((p) => p.id === id);
    const def = mapWith(piece(preset, -3, 0));
    useMap(registerCustomMap(def));
    const a = { x: 0, y: 0.9, z: 2 },
      b = { x: 0, y: 0.9, z: -2 };
    assert.ok(clearSight(a, b), `${id}: seen through`);
    assert.ok(!clearShot(a, b), `${id}: blocks shots`);
    const p = { x: 0, z: 2, y: 0, vy: 0, grounded: true };
    for (let i = 0; i < 20; i++) movePlayer(p, 0, -0.2);
    assert.ok(p.z > 0, `${id}: blocks movement (${p.z})`);
    assert.ok(
      buildCustomMap(def).decor.some((d) => d.pieceIndex === 0),
      `${id}: drawn as decor`,
    );
  }
  useMap("compound");
});

test("stairs climb in steps players can walk; curves and round cover collide on their shape", () => {
  const stairs = PRESETS.find((p) => p.id === "stairs24");
  const def = mapWith(piece(stairs, -1, 0, { dir: "-z" }));
  const steps = partsOf(def.pieces[0]);
  assert.ok(steps.length >= 8);
  const tops = steps.map((s) => s.y1);
  for (let i = 1; i < tops.length; i++)
    assert.ok(tops[i] - tops[i - 1] <= STEP);
  useMap(registerCustomMap(def));
  const p = { x: 0, z: 4.4, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 40; i++) movePlayer(p, 0, -0.15);
  assert.ok(p.y > 2, `climbed to ${p.y}`);
  // Surface placement follows the step under the point.
  assert.equal(pieceSurface(def.pieces[0], 0, 0.2), 2.4);
  assert.ok(pieceSurface(def.pieces[0], 0, 4.3) < 0.5);

  const curve = PRESETS.find((p) => p.id === "wallCurve");
  const c = mapWith(piece(curve, 0, 0, { dir: "-z" })); // bends around (0, 4)
  useMap(registerCustomMap(c));
  // The open corner is free; the arc's far side blocks.
  assert.equal(pieceSurface(c.pieces[0], 0.5, 3.5), 0);
  assert.equal(pieceSurface(c.pieces[0], 4 - 0.25, 4 - 0.05), 4);
  const q = { x: 1, z: 3.5, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 30; i++) movePlayer(q, 0.2, 0);
  assert.ok(q.x < 4, `stopped by the curve at ${q.x}`);

  const round = PRESETS.find((p) => p.id === "coverRound");
  const r = buildCustomMap(mapWith(piece(round, 0, 0)));
  assert.ok(r.walls.some((w) => w.shape === "cylinder" && w.pieceIndex === 0));
  useMap("compound");
});

test("rotating a directional piece turns its shape with it", () => {
  const def = mapWith(
    piece(
      PRESETS.find((p) => p.id === "wallCurve"),
      0,
      0,
      { dir: "-z" },
    ),
  );
  rotatePieces(def, [0]);
  assert.equal(def.pieces[0].dir, "+x");
  assert.ok(validateCustomMap(def).def);
});

test("the catalog searches by name and category and sizes read clearly", () => {
  assert.ok(searchLibrary("door", "all").some((p) => p.id === "wallDoor"));
  assert.ok(searchLibrary("", "fences").every((p) => p.cat === "fences"));
  assert.ok(
    searchLibrary("stairs 4.3", "all").some((p) => p.id === "stairs43"),
  );
  assert.equal(searchLibrary("zzz", "all").length, 0);
  assert.equal(
    describeSize({ t: "wall", w: 4, d: 0.5, h: 4 }),
    "4 × 0.5 m · 4 m tall",
  );
  assert.equal(
    describeSize({ t: "stairs", w: 2, d: 4.5, h: 2.4 }),
    "2 × 4.5 m · rises 2.4 m",
  );
  const mine = [{ id: "g", name: "Sniper nest", pieces: [] }];
  assert.ok(
    searchLibrary("nest", "mine", [
      { ...mine[0], pieces: [{ t: "low", x0: 0, x1: 1, z0: 0, z1: 1 }] },
    ]).length,
  );
});

test("My Pieces groups keep layout, looks and elevation, and place anywhere that fits", () => {
  const def = mapWith(
    {
      t: "plat2",
      x0: 2,
      x1: 6,
      z0: 2,
      z1: 6,
      y: 1,
      color: "#aa3366",
      opacity: 0.5,
    },
    { t: "railing", x0: 2, x1: 6, z0: 2, z1: 2.5, y: 3.4 },
  );
  const group = makeGroup(def.pieces, "Lookout");
  assert.equal(group.name, "Lookout");
  assert.deepEqual(
    group.pieces.map((p) => [p.x0, p.z0, p.y]),
    [
      [0, 0, undefined],
      [0, 0, 2.4],
    ],
  );
  assert.equal(group.pieces[0].opacity, 0.5);
  assert.equal(group.pieces[0].color, "#aa3366");
  assert.ok(group.pieces.every((p) => p.id === undefined));
  assert.deepEqual(cleanGroups(JSON.parse(JSON.stringify([group]))), [group]);
  assert.deepEqual(cleanGroups([{ id: 1 }, null, "x"]), []);

  const placed = placeGroup(def, group, { x: -10, y: 2, z: 10 });
  assert.deepEqual(
    placed.map((p) => [p.x0, p.x1, p.z0, p.y]),
    [
      [-12, -8, 8, 2],
      [-12, -8, 8, 4.4],
    ],
  );
  const turned = placeGroup(def, group, { x: 0, z: 0 }, 1);
  assert.equal(turned[1].x1 - turned[1].x0, 0.5, "the railing turns with it");
  assert.equal(placeGroup(def, group, { x: 99, z: 0 }), null);
  const next = { ...def, pieces: [...def.pieces, ...placed] };
  assert.equal(validateCustomMap(next).error, undefined);
});

// ---- The second batch: openings, doors, glass, hedges, ladders and more. ----
import { Match } from "../server/simulation.js";
import { findClamber } from "../shared/clamber.js";
const one = (p) => {
  const def = mapWith(p);
  useMap(registerCustomMap(def));
  return def;
};
const walker = (x, z, extra = {}) => ({
  x,
  z,
  y: 0,
  vy: 0,
  grounded: true,
  yaw: 0,
  ...extra,
});
const walk = (p, dx, dz, steps = 30) => {
  for (let i = 0; i < steps; i++) movePlayer(p, dx, dz);
  return p;
};
const playing = (def) => {
  const m = new Match("PIECES", true, "seen", true, registerCustomMap(def));
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  return m;
};
const run = (m, input, seconds) => {
  for (let i = 0; i < seconds * 30; i++) {
    m.players.a.input = typeof input === "function" ? input(i) : input;
    m.tick(1 / 30);
  }
};

test("a vault window is climbed through, not walked through; a vent only fits prone", () => {
  one({ t: "wallVault", x0: -2, x1: 2, z0: 5, z1: 5.5 });
  assert.ok(walk(walker(0, 7), 0, -0.2).z > 5.5, "the sill blocks walking");
  const target = findClamber(walker(0, 5.85));
  assert.ok(target && target.z < 5, "hold jump vaults through");

  one({ t: "wallVent", x0: -2, x1: 2, z0: 5, z1: 5.5 });
  assert.ok(walk(walker(0, 7), 0, -0.2).z > 5.5, "standing doesn't fit");
  assert.ok(walk(walker(0, 7, { crouch: true }), 0, -0.2).z > 5.5);
  assert.ok(walk(walker(0, 7, { prone: true }), 0, -0.2).z < 4, "prone does");
  useMap("compound");
});

test("a door shuts out movement and sight until opened with interact, and is heard", () => {
  const def = mapWith({ t: "wallLeaf", x0: -2, x1: 2, z0: 5, z1: 5.5 }),
    m = playing(def),
    a = m.players.a;
  Object.assign(a, { x: 0, z: 7, yaw: 0, pitch: 0 });
  run(m, { forward: 1 }, 1);
  assert.ok(a.z > 5.5, `the shut door stops you (${a.z})`);
  assert.ok(!clearSight({ x: 0, y: 1.5, z: 7 }, { x: 0, y: 1.5, z: 3 }));
  run(m, (i) => (i === 0 ? { interact: true } : {}), 0.2);
  assert.deepEqual(m.snapshot("a").openDoors, [0]);
  assert.ok(m.noises.length, "opening it makes a sound");
  assert.ok(clearSight({ x: 0, y: 1.5, z: 7 }, { x: 0, y: 1.5, z: 3 }));
  run(m, { forward: 1 }, 1.5);
  assert.ok(a.z < 4, `through the open door (${a.z})`);
  // It won't shut on someone standing in it.
  Object.assign(a, { x: 0, z: 5.25, yaw: 0 });
  m.toggleDoor(m.doorNear(a, 1.8, true), a);
  assert.ok(m.openDoors.has(0));
  // Bots open doors they walk into; the checklist plans through doors.
  Object.assign(a, { x: 0, z: 9 });
  m.toggleDoor(m.doorNear({ x: 0, z: 5.6 }, 1.8, true), a);
  assert.ok(!m.openDoors.has(0));
  m.addPlayer("b", "defender", true);
  Object.assign(m.players.b, { x: 0, z: 4.4 });
  m.bot(m.players.b, 1 / 30);
  assert.ok(m.openDoors.has(0), "the bot opened it");
  useMap("compound");
});

test("one-way glass: the named side sees through; nobody walks or shoots through", () => {
  one({ t: "glassInf", x0: -2, x1: 2, z0: 5, z1: 5.5 });
  const a = { x: 0, y: 1.5, z: 7 },
    b = { x: 0, y: 1.5, z: 3 };
  assert.ok(clearSight(a, b, [], "attacker"));
  assert.ok(!clearSight(a, b, [], "defender"));
  assert.ok(!clearSight(a, b));
  assert.ok(!clearShot(a, b));
  assert.ok(walk(walker(0, 7), 0, -0.2).z > 5.5);
  one({ t: "glassSen", x0: -2, x1: 2, z0: 5, z1: 5.5 });
  assert.ok(clearSight(a, b, [], "defender"));
  assert.ok(!clearSight(a, b, [], "attacker"));
  useMap("compound");
});

test("a hedge is walked through but hides what's behind it", () => {
  one({ t: "hedge", x0: -3, x1: 3, z0: 5, z1: 6 });
  assert.ok(walk(walker(0, 7.5), 0, -0.2).z < 4);
  const a = { x: 0, y: 1.2, z: 7.5 },
    b = { x: 0, y: 1.2, z: 3 };
  assert.ok(!clearSight(a, b));
  assert.ok(!clearShot(a, b));
  useMap("compound");
});

test("a ladder is climbed by pushing into it, held between, and stepped off at the top", () => {
  const def = mapWith(
      { t: "wall", x0: -2, x1: 2, z0: 4, z1: 5 },
      { t: "ladder", x0: -0.4, x1: 0.4, z0: 5, z1: 5.5 },
    ),
    m = playing(def),
    a = m.players.a;
  Object.assign(a, { x: 0, z: 6.2, yaw: 0, pitch: 0 });
  run(m, { forward: 1 }, 1);
  const halfway = a.y;
  assert.ok(halfway > 1 && halfway < 4, `climbing (${halfway})`);
  run(m, {}, 0.5);
  assert.ok(
    Math.abs(a.y - halfway) < 0.01,
    "holds on when you let go of forward",
  );
  run(m, { forward: 1 }, 1.1);
  run(m, {}, 0.2);
  assert.ok(a.y >= 3.99 && a.z < 5, `on the wall top (${a.y}, ${a.z})`);
  // Walking past a ladder doesn't grab it.
  Object.assign(a, { x: -1.2, z: 6, y: 0, yaw: Math.PI / 2, grounded: true });
  run(m, { forward: 1 }, 0.5);
  assert.equal(a.y, 0);
  useMap("compound");
});

test("containers, colonnades, catwalks and corner walls collide as drawn", () => {
  one({ t: "container", x0: -3, x1: 3, z0: 4, z1: 6.5 });
  assert.ok(walk(walker(-5, 5.25), 0.2, 0, 50).x > 4, "through the open ends");
  assert.ok(walk(walker(0, 8), 0, -0.2).z > 6.5, "not through its side");

  one({ t: "colonnade", x0: -4, x1: 4, z0: 5, z1: 6 });
  assert.ok(walk(walker(0, 7.5), 0, -0.2).z < 4, "between two columns");
  assert.ok(walk(walker(1.2, 7.5), 0, -0.2).z > 6, "not through one");

  const cat = mapWith({ t: "catwalk", x0: -4, x1: 4, z0: 4, z1: 6, y: 3 });
  useMap(registerCustomMap(cat));
  const deck = walker(0, 5, { y: 3.3 });
  walk(deck, 0.2, 0, 10);
  assert.equal(deck.y, 3.3, "walk along the deck");
  const across = [
    { x: 0, y: 3.9, z: 3 },
    { x: 0, y: 3.9, z: 7 },
  ];
  assert.ok(clearSight(...across), "see over and through its railings");
  assert.ok(!clearShot(...across));

  const l = mapWith({ t: "wallL", x0: 0, x1: 4, z0: 0, z1: 4, dir: "-z" });
  assert.equal(partsOf(l.pieces[0]).length, 2);
  rotatePieces(l, [0]);
  assert.equal(l.pieces[0].dir, "+x");
  useMap(registerCustomMap(l));
  // Turned once, the corner is at the north-west: its arms run along the
  // north and west edges, leaving the south-east open.
  assert.ok(walk(walker(2, 6), 0, -0.2).z < 1, "open on the south");
  assert.ok(walk(walker(2, 2), 0, -0.2).z > 0.5, "the north arm blocks");
  const t = mapWith({ t: "wallT", x0: 0, x1: 6, z0: 0, z1: 4, dir: "-z" });
  assert.equal(partsOf(t.pieces[0]).length, 2);
  useMap("compound");
});

test("the newer pieces play as described: slits, arches, chicanes, pillboxes, towers, daises", () => {
  const at = (id, x, z, extra) =>
    useMap(
      registerCustomMap(
        mapWith(
          piece(
            PRESETS.find((p) => p.id === id),
            x,
            z,
            extra,
          ),
        ),
      ),
    );
  const walk = (x, z, dx, dz, n = 30) => {
    const p = { x, z, y: 0, vy: 0, grounded: true };
    for (let i = 0; i < n; i++) movePlayer(p, dx, dz);
    return p;
  };
  // A peek slit: seen and shot through at eye height, never walked through.
  at("wallSlit", -2, 0);
  const eye = (z, y = 1.55) => ({ x: 0, y, z });
  assert.ok(clearSight(eye(2), eye(-2)) && clearShot(eye(2), eye(-2)));
  assert.ok(!clearSight(eye(2, 0.8), eye(-2, 0.8)));
  assert.ok(walk(0, 2, 0, -0.2).z > 0, "slit blocks movement");
  // An archway is a wide way through.
  at("wallArch", -2, 0);
  assert.ok(walk(1, 2, 0, -0.2).z < -1, "through the arch");
  // A chicane: no straight line across, but you can walk the S-bend.
  at("wallChicane", -3, 0); // x -3..3, z 0..2.5
  assert.ok(!clearSight({ x: -1, y: 1.6, z: 3 }, { x: -1, y: 1.6, z: -1 }));
  const s = walk(0, 3.2, 0, -0.2, 6); // into the bend's mouth
  for (let i = 0; i < 30; i++) movePlayer(s, -0.2, -0.05);
  for (let i = 0; i < 30; i++) movePlayer(s, 0, -0.2);
  assert.ok(
    s.z < 0,
    `walked the chicane to ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`,
  );
  // A pillbox: in by the door on its dir side, not through a wall.
  at("pillbox", -2.5, 0, { dir: "-z" }); // door faces north
  assert.ok(walk(0, -1.5, 0, 0.2).z > 1.5, "in through the door");
  assert.ok(walk(0, 6, 0, -0.2).z > 5, "south wall blocks");
  // A watchtower: walk under the deck between its legs.
  at("tower", -1.5, 0);
  assert.ok(walk(0, 4, 0, -0.2).z < -1, "under the tower");
  // A dais: low tiers you walk straight up.
  at("dais", -2.5, 0);
  assert.ok(walk(0, 6, 0, -0.15, 40).y > 0.8, "up the dais");
  // A sandbag nest is open on its dir side only.
  at("sandbags", -1.5, 0, { dir: "-z" });
  assert.ok(walk(0, -1.5, 0, 0.2).z > 1, "in at the open side");
  assert.ok(walk(0, 4.5, 0, -0.2).z > 3, "closed side blocks");
  useMap("compound");
});

test("a slim piece keeps its size and collision; only its drawing is inset", () => {
  const wall = PRESETS.find((p) => p.id === "wall"),
    fence = PRESETS.find((p) => p.id === "fence");
  const plain = buildCustomMap(
      mapWith(piece(wall, -2, 0), piece(fence, -3, 4)),
    ),
    slim = buildCustomMap(
      mapWith(
        piece(wall, -2, 0, { slim: true }),
        piece(fence, -3, 4, { slim: true }),
      ),
    );
  assert.equal(slim.def.pieces[0].slim, true, "kept by validation");
  const strip = (walls) =>
    walls
      .filter((w) => Number.isInteger(w.pieceIndex))
      .map(({ slim, ...w }) => w);
  assert.deepEqual(strip(slim.walls), strip(plain.walls), "same colliders");
  assert.ok(slim.walls.find((w) => w.pieceIndex === 0).slim);
  assert.ok(slim.decor.find((d) => d.pieceIndex === 1).slim);
  // Drawn parts shrink by SLIM_INSET on each side and below the top, and
  // never by more than a quarter of a thin part.
  const box = { k: "box", x0: 0, x1: 4, z0: 0, z1: 0.5, y0: 0, y1: 4 },
    s = slimPart(box, SLIM_INSET);
  assert.deepEqual(
    [s.x0, s.x1, s.z0, s.z1, s.y0, s.y1],
    [0.01, 3.99, 0.01, 0.49, 0, 3.99],
  );
  const raised = slimPart({ ...box, y0: 2 }, SLIM_INSET);
  assert.equal(raised.y0, 2.01, "lifted off what it stands on");
  const bar = slimPart({ ...box, z1: 0.02 }, SLIM_INSET);
  assert.ok(bar.z1 - bar.z0 > 0.0099, "thin parts keep most of themselves");
  assert.ok(
    validateCustomMap({ ...mapWith(), pieces: [{ ...piece(wall), slim: 0 }] })
      .def.pieces[0].slim === undefined,
  );
});
