import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCustomMap,
  registerCustomMap,
  MAX_PIECES,
} from "../shared/customMap.js";
import {
  movePieces,
  duplicatePieces,
  rotatePieces,
  clearanceIssues,
  playtestPoint,
  surfaceElevation,
  elevatePieces,
  stackPieces,
} from "../shared/builderTools.js";
import { Match } from "../server/simulation.js";
import { useMap } from "../shared/maps.js";
const wall = (x0, x1, z0, z1, t = "wall") => ({ t, x0, x1, z0, z1 });

test("clearance flags impassable slivers and map-edge gaps, not joined pieces or usable lanes", () => {
  const d = blankCustomMap();
  d.pieces = [wall(-3, -1, 0, 5), wall(-0.5, 1, 0, 5)];
  assert.equal(clearanceIssues(d).filter((i) => i.kind === "gap").length, 1);
  d.pieces[1].x0 = 0;
  assert.equal(clearanceIssues(d).length, 0, "one metre lane fits");
  d.pieces[1].x0 = -1;
  assert.equal(clearanceIssues(d).length, 0, "flush walls are intentional");
  d.pieces = [wall(-18, -17, 0, 2)];
  assert.ok(clearanceIssues(d).some((i) => i.text.includes("map edge")));
});
test("ramp checks distinguish an obstructed landing from a level platform and flag narrow ramps", () => {
  const d = blankCustomMap();
  d.pieces = [{ ...wall(-1, 1, 0, 6, "ramp1"), dir: "-z" }, wall(-2, 2, -2, 0)];
  assert.ok(
    clearanceIssues(d).some((i) => i.text.includes("blocked upper landing")),
  );
  d.pieces[1].t = "plat1";
  assert.equal(clearanceIssues(d).length, 0);
  d.pieces[0].x1 = -0.5;
  assert.ok(clearanceIssues(d).some((i) => i.text.includes("too narrow")));
});
test("group movement clamps as a whole, duplication is independent, and four rotations do not drift", () => {
  const d = blankCustomMap();
  d.pieces = [wall(15, 16, 0, 1, "low"), wall(17, 18, 0, 1, "low")];
  assert.equal(movePieces(d, [0, 1], 5, 0), true);
  assert.equal(d.pieces[1].x1, 18.5);
  assert.equal(d.pieces[1].x0 - d.pieces[0].x0, 2);
  const originals = structuredClone(d.pieces),
    copies = duplicatePieces(d, [0, 1]);
  assert.deepEqual(copies, [2, 3]);
  movePieces(d, copies, -2, 1);
  assert.deepEqual(d.pieces.slice(0, 2), originals);
  const small = blankCustomMap();
  small.pieces = [wall(0, 0.5, 0, 1, "low"), wall(2, 3.5, 2, 2.5, "low")];
  const before = structuredClone(small.pieces);
  for (let i = 0; i < 4; i++) assert.equal(rotatePieces(small, [0, 1]), true);
  assert.deepEqual(small.pieces, before);
  const full = blankCustomMap();
  full.pieces = Array.from({ length: MAX_PIECES }, () => wall(0, 1, 0, 1));
  assert.equal(duplicatePieces(full, [0]), null);
  assert.equal(full.pieces.length, MAX_PIECES);
});
test("test starts reject walls, terminals and invalid coordinates; choose safe platform/ramp heights", () => {
  const d = blankCustomMap();
  d.pieces = [
    wall(-2, 2, 0, 2),
    wall(4, 8, 0, 4, "plat1"),
    { ...wall(4, 8, 4, 10, "ramp1"), dir: "-z" },
  ];
  assert.equal(playtestPoint(d, { x: 0, z: 1 }), null);
  assert.equal(playtestPoint(d, d.terminals[0]), null);
  assert.equal(playtestPoint(d, { x: NaN, z: 0 }), null);
  assert.equal(playtestPoint(d, { x: 99, z: 0 }), null);
  assert.deepEqual(playtestPoint(d, { x: 6, z: 2 }), { x: 6, z: 2, y: 1.2 });
  assert.equal(playtestPoint(d, { x: 0, z: 10 }).y, 0);
  const ramp = playtestPoint(d, { x: 6, z: 7 });
  assert.ok(ramp.y > 0.5 && ramp.y < 0.9);
});
test("chosen start is server validated, training-only, and never modifies the saved spawns", () => {
  const def = blankCustomMap(),
    original = structuredClone(def.spawns),
    map = registerCustomMap(def);
  const m = new Match("START", true, "seen", true, map);
  m.addPlayer("a", "attacker");
  assert.equal(m.setBuilderStart("a", { x: 3, z: 5, y: 999 }), true);
  m.activate();
  assert.equal(m.players.a.x, 3);
  assert.equal(m.players.a.z, 5);
  assert.equal(m.players.a.y, 0);
  assert.deepEqual(def.spawns, original);
  assert.equal(m.setBuilderStart("a", { x: Infinity, z: 1 }), false);
  const competitive = new Match("MATCH", true, "seen", false, map);
  competitive.addPlayer("a", "attacker");
  assert.equal(competitive.setBuilderStart("a", { x: 3, z: 5 }), false);
  useMap("compound");
});

