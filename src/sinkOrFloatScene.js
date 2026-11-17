import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { LANES, HOP_TIME } from "../shared/sinkOrFloat.js";

// Lanes run left to right along x; rows run away from the camera along -z.
// Row 0 is the near bank at z = 0.
export const CELL = 1.75;
export const ROW = 1.9;
const MID = (LANES - 1) / 2;
const laneX = (lane) => (lane - MID) * CELL;
const rowZ = (row) => -row * ROW;
const STONE_TOP = 0.26;
const BANK_TOP = 0.42;
const POND_HALF = CELL * (MID + 1.4);

export function createSinkScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  const sky = new T.Color("#b9e4ef");
  scene.background = sky;
  scene.fog = new T.Fog(sky, 26, 60);
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 140);

  scene.add(new T.HemisphereLight("#fff7e2", "#4f7f5a", 2.1));
  const sun = new T.DirectionalLight("#fff0c9", 2.7);
  sun.position.set(-6, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -12,
    right: 12,
    top: 12,
    bottom: -12,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const materials = new Map();
  const mat = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra }),
      );
    return materials.get(key);
  };
  const mesh = (geometry, material, x, y, z, parent = scene, shadow = true) => {
    const item = new T.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = item.receiveShadow = shadow;
    parent.add(item);
    return item;
  };

  // Everything that depends on the pond's length is rebuilt per crossing.
  let pond = new T.Group();
  scene.add(pond);
  let stones = []; // stones[row][lane] = { group, top, drop, ring, wobble }
  let water;
  let rows = 5;

  const stoneShape = new T.CylinderGeometry(0.62, 0.72, 0.5, 11);
  const stoneTop = new T.CylinderGeometry(0.6, 0.62, 0.06, 11);
  const rippleShape = new T.RingGeometry(0.55, 0.68, 32);
  const lilyShape = new T.CircleGeometry(0.42, 18, 0.35, Math.PI * 2 - 0.7);

  function trees(group, z, dir) {
    const wood = mat("#76512f");
    const leaves = [mat("#5a8c47"), mat("#6c9b4b"), mat("#4b7a3f")];
    for (let i = 0; i < 16; i++) {
      const x = -22 + i * 2.9 + (i % 2) * 0.9;
      if (Math.abs(x) < POND_HALF + 0.5 && dir < 0 && i % 3) continue;
      const tz = z + dir * (3.2 + (i % 3) * 1.6);
      const h = 2 + (i % 4) * 0.45;
      mesh(new T.CylinderGeometry(0.18, 0.26, h, 8), wood, x, h / 2, tz, group);
      const crown = mesh(
        new T.IcosahedronGeometry(1.35 + (i % 3) * 0.35, 1),
        leaves[i % 3],
        x,
        h + 1.1,
        tz,
        group,
      );
      crown.scale.y = 1.15;
    }
  }

  function reeds(group, x0, x1, z0, z1, count) {
    const reed = mat("#6c9140");
    const tail = mat("#7a4f2c");
    for (let i = 0; i < count; i++) {
      const x = x0 + ((i * 0.618) % 1) * (x1 - x0);
      const z = z0 + ((i * 0.371 + 0.13) % 1) * (z1 - z0);
      const h = 0.8 + (i % 4) * 0.22;
      const stem = mesh(
        new T.CylinderGeometry(0.03, 0.04, h, 5),
        reed,
        x,
        h / 2,
        z,
        group,
        false,
      );
      stem.rotation.z = Math.sin(i * 3.1) * 0.12;
      if (i % 2)
        mesh(
          new T.CylinderGeometry(0.06, 0.06, 0.22, 6),
          tail,
          x,
          h,
          z,
          group,
          false,
        );
    }
  }

  function finishArch(group, z) {
    const post = mat("#c0563f");
    const span = POND_HALF - 0.4;
    for (const side of [-1, 1])
      mesh(
        new T.CylinderGeometry(0.16, 0.18, 3.2, 10),
        post,
        side * span,
        BANK_TOP + 1.6,
        z - 1.1,
        group,
      );
    mesh(
      new T.BoxGeometry(span * 2 + 0.6, 0.5, 0.3),
      mat("#f4c34c"),
      0,
      BANK_TOP + 3.1,
      z - 1.1,
      group,
    );
    const flags = ["#e85d5d", "#4ab0e8", "#f4c34c", "#7cc36a", "#b37ae8"];
    for (let i = 0; i < 11; i++) {
      const flag = mesh(
        new T.ConeGeometry(0.2, 0.42, 3),
        mat(flags[i % flags.length]),
        -span + (i * span * 2) / 10,
        BANK_TOP + 2.66,
        z - 1.1,
        group,
        false,
      );
      flag.rotation.z = Math.PI;
    }
  }

  function build(run) {
    scene.remove(pond);
    pond.traverse((node) => node.geometry?.dispose?.());
    pond = new T.Group();
    scene.add(pond);
    rows = run.pond.rows;
    const far = rowZ(rows + 1);
    const length = -far;

    // Banks: a near lawn and a far lawn with the finish arch.
    const grass = mat("#79b453");
    const earth = mat("#8a6440");
    for (const [z, d] of [
      [ROW * 0.5 + 6, 12],
      [far - ROW * 0.5 - 8, 16],
    ]) {
      mesh(new T.BoxGeometry(70, BANK_TOP, d), grass, 0, BANK_TOP / 2, z, pond);
      mesh(new T.BoxGeometry(70, 0.3, d + 0.2), earth, 0, 0.02, z, pond, false);
    }
    // Side lawns frame the pond.
    for (const side of [-1, 1])
      mesh(
        new T.BoxGeometry(20, BANK_TOP, length + 4),
        grass,
        side * (POND_HALF + 10),
        BANK_TOP / 2,
        far / 2,
        pond,
      );
    // Planks along the near edge, like a start line.
    const plank = mat("#b98a55");
    for (let lane = 0; lane < LANES; lane++)
      mesh(
        new T.BoxGeometry(CELL * 0.9, 0.08, 0.9),
        plank,
        laneX(lane),
        BANK_TOP + 0.04,
        0,
        pond,
      );
    finishArch(pond, far);
    trees(pond, ROW * 0.5 + 2, 1);
    trees(pond, far - ROW * 0.5 - 2, -1);
    reeds(pond, -POND_HALF - 0.2, -POND_HALF + 0.6, far + 1, -1, 18);
    reeds(pond, POND_HALF - 0.6, POND_HALF + 0.2, far + 1, -1, 18);

    water = mesh(
      new T.PlaneGeometry(POND_HALF * 2, length + 2, 1, 1),
      new T.MeshStandardMaterial({
        color: "#3d9bb0",
        roughness: 0.25,
        metalness: 0.1,
      }),
      0,
      0,
      far / 2,
      pond,
      false,
    );
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    // Pond floor, seen through gaps when stones sink.
    const floor = mesh(
      new T.PlaneGeometry(POND_HALF * 2, length + 2),
      mat("#2b6c78"),
      0,
      -0.4,
      far / 2,
      pond,
      false,
    );
    floor.rotation.x = -Math.PI / 2;

    // Lily pads between the lanes, never on a stone.
    const lily = mat("#4d9a49", { side: T.DoubleSide });
    const bloom = mat("#f6a6c1");
    for (let r = 1; r <= rows; r++)
      for (let g = 0; g <= LANES; g++) {
        if ((r * 7 + g * 3) % 4) continue;
        const x = laneX(g) - CELL / 2 + Math.sin(r + g) * 0.1;
        const z = rowZ(r) + ROW / 2 + Math.cos(r * g) * 0.15;
        const pad = mesh(lilyShape, lily, x, 0.02, z, pond, false);
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = r * 1.7 + g;
        pad.scale.setScalar(0.6 + ((r + g) % 3) * 0.12);
        if ((r + g) % 3 === 0)
          mesh(new T.SphereGeometry(0.1, 8, 6), bloom, x, 0.08, z, pond, false);
      }

    // The stones all look alike, with small random shape differences so
    // nothing gives the sinkers away.
    const rock = [mat("#9a9488"), mat("#8f8a7f"), mat("#a29b8c")];
    const moss = mat("#7d9b5a");
    stones = [null];
    for (let r = 1; r <= rows; r++) {
      const row = [];
      for (let lane = 0; lane < LANES; lane++) {
        const group = new T.Group();
        const seed = r * 11 + lane * 5;
        group.position.set(
          laneX(lane) + Math.sin(seed) * 0.08,
          0,
          rowZ(r) + Math.cos(seed) * 0.08,
        );
        group.rotation.y = seed;
        const body = mesh(stoneShape, rock[seed % 3], 0, 0, 0, group);
        body.scale.set(1 + (seed % 3) * 0.04, 1, 1 - (seed % 2) * 0.05);
        mesh(stoneTop, rock[(seed + 1) % 3], 0, 0.25, 0, group);
        const found = mesh(
          new T.CircleGeometry(0.34, 16),
          moss,
          0,
          0.285,
          0,
          group,
          false,
        );
        found.rotation.x = -Math.PI / 2;
        found.visible = false;
        pond.add(group);
        const ripple = mesh(
          rippleShape,
          new T.MeshBasicMaterial({
            color: "#e6f7fb",
            transparent: true,
            opacity: 0,
          }),
          group.position.x,
          0.03,
          group.position.z,
          pond,
          false,
        );
        ripple.rotation.x = -Math.PI / 2;
        row.push({ group, found, ripple, drop: 0, bob: seed });
      }
      stones.push(row);
    }
    splashes.length = 0;
    lastSink = null;
    cameraTarget = null;
  }

  // Splash droplets and expanding rings.
  const dropShape = new T.SphereGeometry(0.1, 6, 4);
  const dropMat = new T.MeshBasicMaterial({ color: "#e9fbff" });
  const ringMat = new T.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    side: T.DoubleSide,
  });
  const splashes = [];
  let lastSink = null;
  function splash(x, z) {
    const drops = [];
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const speed = 1.4 + (i % 5) * 0.45;
      const drop = mesh(dropShape, dropMat, x, 0.1, z, scene, false);
      drops.push({
        drop,
        v: new T.Vector3(
          Math.cos(angle) * speed,
          3.4 + (i % 4) * 0.9,
          Math.sin(angle) * speed,
        ),
      });
    }
    const ring = mesh(
      new T.RingGeometry(0.4, 0.55, 40),
      ringMat.clone(),
      x,
      0.04,
      z,
      scene,
      false,
    );
    ring.rotation.x = -Math.PI / 2;
    splashes.push({ drops, ring, age: 0 });
  }
  function updateSplashes(dt) {
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.age += dt;
      for (const d of s.drops) {
        d.v.y -= 11 * dt;
        d.drop.position.addScaledVector(d.v, dt);
        d.drop.visible = d.drop.position.y > -0.05;
      }
      s.ring.scale.setScalar(1 + s.age * 3.2);
      s.ring.material.opacity = Math.max(0, 0.85 - s.age * 0.7);
      if (s.age > 1.3) {
        for (const d of s.drops) scene.remove(d.drop);
        scene.remove(s.ring);
        s.ring.geometry.dispose();
        s.ring.material.dispose();
        splashes.splice(i, 1);
      }
    }
  }

  const hopper = createAvatar("attacker", avatar);
  scene.add(hopper);
  const at = (spot, pondRun) => {
    const bank = spot.row === 0 || spot.row === pondRun.pond.rows + 1;
    const stone = bank ? null : stones[spot.row]?.[spot.lane];
    return new T.Vector3(
      stone ? stone.group.position.x : laneX(spot.lane),
      bank ? BANK_TOP : STONE_TOP + (stone?.group.position.y ?? 0) + 0.03,
      stone ? stone.group.position.z : rowZ(spot.row),
    );
  };

  let cameraTarget = null;
  const look = new T.Vector3();
  let width = 0;
  let height = 0;
  let clock = 0;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep all five lanes in view on a tall phone screen.
      camera.fov = camera.aspect < 0.8 ? 64 : 48;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -STONE_TOP);
  const hit = new T.Vector3();
  const ndc = new T.Vector2();
  const point = new T.Vector3();

  return {
    build,
    // Board spot under a canvas-relative pointer, or null.
    pick(clientX, clientY) {
      const box = canvas.getBoundingClientRect();
      ndc.set(
        ((clientX - box.left) / box.width) * 2 - 1,
        -((clientY - box.top) / box.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return {
        lane: Math.round(hit.x / CELL + MID),
        row: Math.round(-hit.z / ROW),
      };
    },
    playerOnScreen() {
      point.copy(hopper.position);
      point.y += 1.7;
      point.project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    // view: { run, hop: {from, to, f} | null, sink: seconds | null,
    //         won: seconds | null }
    draw(dt, view) {
      if (!resize()) return;
      clock += dt;
      const { run, hop, sink, won } = view;

      // Stones: gentle bob, sinking ones tip and slide under.
      for (let r = 1; r <= rows; r++)
        run.pond.stones[r].forEach((data, lane) => {
          const s = stones[r][lane];
          if (data.sunk) s.drop = Math.min(1, s.drop + dt * 1.5);
          else s.drop = Math.max(0, s.drop - dt * 3);
          const wobble =
            data.sunk && s.drop < 0.6 ? Math.sin(clock * 38) * 0.08 : 0;
          s.group.position.y =
            Math.sin(clock * 1.6 + s.bob) * 0.025 - s.drop * s.drop * 1.1;
          s.group.rotation.x = wobble + s.drop * 0.5;
          s.group.rotation.z = wobble * 0.7;
          s.group.visible = s.drop < 1;
          s.found.visible = data.known && data.floats;
          // Sunk stones leave a slow ripple so you remember the spot.
          s.ripple.material.opacity = data.sunk
            ? 0.25 + Math.sin(clock * 2 + s.bob) * 0.12
            : 0;
          s.ripple.scale.setScalar(1 + ((clock * 0.4 + s.bob) % 1) * 0.35);
        });

      // Player position.
      const { player } = run;
      let pos;
      let airborne = false;
      if (hop) {
        const a = at(hop.from, run);
        const b = at(hop.to, run);
        pos = a.lerp(b, hop.f);
        pos.y += Math.sin(hop.f * Math.PI) * 0.85;
        airborne = true;
        const dx = b.x - at(hop.from, run).x;
        const dz = b.z - at(hop.from, run).z;
        if (dx || dz) hopper.rotation.y = Math.atan2(dx, dz);
      } else {
        pos = at(player, run);
        if (sink != null) {
          const fall = Math.max(0, sink - 0.18);
          pos.y -= fall * fall * 7;
          if (sink > 0.28 && lastSink !== view.sinkId) {
            lastSink = view.sinkId;
            splash(pos.x, pos.z);
          }
        }
      }
      hopper.position.copy(pos);
      hopper.visible = pos.y > -1.4;
      if (won != null) hopper.rotation.y += dt * 5;
      else if (!hop) {
        // Face forward when standing still.
        const face = Math.PI;
        let diff =
          ((face - hopper.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        hopper.rotation.y += diff * Math.min(1, dt * (sink == null ? 6 : 14));
      }
      animateAvatar(
        hopper,
        { moveSpeed: 0, grounded: !airborne && sink == null },
        dt,
        won != null ? "win" : sink != null ? "hit" : undefined,
      );
      updateSplashes(dt);

      // Camera follows the player from behind the near bank.
      const target = new T.Vector3(pos.x * 0.45, 0, Math.min(0, pos.z) - 2.6);
      if (!cameraTarget) cameraTarget = target.clone();
      cameraTarget.lerp(target, 1 - Math.exp(-dt * 4));
      const tall = camera.aspect < 0.8;
      camera.position.set(
        cameraTarget.x,
        tall ? 9.5 : 7.4,
        cameraTarget.z + (tall ? 9.5 : 8.6),
      );
      look.set(cameraTarget.x, 0, cameraTarget.z - 1.2);
      camera.lookAt(look);
      sun.position.set(cameraTarget.x - 6, 14, cameraTarget.z + 6);
      sun.target.position.set(cameraTarget.x, 0, cameraTarget.z);

      // Water shimmer.
      water.material.color.setHSL(
        0.53,
        0.47,
        0.46 + Math.sin(clock * 0.8) * 0.01,
      );
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(hopper);
      scene.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material && !materials.has(node.material))
          node.material.dispose?.();
      });
      for (const m of materials.values()) m.dispose();
      renderer.dispose();
    },
  };
}

export { HOP_TIME };
