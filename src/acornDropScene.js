import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  DIVIDER_TOP,
  HOME_X,
  LEFT,
  PEG_RADIUS,
  POTS,
  RAIL_Y,
  RIGHT,
  dividers,
  potCentre,
} from "../shared/acornDrop.js";

// A tall garden fence, painted sage green, facing the camera. Pegs stick out of it, the acorn
// falls in the plane z = ACORN_Z in front of the boards, and clay pots sit
// on the grass along the bottom between white picket dividers. Your critter
// walks the top rail.
const ACORN_Z = 0.3;
const PEG_LENGTH = 0.52;
const POT_HEIGHT = 0.74;
const SOIL_Y = 0.62;
const CRITTER_SCALE = 0.62;
const CRITTER_Z = -0.08;
// The part of the yard that must stay on screen whatever the aspect ratio.
const VIEW_HALF_WIDTH = 6.2;
const LOOK_X = -0.35; // a little left, to take in the ledge
const VIEW_HALF_HEIGHT = 5.45;
const LOOK = new T.Vector3(LOOK_X, 4.25, 0);
const PETALS = [
  "#ff8fb8",
  "#ffd84a",
  "#ffffff",
  "#c9a2ff",
  "#ff7b6b",
  "#7fd3f0",
];
// Flowers drawn per pot; the score keeps counting past this.
const MAX_FLOWERS = 12;
const FLOWER_SIZE = 1.7;

