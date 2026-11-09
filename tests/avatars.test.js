import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { ALL_CHARACTERS, AVATARS, avatarChoice } from "../shared/avatars.js";
import {
  animateAvatar,
  createCritter,
  CRITTER_ASSETS,
  releaseAvatar,
} from "../src/avatars.js";
import { Match } from "../server/simulation.js";
import { assetWithoutTextures } from "./fixtures/characterAsset.js";

for (const id of ALL_CHARACTERS) {
  test(`${id} uses a grounded, independently animated rig`, async () => {
    const asset = await assetWithoutTextures(CRITTER_ASSETS[id]);
    const a = createCritter(asset);
    const b = createCritter(asset);
    const actor = new T.Group();
    actor.add(a.pivot);
    actor.userData.critter = a;
    const bounds = new T.Box3().setFromObject(actor, true);
    assert.ok(Math.abs(bounds.min.y) < 0.001);
    assert.ok(Math.abs(bounds.max.y - 1.78) < 0.001);
    const [skinA] = a.skeletons;
    const [skinB] = b.skeletons;
    assert.notEqual(skinA.bones[0], skinB.bones[0]);
    const rootBone = a.model.getObjectByName("root");
    const restPosition = rootBone.position.clone();
    for (const [data, outcome, clip] of [
      [{}, undefined, "Idle"],
      [{ moveSpeed: 2 }, undefined, "Walk"],
      [{ moveSpeed: 5 }, undefined, "Run"],
      [{ grounded: false }, undefined, "Jump"],
      [{ grounded: true }, undefined, "Idle"],
      [{ hits: 1 }, undefined, "Hit"],
      [{}, "win", "Wave"],
      [{}, "lose", "Death"],
    ]) {
      animateAvatar(actor, data, 1 / 30, outcome);
      animateAvatar(actor, data, 1 / 30, outcome);
      assert.equal(a.action.getClip().name, clip);
      assert.ok(Math.abs(a.action.time - 2 / 30) < 0.001);
      assert.ok(rootBone.position.equals(restPosition));
      assert.deepEqual(actor.position.toArray(), [0, 0, 0]);
    }
    assert.equal(b.mixer.time, 0);
    const meshes = [];
    a.model.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    assert.ok(meshes.length > 0);
    const geometry = meshes[0].geometry;
    let disposed = false;
    geometry.addEventListener("dispose", () => {
      disposed = true;
    });
    releaseAvatar(actor);
    assert.equal(disposed, false);
  });
}

test("hidden classic characters cannot be picked", () => {
  assert.ok(!AVATARS.some((id) => id.startsWith("classic-")));
  assert.equal(avatarChoice({ character: "classic-frog" }).character, "frog");
});

test("legacy choices migrate safely and snapshots share appearance and jump state", () => {
  assert.deepEqual(avatarChoice({ character: "unknown", color: "__proto__" }), {
    character: "frog",
    color: "sunshine",
  });
  const match = new Match("AVATAR", false, "splash", true);
  match.addPlayer("one", "attacker");
  match.players.one.avatar = avatarChoice({
    character: "red-panda",
    color: "mint",
  });
  match.players.one.grounded = false;
  const player = match.snapshot("one").players.find((p) => p.id === "one");
  assert.deepEqual(player.avatar, { character: "red-panda", color: "mint" });
  assert.equal(player.grounded, false);
});
