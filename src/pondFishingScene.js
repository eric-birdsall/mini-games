import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";

// The pond is an ellipse in front of the dock; you stand at its south end.
export const POND = { x: 0, z: -5.6, rx: 9.6, rz: 8.2 };
const CAST_NEAR = -2.4;
const CAST_FAR = -11.2;
export const CAST_TIME = 0.85;
export const REEL_PULL = 0.85;
export const REEL_LIFT = 0.55;
export const LOST_TIME = 0.7;
const HOOK_UP = new T.Vector3(0, 0.95, 0);
const DOCK_TOP = 0.42;

export function castDistance(z) {
  return T.MathUtils.clamp((CAST_NEAR - z) / (CAST_NEAR - CAST_FAR), 0, 1);
}

export function clampTarget(x, z) {
  z = T.MathUtils.clamp(z, CAST_FAR, CAST_NEAR);
  const dz = (z - POND.z) / (POND.rz - 1.2);
  const half = (POND.rx - 1.4) * Math.sqrt(Math.max(0, 1 - dz * dz));
  return { x: T.MathUtils.clamp(x, -half, half), z };
}

export function createPondFishingScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3ef");
  scene.fog = new T.Fog("#bfe3ef", 26, 60);
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 120);
  const lookAt = new T.Vector3(0, 0.2, -4.6);
  camera.position.set(2, 5.6, 8.4);
  camera.lookAt(lookAt);

  scene.add(new T.HemisphereLight("#fff6dc", "#6d8f5c", 2.2));
  const sun = new T.DirectionalLight("#fff1ce", 2.7);
  sun.position.set(-7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, extra = {}) =>
    new T.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  const flatEllipse = (rx, rz, material, y, segments = 64) => {
    const shape = mesh(
      new T.CircleGeometry(1, segments),
      material,
      POND.x,
      y,
      POND.z,
    );
    shape.rotation.x = -Math.PI / 2;
    shape.scale.set(rx, rz, 1);
    shape.castShadow = false;
    return shape;
  };

  // Ground, shore and water.
  box(120, 0.2, 120, mat("#86ad58"), 0, -0.1, 0).castShadow = false;
  flatEllipse(POND.rx + 0.7, POND.rz + 0.7, mat("#c9b17e"), 0.005);
  flatEllipse(POND.rx + 0.15, POND.rz + 0.15, mat("#5e8f84"), 0.01);
  const water = flatEllipse(
    POND.rx,
    POND.rz,
    mat("#4f9fb6", { roughness: 0.22, metalness: 0.08 }),
    0.02,
  );
  const sparkle = new T.MeshBasicMaterial({
    color: "#e8fbff",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const glints = Array.from({ length: 22 }, (_, i) => {
    const angle = i * 2.399;
    const r = Math.sqrt((i + 0.5) / 22) * 0.85;
    const glint = mesh(
      new T.PlaneGeometry(0.5, 0.05),
      sparkle,
      POND.x + Math.cos(angle) * r * POND.rx,
      0.03,
      POND.z + Math.sin(angle) * r * POND.rz,
    );
    glint.rotation.x = -Math.PI / 2;
    glint.castShadow = false;
    glint.userData.phase = i * 1.7;
    return glint;
  });

  // Dock.
  const plank = [mat("#a87a4c"), mat("#9b6e42"), mat("#b48756")];
  const post = mat("#6c4c30");
  for (let i = 0; i < 9; i++)
    box(1.7, 0.08, 0.36, plank[i % 3], 0, DOCK_TOP - 0.04, 4.9 - i * 0.39);
  for (const x of [-0.78, 0.78])
    for (const z of [1.45, 3.1, 4.8])
      mesh(new T.CylinderGeometry(0.09, 0.1, 1.2, 10), post, x, -0.15, z);
  box(0.12, 0.1, 3.6, post, -0.78, DOCK_TOP - 0.12, 3.3);
  box(0.12, 0.1, 3.6, post, 0.78, DOCK_TOP - 0.12, 3.3);
  // Bait bucket on the dock.
  const bucket = mat("#6f9fc4", { metalness: 0.3 });
  mesh(
    new T.CylinderGeometry(0.2, 0.16, 0.34, 18),
    bucket,
    -0.55,
    DOCK_TOP + 0.17,
    3.0,
  );

  // Lily pads, reeds, rocks and trees.
  const pad = mat("#5f9c45");
  const padFlower = mat("#f6b7cf");
  const padGeometry = new T.CylinderGeometry(
    1,
    1,
    0.03,
    20,
    1,
    false,
    0.3,
    Math.PI * 2 - 0.6,
  );
  for (const [x, z, r] of [
    [-5.6, -3.6, 0.55],
    [-6.4, -5.2, 0.42],
    [-4.8, -8.4, 0.5],
    [5.2, -2.8, 0.48],
    [6.3, -6.6, 0.6],
    [3.6, -10.8, 0.45],
    [-2.6, -11.6, 0.4],
    [7.0, -4.3, 0.36],
  ]) {
    const lily = mesh(padGeometry, pad, x, 0.04, z);
    lily.scale.set(r, 1, r);
    lily.rotation.y = x * 1.3 + z;
    lily.castShadow = false;
    if (r > 0.5)
      mesh(new T.IcosahedronGeometry(0.13, 0), padFlower, x, 0.12, z);
  }
  const reed = mat("#5c8a3a");
  const cattail = mat("#6b4428");
  for (let i = 0; i < 46; i++) {
    const angle =
      Math.PI * 0.62 + (i / 46) * Math.PI * 1.9 + Math.sin(i * 7) * 0.05;
    const r = 1 + (i % 3) * 0.035;
    const x = POND.x + Math.cos(angle) * POND.rx * r;
    const z = POND.z + Math.sin(angle) * POND.rz * r;
    if (z > 1) continue;
    const height = 0.9 + ((i * 37) % 10) / 14;
    const stalk = mesh(
      new T.CylinderGeometry(0.025, 0.035, height, 6),
      reed,
      x,
      height / 2,
      z,
    );
    stalk.rotation.z = Math.sin(i * 3.1) * 0.12;
    if (i % 2 === 0)
      mesh(
        new T.CapsuleGeometry(0.06, 0.22, 4, 8),
        cattail,
        x,
        height + 0.08,
        z,
      );
  }
  const rock = mat("#8b9095");
  for (const [x, z, s] of [
    [-8.9, -1.2, 0.5],
    [9.6, -9, 0.7],
    [-3.4, 2.4, 0.38],
    [8.6, 0.8, 0.45],
  ])
    mesh(new T.DodecahedronGeometry(s), rock, x, s * 0.4, z).scale.y = 0.6;
  const wood = mat("#7c5636");
  const foliage = [mat("#5a8c47"), mat("#6f9d4c"), mat("#4f7f41")];
  for (let i = 0; i < 16; i++) {
    const angle = Math.PI * 0.95 + (i / 15) * Math.PI * 1.1;
    const x = Math.cos(angle) * (POND.rx + 4 + (i % 3) * 1.5);
    const z = POND.z + Math.sin(angle) * (POND.rz + 3.5 + (i % 2) * 2);
    const h = 2 + (i % 4) * 0.4;
    mesh(new T.CylinderGeometry(0.16, 0.24, h, 8), wood, x, h / 2, z);
    const crown = mesh(
      new T.IcosahedronGeometry(1.5 + (i % 3) * 0.3, 1),
      foliage[i % 3],
      x,
      h + 1.1,
      z,
    );
    crown.scale.y = 1.2;
  }

  // Fish shadows wandering under the surface.
  const shadowMaterial = new T.MeshBasicMaterial({
    color: "#173f4b",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const shadowGeometry = new T.CircleGeometry(1, 16);
  const fishShadows = Array.from({ length: 7 }, (_, i) => {
    const group = new T.Group();
    const body = new T.Mesh(shadowGeometry, shadowMaterial);
    body.rotation.x = -Math.PI / 2;
    body.scale.set(0.42, 0.15, 1);
    const tail = new T.Mesh(new T.CircleGeometry(1, 3), shadowMaterial);
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(0.14, 0.14, 1);
    tail.position.x = -0.48;
    group.add(body, tail);
    const size = i < 2 ? 1.6 : 0.8 + (i % 3) * 0.15;
    group.scale.setScalar(size);
    const start = clampTarget(Math.sin(i * 2.3) * 6, -3 - ((i * 1.7) % 8));
    group.position.set(start.x, 0.035, start.z);
    group.userData = {
      heading: i * 1.1,
      speed: 0.5 + (i % 3) * 0.2,
      wiggle: i,
      tail,
    };
    scene.add(group);
    return group;
  });

  // Angler, rod, line and bobber.
  const angler = createAvatar("attacker", avatar, false);
  angler.position.set(-0.32, DOCK_TOP, 1.75);
  scene.add(angler);
  const rod = new T.Group();
  rod.position.set(0.02, DOCK_TOP + 0.62, 1.45);
  scene.add(rod);
  const rodLength = 2.4;
  const rodGeometry = new T.CylinderGeometry(0.014, 0.035, rodLength, 8);
  rodGeometry.translate(0, rodLength / 2, 0);
  mesh(rodGeometry, mat("#3b5f86"), 0, 0, 0, rod);
  mesh(
    new T.CylinderGeometry(0.045, 0.045, 0.42, 10),
    mat("#2d2a28"),
    0,
    0.12,
    0,
    rod,
  );
  const reelSpool = mesh(
    new T.CylinderGeometry(0.08, 0.08, 0.06, 14),
    mat("#d9dde0", { metalness: 0.5 }),
    0.07,
    0.42,
    0,
    rod,
  );
  reelSpool.rotation.z = Math.PI / 2;
  const rodTip = new T.Object3D();
  rodTip.position.y = rodLength;
  rod.add(rodTip);

  const linePoints = 28;
  const lineGeometry = new T.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new T.BufferAttribute(new Float32Array(linePoints * 3), 3),
  );
  const line = new T.Line(
    lineGeometry,
    new T.LineBasicMaterial({ color: "#f7f7f2" }),
  );
  line.frustumCulled = false;
  scene.add(line);

  const bobber = new T.Group();
  const bobberTop = new T.SphereGeometry(
    0.17,
    18,
    10,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const bobberBottom = new T.SphereGeometry(
    0.17,
    18,
    10,
    0,
    Math.PI * 2,
    Math.PI / 2,
    Math.PI / 2,
  );
  mesh(bobberTop, mat("#e8473b"), 0, 0, 0, bobber);
  mesh(bobberBottom, mat("#fbf7ef"), 0, 0, 0, bobber);
  mesh(
    new T.CylinderGeometry(0.015, 0.015, 0.12, 6),
    mat("#e8473b"),
    0,
    0.22,
    0,
    bobber,
  );
  scene.add(bobber);

  const targetRing = new T.Mesh(
    new T.RingGeometry(0.42, 0.55, 40),
    new T.MeshBasicMaterial({
      color: "#fff3a6",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.045;
  scene.add(targetRing);
  const targetDot = new T.Mesh(
    new T.CircleGeometry(0.1, 20),
    targetRing.material,
  );
  targetDot.rotation.x = -Math.PI / 2;
  targetRing.add(targetDot);
  targetDot.rotation.x = 0;

  // Expanding ripples, reused from a small pool.
  const rippleGeometry = new T.RingGeometry(0.9, 1, 36);
  const ripples = Array.from({ length: 8 }, () => {
    const ring = new T.Mesh(
      rippleGeometry,
      new T.MeshBasicMaterial({
        color: "#eafaff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.userData = { age: 1, life: 1, size: 1 };
    scene.add(ring);
    return ring;
  });
  let nextRipple = 0;
  function ripple(x, z, size = 1, life = 1) {
    const ring = ripples[nextRipple++ % ripples.length];
    ring.position.set(x, 0.04, z);
    ring.userData = { age: 0, life, size };
    ring.visible = true;
  }

  // Catches that come up on the line, built hanging from their top.
  const catches = {};
  const fishModel = (body, belly, fin, size) => {
    const group = new T.Group();
    const inner = new T.Group();
    inner.rotation.z = Math.PI / 2;
    inner.position.y = -0.3 * size;
    group.add(inner);
    const torso = mesh(new T.SphereGeometry(1, 20, 14), body, 0, 0, 0, inner);
    torso.scale.set(0.3 * size, 0.15 * size, 0.1 * size);
    const under = mesh(
      new T.SphereGeometry(1, 16, 10),
      belly,
      0,
      -0.04 * size,
      0,
      inner,
    );
    under.scale.set(0.24 * size, 0.1 * size, 0.09 * size);
    const tail = mesh(
      new T.ConeGeometry(0.13 * size, 0.2 * size, 4),
      fin,
      -0.36 * size,
      0,
      0,
      inner,
    );
    tail.rotation.z = Math.PI / 2;
    tail.scale.z = 0.35;
    const top = mesh(
      new T.ConeGeometry(0.06 * size, 0.14 * size, 3),
      fin,
      0,
      0.15 * size,
      0,
      inner,
    );
    top.scale.z = 0.3;
    for (const side of [-1, 1]) {
      mesh(
        new T.SphereGeometry(0.03 * size, 10, 8),
        mat("#ffffff"),
        0.2 * size,
        0.04 * size,
        side * 0.07 * size,
        inner,
      );
      mesh(
        new T.SphereGeometry(0.016 * size, 8, 6),
        mat("#1d1d1d"),
        0.215 * size,
        0.045 * size,
        side * 0.09 * size,
        inner,
      );
    }
    return group;
  };
  catches.littleFish = fishModel(
    mat("#f39b3d"),
    mat("#ffd9a0"),
    mat("#e2702a"),
    1,
  );
  catches.bigFish = fishModel(
    mat("#4f86b5"),
    mat("#cfe4ef"),
    mat("#3b6a92"),
    1.75,
  );
  catches.goldenFish = fishModel(
    mat("#ffcf3d", { metalness: 0.45, roughness: 0.3, emissive: "#6b4b00" }),
    mat("#fff0a8", { metalness: 0.3, roughness: 0.3 }),
    mat("#f0a91f", { metalness: 0.4, roughness: 0.35 }),
    1.25,
  );
  {
    const boot = new T.Group();
    const leather = mat("#6e4a2d");
    box(0.2, 0.36, 0.22, leather, 0, -0.2, 0, boot);
    box(0.2, 0.14, 0.4, leather, 0, -0.42, 0.09, boot);
    box(0.22, 0.04, 0.42, mat("#2b2421"), 0, -0.5, 0.09, boot);
    box(0.22, 0.04, 0.24, mat("#8a6340"), 0, -0.03, 0, boot);
    catches.boot = boot;
  }
  {
    const can = new T.Group();
    mesh(
      new T.CylinderGeometry(0.1, 0.1, 0.3, 18),
      mat("#d8423a", { metalness: 0.4 }),
      0,
      -0.2,
      0,
      can,
    );
    mesh(
      new T.CylinderGeometry(0.1, 0.1, 0.03, 18),
      mat("#cfd5d8", { metalness: 0.7 }),
      0,
      -0.04,
      0,
      can,
    );
    mesh(
      new T.CylinderGeometry(0.101, 0.101, 0.08, 18),
      mat("#f4f1e8"),
      0,
      -0.2,
      0,
      can,
    );
    can.rotation.z = 0.5;
    catches.can = can;
  }
  {
    const sock = new T.Group();
    const cotton = mat("#efe8da");
    const stripe = mat("#5b9bd5");
    mesh(
      new T.CylinderGeometry(0.08, 0.08, 0.34, 14),
      cotton,
      0,
      -0.2,
      0,
      sock,
    );
    mesh(
      new T.CylinderGeometry(0.083, 0.083, 0.05, 14),
      stripe,
      0,
      -0.08,
      0,
      sock,
    );
    mesh(
      new T.CylinderGeometry(0.083, 0.083, 0.05, 14),
      stripe,
      0,
      -0.16,
      0,
      sock,
    );
    const foot = mesh(
      new T.CapsuleGeometry(0.08, 0.16, 6, 12),
      cotton,
      0,
      -0.38,
      0.1,
      sock,
    );
    foot.rotation.x = Math.PI / 2;
    mesh(
      new T.SphereGeometry(0.06, 10, 8),
      mat("#7aa64e"),
      0.05,
      -0.3,
      0.02,
      sock,
    ).scale.set(1, 0.4, 1.4);
    catches.sock = sock;
  }
  {
    const cup = new T.Group();
    mesh(
      new T.CylinderGeometry(0.12, 0.085, 0.32, 18),
      mat("#f5f1ea"),
      0,
      -0.22,
      0,
      cup,
    );
    mesh(
      new T.CylinderGeometry(0.121, 0.11, 0.08, 18),
      mat("#e65c8c"),
      0,
      -0.13,
      0,
      cup,
    );
    mesh(
      new T.CylinderGeometry(0.125, 0.125, 0.03, 18),
      mat("#ffffff"),
      0,
      -0.05,
      0,
      cup,
    );
    const straw = mesh(
      new T.CylinderGeometry(0.012, 0.012, 0.3, 6),
      mat("#58b4e8"),
      0.04,
      0.05,
      0,
      cup,
    );
    straw.rotation.z = -0.25;
    cup.rotation.z = -0.4;
    catches.cup = cup;
  }
  for (const model of Object.values(catches)) {
    model.visible = false;
    scene.add(model);
  }

  // Confetti for fish catches.
  const confetti = new T.Group();
  scene.add(confetti);
  const paper = new T.PlaneGeometry(0.08, 0.12);
  const confettiColors = ["#ffd953", "#ff8c6b", "#79c765", "#7fc8f5"].map(
    (color) => new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
  );
  for (let i = 0; i < 16; i++)
    confetti.add(new T.Mesh(paper, confettiColors[i % 4]));
  confetti.visible = false;

  const tip = new T.Vector3();
  const end = new T.Vector3();
  const control = new T.Vector3();
  const point = new T.Vector3();
  const ray = new T.Raycaster();
  const waterPlane = new T.Plane(new T.Vector3(0, 1, 0), -0.02);
  const size = new T.Vector2();
  let clock = 0;
  let rodAngle = -0.8;
  let rodSide = -0.08;
  let lastPhase = "";
  let lastNibble = -1;

  function setLine(sag) {
    control.lerpVectors(tip, end, 0.5);
    control.y -= sag;
    const positions = lineGeometry.attributes.position;
    for (let i = 0; i < linePoints; i++) {
      const t = i / (linePoints - 1);
      const a = (1 - t) ** 2;
      const b = 2 * (1 - t) * t;
      const c = t * t;
      positions.setXYZ(
        i,
        a * tip.x + b * control.x + c * end.x,
        a * tip.y + b * control.y + c * end.y,
        a * tip.z + b * control.z + c * end.z,
      );
    }
    positions.needsUpdate = true;
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      camera.aspect = aspect;
      // Keep the whole pond in view on tall, narrow screens.
      camera.fov =
        aspect < 1.25 ? Math.min(78, 48 * (1.25 / aspect) ** 0.75) : 48;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  return {
    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      if (!ray.ray.intersectPlane(waterPlane, point)) return null;
      return clampTarget(point.x, point.z);
    },
    // Canvas-relative pixel position of the bobber (for the bite marker).
    bobberOnScreen() {
      point.copy(bobber.position);
      point.y += 0.35;
      point.project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    draw(dt, view) {
      if (!resize()) return;
      clock += dt;
      const { phase, t, target, landing, kind } = view;

      // Water shimmer and wandering fish.
      for (const glint of glints) {
        glint.material.opacity = 0.5;
        glint.scale.x =
          0.6 + 0.4 * Math.sin(clock * 1.3 + glint.userData.phase);
      }
      sparkle.opacity = 0.35 + 0.15 * Math.sin(clock * 0.9);
      const approach = phase === "wait" || phase === "bite";
      const nearest = approach
        ? fishShadows.reduce((best, fish) =>
            fish.position.distanceTo(bobber.position) <
            best.position.distanceTo(bobber.position)
              ? fish
              : best,
          )
        : null;
      for (const fish of fishShadows) {
        const data = fish.userData;
        if (fish === nearest) {
          const dx = landing.x + 0.35 - fish.position.x;
          const dz = landing.z + 0.15 - fish.position.z;
          const want = Math.atan2(-dz, dx);
          data.heading +=
            Math.atan2(
              Math.sin(want - data.heading),
              Math.cos(want - data.heading),
            ) * Math.min(1, dt * 3);
          const distance = Math.hypot(dx, dz);
          const speed =
            Math.min(1.4, distance * 0.9) * (phase === "bite" ? 2 : 1);
          fish.position.x += Math.cos(data.heading) * speed * dt;
          fish.position.z -= Math.sin(data.heading) * speed * dt;
        } else {
          data.heading += Math.sin(clock * 0.4 + data.wiggle * 3) * dt * 0.8;
          fish.position.x += Math.cos(data.heading) * data.speed * dt;
          fish.position.z -= Math.sin(data.heading) * data.speed * dt;
          const nx = (fish.position.x - POND.x) / (POND.rx - 1.4);
          const nz = (fish.position.z - POND.z) / (POND.rz - 1.4);
          if (nx * nx + nz * nz > 1 || fish.position.z > 0.4) {
            data.heading = Math.atan2(
              fish.position.z - POND.z,
              POND.x - fish.position.x,
            );
            fish.position.x -= nx * dt;
            fish.position.z -= nz * dt;
          }
        }
        fish.rotation.y = data.heading;
        data.tail.rotation.z = Math.sin(clock * 9 + data.wiggle) * 0.4;
      }

      // Rod pose.
      let wantAngle = -0.8;
      if (phase === "cast") wantAngle = t < 0.22 ? 0.55 : -0.95;
      else if (phase === "bite") wantAngle = -0.85;
      else if (phase === "reel")
        wantAngle = -0.35 + Math.sin(clock * 22) * 0.04;
      else if (phase === "show") wantAngle = -0.25;
      rodAngle +=
        (wantAngle - rodAngle) * Math.min(1, dt * (phase === "cast" ? 16 : 7));
      rod.rotation.x = rodAngle;
      // Swing the catch out to the side so the angler doesn't hide it.
      const lifting =
        phase === "show" || (phase === "reel" && t > REEL_PULL * 0.6);
      rodSide += ((lifting ? -0.75 : -0.08) - rodSide) * Math.min(1, dt * 5);
      rod.rotation.z = rodSide;
      rodTip.getWorldPosition(tip);

      // Line end, bobber and catch.
      for (const model of Object.values(catches)) model.visible = false;
      bobber.visible = phase !== "ready";
      targetRing.visible = phase === "ready";
      if (phase === "ready") {
        targetRing.position.x = target.x;
        targetRing.position.z = target.z;
        const pulse = 1 + Math.sin(clock * 4) * 0.08;
        targetRing.scale.set(pulse, pulse, 1);
        targetRing.material.opacity = 0.65 + Math.sin(clock * 4) * 0.2;
        end.copy(tip).add(new T.Vector3(0, -0.7, 0));
        bobber.position.copy(end);
        setLine(0);
      } else if (phase === "cast") {
        const k = Math.min(1, t / CAST_TIME);
        if (t < 0.22) {
          end.copy(tip).add(new T.Vector3(0, -0.7, 0));
        } else {
          const f = Math.min(1, (t - 0.22) / (CAST_TIME - 0.22));
          end.set(
            T.MathUtils.lerp(tip.x, landing.x, f),
            T.MathUtils.lerp(tip.y, 0.04, f) + Math.sin(f * Math.PI) * 2.2,
            T.MathUtils.lerp(tip.z, landing.z, f),
          );
        }
        bobber.position.copy(end);
        setLine(0.2 * k);
      } else if (phase === "wait" || phase === "bite") {
        const nibbleAge = view.nibbleAt === undefined ? 9 : t - view.nibbleAt;
        let y = 0.04 + Math.sin(clock * 2.2) * 0.015;
        let wobble = 0;
        if (nibbleAge < 0.3) y -= Math.sin((nibbleAge / 0.3) * Math.PI) * 0.09;
        if (phase === "bite") {
          y = -0.1 + Math.sin(clock * 30) * 0.025;
          wobble = Math.sin(clock * 24) * 0.05;
        }
        bobber.position.set(landing.x + wobble, y, landing.z);
        end.copy(bobber.position);
        setLine(phase === "bite" ? 0.04 : 0.45);
        if (view.nibbleAt !== undefined && view.nibbleAt !== lastNibble) {
          lastNibble = view.nibbleAt;
          ripple(landing.x, landing.z, 0.5, 0.6);
        }
        if (
          phase === "bite" &&
          Math.floor(clock * 5) !== Math.floor((clock - dt) * 5)
        )
          ripple(landing.x, landing.z, 0.8, 0.7);
      } else if (phase === "reel") {
        const near = new T.Vector3(tip.x, 0.04, Math.min(tip.z + 0.2, 0.6));
        if (t < REEL_PULL) {
          const f = t / REEL_PULL;
          const s = f * f * (3 - 2 * f);
          end.set(
            T.MathUtils.lerp(landing.x, near.x, s),
            0.02 + Math.sin(clock * 26) * 0.02,
            T.MathUtils.lerp(landing.z, near.z, s),
          );
          bobber.position.copy(end).add(new T.Vector3(0, 0.05, 0.25));
          if (Math.floor(clock * 7) !== Math.floor((clock - dt) * 7))
            ripple(end.x, end.z, 0.45, 0.5);
        } else {
          const f = Math.min(1, (t - REEL_PULL) / REEL_LIFT);
          end.lerpVectors(near, tip.clone().sub(HOOK_UP), f * f * (3 - 2 * f));
          bobber.position.copy(end).add(new T.Vector3(0, 0.3, 0));
          const model = catches[kind];
          model.visible = true;
          model.position.copy(end);
          model.rotation.y = clock * 2;
          if (t - dt < REEL_PULL) ripple(near.x, near.z, 1.1, 0.9);
        }
        setLine(0.02);
      } else if (phase === "show") {
        end.copy(tip).sub(HOOK_UP);
        end.x += Math.sin(clock * 2.4) * 0.06;
        bobber.position.copy(end).add(new T.Vector3(0, 0.3, 0));
        const model = catches[kind];
        model.visible = true;
        model.position.copy(end);
        model.rotation.y = Math.sin(clock * 1.6) * 0.9;
        setLine(0);
      } else if (phase === "lost") {
        const f = Math.min(1, t / LOST_TIME);
        end.set(
          T.MathUtils.lerp(landing.x, tip.x, f),
          T.MathUtils.lerp(0.04, tip.y - 0.7, f) + Math.sin(f * Math.PI) * 0.8,
          T.MathUtils.lerp(landing.z, tip.z, f),
        );
        bobber.position.copy(end);
        setLine(0.1);
      }
      if (phase === "wait" && lastPhase === "cast") {
        ripple(landing.x, landing.z, 1, 1);
        ripple(landing.x, landing.z, 0.6, 0.7);
      }
      lastPhase = phase;

      for (const ring of ripples) {
        const data = ring.userData;
        if (!ring.visible) continue;
        data.age += dt;
        const f = data.age / data.life;
        if (f >= 1) {
          ring.visible = false;
          continue;
        }
        ring.scale.setScalar(0.15 + f * data.size);
        ring.material.opacity = 0.8 * (1 - f);
      }

      confetti.visible = phase === "show" && view.fish && t < 0.9;
      if (confetti.visible) {
        confetti.position.copy(end);
        confetti.children.forEach((piece, i) => {
          const angle = (i * Math.PI * 2) / confetti.children.length;
          const r = 0.1 + t * (1.2 + (i % 3) * 0.4);
          piece.position.set(
            Math.cos(angle) * r,
            t * (2.4 + (i % 4) * 0.4) - 4.2 * t * t,
            Math.sin(angle) * r,
          );
          piece.rotation.set(t * 9 + i, t * 7, angle);
          piece.scale.setScalar(1 - t / 0.9);
        });
      }

      animateAvatar(angler, { moveSpeed: 0 }, dt);
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(angler);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
