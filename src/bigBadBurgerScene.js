import * as T from "three";
import { INGREDIENTS } from "../shared/bigBadBurger.js";

// A diner counter seen from the stool. The burger grows on a plate in the
// middle; the next ingredient slides back and forth above it. The camera
// rises with the stack, and pulls back at the end to show how tall it got.
// Stack units: the plate's top is y = 0, x is right, the camera looks at -z.
const FOV = 45;
const HALF_WIDTH = 2.25; // keep this much either side of the burger on screen
const DEBRIS_FLOOR = -0.06; // the counter top
const G = 9.8;
const COUNTER_FRONT = 0.85; // debris stays on the counter, short of its edge
// The sun sits at a fixed offset from what it lights. Its shadow camera's
// axes, for snapping the shadow map to whole texels.
const SHADOW_SIZE = 1024;
const SHADOW_EXTENT = 8; // left..right of the shadow camera
const SHADOW_TEXEL = SHADOW_EXTENT / SHADOW_SIZE;
const SUN_OFFSET = new T.Vector3(2.5, 6.5, 4);
const SUN_FWD = SUN_OFFSET.clone().negate().normalize();
const SUN_RIGHT = new T.Vector3()
  .crossVectors(SUN_FWD, new T.Vector3(0, 1, 0))
  .normalize();
const SUN_UP = new T.Vector3().crossVectors(SUN_RIGHT, SUN_FWD);

