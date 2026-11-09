import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditorSession } from "../shared/editorSession.js";
import {
  blankCustomMap,
  ensurePieceIds,
  buildCustomMap,
  validateCustomMap,
} from "../shared/customMap.js";
import { duplicatePieces, stackPieces } from "../shared/builderTools.js";
import { useMap } from "../shared/maps.js";

test("gameplay editing uses the actual player clamber, crouch and prone simulation", () => {
  const d = blankCustomMap();
  d.pieces = [{ t: "low", x0: 0, x1: 3, z0: 0, z1: 3 }];
  const s = createEditorSession(d, { x: 1.5, z: 3.6, y: 0, yaw: 0 });
  let climbing = false;
  for (let i = 0; i < 70; i++) {
    s.step({ jump: true, yaw: 0 }, 1 / 60);
    climbing ||= !!s.player.clamber;
  }
  assert.equal(climbing, true);
  assert.ok(Math.abs(s.player.y - 1.1) < 0.001);
  s.step({ crouch: true }, 1 / 60);
  assert.equal(s.player.crouch, true);
  s.step({ prone: true }, 1 / 60);
  assert.equal(s.player.prone, true);
  assert.equal(Object.keys(s.match.players).length, 1);
  assert.equal(!!s.match.result, false);
  assert.equal(s.player.equipped, null);
  useMap("compound");
});
test("piece IDs survive movement and map rebuilds; duplicates and stacked copies get fresh IDs", () => {
  const d = ensurePieceIds(blankCustomMap());
  d.pieces = [{ t: "ramp1", x0: 0, x1: 3, z0: 0, z1: 6, dir: "-z" }];
  ensurePieceIds(d);
  const id = d.pieces[0].id;
  duplicatePieces(d, [0]);
  stackPieces(d, [0], 3);
  assert.equal(new Set(d.pieces.map((p) => p.id)).size, 3);
  assert.equal(d.pieces[0].id, id);
  const walls = buildCustomMap(validateCustomMap(d).def).walls.filter(
    (w) => w.pieceId === id,
  );
  assert.ok(walls.length > 1);
  assert.ok(walls.every((w) => w.pieceIndex === 0));
});
test("editing does not drop a flying player and safely relocates a blocked walking position", () => {
  const d = blankCustomMap();
  const s = createEditorSession(d, { x: 0, z: 10, y: 0, yaw: 0 });
  s.player.y = 8;
  const next = structuredClone(d);
  next.pieces.push({ t: "low", x0: 5, x1: 7, z0: 5, z1: 7 });
  assert.equal(s.updateMap(next), false);
  assert.equal(s.player.y, 8);
  s.player.y = 0;
  next.pieces.push({ t: "wall", x0: -1, x1: 1, z0: 9, z1: 11 });
  assert.equal(s.updateMap(next), true);
  assert.ok(s.player.x !== 0 || s.player.z !== 10 || s.player.y > 0);
  useMap("compound");
});
