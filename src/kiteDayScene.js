import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  HEDGE_Y,
  OAK,
  OAK_TRUNK,
  POLES,
  PORCH_HALF,
  PORCH_Y,
  YARD_LEFT,
  YARD_RIGHT,
  YARD_TOP,
  gustWarning,
  wirePoints,
} from "../shared/kiteDay.js";

// A side-on backyard on a windy afternoon: sky and clouds, the back porch
// in the middle with your critter holding the string, hedges either side,
// the big oak on the left and the power line on the right. The play plane
// is z = 0 and the camera is orthographic, so what you see lines up with
// the hitboxes in shared/kiteDay.js. The whole yard always fits on screen;
// extra room on tall or wide screens shows more sky and lawn.
const VIEW = {
  left: YARD_LEFT - 0.4,
  right: YARD_RIGHT + 0.4,
  bottom: -0.9,
  top: YARD_TOP + 0.5,
};

const SKY_TOP = "#5aa9e6";
const SKY_LOW = "#cfeefc";
const LEAF = ["#4f8a3a", "#5d9a43", "#467d33", "#6aa84c"];
const HEDGE = ["#3f7d36", "#4c8f3e", "#3a7332"];
export const RIBBON_COLORS = {
  coral: "#ff7a6b",
  sky: "#4fb6ff",
  lime: "#8bdc4a",
  violet: "#b48cff",
  sun: "#ffc93c",
  gold: "#ffd54a",
};
// Each kite: its two sail colours and tail bows.
const KITE_LOOKS = [
  { a: "#ff5f8f", b: "#ffd84a", bow: ["#ff5f8f", "#ffd84a", "#4fb6ff"] },
  { a: "#4fb6ff", b: "#8bdc4a", bow: ["#4fb6ff", "#8bdc4a", "#ff9a4a"] },
];
const TAIL = 9;

