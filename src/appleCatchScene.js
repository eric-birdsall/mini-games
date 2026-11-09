import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { LANES, WOBBLE } from "../shared/appleCatch.js";

// Four lanes side by side, each with its own little apple tree and a player
// standing still under it. Things hang from the tree at HANG_Y over one of
// three spots, fall down the z = 0 plane, and are caught at BASKET_Y.
export const LANE_WIDTH = 2.8;
export const SPOT_GAP = 0.85;
export const HANG_Y = 4.1;
export const BASKET_Y = 0.95;
const GROUND_Y = 0.13;
const BASKET_RADIUS = 0.42;
// How long before letting go a drop shows up on its branch.
const APPEAR = 0.6;
// The slice of the yard that must stay on screen whatever the aspect ratio.
const VIEW_HALF_WIDTH = 5.75;
const VIEW_HALF_HEIGHT = 3.45;
const LOOK = new T.Vector3(0, 2.75, 0);

export const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_WIDTH;
export const spotX = (lane, spot) => laneX(lane) + (spot - 1) * SPOT_GAP;

export function createAppleCatchScene(canvas, players) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3f0");
  scene.fog = new T.Fog("#bfe3f0", 26, 60);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(0, 3.4, 12.5);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff6dc", "#6c8f55", 2.2));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.position.set(-5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -10,
    right: 10,
    top: 10,
    bottom: -6,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.7) =>
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

  // --- Yard ---------------------------------------------------------------
  box(90, 0.2, 90, mat("#86b25a"), 0, -0.1, 0).castShadow = false;
  const stripe = mat("#93bd64");
  for (let i = -3; i <= 3; i++)
    box(90, 0.01, 1.4, stripe, 0, 0.005, i * 2.8 + 1).castShadow = false;

  // Picket fence along the back.
  const picket = mat("#f4efe2");
  for (let i = -16; i <= 16; i++)
    box(0.32, 1.5, 0.08, picket, i * 0.62, 0.75, -6.5);
  box(21, 0.12, 0.06, picket, 0, 1.05, -6.45);
  box(21, 0.12, 0.06, picket, 0, 0.45, -6.45);

  // Far shrubs and tree line.
  const hedge = [mat("#5f8f45"), mat("#6e9d4c"), mat("#557f3e")];
  const blob = new T.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 14; i++) {
    const x = (i - 6.5) * 1.9 + Math.sin(i * 2.3) * 0.4;
    mesh(blob, hedge[i % 3], x, 0.9, -7.6 - (i % 2) * 0.6).scale.set(
      1.3,
      1.1,
      0.9,
    );
  }
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 4.6;
    mesh(
      new T.CylinderGeometry(0.15, 0.22, 2.4, 8),
      mat("#7a5532"),
      x,
      1.2,
      -15,
    );
    mesh(blob, hedge[(i + 1) % 3], x, 3.3, -15).scale.set(1.9, 2.1, 1.7);
  }

  // Low box hedges between the lanes.
  const hedgeBox = mat("#4f8a3a", 0.9);
  for (let i = 1; i < LANES; i++) {
    const x = laneX(i) - LANE_WIDTH / 2;
    box(0.36, 0.55, 2.6, hedgeBox, x, 0.27, -0.3);
  }

  // --- One apple tree per lane ---------------------------------------------
  const bark = mat("#7b5131", 0.85);
  const leaves = [mat("#4f8a3a"), mat("#5f9b42"), mat("#46793a")];
  const twigGeometry = new T.CylinderGeometry(0.03, 0.05, 1, 6);
  for (let lane = 0; lane < LANES; lane++) {
    const x = laneX(lane);
    mesh(new T.CylinderGeometry(0.22, 0.34, 4.0, 10), bark, x, 2.0, -1.5);
    for (const side of [-1, 1]) {
      const limb = mesh(
        new T.CylinderGeometry(0.06, 0.13, 1.9, 8),
        bark,
        x + side * 0.55,
        4.15,
        -1.1,
      );
      limb.rotation.z = -side * 0.95;
    }
    for (const [dx, y, z, s] of [
      [0, 5.55, -1.4, 1.45],
      [-0.95, 5.0, -0.9, 1.05],
      [0.95, 5.0, -0.9, 1.05],
      [-0.4, 4.85, -0.35, 0.8],
      [0.45, 4.9, -0.4, 0.8],
    ]) {
      const crown = mesh(
        blob,
        leaves[(lane + Math.round(dx + 1)) % 3],
        x + dx,
        y,
        z,
      );
      crown.scale.set(s * 1.05, s * 0.78, s);
    }
    // A twig over each spot for things to hang from.
    for (let spot = 0; spot < 3; spot++) {
      const twig = mesh(
        twigGeometry,
        bark,
        spotX(lane, spot),
        HANG_Y + 0.5,
        -0.15,
      );
      twig.scale.y = 0.75;
      twig.rotation.x = 0.35;
    }
  }

  // --- Things that fall ---------------------------------------------------
  const appleSkin = mat("#d9322b", 0.45);
  const appleBlush = mat("#ef5a3a", 0.45);
  const stemWood = mat("#6b4527");
  const leafGreen = mat("#5aa032");
  const coneBrown = mat("#8a5a2f", 0.9);
  const coneDark = mat("#6a4222", 0.9);
  const round = new T.SphereGeometry(1, 20, 14);
  const stemGeometry = new T.CylinderGeometry(0.025, 0.035, 0.16, 6);
  const scaleGeometry = new T.ConeGeometry(0.08, 0.16, 5);

  function makeApple(scale = 1) {
    const g = new T.Group();
    mesh(round, appleSkin, 0, 0, 0, g).scale.set(0.26, 0.24, 0.26);
    mesh(round, appleBlush, 0.06, 0.03, 0.1, g).scale.set(0.17, 0.16, 0.17);
    mesh(stemGeometry, stemWood, 0, 0.27, 0, g).rotation.z = -0.25;
    const leaf = mesh(round, leafGreen, 0.1, 0.3, 0, g);
    leaf.scale.set(0.12, 0.025, 0.06);
    leaf.rotation.z = 0.5;
    g.scale.setScalar(scale);
    g.userData.kind = "apple";
    return g;
  }
  function makePinecone() {
    const g = new T.Group();
    mesh(round, coneDark, 0, 0, 0, g).scale.set(0.15, 0.3, 0.15);
    for (let ring = 0; ring < 5; ring++) {
      const y = 0.2 - ring * 0.1;
      const r = 0.1 + Math.sin(((ring + 0.5) / 5) * Math.PI) * 0.08;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + ring * 0.45;
        const s = mesh(
          scaleGeometry,
          ring % 2 ? coneBrown : coneDark,
          Math.cos(a) * r,
          y,
          Math.sin(a) * r,
          g,
        );
        // Point the scales outward and down, like a real cone.
        s.lookAt(Math.cos(a) * 2, y - 1.2, Math.sin(a) * 2);
        s.rotateX(Math.PI / 2);
      }
    }
    mesh(stemGeometry, stemWood, 0, 0.33, 0, g);
    g.userData.kind = "pinecone";
    return g;
  }
  const SIZE = { apple: 1, pinecone: 1.15 };

  const pool = { apple: [], pinecone: [] };
  const live = new Map(); // "lane:id" → model
  function modelFor(key, kind) {
    let model = live.get(key);
    if (model) return model;
    model =
      pool[kind].pop() ?? (kind === "apple" ? makeApple() : makePinecone());
    scene.add(model);
    live.set(key, model);
    return model;
  }

  // Soft shadows on the grass under falling things.
  const shadowGeometry = new T.CircleGeometry(1, 20);
  const shadowPool = [];
  const shadows = new Map();
  function shadowFor(key) {
    let s = shadows.get(key);
    if (!s) {
      s =
        shadowPool.pop() ??
        new T.Mesh(
          shadowGeometry,
          new T.MeshBasicMaterial({
            color: "#25381c",
            transparent: true,
            depthWrite: false,
          }),
        );
      s.rotation.x = -Math.PI / 2;
      scene.add(s);
      shadows.set(key, s);
    }
    return s;
  }

  // --- Players ------------------------------------------------------------
  const wicker = mat("#b07235", 0.8);
  wicker.side = T.DoubleSide;
  const weave = mat("#8f5726", 0.8);
  const catchers = players.map((player, lane) => {
    const x = laneX(lane);
    // A coloured patch of grass marks whose lane it is.
    const patch = new T.Mesh(
      new T.CircleGeometry(1.15, 32),
      new T.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.015, 0.1);
    patch.scale.set(1, 0.75, 1);
    scene.add(patch);
    const avatar = createAvatar("attacker", player.avatar, false);
    avatar.position.set(x, 0, -0.6);
    avatar.scale.setScalar(0.85);
    scene.add(avatar);
    const basket = new T.Group();
    basket.position.set(x, BASKET_Y, 0);
    scene.add(basket);
    mesh(
      new T.CylinderGeometry(BASKET_RADIUS, 0.3, 0.34, 24, 1, true),
      wicker,
      0,
      -0.17,
      0,
      basket,
    );
    mesh(
      new T.CylinderGeometry(0.3, 0.3, 0.04, 24),
      weave,
      0,
      -0.33,
      0,
      basket,
    );
    for (let i = 1; i < 3; i++) {
      const band = mesh(
        new T.TorusGeometry(BASKET_RADIUS - i * 0.04, 0.016, 6, 24),
        weave,
        0,
        -i * 0.11,
        0,
        basket,
      );
      band.rotation.x = Math.PI / 2;
    }
    const rim = mesh(
      new T.TorusGeometry(BASKET_RADIUS, 0.05, 8, 28),
      mat(player.color, 0.5),
      0,
      0,
      0,
      basket,
    );
    rim.rotation.x = Math.PI / 2;
    // A little pile of apples that grows with the total.
    const pile = [];
    for (let i = 0; i < 7; i++) {
      const a = makeApple(0.6);
      const ring = i < 4 ? 0 : 1;
      const angle = (i / (ring ? 3 : 4)) * Math.PI * 2 + ring;
      const r = ring ? 0.1 : 0.2;
      a.position.set(
        Math.cos(angle) * r,
        -0.1 + ring * 0.1,
        Math.sin(angle) * r,
      );
      a.rotation.set(i, i * 1.7, 0);
      a.visible = false;
      basket.add(a);
      pile.push(a);
    }
    return { lane, avatar, basket, pile, shake: 0, spot: 1 };
  });

  // Apples that spill out when someone catches a pinecone.
  const spills = [];

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  const point = new T.Vector3();
  const ray = new T.Raycaster();
  const catchPlane = new T.Plane(new T.Vector3(0, 0, 1), 0);
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

  function placeDrop(key, drop, x, caught, t) {
    const appear = drop.at - WOBBLE - APPEAR;
    if (t < appear || t > drop.land + 3.1) return false;
    if (caught && t >= drop.land) return false;
    const model = modelFor(key, drop.kind);
    const shadow = shadowFor(key);
    const full = SIZE[drop.kind];
    model.rotation.set(0, drop.id * 0.9, 0);
    shadow.position.set(x, 0.02, 0);
    if (t < drop.at) {
      // Grow in on the branch, then shake before letting go.
      model.scale.setScalar(Math.min(1, (t - appear) / 0.3) * full);
      const shaking = t > drop.at - WOBBLE;
      const swing = shaking
        ? Math.sin(clock * 38) *
          0.35 *
          ((t - (drop.at - WOBBLE)) / WOBBLE + 0.3)
        : Math.sin(clock * 2 + drop.id) * 0.06;
      model.position.set(x + swing * 0.1, HANG_Y, 0);
      model.rotation.z = swing;
      shadow.scale.setScalar(0.14);
      shadow.material.opacity = 0.08;
      return true;
    }
    model.scale.setScalar(full);
    const f = (t - drop.at) / drop.fall;
    let y;
    let z = 0;
    if (f <= 1) {
      y = HANG_Y - (HANG_Y - BASKET_Y) * f * f;
      model.rotation.x = f * 5;
    } else {
      // Missed: keep falling to the grass, bounce once, then rest and fade.
      const after = (t - drop.land) / 0.2;
      if (after < 1) y = T.MathUtils.lerp(BASKET_Y, GROUND_Y, after * after);
      else {
        const b = after - 1;
        y =
          GROUND_Y +
          Math.max(0, Math.sin(Math.min(b, 2.2) * 1.43) * 0.2 * Math.exp(-b));
      }
      if (drop.kind === "apple")
        z = Math.min(0.9, Math.max(0, after - 1) * 0.3);
      model.rotation.x = 5 + Math.min(after, 3) * 1.2;
      model.scale.multiplyScalar(
        1 - T.MathUtils.clamp((t - drop.land - 2.4) / 0.6, 0, 1),
      );
    }
    model.position.set(x, y, z);
    const near = 1 - (y - GROUND_Y) / (HANG_Y - GROUND_Y);
    shadow.scale.setScalar(0.14 + near * 0.16);
    shadow.material.opacity = 0.1 + near * 0.32;
    shadow.position.z = z;
    return true;
  }

  return {
    // The yard x under a screen position (for touch steering).
    aim(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      return ray.ray.intersectPlane(catchPlane, point) ? point.x : null;
    },
    // Canvas-relative pixels for a point in the yard (for labels and pops).
    toScreen(x, y, z = 0) {
      point.set(x, y, z).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    basketScreen(lane) {
      const b = catchers[lane].basket.position;
      return this.toScreen(b.x, b.y + 0.4, 0);
    },
    // Someone caught a pinecone: shake the basket and spill some apples.
    spill(lane, lost) {
      const c = catchers[lane];
      c.shake = 0.5;
      for (let i = 0; i < lost; i++) {
        const a = makeApple(0.7);
        a.position.copy(c.basket.position);
        a.position.y += 0.1;
        scene.add(a);
        const angle = Math.PI / 2 + (i - (lost - 1) / 2) * 0.5;
        spills.push({
          model: a,
          vx: Math.cos(angle) * 1.6,
          vy: 3.2 + (i % 2) * 0.7,
          vz: 0.8 + (i % 3) * 0.4,
          age: 0,
        });
      }
    },
    // view: { t, drops, lanes: [{ spot, total }] }
    // Each drop has caught: [boolean per lane] once it has landed.
    draw(dt, view) {
      if (!fit()) return;
      clock += dt;
      const { t } = view;
      const seen = new Set();
      for (const drop of view.drops) {
        for (let lane = 0; lane < LANES; lane++) {
          const key = `${lane}:${drop.id}`;
          if (
            placeDrop(key, drop, spotX(lane, drop.spot), drop.caught?.[lane], t)
          )
            seen.add(key);
        }
      }
      for (const [key, model] of live)
        if (!seen.has(key)) {
          scene.remove(model);
          pool[model.userData.kind].push(model);
          live.delete(key);
        }
      for (const [key, s] of shadows)
        if (!seen.has(key)) {
          scene.remove(s);
          shadowPool.push(s);
          shadows.delete(key);
        }

      catchers.forEach((c) => {
        const p = view.lanes[c.lane];
        const target = spotX(c.lane, p.spot);
        const b = c.basket.position;
        // Snap quickly, but slide so the move reads.
        b.x += (target - b.x) * Math.min(1, dt * 28);
        c.shake = Math.max(0, c.shake - dt);
        c.basket.rotation.z = Math.sin(c.shake * 40) * c.shake * 0.5;
        const shown = Math.min(c.pile.length, Math.ceil(p.total / 5));
        c.pile.forEach((a, k) => (a.visible = k < shown));
        // The player stays put but leans toward the basket.
        const lean = p.spot - 1;
        c.avatar.position.x = laneX(c.lane) + lean * 0.22;
        c.avatar.rotation.z +=
          (-lean * 0.14 - c.avatar.rotation.z) * Math.min(1, dt * 18);
        c.avatar.rotation.y +=
          (-lean * 0.35 - c.avatar.rotation.y) * Math.min(1, dt * 18);
        animateAvatar(c.avatar, { moveSpeed: 0 }, dt);
        // Robot stand-in (while a critter loads): hold the basket out front.
        const rig = c.avatar.userData.fallback?.userData.robot;
        rig?.arms.forEach((arm, k) => {
          arm.rotation.x = -1.3;
          arm.rotation.z = k ? -0.15 : 0.15;
          rig.elbows[k].rotation.x = 0.1;
        });
      });

      for (let i = spills.length - 1; i >= 0; i--) {
        const s = spills[i];
        s.age += dt;
        s.vy -= 11 * dt;
        s.model.position.x += s.vx * dt;
        s.model.position.z += s.vz * dt;
        s.model.position.y = Math.max(GROUND_Y, s.model.position.y + s.vy * dt);
        if (s.model.position.y === GROUND_Y) s.vx = s.vz = 0;
        s.model.rotation.x += dt * 8;
        if (s.age > 2.2) s.model.scale.multiplyScalar(0.85);
        if (s.age > 2.8) {
          scene.remove(s.model);
          spills.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const c of catchers) releaseAvatar(c.avatar);
      for (const list of Object.values(pool))
        for (const model of list) scene.add(model);
      for (const s of [...spills.map((s) => s.model), ...shadowPool])
        scene.add(s);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
