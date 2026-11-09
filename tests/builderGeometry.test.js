import test from "node:test";
import assert from "node:assert/strict";
import { builderPieceGeometry } from "../src/builderGeometry.js";
import { PIECE_TYPES } from "../shared/customMap.js";

test("every builder piece can generate a finite selection and placement preview", () => {
  for (const t of Object.keys(PIECE_TYPES)) {
    for (const dir of ["+x", "-x", "+z", "-z"]) {
      const geometry = builderPieceGeometry({
        t,
        x0: 0,
        x1: 3,
        z0: 0,
        z1: 5,
        y: 2,
        dir,
      });
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox;
      assert.ok(
        [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite),
        `${t} ${dir}`,
      );
      assert.ok(Math.abs(min.y) < 1e-6);
      assert.ok(max.y > 0);
      geometry.dispose();
    }
  }
});
