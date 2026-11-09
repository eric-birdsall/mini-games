import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  BLOWER,
  CORNERS,
  CORNER_RADIUS,
  TREES,
  YARD,
  cornerOf,
  fallingAt,
} from "../shared/leafPiles.js";

// A square backyard seen from high up at a slight tilt. A picket fence runs
// round it with autumn trees just outside, each corner is tinted in its
// player's colour, and the leaves are one instanced mesh so a few hundred of
// them stay cheap. Leaves lying in a corner are lifted into a heap that
// grows with the pile.
const LOOK = new T.Vector3(0, 0, 0.5);
// The part of the yard that must always be on screen.
const FIT = [
  [-YARD - 0.4, 0, -YARD - 0.6],
  [YARD + 0.4, 0, -YARD - 0.6],
  [-YARD - 0.4, 0, YARD + 0.5],
  [YARD + 0.4, 0, YARD + 0.5],
  [-YARD - 0.4, 1.6, -YARD - 0.6],
  [YARD + 0.4, 1.6, -YARD - 0.6],
];
const LEAF_COLORS = [
  "#e8742a",
  "#d9472b",
  "#f2a531",
  "#c9541f",
  "#f0c443",
  "#b8372a",
  "#a8642b",
];
const MAX_LEAVES = 400;

