import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  BEACH,
  BIN,
  BUCKET,
  DROP_RADIUS,
  SHORE,
  waveReach,
} from "../shared/seaSweeper.js";

// A sandy beach seen from high up at a slight tilt, with the sea along the
// top. Waves roll up the sand and pull back; the trash and shells are free
// low-poly models (credited in the README) in src/assets/sea-sweeper/.
const urls = import.meta.glob("./assets/sea-sweeper/*.glb", {
  eager: true,
  query: "?url",
  import: "default",
});
const modelUrl = (name) => urls[`./assets/sea-sweeper/${name}.glb`];

// How big each model is drawn: the longest side, in metres.
const SIZE = {
  clam: 0.96,
  mussel: 0.9,
  spiral: 0.96,
  starfish: 1.14,
  sanddollar: 0.9,
  golden: 1.02,
  bottle: 1.26,
  can: 0.78,
  bag: 1.02,
  cup: 0.84,
  foam: 1.02,
  flipflop: 1.14,
  bin: 2.2,
  bucket: 1.8,
  shovel: 1.6,
};
// Trash kinds from shared/seaSweeper.js → model files.
const TRASH_MODEL = {
  bottle: "bottle",
  can: "can",
  bag: "bag",
  cup: "cup",
  flipflop: "flipflop",
  foam: "foam",
};
// How each model lies on the sand so it's easy to recognise from the game's
// camera (picked by rendering every model from that angle): [x, y, z]
// rotations, and whether a random full turn still shows its good side (flat
// things) or it should only wobble a little (things seen from one side).
const Q = Math.PI / 2;
const POSE = {
  clam: { turn: [0, 0, Q] }, // standing on its edge, the two halves showing
  mussel: { turn: [Q, 0, 0] }, // open, the pale inside showing
  spiral: { turn: [0, 0, Q] }, // the spiral facing the camera
  starfish: { turn: [0, 0, 0], spin: true },
  sanddollar: { turn: [0, 0, 0], spin: true }, // the star on top
  golden: { turn: [0, 0, 0], spin: true }, // the spiral on top
  bottle: { turn: [0, 0, Q] }, // on its side, across the screen
  can: { turn: [Q, 0, 0] }, // tipped toward the camera: top and stripes
  bag: { turn: [-Q, 0, 0] }, // the tied knot on top
  cup: { turn: [0, 0, -Q] }, // on its side, open end showing
  foam: { turn: [0, 0, 0], spin: true }, // the open clamshell box
  flipflop: { turn: [0, 0, 0], spin: true },
};
// How far an item that shouldn't spin all the way round may turn either way.
const WOBBLE = 0.5;

const LOOK = new T.Vector3(0, 0, 0.2);
// The part of the beach that must always be on screen.
const FIT = [
  [-BEACH.x - 0.3, 0, SHORE - 0.8],
  [BEACH.x + 0.3, 0, SHORE - 0.8],
  [-BEACH.x - 0.3, 0, BEACH.z + 0.5],
  [BEACH.x + 0.3, 0, BEACH.z + 0.5],
  [BIN.x - 0.6, 2.6, BIN.z],
  [BUCKET.x + 0.6, 2, BUCKET.z],
];

