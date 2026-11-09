import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { animateRobot, createRobot } from "./robot.js";
import { AVATARS, COLORS, avatarChoice } from "../shared/avatars.js";

const critterFiles = import.meta.glob(
  "../ChibiCritters3D_v1.0/Models/GLB/*.glb",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

const critterNames = {
  frog: "PopFrog",
  chick: "PopChick",
  axolotl: "PopAxolotl",
  bear: "PopBear",
  bunny: "PopBunny",
  capybara: "PopCapybara",
  cat: "PopCat",
  dragon: "PopDragon",
  fox: "PopFox",
  owl: "PopOwl",
  panda: "PopPanda",
  penguin: "PopPenguin",
  pig: "PopPig",
  raccoon: "PopRaccoon",
  "red-panda": "PopRedPanda",
  shiba: "PopShiba",
  squirrel: "PopSquirrel",
  giraffe: "PopGiraffe",
  astronaut: "PopAstronaut",
  baby: "PopBaby",
  shark: "PopShark",
  dog: "Dog",
  "classic-frog": "Frog",
  "classic-chick": "Chick",
  "classic-axolotl": "Axolotl",
  "classic-bear": "Bear",
  "classic-bunny": "Bunny",
  "classic-capybara": "Capybara",
  "classic-cat": "Cat",
  "classic-dragon": "Dragon",
  "classic-fox": "Fox",
  "classic-owl": "Owl",
  "classic-panda": "Panda",
  "classic-penguin": "Penguin",
  "classic-pig": "Pig",
  "classic-raccoon": "Raccoon",
  "classic-red-panda": "RedPanda",
  "classic-shiba": "Shiba",
  "classic-squirrel": "Squirrel",
  "classic-giraffe": "Giraffe",
  "classic-astronaut": "Astronaut",
  "classic-baby": "Baby",
  "classic-shark": "Shark",
};

const visual = {
  height: 1.78,
  rotation: Math.PI,
  groundOffset: 0,
  fade: 0.14,
  clips: {
    idle: "Idle",
    walk: "Walk",
    run: "Run",
    jump: "Jump",
    win: "Wave",
    hit: "Hit",
    lose: "Death",
  },
};
const templates = new Map();

export function loadCritter(id) {
  const url =
    critterFiles[`../ChibiCritters3D_v1.0/Models/GLB/${critterNames[id]}.glb`];
  if (!url) return Promise.resolve(null);
  if (!templates.has(id)) {
    const pending = new GLTFLoader().loadAsync(url).catch((error) => {
      console.warn(`Could not load ${id} from ${url}`, error);
      return null;
    });
    templates.set(id, pending);
  }
  return templates.get(id);
}

function disposeMeshes(root, retainedMaterials) {
  const materials = new Set();
  root.traverse((node) => {
    node.geometry?.dispose();
    if (node.material && !retainedMaterials?.has(node.material))
      materials.add(node.material);
  });
  for (const material of materials) material.dispose();
}

export function createCritter(asset) {
  const pivot = new T.Group();
  const model = clone(asset.scene);
  model.rotation.y += visual.rotation;
  const bounds = new T.Box3().setFromObject(model, true);
  const scale = visual.height / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y += visual.groundOffset - bounds.min.y * scale;
  pivot.add(model);
  const skeletons = new Set();
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = node.receiveShadow = true;
    node.material = node.material.clone();
    if (node.isSkinnedMesh) {
      skeletons.add(node.skeleton);
      // The pose can extend beyond the rest-pose bounds.
      node.frustumCulled = false;
    }
  });
  const mixer = new T.AnimationMixer(model);
  const actions = {};
  for (const [state, name] of Object.entries(visual.clips)) {
    const source = T.AnimationClip.findByName(asset.animations, name);
    if (!source) continue;
    // The skeleton's root stays in place while gameplay moves the actor.
    const tracks = source.tracks.filter(
      (track) => track.name !== "root.position",
    );
    const action = mixer.clipAction(
      new T.AnimationClip(name, source.duration, tracks),
    );
    if (["jump", "hit", "lose"].includes(state)) {
      action.setLoop(T.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[state] = action;
  }
  return { pivot, model, mixer, actions, skeletons, action: null, hitTime: 0 };
}

export function createAvatar(team, choice, showBackpack = false) {
  const selected = avatarChoice(
    choice ?? {
      character: AVATARS[team === "defender" ? 1 : 0],
      color: team === "defender" ? "sky" : "sunshine",
    },
  );
  const root = new T.Group();
  root.userData.team = team;
  root.userData.avatar = JSON.stringify(selected);
  // Use the existing rig while assets are pending or if a load fails.
  const fallback = createRobot(team, showBackpack);
  root.add(fallback);
  const color = COLORS[selected.color];
  fallback.traverse((node) => {
    if (["ffb347", "5cc8ff"].includes(node.material?.color?.getHexString()))
      node.material.color.set(color);
  });
  root.userData.fallback = fallback;

  loadCritter(selected.character)
    .then((asset) => {
      if (!asset || root.userData.disposed) return;
      const rig = createCritter(asset);
      const pack = fallback.getObjectByName("backpack");
      const retainedMaterials = new Set();
      if (pack?.visible) {
        rig.pivot.add(pack);
        pack.traverse((node) => {
          if (node.material) retainedMaterials.add(node.material);
        });
      }
      disposeMeshes(fallback, retainedMaterials);
      root.remove(fallback);
      delete root.userData.fallback;
      root.userData.critter = rig;
      delete root.userData.soaked;
      root.add(rig.pivot);
      const marker = new T.Mesh(
        new T.RingGeometry(0.41, 0.5, 32),
        new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.02;
      root.add(marker);
    })
    .catch((error) => console.warn("Could not create avatar", error));
  return root;
}

export function animateAvatar(root, data, dt, outcome) {
  const rig = root.userData.critter;
  const hits = data.hits ?? 0;
  const hit = hits > (root.userData.animationHits ?? hits);
  root.userData.animationHits = hits;
  if (!rig) {
    const fallback = root.userData.fallback;
    if (fallback) {
      if (hit) fallback.userData.robot.startle = 1.2;
      animateRobot(fallback, data, dt);
    }
    return;
  }
  dt = Math.min(dt, 0.1);
  if (hit) rig.hitTime = rig.actions.hit?.getClip().duration ?? 0;
  const speed = data.moveSpeed || 0;
  const locomotion =
    speed > 3.6
      ? (rig.actions.run ?? rig.actions.walk)
      : speed > 0.05
        ? (rig.actions.walk ?? rig.actions.run)
        : rig.actions.idle;
  const state =
    outcome ??
    (rig.hitTime > 0
      ? "hit"
      : data.grounded === false && !data.onLadder
        ? "jump"
        : null);
  const action = rig.actions[state] ?? locomotion ?? rig.actions.idle;
  if (action && (action !== rig.action || (hit && state === "hit"))) {
    rig.action?.fadeOut(visual.fade);
    action.reset().setEffectiveWeight(1).play();
    if (action !== rig.action && rig.action) action.fadeIn(visual.fade);
    rig.action = action;
  }
  rig.hitTime = Math.max(0, rig.hitTime - dt);
  rig.mixer.update(dt);

  const blend = 1 - Math.exp(-dt * 12);
  const prone = data.prone ? 1 : 0;
  rig.pivot.rotation.x +=
    ((-Math.PI / 2) * prone - rig.pivot.rotation.x) * blend;
  rig.pivot.scale.y +=
    ((data.crouch && !prone ? 0.75 : 1) - rig.pivot.scale.y) * blend;
  rig.pivot.position.y += (0.3 * prone - rig.pivot.position.y) * blend;
}

// Detach shared GLB geometry before the scene's normal disposal traversal.
export function releaseAvatar(root) {
  root.userData.disposed = true;
  const rig = root.userData.critter;
  if (!rig) return;
  rig.mixer.stopAllAction();
  rig.mixer.uncacheRoot(rig.model);
  rig.model.traverse((node) => {
    if (node.isMesh) node.material.dispose();
  });
  for (const skeleton of rig.skeletons) skeleton.dispose();
  rig.model.removeFromParent();
  delete root.userData.critter;
}

export function disposeAvatar(root) {
  releaseAvatar(root);
  disposeMeshes(root);
}
