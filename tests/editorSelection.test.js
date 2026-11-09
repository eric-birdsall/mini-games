import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { World } from "../src/world.js";
import { builderPieceGeometry } from "../src/builderGeometry.js";
import { ensurePieceIds } from "../shared/customMap.js";

test("same-material planner pieces remain individually selectable after rendering optimization", () => {
  const def = ensurePieceIds({
    pieces: [
      { t: "wall", x0: -5, x1: -3, z0: 0, z1: 2 },
      { t: "low", x0: 0, x1: 2, z0: 0, z1: 2 },
      { t: "ramp1", x0: 5, x1: 7, z0: 0, z1: 4, dir: "+z" },
    ],
  });
  const level = new T.Group();
  const material = new T.MeshBasicMaterial();
  const pieces = def.pieces.map((p, pieceIndex) => {
    const mesh = new T.Mesh(builderPieceGeometry(p), material);
    mesh.position.set((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2);
    mesh.userData = { pieceIndex, pieceId: p.id };
    level.add(mesh);
    return mesh;
  });
  // Decorative geometry should still benefit from batching.
  for (let i = 0; i < 2; i++) {
    const trim = new T.Mesh(new T.BoxGeometry(1, 1, 1), material);
    trim.position.set(i, 0, -10);
    level.add(trim);
  }
  World.prototype.mergeStatic.call({ level });
  level.updateMatrixWorld(true);
  assert.equal(level.children.length, 4);
  for (const [i, mesh] of pieces.entries()) {
    assert.ok(level.children.includes(mesh));
    const ray = new T.Raycaster(
      new T.Vector3(mesh.position.x, 10, mesh.position.z),
      new T.Vector3(0, -1, 0),
    );
    const hits = ray.intersectObjects(
      level.children.filter((m) => Number.isInteger(m.userData.pieceIndex)),
      false,
    );
    assert.equal(hits[0].object.userData.pieceIndex, i);
    assert.equal(hits[0].object.userData.pieceId, def.pieces[i].id);
  }
  for (const mesh of level.children) mesh.geometry.dispose();
  material.dispose();
});
