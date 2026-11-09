import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

const modelURL = new URL("./assets/characters/soldier.glb", import.meta.url)
  .href;
let template;
export function loadCharacters() {
  return (template ||= new GLTFLoader().loadAsync(modelURL));
}

// Each actor owns its skeleton, materials and geometry; textures stay shared.
export function createCharacter(asset, team) {
  const root = new T.Group(),
    pivot = new T.Group(),
    model = clone(asset.scene);
  const sentinel = team === "defender";
  root.userData.team = team;
  root.add(pivot);
  pivot.add(model);
  model.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model),
    scale = 1.78 / (bounds.max.y - bounds.min.y);
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  // The source model and gameplay both face -Z.
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry = node.geometry.clone();
    node.castShadow = node.receiveShadow = true;
    node.material = node.material.clone();
    const visor = /visor/i.test(node.material.name);
    node.material.color.set(
      visor
        ? sentinel
          ? "#ffb199"
          : "#6aaeff"
        : sentinel
          ? "#ff9d80"
          : "#3d95ff",
    );
    node.material.roughness = visor ? 0.24 : 0.88;
    node.material.metalness = visor ? 0.5 : 0.03;
  });
  const bones = {};
  model.traverse((node) => {
    if (node.isBone) bones[node.name.replace(/^mixamorig:?/, "")] = node;
  });
  const mixer = new T.AnimationMixer(model),
    actions = {};
  for (const name of ["Idle", "Walk", "Run"]) {
    const clip = asset.animations.find((clip) => clip.name === name);
    if (clip) actions[name] = mixer.clipAction(clip).play();
  }
  const cloth = new T.MeshStandardMaterial({
    color: sentinel ? "#d9533a" : "#2f74d8",
    roughness: 0.96,
  });
  const armor = new T.MeshStandardMaterial({
    color: sentinel ? "#ffb347" : "#ffd84a",
    roughness: 0.73,
    metalness: 0.12,
  });
  const rubber = new T.MeshStandardMaterial({
    color: "#4a4058",
    roughness: 0.92,
  });
  const kit = new T.Group();
  pivot.add(kit);
  kit.scale.z = -1;
  function box(w, h, d, x, y, z, mat, parent = kit) {
    const mesh = new T.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.2),
      mat,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // Heavier Sentinel plate carrier and radio pack; lighter Infiltrator harness.
  box(sentinel ? 0.39 : 0.3, sentinel ? 0.43 : 0.3, 0.09, 0, 1.2, 0.17, armor);
  for (const x of [-0.11, 0, 0.11])
    box(0.08, 0.13, 0.065, x, 1.07, 0.23, cloth);
  box(
    sentinel ? 0.32 : 0.23,
    sentinel ? 0.43 : 0.29,
    0.14,
    0,
    1.22,
    -0.2,
    cloth,
  );
  box(0.055, sentinel ? 0.27 : 0.15, 0.045, 0.13, 1.49, -0.24, rubber);
  if (sentinel) {
    for (const x of [-0.27, 0.27]) {
      const pad = new T.Mesh(new T.SphereGeometry(0.1, 12, 8), armor);
      pad.scale.set(1, 0.8, 0.8);
      pad.position.set(x, 1.39, 0);
      kit.add(pad);
    }
  } else {
    const strap = box(0.045, 0.47, 0.025, 0, 1.24, 0.23, rubber);
    strap.rotation.z = -0.48;
    box(0.13, 0.17, 0.075, 0.2, 0.83, -0.03, cloth);
  }
  model.updateWorldMatrix(true, true);
  const kitAnchor = pivot.worldToLocal(
    bones.Spine2.getWorldPosition(new T.Vector3()),
  );
  root.userData.character = {
    kitAnchor,
    pivot,
    model,
    bones,
    mixer,
    actions,
    kit,
    phase: 0,
    crouch: 0,
    prone: 0,
    speed: 0,
    materials: [cloth, armor, rubber],
  };
  return root;
}

