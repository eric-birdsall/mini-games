import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCustomMap,
  validateCustomMap,
  registerCustomMap,
  partsOf,
} from "../shared/customMap.js";
import { useMap } from "../shared/maps.js";
import { movePlayer, clearSight, clearShot } from "../shared/map.js";
import { rotatePieces } from "../shared/builderTools.js";
import { propKind, pieceFields, setPieceFields } from "../shared/pieceProps.js";
// Each kind of piece shows its own size fields; a window wall's opening,
// set by coordinates, is what sight, shots and movement pass through.

const keys = (p) => pieceFields(p).map((f) => f.key);
const mapWith = (...pieces) => {
  const d = blankCustomMap("medium");
  d.pieces.push(...pieces);
  const { def, error } = validateCustomMap(d);
  assert.equal(error, undefined);
  return def;
};

test("round pieces show radius and height; blocks length, width, height", () => {
  const silo = { t: "column", x0: 0, x1: 4, z0: 0, z1: 4, h: 8 };
  assert.equal(propKind(silo), "round");
  assert.deepEqual(keys(silo), ["radius", "height"]);
  assert.equal(pieceFields(silo)[0].value, 2);
  assert.equal(setPieceFields(silo, { radius: 3 }, "medium"), undefined);
  assert.deepEqual([silo.x0, silo.x1, silo.z0, silo.z1], [-1, 5, -1, 5]);
  assert.equal(partsOf(silo)[0].r, 3);

  const block = { t: "high", x0: 0, x1: 2, z0: 0, z1: 1 };
  assert.deepEqual(keys(block), ["length", "width", "height"]);
  setPieceFields(block, { length: 4, height: 1.5 }, "medium");
  assert.deepEqual([block.x0, block.x1, block.z0, block.z1], [-1, 3, 0, 1]);
  assert.equal(block.h, 1.5);
  assert.match(setPieceFields(block, { length: 200 }, "small"), /boundary/);
});

test("a window wall lists its opening: X along the wall, Y up from base", () => {
  const wall = { t: "wallWindow", x0: 0, x1: 6, z0: 0, z1: 0.5 };
  assert.deepEqual(keys(wall), [
    "length",
    "width",
    "height",
    "winX0",
    "winY0",
    "winX1",
    "winY1",
  ]);
  // Without its own opening it shows the first default window.
  const f = Object.fromEntries(pieceFields(wall).map((x) => [x.key, x.value]));
  assert.deepEqual([f.winX0, f.winY0, f.winX1, f.winY1], [0.8, 1, 2.2, 2.1]);
  assert.match(setPieceFields({ ...wall }, { winX1: 7 }), /must fit/);
  assert.match(setPieceFields({ ...wall }, { winX0: 3, winX1: 2 }), /must fit/);
  assert.match(
    setPieceFields({ ...wall }, { winX0: 0, winY0: 0, winX1: 6, winY1: 4 }),
    /whole wall/,
  );
});

test("a custom opening is where sight, shots and players get through", () => {
  // A wall from x -3 to 3 with a door-sized gap 4–5.5 m along it.
  const wall = {
    t: "wallWindow",
    x0: -3,
    x1: 3,
    z0: 0,
    z1: 0.5,
    win: { x0: 4, y0: 0, x1: 5.5, y1: 2.6 },
  };
  useMap(registerCustomMap(mapWith(wall)));
  const eye = (x, z) => ({ x, y: 1.6, z });
  assert.ok(clearSight(eye(1.75, 2), eye(1.75, -2)), "seen through");
  assert.ok(clearShot(eye(1.75, 2), eye(1.75, -2)), "shot through");
  assert.ok(!clearSight(eye(-1, 2), eye(-1, -2)), "the old bay is wall now");
  assert.ok(!clearSight({ ...eye(1.75, 2), y: 3 }, { ...eye(1.75, -2), y: 3 }));
  const p = { x: 1.75, z: 2, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 20; i++) movePlayer(p, 0, -0.2);
  assert.ok(p.z < -1, `walked through the opening to ${p.z}`);
  useMap("compound");
});

test("openings survive validation and four turns", () => {
  const def = mapWith({
    t: "wallWindow",
    x0: -3,
    x1: 3,
    z0: 0,
    z1: 0.5,
    win: { x0: 0.5, y0: 1.04, x1: 2, y1: 2 },
  });
  assert.deepEqual(def.pieces[0].win, { x0: 0.5, y0: 1, x1: 2, y1: 2 });
  const before = JSON.stringify(def.pieces[0]),
    gap = (p) =>
      partsOf(p)
        .filter((q) => q.y0 === 0 && q.y1 === 4)
        .map((q) => [q.x0, q.x1, q.z0, q.z1]);
  rotatePieces(def, [0]);
  // Turned to run north–south, the opening is still 0.5–2 m from the end
  // that was its start.
  const turned = def.pieces[0];
  assert.deepEqual(gap(turned).length, 2);
  for (let i = 0; i < 3; i++) rotatePieces(def, [0]);
  assert.equal(JSON.stringify(def.pieces[0]), before);
  assert.equal(
    validateCustomMap({
      ...def,
      pieces: [{ ...def.pieces[0], win: { x0: "a" } }],
    }).error.includes("Window"),
    true,
  );
});
