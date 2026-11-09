import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { movePlayer } from "../shared/map.js";
import { OBJECTIVES } from "../shared/config.js";
import {
  blankCustomMap,
  validateCustomMap,
  customMapId,
  buildCustomMap,
  registerCustomMap,
  checkCustomMap,
  MAX_PIECES,
  MIN_PIECE_OPACITY,
  MAX_BUILD_HEIGHT,
  CUSTOM_BOUNDARY_HEIGHT,
  CUSTOM_SIZES,
} from "../shared/customMap.js";
// Maps from the map builder: validated (they come from players), built into
// a playable map, and checked for reachability.

const sample = () => {
  const def = blankCustomMap("medium");
  def.name = "Test yard";
  def.pieces.push(
    { t: "wall", x0: -18.5, x1: 12, z0: 0, z1: 1 },
    { t: "plat2", x0: -4, x1: -1, z0: 4, z1: 8 },
    { t: "ramp2", x0: -4, x1: -1, z0: 8, z1: 14, dir: "-z" },
    { t: "low", x0: 5, x1: 7, z0: 10, z1: 11 },
  );
  return def;
};

test("a fresh map is valid and playable", () => {
  const { def, error } = validateCustomMap(blankCustomMap());
  assert.equal(error, undefined);
  assert.equal(checkCustomMap(def).errors.length, 0);
});

test("validation rejects broken maps and cleans what it keeps", () => {
  const bad = (change, why) => {
    const def = sample();
    change(def);
    assert.ok(validateCustomMap(def).error, why);
  };
  bad((d) => (d.size = "huge"), "size");
  bad((d) => (d.terminals = d.terminals.slice(0, 1)), "one terminal");
  bad((d) => (d.spawns.attacker = { x: 0, z: -20 }), "spawns swapped");
  bad((d) => (d.spawns.defender = { x: 99, z: 0 }), "spawn outside");
  bad((d) => d.pieces.push({ t: "laser", x0: 0, x1: 1, z0: 0, z1: 1 }), "type");
  bad(
    (d) =>
      (d.pieces = Array.from({ length: MAX_PIECES + 1 }, () => ({
        t: "low",
        x0: 0,
        x1: 1,
        z0: 0,
        z1: 1,
      }))),
    "too many pieces",
  );
  const messy = sample();
  messy.name = "<b>Evil</b> map name that is far too long";
  messy.pieces.push(
    { t: "wall", x0: 5.3, x1: 99, z0: 2.1, z1: 3.9 },
    { t: "low", x0: 1, x1: 1.2, z0: 1, z1: 1.2 },
  );
  const { def } = validateCustomMap(messy);
  assert.ok(!/[<>]/.test(def.name) && def.name.length <= 24, "name cleaned");
  const wall = def.pieces.at(-1);
  assert.deepEqual(
    [wall.x0, wall.x1, wall.z0, wall.z1],
    [5.5, 18.5, 2, 4],
    "snapped to 0.5 m and clamped to the map",
  );
  assert.equal(
    def.pieces.length,
    sample().pieces.length + 1,
    "slivers dropped",
  );
});

test("the same map always gets the same id; a different one doesn't", () => {
  const a = validateCustomMap(sample()).def,
    b = validateCustomMap(sample()).def;
  assert.equal(customMapId(a), customMapId(b));
  b.pieces.pop();
  assert.notEqual(customMapId(a), customMapId(b));
});

test("built maps have a frame, terminal consoles, lines and ramps that climb the right way", () => {
  const map = buildCustomMap(validateCustomMap(sample()).def);
  assert.equal(map.terminals.length, 3);
  assert.equal(map.walls.filter((w) => w.kind === "terminal").length, 3);
  assert.equal(map.walls.filter((w) => w.kind === "wall").length, 4, "frame");
  assert.ok(map.buyLines.attacker > map.buyLines.defender);
  const slices = map.walls.filter((w) => w.kind === "ramp");
  // dir "-z": higher toward smaller z.
  const low = slices.reduce((a, b) => (a.z > b.z ? a : b)),
    high = slices.reduce((a, b) => (a.z < b.z ? a : b));
  assert.ok(high.h > low.h + 2 && Math.abs(high.h - 2.4) < 0.1);
});

test("the checklist catches a terminal no one can reach", () => {
  const def = sample();
  def.pieces = [{ t: "wall", x0: -18.5, x1: 18.5, z0: 0, z1: 1 }];
  const { errors } = checkCustomMap(def);
  assert.equal(errors.length, 3, "infiltrators can't reach any terminal");
  assert.equal(checkCustomMap(sample()).errors.length, 0);
});

test("a match runs on a custom map: terminals, spawns, and the bot reaches a terminal", () => {
  const def = validateCustomMap(sample()).def,
    id = registerCustomMap(def);
  assert.ok(MAPS[id].custom);
  const m = new Match("BUILT", true, "seen", false, id);
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "B", "C"],
  );
  assert.deepEqual(
    { x: m.players.bot.x, z: m.players.bot.z },
    def.spawns.attacker,
  );
  m.activate();
  m.players.d.alive = false;
  for (let i = 0; i < 120 * 30 && !m.result; i++) m.tick(1 / 30);
  assert.equal(m.result?.winner, "attacker", "the bot extracts the data");
  assert.equal(m.extracted.length, 2, "from two of the three terminals");
  useMap("compound");
});