export function createKiteDayScene(canvas, flyers) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.background = new T.Color(SKY_LOW);
  const camera = new T.OrthographicCamera(-10, 10, 10, -2, 0.1, 200);
  camera.position.set(0, 0, 60);
  camera.lookAt(0, 0, 0);

  scene.add(new T.HemisphereLight("#fff8e2", "#6d8f55", 2.1));
  const sun = new T.DirectionalLight("#fff1ce", 2.1);
  sun.position.set(-4, 9, 10);
  scene.add(sun);

  const mats = new Map();
  const mat = (color, roughness = 0.8) => {
    const key = `${color}/${roughness}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshStandardMaterial({ color, roughness }));
    return mats.get(key);
  };
  const flat = (color) => {
    const key = `flat/${color}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshBasicMaterial({ color, side: T.DoubleSide }));
    return mats.get(key);
  };
  const add = (geometry, material, x, y, z, parent = scene) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const box = (w, h, d, material, x, y, z, parent) => {
    const m = add(unitBox, material, x, y, z, parent);
    m.scale.set(w, h, d);
    return m;
  };
  const blob = new T.IcosahedronGeometry(1, 1);
  const ball = new T.SphereGeometry(1, 16, 12);
  const unitCylinder = new T.CylinderGeometry(1, 1, 1, 14);
  const circle = new T.CircleGeometry(1, 28);

  // --- Sky ---------------------------------------------------------------
  {
    const sky = new T.PlaneGeometry(400, 60, 1, 6);
    const colors = [];
    const top = new T.Color(SKY_TOP);
    const low = new T.Color(SKY_LOW);
    const pos = sky.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const f = T.MathUtils.clamp((pos.getY(i) + 30 - 2) / 18, 0, 1);
      const c = low.clone().lerp(top, f);
      colors.push(c.r, c.g, c.b);
    }
    sky.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    const m = new T.MeshBasicMaterial({ vertexColors: true });
    mats.set("sky", m);
    add(sky, m, 0, 28, -95);
  }
  add(circle, flat("#fff6c4"), 7.5, 12.6, -90).scale.setScalar(1.25);
  add(circle, flat("#fffbe2"), 7.5, 12.6, -91).scale.setScalar(1.7);

  const clouds = [];
  for (const [x, y, s] of [
    [-8, 12.5, 1],
    [-1, 10.6, 0.8],
    [5, 13.4, 0.7],
    [11, 9.6, 0.9],
    [-14, 9.2, 0.75],
  ]) {
    const g = new T.Group();
    for (const [dx, dy, r] of [
      [0, 0, 1],
      [1.1, 0.3, 1.25],
      [2.3, 0, 0.9],
      [1.1, -0.35, 1],
    ])
      add(circle, flat("#ffffff"), dx, dy, 0, g).scale.setScalar(r);
    g.position.set(x, y, -80);
    g.scale.setScalar(s);
    scene.add(g);
    clouds.push(g);
  }

  // --- Far hills, the house next door, the fence ---------------------------
  for (const [x, w, h, c] of [
    [-14, 12, 3.2, "#a9d39a"],
    [-2, 14, 2.4, "#b7dca4"],
    [11, 13, 3.6, "#a2cd92"],
  ]) {
    const hill = add(circle, flat(c), x, 0.4, -70);
    hill.scale.set(w / 2, h, 1);
  }
  box(4.2, 2.6, 0.5, flat("#efe3cf"), 1.5, 1.9, -60);
  {
    const roof = add(
      new T.CylinderGeometry(0.01, 3.1, 1.5, 4, 1),
      flat("#d79a88"),
      1.5,
      3.95,
      -60,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.3);
    box(0.7, 0.7, 0.1, flat("#c4e4f3"), 0.4, 2.2, -59.6);
    box(0.7, 0.7, 0.1, flat("#c4e4f3"), 2.6, 2.2, -59.6);
  }
  const picket = mat("#f4efe2");
  for (let x = -40; x <= 40; x += 0.62) {
    box(0.36, 1.5, 0.1, picket, x, 0.75, -30);
    const tip = add(
      new T.CylinderGeometry(0, 0.26, 0.24, 4),
      picket,
      x,
      1.62,
      -30,
    );
    tip.rotation.y = Math.PI / 4;
  }
  box(80, 0.14, 0.08, picket, 0, 1.1, -30.1);
  box(80, 0.14, 0.08, picket, 0, 0.4, -30.1);

  // --- Lawn ---------------------------------------------------------------
  box(400, 40, 1, flat("#7fbf5a"), 0, -20, -20);
  box(400, 0.25, 1, flat("#91cc69"), 0, -0.1, -19);

  // --- Oak (its canopy matches the OAK hit circles) -----------------------
  {
    const bark = mat("#7b5532");
    box(
      1,
      OAK_TRUNK.top + 0.5,
      0.8,
      bark,
      OAK_TRUNK.x,
      (OAK_TRUNK.top - 0.5) / 2,
      -1,
    );
    const limb = box(0.45, 3.2, 0.4, bark, -9.2, 8.2, -1);
    limb.rotation.z = -0.7;
    OAK.forEach((c, i) => {
      add(blob, mat(LEAF[i % LEAF.length]), c.x, c.y, -0.6).scale.set(
        c.r * 1.05,
        c.r,
        0.6,
      );
      // Little clumps around the edge so it doesn't look like a ball.
      for (let j = 0; j < 5; j++) {
        const ang = (j / 5) * Math.PI * 2 + i;
        add(
          blob,
          mat(LEAF[(i + j + 1) % LEAF.length]),
          c.x + Math.cos(ang) * c.r * 0.75,
          c.y + Math.sin(ang) * c.r * 0.7,
          -0.4,
        ).scale.setScalar(c.r * 0.42);
      }
    });
  }

  // --- Power poles and the wire -------------------------------------------
  {
    const wood = mat("#8a6a4a");
    for (const p of POLES) {
      const pole = add(unitCylinder, wood, p.x, p.y / 2, -1.2);
      pole.scale.set(0.16, p.y + 0.6, 0.16);
      box(1.6, 0.14, 0.14, wood, p.x, p.y + 0.15, -1.2);
      for (const dx of [-0.6, 0.6])
        add(
          unitCylinder,
          mat("#dfe8ee", 0.3),
          p.x + dx,
          p.y + 0.3,
          -1.1,
        ).scale.set(0.07, 0.18, 0.07);
    }
    const pts = wirePoints(24).map((p) => new T.Vector3(p.x, p.y, -0.2));
    add(
      new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, 0.06, 6),
      mat("#2b2f36", 0.5),
      0,
      0,
      0,
    );
  }

  // --- Hedges either side of the porch --------------------------------------
  for (let x = YARD_LEFT - 6; x <= YARD_RIGHT + 6; x += 0.9) {
    if (Math.abs(x) < PORCH_HALF + 0.2) continue;
    const r = 0.75 + ((((x * 7.3) % 1) + 1) % 1) * 0.25;
    add(
      blob,
      mat(HEDGE[Math.abs(Math.round(x * 3)) % 3]),
      x,
      HEDGE_Y - r * 0.85,
      0.8,
    ).scale.set(r, r, 0.6);
  }

  // --- The porch ------------------------------------------------------------
  {
    const deck = mat("#c98f5a");
    const dark = mat("#9b6a3f");
    box(PORCH_HALF * 2 + 0.3, 0.3, 2, deck, 0, PORCH_Y - 0.55, 1);
    box(
      PORCH_HALF * 2 + 0.3,
      PORCH_Y - 0.7,
      2,
      dark,
      0,
      (PORCH_Y - 0.7) / 2,
      1,
    );
    for (const x of [-PORCH_HALF, PORCH_HALF]) {
      box(0.22, 1.2, 0.22, deck, x, PORCH_Y - 0.4 + 0.6, 1.9);
    }
    box(PORCH_HALF * 2, 0.12, 0.12, deck, 0, PORCH_Y + 0.4, 1.95);
  }

  // --- Windsock on the right porch post -------------------------------------
  const sock = new T.Group();
  {
    box(0.1, 1.6, 0.1, mat("#d9d4c8"), PORCH_HALF, PORCH_Y + 1, 2);
    sock.position.set(PORCH_HALF, PORCH_Y + 1.75, 2.1);
    scene.add(sock);
    const cone = new T.CylinderGeometry(0.12, 0.26, 0.42, 14, 1, true);
    ["#ff6b4a", "#ffffff", "#ff6b4a"].forEach((c, i) => {
      const seg = add(cone, mat(c, 0.6), 0.26 + i * 0.4, 0, 0, sock);
      seg.rotation.z = Math.PI / 2;
      seg.material.side = T.DoubleSide;
    });
  }

  // --- Your critter(s) on the porch ------------------------------------------
  const critters = flyers.map((f) => {
    const c = createAvatar("attacker", f.avatar, false);
    c.scale.setScalar(0.62);
    c.position.set(f.anchor.x, PORCH_Y - 0.4, 1.4);
    scene.add(c);
    return c;
  });

  // --- Kites -----------------------------------------------------------------
  const kites = flyers.map((f, i) => {
    const look = KITE_LOOKS[i % KITE_LOOKS.length];
    const g = new T.Group();
    const sail = new T.Group();
    g.add(sail);
    // A diamond: four triangles in two colours.
    const tri = (ax, ay, bx, by, color) => {
      const geo = new T.BufferGeometry();
      geo.setAttribute(
        "position",
        new T.Float32BufferAttribute([0, 0, 0, ax, ay, 0, bx, by, 0], 3),
      );
      geo.computeVertexNormals();
      sail.add(new T.Mesh(geo, flat(color)));
    };
    const W = 0.62;
    const TOP = 0.85;
    const BOT = -0.6;
    tri(0, TOP, -W, 0, look.a);
    tri(W, 0, 0, TOP, look.b);
    tri(-W, 0, 0, BOT, look.b);
    tri(0, BOT, W, 0, look.a);
    const spar = flat("#5b3b22");
    box(0.05, TOP - BOT, 0.02, spar, 0, (TOP + BOT) / 2, 0.02, sail);
    box(W * 2, 0.05, 0.02, spar, 0, 0, 0.02, sail);
    g.position.z = 0.6;
    scene.add(g);
    // The tail: bows that trail behind on past positions.
    const bows = Array.from({ length: TAIL }, (_, j) => {
      const b = new T.Group();
      for (const s of [-1, 1]) {
        const geo = new T.BufferGeometry();
        geo.setAttribute(
          "position",
          new T.Float32BufferAttribute(
            [0, 0, 0, s * 0.2, 0.1, 0, s * 0.2, -0.1, 0],
            3,
          ),
        );
        b.add(new T.Mesh(geo, flat(look.bow[j % look.bow.length])));
      }
      b.position.z = 0.5;
      scene.add(b);
      return b;
    });
    // The string: a thin strip of quads, rebuilt each frame.
    const N = 24;
    const strip = new T.BufferGeometry();
    strip.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3),
    );
    const index = [];
    for (let k = 0; k < N; k++) {
      const a = k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    strip.setIndex(index);
    const line = new T.Mesh(strip, flat("#f7f3ea"));
    line.position.z = 0.3;
    line.frustumCulled = false;
    scene.add(line);
    return { g, sail, bows, trail: [], line, strip, N, spin: 0 };
  });

  function drawString(view, anchor, kite) {
    const { strip, N } = view;
    const pos = strip.attributes.position;
    const hx =
      anchor.x + (flyers.length > 1 ? 0.25 * Math.sign(anchor.x) : 0.25);
    const hy = anchor.y + 0.55;
    const ex = kite.x;
    const ey = kite.y - 0.1;
    const len = Math.hypot(ex - hx, ey - hy) || 1;
    // A slack string bellies down toward the grass.
    const sag =
      (1 - kite.lift) * len * 0.16 + 0.15 + (kite.tumble > 0 ? 0.6 : 0);
    const nx = -(ey - hy) / len;
    const ny = (ex - hx) / len;
    const w = 0.035;
    for (let k = 0; k <= N; k++) {
      const f = k / N;
      const x = hx + (ex - hx) * f;
      const y = hy + (ey - hy) * f - sag * 4 * f * (1 - f);
      pos.setXYZ(k * 2, x + nx * w, y + ny * w, 0);
      pos.setXYZ(k * 2 + 1, x - nx * w, y - ny * w, 0);
    }
    pos.needsUpdate = true;
    strip.computeBoundingSphere();
  }

  // --- Ribbons -----------------------------------------------------------------
  const ring = new T.TorusGeometry(1, 0.085, 10, 40);
  const streamer = new T.PlaneGeometry(0.16, 1);
  const ribbons = new Map(); // id → view
  function makeRibbon(r) {
    const g = new T.Group();
    const color = RIBBON_COLORS[r.color];
    const loop = add(ring, mat(color, r.gold ? 0.25 : 0.5), 0, 0, 0, g);
    loop.scale.set(r.r, r.r, r.r);
    if (r.gold) {
      const glow = add(
        circle,
        new T.MeshBasicMaterial({
          color: "#fff3a0",
          transparent: true,
          opacity: 0.28,
        }),
        0,
        0,
        -0.1,
        g,
      );
      glow.scale.setScalar(r.r * 1.35);
      g.userData.glow = glow;
    }
    const tails = [0, 1, 2].map((j) => {
      const s = add(
        streamer,
        flat(j === 1 ? "#ffffff" : color),
        (j - 1) * 0.28,
        -r.r - 0.45,
        -0.05,
        g,
      );
      return s;
    });
    g.userData.tails = tails;
    g.position.set(r.x, r.y, 0);
    scene.add(g);
    return g;
  }

  // --- Crows ---------------------------------------------------------------------
  const crowViews = [];
  function makeCrow() {
    const g = new T.Group();
    const black = mat("#22232b", 0.6);
    add(ball, black, 0, 0, 0, g).scale.set(0.5, 0.3, 0.3);
    add(ball, black, 0.45, 0.12, 0, g).scale.setScalar(0.22);
    const beak = add(
      new T.ConeGeometry(0.08, 0.26, 6),
      mat("#f2a33a"),
      0.72,
      0.1,
      0,
      g,
    );
    beak.rotation.z = -Math.PI / 2;
    add(ball, flat("#ffffff"), 0.52, 0.18, 0.2, g).scale.setScalar(0.06);
    const wings = [-1, 1].map((s) => {
      const pivot = new T.Group();
      pivot.position.set(0, 0.1, s * 0.05);
      box(0.5, 0.06, 0.6, black, 0, 0, s * 0.3, pivot);
      g.add(pivot);
      return pivot;
    });
    g.userData.wings = wings;
    g.position.z = 0.7;
    // An arrow at the edge while the crow is still off-screen.
    const arrow = add(
      new T.ConeGeometry(0.32, 0.6, 3),
      flat("#ff8a3d"),
      0,
      0,
      2,
    );
    scene.add(g);
    return { g, arrow };
  }

  // --- Blowing leaves (a gust is coming) ------------------------------------
  const leafGeometry = new T.PlaneGeometry(0.26, 0.15);
  const leaves = Array.from({ length: 16 }, () => {
    const m = add(
      leafGeometry,
      flat(LEAF[Math.floor(Math.random() * 4)]),
      0,
      0,
      1.5,
    );
    m.visible = false;
    return { m, vx: 0, vy: 0, spin: 0, live: false };
  });
  let leafClock = 0;

  // --- Confetti ----------------------------------------------------------------
  const bits = [];
  const bitGeometry = new T.PlaneGeometry(0.2, 0.12);
  function burst(x, y, colors, count = 18, speed = 4) {
    for (let i = 0; i < count; i++) {
      const m = add(
        bitGeometry,
        new T.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          side: T.DoubleSide,
        }),
        x,
        y,
        1.8,
      );
      const ang = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      bits.push({
        m,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v + 1.5,
        spin: (Math.random() - 0.5) * 14,
        age: 0,
      });
    }
  }

  const size = new T.Vector2();
  let view = { ...VIEW };
  // Tall, narrow screens (a phone held upright) can't fit the whole yard
  // across without shrinking it to a strip, so they show at least
  // MIN_VIEW_WIDTH of it and pan sideways to follow the kite.
  const MIN_VIEW_WIDTH = 12.5;
  let camX = 0;
  function fit(dt, focusX) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y)
      renderer.setSize(width, height, false);
    const aspect = width / height;
    const yardW = VIEW.right - VIEW.left;
    const yardH = VIEW.top - VIEW.bottom;
    let w = yardW;
    let h = yardH;
    if (w / h < aspect) w = h * aspect;
    else {
      w = Math.max(MIN_VIEW_WIDTH, h * aspect);
      h = w / aspect;
    }
    let cx = (VIEW.left + VIEW.right) / 2;
    if (w < yardW) {
      const half = (yardW - w) / 2;
      const target = T.MathUtils.clamp(focusX, cx - half, cx + half);
      camX += (target - camX) * Math.min(1, dt * 2.5);
      camX = T.MathUtils.clamp(camX, cx - half, cx + half);
      cx = camX;
    } else camX = cx;
    // Extra height goes to the sky, and a little to the lawn (where the
    // touch buttons sit).
    const bottom = VIEW.bottom - Math.max(0, h - yardH) * 0.3;
    view = { left: cx - w / 2, right: cx + w / 2, bottom, top: bottom + h };
    Object.assign(camera, view);
    camera.updateProjectionMatrix();
    return true;
  }

  let clock = 0;
  const point = new T.Vector3();
  return {
    // game: the shared game state (shared/kiteDay.js).
    draw(dt, game) {
      const focus =
        game.kites.reduce((sum, k) => sum + k.x, 0) / game.kites.length;
      if (!fit(dt, focus)) return;
      clock += dt;
      const wind = game.windNow;
      const warning = gustWarning(game.wind);

      // Clouds drift with the breeze.
      for (const c of clouds) {
        c.position.x += (0.25 + wind * 0.5) * dt;
        if (c.position.x > view.right + 4) c.position.x = view.left - 6;
        if (c.position.x < view.left - 7) c.position.x = view.right + 3;
      }

      // Windsock: points downwind, stiffer the harder it blows, flapping
      // when a gust is on the way.
      const strength = Math.min(1, Math.abs(wind) / 1.2);
      const flap = warning
        ? Math.sin(clock * 22) * 0.18
        : Math.sin(clock * 5) * 0.05;
      const droop = -(1 - strength) * 1.1 + flap;
      sock.rotation.y = wind < 0 ? Math.PI : 0;
      sock.rotation.z += (droop - sock.rotation.z) * Math.min(1, dt * 6);

      // Leaves blow in from upwind just before a gust.
      leafClock -= dt;
      if (warning && leafClock <= 0) {
        leafClock = 0.12;
        const free = leaves.find((l) => !l.live);
        if (free) {
          free.live = true;
          free.m.visible = true;
          const dir = warning.dir;
          free.m.position.set(
            dir > 0 ? view.left - 0.5 : view.right + 0.5,
            1 + Math.random() * 9,
            1.5,
          );
          free.vx = dir * (7 + Math.random() * 4);
          free.vy = (Math.random() - 0.3) * 1.5;
          free.spin = (Math.random() - 0.5) * 10;
        }
      }
      for (const l of leaves) {
        if (!l.live) continue;
        l.m.position.x += l.vx * dt;
        l.m.position.y += (l.vy + Math.sin(clock * 6 + l.spin) * 0.8) * dt;
        l.m.rotation.z += l.spin * dt;
        if (l.m.position.x < view.left - 1 || l.m.position.x > view.right + 1) {
          l.live = false;
          l.m.visible = false;
        }
      }

      // Kites, tails and strings.
      game.kites.forEach((k, i) => {
        const v = kites[i];
        v.g.position.x = k.x;
        v.g.position.y = k.y;
        const tumbling = k.tumble > 0;
        if (tumbling) v.spin += dt * 9;
        else v.spin = 0;
        const tilt = tumbling
          ? v.spin
          : -k.a * 0.55 +
            Math.sin(k.shake * 2.6) * (0.06 + (1 - k.lift) * 0.12);
        v.g.rotation.z = tilt;
        v.g.visible = !(k.safe > 0 && Math.floor(k.safe * 8) % 2 === 0);
        // Trail: the tail hangs below and streams downwind.
        v.trail.unshift({ x: k.x, y: k.y });
        if (v.trail.length > 200) v.trail.length = 200;
        let px = k.x + Math.sin(tilt) * 0.6;
        let py = k.y - Math.cos(tilt) * 0.6;
        v.bows.forEach((b, j) => {
          const old = v.trail[Math.min(v.trail.length - 1, (j + 1) * 3)];
          const wave = Math.sin(clock * 6 - j * 0.8) * 0.12;
          const tx = px + (old.x - k.x) * 0.25 - wind * 0.08 + wave;
          const ty = py - 0.32 + (old.y - k.y) * 0.25;
          b.position.x = tx;
          b.position.y = ty;
          b.rotation.z = wave * 2;
          b.visible = v.g.visible;
          px = tx;
          py = ty;
        });
        drawString(v, k.anchor, k);
        v.line.visible = !tumbling || k.tumble > 0.3;
        const c = critters[i];
        // Lean back while reeling, face the kite.
        c.rotation.y = Math.PI * 0.08 * Math.sign(k.x - k.anchor.x);
        animateAvatar(
          c,
          { moveSpeed: k.lift > 0.9 && !tumbling ? 1.2 : 0 },
          dt,
        );
      });

      // Ribbons in and out.
      const seen = new Set();
      for (const r of game.ribbons) {
        seen.add(r.id);
        let g = ribbons.get(r.id);
        if (!g) {
          g = makeRibbon(r);
          ribbons.set(r.id, g);
        }
        const life = Math.min(
          1,
          (game.t - r.born) * 3,
          Math.max(0, r.until - game.t) * 1.5,
        );
        const pulse = 1 + Math.sin(clock * 3 + r.id) * 0.04;
        g.scale.setScalar(Math.max(0.01, life * pulse));
        g.position.y = r.y + Math.sin(clock * 1.6 + r.id) * 0.08;
        g.userData.tails.forEach((s, j) => {
          s.rotation.z = Math.sin(clock * 4 + j) * 0.25 + wind * -0.3;
        });
        if (g.userData.glow)
          g.userData.glow.material.opacity = 0.2 + Math.sin(clock * 5) * 0.1;
      }
      for (const [id, g] of ribbons) {
        if (seen.has(id)) continue;
        scene.remove(g);
        g.userData.glow?.material.dispose();
        ribbons.delete(id);
      }

      // Crows, with an arrow at the edge until they fly in.
      while (crowViews.length < game.crows.length) crowViews.push(makeCrow());
      crowViews.forEach((cv, i) => {
        const c = game.crows[i];
        cv.g.visible = !!c;
        cv.arrow.visible = false;
        if (!c) return;
        cv.g.position.x = c.x;
        cv.g.position.y = c.y;
        cv.g.scale.x = c.dir;
        const beat = Math.sin(clock * 14 + i);
        cv.g.userData.wings.forEach(
          (w, j) => (w.rotation.x = (j ? 1 : -1) * beat * 0.9),
        );
        const off = c.dir > 0 ? c.x < view.left : c.x > view.right;
        if (off) {
          cv.arrow.visible = Math.floor(clock * 6) % 2 === 0;
          cv.arrow.position.set(
            c.dir > 0 ? view.left + 0.6 : view.right - 0.6,
            c.y,
            2,
          );
          cv.arrow.rotation.z = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      });

      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        b.vy -= 6 * dt;
        b.vx *= 1 - dt * 0.9;
        b.m.position.x += b.vx * dt;
        b.m.position.y += b.vy * dt;
        b.m.rotation.z += b.spin * dt;
        b.m.rotation.x += b.spin * 0.4 * dt;
        b.m.material.opacity = Math.max(0, 1 - b.age / 1.3);
        if (b.age > 1.3) {
          scene.remove(b.m);
          b.m.material.dispose();
          bits.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
    },
    // Confetti where a ribbon popped.
    ribbon(r) {
      const c = RIBBON_COLORS[r.color];
      burst(
        r.x,
        r.y,
        r.gold
          ? ["#ffd54a", "#fff3a0", "#ffb300", "#ffffff"]
          : [c, "#ffffff", "#ffd84a", "#ff7fb0"],
        r.gold ? 30 : 18,
        r.gold ? 5 : 4,
      );
    },
    // Bits flying where the kite hit something.
    bump(what, x, y) {
      const colors =
        what === "oak" || what === "hedge"
          ? [...LEAF, "#7b5532"]
          : what === "crow"
            ? ["#22232b", "#3a3b45", "#ffffff"]
            : ["#ffe066", "#ffffff", "#ffd84a"];
      burst(x, y, colors, 14, 3);
    },
    toScreen(x, y) {
      point.set(x, y, 0).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    dispose() {
      for (const c of critters) releaseAvatar(c);
      for (const b of bits) b.m.material.dispose();
      for (const g of ribbons.values()) g.userData.glow?.material.dispose();
      scene.traverse((node) => {
        if (node.geometry && node.geometry !== unitBox)
          node.geometry.dispose?.();
      });
      for (const m of mats.values()) m.dispose();
      unitBox.dispose();
      renderer.dispose();
    },
  };
}
