import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  CEILING,
  GROUND,
  HELI_X,
  OBSTACLE_HALF,
} from "../shared/backyardFlier.js";

// A side-on backyard that scrolls right to left past a toy helicopter. The
// play plane is z = 0 and the camera is orthographic, so what you see lines
// up exactly with the hitboxes in shared/backyardFlier.js. Layers behind it
// (clouds, far trees, the fence) scroll slower for depth.
const VIEW_BOTTOM = -1.7;
const VIEW_HEIGHT = 12.6;
// Narrow screens get a taller view so there's always this much yard across;
// some of the extra height goes to the grass and the rest to the canopy.
const MIN_VIEW_WIDTH = 8.5;
const EXTRA_BELOW = 0.4;
// The helicopter sits this far across the screen from the left.
const HELI_SCREEN = 0.3;

const SKY = "#9fd9f2";
const LEAF = ["#4f8a3a", "#5d9a43", "#467d33", "#6aa84c"];
const SHRUB = ["#3f7d36", "#4c8f3e", "#5a9a3f"];
const FLOWERS = ["#ff7fb0", "#ffd84a", "#ffffff", "#ff9a4a", "#c9a0ff"];

export function createBackyardFlierScene(canvas, pilot) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.background = new T.Color(SKY);
  const camera = new T.OrthographicCamera(-10, 10, 10, -2, 0.1, 200);
  camera.position.set(0, 0, 60);
  camera.lookAt(0, 0, 0);

  scene.add(new T.HemisphereLight("#fff8e2", "#6d8f55", 2.1));
  const sun = new T.DirectionalLight("#fff1ce", 2.2);
  sun.position.set(-4, 9, 10);
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
  const unitCylinder = new T.CylinderGeometry(1, 1, 1, 14);

  // A strip of copies of `make(group)` that scrolls at `factor` of the
  // yard's speed and wraps every `width`.
  const layers = [];
  function layer(width, factor, make) {
    const copies = [0, 1, 2].map(() => {
      const g = new T.Group();
      make(g);
      scene.add(g);
      return g;
    });
    layers.push({ width, factor, copies });
  }

  // --- Sky and clouds -----------------------------------------------------
  add(new T.CircleGeometry(1.4, 32), flat("#fff3b0"), -6, 9.4, -90);
  layer(34, 0.08, (g) => {
    const cloud = flat("#ffffff");
    for (const [x, y, r] of [
      [2, 8.6, 1],
      [3.2, 8.9, 1.3],
      [4.5, 8.6, 0.9],
      [17, 7.1, 0.8],
      [18, 7.4, 1.1],
      [19.2, 7.1, 0.85],
      [27, 9.3, 0.7],
      [27.9, 9.5, 0.9],
    ])
      add(new T.CircleGeometry(r, 24), cloud, x, y, -80, g);
  });

  // --- Far trees and a house ---------------------------------------------
  layer(30, 0.25, (g) => {
    // Pale and hazy so the branches and shrubs up front stand out.
    const trunk = flat("#a99a86");
    const far = [flat("#b7d6a4"), flat("#aacf98"), flat("#c2dcb0")];
    for (let i = 0; i < 6; i++) {
      const x = i * 5 + (i % 2) * 1.3;
      const h = 1.6 + (i % 3) * 0.5;
      box(0.3, h, 0.3, trunk, x, h / 2, -60, g);
      add(blob, far[i % 3], x, h + 0.8, -60, g).scale.set(1.4, 1.3, 1);
    }
    // A house peeking over the fence.
    box(4, 2.6, 1, flat("#efe3cf"), 14, 1.3, -55, g);
    const roof = add(
      new T.CylinderGeometry(0.01, 3, 1.5, 4, 1),
      flat("#d79a88"),
      14,
      3.35,
      -55,
      g,
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.4);
    box(0.7, 0.7, 0.2, flat("#c4e4f3"), 12.9, 1.6, -54.4, g);
    box(0.7, 0.7, 0.2, flat("#c4e4f3"), 15.1, 1.6, -54.4, g);
  });

  // --- Fence --------------------------------------------------------------
  layer(12.4, 0.6, (g) => {
    const picket = mat("#f4efe2");
    for (let i = 0; i < 20; i++) {
      box(0.36, 1.5, 0.1, picket, i * 0.62, 0.75, -30, g);
      const tip = add(
        new T.CylinderGeometry(0, 0.26, 0.24, 4),
        picket,
        i * 0.62,
        1.62,
        -30,
        g,
      );
      tip.rotation.y = Math.PI / 4;
    }
    box(12.4, 0.12, 0.06, picket, 6.2, 1.1, -29.9, g);
    box(12.4, 0.12, 0.06, picket, 6.2, 0.45, -29.9, g);
  });

  // --- Grass: mown stripes along the front --------------------------------
  box(400, 10, 6, mat("#7fb05a"), 0, GROUND - 5, -3);
  layer(4, 1, (g) => {
    box(2, 0.32, 0.2, mat("#93c266"), 1, GROUND - 0.16, 0.2, g);
    box(2, 0.32, 0.2, mat("#7aaa52"), 3, GROUND - 0.16, 0.2, g);
    // Darker soil under the turf.
    box(4, 8, 0.2, mat("#6b8f45"), 2, GROUND - 4.32, 0.2, g);
    for (const [x, y] of [
      [0.6, -0.9],
      [2.3, -1.4],
      [3.4, -0.75],
      [1.4, -2.6],
      [3, -3.3],
      [0.4, -4.1],
    ])
      add(ball, mat("#5c7d3b"), x, y, 0.4, g).scale.set(0.12, 0.08, 0.05);
  });

  // --- Canopy across the top ----------------------------------------------
  box(400, 40, 4, mat("#3f6f30"), 0, CEILING + 20.9, -8);
  // Rows of leaves, darker further up, for tall (phone) screens.
  const shade = ["#3a6a2c", "#335f27", "#2d5523"];
  layer(6, 1, (g) => {
    for (let i = 0; i < 5; i++) {
      const r = 0.75 + (i % 2) * 0.3;
      add(
        blob,
        mat(LEAF[i % LEAF.length]),
        i * 1.2,
        CEILING + 0.75,
        -2,
        g,
      ).scale.set(r, r * 0.8, 1);
    }
    for (let row = 1; row < 7; row++)
      for (let i = 0; i < 4; i++) {
        const r = 0.95 + ((i + row) % 2) * 0.3;
        add(
          blob,
          mat(shade[(i + row) % shade.length]),
          i * 1.5 + (row % 2) * 0.75,
          CEILING + 0.9 + row * 1.25,
          -4,
          g,
        ).scale.set(r, r * 0.85, 1);
      }
  });

  // --- Branches and shrubs ------------------------------------------------
  // Each gap's branch hangs from the canopy down to the top of the gap; its
  // shrub grows from the grass up to the bottom. Built once each and moved.
  const bark = mat("#7b5532", 0.85);
  const barkDark = mat("#5e3f24", 0.9);
  const pool = [];
  function makeObstacle() {
    const g = new T.Group();
    scene.add(g);
    // Branch: a trunk going up out of view with a leafy end at the gap.
    const top = new T.Group();
    g.add(top);
    const trunk = add(unitCylinder, bark, 0, 15, 0, top);
    trunk.scale.set(0.6, 30, 0.6);
    const rings = [0, 1, 2, 3, 4, 5].map((i) => {
      const r = add(unitCylinder, barkDark, 0, 1.6 + i * 1.7, 0.05, top);
      r.scale.set(0.63, 0.06, 0.63);
      return r;
    });
    const leaves = [
      [-0.45, 0.5, 0.55],
      [0.4, 0.45, 0.55],
      [0, 0.75, 0.6],
      [-0.6, 1.7, 0.42],
      [0.62, 2.9, 0.42],
    ].map(([x, y, r], i) => {
      const m = add(blob, mat(LEAF[i % LEAF.length]), x, y, 0.4, top);
      m.scale.set(r, r * 0.85, r);
      return m;
    });
    // Shrub: a rounded hedge with flowers.
    const bottom = new T.Group();
    g.add(bottom);
    const body = add(unitBox, mat(SHRUB[0]), 0, 0, 0, bottom);
    const crown = [-0.42, 0.42, 0].map((x, i) => {
      const m = add(blob, mat(SHRUB[i % SHRUB.length]), x, 0, 0.1, bottom);
      m.scale.setScalar(0.5 + (i === 2) * 0.12);
      return m;
    });
    const flowers = Array.from({ length: 7 }, (_, i) => {
      const m = add(
        ball,
        mat(FLOWERS[i % FLOWERS.length], 0.5),
        0,
        0,
        0.9,
        bottom,
      );
      m.scale.setScalar(0.11);
      return m;
    });
    return { g, top, bottom, body, crown, flowers, leaves, rings, k: -1 };
  }

  function dress(o, gap) {
    o.k = gap.k;
    const topY = gap.y + gap.gap / 2;
    const bottomY = gap.y - gap.gap / 2;
    o.top.position.y = topY;
    const tilt = ((gap.look % 7) - 3) * 0.012;
    o.top.rotation.z = tilt;
    o.leaves.forEach((m, i) => {
      m.material = mat(LEAF[(gap.look + i) % LEAF.length]);
      m.visible = i < 3 || topY + m.position.y < CEILING;
    });
    o.leaves[3].position.x = gap.look % 2 ? -0.6 : 0.6;
    o.leaves[4].position.x = -o.leaves[3].position.x;
    o.rings.forEach((r) => (r.visible = topY + r.position.y < CEILING + 1));
    // The hedge's box stops below its rounded crown, which meets the gap.
    const hedgeTop = bottomY - 0.42;
    o.body.scale.set(OBSTACLE_HALF * 2 - 0.1, hedgeTop - GROUND, 1.4);
    o.body.position.y = (hedgeTop + GROUND) / 2;
    o.body.material = mat(SHRUB[gap.look % SHRUB.length]);
    o.crown.forEach((m, i) => {
      m.position.y = hedgeTop - 0.02 + (i === 2) * 0.03;
      m.material = mat(SHRUB[(gap.look + i + 1) % SHRUB.length]);
    });
    o.flowers.forEach((m, i) => {
      const along = ((gap.look * (i + 3) * 37) % 100) / 100;
      const across = ((gap.look * (i + 5) * 53) % 100) / 100;
      m.position.set(
        (across - 0.5) * 1.3,
        GROUND + 0.3 + along * Math.max(0.1, hedgeTop - 0.6),
        0.72,
      );
      m.material = mat(FLOWERS[(gap.look + i) % FLOWERS.length], 0.5);
      m.visible = m.position.y < hedgeTop;
    });
  }

  // --- Helicopter ---------------------------------------------------------
  const heli = new T.Group();
  scene.add(heli);
  const craft = new T.Group();
  heli.add(craft);
  const paint = mat(pilot.color, 0.45);
  const trim = mat("#2f3640", 0.5);
  const cabin = add(ball, paint, 0.02, -0.1, 0, craft);
  cabin.scale.set(0.58, 0.28, 0.4);
  const glass = new T.MeshStandardMaterial({
    color: "#bfe8ff",
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const bubble = add(ball, glass, 0.16, 0.16, 0, craft);
  bubble.scale.set(0.36, 0.3, 0.36);
  bubble.renderOrder = 1;
  const boom = add(unitCylinder, paint, -0.72, 0.06, 0, craft);
  boom.rotation.z = Math.PI / 2;
  boom.scale.set(0.07, 0.95, 0.07);
  const fin = box(0.18, 0.36, 0.05, paint, -1.16, 0.22, 0, craft);
  fin.rotation.z = -0.35;
  const tailRotor = new T.Group();
  tailRotor.position.set(-1.18, 0.12, 0.08);
  craft.add(tailRotor);
  box(0.05, 0.42, 0.02, trim, 0, 0, 0, tailRotor);
  add(unitCylinder, trim, 0.08, 0.42, 0, craft).scale.set(0.035, 0.12, 0.035);
  const rotor = new T.Group();
  rotor.position.set(0.08, 0.5, 0);
  craft.add(rotor);
  box(1.8, 0.03, 0.1, trim, 0, 0, 0, rotor);
  box(0.1, 0.03, 1.8, trim, 0, 0, 0, rotor);
  const blur = add(
    new T.CylinderGeometry(0.92, 0.92, 0.01, 32),
    new T.MeshBasicMaterial({
      color: "#2f3640",
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
    0.08,
    0.5,
    0,
    craft,
  );
  for (const z of [-0.2, 0.2]) {
    const skid = add(unitCylinder, trim, 0.1, -0.42, z, craft);
    skid.rotation.z = Math.PI / 2;
    skid.scale.set(0.028, 0.95, 0.028);
    for (const x of [-0.12, 0.32])
      box(0.03, 0.16, 0.03, trim, x, -0.34, z, craft);
  }
  // The player's critter in the cockpit.
  const critter = createAvatar("attacker", pilot.avatar, false);
  critter.scale.setScalar(0.28);
  critter.position.set(0.14, -0.14, 0);
  critter.rotation.y = Math.PI / 2;
  craft.add(critter);

  // Leaves knocked loose in a crash.
  const bits = [];
  const bitGeometry = new T.PlaneGeometry(0.22, 0.14);
  function burst(x, y, colors) {
    for (let i = 0; i < 16; i++) {
      const m = add(
        bitGeometry,
        new T.MeshBasicMaterial({
          color: colors[i % colors.length],
          side: T.DoubleSide,
          transparent: true,
        }),
        x,
        y,
        1,
      );
      const a = (i / 16) * Math.PI * 2;
      bits.push({
        m,
        vx: Math.cos(a) * (1.5 + Math.random() * 2) - 1,
        vy: Math.sin(a) * (1.5 + Math.random() * 2) + 1.5,
        spin: (Math.random() - 0.5) * 14,
        age: 0,
      });
    }
  }

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  const point = new T.Vector3();
  let view = { left: -6, right: 14 };
  let clock = 0;
  let spin = 0;

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y)
      renderer.setSize(width, height, false);
    const aspect = width / height;
    const tall = Math.max(VIEW_HEIGHT, MIN_VIEW_WIDTH / aspect);
    const wide = tall * aspect;
    const left = HELI_X - wide * HELI_SCREEN;
    const bottom = VIEW_BOTTOM - (tall - VIEW_HEIGHT) * EXTRA_BELOW;
    Object.assign(camera, {
      left,
      right: left + wide,
      bottom,
      top: bottom + tall,
    });
    camera.updateProjectionMatrix();
    view = { left, right: left + wide };
    return true;
  }

  return {
    // state: { course, distance, y, vy, mode } where mode is "hover",
    // "fly", "crash" or "still" (paused); rotor slows after a crash.
    draw(dt, state) {
      if (!fit()) return;
      clock += dt;
      const { course, distance } = state;

      for (const l of layers) {
        const offset = -((distance * l.factor) % l.width);
        l.copies.forEach((g, i) => {
          g.position.x = view.left - 2 + offset + i * l.width;
        });
        // Wide screens need more copies of short strips.
        while (
          l.copies.length * l.width <
          view.right - view.left + l.width * 2
        ) {
          const g = l.copies[0].clone();
          scene.add(g);
          l.copies.push(g);
        }
      }

      // Gaps on screen (and a little either side).
      const s = course.level;
      const reach = OBSTACLE_HALF + 1;
      const firstK = Math.max(
        0,
        Math.floor((distance + view.left - reach - course.at(0).x) / s.spacing),
      );
      const lastK = Math.max(
        firstK - 1,
        Math.floor(
          (distance + view.right + reach - course.at(0).x) / s.spacing,
        ),
      );
      const needed = Math.max(0, lastK - firstK + 1);
      while (pool.length < needed) pool.push(makeObstacle());
      const shown = new Set();
      for (let k = firstK; k <= lastK; k++) {
        const gap = course.at(k);
        let o = pool.find((p) => p.k === k);
        if (!o)
          o = pool.find((p) => !shown.has(p) && (p.k < firstK || p.k > lastK));
        if (o.k !== k) dress(o, gap);
        shown.add(o);
        o.g.visible = true;
        o.g.position.x = gap.x - distance;
      }
      for (const o of pool) if (!shown.has(o)) o.g.visible = false;

      // The helicopter: bobbing while it waits, nose up as it climbs and
      // down as it falls, tumbling after a crash.
      const hover = state.mode === "hover";
      const bob = hover ? Math.sin(clock * 3.2) * 0.18 : 0;
      heli.position.set(HELI_X, state.y + bob, 0.5);
      let tilt = hover
        ? Math.sin(clock * 3.2 + 1) * 0.06
        : T.MathUtils.clamp(state.vy * 0.055, -0.55, 0.32);
      if (state.mode === "crash") {
        craft.userData.tumble = (craft.userData.tumble || 0) + dt * 5;
        tilt = -0.4 - craft.userData.tumble;
      } else craft.userData.tumble = 0;
      craft.rotation.z += (tilt - craft.rotation.z) * Math.min(1, dt * 12);
      if (state.mode === "crash") craft.rotation.z = tilt;
      const target =
        state.mode === "crash" ? 0 : state.mode === "still" ? 0 : 38;
      spin += (target - spin) * Math.min(1, dt * (target ? 6 : 1.4));
      rotor.rotation.y += spin * dt;
      tailRotor.rotation.z += spin * 1.4 * dt;
      blur.material.opacity = Math.min(0.14, spin / 260);
      animateAvatar(critter, { moveSpeed: 0 }, dt);

      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        b.vy -= 7 * dt;
        b.vx *= 1 - dt * 0.8;
        b.m.position.x += b.vx * dt;
        b.m.position.y += b.vy * dt;
        b.m.rotation.z += b.spin * dt;
        b.m.rotation.x += b.spin * 0.5 * dt;
        b.m.material.opacity = Math.max(0, 1 - b.age / 1.4);
        if (b.age > 1.4) {
          scene.remove(b.m);
          b.m.material.dispose();
          bits.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
    },
    // Leaves (or grass) fly where the helicopter hit.
    crash(kind, y) {
      const colors =
        kind === "ground"
          ? ["#7aaa52", "#93c266", "#6b8f45"]
          : kind === "branch"
            ? [...LEAF, "#7b5532"]
            : [...SHRUB, ...FLOWERS.slice(0, 2)];
      burst(HELI_X + 0.4, y, colors);
    },
    toScreen(x, y) {
      point.set(x, y, 0).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    dispose() {
      releaseAvatar(critter);
      for (const b of bits) b.m.material.dispose();
      scene.traverse((node) => {
        if (node.geometry && node.geometry !== unitBox)
          node.geometry.dispose?.();
      });
      for (const m of mats.values()) m.dispose();
      glass.dispose();
      blur.material.dispose();
      unitBox.dispose();
      renderer.dispose();
    },
  };
}
