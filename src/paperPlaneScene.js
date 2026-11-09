import * as T from "three";
import { BASKET_HEIGHT, LAUNCH, RIM } from "../shared/paperPlane.js";

// You stand on the back porch looking out over the lawn. A wicker laundry
// basket sits on the grass; a windsock, a clothesline and drifting leaves
// show the breeze. Thrown planes stay where they came down.
const EYE = new T.Vector3(0, 1.75, 1.6);
const LOOK = new T.Vector3(0, 0.7, -5);
// Keep this much of the lawn on screen sideways at the basket's depth.
const HALF_WIDTH = 2.7;
const AT_DEPTH = 8;
const LEAVES = 26;

export function createPaperPlaneScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3f5");
  scene.fog = new T.Fog("#bfe3f5", 24, 60);
  const camera = new T.PerspectiveCamera(50, 1, 0.05, 120);
  camera.position.copy(EYE);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff6dc", "#6c8f55", 2));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.position.set(5, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -8,
    right: 8,
    top: 6,
    bottom: -14,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.8, extra = {}) =>
    new T.MeshStandardMaterial({ color, roughness, ...extra });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  const blob = new T.IcosahedronGeometry(1, 1);

  // --- Lawn, fence and trees -------------------------------------------------
  box(80, 0.2, 80, mat("#86b25a"), 0, -0.1, -20).castShadow = false;
  const stripe = mat("#93bd64");
  for (let i = 0; i < 9; i++)
    box(1.3, 0.01, 40, stripe, (i - 4) * 2.6, 0.005, -18).castShadow = false;
  const fence = [mat("#d9b98a"), mat("#cfae7e"), mat("#e2c495")];
  for (let i = 0; i < 70; i++)
    box(0.36, 1.9, 0.08, fence[i % 3], -17.5 + i * 0.5, 0.95, -14);
  box(35, 0.14, 0.1, mat("#b8956a"), 0, 1.4, -14.08);
  const leafy = [mat("#5f8f45"), mat("#6e9d4c"), mat("#557f3e")];
  const bark = mat("#7a5532");
  for (const [x, z, s] of [
    [-7, -12, 1.3],
    [6.5, -11, 1.5],
    [-12, -6, 1.2],
    [11, -5, 1.1],
  ]) {
    mesh(new T.CylinderGeometry(0.2, 0.3, 3 * s, 8), bark, x, 1.5 * s, z);
    mesh(blob, leafy[0], x, 3.6 * s, z).scale.setScalar(1.8 * s);
    mesh(blob, leafy[1], x + 0.8, 3.2 * s, z + 0.4).scale.setScalar(1.2 * s);
  }
  for (let i = 0; i < 12; i++) {
    const x = -16 + i * 2.9;
    mesh(blob, leafy[i % 3], x, 0.6, -13.3).scale.set(1.3, 0.9, 0.7);
  }

  // --- The porch you throw from -------------------------------------------------
  const deck = [mat("#a8774a"), mat("#9b6c42")];
  for (let i = 0; i < 8; i++)
    box(6, 0.12, 0.28, deck[i % 2], 0, 0.35, 2.6 - i * 0.3);
  box(6, 0.35, 0.1, mat("#7d5534"), 0, 0.17, 0.48);
  const rail = mat("#f3ede0", 0.6);
  for (const x of [-2.9, 2.9]) {
    box(0.12, 1.1, 0.12, rail, x, 0.9, 0.55);
    box(0.08, 0.08, 2.4, rail, x, 1.4, 1.7);
  }

  // --- Clothesline: two T posts and a few shirts that sway with the breeze ---
  const pole = mat("#8c9aa6", 0.5, { metalness: 0.3 });
  const lineZ = -10.5;
  for (const x of [-5, 5]) {
    box(0.08, 2.2, 0.08, pole, x, 1.1, lineZ);
    box(0.08, 0.08, 0.8, pole, x, 2.15, lineZ);
  }
  const line = new T.Mesh(
    new T.CylinderGeometry(0.008, 0.008, 10, 4),
    mat("#f5f5f5"),
  );
  line.rotation.z = Math.PI / 2;
  line.position.set(0, 2.1, lineZ);
  scene.add(line);
  const clothes = [];
  for (const [x, color, w, h] of [
    [-3.4, "#f08a8a", 0.7, 0.75],
    [-1.8, "#8ec6f0", 0.9, 0.6],
    [0.3, "#ffe08a", 0.6, 0.8],
    [2.2, "#b6e39a", 0.8, 0.7],
    [3.7, "#d7b8f2", 0.5, 0.5],
  ]) {
    const hang = new T.Group();
    hang.position.set(x, 2.1, lineZ);
    box(w, h, 0.03, mat(color, 0.9), 0, -h / 2, 0, hang);
    for (const s of [-1, 1])
      box(0.03, 0.08, 0.06, mat("#c8a46e"), (s * w) / 3, 0, 0, hang);
    scene.add(hang);
    clothes.push(hang);
  }

  // --- Windsock on a pole, to the side of the lawn -----------------------------
  const sockPole = new T.Group();
  sockPole.position.set(-3.4, 0, -6.5);
  box(0.06, 2.6, 0.06, mat("#f3ede0", 0.6), 0, 1.3, 0, sockPole);
  const sock = new T.Group();
  sock.position.y = 2.5;
  sockPole.add(sock);
  const sockSegs = [];
  for (let i = 0; i < 5; i++) {
    const r0 = 0.16 - i * 0.022;
    const seg = mesh(
      new T.CylinderGeometry(r0, r0 - 0.022, 0.24, 14, 1, true),
      mat(i % 2 ? "#ffffff" : "#ff6b3d", 0.7, { side: T.DoubleSide }),
      0,
      0,
      0,
      sock,
    );
    seg.rotation.z = Math.PI / 2;
    sockSegs.push(seg);
  }
  scene.add(sockPole);

  // --- Laundry basket ---------------------------------------------------------
  const basket = new T.Group();
  const wicker = mat("#c99a5b", 0.95, { side: T.DoubleSide });
  const wickerDark = mat("#a77a40", 0.95);
  let wall, rims;
  function buildBasket(radius) {
    for (const child of [...basket.children]) {
      basket.remove(child);
      child.geometry.dispose();
    }
    wall = mesh(
      new T.CylinderGeometry(
        radius + RIM / 2,
        radius * 0.86,
        BASKET_HEIGHT,
        28,
        1,
        true,
      ),
      wicker,
      0,
      BASKET_HEIGHT / 2,
      0,
      basket,
    );
    mesh(
      new T.CircleGeometry(radius * 0.86, 24),
      mat("#6b4a26"),
      0,
      0.02,
      0,
      basket,
    ).rotation.x = -Math.PI / 2;
    rims = [];
    for (const [y, r] of [
      [BASKET_HEIGHT, radius + RIM / 2],
      [BASKET_HEIGHT * 0.5, radius * 0.93 + RIM / 2],
      [0.04, radius * 0.86],
    ]) {
      const ring = mesh(
        new T.TorusGeometry(r, 0.03, 8, 32),
        wickerDark,
        0,
        y,
        0,
        basket,
      );
      ring.rotation.x = Math.PI / 2;
      rims.push(ring);
    }
    // Two handle holes' worth of darker band on the sides.
    for (const s of [-1, 1]) {
      const handle = mesh(
        new T.TorusGeometry(0.09, 0.025, 6, 16, Math.PI),
        wickerDark,
        s * (radius + RIM / 2),
        BASKET_HEIGHT - 0.04,
        0,
        basket,
      );
      handle.rotation.y = Math.PI / 2;
    }
  }
  scene.add(basket);
  let basketWobble = 0;

  // --- Paper planes -------------------------------------------------------------
  // A dart folded from a sheet: two wings meeting at a keel. The nose points
  // along +z so lookAt() aims it down its flight.
  const planeGeo = new T.BufferGeometry();
  const N = [0, 0, 0.24]; // nose
  const LW = [-0.15, 0.03, -0.12];
  const RW = [0.15, 0.03, -0.12];
  const TOP = [0, 0, -0.12];
  const KEEL = [0, -0.06, -0.12];
  // prettier-ignore
  planeGeo.setAttribute("position", new T.Float32BufferAttribute([
    ...N, ...TOP, ...LW,
    ...N, ...RW, ...TOP,
    ...N, ...KEEL, ...TOP,
    ...N, ...TOP, ...KEEL,
  ], 3));
  planeGeo.computeVertexNormals();
  const paper = mat("#fbfaf4", 0.9, { side: T.DoubleSide, flatShading: true });
  const paperShade = mat("#e7ecf5", 0.9, {
    side: T.DoubleSide,
    flatShading: true,
  });
  const makePlane = (shade) => {
    const m = new T.Mesh(planeGeo, shade ? paperShade : paper);
    m.castShadow = true;
    m.scale.setScalar(1.25);
    scene.add(m);
    return m;
  };
  const flying = makePlane(false);
  const resting = [];

  // Aim guide: dots from the hand along the aim (or, on easy, the real path).
  const dotGeo = new T.SphereGeometry(0.025, 8, 6);
  const dotMat = new T.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.85,
  });
  const dots = Array.from({ length: 24 }, () => {
    const d = new T.Mesh(dotGeo, dotMat);
    d.visible = false;
    scene.add(d);
    return d;
  });

  // Leaves blowing across the lawn with the breeze.
  const leafGeo = new T.PlaneGeometry(0.09, 0.06);
  const leafMats = ["#e9893b", "#d9572c", "#f2c14e"].map(
    (c) =>
      new T.MeshStandardMaterial({
        color: c,
        side: T.DoubleSide,
        roughness: 0.9,
      }),
  );
  const leaves = Array.from({ length: LEAVES }, (_, i) => {
    const m = new T.Mesh(leafGeo, leafMats[i % 3]);
    m.position.set(
      (Math.random() - 0.5) * 16,
      0.3 + Math.random() * 2.5,
      -1 - Math.random() * 11,
    );
    m.userData.spin = 2 + Math.random() * 4;
    m.userData.phase = Math.random() * 6;
    scene.add(m);
    return m;
  });

  let wind = 0;
  let shownWind = 0;
  let time = 0;
  const v = new T.Vector3();
  const look = new T.Vector3();

  function fit() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()))
      renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Wide enough sideways to always see the basket, tall enough for the sky.
    const needH = 2 * Math.atan(HALF_WIDTH / AT_DEPTH);
    const vfov = 2 * Math.atan(Math.tan(needH / 2) / camera.aspect);
    camera.fov = Math.max(48, (vfov * 180) / Math.PI);
    // On tall screens look a little lower, so the lawn fills more than sky.
    const tall = Math.max(0, Math.min(1, 1 - camera.aspect));
    look.set(LOOK.x, LOOK.y - tall * 2.2, LOOK.z);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function pose(m, p) {
    m.position.set(p.x, p.y, p.z);
    v.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
    m.lookAt(v);
    m.rotateZ(p.bank ?? 0);
  }

  const project = (x, y, z) => {
    v.set(x, y, z).project(camera);
    return {
      x: ((v.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - v.y) / 2) * canvas.clientHeight,
    };
  };

  return {
    setSetup(setup) {
      if (basket.userData.radius !== setup.basket.radius) {
        buildBasket(setup.basket.radius);
        basket.userData.radius = setup.basket.radius;
      }
      basket.position.set(setup.basket.x, 0, setup.basket.z);
      wind = setup.wind;
      // Planes from the last basket spot would float; tidy them away.
      for (const m of resting.splice(0)) scene.remove(m);
    },
    bump() {
      basketWobble = 1;
    },
    // Leave a finished plane where it came down.
    rest(p, inBasket) {
      const m = makePlane(true);
      if (inBasket) {
        m.position.set(
          basket.position.x + (p.x - basket.position.x) * 0.5,
          BASKET_HEIGHT * 0.55,
          basket.position.z + (p.z - basket.position.z) * 0.5,
        );
        m.rotation.set(-1.1, Math.random() * 6, 0);
      } else {
        m.position.set(p.x, 0.05, p.z);
        m.rotation.set(0, Math.atan2(p.vx, p.vz), 0.5);
      }
      resting.push(m);
      if (resting.length > 12) scene.remove(resting.shift());
    },
    clear() {
      for (const m of resting.splice(0)) scene.remove(m);
    },
    // Where the basket's rim is on screen, for the score pop.
    basketTop() {
      return project(
        basket.position.x,
        BASKET_HEIGHT + 0.25,
        basket.position.z,
      );
    },
    draw(dt, { plane, held, guide }) {
      fit();
      time += dt;
      shownWind += (wind - shownWind) * Math.min(1, dt * 2);
      const gust =
        shownWind + Math.sin(time * 1.7) * 0.15 * Math.sign(shownWind);
      const strength = Math.min(1, Math.abs(gust) / 3);

      // Windsock: swings toward downwind and lifts as the breeze picks up.
      sock.rotation.y = gust >= 0 ? 0 : Math.PI;
      sock.rotation.z = -(1 - strength) * 1.3;
      sockSegs.forEach((seg, i) => {
        seg.position.x = 0.12 + i * 0.22;
        seg.position.y = Math.sin(time * 6 + i) * 0.015 * strength;
      });
      for (const [i, c] of clothes.entries())
        c.rotation.z =
          -gust * 0.08 + Math.sin(time * 2.4 + i) * 0.05 * (0.3 + strength);
      for (const leaf of leaves) {
        const u = leaf.userData;
        leaf.position.x += (gust * 0.9 + Math.sin(time + u.phase) * 0.2) * dt;
        leaf.position.y += Math.sin(time * 2 + u.phase) * 0.15 * dt - 0.05 * dt;
        leaf.rotation.set(time * u.spin, time * u.spin * 0.7, u.phase);
        if (leaf.position.x > 8) leaf.position.x = -8;
        if (leaf.position.x < -8) leaf.position.x = 8;
        if (leaf.position.y < 0.1) leaf.position.y = 2.6;
      }

      basketWobble = Math.max(0, basketWobble - dt * 2.5);
      basket.rotation.z = Math.sin(time * 30) * 0.05 * basketWobble;

      // The plane in your hand, or in the air.
      if (plane) {
        flying.visible = true;
        pose(flying, plane);
      } else if (held) {
        flying.visible = true;
        flying.position.set(
          LAUNCH.x,
          LAUNCH.y + Math.sin(time * 2) * 0.01,
          LAUNCH.z,
        );
        flying.rotation.set(0, Math.PI + -held.yaw, 0);
        flying.rotateX(-0.12 - held.power * 0.1);
      } else flying.visible = false;

      let n = 0;
      if (held?.show) {
        if (guide) {
          const step = Math.max(1, Math.floor(guide.length / dots.length));
          for (let i = step; i < guide.length && n < dots.length; i += step)
            dots[n++].position.set(guide[i].x, guide[i].y, guide[i].z);
        } else {
          const len = 0.6 + held.power * 2.2;
          for (; n < 8; n++) {
            const d = 0.25 + (len * (n + 1)) / 8;
            dots[n].position.set(
              LAUNCH.x + Math.sin(held.yaw) * d,
              LAUNCH.y + 0.02 + d * 0.06,
              LAUNCH.z - Math.cos(held.yaw) * d,
            );
          }
        }
      }
      dots.forEach((d, i) => (d.visible = i < n));

      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material))
          node.material.forEach((m) => m.dispose());
        else node.material?.dispose();
      });
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
