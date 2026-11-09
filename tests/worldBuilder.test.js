import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankCustomMap,
  buildCustomMap,
  CUSTOM_SIZES,
} from "../shared/customMap.js";
import { worldPiece, moveWorldSelection } from "../shared/worldBuilder.js";

test("in-world placement snaps to the shared grid, preserves color/elevation and rotates ramps", () => {
  const d = blankCustomMap();
  const p = worldPiece(
    d,
    "ramp1",
    { x: 1.1, y: 3.03, z: 2.1 },
    { width: 2, depth: 6, height: 1.2, color: "#3388aa", rotation: 1 },
  );
  assert.equal(p.dir, "+x");
  assert.equal(p.x1 - p.x0, 6);
  assert.equal(p.z1 - p.z0, 2);
  assert.equal(p.y, 3);
  assert.equal(p.color, "#3388aa");
  assert.equal(
    worldPiece(
      d,
      "deck",
      { x: 0, y: 0, z: 0 },
      { width: 2, depth: 2, height: 0.3, opacity: 0.4 },
    ).opacity,
    0.4,
  );
  assert.equal(
    worldPiece(
      d,
      "deck",
      { x: 0, y: 0, z: 0 },
      { width: 2, depth: 2, height: 0.3, opacity: 1 },
    ).opacity,
    undefined,
  );
  assert.equal(
    worldPiece(
      d,
      "deck",
      { x: 99, y: 0, z: 0 },
      { width: 2, depth: 2, height: 0.3 },
    ),
    null,
  );
  assert.equal(
    worldPiece(
      d,
      "deck",
      { x: 0, y: 32, z: 0 },
      { width: 2, depth: 2, height: 0.3 },
    ),
    null,
  );
  assert.equal(
    worldPiece(
      d,
      "deck",
      { x: 0, y: 0, z: 0 },
      { width: NaN, depth: 2, height: 0.3 },
    ),
    null,
  );
});
test("grab previews are immutable until committed and preserve group spacing and finishes", () => {
  const d = blankCustomMap();
  d.pieces = [
    { t: "deck", x0: 0, x1: 2, z0: 0, z1: 2, y: 3, color: "#3388aa" },
    { t: "wall", x0: 0, x1: 0.5, z0: 0, z1: 2, y: 3.3 },
  ];
  const original = structuredClone(d),
    moved = moveWorldSelection(d, [0, 1], { x: 2, y: 1, z: -3 });
  assert.deepEqual(d, original);
  assert.equal(moved.pieces[0].x0, 2);
  assert.equal(moved.pieces[1].y, 4.3);
  assert.equal(moved.pieces[0].color, "#3388aa");
  assert.equal(moveWorldSelection(d, [0, 1], { x: 100, y: 0, z: 0 }), null);
  assert.equal(moveWorldSelection(d, [0, 1], { x: 0, y: -4, z: 0 }), null);
});