export function animateCharacter(root, data, dt) {
  const rig = root.userData.character;
  if (!rig) return;
  dt = Math.min(dt, 0.1);
  const blend = 1 - Math.exp(-dt * 12);
  rig.crouch += ((data.crouch && !data.prone ? 1 : 0) - rig.crouch) * blend;
  rig.prone += ((data.prone ? 1 : 0) - rig.prone) * blend;
  rig.speed += ((data.moveSpeed || 0) - rig.speed) * blend;
  const moving = T.MathUtils.smoothstep(rig.speed, 0.05, 0.6),
    run =
      T.MathUtils.smoothstep(rig.speed, 3.6, 5.6) *
      (1 - rig.crouch) *
      (1 - rig.prone);
  rig.actions.Idle?.setEffectiveWeight(1 - moving * (1 - rig.prone));
  rig.actions.Walk?.setEffectiveWeight(moving * (1 - run) * (1 - rig.prone));
  rig.actions.Run?.setEffectiveWeight(moving * run * (1 - rig.prone));
  rig.actions.Walk?.setEffectiveTimeScale(Math.max(0.25, rig.speed / 2.5));
  rig.actions.Run?.setEffectiveTimeScale(Math.max(0.5, rig.speed / 5.6));
  rig.mixer.update(dt);
  rig.phase += dt * Math.max(0.5, rig.speed) * 3;
  const { bones, crouch: c, prone: p } = rig;
  // Pose the actual joints instead of scaling the body. Native rig is Z-up.
  function bend(name, x, y = 0, z = 0) {
    const b = bones[name];
    if (b) {
      b.rotateX(x);
      b.rotateY(y);
      b.rotateZ(z);
    }
  }
  bend("LeftUpLeg", -0.72 * c);
  bend("RightUpLeg", -0.72 * c);
  bend("LeftLeg", 1.35 * c);
  bend("RightLeg", 1.35 * c);
  bend("Spine", 0.18 * c);
  bend("Neck", -0.12 * c);
  function aim(name, childName, direction, weight = p) {
    const bone = bones[name],
      child = bones[childName];
    if (!bone || !child) return;
    rig.model.updateWorldMatrix(true, true);
    const from = bone.getWorldPosition(new T.Vector3());
    const current = child
      .getWorldPosition(new T.Vector3())
      .sub(from)
      .normalize();
    const desired = new T.Vector3(...direction).transformDirection(
      rig.pivot.matrixWorld,
    );
    const delta = new T.Quaternion().setFromUnitVectors(current, desired);
    const world = bone
      .getWorldQuaternion(new T.Quaternion())
      .premultiply(delta);
    const local = bone.parent
      .getWorldQuaternion(new T.Quaternion())
      .invert()
      .multiply(world);
    bone.quaternion.slerp(local, weight);
  }
  if (p > 0.001) {
    // Aim joint chains in model space so left/right bone axes cannot invert
    // the crawl. Elbows lead, knees stay low, alternating with forward motion.
    const crawl = Math.sin(rig.phase) * 0.12 * moving;
    for (const [side, sign] of [
      ["Left", -1],
      ["Right", 1],
    ]) {
      aim(side + "UpLeg", side + "Leg", [sign * 0.12, -1, 0.06]);
      aim(side + "Leg", side + "Foot", [
        sign * 0.08,
        -1,
        -0.12 - Math.max(0, sign * crawl),
      ]);
      aim(side + "Arm", side + "ForeArm", [
        sign * 0.5,
        0.75 + sign * crawl,
        -0.3,
      ]);
      aim(side + "ForeArm", side + "Hand", [-sign * 0.25, 1, 0.1]);
    }
    bend("Neck", -0.3 * p);
  }
  rig.pivot.rotation.x = (-Math.PI / 2) * p;
  rig.pivot.position.y = -0.4 * c * (1 - p) + 0.3 * p;
  rig.pivot.position.z = -0.6 * p;
  rig.model.updateWorldMatrix(true, true);
  rig.kit.position
    .copy(
      rig.pivot.worldToLocal(bones.Spine2.getWorldPosition(new T.Vector3())),
    )
    .sub(rig.kitAnchor);
}
