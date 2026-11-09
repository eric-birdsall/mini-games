import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createCharacter, animateCharacter } from "../src/characters.js";

import { assetWithoutTextures } from "./fixtures/characterAsset.js";

test("operators own independent skeletons/materials, retain human proportions and animate every stance", async () => {
  const asset = await assetWithoutTextures(
    new URL("../src/assets/characters/soldier.glb", import.meta.url),
  );
  const inf = createCharacter(asset, "attacker"),
    sent = createCharacter(asset, "defender");
  const a = inf.userData.character,
    b = sent.userData.character;
  assert.notEqual(a.bones.Hips, b.bones.Hips);
  assert.notEqual(
    a.model.getObjectByName("vanguard_Mesh").material,
    b.model.getObjectByName("vanguard_Mesh").material,
  );
  for (const state of [
    { moveSpeed: 0 },
    { moveSpeed: 2.5 },
    { moveSpeed: 5.8 },
    { crouch: true, moveSpeed: 1 },
    { prone: true, moveSpeed: 0.65 },
    { equipped: "balloon", moveSpeed: 0 },
  ]) {
    for (let i = 0; i < 90; i++) animateCharacter(inf, state, 1 / 30);
    inf.updateMatrixWorld(true);
    for (const bone of Object.values(a.bones))
      assert.ok(bone.matrixWorld.elements.every(Number.isFinite));
    assert.equal(inf.scale.y, 1, "stance must not squash the character");
    assert.ok(
      Math.abs(
        a.actions.Idle.getEffectiveWeight() +
          a.actions.Walk.getEffectiveWeight() +
          a.actions.Run.getEffectiveWeight() -
          1,
      ) < 0.001,
    );
  }
  assert.equal(b.phase, 0, "animating one operator cannot animate another");
  animateCharacter(sent, { moveSpeed: 0 }, 1 / 30);
  const bounds = new T.Box3().setFromObject(sent);
  assert.ok(
    bounds.max.y - bounds.min.y > 1.6 && bounds.max.y - bounds.min.y < 2.0,
  );
});
