import * as T from "three";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import {
  BUBBLES,
  OBSTACLES,
  PATH,
  PATH_HALF,
  towerStats,
} from "../shared/popPatrol.js";

// Pop Patrol's backyard, seen from above the lawn at an angle: the bubble
// machine pokes through the fence on the left, the stepping-stone path winds
// across mowed stripes, and the house's back door is top right, where your
// character waits on the step. World +x is screen right, +z is screen down.

const BUBBLE_Y = 1.2;
const LOOK = 1.45; // bubbles drawn a bit bigger than they hit, to read from above

export function createPopPatrolScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color("#9fdcf5");
  const camera = new T.PerspectiveCamera(38, 1, 0.5, 200);
  scene.add(new T.HemisphereLight("#f2fbff", "#6f8a4a", 1.8));
  const sun = new T.DirectionalLight("#fff1d6", 2.4);
  sun.position.set(-14, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 24,
    bottom: -24,
    far: 80,
  });
  scene.add(sun);

  const disposables = [];
  const keep = (thing) => (disposables.push(thing), thing);
  const mat = (color, extra = {}) =>
    keep(new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));
  function mesh(geometry, material, x, y, z, parent = scene) {
    const m = new T.Mesh(keep(geometry), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  let seed = 77;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function painted(width, height, paint) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    paint(c.getContext("2d"), c);
    const map = keep(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return map;
  }

  // --- Lawn and path ---------------------------------------------------------
  const LAWN = { x: -21, z: -13, w: 42, h: 27, px: 36 };
  const lawnMap = painted(LAWN.w * LAWN.px, LAWN.h * LAWN.px, (g, c) => {
    const P = LAWN.px;
    const at = (x, z) => [(x - LAWN.x) * P, (z - LAWN.z) * P];
    g.fillStyle = "#79c35a";
    g.fillRect(0, 0, c.width, c.height);
    // Mowing stripes.
    for (let i = 0; i < LAWN.w; i += 3) {
      g.fillStyle = (i / 3) % 2 ? "#71ba52" : "#82cb62";
      g.fillRect(i * P, 0, 3 * P, c.height);
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = random() < 0.5 ? "#5fa94433" : "#a6e07a33";
      g.fillRect(random() * c.width, random() * c.height, 2, 6);
    }
    // A worn dirt trail with stepping stones on it.
    const trail = (width, style) => {
      g.strokeStyle = style;
      g.lineWidth = width * P;
      g.lineJoin = g.lineCap = "round";
      g.beginPath();
      PATH.forEach(([x, z], i) => g[i ? "lineTo" : "moveTo"](...at(x, z)));
      g.stroke();
    };
    trail(PATH_HALF * 2 + 0.5, "#6aa84a");
    trail(PATH_HALF * 2, "#c9a46b");
    trail(PATH_HALF * 2 - 0.5, "#d6b47c");
    for (let i = 1; i < PATH.length; i++) {
      const [ax, az] = PATH[i - 1];
      const [bx, bz] = PATH[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0.6; d < len; d += 1.25) {
        const [x, y] = at(
          ax + ((bx - ax) * d) / len,
          az + ((bz - az) * d) / len,
        );
        const r = (0.42 + random() * 0.1) * P;
        g.fillStyle = "#9a958c";
        g.beginPath();
        g.ellipse(x + 2, y + 3, r, r * 0.85, random() * 3, 0, 7);
        g.fill();
        g.fillStyle = ["#d9d4c7", "#cfc9ba", "#e2ddd0"][i % 3];
        g.beginPath();
        g.ellipse(x, y, r, r * 0.85, random() * 3, 0, 7);
        g.fill();
      }
    }
  });
  const lawn = mesh(
    new T.PlaneGeometry(LAWN.w, LAWN.h),
    keep(new T.MeshStandardMaterial({ map: lawnMap, roughness: 1 })),
    LAWN.x + LAWN.w / 2,
    0,
    LAWN.z + LAWN.h / 2,
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.castShadow = false;
  const outside = mesh(
    new T.PlaneGeometry(160, 120),
    mat("#6cae4e", { roughness: 1 }),
    0,
    -0.02,
    0,
  );
  outside.rotation.x = -Math.PI / 2;
  outside.castShadow = false;

  // --- Fence -----------------------------------------------------------------
  const wood = mat("#f4ecdc");
  const woodShade = mat("#d9cdb4");
  const pickets = [];
  const FENCE = { minX: -20, maxX: 20, minZ: -12.2, maxZ: 12.8 };
  const fenceLine = (ax, az, bx, bz, skip) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0.2; d < len; d += 0.42) {
      const x = ax + ((bx - ax) * d) / len,
        z = az + ((bz - az) * d) / len;
      if (skip?.(x, z)) continue;
      pickets.push([x, z, Math.atan2(bx - ax, bz - az)]);
    }
    const rail = box(
      0.08,
      0.12,
      len,
      woodShade,
      (ax + bx) / 2,
      0.5,
      (az + bz) / 2,
    );
    rail.rotation.y = Math.atan2(bx - ax, bz - az);
    const rail2 = rail.clone();
    rail2.position.y = 1;
    scene.add(rail2);
    if (skip) {
      // Rails stop at the gap for the bubble machine.
      rail.visible = rail2.visible = false;
      for (const [s, e] of [
        [az, -7.4],
        [-4.6, bz],
      ]) {
        for (const y of [0.5, 1]) {
          const r = box(
            0.08,
            0.12,
            Math.abs(e - s),
            woodShade,
            ax,
            y,
            (s + e) / 2,
          );
          r.castShadow = true;
        }
      }
    }
  };
  fenceLine(
    FENCE.minX,
    FENCE.minZ,
    FENCE.minX,
    FENCE.maxZ,
    (x, z) => Math.abs(z + 6) < 1.4,
  );
  fenceLine(FENCE.minX, FENCE.maxZ, FENCE.maxX, FENCE.maxZ);
  fenceLine(FENCE.maxX, FENCE.maxZ, FENCE.maxX, FENCE.minZ);
  fenceLine(FENCE.minX, FENCE.minZ, 7.6, FENCE.minZ);
  {
    const geometry = keep(new T.BoxGeometry(0.3, 1.3, 0.07));
    geometry.translate(0, 0.65, 0);
    const picket = new T.InstancedMesh(geometry, wood, pickets.length);
    const m = new T.Matrix4();
    pickets.forEach(([x, z, a], i) => {
      m.makeRotationY(a + Math.PI / 2).setPosition(x, 0, z);
      picket.setMatrixAt(i, m);
    });
    picket.castShadow = picket.receiveShadow = true;
    scene.add(picket);
  }

  // --- The house, its back door and step -------------------------------------
  {
    const walls = mat("#f6d9a8");
    box(13, 6, 7, walls, 14.5, 3, -16);
    const roofGeo = new T.CylinderGeometry(0.01, 5.2, 3, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roof = mesh(roofGeo, mat("#d4553f"), 14.5, 7.5, -16);
    roof.scale.set(1.85, 1, 1.05);
    box(1.8, 3.2, 0.2, mat("#3f7fbf"), 13, 1.85, -12.45);
    mesh(
      new T.SphereGeometry(0.1, 10, 8),
      mat("#ffd65a", { metalness: 0.6 }),
      13.6,
      1.8,
      -12.3,
    );
    for (const x of [9.6, 17.6]) {
      box(2.2, 1.8, 0.15, mat("#bfe8ff", { roughness: 0.2 }), x, 3.4, -12.45);
      box(2.6, 0.2, 0.3, wood, x, 2.4, -12.4);
    }
    box(3.2, 0.3, 1.4, mat("#b8b0a2"), 13, 0.15, -11.7);
    box(3.6, 0.18, 0.18, woodShade, 13, 0.1, -12.2);
  }

  // --- The neighbour's bubble machine, through the fence gap -----------------
  const machineWheel = new T.Group();
  {
    const body = mat("#ff7fb8");
    box(1.6, 1.2, 1.8, body, -21.3, 0.6, -6);
    box(1.7, 0.2, 1.9, mat("#ffd0e6"), -21.3, 1.25, -6);
    mesh(
      new T.CylinderGeometry(0.35, 0.45, 0.6, 16),
      mat("#7ad7ff"),
      -20.4,
      1,
      -6,
    ).rotation.z = Math.PI / 2;
    machineWheel.position.set(-20.05, 1, -6);
    scene.add(machineWheel);
    const ringMat = mat("#ffe46b", { metalness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const ring = mesh(
        new T.TorusGeometry(0.16, 0.03, 6, 14),
        ringMat,
        0,
        0,
        0,
        machineWheel,
      );
      const a = (i / 6) * Math.PI * 2;
      ring.position.set(0, Math.sin(a) * 0.55, Math.cos(a) * 0.55);
      ring.rotation.y = Math.PI / 2;
    }
  }

  // --- Trees, pool, sandbox and flowers --------------------------------------
  const leaves = [mat("#4f9e3d"), mat("#5cb047"), mat("#468f36")];
  for (const o of OBSTACLES) {
    if (o.kind === "tree") {
      mesh(
        new T.CylinderGeometry(0.32, 0.45, 2.6, 10),
        mat("#8a5a34"),
        o.x,
        1.3,
        o.z,
      );
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9;
        mesh(
          new T.IcosahedronGeometry(1.3 + random() * 0.5, 1),
          leaves[i % 3],
          o.x + Math.cos(a) * (i ? 0.8 : 0),
          3.2 + (i ? random() * 0.6 : 0.8),
          o.z + Math.sin(a) * (i ? 0.8 : 0),
        );
      }
    } else if (o.kind === "pool") {
      const rim = mesh(
        new T.TorusGeometry(o.r - 0.15, 0.25, 10, 32),
        mat("#ff9e3d"),
        o.x,
        0.28,
        o.z,
      );
      rim.rotation.x = Math.PI / 2;
      mesh(
        new T.CylinderGeometry(o.r - 0.2, o.r - 0.2, 0.4, 32),
        mat("#4cc3ee", { roughness: 0.1, metalness: 0.1 }),
        o.x,
        0.2,
        o.z,
      );
      const duck = new T.Group();
      duck.position.set(o.x + 0.6, 0.45, o.z - 0.3);
      scene.add(duck);
      mesh(
        new T.SphereGeometry(0.28, 12, 10),
        mat("#ffd93b"),
        0,
        0,
        0,
        duck,
      ).scale.set(1.2, 0.8, 1);
      mesh(
        new T.SphereGeometry(0.17, 12, 10),
        mat("#ffd93b"),
        0.2,
        0.25,
        0,
        duck,
      );
      mesh(
        new T.ConeGeometry(0.07, 0.16, 8),
        mat("#ff8a2a"),
        0.38,
        0.24,
        0,
        duck,
      ).rotation.z = -Math.PI / 2;
    } else if (o.kind === "sandbox") {
      const s = o.r * 1.5;
      for (const [w, d, x, z] of [
        [s, 0.2, 0, -s / 2],
        [s, 0.2, 0, s / 2],
        [0.2, s, -s / 2, 0],
        [0.2, s, s / 2, 0],
      ])
        box(w, 0.35, d, mat("#c98b4f"), o.x + x, 0.17, o.z + z);
      box(s - 0.2, 0.2, s - 0.2, mat("#f2dc9b"), o.x, 0.1, o.z);
      mesh(
        new T.ConeGeometry(0.3, 0.5, 4),
        mat("#ff5a5a"),
        o.x - 0.3,
        0.4,
        o.z + 0.2,
      );
    }
  }
  {
    const petals = ["#ff6fa8", "#ffd84a", "#ffffff", "#b783ff", "#ff8a3d"].map(
      (c) => mat(c),
    );
    const stem = mat("#3f8a32");
    const flower = (x, z) => {
      mesh(
        new T.CylinderGeometry(0.03, 0.03, 0.4, 5),
        stem,
        x,
        0.2,
        z,
      ).castShadow = false;
      mesh(
        new T.SphereGeometry(0.14, 8, 6),
        petals[Math.floor(random() * 5)],
        x,
        0.45,
        z,
      );
    };
    for (let x = -19; x < 7; x += 0.7 + random() * 0.6)
      flower(x, -11.6 + random() * 0.4);
    for (let x = -19; x < 19.5; x += 0.7 + random() * 0.8)
      flower(x, 12.2 - random() * 0.4);
  }

  // --- Your character, on the back step --------------------------------------
  const hero = createAvatar("attacker", avatar);
  hero.position.set(15.2, 0, -11.2);
  hero.rotation.y = -0.4;
  scene.add(hero);
  let heroOutcome = null;
  let heroTimer = 0;

  // --- Bubbles ---------------------------------------------------------------
  const sphere = keep(new T.SphereGeometry(1, 24, 18));
  const rainbowMap = painted(256, 128, (g) => {
    for (let i = 0; i < 256; i++) {
      g.fillStyle = `hsl(${(i / 256) * 360} 90% 70%)`;
      g.fillRect(i, 0, 1, 128);
    }
  });
  const bubbleMats = BUBBLES.map((b, tier) =>
    keep(
      new T.MeshPhysicalMaterial({
        color: b.color,
        map: tier >= 5 ? rainbowMap : null,
        transparent: true,
        opacity: tier === 0 ? 0.55 : 0.68,
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        iridescence: 1,
        iridescenceIOR: 1.3,
        emissive: b.color,
        emissiveIntensity: tier === 0 ? 0.35 : 0.3,
        depthWrite: false,
      }),
    ),
  );
  const shine = keep(
    new T.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.85,
    }),
  );
  const shadowMat = keep(
    new T.MeshBasicMaterial({
      color: "#1f3d16",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  const disc = keep(new T.CircleGeometry(1, 24));
  disc.rotateX(-Math.PI / 2);
  const bubbleMeshes = new Map();
  function bubbleMesh(b) {
    let m = bubbleMeshes.get(b.id);
    if (!m) {
      m = new T.Group();
      const ball = new T.Mesh(sphere, bubbleMats[b.tier]);
      ball.renderOrder = 2;
      const glint = new T.Mesh(sphere, shine);
      glint.scale.setScalar(0.18);
      glint.position.set(-0.4, 0.45, 0.45);
      const shadow = new T.Mesh(disc, shadowMat);
      m.add(ball, glint);
      m.userData = { ball, glint, shadow, tier: -1, spin: random() * 6 };
      scene.add(m, shadow);
      bubbleMeshes.set(b.id, m);
    }
    return m;
  }

  // --- Defenders -------------------------------------------------------------
  const M = {
    red: mat("#e8483f"),
    white: mat("#fbf7ef"),
    skin: mat("#f6c8a0"),
    blue: mat("#3d7fd8"),
    brown: mat("#8a5a34"),
    darkWood: mat("#6b4428"),
    grey: mat("#9aa3ad", { metalness: 0.4, roughness: 0.4 }),
    yellow: mat("#ffd34d"),
    green: mat("#4fc25a"),
    lightGreen: mat("#a8ec8a"),
    black: mat("#222222"),
    pink: mat("#ff7fb3"),
    orange: mat("#ff9b3d"),
    teal: mat("#36c4d6"),
    pinecone: mat("#7a4a26"),
    balloon: mat("#4fb3ff", { roughness: 0.3 }),
  };
  const BUILD = {
    gnome(g) {
      mesh(new T.CylinderGeometry(0.45, 0.55, 0.9, 14), M.blue, 0, 0.45, 0, g);
      mesh(new T.SphereGeometry(0.34, 14, 12), M.skin, 0, 1.15, 0, g);
      mesh(
        new T.ConeGeometry(0.36, 0.7, 14),
        M.white,
        0,
        0.9,
        0.22,
        g,
      ).rotation.x = Math.PI + 0.35;
      mesh(new T.ConeGeometry(0.4, 0.9, 14), M.red, 0, 1.7, 0, g).rotation.x =
        -0.15;
      mesh(new T.SphereGeometry(0.09, 8, 6), M.pink, 0, 1.12, 0.34, g);
      const arm = new T.Group();
      arm.position.set(0.45, 0.85, 0);
      g.add(arm);
      mesh(new T.CapsuleGeometry(0.1, 0.4, 4, 8), M.blue, 0, 0.25, 0, arm);
      mesh(
        new T.SphereGeometry(0.15, 8, 8),
        M.pinecone,
        0,
        0.55,
        0,
        arm,
      ).scale.set(1, 1.4, 1);
      g.userData.arm = arm;
    },
    sprinkler(g) {
      mesh(new T.CylinderGeometry(0.55, 0.65, 0.3, 16), M.grey, 0, 0.15, 0, g);
      mesh(new T.CylinderGeometry(0.12, 0.12, 0.6, 10), M.grey, 0, 0.6, 0, g);
      const head = new T.Group();
      head.position.y = 0.95;
      g.add(head);
      mesh(new T.CylinderGeometry(0.3, 0.3, 0.2, 16), M.yellow, 0, 0, 0, head);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const nozzle = mesh(
          new T.CylinderGeometry(0.06, 0.06, 0.7, 8),
          M.teal,
          Math.cos(a) * 0.4,
          0.05,
          Math.sin(a) * 0.4,
          head,
        );
        nozzle.rotation.set(0, -a, Math.PI / 2);
      }
      g.userData.head = head;
    },
    catapult(g) {
      box(1.3, 0.25, 0.9, M.brown, 0, 0.2, 0, g);
      for (const z of [-0.35, 0.35])
        box(0.15, 0.9, 0.15, M.darkWood, 0, 0.7, z, g);
      for (const x of [-0.5, 0.5])
        for (const z of [-0.5, 0.5]) {
          const w = mesh(
            new T.CylinderGeometry(0.2, 0.2, 0.1, 12),
            M.black,
            x,
            0.2,
            z,
            g,
          );
          w.rotation.x = Math.PI / 2;
        }
      const arm = new T.Group();
      arm.position.set(0, 1, 0);
      g.add(arm);
      box(1.4, 0.12, 0.12, M.darkWood, -0.2, 0, 0, arm);
      mesh(
        new T.CylinderGeometry(0.25, 0.18, 0.15, 12),
        M.darkWood,
        -0.85,
        0.1,
        0,
        arm,
      );
      const ball = mesh(
        new T.SphereGeometry(0.24, 12, 10),
        M.balloon,
        -0.85,
        0.32,
        0,
        arm,
      );
      g.userData.arm = arm;
      g.userData.ball = ball;
    },
    fan(g) {
      mesh(new T.CylinderGeometry(0.5, 0.6, 0.15, 16), M.white, 0, 0.08, 0, g);
      mesh(new T.CylinderGeometry(0.07, 0.07, 1, 8), M.white, 0, 0.6, 0, g);
      const head = new T.Group();
      head.position.y = 1.25;
      g.add(head);
      const cage = mesh(
        new T.TorusGeometry(0.55, 0.05, 8, 24),
        M.teal,
        0,
        0,
        0,
        head,
      );
      cage.rotation.y = Math.PI / 2;
      mesh(new T.SphereGeometry(0.16, 10, 8), M.teal, -0.05, 0, 0, head);
      const blades = new T.Group();
      blades.position.x = 0.05;
      head.add(blades);
      for (let i = 0; i < 3; i++) {
        const b = box(0.04, 0.42, 0.2, M.pink, 0, 0, 0, blades);
        b.geometry.translate(0, 0.24, 0);
        b.rotation.x = (i / 3) * Math.PI * 2;
      }
      g.userData.head = head;
      g.userData.blades = blades;
    },
    frog(g) {
      mesh(new T.SphereGeometry(0.6, 16, 12), M.green, 0, 0.5, 0, g).scale.set(
        1,
        0.75,
        1.1,
      );
      mesh(
        new T.SphereGeometry(0.4, 14, 10),
        M.lightGreen,
        0.15,
        0.42,
        0,
        g,
      ).scale.set(1, 0.7, 1.1);
      for (const z of [-0.25, 0.25]) {
        mesh(new T.SphereGeometry(0.17, 12, 10), M.green, 0.25, 0.98, z, g);
        mesh(new T.SphereGeometry(0.1, 10, 8), M.white, 0.35, 1.02, z, g);
        mesh(new T.SphereGeometry(0.05, 8, 6), M.black, 0.43, 1.03, z, g);
        mesh(
          new T.SphereGeometry(0.2, 10, 8),
          M.green,
          0.3,
          0.12,
          z * 2.2,
          g,
        ).scale.set(1.3, 0.4, 0.8);
      }
      const mouth = mesh(
        new T.TorusGeometry(0.16, 0.035, 6, 14, Math.PI),
        M.black,
        0.55,
        0.6,
        0,
        g,
      );
      mouth.rotation.set(Math.PI, Math.PI / 2, 0);
      g.userData.cheek = mesh(
        new T.SphereGeometry(0.2, 10, 8),
        M.yellow,
        0.5,
        0.45,
        0,
        g,
      );
    },
  };
  // Models face +x at rotation 0; `angle` is the direction in the x–z plane.
  function buildTower(kind) {
    const group = new T.Group();
    const body = new T.Group();
    group.add(body);
    BUILD[kind](body);
    group.userData = body.userData;
    group.userData.body = body;
    const pips = new T.Group();
    group.add(pips);
    group.userData.pips = pips;
    return group;
  }
  const pipGeo = keep(new T.OctahedronGeometry(0.13));
  const pipMats = [
    mat("#ffcf33", { emissive: "#ffb300", emissiveIntensity: 0.5 }),
    mat("#7fe3ff", { emissive: "#29b6f6", emissiveIntensity: 0.5 }),
  ];
  const towerMeshes = new Map();
  function towerMesh(t) {
    let m = towerMeshes.get(t.id);
    if (!m) {
      m = buildTower(t.kind);
      m.position.set(t.x, 0, t.z);
      m.userData.levels = "";
      m.userData.pop = 0.35;
      scene.add(m);
      towerMeshes.set(t.id, m);
    }
    const levels = t.levels.join();
    if (m.userData.levels !== levels) {
      m.userData.levels = levels;
      const pips = m.userData.pips;
      pips.clear();
      let n = 0;
      t.levels.forEach((count, path) => {
        for (let i = 0; i < count; i++) {
          const p = new T.Mesh(pipGeo, pipMats[path]);
          const a = (n++ / 4) * Math.PI * 2 + 0.6;
          p.position.set(Math.cos(a) * 0.75, 0.2, Math.sin(a) * 0.75);
          pips.add(p);
        }
      });
      m.userData.pop = 0.35;
      const total = t.levels[0] + t.levels[1];
      m.userData.body.scale.setScalar(1 + total * 0.06);
    }
    return m;
  }

  // The see-through defender that follows the cursor while placing.
  const ghosts = {};
  function ghost(kind) {
    if (!ghosts[kind]) {
      const g = buildTower(kind);
      g.traverse((n) => {
        if (!n.isMesh) return;
        n.castShadow = false;
        n.material = n.material.clone();
        n.material.transparent = true;
        n.material.opacity = 0.6;
        keep(n.material);
      });
      scene.add(g);
      ghosts[kind] = g;
    }
    return ghosts[kind];
  }

  // Range circle, cursor ring.
  const ringGeo = keep(new T.RingGeometry(0.94, 1, 64));
  ringGeo.rotateX(-Math.PI / 2);
  const rangeFillMat = keep(
    new T.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  const rangeEdgeMat = keep(
    new T.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  const range = new T.Group();
  range.add(new T.Mesh(disc, rangeFillMat), new T.Mesh(ringGeo, rangeEdgeMat));
  range.position.y = 0.04;
  range.renderOrder = 1;
  scene.add(range);
  const cursorMat = keep(
    new T.MeshBasicMaterial({
      color: "#fff6a8",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  const cursor = new T.Mesh(ringGeo, cursorMat);
  cursor.scale.setScalar(0.9);
  cursor.position.y = 0.05;
  scene.add(cursor);

  // --- Shots and effects -----------------------------------------------------
  const shotMeshes = new Map();
  const pineGeo = keep(new T.SphereGeometry(0.16, 8, 6));
  const balloonGeo = keep(new T.SphereGeometry(0.3, 12, 10));
  function shotMesh(s) {
    let m = shotMeshes.get(s.id);
    if (!m) {
      m = new T.Mesh(
        s.kind === "pinecone" ? pineGeo : balloonGeo,
        s.kind === "pinecone" ? M.pinecone : M.balloon,
      );
      m.castShadow = true;
      if (s.kind === "pinecone") m.scale.set(1, 1, 1.5);
      scene.add(m);
      shotMeshes.set(s.id, m);
    }
    return m;
  }

  const effects = [];
  const dropGeo = keep(new T.SphereGeometry(0.08, 6, 5));
  const effectMats = new Map();
  function effectMat(color, opacity = 0.9) {
    const key = `${color}${opacity}`;
    if (!effectMats.has(key))
      effectMats.set(
        key,
        keep(
          new T.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
          }),
        ),
      );
    return effectMats.get(key);
  }
  function addEffect(object, life, update) {
    scene.add(object);
    effects.push({ object, life, age: 0, update });
  }
  function droplets(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const m = new T.Mesh(dropGeo, effectMat(color));
      m.position.set(x, y, z);
      const a = random() * Math.PI * 2,
        up = random() * 2 - 0.5,
        v = new T.Vector3(
          Math.cos(a) * speed,
          up * speed * 0.6 + 1,
          Math.sin(a) * speed,
        );
      addEffect(m, 0.45, (e, dt) => {
        v.y -= 9 * dt;
        m.position.addScaledVector(v, dt);
        m.scale.setScalar(1 - e.age / e.life);
      });
    }
  }
  function ring(x, y, z, radius, color, life = 0.35, opacity = 0.5) {
    const m = new T.Mesh(
      ringGeo,
      keep(
        new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      ),
    );
    m.position.set(x, y, z);
    addEffect(m, life, (e) => {
      const k = e.age / e.life;
      m.scale.setScalar(radius * (0.3 + 0.7 * k));
      m.material.opacity = opacity * (1 - k);
    });
    m.userData.ownMaterial = true;
  }
  function filled(x, z, radius, color, life, opacity) {
    const m = new T.Mesh(
      disc,
      keep(
        new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      ),
    );
    m.position.set(x, 0.06, z);
    addEffect(m, life, (e) => {
      const k = e.age / e.life;
      m.scale.setScalar(radius * (0.4 + 0.6 * Math.sqrt(k)));
      m.material.opacity = opacity * (1 - k);
    });
    m.userData.ownMaterial = true;
  }
  const streamGeo = keep(new T.CylinderGeometry(0.06, 0.06, 1, 6));
  streamGeo.rotateX(Math.PI / 2);
  streamGeo.translate(0, 0, 0.5);
  function stream(from, to) {
    const m = new T.Mesh(streamGeo, effectMat("#7fd6ff", 0.75));
    m.position.copy(from);
    m.lookAt(to);
    m.scale.z = from.distanceTo(to);
    addEffect(m, 0.09, () => {});
  }

  function bubblePos(b, out = new T.Vector3()) {
    const r = BUBBLES[b.tier].radius;
    return out.set(
      b.x,
      BUBBLE_Y + r * LOOK + Math.sin(time * 2.2 + b.id) * 0.12,
      b.z,
    );
  }

  // --- Camera ----------------------------------------------------------------
  const target = new T.Vector3(0, 0, 0);
  const corners = [];
  for (const x of [-21, 21])
    for (const z of [-13.5, 13.2])
      for (const y of [0, 1.5]) corners.push(new T.Vector3(x, y, z));
  corners.push(new T.Vector3(14.5, 8, -16));
  let width = 1,
    height = 1;
  // Fit the whole yard between the top HUD and the shop along the bottom.
  function fit() {
    camera.aspect = width / height;
    const tilt = 0.95; // radians below horizontal
    const dir = new T.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const bottom = height < 560 ? 0.42 : 0.3; // share of the screen the shop covers (NDC)
    let lo = 10,
      hi = 120;
    for (let i = 0; i < 30; i++) {
      const dist = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.position.z += 1.2;
      camera.lookAt(target.x, target.y, target.z + 1.2);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.98 && p.y < 0.86 && p.y > -1 + bottom;
      });
      if (fits) hi = dist;
      else lo = dist;
    }
    const dist = hi;
    camera.position.copy(target).addScaledVector(dir, dist);
    // Shift the view so the yard is centred in the space left by the HUD.
    camera.position.z += 1.2;
    camera.lookAt(target.x, target.y, target.z + 1.2);
    camera.updateProjectionMatrix();
    const ys = corners.map((c) => c.clone().project(camera).y);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    const want = (0.86 + (-1 + bottom)) / 2;
    camera.setViewOffset(
      width,
      height,
      0,
      ((mid - want) * height) / 2,
      width,
      height,
    );
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    fit();
  }

  const raycaster = new T.Raycaster();
  const ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hitPoint = new T.Vector3();

  let time = 0;
  const tmp = new T.Vector3();
  const tmp2 = new T.Vector3();

  function syncBubbles(game) {
    const seen = new Set();
    for (const b of game.bubbles) {
      seen.add(b.id);
      const m = bubbleMesh(b);
      const def = BUBBLES[b.tier];
      if (m.userData.tier !== b.tier) {
        m.userData.tier = b.tier;
        m.userData.ball.material = bubbleMats[b.tier];
        m.userData.target = def.radius * LOOK;
        if (!m.userData.size) m.userData.size = def.radius * LOOK * 0.3;
      }
      m.userData.size +=
        (m.userData.target - m.userData.size) * Math.min(1, frameDt * 10);
      // A wobble in the breeze, more when slowed by a fan.
      const wob = Math.sin(time * 6 + b.id) * (b.slow < 1 ? 0.08 : 0.03);
      m.scale.set(
        m.userData.size * (1 + wob),
        m.userData.size * (1 - wob),
        m.userData.size * (1 + wob),
      );
      bubblePos(b, m.position);
      m.userData.ball.rotation.y = time * 0.6 + m.userData.spin;
      const s = m.userData.shadow;
      s.position.set(b.x + 0.4, 0.03, b.z + 0.3);
      s.scale.setScalar(def.radius * LOOK * 0.85);
    }
    for (const [id, m] of bubbleMeshes)
      if (!seen.has(id)) {
        scene.remove(m, m.userData.shadow);
        bubbleMeshes.delete(id);
      }
  }

  function syncTowers(game, dt) {
    const seen = new Set();
    for (const t of game.towers) {
      seen.add(t.id);
      const m = towerMesh(t);
      const u = m.userData;
      // Turn smoothly to face the target.
      const want = -t.angle;
      let diff =
        ((want - m.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      m.rotation.y += diff * Math.min(1, dt * 10);
      u.pips.rotation.y = -m.rotation.y + time * 0.8;
      u.pop = Math.max(0, (u.pop ?? 0) - dt);
      const bounce = Math.sin((u.pop / 0.35) * Math.PI) * 0.15;
      u.body.position.y = bounce;
      u.kick = Math.max(0, (u.kick ?? 0) - dt * 4);
      if (t.kind === "gnome") u.arm.rotation.z = -u.kick * 2.2;
      if (t.kind === "catapult") {
        u.arm.rotation.z = -u.kick * 1.6;
        u.ball.visible = u.kick < 0.2;
      }
      if (t.kind === "sprinkler") u.head.rotation.y += dt * (1 + u.kick * 14);
      if (t.kind === "fan") u.blades.rotation.x += dt * 18;
      if (t.kind === "frog") u.cheek.scale.setScalar(1 + u.kick * 0.8);
    }
    for (const [id, m] of towerMeshes)
      if (!seen.has(id)) {
        scene.remove(m);
        towerMeshes.delete(id);
        droplets(m.position.x, 0.6, m.position.z, "#e8d9b5", 14, 3);
      }
  }

  function syncShots(game) {
    const seen = new Set();
    for (const s of game.shots) {
      seen.add(s.id);
      const m = shotMesh(s);
      if (s.kind === "pinecone") {
        m.position.set(s.x, BUBBLE_Y + 0.6, s.z);
        m.rotation.y = -Math.atan2(s.vz, s.vx) + Math.PI / 2;
      } else {
        m.position.set(s.x, s.height ?? 1, s.z);
        m.rotation.z += 0.2;
      }
    }
    for (const [id, m] of shotMeshes)
      if (!seen.has(id)) {
        scene.remove(m);
        shotMeshes.delete(id);
      }
  }

  let frameDt = 0;
  return {
    // Turn game events into effects.
    effects(game, events) {
      for (const e of events) {
        const tower = e.tower && towerMeshes.get(e.tower);
        if (tower) tower.userData.kick = 1;
        if (e.type === "pop") {
          const color = BUBBLES[e.tier].color;
          const y = BUBBLE_Y + BUBBLES[e.tier].radius;
          droplets(
            e.x,
            y,
            e.z,
            e.tier ? color : "#ffffff",
            e.burst ? 22 : 7,
            e.burst ? 5 : 3,
          );
          ring(e.x, y, e.z, BUBBLES[e.tier].radius * 2.2, "#ffffff", 0.25, 0.7);
          const m = bubbleMeshes.get(e.id);
          if (m) m.userData.size *= 1.25;
        } else if (e.type === "hit") {
          const m = bubbleMeshes.get(e.id);
          if (m) m.userData.size *= 0.97;
        } else if (e.type === "spray" && tower) {
          filled(
            tower.position.x,
            tower.position.z,
            e.range,
            "#8fdcff",
            0.35,
            0.35,
          );
          droplets(tower.position.x, 1, tower.position.z, "#9fe2ff", 12, 4);
        } else if (e.type === "gust" && tower) {
          ring(
            tower.position.x,
            0.5,
            tower.position.z,
            e.range,
            "#ffffff",
            0.5,
            0.6,
          );
        } else if (e.type === "splash") {
          filled(e.x, e.z, e.r, "#4fb3ff", 0.45, 0.45);
          droplets(e.x, 1, e.z, "#4fb3ff", 18, 4);
        } else if (e.type === "squirt" && tower) {
          const from = tmp.set(
            tower.position.x + Math.cos(-tower.rotation.y) * 0.55,
            0.6,
            tower.position.z + Math.sin(-tower.rotation.y) * 0.55,
          );
          stream(from.clone(), tmp2.set(e.x, BUBBLE_Y + 0.5, e.z).clone());
        } else if (e.type === "leak") {
          droplets(13, 2, -11.3, BUBBLES[e.tier].color, 16, 3);
          heroOutcome = "hit";
          heroTimer = 0.6;
        } else if (e.type === "won") {
          heroOutcome = "win";
          heroTimer = 1e9;
        } else if (e.type === "lost") {
          heroOutcome = "lose";
          heroTimer = 1e9;
        } else if (e.type === "spawn") {
          machineWheel.userData.puff = 0.4;
        }
      }
    },
    draw(dt, game, view = {}) {
      resize();
      frameDt = dt;
      time += dt;
      machineWheel.rotation.x += dt * 1.5;
      syncBubbles(game);
      syncTowers(game, dt);
      syncShots(game);
      for (const e of effects) {
        e.age += dt;
        e.update(e, dt);
      }
      for (let i = effects.length - 1; i >= 0; i--)
        if (effects[i].age >= effects[i].life) {
          const { object } = effects[i];
          scene.remove(object);
          if (object.userData.ownMaterial) object.material.dispose();
          effects.splice(i, 1);
        }

      // Cursor, ghost and range.
      cursor.visible = !!view.cursor;
      for (const [kind, g] of Object.entries(ghosts))
        g.visible = kind === view.ghost && !!view.cursor;
      range.visible = false;
      if (view.cursor) {
        cursor.position.x = view.cursor.x;
        cursor.position.z = view.cursor.z;
        cursorMat.color.set(
          view.ghost ? (view.ok ? "#bfffaa" : "#ff6b6b") : "#fff6a8",
        );
        cursor.scale.setScalar(0.9 + Math.sin(time * 5) * 0.06);
        if (view.ghost) {
          const g = ghost(view.ghost);
          g.visible = true;
          g.position.set(view.cursor.x, 0, view.cursor.z);
          g.rotation.y = -Math.atan2(-view.cursor.z, -view.cursor.x);
          range.visible = true;
          range.position.x = view.cursor.x;
          range.position.z = view.cursor.z;
          range.scale.setScalar(view.range);
          const col = view.ok ? "#ffffff" : "#ff5a5a";
          rangeFillMat.color.set(col);
          rangeEdgeMat.color.set(col);
        }
      }
      if (view.selected) {
        range.visible = true;
        range.position.x = view.selected.x;
        range.position.z = view.selected.z;
        range.scale.setScalar(towerStats(view.selected).range);
        rangeFillMat.color.set("#ffffff");
        rangeEdgeMat.color.set("#ffffff");
      }

      heroTimer -= dt;
      if (heroTimer <= 0) heroOutcome = null;
      animateAvatar(
        hero,
        { moveSpeed: 0, grounded: true },
        dt,
        heroOutcome ?? undefined,
      );
      renderer.render(scene, camera);
    },
    // The lawn point under a screen position, or null.
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new T.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(ground, hitPoint)
        ? { x: hitPoint.x, z: hitPoint.z }
        : null;
    },
    // Screen position (CSS px inside the canvas) of a yard point.
    screen(x, z, y = 0) {
      const p = new T.Vector3(x, y, z).project(camera);
      return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
    },
    reset() {
      for (const m of [...bubbleMeshes.values()])
        scene.remove(m, m.userData.shadow);
      bubbleMeshes.clear();
      for (const m of towerMeshes.values()) scene.remove(m);
      towerMeshes.clear();
      for (const m of shotMeshes.values()) scene.remove(m);
      shotMeshes.clear();
      for (const e of effects) scene.remove(e.object);
      effects.length = 0;
      heroOutcome = null;
    },
    dispose() {
      disposeAvatar(hero);
      scene.traverse((n) => {
        n.geometry?.dispose();
      });
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
    },
  };
}