// A stable 0..1 number per leaf id.
const hash = (n, k = 0) => {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createLeafPilesScene(canvas, players) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bcdcec");
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 120);
  camera.position.set(0, 20, 8.2);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff3dc", "#6d8a4c", 2.1));
  const sun = new T.DirectionalLight("#ffe9c4", 2.7);
  sun.position.set(-7, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -12,
    right: 12,
    top: 12,
    bottom: -12,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.75) =>
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
  box(80, 0.2, 80, mat("#7d9f4e"), 0, -0.1, 0).castShadow = false;
  box(YARD * 2, 0.02, YARD * 2, mat("#8db35a"), 0, 0.005, 0).castShadow = false;
  // Mowing stripes.
  const stripe = mat("#97bd62");
  for (let i = 0; i < 7; i += 2)
    box(YARD * 2, 0.01, 2, stripe, 0, 0.018, -YARD + 1 + i * 2).castShadow =
      false;

  // Corner piles: a tinted quarter circle and a coloured edge.
  CORNERS.forEach((c, i) => {
    const patch = new T.Mesh(
      new T.CircleGeometry(CORNER_RADIUS, 40, 0, Math.PI / 2),
      new T.MeshBasicMaterial({
        color: players[i].color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    // CircleGeometry's quarter spans +x / +y in its own plane, which lying
    // flat maps to +x / -z: turn it to face the middle of the yard.
    patch.rotation.z =
      Math.atan2(Math.sign(c.z), -Math.sign(c.x)) - Math.PI / 4;
    patch.position.set(c.x, 0.025, c.z);
    scene.add(patch);
    const edge = new T.Mesh(
      new T.RingGeometry(
        CORNER_RADIUS - 0.09,
        CORNER_RADIUS + 0.04,
        48,
        1,
        0,
        Math.PI / 2,
      ),
      new T.MeshBasicMaterial({ color: players[i].color }),
    );
    edge.rotation.copy(patch.rotation);
    edge.position.set(c.x, 0.03, c.z);
    scene.add(edge);
  });

  // Picket fence round the yard.
  const picket = mat("#f6f0e2", 0.6);
  const picketGeometry = new T.BoxGeometry(0.22, 0.95, 0.07);
  const railGeometry = new T.BoxGeometry(YARD * 2 + 0.3, 0.09, 0.05);
  for (const [axis, sign] of [
    ["z", -1],
    ["z", 1],
    ["x", -1],
    ["x", 1],
  ]) {
    const along = axis === "z";
    for (let k = -YARD; k <= YARD + 0.01; k += 0.5) {
      const p = mesh(
        picketGeometry,
        picket,
        along ? k : sign * (YARD + 0.08),
        0.47,
        along ? sign * (YARD + 0.08) : k,
      );
      if (!along) p.rotation.y = Math.PI / 2;
    }
    for (const y of [0.3, 0.7]) {
      const r = mesh(
        railGeometry,
        picket,
        along ? 0 : sign * (YARD + 0.14),
        y,
        along ? sign * (YARD + 0.14) : 0,
      );
      if (!along) r.rotation.y = Math.PI / 2;
    }
  }

  // Autumn trees just outside the fence.
  const bark = mat("#76502f", 0.9);
  const crowns = ["#e0752b", "#d24a2a", "#eba035", "#c95f22", "#e9be3e"].map(
    (c) => mat(c, 0.85),
  );
  const blob = new T.IcosahedronGeometry(1, 1);
  TREES.forEach((tree, i) => {
    // The trees along the front are nearest the camera: keep them small and
    // tucked down so they don't hide the front corners.
    const front = tree.z > YARD;
    const k = front ? 0.5 : 1;
    const zz = front ? tree.z + 0.9 : tree.z;
    mesh(
      new T.CylinderGeometry(0.22 * k, 0.32 * k, 3 * k, 9),
      bark,
      tree.x,
      1.5 * k,
      zz,
    );
    const lean = { x: -Math.sign(tree.x) * 0.4, z: -Math.sign(tree.z) * 0.4 };
    if (Math.abs(tree.x) < YARD) lean.x = 0;
    if (Math.abs(tree.z) < YARD) lean.z = 0;
    for (const [dx, y, dz, s] of [
      [0, 3.7, 0, 1.6],
      [0.9, 3.3, 0.5, 1.1],
      [-0.9, 3.3, -0.4, 1.15],
      [0.3, 4.4, -0.6, 1],
      [-0.4, 3.2, 0.9, 1],
    ]) {
      const crown = mesh(
        blob,
        crowns[(i + 10 + Math.round(dx * 2 + dz)) % crowns.length],
        tree.x + (dx + lean.x) * k,
        y * k,
        zz + (dz + (front ? 0 : lean.z)) * k,
      );
      crown.scale.set(s * k, s * 0.85 * k, s * k);
      crown.rotation.set(i, i * 2, 0);
    }
  });
  // --- Leaves -------------------------------------------------------------
  const leafShape = new T.Shape();
  leafShape.moveTo(0, -0.2);
  leafShape.bezierCurveTo(0.12, -0.12, 0.2, 0.02, 0.15, 0.1);
  leafShape.lineTo(0.2, 0.12);
  leafShape.bezierCurveTo(0.12, 0.18, 0.06, 0.2, 0, 0.24);
  leafShape.bezierCurveTo(-0.06, 0.2, -0.12, 0.18, -0.2, 0.12);
  leafShape.lineTo(-0.15, 0.1);
  leafShape.bezierCurveTo(-0.2, 0.02, -0.12, -0.12, 0, -0.2);
  const leafGeometry = new T.ShapeGeometry(leafShape, 4);
  leafGeometry.rotateX(-Math.PI / 2);
  leafGeometry.scale(1.15, 1, 1.15);
  const leafMaterial = new T.MeshStandardMaterial({
    roughness: 0.8,
    side: T.DoubleSide,
  });
  const leafMesh = new T.InstancedMesh(leafGeometry, leafMaterial, MAX_LEAVES);
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  leafMesh.frustumCulled = false;
  const tint = new T.Color();
  for (let i = 0; i < MAX_LEAVES; i++)
    leafMesh.setColorAt(
      i,
      tint.set(LEAF_COLORS[Math.floor(hash(i, 3) * LEAF_COLORS.length)]),
    );
  scene.add(leafMesh);
  const goldMaterial = new T.MeshStandardMaterial({
    color: "#ffd23a",
    emissive: "#ffb000",
    emissiveIntensity: 0.6,
    metalness: 0.5,
    roughness: 0.3,
    side: T.DoubleSide,
  });
  const goldMesh = new T.InstancedMesh(leafGeometry, goldMaterial, 60);
  goldMesh.castShadow = true;
  goldMesh.frustumCulled = false;
  scene.add(goldMesh);
  // Sparkles over golden leaves.
  const sparkleGeometry = new T.OctahedronGeometry(0.07, 0);
  const sparkleMesh = new T.InstancedMesh(
    sparkleGeometry,
    new T.MeshBasicMaterial({ color: "#fff7c2" }),
    60,
  );
  sparkleMesh.frustumCulled = false;
  scene.add(sparkleMesh);
  const dummy = new T.Object3D();

  // --- Leaf blower ----------------------------------------------------------
  function makeBlower() {
    const g = new T.Group();
    const orange = mat("#f07a1e", 0.45);
    const dark = mat("#2f3438", 0.6);
    box(0.34, 0.3, 0.42, orange, 0, 0.18, 0, g);
    box(0.08, 0.16, 0.3, dark, 0, 0.4, 0, g);
    const tube = mesh(
      new T.CylinderGeometry(0.07, 0.09, 0.9, 12),
      dark,
      0,
      0.18,
      -0.62,
      g,
    );
    tube.rotation.x = Math.PI / 2;
    return g;
  }
  const blowerItem = makeBlower();
  blowerItem.scale.setScalar(1.3);
  blowerItem.visible = false;
  scene.add(blowerItem);
  const blowerGlow = new T.Mesh(
    new T.RingGeometry(0.55, 0.75, 32),
    new T.MeshBasicMaterial({
      color: "#fff4a8",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  blowerGlow.rotation.x = -Math.PI / 2;
  blowerGlow.visible = false;
  scene.add(blowerGlow);
  // Puffs of air in front of whoever's blowing.
  const puffGeometry = new T.SphereGeometry(0.12, 8, 6);
  const puffMaterial = new T.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const puffs = [];

  // --- Players --------------------------------------------------------------
  const wood = mat("#b98a52", 0.7);
  const metal = mat("#7d8b91", 0.4);
  function makeRake(color) {
    const g = new T.Group();
    const handle = mesh(
      new T.CylinderGeometry(0.03, 0.03, 1.5, 8),
      wood,
      0,
      0,
      -0.7,
      g,
    );
    handle.rotation.x = Math.PI / 2;
    const head = new T.Group();
    head.position.set(0, 0, -1.45);
    g.add(head);
    box(0.62, 0.05, 0.05, mat(color, 0.5), 0, 0, 0, head);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 1.1;
      const tine = box(
        0.025,
        0.025,
        0.26,
        metal,
        Math.sin(a) * 0.36,
        -0.02,
        -Math.cos(a) * 0.13,
        head,
      );
      tine.rotation.y = -a;
    }
    return g;
  }
  const people = players.map((player, i) => {
    const ring = new T.Mesh(
      new T.RingGeometry(0.42, 0.55, 28),
      new T.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const avatar = createAvatar("attacker", player.avatar, false);
    avatar.scale.setScalar(0.85);
    scene.add(avatar);
    // The rake (and the blower) hang off a pivot at the critter's hip that
    // follows its facing; a swing sweeps the pivot across.
    const pivot = new T.Group();
    scene.add(pivot);
    const rake = makeRake(player.color);
    rake.position.set(0.18, 0.55, 0);
    rake.rotation.x = 0.32;
    pivot.add(rake);
    const blower = makeBlower();
    blower.position.set(0.24, 0.6, -0.15);
    blower.visible = false;
    pivot.add(blower);
    return { i, ring, avatar, pivot, rake, blower, x: 0, z: 0, puffClock: 0 };
  });

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  const point = new T.Vector3();
  let clock = 0;

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      camera.aspect = width / height;
      // Widen or narrow the view until the whole yard just fits.
      for (let k = 0; k < 4; k++) {
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        let most = 0;
        for (const [x, y, z] of FIT) {
          point.set(x, y, z).project(camera);
          most = Math.max(most, Math.abs(point.x), Math.abs(point.y));
        }
        const tan = Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * most;
        camera.fov = T.MathUtils.radToDeg(2 * Math.atan(tan / 0.97));
      }
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  // How high the heap is at a spot in a corner holding `count` leaves.
  function heap(x, z, corner, count) {
    const c = CORNERS[corner];
    const d = Math.hypot(x - c.x, z - c.z) / CORNER_RADIUS;
    const top = Math.min(1.1, 0.12 + count * 0.011);
    return top * Math.max(0, 1 - d * d);
  }

  return {
    // Canvas-relative pixels for a point in the yard (for labels).
    toScreen(x, y, z) {
      point.set(x, y, z).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    // view: the round from shared/leafPiles.js
    draw(dt, round) {
      if (!fit()) return;
      clock += dt;
      const t = round.t;
      const counts = [0, 0, 0, 0];
      for (const leaf of round.leaves) {
        if (leaf.state !== "ground") continue;
        const c = cornerOf(leaf.x, leaf.z);
        leaf.corner = c;
        if (c >= 0) counts[c]++;
      }
      let n = 0;
      let g = 0;
      for (const leaf of round.leaves) {
        const id = leaf.id;
        const gold = leaf.kind === "gold";
        if (leaf.state === "falling") {
          if (t < leaf.at) continue;
          const at = fallingAt(leaf, t);
          dummy.position.set(at.x, at.y + 0.03, at.z);
          dummy.rotation.set(
            Math.sin(t * 4 + id) * 0.9,
            t * 2 + id,
            Math.cos(t * 3.3 + id) * 0.7,
          );
        } else {
          const speed = Math.hypot(leaf.vx, leaf.vz);
          let y = 0.035 + hash(id, 1) * 0.02;
          if (leaf.corner >= 0)
            y +=
              heap(leaf.x, leaf.z, leaf.corner, counts[leaf.corner]) *
              (0.35 + 0.65 * hash(id, 2));
          y += Math.sin(Math.min(1, leaf.hop / 0.35) * Math.PI) * 0.25;
          leaf.spin = (leaf.spin ?? hash(id, 4) * 6) + speed * dt * 3;
          dummy.position.set(leaf.x, y, leaf.z);
          const tilt = leaf.corner >= 0 ? 0.5 : 0.12;
          dummy.rotation.set(
            (hash(id, 5) - 0.5) * tilt + leaf.hop * 2,
            leaf.spin,
            (hash(id, 6) - 0.5) * tilt,
          );
        }
        dummy.scale.setScalar(0.85 + hash(id, 7) * 0.35);
        dummy.updateMatrix();
        if (gold && g < 60) {
          goldMesh.setMatrixAt(g, dummy.matrix);
          const twinkle = (Math.sin(clock * 5 + id) + 1) / 2;
          dummy.position.y += 0.25 + twinkle * 0.15;
          dummy.rotation.set(0, clock * 3 + id, 0);
          dummy.scale.setScalar(0.4 + twinkle * 0.8);
          dummy.updateMatrix();
          sparkleMesh.setMatrixAt(g++, dummy.matrix);
        } else if (!gold && n < MAX_LEAVES)
          leafMesh.setMatrixAt(n++, dummy.matrix);
      }
      leafMesh.count = n;
      goldMesh.count = sparkleMesh.count = g;
      leafMesh.instanceMatrix.needsUpdate = true;
      goldMesh.instanceMatrix.needsUpdate = true;
      sparkleMesh.instanceMatrix.needsUpdate = true;

      // The leaf blower waiting on the grass.
      const item = round.blower;
      blowerItem.visible = blowerGlow.visible = !!item;
      if (item) {
        blowerItem.position.set(
          item.x,
          0.15 + Math.sin(clock * 3) * 0.08,
          item.z,
        );
        blowerItem.rotation.y = clock * 1.4;
        blowerGlow.position.set(item.x, 0.04, item.z);
        blowerGlow.scale.setScalar(1 + Math.sin(clock * 5) * 0.12);
      }

      round.players.forEach((p, i) => {
        const who = people[i];
        const was = { x: who.avatar.position.x, z: who.avatar.position.z };
        who.avatar.position.set(p.x, 0, p.z);
        who.avatar.rotation.y = p.facing;
        who.ring.position.set(p.x, 0.04, p.z);
        who.pivot.position.set(p.x, 0, p.z);
        // A swing sweeps the rake from the right to the left, and the
        // critter leans into it.
        const swing = p.swing > 0 ? 1 - p.swing / 0.3 : 1;
        const sweep = p.swing > 0 ? 0.95 - swing * 1.9 : 0.25;
        who.pivot.rotation.y = p.facing + sweep;
        who.rake.rotation.x = p.swing > 0 ? 0.12 : 0.32;
        const blowing = p.blower > 0;
        who.rake.visible = !blowing;
        who.blower.visible = blowing;
        if (blowing) who.pivot.rotation.y = p.facing;
        const moved = Math.hypot(p.x - was.x, p.z - was.z);
        animateAvatar(who.avatar, { moveSpeed: dt > 0 ? moved / dt : 0 }, dt);
        if (p.blowing) {
          who.puffClock -= dt;
          if (who.puffClock <= 0) {
            who.puffClock = 0.05;
            const puff = new T.Mesh(puffGeometry, puffMaterial.clone());
            const spread = (Math.random() - 0.5) * BLOWER.arc * 1.2;
            const a = p.facing + spread;
            puff.position.set(
              p.x - Math.sin(p.facing) * 0.9,
              0.35,
              p.z - Math.cos(p.facing) * 0.9,
            );
            scene.add(puff);
            puffs.push({
              mesh: puff,
              vx: -Math.sin(a) * 5,
              vz: -Math.cos(a) * 5,
              age: 0,
            });
          }
        }
      });
      for (let k = puffs.length - 1; k >= 0; k--) {
        const puff = puffs[k];
        puff.age += dt;
        puff.mesh.position.x += puff.vx * dt;
        puff.mesh.position.z += puff.vz * dt;
        puff.mesh.scale.setScalar(1 + puff.age * 4);
        puff.mesh.material.opacity = Math.max(0, 0.45 - puff.age);
        if (puff.age > 0.45) {
          scene.remove(puff.mesh);
          puff.mesh.material.dispose();
          puffs.splice(k, 1);
        }
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const who of people) releaseAvatar(who.avatar);
      for (const puff of puffs) scene.remove(puff.mesh);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
