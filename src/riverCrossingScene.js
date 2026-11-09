import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { COLS, branchLeft } from "../shared/riverCrossing.js";

// One column is CELL metres wide and one row is ROW metres deep. Column 4 is
// the middle of the river; row 0 (the near bank) sits at z = 0 and the far
// bank is further away (negative z).
export const CELL = 1.3;
export const ROW = 1.55;
const MID = (COLS - 1) / 2;
export const colX = (col) => (col - MID) * CELL;
export const rowZ = (row) => -row * ROW;
const WATER_Y = 0;
const BANK_Y = 0.32;
const BRANCH_Y = 0.12;
const ROCK_Y = 0.2;
// Branches out past here sink under so they don't pop in at the edges.
const VISIBLE = MID + 4.5;

export function createRiverCrossingScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe6f2");
  scene.fog = new T.Fog("#bfe6f2", 24, 52);
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 120);

  scene.add(new T.HemisphereLight("#fff6dc", "#5d8a58", 2.2));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 9,
    bottom: -9,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const materials = new Map();
  const mat = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key))
      materials.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.75, ...extra }),
      );
    return materials.get(key);
  };
  function mesh(geometry, material, x, y, z, parent) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);

  // The river is rebuilt for every crossing.
  let river = new T.Group();
  scene.add(river);
  let rows = [];
  let branchRows = [];
  let streaks = [];

  function bankScenery(group, z, far) {
    const wood = mat("#7c5636");
    const leaves = [mat("#5a8c47"), mat("#6f9d4c"), mat("#4f7f41")];
    const dir = far ? -1 : 1;
    for (let i = 0; i < 14; i++) {
      const x = -17 + i * 2.6 + (i % 2) * 0.8;
      if (Math.abs(x) < 6.6) continue;
      const tz = z + dir * (2.2 + (i % 3) * 1.4);
      const h = 1.8 + (i % 4) * 0.4;
      mesh(new T.CylinderGeometry(0.16, 0.24, h, 8), wood, x, h / 2, tz, group);
      const crown = mesh(
        new T.IcosahedronGeometry(1.3 + (i % 3) * 0.3, 1),
        leaves[i % 3],
        x,
        h + 1,
        tz,
        group,
      );
      crown.scale.y = 1.15;
    }
    // Reeds along the water's edge.
    const reed = mat("#6b8f3a");
    const cattail = mat("#7a4f2c");
    for (let i = 0; i < 22; i++) {
      const x = -15 + i * 1.43 + Math.sin(i * 7) * 0.3;
      if (Math.abs(x) < CELL * (MID + 0.6)) continue;
      const rz = z - dir * (ROW / 2 - 0.15);
      const h = 0.7 + (i % 3) * 0.2;
      mesh(
        new T.CylinderGeometry(0.025, 0.035, h, 5),
        reed,
        x,
        h / 2,
        rz,
        group,
      );
      mesh(
        new T.CylinderGeometry(0.05, 0.05, 0.18, 6),
        cattail,
        x,
        h,
        rz,
        group,
      );
    }
    // Flowers dotted on the grass.
    const petals = ["#f7d24a", "#f28fb0", "#ffffff", "#b99af2"].map((c) =>
      mat(c),
    );
    for (let i = 0; i < 18; i++) {
      const x = -9 + ((i * 3.7) % 18);
      const fz = z + dir * (0.9 + ((i * 1.3) % 3.2));
      if (!far && Math.abs(x) < 1.2 && fz < 1.5) continue;
      mesh(
        new T.SphereGeometry(0.08, 8, 6),
        petals[i % 4],
        x,
        BANK_Y + 0.06,
        fz,
        group,
      ).castShadow = false;
    }
  }

  function branchModel(length) {
    const group = new T.Group();
    const bark = mat("#8a5a33");
    const darker = mat("#6d4426");
    const cut = mat("#d8b483");
    const span = length * CELL - 0.12;
    const logGeometry = new T.CylinderGeometry(0.24, 0.27, span, 12);
    logGeometry.rotateZ(Math.PI / 2);
    mesh(logGeometry, bark, span / 2, 0, 0, group);
    for (const end of [0, span]) {
      const cap = mesh(
        new T.CircleGeometry(0.24, 12),
        cut,
        end + (end ? 0.001 : -0.001),
        0,
        0,
        group,
      );
      cap.rotation.y = end ? Math.PI / 2 : -Math.PI / 2;
    }
    // Bark stripes, a stub twig and a tuft of leaves.
    for (let s = 0.4; s < span - 0.2; s += 0.7) {
      const ring = mesh(
        new T.TorusGeometry(0.255, 0.025, 6, 14),
        darker,
        s,
        0,
        0,
        group,
      );
      ring.rotation.y = Math.PI / 2;
    }
    const twig = mesh(
      new T.CylinderGeometry(0.03, 0.05, 0.6, 6),
      darker,
      span * 0.7,
      0.32,
      0.08,
      group,
    );
    twig.rotation.z = -0.7;
    mesh(
      new T.IcosahedronGeometry(0.17, 0),
      mat("#6fa34d"),
      span * 0.7 + 0.22,
      0.54,
      0.08,
      group,
    );
    return group;
  }

  function rockModel(i) {
    const group = new T.Group();
    const stone = mesh(
      new T.DodecahedronGeometry(0.55, 0),
      mat(i % 2 ? "#8e9398" : "#9da2a5"),
      0,
      0,
      0,
      group,
    );
    stone.scale.set(1, 0.48, 0.86);
    stone.rotation.y = i * 1.3;
    const moss = mesh(
      new T.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mat("#6c9a4a"),
      0.08,
      0.18,
      -0.05,
      group,
    );
    moss.scale.set(1, 0.35, 0.9);
    return group;
  }

  function streak(z, row) {
    const line = new T.Mesh(
      new T.PlaneGeometry(0.9 + Math.random() * 0.8, 0.05),
      new T.MeshBasicMaterial({
        color: "#eafaff",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(
      (Math.random() - 0.5) * 22,
      WATER_Y + 0.01,
      z + (Math.random() - 0.5) * ROW * 0.7,
    );
    line.userData = { row, phase: Math.random() * 6 };
    river.add(line);
    return line;
  }

  function disposeGroup(group) {
    group.traverse((node) => {
      node.geometry?.dispose();
      if (node.material && ![...materials.values()].includes(node.material))
        node.material.dispose();
    });
    group.removeFromParent();
  }

  function setCrossing(plan) {
    disposeGroup(river);
    river = new T.Group();
    scene.add(river);
    rows = plan;
    branchRows = [];
    streaks = [];
    const last = plan.length - 1;
    const farZ = rowZ(last);

    // Grass under everything, water between the banks.
    const grass = mat("#86ad58");
    // Each bank's own row is grass too, so the banks reach the water.
    box(80, 0.4, 14 + ROW / 2, grass, 0, BANK_Y - 0.2, 7 - ROW / 4, river);
    box(
      80,
      0.4,
      16 + ROW / 2,
      grass,
      0,
      BANK_Y - 0.2,
      farZ - 8 + ROW / 4,
      river,
    );
    const mud = mat("#b69a68");
    box(80, 0.34, 0.3, mud, 0, BANK_Y - 0.22, -ROW / 2 - 0.1, river);
    box(80, 0.34, 0.3, mud, 0, BANK_Y - 0.22, farZ + ROW / 2 + 0.1, river);
    const depth = (last - 1) * ROW;
    const water = mesh(
      new T.PlaneGeometry(80, depth),
      mat("#4c9fbc", { roughness: 0.25, metalness: 0.08 }),
      0,
      WATER_Y,
      rowZ(last / 2),
      river,
    );
    water.rotation.x = -Math.PI / 2;
    water.castShadow = false;
    const riverbed = mesh(
      new T.PlaneGeometry(80, depth),
      mat("#2f6e86"),
      0,
      WATER_Y - 0.5,
      rowZ(last / 2),
      river,
    );
    riverbed.rotation.x = -Math.PI / 2;
    bankScenery(river, 0, false);
    bankScenery(river, farZ, true);

    // A flag on the far bank marks the goal.
    const pole = mesh(
      new T.CylinderGeometry(0.04, 0.04, 2, 8),
      mat("#e9e3d6"),
      colX(MID) + CELL * 0.5,
      BANK_Y + 1,
      farZ - 0.45,
      river,
    );
    const flag = mesh(
      new T.PlaneGeometry(0.7, 0.45),
      mat("#f0533f", { side: T.DoubleSide }),
      0.35,
      0.72,
      0,
      pole,
    );
    flag.userData.flag = true;

    plan.forEach((row, r) => {
      const z = rowZ(r);
      if (row.kind === "rocks") {
        row.rocks.forEach((col, i) => addRock(i + r, col, z));
      } else if (row.kind === "branches") {
        const models = row.branches.map((branch) => {
          const model = branchModel(branch.length);
          river.add(model);
          return model;
        });
        branchRows.push({ r, row, models });
        for (let i = 0; i < 7; i++) streaks.push(streak(z, row));
      }
    });
  }

  const addRock = (i, col, z) => {
    const rock = rockModel(i);
    rock.position.set(colX(col), ROCK_Y - 0.1, z);
    river.add(rock);
  };

  // Player.
  const hopper = createAvatar("attacker", avatar, false);
  // A bit smaller than life so the hopper doesn't hide the row ahead.
  hopper.scale.setScalar(0.72);
  scene.add(hopper);
  // Avatars face -z (across the river) at yaw 0.
  let facing = 0;

  // Landing hint: a ring where a forward hop would land.
  const hint = new T.Mesh(
    new T.RingGeometry(0.34, 0.44, 32),
    new T.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  hint.rotation.x = -Math.PI / 2;
  scene.add(hint);

  // Splash: an expanding ring and a burst of droplets.
  const splashRing = new T.Mesh(
    new T.RingGeometry(0.85, 1, 36),
    new T.MeshBasicMaterial({
      color: "#eafaff",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  splashRing.rotation.x = -Math.PI / 2;
  scene.add(splashRing);
  const dropMaterial = new T.MeshBasicMaterial({ color: "#d8f4ff" });
  const drops = Array.from({ length: 14 }, () => {
    const drop = new T.Mesh(new T.SphereGeometry(0.06, 6, 4), dropMaterial);
    drop.visible = false;
    scene.add(drop);
    return drop;
  });

  // Confetti when you reach the far bank.
  const confetti = new T.Group();
  const confettiColors = ["#f0533f", "#f5cd5a", "#5fc4e6", "#7bd17a"];
  for (let i = 0; i < 26; i++)
    confetti.add(
      new T.Mesh(
        new T.PlaneGeometry(0.1, 0.06),
        new T.MeshBasicMaterial({
          color: confettiColors[i % 4],
          side: T.DoubleSide,
        }),
      ),
    );
  confetti.visible = false;
  scene.add(confetti);

  const size = new T.Vector2();
  const ray = new T.Raycaster();
  const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), -BANK_Y * 0.5);
  const point = new T.Vector3();
  const cameraZ = { value: 0 };
  let clock = 0;

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      camera.aspect = aspect;
      // Keep the whole river width in view on tall, narrow screens.
      camera.fov = aspect < 1.3 ? Math.min(80, 50 * (1.3 / aspect) ** 0.8) : 50;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  // Height of the surface at a spot, for the player and the hint.
  function surfaceY(row) {
    const kind = rows[row]?.kind;
    if (kind === "bank") return BANK_Y;
    if (kind === "rocks") return ROCK_Y + 0.1;
    return BRANCH_Y + 0.24;
  }

  return {
    setCrossing,
    // The ground point under a click or tap, in columns and rows.
    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      if (!ray.ray.intersectPlane(groundPlane, point)) return null;
      return { x: point.x / CELL + MID, row: -point.z / ROW };
    },
    // Canvas-relative pixel position above the player (for pop-up text).
    playerOnScreen() {
      point.copy(hopper.position);
      point.y += 1.6;
      point.project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    // view: { t, player: {row, x}, hop: {from, to, f} | null,
    //         splash: number | null (seconds since), won: number | null,
    //         hint: {row, x, safe} | null }
    draw(dt, view) {
      if (!resize()) return;
      clock += dt;
      const { t } = view;

      // Branches drift and bob; sink at the far edges.
      for (const { r, row, models } of branchRows) {
        row.branches.forEach((branch, i) => {
          const left = branchLeft(row, branch, t);
          const model = models[i];
          const centre = left - 0.5 + branch.length / 2;
          const out = Math.max(0, Math.abs(centre - MID) - VISIBLE);
          model.position.set(
            colX(left - 0.5) + 0.06,
            BRANCH_Y -
              Math.min(0.8, out * 0.5) +
              Math.sin(clock * 2 + r + i) * 0.025,
            rowZ(r),
          );
          model.rotation.x = Math.sin(clock * 1.6 + r * 2 + i) * 0.05;
        });
      }
      for (const line of streaks) {
        const { row, phase } = line.userData;
        line.position.x += row.dir * row.speed * CELL * dt * 1.2;
        if (line.position.x > 12) line.position.x -= 24;
        if (line.position.x < -12) line.position.x += 24;
        line.material.opacity = 0.25 + 0.25 * Math.sin(clock * 1.5 + phase);
      }
      river.traverse((node) => {
        if (node.userData.flag) node.rotation.y = Math.sin(clock * 3) * 0.25;
      });

      // Player position: hop arcs, splash sinks.
      const { player, hop } = view;
      let px = colX(player.x);
      let pz = rowZ(player.row);
      let py = surfaceY(player.row);
      let moveSpeed = 0;
      if (hop) {
        const f = hop.f;
        const s = f * f * (3 - 2 * f);
        px = T.MathUtils.lerp(colX(hop.from.x), colX(hop.to.x), s);
        pz = T.MathUtils.lerp(rowZ(hop.from.row), rowZ(hop.to.row), s);
        py =
          T.MathUtils.lerp(surfaceY(hop.from.row), surfaceY(hop.to.row), s) +
          Math.sin(f * Math.PI) * 0.55;
        const dx = hop.to.x - hop.from.x;
        const dz = hop.to.row - hop.from.row;
        if (dx || dz) facing = Math.atan2(-dx, dz);
        moveSpeed = 2;
      }
      if (view.splash !== null) {
        const s = view.splash;
        py = Math.max(-1.2, WATER_Y + 0.1 - s * 2.4);
        splashRing.position.set(px, WATER_Y + 0.02, pz);
        splashRing.scale.setScalar(0.2 + s * 1.6);
        splashRing.material.opacity = Math.max(0, 0.9 - s * 1.1);
        drops.forEach((drop, i) => {
          const angle = (i / drops.length) * Math.PI * 2;
          const r = s * (1 + (i % 3) * 0.4);
          drop.visible = s < 0.7;
          drop.position.set(
            px + Math.cos(angle) * r,
            WATER_Y + s * (3.2 + (i % 4) * 0.5) - 7 * s * s,
            pz + Math.sin(angle) * r,
          );
        });
      } else {
        splashRing.material.opacity = 0;
        for (const drop of drops) drop.visible = false;
      }
      hopper.position.set(px, py, pz);
      hopper.rotation.y +=
        Math.atan2(
          Math.sin(facing - hopper.rotation.y),
          Math.cos(facing - hopper.rotation.y),
        ) * Math.min(1, dt * 14);
      animateAvatar(
        hopper,
        { moveSpeed, grounded: !hop || hop.f > 0.85 },
        dt,
        view.won !== null && view.won < 1.4 ? "win" : undefined,
      );

      hint.visible = !!view.hint;
      if (view.hint) {
        hint.position.set(
          colX(view.hint.x),
          surfaceY(view.hint.row) + 0.02,
          rowZ(view.hint.row),
        );
        hint.material.color.set(view.hint.safe ? "#9cf27a" : "#ffffff");
        hint.material.opacity =
          (view.hint.safe ? 0.85 : 0.35) + Math.sin(clock * 6) * 0.1;
      }

      confetti.visible = view.won !== null && view.won < 1.5;
      if (confetti.visible) {
        const w = view.won;
        confetti.position.set(px, py + 0.8, pz);
        confetti.children.forEach((piece, i) => {
          const angle = (i * Math.PI * 2) / confetti.children.length;
          const r = 0.1 + w * (1.4 + (i % 3) * 0.4);
          piece.position.set(
            Math.cos(angle) * r,
            w * (3 + (i % 4) * 0.5) - 4.5 * w * w,
            Math.sin(angle) * r,
          );
          piece.rotation.set(w * 9 + i, w * 7, angle);
        });
      }

      // Camera follows the player across the river.
      const want = Math.min(pz, 0) - 0.5;
      cameraZ.value += (want - cameraZ.value) * Math.min(1, dt * 3);
      const narrow = camera.aspect < 1;
      camera.position.set(
        0,
        narrow ? 14 : 9.4,
        cameraZ.value + (narrow ? 4.4 : 5.4),
      );
      camera.lookAt(0, 0, cameraZ.value - 3.6);
      sun.position.set(-6, 12, cameraZ.value + 5);
      sun.target.position.set(0, 0, cameraZ.value - 3);

      renderer.render(scene, camera);
    },
    snapCamera(row) {
      cameraZ.value = rowZ(row) - 0.5;
    },
    dispose() {
      releaseAvatar(hopper);
      disposeGroup(river);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      for (const material of materials.values()) material.dispose();
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
