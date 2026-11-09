import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { PLAYER_H, WATER_Y, ledgeOffset } from "../shared/perchHop.js";

// A side-on backyard stage seen through an orthographic camera, so what you
// see lines up with the boxes in shared/perchHop.js. The play plane is
// z = 0: ledges are drawn with their top at their y, supports (legs, posts,
// ropes) reach down or up behind them. Each perch carries a flag that pops
// up in the player's colour once it's boarded.

const SKY = "#a6dcf3";
const LEAF = ["#4f8a3a", "#5d9a43", "#467d33", "#6aa84c"];
const FLOWERS = ["#ff7fb0", "#ffd84a", "#ffffff", "#ff9a4a", "#c9a0ff"];
const BALLOONS = ["#ff6b6b", "#ffd84a", "#6bc5ff", "#9be36b", "#c9a0ff"];
// How much yard around the stage is always in view.
const PAD_X = 0.9;
const VIEW_BOTTOM = -2.4;
const VIEW_TOP_PAD = 0.8;

export function createPerchHopScene(canvas, stage, player) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.background = new T.Color(SKY);
  const camera = new T.OrthographicCamera(-1, 25, 15, -2, 0.1, 200);
  camera.position.set(0, 0, 60);
  camera.lookAt(0, 0, 0);
  scene.add(new T.HemisphereLight("#fff8e2", "#6d8f55", 2.1));
  const sun = new T.DirectionalLight("#fff1ce", 2.1);
  sun.position.set(-5, 10, 12);
  scene.add(sun);

  const mats = new Map();
  const mat = (color, roughness = 0.75) => {
    const key = `${color}/${roughness}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshStandardMaterial({ color, roughness }));
    return mats.get(key);
  };
  const flat = (color) => {
    const key = `flat/${color}`;
    if (!mats.has(key)) mats.set(key, new T.MeshBasicMaterial({ color }));
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
  const cyl = new T.CylinderGeometry(1, 1, 1, 16);
  const rod = (x0, y0, x1, y1, r, material, z, parent) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = add(cyl, material, (x0 + x1) / 2, (y0 + y1) / 2, z, parent);
    m.scale.set(r, len, r);
    m.rotation.z = Math.atan2(x0 - x1, y1 - y0);
    return m;
  };

  // --- Sky, clouds and the far yard ----------------------------------------
  add(new T.CircleGeometry(1.3, 32), flat("#fff3b0"), 19.5, 13.4, -90);
  const clouds = new T.Group();
  scene.add(clouds);
  for (const [x, y, r] of [
    [3, 13.2, 0.9],
    [4.1, 13.5, 1.2],
    [5.3, 13.2, 0.8],
    [14, 11.6, 0.7],
    [15, 11.9, 1],
    [16.1, 11.6, 0.75],
    [26, 13, 0.8],
    [27, 13.3, 1],
  ])
    add(new T.CircleGeometry(r, 24), flat("#ffffff"), x, y, -80, clouds);
  const trunkFar = flat("#a99a86");
  const far = [flat("#b7d6a4"), flat("#aacf98"), flat("#c2dcb0")];
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 3.6 + (i % 2) * 0.9;
    const h = 2.2 + (i % 3) * 0.7;
    box(0.3, h, 0.3, trunkFar, x, h / 2, -60);
    add(blob, far[i % 3], x, h + 1, -60).scale.set(1.6, 1.5, 1);
  }
  // Back fence.
  const picket = mat("#f4efe2");
  for (let i = 0; i < 44; i++) {
    box(0.36, 1.7, 0.1, picket, -1 + i * 0.62, 0.85, -30);
    const tip = add(
      new T.CylinderGeometry(0, 0.26, 0.24, 4),
      picket,
      -1 + i * 0.62,
      1.82,
      -30,
    );
    tip.rotation.y = Math.PI / 4;
  }
  box(28, 0.12, 0.06, picket, 12.5, 1.25, -29.9);
  box(28, 0.12, 0.06, picket, 12.5, 0.5, -29.9);
  box(90, 46, 1, mat("#86b860"), 12, -23, -32);

  // --- Pond ---------------------------------------------------------------
  const [p0, p1] = stage.pond;
  const water = new T.MeshStandardMaterial({
    color: "#4fb3d9",
    roughness: 0.15,
    transparent: true,
    opacity: 0.88,
  });
  // Deep enough to fill the bottom of a tall phone screen.
  const DEEP = -40;
  box(
    p1 - p0 + 0.4,
    WATER_Y + 3,
    3,
    water,
    (p0 + p1) / 2,
    (WATER_Y - 3) / 2,
    -1,
  );
  box(
    p1 - p0 + 0.4,
    3 + DEEP * -1,
    3,
    mat("#2f6f8f"),
    (p0 + p1) / 2,
    (DEEP - 3) / 2,
    -1.2,
  );
  const ripples = [];
  for (let i = 0; i < Math.ceil((p1 - p0) / 2.4); i++) {
    const r = add(
      new T.PlaneGeometry(1.1, 0.06),
      new T.MeshBasicMaterial({
        color: "#d8f3ff",
        transparent: true,
        opacity: 0.7,
      }),
      p0 + 1 + i * 2.4,
      WATER_Y + 0.03,
      0.55,
    );
    ripples.push(r);
  }
  // Reeds at the pond edges.
  for (const x of [p0 + 0.2, p0 + 0.45, p1 - 0.3, p1 - 0.55])
    if (x > 0.2 && x < stage.width - 0.2)
      rod(x, 0, x + 0.1, 1.4 + (x % 0.5), 0.04, mat("#5f8f3a"), 0.8);

  // --- Blocks -------------------------------------------------------------
  const wood = mat("#b98552", 0.8);
  const woodDark = mat("#8e6038", 0.85);
  for (const b of stage.blocks) {
    const w = b.x1 - b.x0;
    const cx = (b.x0 + b.x1) / 2;
    const top = Math.min(b.top, 60);
    const bottom = b.bottom <= -4 ? DEEP : b.bottom;
    const h = top - bottom;
    if (b.look === "house") {
      // Reaches well off to the left for wide screens.
      box(w + 40, h, 4, mat("#f3e7cf"), cx - 20, bottom + h / 2, -1.5);
      // Siding lines.
      for (let y = 1.6; y < 16; y += 0.7)
        box(0.05, 0.05, 4.1, mat("#dccdb0"), b.x1 - 0.02, y, -1.5);
      box(0.2, 2, 1.4, mat("#c4e4f3", 0.2), b.x1, 4.6, -0.4);
      box(0.24, 0.16, 1.6, mat("#ffffff"), b.x1, 3.55, -0.4);
      box(0.2, 2, 1.4, mat("#c4e4f3", 0.2), b.x1, 11, -0.4);
    } else if (b.look === "trunk" || b.look === "oak") {
      const bark = mat("#7b5532", 0.9);
      // Beyond the big tree, a hedge for wide screens.
      if (b.look === "trunk")
        box(40, h, 1, mat("#4c7f3a"), b.x1 + 20, bottom + h / 2, -6);
      box(w, h, 2.4, bark, cx, bottom + h / 2, -0.8);
      for (let y = Math.max(bottom, -3) + 1; y < top - 0.3; y += 1.3)
        box(
          0.08,
          0.6,
          2.5,
          mat("#5e3f24", 0.9),
          b.x0 + 0.3 + (y % 1) * (w - 0.6),
          y,
          -0.8,
        );
      if (b.look === "trunk") {
        for (let i = 0; i < 9; i++)
          add(
            blob,
            mat(LEAF[i % 4]),
            cx - 1.6 + (i % 3) * 1.4,
            14 + Math.floor(i / 3) * 1.3,
            -3,
          ).scale.set(1.7, 1.3, 1);
      } else {
        // A cut stump top with rings.
        box(w, 0.08, 2.42, mat("#d8b483"), cx, top - 0.03, -0.8);
        add(
          new T.RingGeometry(0.3, 0.36, 24),
          flat("#b88c58"),
          cx,
          top - 0.3,
          0.42,
        );
      }
    } else if (b.look === "deck") {
      box(w, 0.32, 3, wood, cx, top - 0.16, -0.5);
      for (let x = b.x0 + 0.5; x < b.x1; x += 1)
        box(0.04, 0.33, 3.02, woodDark, x, top - 0.16, -0.5);
      box(w, h - 0.32, 2.6, mat("#7d5a3b"), cx, bottom + (h - 0.32) / 2, -0.7);
      for (let x = b.x0 + 0.6; x < b.x1; x += 2.2)
        box(0.3, h - 0.32, 0.3, woodDark, x, bottom + (h - 0.32) / 2, 0.62);
    } else if (b.look === "lawn") {
      box(w, h, 3, mat("#7fb05a"), cx, bottom + h / 2, -0.5);
      box(w, 0.2, 3.02, mat("#93c266"), cx, top - 0.1, -0.5);
      for (let x = b.x0 + 0.3; x < b.x1; x += 0.7)
        add(
          ball,
          mat(FLOWERS[Math.floor(x * 3) % 5], 0.5),
          x,
          top + 0.08,
          1,
        ).scale.setScalar(0.1);
    } else if (b.look === "shed") {
      box(w, h, 2.4, mat("#d86a5a"), cx, bottom + h / 2, -0.8);
      box(w + 0.3, 0.24, 2.6, mat("#5c4a44"), cx, top - 0.12, -0.8);
      box(0.9, 1.6, 0.1, mat("#f4efe2"), cx, 1.5, 0.45);
      for (let x = b.x0 + 0.35; x < b.x1; x += 0.5)
        box(
          0.03,
          h - 0.4,
          2.42,
          mat("#b85648"),
          x,
          bottom + (h - 0.4) / 2,
          -0.8,
        );
    }
  }

  // --- Ledges -------------------------------------------------------------
  const flagPole = mat("#d8d8d8", 0.4);
  const flagWaiting = new T.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.6,
    side: T.DoubleSide,
  });
  const flagDone = new T.MeshStandardMaterial({
    color: player.color,
    roughness: 0.5,
    side: T.DoubleSide,
    emissive: player.color,
    emissiveIntensity: 0.25,
  });
  const flagShape = new T.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.62, -0.2);
  flagShape.lineTo(0, -0.42);
  flagShape.closePath();
  const flagGeometry = new T.ShapeGeometry(flagShape);
  const glow = new T.MeshBasicMaterial({
    color: "#fff07a",
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const rope = mat("#e8dcc0", 0.9);
  const ledges = stage.ledges.map((l, i) => {
    const g = new T.Group();
    g.position.set(l.x, l.y, 0);
    scene.add(g);
    const w = l.w;
    const hw = w / 2;
    // Distance to whatever is under this ledge (for legs and posts).
    const below = (() => {
      let floor = -3;
      for (const b of stage.blocks)
        if (l.x > b.x0 && l.x < b.x1 && b.top <= l.y)
          floor = Math.max(floor, b.top);
      return l.y - floor;
    })();
    const parts = { g, spring: null };
    switch (l.look) {
      case "table": {
        box(w, 0.2, 1.4, mat("#e65b5b"), 0, -0.1, 0, g);
        for (let x = -hw + 0.2; x < hw; x += 0.4)
          box(0.2, 0.205, 1.41, mat("#ffffff"), x, -0.1, 0, g);
        for (const x of [-hw + 0.3, hw - 0.3])
          box(
            0.14,
            below - 0.2,
            0.14,
            wood,
            x,
            -0.2 - (below - 0.2) / 2,
            0.4,
            g,
          );
        box(w - 0.4, 0.1, 0.5, wood, 0, -below + 1, 0.9, g);
        break;
      }
      case "grill": {
        const lid = add(ball, mat("#2f3640", 0.4), 0, -0.36, 0, g);
        lid.scale.set(hw, 0.42, 0.6);
        box(w, 0.08, 1.2, mat("#3b434d", 0.4), 0, -0.04, 0, g);
        box(0.18, 0.1, 0.18, mat("#c0c4c8", 0.3), 0, -0.36 + 0.44, 0.2, g);
        for (const x of [-hw + 0.25, hw - 0.25])
          rod(x, -0.6, x * 1.3, -below, 0.04, mat("#2f3640"), 0.2, g);
        break;
      }
      case "lily": {
        const pad = add(cyl, mat("#5fae4a", 0.6), 0, -0.07, 0, g);
        pad.scale.set(hw, 0.14, 0.7);
        add(ball, mat("#ffb3d1", 0.5), hw * 0.4, 0.05, 0.3, g).scale.set(
          0.16,
          0.1,
          0.16,
        );
        break;
      }
      case "swing": {
        box(w, 0.16, 0.8, mat("#4aa0d8"), 0, -0.08, 0, g);
        for (const x of [-hw + 0.15, hw - 0.15])
          rod(x, 0, x, 3.2, 0.025, rope, 0, g);
        // The frame.
        rod(-hw - 0.6, 3.2, -hw - 1.2, -below, 0.08, mat("#e04f4f"), -0.6, g);
        rod(hw + 0.6, 3.2, hw + 1.2, -below, 0.08, mat("#e04f4f"), -0.6, g);
        rod(-hw - 0.6, 3.2, hw + 0.6, 3.2, 0.08, mat("#e04f4f"), -0.6, g);
        break;
      }
      case "post": {
        box(w, below, 0.9, mat("#efe7d6"), 0, -below / 2, 0, g);
        box(w + 0.1, 0.12, 1, mat("#d9cfba"), 0, -0.06, 0, g);
        break;
      }
      case "plank": {
        box(w, 0.2, 0.9, wood, 0, -0.1, 0, g);
        box(w, 0.04, 0.92, woodDark, 0, -0.18, 0, g);
        for (const x of [-hw + 0.2, hw - 0.2])
          rod(x, 0, x, 20, 0.025, rope, 0, g);
        break;
      }
      case "windowbox": {
        box(w, 0.5, 0.6, mat("#8a5a36"), 0, -0.25, 0, g);
        box(w + 0.06, 0.08, 0.66, mat("#a9734a"), 0, -0.04, 0, g);
        for (let k = 0; k < 4; k++)
          add(
            ball,
            mat(FLOWERS[k % 5], 0.5),
            -hw + 0.3 + k * ((w - 0.6) / 3),
            0.14,
            -0.4,
            g,
          ).scale.setScalar(0.14);
        break;
      }
      case "gutter": {
        // A hanging planter: a woven tray on ropes, with trailing leaves.
        box(w, 0.26, 0.8, mat("#b07a45", 0.9), 0, -0.13, 0, g);
        for (let x = -hw + 0.15; x < hw; x += 0.3)
          box(0.03, 0.27, 0.82, mat("#8e6038", 0.9), x, -0.13, 0, g);
        for (const x of [-hw + 0.1, hw - 0.1])
          rod(x, 0, 0, 2.4, 0.02, rope, -0.1, g);
        rod(0, 2.4, 0, 20, 0.02, rope, -0.1, g);
        for (let k = 0; k < 5; k++) {
          const leaf = add(
            blob,
            mat(LEAF[k % 4]),
            -hw + 0.2 + k * ((w - 0.4) / 4),
            -0.42 - (k % 2) * 0.2,
            0.2,
            g,
          );
          leaf.scale.set(0.18, 0.26, 0.12);
        }
        break;
      }
      case "branch": {
        rod(-hw, -0.14, hw, -0.14, 0.16, mat("#7b5532", 0.9), 0, g);
        rod(hw * 0.2, -0.14, hw * 0.7, 0.5, 0.06, mat("#7b5532", 0.9), -0.2, g);
        for (let k = 0; k < 4; k++)
          add(
            blob,
            mat(LEAF[(i + k) % 4]),
            -hw + 0.3 + k * (w / 3.5),
            0.45 + (k % 2) * 0.25,
            -0.9,
            g,
          ).scale.set(0.6, 0.45, 0.4);
        break;
      }
      case "birdhouse": {
        box(w, 0.14, 1, mat("#f2c84b"), 0, -0.07, 0, g);
        box(w * 0.75, 0.9, 0.8, mat("#e38a3b"), 0, -0.6, 0, g);
        add(new T.CircleGeometry(0.14, 16), flat("#4a2f1c"), 0, -0.55, 0.41, g);
        box(0.12, below - 1, 0.12, wood, 0, -1.05 - (below - 1.05) / 2, 0, g);
        break;
      }
      case "balloons": {
        box(w, 0.16, 0.8, mat("#f2a65a"), 0, -0.08, 0, g);
        for (let k = 0; k < 5; k++) {
          const bx = -hw + 0.25 + k * ((w - 0.5) / 4);
          const by = 1.6 + (k % 2) * 0.45;
          rod(0, 0, bx, by - 0.3, 0.012, mat("#ffffff"), -0.2, g);
          add(ball, mat(BALLOONS[k], 0.35), bx, by, -0.3, g).scale.set(
            0.3,
            0.36,
            0.3,
          );
        }
        break;
      }
      case "spring": {
        const ring = add(
          new T.TorusGeometry(hw, 0.07, 8, 24),
          mat("#3d8de0", 0.5),
          0,
          -0.1,
          0,
          g,
        );
        ring.rotation.x = Math.PI / 2;
        ring.scale.z = 0.25;
        const mat0 = add(cyl, mat("#2b2b33", 0.6), 0, -0.1, 0, g);
        mat0.scale.set(hw - 0.05, 0.05, 0.5);
        parts.spring = mat0;
        for (const x of [-hw + 0.1, hw - 0.1])
          rod(x, -0.1, x, -Math.min(below, 4), 0.05, mat("#3d8de0"), 0.2, g);
        break;
      }
      case "shedroof":
      case "stump":
        break;
      default:
        box(w, 0.2, 0.8, wood, 0, -0.1, 0, g);
    }
    if (l.perch) {
      const flag = new T.Group();
      flag.position.set(hw - 0.22, 0, 0.5);
      g.add(flag);
      rod(0, 0, 0, 1, 0.025, flagPole, 0, flag);
      const cloth = add(flagGeometry, flagWaiting, 0.02, 0.62, 0, flag);
      cloth.scale.set(0.7, 0.7, 1);
      const ring = add(
        new T.PlaneGeometry(w, 0.16),
        glow.clone(),
        0,
        0.06,
        0.7,
        g,
      );
      parts.flag = flag;
      parts.cloth = cloth;
      parts.glow = ring;
      parts.raised = 0;
    }
    return parts;
  });

  // --- The player ---------------------------------------------------------
  const body = new T.Group();
  scene.add(body);
  // Spin about the middle of the critter for a double-jump flip.
  const flip = new T.Group();
  flip.position.y = PLAYER_H / 2;
  body.add(flip);
  const critter = createAvatar("attacker", player.avatar, false);
  critter.scale.setScalar(0.62);
  critter.position.y = -PLAYER_H / 2;
  flip.add(critter);
  const shadow = add(
    new T.CircleGeometry(0.34, 20),
    new T.MeshBasicMaterial({
      color: "#000",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    0,
    0,
    0.2,
  );
  shadow.scale.y = 0.3;

  // Sparkles and splashes.
  const bits = [];
  const bitGeometry = new T.PlaneGeometry(0.16, 0.16);
  function burst(x, y, colors, n = 16, up = 2) {
    for (let i = 0; i < n; i++) {
      const m = add(
        bitGeometry,
        new T.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          side: T.DoubleSide,
        }),
        x,
        y,
        1.5,
      );
      const a = (i / n) * Math.PI * 2;
      bits.push({
        m,
        vx: Math.cos(a) * (1 + Math.random() * 2.4),
        vy: Math.sin(a) * (1 + Math.random() * 2) + up,
        spin: (Math.random() - 0.5) * 12,
        age: 0,
      });
    }
  }

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  let clock = 0;
  let flipTime = 0;
  let wasGrounded = true;
  const view = {
    x0: -PAD_X,
    x1: stage.width + PAD_X,
    y0: VIEW_BOTTOM,
    y1: stage.height + VIEW_TOP_PAD,
  };

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y)
      renderer.setSize(width, height, false);
    // Fit the yard above the touch buttons (if they're showing).
    const reserve = Math.min(height * 0.4, api.reserve?.() || 0);
    const room = height - reserve;
    const aspect = width / room;
    let w = view.x1 - view.x0;
    let h = view.y1 - view.y0;
    const need = h;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    const perPx = h / room;
    const cx = (view.x0 + view.x1) / 2;
    // On a tall screen, most of the spare height is sky.
    const bottom = view.y0 - (h - need) * 0.3 - reserve * perPx;
    Object.assign(camera, {
      left: cx - w / 2,
      right: cx + w / 2,
      bottom,
      top: bottom + height * perPx,
    });
    camera.updateProjectionMatrix();
    return true;
  }

  const api = {
    // The game sets reserve() to the screen pixels the touch buttons cover.
    reserve: null,
    // state: { run, still } — still freezes the critter's animation (paused).
    draw(dt, run, still = false) {
      if (!fit()) return;
      clock += dt;
      clouds.position.x = -((clock * 0.25) % 30) + 4;
      ripples.forEach((r, i) => {
        r.position.x = p0 + 1 + ((i * 2.4 + clock * 0.4) % (p1 - p0 - 1.2));
        r.material.opacity = 0.35 + 0.35 * Math.sin(clock * 2 + i);
      });
      stage.ledges.forEach((l, i) => {
        const [ox, oy] = ledgeOffset(l, run.t);
        const p = ledges[i];
        p.g.position.set(l.x + ox, l.y + oy, 0);
        if (p.spring)
          p.spring.position.y +=
            (-0.1 - p.spring.position.y) * Math.min(1, dt * 10);
        if (p.flag) {
          const done = run.boarded[i];
          p.raised += ((done ? 1 : 0) - p.raised) * Math.min(1, dt * 8);
          p.cloth.material = done ? flagDone : flagWaiting;
          p.cloth.position.y = 0.3 + p.raised * 0.32;
          p.cloth.rotation.y = Math.sin(clock * 4 + i) * 0.25;
          p.glow.visible = !done;
          p.glow.material.opacity = 0.35 + 0.3 * Math.sin(clock * 4 + i);
        }
      });

      // The critter: faces the way it's going, flips on a double jump.
      body.position.set(run.x, run.y, 0.4);
      const turn = (run.facing > 0 ? 1 : -1) * (Math.PI / 2 - 0.35);
      critter.rotation.y += (turn - critter.rotation.y) * Math.min(1, dt * 14);
      if (flipTime > 0) {
        flipTime = Math.max(0, flipTime - dt);
        flip.rotation.z = -run.facing * Math.PI * 2 * (1 - flipTime / 0.38);
      } else flip.rotation.z = 0;
      if (!still)
        animateAvatar(
          critter,
          {
            moveSpeed: run.grounded ? Math.abs(run.vx) * 0.75 : 0,
            grounded: run.grounded,
          },
          dt,
          run.done ? "win" : run.splashed ? "hit" : undefined,
        );
      // Squash a little on landing.
      if (run.grounded && !wasGrounded) body.scale.set(1.12, 0.86, 1);
      wasGrounded = run.grounded;
      body.scale.x += (1 - body.scale.x) * Math.min(1, dt * 10);
      body.scale.y += (1 - body.scale.y) * Math.min(1, dt * 10);
      // A soft shadow under your feet while you stand.
      shadow.visible = run.grounded;
      shadow.position.set(run.x, run.y + 0.01, 0.2);

      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        b.vy -= 7 * dt;
        b.m.position.x += b.vx * dt;
        b.m.position.y += b.vy * dt;
        b.m.rotation.z += b.spin * dt;
        b.m.material.opacity = Math.max(0, 1 - b.age / 1.1);
        if (b.age > 1.1) {
          scene.remove(b.m);
          b.m.material.dispose();
          bits.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
    },
    flip() {
      flipTime = 0.38;
    },
    perch(i, run) {
      const l = stage.ledges[i];
      const [ox, oy] = ledgeOffset(l, run.t);
      burst(
        l.x + ox + l.w / 2 - 0.2,
        l.y + oy + 0.8,
        [player.color, "#fff07a", "#ffffff"],
        18,
        2.5,
      );
    },
    bounce(i) {
      if (ledges[i]?.spring) ledges[i].spring.position.y = -0.45;
    },
    splash(x) {
      burst(x, WATER_Y, ["#bfe9ff", "#ffffff", "#4fb3d9"], 22, 4);
    },
    cheer(run) {
      burst(run.x, run.y + 1.4, [player.color, ...BALLOONS], 30, 3);
    },
    dispose() {
      releaseAvatar(critter);
      const shared = new Set(mats.values());
      scene.traverse((node) => {
        if (node.geometry && node.geometry !== unitBox)
          node.geometry.dispose?.();
        if (node.material && !shared.has(node.material))
          node.material.dispose?.();
      });
      for (const m of mats.values()) m.dispose();
      unitBox.dispose();
      renderer.dispose();
    },
  };
  return api;
}
