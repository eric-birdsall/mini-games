import * as T from "three";
import {
  CELL,
  DIRS,
  GRID,
  LEVEL,
  TRACK_WIDTH,
  cellCentre,
} from "../shared/racetrack.js";

const HALF = TRACK_WIDTH / 2;
const WALL = 0.09;
const BOARD = GRID * CELL;
const ORANGE = new T.Color("#ff7a1a");
const BLUE = new T.Color("#2f7cf6");
const DARK = new T.Color("#232323");
const WHITE = new T.Color("#f6f6f6");

// The track's cross-section, as (sideways, up) offsets from the centre line.
const PROFILE = [
  [-HALF - 0.04, WALL],
  [-HALF, WALL],
  [-HALF, 0],
  [HALF, 0],
  [HALF, WALL],
  [HALF + 0.04, WALL],
  [HALF + 0.04, -0.03],
  [-HALF - 0.04, -0.03],
];

export function createRacetrackScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#dfe9f2");
  scene.fog = new T.Fog("#dfe9f2", 45, 90);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 200);

  scene.add(new T.HemisphereLight("#ffffff", "#8a6a4a", 2.1));
  const sun = new T.DirectionalLight("#fff4dc", 2.4);
  sun.position.set(-8, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -16,
    right: 16,
    top: 16,
    bottom: -16,
    far: 60,
  });
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const materials = [];
  const mat = (color, extra = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    materials.push(m);
    return m;
  };

  // Wooden floor with a play rug on it: the build board.
  const floor = new T.Mesh(
    new T.PlaneGeometry(160, 160),
    mat("#c89a6a", { roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);
  const plankLines = [];
  for (let i = -40; i <= 40; i++)
    plankLines.push(-80, -0.015, i * 1.1, 80, -0.015, i * 1.1);
  const planks = new T.LineSegments(
    new T.BufferGeometry().setAttribute(
      "position",
      new T.Float32BufferAttribute(plankLines, 3),
    ),
    new T.LineBasicMaterial({ color: "#a87d52" }),
  );
  scene.add(planks);
  const rug = new T.Mesh(
    new T.PlaneGeometry(BOARD + 1.2, BOARD + 1.2),
    mat("#4d8f6a", { roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = -0.01;
  rug.receiveShadow = true;
  scene.add(rug);
  const gridLines = [];
  for (let i = 0; i <= GRID; i++) {
    const c = -BOARD / 2 + i * CELL;
    gridLines.push(c, 0, -BOARD / 2, c, 0, BOARD / 2);
    gridLines.push(-BOARD / 2, 0, c, BOARD / 2, 0, c);
  }
  const grid = new T.LineSegments(
    new T.BufferGeometry().setAttribute(
      "position",
      new T.Float32BufferAttribute(gridLines, 3),
    ),
    new T.LineBasicMaterial({
      color: "#7fc39a",
      transparent: true,
      opacity: 0.7,
    }),
  );
  scene.add(grid);

  // A few toys round the edge of the rug, for scale.
  const toys = new T.Group();
  const blockColours = ["#e94b4b", "#f5c542", "#4b8be9", "#62c46f"];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = BOARD / 2 + 3 + (i % 3);
    const size = 0.7 + (i % 2) * 0.3;
    const block = new T.Mesh(
      new T.BoxGeometry(size, size, size),
      mat(blockColours[i % 4]),
    );
    block.position.set(Math.cos(a) * r, size / 2, Math.sin(a) * r);
    block.rotation.y = a * 2;
    block.castShadow = block.receiveShadow = true;
    toys.add(block);
  }
  scene.add(toys);

  // ---------------------------------------------------------------- track

  const trackMaterial = mat("#ffffff", {
    vertexColors: true,
    roughness: 0.45,
    side: T.DoubleSide,
  });
  const ghostOk = mat("#5be37a", {
    transparent: true,
    opacity: 0.55,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const ghostBad = mat("#ff5a5a", {
    transparent: true,
    opacity: 0.45,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const pillarMaterial = mat("#d9dde3", { roughness: 0.5 });
  const boosterMaterial = mat("#ffd23f", { roughness: 0.4 });
  const tyreMaterial = mat("#1d1d1d", { roughness: 0.9 });
  const pillarGeometry = new T.CylinderGeometry(0.05, 0.07, 1, 8);
  pillarGeometry.translate(0, 0.5, 0);

  let track = new T.Group();
  scene.add(track);
  const ghost = new T.Group();
  scene.add(ghost);
  let boosters = [];

  // A ribbon of track along samples[from..to).
  function ribbon(samples, from, to, closed, colour) {
    const rings = [];
    for (let i = from; i < to; i++) rings.push(samples[i]);
    if (closed) rings.push(samples[from]);
    const positions = [];
    const colours = [];
    const index = [];
    const sides = PROFILE.length;
    rings.forEach((smp, r) => {
      const c = colour(smp);
      for (const [l, up] of PROFILE) {
        positions.push(
          smp.p[0] + smp.w[0] * l + smp.u[0] * up,
          smp.p[1] + smp.w[1] * l + smp.u[1] * up,
          smp.p[2] + smp.w[2] * l + smp.u[2] * up,
        );
        colours.push(c.r, c.g, c.b);
      }
      if (r === 0) return;
      for (let k = 0; k < sides; k++) {
        const a = (r - 1) * sides + k;
        const b = (r - 1) * sides + ((k + 1) % sides);
        index.push(a, a + sides, b, b, a + sides, b + sides);
      }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }

  function disposeGroup(group) {
    group.traverse((node) => {
      if (node.geometry && node.geometry !== pillarGeometry)
        node.geometry.dispose();
    });
    group.clear();
  }

  function checkerTexture() {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 16;
    const g = c.getContext("2d");
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  const checker = checkerTexture();
  const bannerMaterial = mat("#ffffff", { map: checker, side: T.DoubleSide });
  const postMaterial = mat("#e23b3b");

  function placeOn(object, smp) {
    const m = new T.Matrix4().makeBasis(
      new T.Vector3(...smp.w),
      new T.Vector3(...smp.u),
      new T.Vector3(...smp.t).negate(),
    );
    object.quaternion.setFromRotationMatrix(m);
    object.position.set(...smp.p);
  }

  function setTrack(path) {
    disposeGroup(track);
    boosters = [];
    if (!path || path.samples.length < 2) return;
    const { samples, closed } = path;
    const startEnd = samples.findIndex((s) => s.piece > 0);
    const geometry = ribbon(samples, 0, samples.length, closed, (smp) => {
      if (smp.type === "booster") return BLUE;
      if (smp.type === "start" && Math.abs(smp.s - 0.35) < 0.08)
        return Math.round(smp.s / 0.04) % 2 ? DARK : WHITE;
      return ORANGE;
    });
    const road = new T.Mesh(geometry, trackMaterial);
    road.castShadow = road.receiveShadow = true;
    track.add(road);

    // Supports under raised track.
    let last = -Infinity;
    for (const smp of samples) {
      if (smp.s - last < 1 || smp.ring || smp.u[1] < 0.85) continue;
      const height = smp.p[1] - 0.04;
      if (height < 0.1) continue;
      last = smp.s;
      const pillar = new T.Mesh(pillarGeometry, pillarMaterial);
      pillar.scale.y = height;
      pillar.position.set(smp.p[0], 0, smp.p[2]);
      pillar.castShadow = true;
      track.add(pillar);
    }

    // Booster housings over the middle of each booster piece.
    const byPiece = new Map();
    for (const smp of samples)
      if (smp.type === "booster") {
        if (!byPiece.has(smp.piece)) byPiece.set(smp.piece, []);
        byPiece.get(smp.piece).push(smp);
      }
    for (const list of byPiece.values()) {
      const mid = list[Math.floor(list.length / 2)];
      const housing = new T.Group();
      const top = new T.Mesh(
        new T.BoxGeometry(0.9, 0.12, 0.9),
        boosterMaterial,
      );
      top.position.y = 0.42;
      housing.add(top);
      for (const side of [-1, 1]) {
        const wall = new T.Mesh(
          new T.BoxGeometry(0.16, 0.42, 0.9),
          boosterMaterial,
        );
        wall.position.set(side * 0.37, 0.21, 0);
        housing.add(wall);
        const wheel = new T.Mesh(
          new T.CylinderGeometry(0.16, 0.16, 0.08, 16),
          tyreMaterial,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * (HALF - 0.02), 0.12, 0);
        housing.add(wheel);
        boosters.push(wheel);
      }
      housing.traverse((n) => (n.castShadow = !!n.isMesh));
      placeOn(housing, mid);
      track.add(housing);
    }

    // Start gate.
    const gate = new T.Group();
    for (const side of [-1, 1]) {
      const post = new T.Mesh(
        new T.CylinderGeometry(0.04, 0.04, 0.9, 8),
        postMaterial,
      );
      post.position.set(side * (HALF + 0.12), 0.45, 0);
      gate.add(post);
    }
    const banner = new T.Mesh(
      new T.PlaneGeometry(TRACK_WIDTH + 0.3, 0.2),
      bannerMaterial,
    );
    banner.position.y = 0.85;
    gate.add(banner);
    gate.traverse((n) => (n.castShadow = !!n.isMesh));
    placeOn(gate, samples[Math.max(0, Math.min(startEnd, 9))]);
    track.add(gate);
  }

  // A see-through preview of the next piece (samples of one piece).
  function setGhost(samples, ok) {
    disposeGroup(ghost);
    if (!samples?.length) return;
    const geometry = ribbon(samples, 0, samples.length, false, () => WHITE);
    ghost.add(new T.Mesh(geometry, ok ? ghostOk : ghostBad));
  }

  // The arrow at the open end, or under the cursor while picking a start.
  const arrow = new T.Group();
  const arrowMaterial = mat("#ffffff", {
    emissive: "#3b82f6",
    emissiveIntensity: 0.6,
  });
  const head = new T.Mesh(new T.ConeGeometry(0.28, 0.5, 4), arrowMaterial);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -0.35;
  arrow.add(head);
  const shaft = new T.Mesh(new T.BoxGeometry(0.14, 0.06, 0.5), arrowMaterial);
  shaft.position.z = 0.1;
  arrow.add(shaft);
  arrow.visible = false;
  scene.add(arrow);
  const tile = new T.Mesh(
    new T.PlaneGeometry(CELL * 0.94, CELL * 0.94),
    mat("#ffffff", { transparent: true, opacity: 0.35, depthWrite: false }),
  );
  tile.rotation.x = -Math.PI / 2;
  tile.visible = false;
  scene.add(tile);

  // at: {x, z, h, d} (an open end or a start spot) or null.
  function setMarker(at, picking) {
    arrow.visible = !!at;
    tile.visible = !!at && picking;
    if (!at) return;
    const [cx, cz] = cellCentre(at.x, at.z);
    const [dx, dz] = DIRS[at.d];
    const edge = picking ? 0 : CELL / 2;
    arrow.position.set(cx - dx * edge, at.h * LEVEL + 0.35, cz - dz * edge);
    arrow.rotation.y = Math.atan2(-dx, -dz);
    tile.position.set(cx, 0.01, cz);
  }

  // ------------------------------------------------------------------ car

  const car = new T.Group();
  const body = mat("#e3262f", { roughness: 0.3, metalness: 0.3 });
  const glass = mat("#1c2b44", { roughness: 0.15, metalness: 0.5 });
  const chrome = mat("#cfd6dd", { roughness: 0.2, metalness: 0.8 });
  const flame = mat("#ffb21d", { roughness: 0.3 });
  const part = (geometry, material, x, y, z) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    car.add(m);
    return m;
  };
  part(new T.BoxGeometry(0.26, 0.08, 0.52), body, 0, 0.09, 0);
  part(new T.BoxGeometry(0.22, 0.07, 0.22), glass, 0, 0.165, 0.03);
  part(new T.BoxGeometry(0.27, 0.02, 0.14), flame, 0, 0.134, -0.17);
  part(new T.BoxGeometry(0.26, 0.02, 0.06), body, 0, 0.19, 0.24);
  part(new T.BoxGeometry(0.03, 0.06, 0.03), body, -0.1, 0.15, 0.24);
  part(new T.BoxGeometry(0.03, 0.06, 0.03), body, 0.1, 0.15, 0.24);
  const wheels = [];
  for (const [x, z] of [
    [-0.13, -0.17],
    [0.13, -0.17],
    [-0.13, 0.17],
    [0.13, 0.17],
  ]) {
    const wheel = new T.Group();
    const tyre = new T.Mesh(
      new T.CylinderGeometry(0.055, 0.055, 0.05, 14),
      tyreMaterial,
    );
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    const hub = new T.Mesh(
      new T.CylinderGeometry(0.03, 0.03, 0.055, 10),
      chrome,
    );
    hub.rotation.z = Math.PI / 2;
    wheel.add(tyre, hub);
    wheel.position.set(x, 0.055, z);
    car.add(wheel);
    wheels.push(wheel);
  }
  car.visible = false;
  scene.add(car);
  const basis = new T.Matrix4();
  const vt = new T.Vector3();
  const vu = new T.Vector3();
  const vw = new T.Vector3();

  // pose: { p, t, u } or null. roll: wheel turn (radians).
  function setCar(pose, roll = 0) {
    car.visible = !!pose;
    if (!pose) return;
    vt.set(...pose.t);
    vu.set(...pose.u);
    vw.crossVectors(vu, vt).normalize();
    // The car's nose is +z in its own frame.
    basis.makeBasis(vw, vu, vt);
    car.quaternion.setFromRotationMatrix(basis);
    car.position.set(...pose.p);
    for (const wheel of wheels) wheel.rotation.x = roll;
  }

  // --------------------------------------------------------------- camera

  const view = {
    target: new T.Vector3(0, 0, 0),
    yaw: 0.6,
    pitch: 0.85,
    distance: 28,
  };
  const goal = { target: new T.Vector3(), distance: 28 };
  goal.target.copy(view.target);
  let follow = null;

  function orbit(dx, dy) {
    view.yaw -= dx * 0.008;
    view.pitch = Math.max(0.15, Math.min(1.45, view.pitch + dy * 0.006));
  }
  function zoom(factor) {
    goal.distance = Math.max(6, Math.min(70, goal.distance * factor));
  }
  // Frame a box of points ([[x, y, z], ...]) so it all fits.
  function frame(points) {
    if (!points.length) {
      goal.target.set(0, 0, 0);
      goal.distance = 28;
      return;
    }
    const box = new T.Box3();
    for (const p of points) box.expandByPoint(vt.set(...p));
    box.expandByPoint(vt.set(box.min.x, 0, box.min.z));
    const sphere = box.getBoundingSphere(new T.Sphere());
    goal.target.copy(sphere.center);
    const fov = T.MathUtils.degToRad(camera.fov);
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    goal.distance = Math.max(8, (sphere.radius + 1) / Math.sin(fit / 2));
  }

  const size = new T.Vector2();
  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const hit = new T.Vector3();
  let clock = 0;

  return {
    setTrack,
    setGhost,
    setMarker,
    setCar,
    orbit,
    zoom,
    frame,
    // Follow a point (the car) instead of the framed course, or null.
    follow(point) {
      follow = point;
    },
    // The board cell under a click or tap, or null.
    pick(clientX, clientY) {
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const x = Math.floor(hit.x / CELL + GRID / 2);
      const z = Math.floor(hit.z / CELL + GRID / 2);
      if (x < 0 || z < 0 || x >= GRID || z >= GRID) return null;
      return { x, z };
    },
    // spin: degrees per second of slow automatic orbit.
    draw(dt, spin = 0) {
      if (!resize()) return;
      clock += dt;
      view.yaw += T.MathUtils.degToRad(spin) * dt;
      const ease = 1 - Math.exp(-dt * 5);
      if (follow) {
        view.target.lerp(vt.set(...follow), 1 - Math.exp(-dt * 8));
        view.distance += (Math.min(goal.distance, 9) - view.distance) * ease;
      } else {
        view.target.lerp(goal.target, ease);
        view.distance += (goal.distance - view.distance) * ease;
      }
      const flat = Math.cos(view.pitch) * view.distance;
      camera.position.set(
        view.target.x + Math.sin(view.yaw) * flat,
        view.target.y + Math.sin(view.pitch) * view.distance,
        view.target.z + Math.cos(view.yaw) * flat,
      );
      camera.lookAt(view.target);
      arrow.position.y += Math.sin(clock * 4) * 0.004;
      for (const wheel of boosters) wheel.rotation.x -= dt * 30;
      renderer.render(scene, camera);
    },
    dispose() {
      disposeGroup(track);
      disposeGroup(ghost);
      scene.traverse((node) => node.geometry?.dispose());
      pillarGeometry.dispose();
      for (const m of materials) m.dispose();
      checker.dispose();
      planks.material.dispose();
      grid.material.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
