import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { PHYSICS } from "../shared/cometDash.js";

// Floating islands in a dusk sky, seen side on. The runner goes right
// (+x), y is up, and the islands sit at z = 0 with the camera out at +z.
// Distant islands, clouds and stars sit further back, so the perspective
// camera gives them parallax for free.

const GRASS = ["#7fe0b0", "#ffa8d2", "#b9a2ff", "#ffd27a"];
const ROCK = ["#5d4f8f", "#7a4f86", "#4f5c92", "#6f5a7d"];
const TRAIL = [
  "#ff5a7a",
  "#ffa04a",
  "#ffe45a",
  "#6ee07a",
  "#5ab8ff",
  "#a77aff",
];
const TRAIL_LEN = 36;

function gradientTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#140f3d");
  grad.addColorStop(0.45, "#4b2a83");
  grad.addColorStop(0.75, "#c0549a");
  grad.addColorStop(1, "#ffab7a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function haloTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#ffffffff");
  grad.addColorStop(0.3, "#ffffff88");
  grad.addColorStop(1, "#ffffff00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export function createCometDashScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new T.Scene();
  const sky = gradientTexture();
  scene.background = sky;
  scene.fog = new T.Fog("#8a4a9a", 30, 120);
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 400);

  scene.add(new T.HemisphereLight("#ffe8f4", "#3a2a6a", 2.2));
  const sun = new T.DirectionalLight("#ffd7b0", 2.2);
  sun.position.set(-4, 8, 10);
  scene.add(sun, sun.target);

  const mats = new Map();
  const mat = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!mats.has(key))
      mats.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.75, ...extra }),
      );
    return mats.get(key);
  };
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitCone = new T.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  unitCone.rotateY(Math.PI / 4);
  unitCone.rotateX(Math.PI); // point down
  const gem = new T.OctahedronGeometry(0.5, 0);
  const halo = haloTexture();
  const halos = new Map();
  const haloMat = (color, opacity = 0.7, shared = true) => {
    const key = color + opacity;
    if (shared && halos.has(key)) return halos.get(key);
    const m = new T.SpriteMaterial({
      map: halo,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    if (shared) halos.set(key, m);
    return m;
  };

  // --- Far away: stars, moon, distant islands, clouds -----------------
  const far = new T.Group();
  scene.add(far);
  {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 420;
      pos[i * 3 + 1] = 10 + Math.random() * 120;
      pos[i * 3 + 2] = -150;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    far.add(
      new T.Points(
        g,
        new T.PointsMaterial({ color: "#fff6d8", size: 0.7, fog: false }),
      ),
    );
    const moon = new T.Mesh(
      new T.CircleGeometry(9, 40),
      new T.MeshBasicMaterial({ color: "#fff1c4", fog: false }),
    );
    moon.position.set(40, 45, -148);
    const glow = new T.Sprite(haloMat("#ffd9a0", 0.5));
    glow.scale.set(60, 60, 1);
    glow.position.copy(moon.position);
    far.add(moon, glow);
  }
  const scenery = [];
  for (let i = 0; i < 16; i++) {
    const g = new T.Group();
    const s = 2 + Math.random() * 5;
    const top = new T.Mesh(unitBox, mat(GRASS[i % 4]));
    top.scale.set(s * 2.4, s * 0.25, s * 1.4);
    const body = new T.Mesh(unitCone, mat(ROCK[i % 4]));
    body.scale.set(s * 2.4, s * 2.2, s * 1.4);
    body.position.y = -s * 1.2;
    g.add(top, body);
    g.userData.depth = -35 - Math.random() * 45;
    g.position.set(i * 16 - 60, -6 + Math.random() * 22, g.userData.depth);
    scene.add(g);
    scenery.push(g);
  }
  const cloudMat = new T.MeshStandardMaterial({
    color: "#ffd6ea",
    roughness: 1,
    transparent: true,
    opacity: 0.85,
  });
  const puff = new T.SphereGeometry(1, 12, 8);
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const g = new T.Group();
    for (let j = 0; j < 4; j++) {
      const m = new T.Mesh(puff, cloudMat);
      const r = 1.5 + Math.random() * 2;
      m.scale.set(r * 1.6, r, r);
      m.position.set(j * 2.4 - 3.6, Math.random(), Math.random() * 2);
      g.add(m);
    }
    g.position.set(
      i * 22 - 60,
      -16 + Math.random() * 8,
      -12 - Math.random() * 18,
    );
    scene.add(g);
    clouds.push(g);
  }

  // --- The course ----------------------------------------------------
  const islands = new Map();
  const crystals = new Map();
  const sparkles = new Map();

  function makeIsland(p) {
    const g = new T.Group();
    const depthZ = 3.2;
    const top = new T.Mesh(unitBox, mat(GRASS[p.kind]));
    top.scale.set(p.w, 0.4, depthZ + 0.2);
    top.position.set(p.w / 2, -0.2, 0);
    const body = new T.Mesh(unitBox, mat(ROCK[p.kind]));
    body.scale.set(p.w - 0.1, p.depth - 0.4, depthZ);
    body.position.set(p.w / 2, -0.4 - (p.depth - 0.4) / 2, 0);
    const taper = new T.Mesh(unitCone, mat(ROCK[(p.kind + 1) % 4]));
    const tall = 2 + Math.min(6, p.w * 0.25);
    taper.scale.set(p.w * 0.95, tall, depthZ * 0.95);
    taper.position.set(p.w / 2, -p.depth - tall / 2, 0);
    g.add(top, body, taper);
    // A few flowers along the front edge.
    for (let x = 1.2; x < p.w - 1; x += 2.2 + ((x * 7) % 1.6)) {
      const f = new T.Mesh(
        gem,
        mat(GRASS[(p.kind + 2) % 4], {
          emissive: GRASS[(p.kind + 2) % 4],
          emissiveIntensity: 0.4,
        }),
      );
      f.scale.setScalar(0.28);
      f.position.set(x, 0.12, 1.3 + ((x * 3) % 0.4));
      g.add(f);
    }
    g.position.set(p.x, p.y, 0);
    scene.add(g);
    return g;
  }

  const crystalMat = new T.MeshStandardMaterial({
    color: "#8ff4ff",
    emissive: "#3fc6ff",
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.9,
  });
  function makeCrystal(c) {
    const g = new T.Group();
    const H = PHYSICS.crystalHeight;
    const main = new T.Mesh(gem, crystalMat);
    main.scale.set(1.1, H, 1.1);
    main.position.y = H / 2;
    const side1 = new T.Mesh(gem, crystalMat);
    side1.scale.set(0.6, H * 0.55, 0.6);
    side1.position.set(-0.45, H * 0.27, 0.4);
    side1.rotation.z = 0.35;
    const side2 = side1.clone();
    side2.position.set(0.4, H * 0.24, -0.4);
    side2.rotation.z = -0.4;
    const glow = new T.Sprite(haloMat("#6fe0ff", 0.55));
    glow.scale.set(4, 5, 1);
    glow.position.y = H / 2;
    g.add(main, side1, side2, glow);
    g.position.set(c.x, c.y, 0);
    scene.add(g);
    return g;
  }

  const sparkleMat = new T.MeshStandardMaterial({
    color: "#fff2a0",
    emissive: "#ffcf3a",
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });
  function makeSparkle(s) {
    const g = new T.Group();
    const m = new T.Mesh(gem, sparkleMat);
    m.scale.set(0.5, 0.7, 0.5);
    const glow = new T.Sprite(haloMat("#ffe27a", 0.8));
    glow.scale.set(1.6, 1.6, 1);
    g.add(m, glow);
    g.position.set(s.x, s.y, 0);
    scene.add(g);
    return g;
  }

  function removeAll(map) {
    for (const g of map.values()) scene.remove(g);
    map.clear();
  }

  function sync(course) {
    const keep = new Set(course.platforms);
    for (const [p, g] of islands)
      if (!keep.has(p)) {
        scene.remove(g);
        islands.delete(p);
      }
    for (const p of course.platforms)
      if (!islands.has(p) && p.x < camera.position.x + 90)
        islands.set(p, makeIsland(p));
    const keepC = new Set(course.crystals);
    for (const [c, g] of crystals)
      if (!keepC.has(c) || !c.alive) {
        scene.remove(g);
        crystals.delete(c);
      }
    for (const c of course.crystals)
      if (c.alive && !crystals.has(c) && c.x < camera.position.x + 90)
        crystals.set(c, makeCrystal(c));
    const keepS = new Set(course.sparkles);
    for (const [s, g] of sparkles)
      if (!keepS.has(s) || s.taken) {
        scene.remove(g);
        sparkles.delete(s);
      }
    for (const s of course.sparkles)
      if (!s.taken && !sparkles.has(s) && s.x < camera.position.x + 90)
        sparkles.set(s, makeSparkle(s));
  }

  // --- Particles -------------------------------------------------------
  const shardGeo = new T.TetrahedronGeometry(0.22);
  const particles = [];
  function burst(x, y, colors, count, power = 8, size = 1) {
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const m = new T.Mesh(
        shardGeo,
        mat(color, { emissive: color, emissiveIntensity: 0.8 }),
      );
      m.position.set(x, y, (Math.random() - 0.5) * 1.5);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.4 + Math.random() * 0.6);
      m.userData = {
        vx: Math.cos(a) * v + 4,
        vy: Math.sin(a) * v + 3,
        vz: (Math.random() - 0.5) * v,
        spin: (Math.random() - 0.5) * 12,
        life: 0.8 + Math.random() * 0.6,
      };
      scene.add(m);
      particles.push(m);
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const m = particles[i];
      const u = m.userData;
      u.life -= dt;
      if (u.life <= 0) {
        scene.remove(m);
        particles.splice(i, 1);
        continue;
      }
      u.vy -= 18 * dt;
      m.position.x += u.vx * dt;
      m.position.y += u.vy * dt;
      m.position.z += u.vz * dt;
      m.rotation.x += u.spin * dt;
      m.rotation.y += u.spin * dt;
      m.scale.multiplyScalar(1 - dt * 0.8);
    }
  }

  // --- The runner and its comet tail -----------------------------------
  const runner = createAvatar("attacker", avatar, false);
  runner.rotation.y = -Math.PI / 2; // rigs face -Z; run toward +X
  runner.scale.setScalar(1.35);
  scene.add(runner);
  const head = new T.Sprite(haloMat("#fff0b0", 0, false));
  head.scale.set(3.2, 3.2, 1);
  scene.add(head);

  const trailPos = new Float32Array(TRAIL_LEN * TRAIL.length * 2 * 3);
  const trailCol = new Float32Array(trailPos.length);
  const trailIdx = [];
  for (let b = 0; b < TRAIL.length; b++)
    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const a = (b * TRAIL_LEN + i) * 2;
      trailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  const trailGeo = new T.BufferGeometry();
  trailGeo.setAttribute("position", new T.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new T.BufferAttribute(trailCol, 3));
  trailGeo.setIndex(trailIdx);
  const trailMat = new T.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    side: T.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const trail = new T.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  const history = [];
  const tmpColor = new T.Color();

  function updateTrail(x, y, glow) {
    history.unshift([x, y]);
    if (history.length > TRAIL_LEN) history.length = TRAIL_LEN;
    while (history.length < TRAIL_LEN) history.push([x, y]);
    const band = 0.17;
    for (let b = 0; b < TRAIL.length; b++) {
      tmpColor.set(TRAIL[b]);
      for (let i = 0; i < TRAIL_LEN; i++) {
        const [hx, hy] = history[i];
        const fade = 1 - i / TRAIL_LEN;
        const offset = (b - (TRAIL.length - 1) / 2) * band * (0.4 + fade);
        const cy = hy + 0.6 + offset;
        const w = band * 0.5 * (0.4 + fade);
        const a = (b * TRAIL_LEN + i) * 2 * 3;
        trailPos.set([hx, cy + w, -0.2, hx, cy - w, -0.2], a);
        const k = fade;
        trailCol.set(
          [
            tmpColor.r * k,
            tmpColor.g * k,
            tmpColor.b * k,
            tmpColor.r * k,
            tmpColor.g * k,
            tmpColor.b * k,
          ],
          a,
        );
      }
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailMat.opacity += ((glow ? 0.95 : 0) - trailMat.opacity) * 0.25;
  }

  // --- Camera ---------------------------------------------------------
  let camY = 2;
  let shake = 0;
  let width = 0,
    height = 0,
    camDist = 18,
    lookAhead = 7;
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep about 34 m of course in view: widen the lens, then (on tall
    // phone screens) step back, and keep the runner in the left part.
    const halfW = 17;
    const tanFor = (dist) => halfW / dist / camera.aspect;
    camera.fov = Math.max(
      46,
      Math.min(70, (2 * Math.atan(tanFor(18)) * 180) / Math.PI),
    );
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    camDist = Math.max(18, Math.min(30, halfW / tan / camera.aspect));
    lookAhead = Math.min(7, tan * camDist * camera.aspect * 0.5);
    camera.updateProjectionMatrix();
  }

  let time = 0;
  function draw(dt, view) {
    resize();
    time += dt;
    const { runner: r, course, hidden, blink, dashing } = view;
    if (course) sync(course);

    const targetY = r.lastTop * 0.55 + r.y * 0.45 + 2;
    camY += (targetY - camY) * (1 - Math.exp(-dt * 3));
    shake = Math.max(0, shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * shake,
      sy = (Math.random() - 0.5) * shake;
    camera.position.set(r.x + lookAhead + sx, camY + 1.5 + sy, camDist);
    camera.lookAt(r.x + lookAhead, camY - 0.2, 0);
    sun.position.set(r.x - 4, 12, 10);
    sun.target.position.set(r.x, 0, 0);
    far.position.x = r.x * 0.97;

    for (const g of scenery) {
      if (g.position.x < r.x - 110) {
        g.position.x += 256;
        g.position.y = -6 + Math.random() * 22;
      }
    }
    for (const g of clouds) {
      g.position.x -= dt * 0.6;
      if (g.position.x < r.x - 70) g.position.x += 264;
    }

    for (const [c, g] of crystals) {
      g.children[0].rotation.y = time * 0.8 + c.x;
      g.children[3].material.opacity = 0.45 + Math.sin(time * 3 + c.x) * 0.15;
    }
    for (const [s, g] of sparkles) {
      g.children[0].rotation.y = time * 3 + s.x;
      g.position.y = s.y + Math.sin(time * 4 + s.x) * 0.12;
    }

    runner.visible = !hidden && !(blink && Math.floor(time * 12) % 2);
    runner.position.set(r.x, r.y, 0);
    const lean = dashing ? -0.35 : r.grounded ? 0 : r.vy > 0 ? 0.15 : -0.1;
    runner.rotation.z += (lean - runner.rotation.z) * (1 - Math.exp(-dt * 14));
    animateAvatar(
      runner,
      { moveSpeed: r.grounded ? 6 : 0, grounded: r.grounded },
      hidden ? 0 : dt * (r.grounded ? Math.max(1, r.speed / 8) : 1),
    );
    head.position.set(r.x + 0.2, r.y + 0.6, 0.3);
    head.material.opacity +=
      ((dashing && !hidden ? 0.9 : 0) - head.material.opacity) * 0.3;
    updateTrail(r.x - 0.3, r.y, dashing && !hidden);

    updateParticles(dt);
    renderer.render(scene, camera);
  }

  const v = new T.Vector3();
  return {
    draw,
    reset() {
      removeAll(islands);
      removeAll(crystals);
      removeAll(sparkles);
      history.length = 0;
      camY = 2;
    },
    snapCamera(y) {
      camY = y + 2;
    },
    smash(c) {
      burst(c.x, c.y + 1.3, ["#8ff4ff", "#c7a2ff", "#ffffff"], 26, 10);
      shake = 0.35;
    },
    knock(c) {
      burst(c.x, c.y + 1, ["#8ff4ff", "#ffffff"], 10, 5);
    },
    sparkle(s) {
      burst(s.x, s.y, ["#ffe27a", "#ffffff"], 5, 3, 0.6);
    },
    poof(x, y) {
      burst(x, y + 0.6, TRAIL, 30, 9);
      shake = 0.6;
    },
    land(x, y) {
      burst(x, y + 0.05, ["#ffffff", "#ffd6ea"], 5, 2.5, 0.5);
    },
    screen(x, y) {
      v.set(x, y, 0).project(camera);
      return {
        x: ((v.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - v.y) / 2) * canvas.clientHeight,
      };
    },
    dispose() {
      releaseAvatar(runner);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose?.();
      });
      sky.dispose();
      halo.dispose();
      renderer.dispose();
    },
  };
}