test("an older two-terminal map still loads, and either terminal wins it", () => {
  const def = sample();
  def.terminals = [def.terminals[0], def.terminals[2]];
  const clean = validateCustomMap(def);
  assert.equal(clean.error, undefined);
  const m = new Match(
    "OLD",
    false,
    "seen",
    false,
    registerCustomMap(clean.def),
  );
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "B"],
  );
  assert.equal(m.snapshot("a").needed, 1);
  Object.assign(m.players.a, { x: OBJECTIVES[1].x, z: OBJECTIVES[1].z + 1.4 });
  for (let i = 0; i < 9 * 30; i++) {
    m.players.a.input = { interact: true };
    m.tick(1 / 30);
  }
  assert.equal(m.result?.winner, "attacker");
  useMap("compound");
});

test("elevation and thickness round-trip safely while legacy maps retain their defaults", () => {
  const d = blankCustomMap();
  d.pieces = [
    { t: "deck", x0: -2, x1: 2, z0: 0, z1: 4, y: 3, h: 0.3 },
    { t: "wall", x0: 3, x1: 4, z0: 0, z1: 4, y: 3.3, h: 2.7 },
    { t: "ramp1", x0: -2, x1: 2, z0: 4, z1: 10, y: 3, h: 1.2, dir: "-z" },
  ];
  const clean = validateCustomMap(d);
  assert.equal(clean.error, undefined);
  const map = buildCustomMap(clean.def),
    deck = map.walls.find((w) => w.kind === "platform");
  assert.equal(deck.bottom, 3);
  assert.equal(deck.h, 3.3);
  const raised = map.walls.filter((w) => w.kind === "ramp");
  assert.ok(raised.every((w) => w.bottom === 3 && w.h > 3 && w.h < 4.2));
  assert.equal(raised[0].ramp.base, 3);
  for (const change of [
    { y: -1 },
    { y: 31, h: 4 },
    { h: 0 },
    { h: Infinity },
    { y: NaN },
  ]) {
    const bad = structuredClone(d);
    Object.assign(bad.pieces[0], change);
    assert.ok(validateCustomMap(bad).error);
  }
  const old = sample(),
    legacy = validateCustomMap(old).def;
  assert.ok(legacy.pieces.every((p) => p.y === undefined && p.h === undefined));
});

test("custom-map boundaries stay 10 m above every legal build and stop elevated players on all sides", () => {
  for (const size of Object.keys(CUSTOM_SIZES)) {
    const def = blankCustomMap(size),
      map = buildCustomMap(def),
      bounds = CUSTOM_SIZES[size];
    const walls = map.walls.filter((w) => w.kind === "wall");
    assert.equal(walls.length, 4);
    assert.ok(walls.every((w) => w.h === MAX_BUILD_HEIGHT + 10));
    assert.equal(CUSTOM_BOUNDARY_HEIGHT, 42);
    useMap(registerCustomMap(def));
    for (const y of [0, MAX_BUILD_HEIGHT, MAX_BUILD_HEIGHT + 4])
      for (const [x, z, dx, dz] of [
        [bounds.x - 0.5, 0, 1, 0],
        [-bounds.x + 0.5, 0, -1, 0],
        [0, bounds.z - 0.5, 0, 1],
        [0, -bounds.z + 0.5, 0, -1],
      ]) {
        const p = { x, z, y, vy: 0, grounded: false };
        movePlayer(p, dx, dz);
        assert.equal(p.x, x);
        assert.equal(p.z, z);
      }
  }
  useMap("compound");
});

test("piece colors survive validation, sharing and every ramp collision slice", () => {
  const d = sample();
  d.pieces[0].color = "#AA4466";
  d.pieces[2].color = "#3388cc";
  const clean = validateCustomMap(JSON.parse(JSON.stringify(d))).def;
  assert.equal(clean.pieces[0].color, "#aa4466");
  const map = buildCustomMap(clean);
  assert.ok(
    map.walls.some((w) => w.kind === "building" && w.color === "#aa4466"),
  );
  assert.ok(
    map.walls
      .filter((w) => w.kind === "ramp")
      .every((w) => w.color === "#3388cc"),
  );
  const plain = validateCustomMap(sample()).def;
  assert.ok(plain.pieces.every((p) => p.color === undefined));
  for (const color of ["red", "#abc", "#12345678", "url(test)", 42, null]) {
    const bad = sample();
    bad.pieces[0].color = color;
    assert.ok(validateCustomMap(bad).error);
  }
});

test("piece opacity survives saving and sharing, and see-through pieces stay solid", () => {
  const d = sample();
  d.pieces[0].opacity = 0.254;
  d.pieces[2].opacity = 0.5;
  d.pieces[3].opacity = 1;
  const clean = validateCustomMap(JSON.parse(JSON.stringify(d))).def;
  assert.equal(clean.pieces[0].opacity, 0.25);
  assert.equal(clean.pieces[0].color, undefined);
  assert.equal(
    clean.pieces[3].opacity,
    undefined,
    "fully opaque is the default",
  );
  assert.deepEqual(
    validateCustomMap(JSON.parse(JSON.stringify(clean))).def,
    clean,
  );
  const map = buildCustomMap(clean);
  assert.ok(map.walls.some((w) => w.kind === "building" && w.opacity === 0.25));
  assert.ok(
    map.walls.filter((w) => w.kind === "ramp").every((w) => w.opacity === 0.5),
  );
  for (const opacity of [0, MIN_PIECE_OPACITY - 0.01, 1.2, -1, "clear", NaN]) {
    const bad = sample();
    bad.pieces[0].opacity = opacity;
    assert.ok(validateCustomMap(bad).error, `rejects ${opacity}`);
  }
  // The faint wall still stops a player walking into it.
  useMap(registerCustomMap(clean));
  const p = { x: 0, z: -2, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 20; i++) movePlayer(p, 0, 0.2);
  assert.ok(p.z < 0, `stopped at ${p.z}`);
  useMap("compound");
});