export function createBigBadBurgerScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color("#2a1a3a");
  const camera = new T.PerspectiveCamera(FOV, 1, 0.05, 200);

  scene.add(new T.HemisphereLight("#fff1dc", "#5a3a4a", 1.6));
  const sun = new T.DirectionalLight("#fff0d6", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_EXTENT / 2,
    right: SHADOW_EXTENT / 2,
    top: SHADOW_EXTENT / 2,
    bottom: -SHADOW_EXTENT / 2,
    near: 0.5,
    far: 30,
  });
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new T.PointLight("#ff6a9a", 6, 12, 1.6); // neon spill
  scene.add(fill);

  const mats = new Map();
  const mat = (color, roughness = 0.7, extra = {}) => {
    const key = `${color}:${roughness}:${JSON.stringify(extra)}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshStandardMaterial({ color, roughness, ...extra }));
    return mats.get(key);
  };
  function mesh(geometry, material, x = 0, y = 0, z = 0, parent = scene) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function canvasTexture(w, h, paint) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // --- The diner -------------------------------------------------------------
  const wallTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#f6e7c8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#efd9b0";
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 32, h);
  });
  wallTex.wrapS = wallTex.wrapT = T.RepeatWrapping;
  wallTex.repeat.set(8, 20);
  const wall = new T.Mesh(
    new T.PlaneGeometry(40, 100),
    new T.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
  );
  wall.position.set(0, 48.8, -4.5);
  wall.receiveShadow = true;
  scene.add(wall);
  const tileTex = canvasTexture(128, 128, (g, w, h) => {
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? "#d8323f" : "#fbf4ea";
        g.fillRect((x * w) / 2, (y * h) / 2, w / 2, h / 2);
      }
  });
  tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
  tileTex.repeat.set(40, 6);
  const tiles = new T.Mesh(
    new T.PlaneGeometry(40, 6),
    new T.MeshStandardMaterial({ map: tileTex, roughness: 0.4 }),
  );
  tiles.position.set(0, -1.8, -4.49);
  scene.add(tiles);
  mesh(
    new T.BoxGeometry(40, 0.12, 0.06),
    mat("#c9ccd2", 0.25, { metalness: 0.8 }),
    0,
    1.2,
    -4.45,
  );

  // Neon sign.
  const signTex = canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = "#3b1d33";
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 16, 60);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#ffd36b";
    g.shadowColor = "#ffb13b";
    g.shadowBlur = 24;
    g.stroke();
    let size = 128;
    const font = (px) =>
      `900 ${px}px Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif`;
    g.font = font(size);
    // Fit inside the frame whatever font has loaded.
    while (size > 40 && g.measureText("BIG BAD BURGER").width > w - 110)
      g.font = font((size -= 4));
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "#ff3d7f";
    g.shadowBlur = 30;
    g.fillStyle = "#ffe6f0";
    g.fillText("BIG BAD BURGER", w / 2, h / 2 + 6);
  });
  const sign = new T.Mesh(
    new T.PlaneGeometry(4.4, 1.1),
    new T.MeshBasicMaterial({ map: signTex, transparent: true }),
  );
  sign.position.set(0, 2.55, -4.4);
  scene.add(sign);
  fill.position.set(0, 2.4, -3.6);

  // Menu boards and round mirrors further up so a tall burger has company.
  const boardTex = canvasTexture(256, 320, (g, w, h) => {
    g.fillStyle = "#23302a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9a36a";
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = "#f6f0dc";
    g.font = "700 30px system-ui, sans-serif";
    g.textAlign = "left";
    const items = ["BURGER", "FRIES", "SHAKE", "PIE", "SODA"];
    items.forEach((item, i) => {
      g.fillText(item, 28, 70 + i * 50);
      g.fillText("·  ·  ·", 160, 70 + i * 50);
    });
  });
  for (const x of [-4.4, 4.4])
    mesh(
      new T.BoxGeometry(1.5, 1.9, 0.06),
      new T.MeshStandardMaterial({ map: boardTex, roughness: 0.9 }),
      x,
      2.4,
      -4.42,
    );
  const chrome = mat("#d5d9e0", 0.2, { metalness: 0.85 });
  const mirror = mat("#9fc9d9", 0.15, { metalness: 0.6 });
  for (let i = 0; i < 9; i++) {
    const x = i % 2 ? 3.3 : -3.3;
    const y = 5 + i * 3;
    mesh(new T.TorusGeometry(0.62, 0.07, 10, 40), chrome, x, y, -4.4);
    mesh(new T.CircleGeometry(0.6, 40), mirror, x, y, -4.43);
  }

  // Counter with a red top and chrome edge, a plate, bottles and a napkin box.
  mesh(new T.BoxGeometry(40, 2, 3.4), mat("#c93a3a", 0.5), 0, -1.1, -0.8);
  mesh(new T.BoxGeometry(40, 0.08, 3.5), chrome, 0, -0.125, -0.8);
  mesh(
    new T.BoxGeometry(40, 0.05, 3.4),
    mat("#f2ece2", 0.35),
    0,
    -0.06 - 0.025,
    -0.8,
  ).receiveShadow = true;
  const plate = mesh(
    new T.CylinderGeometry(0.95, 0.8, 0.06, 40),
    mat("#ffffff", 0.25),
    0,
    -0.03,
    0,
  );
  plate.castShadow = false;
  mesh(
    new T.TorusGeometry(0.86, 0.02, 8, 48),
    mat("#6fb2d6", 0.3),
    0,
    0,
    0,
  ).rotation.x = Math.PI / 2;
  function bottle(x, color, cap) {
    const g = new T.Group();
    g.position.set(x, -0.06, -1.2);
    mesh(
      new T.CylinderGeometry(0.17, 0.2, 0.75, 20),
      mat(color, 0.35),
      0,
      0.375,
      0,
      g,
    );
    mesh(
      new T.CylinderGeometry(0.1, 0.17, 0.18, 20),
      mat(color, 0.35),
      0,
      0.84,
      0,
      g,
    );
    mesh(new T.ConeGeometry(0.06, 0.18, 12), mat(cap, 0.4), 0, 1.02, 0, g);
    scene.add(g);
  }
  bottle(-2.6, "#d8261f", "#f2f2f2");
  bottle(-2.15, "#f5c518", "#d8261f");
  mesh(new T.BoxGeometry(0.6, 0.45, 0.35), chrome, 2.5, 0.17, -1.3);
  mesh(
    new T.BoxGeometry(0.45, 0.1, 0.02),
    mat("#ffffff", 0.9),
    2.5,
    0.42,
    -1.3,
  );

  // Best-height ribbon on the wall.
  const bestTex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = "#ffcf3d";
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 18);
    g.fill();
    g.fillStyle = "#5a2a14";
    g.font = "900 40px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("★ BEST", w / 2, h / 2 + 2);
  });
  const best = new T.Group();
  const bestLine = new T.Mesh(
    new T.PlaneGeometry(7, 0.04),
    new T.MeshBasicMaterial({
      color: "#ffcf3d",
      transparent: true,
      opacity: 0.85,
    }),
  );
  const bestTag = new T.Mesh(
    new T.PlaneGeometry(0.9, 0.225),
    new T.MeshBasicMaterial({ map: bestTex, transparent: true }),
  );
  bestTag.position.x = 2.3;
  best.add(bestLine, bestTag);
  best.position.z = -3.2;
  best.visible = false;
  scene.add(best);

  // Drop marker: a glowing circle on top of the stack right under the
  // ingredient, the size of its footprint, so it's clear where it will land.
  const marker = new T.Group();
  const markerMat = (color, opacity) =>
    new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  const markerFill = new T.Mesh(
    new T.CircleGeometry(1, 48),
    markerMat("#ffffff", 0.35),
  );
  const markerRing = new T.Mesh(
    new T.RingGeometry(0.92, 1, 48),
    markerMat("#ff3d7f", 0.95),
  );
  for (const m of [markerFill, markerRing]) {
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    marker.add(m);
  }
  marker.visible = false;
  scene.add(marker);

  // --- Ingredients -------------------------------------------------------------
  // A rounded disc whose bottom is at y = 0 and top at y = h.
  function puckGeometry(r, h, round) {
    const pts = [new T.Vector2(0, 0)];
    const k = Math.min(round, h / 2, r / 2);
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
      pts.push(new T.Vector2(r - k + Math.cos(a) * k, k + Math.sin(a) * k));
    }
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * (Math.PI / 2);
      pts.push(new T.Vector2(r - k + Math.cos(a) * k, h - k + Math.sin(a) * k));
    }
    pts.push(new T.Vector2(0, h));
    const geo = new T.LatheGeometry(pts, 40);
    geo.computeVertexNormals();
    return geo;
  }
  // Lumpy, by a hash of each vertex's position so seams stay closed.
  function roughen(geo, amount, seed = 1) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const n =
        Math.sin(x * 12.9898 * seed + z * 78.233 + y * 37.719) * 43758.5453;
      const d = (n - Math.floor(n) - 0.5) * amount;
      const r = Math.hypot(x, z);
      if (r > 1e-4) {
        p.setX(i, x + (x / r) * d);
        p.setZ(i, z + (z / r) * d);
      }
      p.setY(i, y + d * 0.4 * (y > 0.01 ? 1 : 0));
    }
    geo.computeVertexNormals();
    return geo;
  }

  function makeIngredient(kind) {
    const { width: w, height: h } = INGREDIENTS[kind];
    const r = w / 2;
    const g = new T.Group();
    g.userData.kind = kind;
    if (kind === "bun") {
      mesh(puckGeometry(r, h - 0.02, 0.08), mat("#d99a4e", 0.6), 0, 0, 0, g);
      mesh(
        new T.CylinderGeometry(r - 0.05, r - 0.05, 0.02, 40),
        mat("#f4ddb0", 0.9),
        0,
        h - 0.02,
        0,
        g,
      );
    } else if (kind === "patty") {
      mesh(
        roughen(puckGeometry(r, h, 0.08), 0.03, 2),
        mat("#6b3a1f", 0.95),
        0,
        0,
        0,
        g,
      );
      // Grill marks on top.
      for (const dz of [-0.22, 0, 0.22])
        mesh(
          new T.BoxGeometry(w * 0.7, 0.012, 0.05),
          mat("#3a1f10", 1),
          0,
          h + 0.004,
          dz,
          g,
        ).rotation.y = 0.5;
    } else if (kind === "cheese") {
      const side = w * 0.86;
      const geo = new T.BoxGeometry(side, h, side, 12, 1, 12);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const d = Math.hypot(p.getX(i), p.getZ(i));
        p.setY(i, p.getY(i) + h / 2 - Math.max(0, d - w * 0.33) ** 2 * 1.1);
      }
      geo.computeVertexNormals();
      mesh(geo, mat("#ffbf2e", 0.45), 0, 0, 0, g).rotation.y = Math.PI / 4;
    } else if (kind === "tomato") {
      mesh(puckGeometry(r, h, 0.03), mat("#e0352b", 0.45), 0, 0, 0, g);
      mesh(
        new T.CylinderGeometry(r * 0.82, r * 0.82, 0.01, 32),
        mat("#f36a55", 0.5),
        0,
        h,
        0,
        g,
      );
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const seed = mesh(
          new T.SphereGeometry(0.07, 10, 6),
          mat("#f9c46b", 0.5),
          Math.cos(a) * r * 0.48,
          h,
          Math.sin(a) * r * 0.48,
          g,
        );
        seed.scale.set(1, 0.15, 0.6);
        seed.rotation.y = -a;
      }
      mesh(
        new T.CylinderGeometry(0.08, 0.08, 0.012, 16),
        mat("#fbd2b5", 0.5),
        0,
        h + 0.002,
        0,
        g,
      );
    } else if (kind === "lettuce") {
      const geo = new T.CylinderGeometry(r, r * 0.92, h, 64, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const a = Math.atan2(z, x);
        const rr = Math.hypot(x, z);
        const edge = rr / r;
        const s = 1 + Math.sin(a * 7) * 0.05;
        p.setX(i, x * s);
        p.setZ(i, z * s);
        p.setY(i, p.getY(i) + h / 2 + Math.sin(a * 11) * 0.03 * edge);
      }
      geo.computeVertexNormals();
      mesh(geo, mat("#79c443", 0.6, { side: T.DoubleSide }), 0, 0, 0, g);
    } else if (kind === "onion") {
      const tube = h / 2;
      for (const [R, color] of [
        [r - tube, "#f2e4f3"],
        [(r - tube) * 0.6, "#e7cfee"],
      ]) {
        const ring = mesh(
          new T.TorusGeometry(R, tube, 10, 40),
          mat(color, 0.35),
          0,
          tube,
          0,
          g,
        );
        ring.rotation.x = Math.PI / 2;
      }
    } else if (kind === "pickles") {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        const d = r - 0.18;
        mesh(
          new T.CylinderGeometry(0.18, 0.18, h, 18),
          mat("#6f9a35", 0.5),
          Math.cos(a) * d,
          h / 2,
          Math.sin(a) * d,
          g,
        );
        mesh(
          new T.CylinderGeometry(0.13, 0.13, 0.008, 18),
          mat("#a9c75a", 0.5),
          Math.cos(a) * d,
          h + 0.002,
          Math.sin(a) * d,
          g,
        );
      }
    } else if (kind === "bacon") {
      for (const [dz, rot] of [
        [-0.17, 0.12],
        [0.17, -0.1],
      ]) {
        const geo = new T.BoxGeometry(w, h * 0.7, 0.26, 28, 1, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++)
          p.setY(
            i,
            p.getY(i) + h * 0.35 + Math.sin(p.getX(i) * 10 + dz * 9) * 0.02,
          );
        geo.computeVertexNormals();
        const strip = new T.Group();
        strip.position.z = dz;
        strip.rotation.y = rot;
        mesh(geo, mat("#b0412c", 0.55), 0, 0, 0, strip);
        const fat = geo.clone();
        mesh(fat, mat("#f1c6a2", 0.6), 0, 0.006, 0, strip).scale.set(1, 1, 0.3);
        g.add(strip);
      }
    }
    return g;
  }

  // --- State -------------------------------------------------------------------
  const stackGroup = new T.Group();
  scene.add(stackGroup);
  let stack = [];
  let layers = []; // { mesh, squash }
  let held = null; // mesh of the sliding ingredient
  let heldKind = "";
  let debris = [];
  let tipping = null; // { group, pivot, side, angle, speed, items }
  let wobble = 0; // a jiggle after each landing
  let time = 0;
  let camY = 0.6;
  let camDist = 4.4;
  let finished = false;
  const flashes = [];

  const drop = (node) => {
    node.parent?.remove(node);
    node.traverse((n) => n.geometry?.dispose());
  };
  function clearDebris() {
    for (const d of debris) drop(d.mesh);
    debris = [];
    if (tipping) drop(tipping.group);
    tipping = null;
  }

  function addLayerMesh(i) {
    const l = stack[i];
    const m = makeIngredient(l.kind);
    m.position.set(l.x, l.y, 0);
    m.rotation.y = (i * 2.399) % (Math.PI * 2); // a different turn for each
    if (l.kind === "bacon" || l.kind === "cheese")
      m.rotation.y = (i % 2) * 0.4 - 0.2;
    stackGroup.add(m);
    layers.push({ mesh: m, squash: 0 });
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (
      canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(h * renderer.getPixelRatio())
    )
      renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }

  const project = (x, y, z) => {
    const v = new T.Vector3(x, y, z).project(camera);
    return {
      x: ((v.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - v.y) / 2) * canvas.clientHeight,
    };
  };

  const top = () => {
    const l = stack[stack.length - 1];
    return l ? l.y + l.height : 0;
  };

  return {
    // Rebuild from a fresh stack.
    reset(newStack) {
      clearDebris();
      for (const child of [...stackGroup.children]) drop(child);
      stack = newStack;
      layers = [];
      stack.forEach((_, i) => addLayerMesh(i));
      finished = false;
      wobble = 0;
      camY = top() + 0.4;
    },
    // The newest layer of the stack has just landed.
    landed(perfect) {
      addLayerMesh(stack.length - 1);
      layers[layers.length - 1].squash = 1;
      wobble = Math.min(1.4, wobble + (perfect ? 0.25 : 0.7));
      if (perfect) {
        const l = stack[stack.length - 1];
        const ring = new T.Mesh(
          new T.RingGeometry(0.5, 0.56, 48),
          new T.MeshBasicMaterial({
            color: "#fff2a8",
            transparent: true,
            side: T.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(l.x, l.y + l.height + 0.02, 0);
        scene.add(ring);
        flashes.push({ mesh: ring, t: 0 });
      }
    },
    setHeld(kind) {
      if (held) drop(held);
      heldKind = kind;
      held = kind ? makeIngredient(kind) : null;
      if (held) scene.add(held);
    },
    setBest(y) {
      best.visible = y > 0.3;
      best.position.y = y;
    },
    // Tip everything from layer `index` up over `pivot` (x) towards `side`.
    topple({ index, pivot, side }) {
      const base = stack[index].y;
      const group = new T.Group();
      group.position.set(pivot, base, 0);
      scene.add(group);
      const items = [];
      for (let i = index; i < layers.length; i++) {
        const m = layers[i].mesh;
        stackGroup.remove(m);
        m.position.set(stack[i].x - pivot, stack[i].y - base, 0);
        m.scale.set(1, 1, 1);
        group.add(m);
        items.push(m);
      }
      layers.length = index;
      tipping = { group, side, angle: 0, speed: 0.6, items };
      finished = true;
    },
    // The ingredient that slid off on its own (missed the burger entirely).
    // `side` is which way it missed the layer below (-1 left, 1 right), so
    // it always falls away from the burger, never back onto it.
    tumble({ x, y }, side = Math.sign(x) || 1) {
      if (!held) return;
      held.position.set(x, y, 0);
      debris.push({
        mesh: held,
        vx: side * 0.6,
        vy: 0,
        vz: 0.4,
        spin: side * -4,
        rest: false,
      });
      held = null;
    },
    finish() {
      finished = true;
    },
    // Screen position of the top of the stack (for pop-up text).
    topScreen: () => project(stack[stack.length - 1]?.x ?? 0, top() + 0.15, 0),
    draw(dt, { item, lean }) {
      time += dt;
      resize();
      const h = top();

      // Camera: follow the top while playing, frame the whole burger after.
      const aspect = camera.aspect;
      const tanH = Math.tan(T.MathUtils.degToRad(FOV / 2));
      let wantY, wantDist;
      if (finished) {
        const span = Math.max(h, 1) + 0.8;
        wantY = span * 0.42;
        wantDist = Math.max(
          4.4,
          (span * 0.62) / tanH,
          HALF_WIDTH / (tanH * aspect),
        );
      } else {
        wantY = h + 0.45;
        wantDist = Math.max(4.4, HALF_WIDTH / (tanH * aspect));
      }
      const ease = 1 - Math.exp(-dt * (finished ? 1.6 : 3.5));
      camY += (wantY - camY) * ease;
      camDist += (wantDist - camDist) * ease;
      camera.position.set(0, camY + 0.85 + camDist * 0.06, camDist);
      camera.lookAt(0, camY, 0);
      camera.updateProjectionMatrix();
      // Move the shadow camera in whole shadow-map texels only, so shadows
      // don't shimmer while the camera glides up or pulls back.
      const c = new T.Vector3(0, camY - 0.5, 0);
      const snap = (v) => Math.round(v / SHADOW_TEXEL) * SHADOW_TEXEL;
      const cr = snap(c.dot(SUN_RIGHT));
      const cu = snap(c.dot(SUN_UP));
      const cf = c.dot(SUN_FWD);
      c.copy(SUN_RIGHT)
        .multiplyScalar(cr)
        .addScaledVector(SUN_UP, cu)
        .addScaledVector(SUN_FWD, cf);
      sun.target.position.copy(c);
      sun.position.copy(c).add(SUN_OFFSET);
      fill.intensity =
        5 + Math.sin(time * 9) * 0.4 + (Math.sin(time * 1.3) > 0.97 ? -3 : 0);

      // The stack sways: a lean towards where it's heavy, plus a jiggle.
      wobble = Math.max(0, wobble - dt * 1.4);
      const leanAmt = lean ? lean.amount ** 2 * lean.side : 0;
      const sway =
        leanAmt * 0.035 * (1 + Math.sin(time * 5) * 0.3) +
        Math.sin(time * 16) * 0.02 * wobble;
      const total = Math.max(0.5, h);
      layers.forEach(({ mesh: m }, i) => {
        const l = stack[i];
        const k = l.y / total;
        m.position.x = l.x + sway * k * total * 0.6;
        m.rotation.z = -sway * 0.35 * k;
        const L = layers[i];
        if (L.squash > 0) {
          L.squash = Math.max(0, L.squash - dt * 5);
          const s = Math.sin(L.squash * Math.PI) * 0.35;
          m.scale.set(1 + s * 0.4, 1 - s, 1 + s * 0.4);
        } else m.scale.set(1, 1, 1);
      });

      // The sliding (or falling) ingredient.
      if (held) {
        held.visible = !!item;
        if (item) {
          held.position.set(item.x, item.y, 0);
          held.rotation.y += dt * 0.6;
        }
      }
      // Where it will land: always the top of the stack, right below it.
      marker.visible = !!(held && item && item.y > h + 0.005);
      if (marker.visible) {
        const r = INGREDIENTS[heldKind].width / 2;
        const pulse = 1 + Math.sin(time * 6) * 0.04;
        marker.position.set(item.x, h + 0.004, 0);
        marker.scale.set(r * pulse, 1, r * pulse);
      }

      // Tipping over, then pieces flying loose and landing on the counter.
      if (tipping) {
        tipping.speed += dt * 5.5;
        tipping.angle += tipping.speed * dt;
        tipping.group.rotation.z = -tipping.side * tipping.angle;
        if (tipping.angle > 0.75) {
          tipping.group.updateMatrixWorld(true);
          const w = tipping.speed;
          for (const m of tipping.items) {
            const p = new T.Vector3();
            const q = new T.Quaternion();
            m.getWorldPosition(p);
            m.getWorldQuaternion(q);
            const rel = p.clone().sub(tipping.group.position);
            tipping.group.remove(m);
            scene.add(m);
            m.position.copy(p);
            m.quaternion.copy(q);
            debris.push({
              mesh: m,
              // Tangential velocity of a point on the turning stack.
              // Always away from the burger, though: a lone piece hanging
              // off the edge sits below the pivot, so its true tangent
              // points back in and it would land right back on the stack.
              vx:
                tipping.side *
                (Math.max(0.5, rel.y * w) + Math.random() * 0.3),
              vy: -Math.abs(rel.x) * w * 0.3,
              vz: 0.5 + Math.random() * 0.9,
              spin: -tipping.side * (2 + Math.random() * 4),
              rest: false,
            });
          }
          scene.remove(tipping.group);
          tipping = null;
        }
      }
      for (const d of debris) {
        if (d.rest) continue;
        d.vy -= G * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z = Math.min(
          COUNTER_FRONT - INGREDIENTS[d.mesh.userData.kind].width / 2,
          d.mesh.position.z + d.vz * dt,
        );
        d.mesh.rotation.z += d.spin * dt;
        // A hair above the surface so the piece's underside never z-fights
        // with the counter or plate.
        // Pieces over what's still standing land on top of it.
        const px = d.mesh.position.x;
        const pz = d.mesh.position.z;
        let base = Math.hypot(px, pz) < 0.9 ? 0 : DEBRIS_FLOOR;
        if (Math.abs(pz) < 0.5)
          for (let i = 0; i < layers.length; i++) {
            const l = stack[i];
            if (Math.abs(px - l.x) < l.width / 2)
              base = Math.max(base, l.y + l.height);
          }
        const floor = base + 0.004;
        if (d.mesh.position.y <= floor) {
          d.mesh.position.y = floor;
          if (Math.abs(d.vy) < 1.2) {
            d.rest = true;
            d.mesh.rotation.z =
              Math.round(d.mesh.rotation.z / Math.PI) * Math.PI;
            d.mesh.rotation.x = 0;
            // Landed upside down: its body hangs below the origin, so lift
            // it by its thickness to keep it out of the counter.
            const up = new T.Vector3(0, 1, 0).applyQuaternion(
              d.mesh.quaternion,
            );
            if (up.y < 0)
              d.mesh.position.y += INGREDIENTS[d.mesh.userData.kind].height;
          } else {
            d.vy *= -0.3;
            d.vx *= 0.5;
            d.vz *= 0.5;
            d.spin *= 0.5;
          }
        }
      }

      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        f.mesh.scale.setScalar(1 + f.t * 2.5);
        f.mesh.material.opacity = Math.max(0, 1 - f.t * 2.2);
        if (f.t > 0.5) {
          scene.remove(f.mesh);
          f.mesh.geometry.dispose();
          f.mesh.material.dispose();
          flashes.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    },
    get heldKind() {
      return heldKind;
    },
    dispose() {
      scene.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material))
          node.material.forEach((m) => m.dispose());
        else {
          node.material?.map?.dispose();
          node.material?.dispose();
        }
      });
      for (const m of mats.values()) m.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
