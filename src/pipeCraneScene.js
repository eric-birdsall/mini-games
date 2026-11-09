import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { DIRS, openings, xyOf } from "../shared/pipeCrane.js";

// A building site seen from the front and above. The grid of cells sits on
// the ground (y = 0); trench cells are dug down to FLOOR. Pipes lie in the
// trenches, the pipe yard (stacks of each piece) is in front of the site,
// and a crawler crane at the back swings its boom over to wherever the hook
// is going. Pipes are see-through so the water shows as it fills them.
export const CELL = 2;
const FLOOR = -0.7;
const PIPE_R = 0.3;
const PIPE_Y = FLOOR + PIPE_R + 0.04;
const HOOK_Y = 3.6;
const HANG = 1.25;
const BOOM_SLOPE = 0.32;
const YARD_GAP = 2.7;

const DIRT = "#c98d55";
const DIRT_DARK = "#a86d3d";
const TRENCH = "#7c4f2c";
const PIPE = "#9bd84e";
const WATER = "#3aa2ff";
const CRANE = "#f2c230";
const END_COLORS = ["#3a7bd5", "#ff8a2a", "#a46bff"];
const END_LETTERS = ["A", "B", "C"];

export function createPipeCraneScene(canvas, opts) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3f5");
  const camera = new T.PerspectiveCamera(36, 1, 0.5, 300);

  scene.add(new T.HemisphereLight("#fff6e0", "#8a6040", 1.7));
  const sun = new T.DirectionalLight("#fff1d0", 2.4);
  sun.position.set(-10, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -24,
    right: 24,
    top: 24,
    bottom: -24,
    near: 1,
    far: 80,
  });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const mats = new Map();
  const mat = (color, roughness = 0.85, extra = {}) => {
    const key = `${color}/${roughness}/${JSON.stringify(extra)}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshStandardMaterial({ color, roughness, ...extra }));
    return mats.get(key);
  };
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const unitCyl = new T.CylinderGeometry(1, 1, 1, 18);
  const ball = new T.SphereGeometry(1, 18, 12);
  const blob = new T.IcosahedronGeometry(1, 0);
  const add = (geometry, material, x, y, z, parent = scene) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z, parent) => {
    const m = add(unitBox, material, x, y, z, parent);
    m.scale.set(w, h, d);
    return m;
  };
  // A cylinder lying along direction `dir` (0..3) from local (0,0,0).
  const pipeMat = new T.MeshStandardMaterial({
    color: PIPE,
    roughness: 0.35,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const pipeSolid = mat(PIPE, 0.4);
  const waterMat = new T.MeshStandardMaterial({
    color: WATER,
    roughness: 0.15,
    emissive: "#1a6fe8",
    emissiveIntensity: 0.9,
  });
  // Water glows a little and never sits in the pipe's own shadow.
  const wet = (m) => {
    m.castShadow = m.receiveShadow = false;
    return m;
  };

  function letterSprite(letter, color) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = color;
    g.font = "900 78px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letter, 64, 70);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(
      new T.SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.renderOrder = 5;
    sprite.scale.setScalar(1.3);
    return sprite;
  }

  // --- Site -----------------------------------------------------------
  // Everything belonging to the current site, rebuilt on setSite.
  let siteGroup = new T.Group();
  scene.add(siteGroup);
  let site = null;
  let ends = [];
  let yardSlots = [];
  let pipeMeshes = new Map();
  let bounds = [];
  let cranePos = new T.Vector3();
  const drops = new Map();

  const at = (x, y) =>
    new T.Vector3(
      (x - (site.cols - 1) / 2) * CELL,
      0,
      (y - (site.rows - 1) / 2) * CELL,
    );
  const cellCentre = (cell) => at(...xyOf(site, cell));

  // Big outer ground, cut around a frame one cell wide round the grid.
  const outer = new T.Group();
  scene.add(outer);

  function buildGround() {
    const g = siteGroup;
    const tile = (x, y, dug) => {
      const p = at(x, y);
      const top = dug ? FLOOR : 0;
      const m = box(
        CELL,
        4 + top,
        CELL,
        mat(dug ? TRENCH : (x + y) % 2 ? DIRT : "#c4874f", 0.95),
        p.x,
        (top - 4) / 2,
        p.z,
        g,
      );
      m.scale.y = 4 + top;
      m.position.y = top - (4 + top) / 2;
      // A few pebbles on the dirt.
      if (!dug && (x * 7 + y * 13) % 3 === 0) {
        const r = 0.12 + ((x * 3 + y) % 3) * 0.05;
        add(
          blob,
          mat("#a99a88", 0.9),
          p.x + 0.5,
          r * 0.5,
          p.z - 0.3,
          g,
        ).scale.setScalar(r);
      }
      return m;
    };
    const stubCells = new Set(
      ends.map((e) => {
        const [x, y] = xyOf(site, e.cell);
        return `${x + DIRS[e.dir][0]},${y + DIRS[e.dir][1]}`;
      }),
    );
    for (let y = -1; y <= site.rows; y++)
      for (let x = -1; x <= site.cols; x++) {
        const inside = x >= 0 && y >= 0 && x < site.cols && y < site.rows;
        const dug = inside
          ? site.trench.has(y * site.cols + x)
          : stubCells.has(`${x},${y}`);
        tile(x, y, dug);
        // Heaped dirt along trench edges.
        if (dug && inside)
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0];
            const ny = y + DIRS[d][1];
            const nIn = nx >= 0 && ny >= 0 && nx < site.cols && ny < site.rows;
            const nDug = nIn
              ? site.trench.has(ny * site.cols + nx)
              : stubCells.has(`${nx},${ny}`);
            if (nDug) continue;
            const p = at(x, y);
            const along = d % 2 === 0;
            const m = add(
              blob,
              mat(DIRT_DARK, 0.95),
              p.x + DIRS[d][0] * (CELL / 2 + 0.25),
              0.05,
              p.z + DIRS[d][1] * (CELL / 2 + 0.25),
              g,
            );
            m.scale.set(along ? 0.9 : 0.32, 0.22, along ? 0.32 : 0.9);
          }
      }
    const w = (site.cols + 2) * CELL;
    const h = (site.rows + 2) * CELL;
    const ground = mat(DIRT, 0.95);
    // Four big slabs around the frame.
    box(200, 4, 100, ground, 0, -2, -h / 2 - 50, g);
    box(200, 4, 100, ground, 0, -2, h / 2 + 50, g);
    box(100, 4, h, ground, -w / 2 - 50, -2, 0, g);
    box(100, 4, h, ground, w / 2 + 50, -2, 0, g);
  }

  // A pipe piece: see-through arms from the middle to each opening, a
  // joint in the middle and a collar at each end, plus the water inside.
  function makePipe(piece, ghost = false) {
    const g = new T.Group();
    const material = ghost ? pipeSolid : pipeMat;
    const joint = add(ball, material, 0, 0, 0, g);
    joint.scale.setScalar(PIPE_R * 1.18);
    joint.renderOrder = 2;
    if (!ghost) joint.castShadow = false;
    const water = { arms: [], joint: null };
    if (!ghost) {
      water.joint = wet(add(ball, waterMat, 0, 0, 0, g));
      water.joint.scale.setScalar(0);
    }
    for (const d of openings(piece)) {
      const arm = add(unitCyl, material, 0, 0, 0, g);
      const [dx, dz] = DIRS[d];
      arm.rotation.set(dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0);
      arm.scale.set(PIPE_R, CELL / 2, PIPE_R);
      arm.position.set((dx * CELL) / 4, 0, (dz * CELL) / 4);
      arm.renderOrder = 2;
      // See-through pipe casts no shadow onto the water inside it.
      if (!ghost) arm.castShadow = false;
      const collar = add(unitCyl, mat("#6fae2c", 0.4), 0, 0, 0, g);
      collar.rotation.copy(arm.rotation);
      collar.scale.set(PIPE_R * 1.22, 0.16, PIPE_R * 1.22);
      collar.position.set(dx * (CELL / 2 - 0.1), 0, dz * (CELL / 2 - 0.1));
      if (!ghost) {
        const w = wet(add(unitCyl, waterMat, 0, 0, 0, g));
        w.rotation.copy(arm.rotation);
        w.scale.set(PIPE_R * 0.72, 0.001, PIPE_R * 0.72);
        w.visible = false;
        water.arms.push({ d, mesh: w });
      }
    }
    g.userData.water = water;
    return g;
  }

  // Fill the water in a pipe: in through `from` up to the middle for the
  // first half of t, then out through the other arms.
  function fillPipe(g, from, t) {
    const { arms, joint } = g.userData.water;
    for (const { d, mesh } of arms) {
      const [dx, dz] = DIRS[d];
      const entering = d === from;
      const f = entering
        ? Math.min(1, t / 0.5)
        : Math.max(0, Math.min(1, (t - 0.5) / 0.5));
      mesh.visible = f > 0.001;
      const len = (CELL / 2) * f;
      mesh.scale.y = Math.max(0.001, len);
      // Entering water starts at the outer end; leaving water at the middle.
      const mid = entering ? CELL / 2 - len / 2 : len / 2;
      mesh.position.set(dx * mid, 0, dz * mid);
    }
    joint.scale.setScalar(t >= 0.5 ? PIPE_R * 0.95 : 0);
  }

  function buildEnds() {
    const g = siteGroup;
    ends.forEach((e, i) => {
      const [dx, dz] = DIRS[e.dir];
      const c = cellCentre(e.cell);
      const out = c.clone().add(new T.Vector3(dx * CELL, 0, dz * CELL));
      const group = new T.Group();
      group.position.set(out.x, PIPE_Y, out.z);
      g.add(group);
      // The stub runs from the edge of the site off into the distance and
      // up out of the ground.
      const metal = mat(i === 0 ? "#8fa3b8" : "#b8b8b0", 0.45, {
        metalness: 0.3,
      });
      const len = CELL * 1.4;
      const pipe = add(unitCyl, metal, 0, 0, 0, group);
      pipe.rotation.set(dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0);
      pipe.scale.set(PIPE_R * 1.1, len, PIPE_R * 1.1);
      pipe.position.set((dx * (len - CELL)) / 2, 0, (dz * (len - CELL)) / 2);
      const water = add(unitCyl, waterMat, 0, 0, 0, group);
      water.rotation.copy(pipe.rotation);
      water.scale.set(PIPE_R * 0.75, len * 1.001, PIPE_R * 0.75);
      water.position.copy(pipe.position);
      water.visible = false;
      // A riser at the far end, up above the ground.
      const far = new T.Vector3(
        dx * (len - CELL / 2),
        0,
        dz * (len - CELL / 2),
      );
      const riser = add(unitCyl, metal, far.x, -FLOOR / 2 + 0.25, far.z, group);
      riser.scale.set(PIPE_R * 1.1, -FLOOR + 1.1, PIPE_R * 1.1);
      const cap = add(
        unitCyl,
        mat(END_COLORS[i], 0.5),
        far.x,
        -FLOOR + 0.85,
        far.z,
        group,
      );
      cap.scale.set(PIPE_R * 1.45, 0.22, PIPE_R * 1.45);
      let wheel = null;
      if (i === 0) {
        // The valve wheel on pipe A.
        wheel = new T.Group();
        wheel.position.set(far.x, -FLOOR + 1.25, far.z);
        group.add(wheel);
        const rim = add(
          new T.TorusGeometry(0.55, 0.08, 8, 24),
          mat("#e0453a", 0.5),
          0,
          0,
          0,
          wheel,
        );
        rim.rotation.x = Math.PI / 2;
        for (let k = 0; k < 2; k++) {
          const spoke = box(
            1.1,
            0.07,
            0.07,
            mat("#e0453a", 0.5),
            0,
            0,
            0,
            wheel,
          );
          spoke.rotation.y = (k * Math.PI) / 2;
        }
        add(unitCyl, mat("#e0453a", 0.5), 0, -0.2, 0, wheel).scale.set(
          0.1,
          0.4,
          0.1,
        );
      }
      const sign = letterSprite(END_LETTERS[i], END_COLORS[i]);
      sign.position.set(far.x, -FLOOR + 2.4, far.z);
      group.add(sign);
      // Water spurting out of a filled outlet.
      const drops = [];
      if (i > 0)
        for (let k = 0; k < 14; k++) {
          const m = add(ball, waterMat, far.x, -FLOOR + 1, far.z, group);
          m.scale.setScalar(0.13);
          m.visible = false;
          drops.push({ m, phase: k / 14 });
        }
      e.view = { group, water, wheel, far, drops, sign };
      bounds.push(group.position.clone().add(far).setY(2));
    });
  }

  function buildYard(types) {
    const g = siteGroup;
    // Stacks in a row in front of the site, from its left edge. Outlets
    // only leave the bottom edge on the right half, but if one would meet
    // a stack the yard moves further forward.
    const xs = types.map((_, i) => at(0, 0).x + i * YARD_GAP);
    const bottoms = site.outlets
      .filter((o) => o.dir === 2)
      .map((o) => cellCentre(o.cell).x);
    const clash = xs.some((x) => bottoms.some((b) => Math.abs(x - b) < 1.8));
    const z = ((site.rows - 1) / 2) * CELL + CELL * (clash ? 3.3 : 2.4);
    yardSlots = types.map((type, i) => {
      const x = xs[i];
      const slot = new T.Group();
      slot.position.set(x, 0, z);
      g.add(slot);
      // A wooden pallet with three of the piece stacked on it.
      const wood = mat("#c9a26b", 0.9);
      for (const dz of [-0.6, 0, 0.6])
        box(1.8, 0.12, 0.35, wood, 0, 0.28, dz, slot);
      for (const dx of [-0.75, 0, 0.75])
        box(0.25, 0.22, 1.6, wood, dx, 0.11, 0, slot);
      for (let k = 0; k < 3; k++) {
        const p = makePipe({ type, rot: type === "straight" ? 1 : 0 }, true);
        p.scale.setScalar(0.62);
        p.position.set(0, 0.55 + k * 0.42, 0);
        p.rotation.y = k * 0.18 - 0.18;
        slot.add(p);
      }
      const ring = add(
        new T.RingGeometry(1.25, 1.42, 40),
        new T.MeshBasicMaterial({
          color: "#fff3a0",
          transparent: true,
          opacity: 0,
        }),
        0,
        0.04,
        0,
        slot,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = ring.receiveShadow = false;
      bounds.push(new T.Vector3(x, 1.5, z + 1));
      return { type, x, z, slot, ring };
    });
  }

  // --- Crane ------------------------------------------------------------
  const crane = new T.Group();
  scene.add(crane);
  const turret = new T.Group();
  crane.add(turret);
  const yellow = mat(CRANE, 0.55);
  const dark = mat("#3b3a3f", 0.7);
  for (const side of [-1, 1]) {
    box(3.6, 0.8, 0.9, dark, 0, 0.4, side * 1.2, crane);
    for (let k = 0; k < 4; k++) {
      const wheel = add(
        unitCyl,
        mat("#6b6c75", 0.5),
        -1.3 + k * 0.87,
        0.4,
        side * 1.2,
        crane,
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.scale.set(0.32, 0.95, 0.32);
    }
  }
  box(3.2, 0.5, 2, dark, 0, 0.95, 0, crane);
  box(2.6, 1.3, 2.2, yellow, -0.3, 1.85, 0, turret);
  box(1.2, 1.2, 1.1, yellow, 0.9, 2.6, -0.5, turret);
  const glass = box(
    0.06,
    0.7,
    0.8,
    mat("#bfe8ff", 0.1),
    1.52,
    2.75,
    -0.5,
    turret,
  );
  glass.material = new T.MeshStandardMaterial({
    color: "#bfe8ff",
    roughness: 0.1,
    transparent: true,
    opacity: 0.4,
  });
  box(1, 0.9, 1.9, mat("#e0a020", 0.6), -1.6, 1.75, 0, turret);
  const driver = createAvatar("attacker", opts.avatar, false);
  driver.scale.setScalar(0.42);
  driver.position.set(0.95, 2.05, -0.5);
  driver.rotation.y = Math.PI / 2;
  turret.add(driver);
  const PIVOT = new T.Vector3(1.1, 2.4, 0);
  const boom = new T.Group();
  boom.position.copy(PIVOT);
  turret.add(boom);
  // Lattice boom: two rails and rungs, built 1 long and stretched.
  const boomInner = new T.Group();
  boom.add(boomInner);
  for (const s of [-0.28, 0.28]) {
    box(1, 0.12, 0.12, yellow, 0.5, 0.2, s, boomInner);
    box(1, 0.12, 0.12, yellow, 0.5, -0.2, s, boomInner);
  }
  const rungs = [];
  for (let k = 0; k < 12; k++) {
    const r = box(0.06, 0.4, 0.6, yellow, (k + 0.5) / 12, 0, 0, boomInner);
    r.rotation.x = 0.0;
    rungs.push(r);
  }
  const cable = add(unitCyl, dark, 0, 0, 0);
  cable.castShadow = false;
  const hook = new T.Group();
  scene.add(hook);
  box(0.55, 0.45, 0.4, yellow, 0, 0, 0, hook);
  const hookCurve = add(
    new T.TorusGeometry(0.2, 0.06, 8, 16, Math.PI * 1.4),
    dark,
    0,
    -0.42,
    0,
    hook,
  );
  hookCurve.rotation.z = Math.PI * 0.8;
  // What's hanging from the hook.
  const heldGroup = new T.Group();
  scene.add(heldGroup);
  let heldKey = "";
  let heldMesh = null;
  const slings = add(unitCyl, dark, 0, 0, 0);
  slings.castShadow = false;

  // Where the hook is (and is heading).
  const hookAt = new T.Vector3(0, HOOK_Y, 0);
  let hookDip = 0;

  // Cursor: an outline square on the targeted cell or yard slot.
  const cursor = new T.Mesh(
    new T.RingGeometry(1.15, 1.32, 4, 1),
    new T.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  cursor.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  cursor.renderOrder = 4;
  scene.add(cursor);

  // --- Spills and splashes ---------------------------------------------
  const puddle = add(
    new T.CircleGeometry(1, 32),
    new T.MeshStandardMaterial({
      color: WATER,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
    }),
    0,
    0,
    0,
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.visible = false;
  let puddleAge = 0;
  const splashes = [];
  function splash(p, n = 18, up = 4) {
    for (let i = 0; i < n; i++) {
      const m = add(ball, waterMat, p.x, p.y, p.z);
      m.scale.setScalar(0.08 + Math.random() * 0.08);
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      splashes.push({
        m,
        v: new T.Vector3(
          Math.cos(a) * s,
          up * (0.6 + Math.random() * 0.6),
          Math.sin(a) * s,
        ),
        age: 0,
      });
    }
  }
  function dust(p) {
    for (let i = 0; i < 10; i++) {
      const m = add(blob, mat("#d8b48a", 1), p.x, p.y, p.z);
      m.scale.setScalar(0.12 + Math.random() * 0.1);
      const a = (i / 10) * Math.PI * 2;
      splashes.push({
        m,
        v: new T.Vector3(Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2),
        age: 0,
        dust: true,
      });
    }
  }

  // --- Camera -------------------------------------------------------------
  const size = new T.Vector2();
  const look = new T.Vector3();
  let lastAspect = 0;
  function fit(force) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y)
      renderer.setSize(width, height, false);
    const aspect = width / height;
    if (!force && aspect === lastAspect) return true;
    lastAspect = aspect;
    camera.aspect = aspect;
    // Look down at the site from the front at a fixed angle; back off
    // until the site, the yard and the end pipes all fit.
    const box3 = new T.Box3().setFromPoints(bounds);
    box3.getCenter(look);
    look.y = 0;
    const dir = new T.Vector3(0, Math.sin(1.02), Math.cos(1.02));
    const v = new T.Vector3();
    // The top of the screen keeps room for the timer bar.
    const TOP = 0.8;
    const BOTTOM = -0.94;
    const place = (dist) => {
      camera.position.copy(look).addScaledVector(dir, dist);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      let low = Infinity;
      let high = -Infinity;
      let wide = 0;
      for (const p of bounds) {
        v.copy(p).project(camera);
        low = Math.min(low, v.y);
        high = Math.max(high, v.y);
        wide = Math.max(wide, Math.abs(v.x));
      }
      return { low, high, wide };
    };
    // Back off until it all fits, then slide the view so the site sits in
    // the middle of the space, and fit again.
    let dist = 10;
    for (let pass = 0; pass < 4; pass++) {
      dist = 6;
      let e = place(dist);
      for (
        let i = 0;
        i < 120 && (e.wide > 0.94 || e.high > TOP || e.low < BOTTOM);
        i++
      )
        e = place((dist *= 1.04));
      const off = (e.high + e.low) / 2 - (TOP + BOTTOM) / 2;
      if (Math.abs(off) < 0.02) break;
      const halfHeight = dist * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      look.z -= (off * halfHeight) / Math.sin(1.02);
    }
    return true;
  }

  // --- Picking ----------------------------------------------------------
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -FLOOR * 0.4);
  const hit = new T.Vector3();
  function groundAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  // --- Drawing ------------------------------------------------------------
  let clock = 0;

  function syncPipes(job) {
    for (const [cell, mesh] of pipeMeshes) {
      const p = job.pipes.get(cell);
      if (!p || mesh.userData.key !== `${p.type}/${p.rot}`) {
        siteGroup.remove(mesh);
        pipeMeshes.delete(cell);
      }
    }
    for (const [cell, p] of job.pipes) {
      if (pipeMeshes.has(cell)) continue;
      const mesh = makePipe(p);
      mesh.userData.key = `${p.type}/${p.rot}`;
      const c = cellCentre(cell);
      mesh.position.set(c.x, PIPE_Y, c.z);
      siteGroup.add(mesh);
      pipeMeshes.set(cell, mesh);
    }
  }

  const tmp = new T.Vector3();
  return {
    CELL,
    // A new site: trenches, end pipes and the yard of `types`.
    setSite(newSite, types) {
      scene.remove(siteGroup);
      siteGroup.traverse((n) => {
        if (n.geometry && ![unitBox, unitCyl, ball, blob].includes(n.geometry))
          n.geometry.dispose();
        if (n.material?.map) {
          n.material.map.dispose();
          n.material.dispose();
        }
      });
      siteGroup = new T.Group();
      scene.add(siteGroup);
      site = newSite;
      ends = [
        { ...site.source, view: null },
        ...site.outlets.map((o) => ({ ...o, view: null })),
      ];
      pipeMeshes = new Map();
      drops.clear();
      bounds = [];
      for (const [x, y] of [
        [-1, -1],
        [site.cols, -1],
        [-1, site.rows],
        [site.cols, site.rows],
      ])
        bounds.push(at(x, y));
      buildGround();
      buildEnds();
      buildYard(types);
      // The crane at the back right, facing the site.
      cranePos = at(site.cols + 0.6, -2.2);
      crane.position.copy(cranePos);
      crane.rotation.y = 0;
      bounds.push(cranePos.clone().setY(4.4));
      puddle.visible = false;
      for (const s of splashes) scene.remove(s.m);
      splashes.length = 0;
      hookAt.set(cranePos.x - 4, HOOK_Y, cranePos.z + 4);
      fit(true);
    },
    // Where a screen point lands: { cell } on the site, { slot } in the
    // yard, plus the ground point for dragging.
    pick(clientX, clientY) {
      const p = groundAt(clientX, clientY);
      if (!p || !site) return null;
      for (let i = 0; i < yardSlots.length; i++) {
        const s = yardSlots[i];
        if (
          Math.abs(p.x - s.x) < YARD_GAP / 2 &&
          Math.abs(p.z - s.z) < CELL * 0.9
        )
          return { slot: i, point: p };
      }
      const x = Math.round(p.x / CELL + (site.cols - 1) / 2);
      const y = Math.round(p.z / CELL + (site.rows - 1) / 2);
      if (x >= 0 && y >= 0 && x < site.cols && y < site.rows)
        return { cell: y * site.cols + x, point: p };
      return { point: p };
    },
    cellPoint: (cell) => cellCentre(cell),
    slotPoint: (i) => new T.Vector3(yardSlots[i].x, 0, yardSlots[i].z),
    // A pipe was just lowered into `cell`.
    dropped(cell) {
      drops.set(cell, 0);
      hookDip = 1;
      dust(cellCentre(cell).setY(FLOOR + 0.2));
    },
    spilled(spill) {
      if (!spill || spill.closed) return;
      const c = cellCentre(spill.cell);
      const d = spill.dir ?? spill.from;
      if (d !== undefined)
        c.add(
          new T.Vector3(DIRS[d][0], 0, DIRS[d][1]).multiplyScalar(CELL / 2),
        );
      puddle.position.set(c.x, FLOOR + 0.06, c.z);
      puddle.visible = true;
      puddle.scale.setScalar(0.01);
      puddleAge = 0;
      splash(c.clone().setY(PIPE_Y), 30, 5);
    },
    // state: { job, hook: Vector3 target (x, z), held: piece|null,
    //   cursor: { cell } | { slot } | null, cursorOk, valve: 0..1 turned }
    draw(dt, state) {
      if (!site || !fit()) return;
      clock += dt;
      const { job } = state;
      syncPipes(job);

      // Pipes dropping into place, and water inside them.
      for (const [cell, mesh] of pipeMeshes) {
        const c = cellCentre(cell);
        let y = PIPE_Y;
        if (drops.has(cell)) {
          const t = drops.get(cell) + dt;
          drops.set(cell, t);
          const k = Math.min(1, t / 0.28);
          y += (1 - k) * (1 - k) * (HOOK_Y - HANG - PIPE_Y);
          if (k >= 1) drops.delete(cell);
        }
        mesh.position.set(c.x, y, c.z);
        const w = job.water.get(cell);
        fillPipe(mesh, w ? w.from : -1, w ? w.t : 0);
      }

      // End pipes: water in A once the valve opens, outlets once filled.
      ends.forEach((e, i) => {
        const v = e.view;
        if (!v) return;
        const full = i === 0 ? job.flowing : job.filled.has(i - 1);
        v.water.visible = full;
        if (v.wheel) v.wheel.rotation.y = -(state.valve || 0) * Math.PI * 4;
        v.sign.scale.setScalar(
          1.3 + (full && i > 0 ? Math.sin(clock * 8) * 0.08 : 0),
        );
        for (const drop of v.drops) {
          drop.m.visible = full;
          if (!full) continue;
          const t = (clock * 1.2 + drop.phase) % 1;
          const a = drop.phase * Math.PI * 2;
          drop.m.position.set(
            v.far.x + Math.cos(a) * t * 0.9,
            -FLOOR + 1 + t * 2.4 - t * t * 2.6,
            v.far.z + Math.sin(a) * t * 0.9,
          );
        }
      });

      // Yard slots glow when targeted.
      yardSlots.forEach((s, i) => {
        const on = state.cursor?.slot === i;
        s.ring.material.opacity = on ? 0.95 : 0;
        s.slot.position.y = on ? Math.sin(clock * 6) * 0.04 : 0;
      });

      // The hook glides to its target; the crane turns and its boom
      // reaches to sit over it.
      const target = state.hook;
      const k = Math.min(1, dt * 7);
      hookAt.x += (target.x - hookAt.x) * k;
      hookAt.z += (target.z - hookAt.z) * k;
      hookDip = Math.max(0, hookDip - dt * 3);
      const hookY = HOOK_Y - Math.sin(hookDip * Math.PI) * 0.9;
      hook.position.set(hookAt.x, hookY, hookAt.z);
      crane.updateMatrixWorld();
      const yaw = Math.atan2(-(hookAt.z - cranePos.z), hookAt.x - cranePos.x);
      turret.rotation.y += (yaw - turret.rotation.y) * Math.min(1, dt * 10);
      turret.updateMatrixWorld();
      const pivot = boom.getWorldPosition(tmp).clone();
      const flat = Math.hypot(hookAt.x - pivot.x, hookAt.z - pivot.z);
      const tipY = Math.max(hookY + 1.8, pivot.y + flat * BOOM_SLOPE);
      const length = Math.hypot(flat, tipY - pivot.y);
      boom.rotation.set(0, 0, Math.atan2(tipY - pivot.y, flat));
      // The turret faces the hook, so the boom just needs length.
      boomInner.scale.set(length, 1, 1);
      rungs.forEach((r) => (r.scale.x = 0.06 / length));
      const tip = new T.Vector3(hookAt.x, tipY, hookAt.z);
      const cableLen = tip.y - (hookY + 0.22);
      cable.position.set(tip.x, hookY + 0.22 + cableLen / 2, tip.z);
      cable.scale.set(0.035, cableLen, 0.035);

      // The held pipe swings gently under the hook.
      const held = state.held;
      const key = held ? `${held.type}/${held.rot}` : "";
      if (key !== heldKey) {
        if (heldMesh) heldGroup.remove(heldMesh);
        heldMesh = held ? makePipe(held, true) : null;
        if (heldMesh) heldGroup.add(heldMesh);
        heldKey = key;
      }
      slings.visible = !!heldMesh;
      if (heldMesh) {
        heldGroup.position.set(
          hookAt.x + Math.sin(clock * 2.3) * 0.05,
          hookY - HANG,
          hookAt.z + Math.cos(clock * 1.9) * 0.05,
        );
        slings.position.set(hookAt.x, hookY - HANG / 2 - 0.2, hookAt.z);
        slings.scale.set(0.025, HANG - 0.4, 0.025);
      }

      // Cursor square.
      const cur = state.cursor;
      cursor.visible =
        !!cur && (cur.cell !== undefined || cur.slot !== undefined);
      if (cursor.visible) {
        const p =
          cur.slot !== undefined
            ? new T.Vector3(yardSlots[cur.slot].x, 0.08, yardSlots[cur.slot].z)
            : cellCentre(cur.cell).setY(
                site.trench.has(cur.cell) ? FLOOR + 0.05 : 0.05,
              );
        cursor.position.copy(p);
        cursor.material.color.set(
          state.cursorOk === false ? "#ff8a7a" : "#ffffff",
        );
        cursor.material.opacity = 0.65 + Math.sin(clock * 6) * 0.25;
      }

      // Puddle spreading from a spill.
      if (puddle.visible) {
        puddleAge += dt;
        puddle.scale.setScalar(Math.min(2.2, 0.3 + puddleAge * 1.4));
        if (Math.random() < dt * 14)
          splash(puddle.position.clone().setY(PIPE_Y), 2, 3);
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.age += dt;
        s.v.y -= 12 * dt;
        s.m.position.addScaledVector(s.v, dt);
        if (s.dust) s.m.scale.multiplyScalar(1 - dt * 1.5);
        if (s.age > 1.2 || s.m.position.y < FLOOR) {
          scene.remove(s.m);
          splashes.splice(i, 1);
        }
      }
      animateAvatar(driver, { moveSpeed: 0 }, dt);
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(driver);
      scene.traverse((n) => {
        if (n.geometry) n.geometry.dispose?.();
        if (n.material?.map) n.material.map.dispose();
      });
      for (const m of mats.values()) m.dispose();
      pipeMat.dispose();
      waterMat.dispose();
      renderer.dispose();
    },
  };
}