test("elevated decks support walking on top and unobstructed travel underneath", () => {
  const d = blankCustomMap();
  d.pieces = [{ ...wall(-3, 3, -6, 6, "deck"), y: 3, h: 0.3 }];
  const id = registerCustomMap(d),
    m = new Match("BRIDGE", true, "seen", true, id);
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  const p = m.players.a;
  Object.assign(p, {
    x: 0,
    z: 8,
    y: 0,
    yaw: 0,
    input: { forward: 1 },
    grounded: true,
  });
  for (let i = 0; i < 120; i++) m.tick(1 / 30);
  assert.ok(p.z < -5, "can walk under the bridge");
  assert.equal(p.y, 0);
  assert.equal(playtestPoint(d, { x: 0, z: 0, y: 0 }).y, 0);
  assert.equal(playtestPoint(d, { x: 0, z: 0, y: 3.3 }).y, 3.3);
  Object.assign(p, {
    x: 0,
    z: 4,
    y: 3.3,
    input: { forward: 1 },
    grounded: true,
  });
  for (let i = 0; i < 45; i++) m.tick(1 / 30);
  assert.ok(p.z < 0);
  assert.ok(Math.abs(p.y - 3.3) < 0.001, "walking on deck stays on deck");
  useMap("compound");
});

test("surface snapping, vertical group movement and stacking preserve floor spacing", () => {
  const d = blankCustomMap();
  d.pieces = [
    { ...wall(-2, 2, 0, 4, "deck"), y: 3, h: 0.3 },
    { ...wall(-2, -1, 0, 4), y: 3.3, h: 2.7 },
  ];
  assert.equal(surfaceElevation(d, { x: 0, z: 1 }), 3.3);
  assert.equal(surfaceElevation(d, { x: -1.5, z: 1 }), 6);
  const copies = stackPieces(d, [0, 1], 3);
  assert.deepEqual(copies, [2, 3]);
  assert.equal(d.pieces[2].y, 6);
  assert.equal(d.pieces[3].y, 6.3);
  assert.equal(d.pieces[3].y - d.pieces[2].y, d.pieces[1].y - d.pieces[0].y);
  const before = structuredClone(d);
  assert.equal(elevatePieces(d, copies, 40), false);
  assert.deepEqual(d, before);
});

test("a raised ramp connects elevated decks smoothly", () => {
  const d = blankCustomMap();
  d.pieces = [
    { ...wall(4, 8, 10, 14, "deck"), y: 2.7, h: 0.3 },
    { ...wall(4, 8, 4, 10, "ramp1"), y: 3, h: 1.2, dir: "-z" },
    { ...wall(4, 8, -4, 4, "deck"), y: 3.9, h: 0.3 },
  ];
  const m = new Match("UPPER", true, "seen", true, registerCustomMap(d));
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.a, {
    x: 6,
    z: 11,
    y: 3,
    yaw: 0,
    grounded: true,
    input: { forward: 1 },
  });
  for (let i = 0; i < 100; i++) m.tick(1 / 30);
  assert.ok(m.players.a.z < 1);
  assert.ok(Math.abs(m.players.a.y - 4.2) < 0.001);
  useMap("compound");
});
test("a blocked upper-floor test start does not silently move the player to the ground", () => {
  const d = blankCustomMap();
  d.pieces = [
    { ...wall(-2, 2, 0, 4, "deck"), y: 3, h: 0.3 },
    { ...wall(-1, 1, 1, 3), y: 3.3, h: 2.7 },
  ];
  assert.equal(playtestPoint(d, { x: 0, z: 2, y: 3.3 }), null);
  assert.equal(playtestPoint(d, { x: 0, z: 2, y: 0 }).y, 0);
});