export function createSeaSweeperScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#7fd0e6");
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 120);
  camera.position.set(0, 19, 9.5);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff8e6", "#c9a66b", 2.2));
  const sun = new T.DirectionalLight("#fff0d2", 2.6);
  sun.position.set(-6, 16, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -12,
    right: 12,
    top: 10,
    bottom: -10,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.85) =>
    new T.MeshStandardMaterial({ color, roughness });

  // --- Sand and sea -------------------------------------------------------
  const sand = new T.Mesh(new T.PlaneGeometry(60, 30), mat("#f0d9a4", 1));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, SHORE + 15);
  sand.receiveShadow = true;
  scene.add(sand);
  // Darker wet sand where the waves reach; it fades as the sand dries.
  const wetMaterial = new T.MeshBasicMaterial({
    color: "#c9ad72",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const wet = new T.Mesh(new T.PlaneGeometry(60, 1), wetMaterial);
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = 0.005;
  scene.add(wet);
  let wetTo = SHORE;

  // A towel for the eye, out of the way.
  const towel = new T.Mesh(new T.BoxGeometry(1.2, 0.02, 2), mat("#ff7f6e"));
  towel.position.set(-2.4, 0.01, 3.4);
  towel.rotation.y = 0.35;
  towel.receiveShadow = true;
  scene.add(towel);
  const stripe = new T.Mesh(
    new T.BoxGeometry(1.21, 0.025, 0.3),
    mat("#fff4dc"),
  );
  stripe.position.set(0, 0.002, 0.4);
  towel.add(stripe);
  const stripe2 = stripe.clone();
  stripe2.position.z = -0.4;
  towel.add(stripe2);

  // The sea: a deep plane plus the wave's sheet of shallow water and a foam
  // line along its front edge, both following waveReach().
  const deep = new T.Mesh(
    new T.PlaneGeometry(80, 40),
    new T.MeshStandardMaterial({ color: "#2f9fc4", roughness: 0.35 }),
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.set(0, 0.02, SHORE - 20 - 0.6);
  scene.add(deep);
  const shallowMaterial = new T.MeshStandardMaterial({
    color: "#5cc4dc",
    roughness: 0.25,
    transparent: true,
    opacity: 0.88,
  });
  const shallow = new T.Mesh(new T.PlaneGeometry(80, 1), shallowMaterial);
  shallow.rotation.x = -Math.PI / 2;
  shallow.position.y = 0.3;
  scene.add(shallow);
  const foamMaterial = new T.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.9,
  });
  const foam = new T.Mesh(new T.PlaneGeometry(80, 0.32), foamMaterial);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.31;
  scene.add(foam);

  // --- Models -------------------------------------------------------------
  const loader = new GLTFLoader();
  const models = {};
  const ready = Promise.all(
    Object.keys(SIZE).map((name) =>
      loader
        .loadAsync(modelUrl(name))
        .then((gltf) => {
          const root = gltf.scene;
          root.traverse((node) => {
            if (node.isMesh) node.castShadow = node.receiveShadow = true;
          });
          // Centre it on the ground and scale it to SIZE.
          const holder = new T.Group();
          root.rotation.set(...(POSE[name]?.turn ?? [0, 0, 0]));
          holder.add(root);
          const box = new T.Box3().setFromObject(holder);
          const dims = box.getSize(new T.Vector3());
          const k = SIZE[name] / Math.max(dims.x, dims.y, dims.z);
          root.scale.setScalar(k);
          root.updateMatrixWorld(true);
          box.setFromObject(holder);
          const mid = box.getCenter(new T.Vector3());
          root.position.set(-mid.x, -box.min.y, -mid.z);
          models[name] = holder;
        })
        .catch((error) => console.warn(`Could not load ${name}`, error)),
    ),
  );
  const golden = new T.MeshStandardMaterial({
    color: "#ffd257",
    metalness: 0.6,
    roughness: 0.25,
    emissive: "#7a5200",
    emissiveIntensity: 0.35,
  });
  function copyOf(name, gold = false) {
    const source = models[name];
    if (!source) return null;
    const copy = source.clone(true);
    if (gold)
      copy.traverse((node) => {
        if (node.isMesh) node.material = golden;
      });
    return copy;
  }

  // The bin and the bucket, each on a ring that glows while you carry
  // something that goes there.
  function spot(at, color) {
    const group = new T.Group();
    group.position.set(at.x, 0, at.z);
    scene.add(group);
    const ring = new T.Mesh(
      new T.RingGeometry(DROP_RADIUS - 0.12, DROP_RADIUS, 48),
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
    const pad = new T.Mesh(
      new T.CircleGeometry(DROP_RADIUS - 0.12, 48),
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.015;
    group.add(pad);
    return { group, ring, pad, bump: 0, model: null };
  }
  const bin = spot(BIN, "#5bd17a");
  const bucket = spot(BUCKET, "#ff9fc4");
  ready.then(() => {
    bin.model = copyOf("bin");
    if (bin.model) {
      // A green bin, to match its ring and the trash spots.
      bin.model.traverse((node) => {
        if (node.isMesh) {
          node.material = node.material.clone();
          node.material.color.set("#6fe08c");
        }
      });
      bin.group.add(bin.model);
    }
    bucket.model = copyOf("bucket");
    if (bucket.model) {
      // Paint the wooden pail in beach-toy colours.
      bucket.model.traverse((node) => {
        if (!node.isMesh) return;
        const name = node.material?.name;
        if (name === "Wood") node.material = mat("#ff6f9f", 0.5);
        else if (name === "DarkMetal" || name === "Metal")
          node.material = mat("#ffd84d", 0.5);
      });
      bucket.group.add(bucket.model);
    }
    const shovel = copyOf("shovel");
    if (shovel) {
      shovel.position.set(-1.3, 0.08, 0.55);
      shovel.rotation.set(0, 0.6, Math.PI / 2);
      bucket.group.add(shovel);
    }
  });

  // --- The walker ---------------------------------------------------------
  const walker = createAvatar("attacker", avatar, false);
  walker.scale.setScalar(1.1);
  scene.add(walker);

  // Things on the sand, keyed by the item itself (ids repeat between games).
  const shown = new Map();
  let carried = null; // { item, mesh }
  const point = new T.Vector3();
  const size = new T.Vector2();
  let clock = 0;

  const markGeometry = new T.CircleGeometry(0.66, 28);
  const markMaterial = (color) =>
    new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
  const trashMark = markMaterial("#5bd17a");
  const shellMark = markMaterial("#ff8fb8");

  function itemMesh(item) {
    const name = item.type === "trash" ? TRASH_MODEL[item.kind] : item.kind;
    const mesh = copyOf(name, item.kind === "golden");
    if (!mesh) return null;
    const holder = new T.Group();
    holder.add(mesh);
    mesh.rotation.y = POSE[name]?.spin
      ? item.turn
      : (item.turn / (Math.PI * 2) - 0.5) * 2 * WOBBLE;
    // A soft spot underneath in the colour of where it goes: green for the
    // bin, pink for the bucket.
    const mark = new T.Mesh(
      markGeometry,
      item.type === "trash" ? trashMark : shellMark,
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.012;
    mark.name = "mark";
    holder.add(mark);
    if (item.kind === "golden") {
      const glow = new T.Mesh(
        new T.CircleGeometry(0.42, 24),
        new T.MeshBasicMaterial({
          color: "#fff3a0",
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.01;
      glow.name = "glow";
      holder.add(glow);
    }
    scene.add(holder);
    return holder;
  }

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      camera.aspect = width / height;
      for (let k = 0; k < 4; k++) {
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        let most = 0;
        for (const [x, y, z] of FIT) {
          point.set(x, y, z).project(camera);
          most = Math.max(most, Math.abs(point.x), Math.abs(point.y));
        }
        const tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * most;
        camera.fov = T.MathUtils.radToDeg(2 * Math.atan(tan / 0.97));
      }
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  return {
    ready,
    // Canvas-relative pixels for a point on the beach (for labels).
    toScreen(x, y, z) {
      point.set(x, y, z).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    // A bump on the bin or bucket when something goes in.
    bump(which) {
      (which === "bin" ? bin : bucket).bump = 0.35;
    },
    draw(dt, game) {
      if (!fit()) return;
      clock += dt;

      // Sea: a gentle lap at the shore, plus the tide's wave.
      const lap = Math.sin(clock * 1.3) * 0.12;
      const reach = Math.max(waveReach(game), SHORE + lap);
      const far = SHORE - 1.2;
      shallow.scale.y = reach - far;
      shallow.position.z = (reach + far) / 2;
      foam.position.z = reach;
      foam.scale.y = 1 + Math.sin(clock * 4) * 0.15;
      wetTo = Math.max(wetTo - dt * 0.35, reach, SHORE);
      wet.scale.y = wetTo - SHORE + 0.5;
      wet.position.z = (wetTo + SHORE - 0.5) / 2;

      // Items on the sand pop in where the wave left them.
      const here = new Set();
      for (const item of game.items) {
        here.add(item);
        let entry = shown.get(item);
        if (!entry) {
          const mesh = itemMesh(item);
          if (!mesh) continue;
          entry = { mesh, age: 0 };
          shown.set(item, entry);
        }
        entry.age += dt;
        const pop = Math.min(1, entry.age / 0.35);
        entry.mesh.scale.setScalar(0.4 + 0.6 * pop);
        entry.mesh.position.set(item.x, Math.sin(pop * Math.PI) * 0.25, item.z);
        const glow = entry.mesh.getObjectByName("glow");
        if (glow) glow.material.opacity = 0.3 + Math.sin(clock * 5) * 0.2;
      }
      for (const [item, entry] of shown) {
        if (here.has(item)) continue;
        if (game.carrying === item && !carried) {
          carried = { item, mesh: entry.mesh };
        } else if (carried?.item !== item) {
          scene.remove(entry.mesh);
        }
        shown.delete(item);
      }
      if (carried && game.carrying !== carried.item) {
        scene.remove(carried.mesh);
        carried = null;
      }

      // The walker, with what they're carrying held over their head.
      const p = game.player;
      const was = { x: walker.position.x, z: walker.position.z };
      walker.position.set(p.x, 0, p.z);
      walker.rotation.y = p.facing;
      const moved = Math.hypot(p.x - was.x, p.z - was.z);
      animateAvatar(walker, { moveSpeed: dt > 0 ? moved / dt : 0 }, dt);
      if (carried) {
        carried.mesh.scale.setScalar(1);
        carried.mesh.position.set(p.x, 1.75 + Math.sin(clock * 6) * 0.05, p.z);
        carried.mesh.rotation.y += dt * 1.5;
        const mark = carried.mesh.getObjectByName("mark");
        if (mark) mark.visible = false;
      }

      // Light up where the carried thing goes.
      const want = game.carrying?.type;
      for (const [s, type] of [
        [bin, "trash"],
        [bucket, "shell"],
      ]) {
        const on = want === type;
        const pulse = on ? 0.6 + Math.sin(clock * 6) * 0.3 : 0.4;
        s.ring.material.opacity = pulse;
        s.pad.material.opacity = on ? 0.28 : 0.12;
        s.ring.scale.setScalar(on ? 1 + Math.sin(clock * 6) * 0.04 : 1);
        s.bump = Math.max(0, s.bump - dt);
        const b = s.bump > 0 ? Math.sin((s.bump / 0.35) * Math.PI) * 0.12 : 0;
        if (s.model) s.model.scale.set(1 + b, 1 - b * 0.6, 1 + b);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(walker);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose?.();
      });
      for (const m of Object.values(models))
        m.traverse((node) => {
          node.geometry?.dispose();
          node.material?.dispose?.();
        });
      markGeometry.dispose();
      trashMark.dispose();
      shellMark.dispose();
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