export function createAcornDropScene(canvas, avatar, pegs) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3f0");
  scene.fog = new T.Fog("#bfe3f0", 30, 70);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(LOOK_X, 4.9, 15);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff6dc", "#6c8f55", 2.1));
  const sun = new T.DirectionalLight("#fff1ce", 2.5);
  sun.position.set(-3, 12, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 11, bottom: -3 });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.75) =>
    new T.MeshStandardMaterial({ color, roughness });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  const round = new T.SphereGeometry(1, 18, 12);

  // --- Yard ---------------------------------------------------------------
  box(90, 0.2, 90, mat("#86b25a"), 0, -0.1, 0).castShadow = false;
  const stripe = mat("#93bd64");
  for (let i = -3; i <= 4; i++)
    box(90, 0.01, 1.4, stripe, 0, 0.005, i * 2.8).castShadow = false;
  const hedge = [mat("#5f8f45"), mat("#6e9d4c"), mat("#557f3e")];
  const blob = new T.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const x = (i - 7.5) * 2.2 + Math.sin(i * 2.3) * 0.5;
    if (Math.abs(x) < 5.4) continue;
    mesh(blob, hedge[i % 3], x, 1.1, -1.2 - (i % 2) * 0.7).scale.set(
      1.5,
      1.4,
      1.1,
    );
  }
  for (let i = 0; i < 10; i++) {
    const x = (i - 4.5) * 4.8;
    mesh(new T.CylinderGeometry(0.18, 0.26, 3, 8), mat("#7a5532"), x, 1.5, -14);
    mesh(blob, hedge[(i + 1) % 3], x, 4, -14).scale.set(2.1, 2.4, 1.9);
  }

  // --- The fence ------------------------------------------------------------
  // Painted boards so the brown acorn stands out; white trim and pegs.
  const boards = [mat("#a9c7a0"), mat("#9dbd95"), mat("#b3cfaa")];
  const trim = mat("#f6f1e4", 0.6);
  const plank = 0.6;
  for (let i = 0; i < (RIGHT - LEFT) / plank; i++) {
    const x = LEFT + plank / 2 + i * plank;
    box(
      plank - 0.03,
      RAIL_Y - 0.1,
      0.1,
      boards[i % 3],
      x,
      (RAIL_Y - 0.1) / 2,
      -0.06,
    );
  }
  // Cross rails behind the boards, peeking out at the sides.
  const postPaint = mat("#7fa37a");
  for (const y of [1.3, 4.4])
    box(RIGHT - LEFT, 0.24, 0.12, postPaint, 0, y, -0.17);
  // Posts at both ends, flush with the top rail the critter walks on.
  for (const x of [LEFT - 0.22, RIGHT + 0.22]) {
    box(0.44, RAIL_Y - 0.06, 0.56, postPaint, x, (RAIL_Y - 0.06) / 2, 0.1);
    const cap = box(0.52, 0.12, 0.64, trim, x, RAIL_Y - 0.05, 0.1);
    cap.castShadow = false;
  }
  box(RIGHT - LEFT + 0.2, 0.22, 0.42, trim, 0, RAIL_Y - 0.11, -0.09);

  // The ledge on the left post where the critter picks up each acorn, with
  // a little basket of the acorns still to come.
  const LEDGE_LEFT = HOME_X - 0.62;
  const LEDGE_RIGHT = LEFT - 0.4;
  box(
    LEDGE_RIGHT - LEDGE_LEFT,
    0.14,
    0.6,
    trim,
    (LEDGE_LEFT + LEDGE_RIGHT) / 2,
    RAIL_Y - 0.07,
    0.02,
  );
  const bracket = box(
    0.1,
    0.75,
    0.1,
    postPaint,
    LEDGE_LEFT + 0.35,
    RAIL_Y - 0.42,
    0.02,
  );
  bracket.rotation.z = -0.62;

  // --- Pegs: dowels with rounded white knobs -----------------------------
  const dowel = new T.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, PEG_LENGTH, 12);
  dowel.rotateX(Math.PI / 2);
  const dowelWood = mat("#e6dcc4", 0.6);
  const knobWood = mat("#fbf8ef", 0.45);
  const pegModels = pegs.map((peg) => {
    const g = new T.Group();
    g.position.set(peg.x, peg.y, 0);
    mesh(dowel, dowelWood, 0, 0, PEG_LENGTH / 2, g);
    mesh(round, knobWood, 0, 0, PEG_LENGTH, g).scale.set(0.125, 0.125, 0.07);
    scene.add(g);
    return { group: g, wobble: 0 };
  });

  // --- Pots and the pickets between them ------------------------------------
  const clay = mat("#c7643a", 0.8);
  clay.side = T.DoubleSide;
  const clayRim = mat("#d9774b", 0.8);
  const soil = mat("#5a3a22", 1);
  const potBody = new T.CylinderGeometry(0.41, 0.3, POT_HEIGHT, 22, 1, true);
  const pots = [];
  for (let pot = 0; pot < POTS; pot++) {
    const g = new T.Group();
    g.position.set(potCentre(pot), 0, ACORN_Z);
    mesh(potBody, clay, 0, POT_HEIGHT / 2, 0, g);
    const rim = mesh(
      new T.TorusGeometry(0.42, 0.05, 8, 26),
      clayRim,
      0,
      POT_HEIGHT,
      0,
      g,
    );
    rim.rotation.x = Math.PI / 2;
    mesh(new T.CircleGeometry(0.39, 22), soil, 0, SOIL_Y, 0, g).rotation.x =
      -Math.PI / 2;
    mesh(new T.CircleGeometry(0.3, 22), clay, 0, 0.01, 0, g).rotation.x =
      -Math.PI / 2;
    scene.add(g);
    pots.push({ group: g, flowers: [], bounce: 0 });
  }
  const picketPaint = mat("#f6f1e4", 0.6);
  const slat = new T.BoxGeometry(0.1, DIVIDER_TOP, 0.72);
  const point = new T.ConeGeometry(0.075, 0.16, 4);
  for (const x of dividers()) {
    mesh(slat, picketPaint, x, DIVIDER_TOP / 2, ACORN_Z);
    const tip = mesh(point, picketPaint, x, DIVIDER_TOP + 0.08, ACORN_Z);
    tip.rotation.y = Math.PI / 4;
  }

  // --- Flowers ----------------------------------------------------------------
  const stemGreen = mat("#4f9a3a");
  const leafGreen = mat("#62b046");
  const centreYellow = mat("#ffcf3a", 0.5);
  const petalMats = PETALS.map((c) => mat(c, 0.5));
  const stemGeometry = new T.CylinderGeometry(0.018, 0.022, 1, 6);
  let flowerSeed = 7;
  const rand = () => {
    flowerSeed = (Math.imul(flowerSeed, 1664525) + 1013904223) >>> 0;
    return flowerSeed / 2 ** 32;
  };
  function makeFlower() {
    const g = new T.Group();
    const height = 0.16 + rand() * 0.22;
    const stem = mesh(stemGeometry, stemGreen, 0, height / 2, 0, g);
    stem.scale.y = height;
    const leaf = mesh(round, leafGreen, 0.05, height * 0.4, 0, g);
    leaf.scale.set(0.07, 0.02, 0.035);
    leaf.rotation.z = 0.6;
    const head = new T.Group();
    head.position.y = height;
    head.rotation.x = 0.5; // face the camera a little
    g.add(head);
    const petal = petalMats[Math.floor(rand() * petalMats.length)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = mesh(
        round,
        petal,
        Math.cos(a) * 0.07,
        0.01,
        Math.sin(a) * 0.07,
        head,
      );
      p.scale.set(0.06, 0.02, 0.045);
      p.rotation.y = -a;
    }
    mesh(round, centreYellow, 0, 0.025, 0, head).scale.set(0.045, 0.03, 0.045);
    g.rotation.set(
      (rand() - 0.5) * 0.4,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.4,
    );
    return g;
  }

  // --- Acorns -------------------------------------------------------------
  const nutBrown = mat("#b4793e", 0.45);
  const capBrown = mat("#6e4a26", 0.95);
  function makeAcorn() {
    const g = new T.Group();
    mesh(round, nutBrown, 0, -0.02, 0, g).scale.set(0.15, 0.17, 0.15);
    mesh(round, mat("#c98d4f", 0.4), 0.04, 0.0, 0.08, g).scale.set(
      0.06,
      0.08,
      0.05,
    );
    const cap = mesh(
      new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      capBrown,
      0,
      0.06,
      0,
      g,
    );
    cap.scale.set(0.17, 0.11, 0.17);
    mesh(
      new T.CylinderGeometry(0.018, 0.025, 0.09, 6),
      capBrown,
      0,
      0.19,
      0,
      g,
    );
    return g;
  }
  const acornPool = [];
  const acornModels = [];

  const wicker = mat("#b07235", 0.8);
  wicker.side = T.DoubleSide;
  const basket = new T.Group();
  basket.position.set(LEDGE_LEFT + 0.24, RAIL_Y, 0.08);
  mesh(
    new T.CylinderGeometry(0.19, 0.14, 0.17, 18, 1, true),
    wicker,
    0,
    0.085,
    0,
    basket,
  );
  mesh(
    new T.CylinderGeometry(0.14, 0.14, 0.02, 18),
    wicker,
    0,
    0.01,
    0,
    basket,
  );
  const basketRim = mesh(
    new T.TorusGeometry(0.19, 0.025, 6, 20),
    mat("#8f5726", 0.8),
    0,
    0.17,
    0,
    basket,
  );
  basketRim.rotation.x = Math.PI / 2;
  scene.add(basket);
  const spare = [
    [-0.06, 0.12, 0.04],
    [0.07, 0.12, 0.03],
    [0, 0.13, -0.07],
    [-0.02, 0.21, 0.01],
    [0.06, 0.2, -0.04],
  ].map(([x, y, z], i) => {
    const a = makeAcorn();
    a.scale.setScalar(0.62);
    a.position.set(x, y, z);
    a.rotation.set(0.3 * i, i * 1.3, 0.4 - 0.2 * i);
    basket.add(a);
    return a;
  });

  // --- Your critter on the rail ---------------------------------------------
  const critter = createAvatar("attacker", avatar, false);
  critter.scale.setScalar(CRITTER_SCALE);
  critter.position.set(0, RAIL_Y, CRITTER_Z);
  critter.rotation.y = Math.PI; // rigs face -Z; turn to face the camera
  scene.add(critter);
  const held = makeAcorn();
  held.position.set(0, 0, ACORN_Z);
  scene.add(held);
  let cheer = 0;

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  const screenPoint = new T.Vector3();
  const ray = new T.Raycaster();
  const fencePlane = new T.Plane(new T.Vector3(0, 0, 1), -ACORN_Z);
  let clock = 0;

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      const distance = camera.position.distanceTo(LOOK);
      const tanHalf = Math.max(
        VIEW_HALF_HEIGHT / distance,
        VIEW_HALF_WIDTH / (aspect * distance),
      );
      camera.fov = T.MathUtils.radToDeg(2 * Math.atan(tanHalf));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  return {
    // The rail x under a screen position (for tap-to-walk).
    aimX(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      return ray.ray.intersectPlane(fencePlane, screenPoint)
        ? screenPoint.x
        : null;
    },
    // Canvas-relative pixels for a point in the yard (for labels and pops).
    toScreen(x, y, z = ACORN_Z) {
      screenPoint.set(x, y, z).project(camera);
      return {
        x: ((screenPoint.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - screenPoint.y) / 2) * canvas.clientHeight,
      };
    },
    // Where to draw a pot's number (on the front of the pot).
    potLabel(pot) {
      return this.toScreen(potCentre(pot), POT_HEIGHT * 0.42, ACORN_Z + 0.42);
    },
    potTop(pot) {
      return this.toScreen(potCentre(pot), POT_HEIGHT + 0.7, ACORN_Z);
    },
    // An acorn landed: grow `count` flowers in that pot.
    bloom(pot, count) {
      const p = pots[pot];
      p.bounce = 0.4;
      for (let i = 0; i < count; i++) {
        if (p.flowers.length >= MAX_FLOWERS) break;
        const f = makeFlower();
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 0.22;
        f.position.set(Math.cos(a) * r, SOIL_Y, Math.sin(a) * r * 0.8);
        f.scale.setScalar(0.001);
        p.group.add(f);
        p.flowers.push({ model: f, age: -i * 0.12 });
      }
    },
    clearGarden() {
      for (const p of pots) {
        for (const f of p.flowers) p.group.remove(f.model);
        p.flowers = [];
      }
    },
    cheer(seconds = 1.6) {
      cheer = seconds;
    },
    // view: { critter: { x, facing, walking }, holding, acorns: [{ x, y,
    // angle }], hit: [peg indices just touched] }
    draw(dt, view) {
      if (!fit()) return;
      clock += dt;
      const c = view.critter;
      critter.position.x = c.x;
      const turn = Math.PI + (c.walking && cheer <= 0 ? c.facing * 1.15 : 0);
      critter.rotation.y += (turn - critter.rotation.y) * Math.min(1, dt * 10);
      cheer = Math.max(0, cheer - dt);
      animateAvatar(
        critter,
        { moveSpeed: c.walking && cheer <= 0 ? 1.6 : 0 },
        dt,
        cheer > 0 ? "win" : undefined,
      );
      held.visible = view.holding;
      spare.forEach((a, i) => (a.visible = i < (view.spare ?? 0)));
      held.position.x = c.x;
      held.position.y = RAIL_Y + 0.38 + Math.sin(clock * 6) * 0.02;
      held.rotation.z = Math.sin(clock * 3) * 0.15;

      while (acornModels.length < view.acorns.length) {
        const model = acornPool.pop() ?? makeAcorn();
        scene.add(model);
        acornModels.push(model);
      }
      while (acornModels.length > view.acorns.length) {
        const model = acornModels.pop();
        scene.remove(model);
        acornPool.push(model);
      }
      view.acorns.forEach((a, i) => {
        acornModels[i].position.set(a.x, a.y, ACORN_Z);
        acornModels[i].rotation.z = a.angle;
      });

      for (const index of view.hit ?? []) pegModels[index].wobble = 0.25;
      for (const peg of pegModels) {
        if (!peg.wobble) continue;
        peg.wobble = Math.max(0, peg.wobble - dt);
        const s = 1 + Math.sin(peg.wobble * 50) * peg.wobble * 0.6;
        peg.group.scale.set(s, s, 1);
      }

      for (const p of pots) {
        p.bounce = Math.max(0, p.bounce - dt);
        const squash = Math.sin(p.bounce * 24) * p.bounce * 0.25;
        p.group.scale.set(1 + squash, 1 - squash, 1 + squash);
        for (const f of p.flowers) {
          if (f.age >= 0.6) continue;
          f.age += dt;
          const g = T.MathUtils.clamp(f.age / 0.5, 0, 1);
          // Pop up with a little overshoot.
          f.model.scale.setScalar(
            FLOWER_SIZE *
              Math.max(0.001, g * (1 + Math.sin(g * Math.PI) * 0.3)),
          );
        }
      }
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(critter);
      for (const model of acornPool) scene.add(model);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
