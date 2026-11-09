import * as T from "three";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import {
  CAR_RADIUS,
  RAMP_END,
  RAMP_START,
  RIDE_HEIGHT,
  TABLE,
  TRACK_LENGTH,
  TRACK_WIDTH,
  rampHalfWidth,
  rampY,
  trackPoint,
} from "../shared/backyardFling.js";

// Loop & Glide's stunt track in the same fenced backyard, except that after
// the loop it opens out into a wide ramp, and beyond the ramp stands a big
// picnic table with structures of wooden toy blocks on it. The car drives toward +z; a chase
// camera behind it looks down the yard, so world +x is screen left.

const BLOCK_TONES = ["#f0cf98", "#e2b277", "#cf9558", "#d9493a"];

export function createBackyardFlingScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bce5f4");
  scene.fog = new T.Fog("#bce5f4", 65, 135);
  const camera = new T.PerspectiveCamera(55, 1, 0.1, 140);
  scene.add(new T.HemisphereLight("#ecf8ff", "#7a7951", 1.9));
  const sun = new T.DirectionalLight("#fff2dc", 2.3);
  sun.position.set(-18, 34, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.035;
  Object.assign(sun.shadow.camera, {
    left: -38,
    right: 38,
    top: 43,
    bottom: -43,
    far: 100,
  });
  scene.add(sun);

  const textures = [];
  const mat = (color, roughness = 0.75) =>
    new T.MeshStandardMaterial({ color, roughness });
  const orange = mat("#ff5e19");
  const edge = mat("#ffab38");
  const metal = mat("#354669");
  const rubber = mat("#17192a");
  const white = mat("#edf9ff");
  const teal = mat("#20bbce");
  function mesh(geometry, material, x, y, z, parent = scene) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);

  function paintedTexture(width, height, paint) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    paint(c.getContext("2d"));
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures.push(map);
    return map;
  }
  let seed = 413;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  // --- The narrow track ------------------------------------------------------
  const point = (distance) => {
    const { x, y, z } = trackPoint(distance);
    return new T.Vector3(x, y, z);
  };
  const tangent = (distance) =>
    point(Math.min(TRACK_LENGTH, distance + 0.005))
      .sub(point(Math.max(0, distance - 0.005)))
      .normalize();
  const frame = new T.Matrix4();
  const right = new T.Vector3();
  const up = new T.Vector3();
  function trackFrame(distance) {
    const forward = tangent(distance);
    up.set(0, forward.z, -forward.y).normalize();
    right.crossVectors(up, forward).normalize();
    return frame.makeBasis(right, up, forward);
  }
  function trackStrip(offset, width, height, material) {
    const positions = [];
    const indices = [];
    const steps = TRACK_LENGTH * 10;
    for (let i = 0; i <= steps; i++) {
      const distance = i / 10;
      const center = point(distance);
      trackFrame(distance);
      for (const side of [-1, 1]) {
        const v = center
          .clone()
          .addScaledVector(right, offset + (side * width) / 2)
          .addScaledVector(up, height);
        positions.push(v.x, v.y, v.z);
      }
      if (i) {
        const j = 2 * i;
        indices.push(j - 2, j, j - 1, j - 1, j, j + 1);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    material.side = T.DoubleSide;
    mesh(geometry, material, 0, 0, 0);
  }
  trackStrip(0, TRACK_WIDTH, 0, orange);
  for (const side of [-1, 1]) {
    trackStrip(side * 0.75, 0.15, 0.085, edge);
    trackStrip(side * 0.75, 0.15, -0.065, orange);
  }
  for (const distance of [0, 4, 8, 12, 28, 30]) {
    const { x, y, z } = trackPoint(distance);
    for (const side of [-1, 1])
      box(0.13, y, 0.15, metal, x + side * 0.68, y / 2, z);
  }

  // --- The wide ramp ----------------------------------------------------------
  // Orange like the track, with yellow chevrons pointing up it and rails
  // along both edges. It's solid underneath, down to the grass.
  const chevrons = paintedTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#ff5e19";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#ffd24a";
    ctx.lineWidth = 22;
    ctx.lineJoin = "round";
    for (const y of [70, 190]) {
      ctx.beginPath();
      ctx.moveTo(60, y + 40);
      ctx.lineTo(128, y - 20);
      ctx.lineTo(196, y + 40);
      ctx.stroke();
    }
  });
  chevrons.wrapS = chevrons.wrapT = T.RepeatWrapping;
  const RAMP_STEPS = 72;
  const rampZ = (i) => RAMP_START + ((RAMP_END - RAMP_START) * i) / RAMP_STEPS;
  const wall = mat("#d94e16");
  wall.side = T.DoubleSide;
  {
    const positions = [];
    const uvs = [];
    const indices = [];
    const across = 8;
    for (let i = 0; i <= RAMP_STEPS; i++) {
      const z = rampZ(i);
      const half = rampHalfWidth(z);
      for (let j = 0; j <= across; j++) {
        const u = j / across;
        positions.push((u * 2 - 1) * half, rampY(z) + 0.002, z);
        uvs.push(u * 3, (z - RAMP_START) / 2.2);
        if (i && j) {
          const a = (i - 1) * (across + 1) + j - 1;
          const b = i * (across + 1) + j - 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const surface = new T.BufferGeometry();
    surface.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    surface.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    surface.setIndex(indices);
    surface.computeVertexNormals();
    mesh(
      surface,
      new T.MeshStandardMaterial({ map: chevrons, side: T.DoubleSide }),
      0,
      0,
      0,
    );
  }
  // Side walls down to the grass, and the rails on top of them.
  function rampSide(side) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= RAMP_STEPS; i++) {
      const z = rampZ(i);
      const x = side * rampHalfWidth(z);
      positions.push(x, rampY(z), z, x, 0, z);
      if (i) {
        const j = 2 * i;
        indices.push(j - 2, j, j - 1, j - 1, j, j + 1);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    mesh(g, wall, 0, 0, 0);
    // The rail: short boxes laid end to end along the edge.
    const railGeometry = new T.BoxGeometry(0.16, 0.2, 1);
    for (let i = 0; i < RAMP_STEPS; i++) {
      const z0 = rampZ(i);
      const z1 = rampZ(i + 1);
      const a = new T.Vector3(side * rampHalfWidth(z0), rampY(z0) + 0.1, z0);
      const b = new T.Vector3(side * rampHalfWidth(z1), rampY(z1) + 0.1, z1);
      const rail = mesh(railGeometry, edge, 0, 0, 0);
      rail.scale.z = a.distanceTo(b) + 0.02;
      rail.position.copy(a).add(b).multiplyScalar(0.5);
      rail.lookAt(b);
    }
  }
  rampSide(-1);
  rampSide(1);
  // The front of the lip.
  box(
    rampHalfWidth(RAMP_END) * 2,
    rampY(RAMP_END),
    0.12,
    wall,
    0,
    rampY(RAMP_END) / 2,
    RAMP_END,
  );

  // --- Yard: lawn, fence, trees ---------------------------------------------------
  const grass = paintedTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#638943";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = ["#507737", "#779a4c", "#8aa756"][i % 3];
      ctx.fillRect(
        random() * 256,
        random() * 256,
        1 + random() * 2,
        2 + random() * 4,
      );
    }
  });
  grass.wrapS = grass.wrapT = T.RepeatWrapping;
  grass.repeat.set(26, 26);
  const lawn = mesh(
    new T.PlaneGeometry(320, 320),
    new T.MeshStandardMaterial({ map: grass }),
    0,
    0,
    8,
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.castShadow = false;

  const cedar = mat("#a77950");
  const posts = mat("#876043");
  const pickets = new T.InstancedMesh(
    new T.BoxGeometry(0.92, 3.1, 0.17),
    cedar,
    250,
  );
  const board = new T.Object3D();
  let count = 0;
  function fenceSide(x, z, length, angle) {
    const at = (offset) => [
      x + Math.cos(angle) * offset,
      z + Math.sin(angle) * offset,
    ];
    for (let offset = -length / 2 + 0.6; offset < length / 2; offset += 1.2) {
      const [bx, bz] = at(offset);
      board.position.set(bx, 1.55 + random() * 0.1, bz);
      board.rotation.y = -angle;
      board.updateMatrix();
      pickets.setMatrixAt(count++, board.matrix);
    }
    for (const y of [0.85, 2.35])
      box(length, 0.27, 0.25, posts, x, y, z).rotation.y = -angle;
    for (
      let offset = -length / 2;
      offset < length / 2;
      offset += length / Math.ceil(length / 8)
    ) {
      const [px, pz] = at(offset);
      box(0.43, 3.5, 0.43, posts, px, 1.75, pz);
    }
  }
  fenceSide(0, 62, 54, 0);
  fenceSide(0, -34, 54, 0);
  for (const side of [-1, 1]) fenceSide(side * 27, 14, 96, Math.PI / 2);
  pickets.count = count;
  pickets.receiveShadow = true;
  scene.add(pickets);

  const bark = mat("#795539");
  const leaves = ["#497a40", "#5b8c45", "#729749"].map((c) => mat(c));
  const crown = new T.IcosahedronGeometry(1, 2);
  const trunk = new T.CylinderGeometry(0.24, 0.45, 1, 8);
  for (let i = 0; i < 23; i++) {
    const x = i < 9 ? (i - 4) * 8 : (i % 2 ? 1 : -1) * (34 + random() * 12);
    const z = i < 9 ? 69 + random() * 10 : -37 + (i - 9) * 7;
    const h = 5 + random() * 4;
    mesh(trunk, bark, x, h / 2, z).scale.y = h;
    for (let j = 0; j < 3; j++) {
      const foliage = mesh(
        crown,
        leaves[(i + j) % 3],
        x + (j - 1) * 1.55,
        h + (j === 1 ? 1.8 : 0),
        z + random() * 1.8,
      );
      foliage.scale.set(2.7 + random(), 3.4 + random(), 2.8);
    }
  }

  // --- The picnic table ---------------------------------------------------------
  // Boards along the yard for the top and the benches, with A-frame legs at
  // each end. Only the top and benches are solid (see shared/backyardFling.js).
  const woodGrain = paintedTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const y = random() * 256;
      ctx.strokeStyle = `rgba(110, 70, 30, ${0.06 + random() * 0.12})`;
      ctx.lineWidth = 1 + random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32)
        ctx.lineTo(x, y + Math.sin(x / 40 + i) * (2 + random() * 3));
      ctx.stroke();
    }
  });
  const grained = (color, roughness = 0.7) =>
    new T.MeshStandardMaterial({ color, roughness, map: woodGrain });
  {
    const stain = grained("#a8653c", 0.8);
    const legStain = grained("#8f5331", 0.85);
    const { halfWidth, near, far, top, thick, bench } = TABLE;
    const length = far - near;
    const middle = (near + far) / 2;
    const boards = 5;
    const boardW = (halfWidth * 2) / boards;
    for (let i = 0; i < boards; i++)
      box(
        boardW - 0.05,
        thick,
        length,
        stain,
        TABLE.x - halfWidth + boardW * (i + 0.5),
        top - thick / 2,
        middle,
      );
    const benchX = halfWidth + bench.gap + bench.width / 2;
    for (const side of [-1, 1])
      for (const offset of [-0.155, 0.155])
        box(
          bench.width / 2 - 0.03,
          bench.thick,
          length,
          stain,
          TABLE.x + side * benchX + offset,
          bench.top - bench.thick / 2,
          middle,
        );
    // Legs, a bench crossbar and a top brace at each end.
    const leg = (x0, y0, x1, y1, z) => {
      const a = new T.Vector3(x0, y0, z);
      const b = new T.Vector3(x1, y1, z);
      const part = box(0.16, a.distanceTo(b), 0.16, legStain, 0, 0, 0);
      part.position.copy(a).add(b).multiplyScalar(0.5);
      part.rotation.z = Math.atan2(x0 - x1, y1 - y0);
    };
    for (const z of [near + 0.7, far - 0.7]) {
      for (const side of [-1, 1])
        leg(
          TABLE.x + side * (halfWidth - 1.2),
          top - thick,
          TABLE.x + side * (benchX + 0.15),
          0,
          z,
        );
      box(
        halfWidth * 2 - 0.4,
        0.12,
        0.16,
        legStain,
        TABLE.x,
        top - thick - 0.06,
        z,
      );
      box(
        (benchX + bench.width / 2) * 2 - 0.1,
        0.12,
        0.16,
        legStain,
        TABLE.x,
        bench.top - bench.thick - 0.06,
        z,
      );
    }
  }

  // --- The blocks -------------------------------------------------------------
  // Natural wood in three tones, and a red-painted block to top things off.
  const blockMats = BLOCK_TONES.map((c) => grained(c, 0.6));
  let pieceModels = [];

  function makePiece(piece) {
    const g = new T.Group();
    const { w, h, d } = piece;
    const material = blockMats[piece.tone % blockMats.length];
    box(w, h, d, material, 0, 0, 0, g);
    scene.add(g);
    return { group: g, piece, wobble: 0 };
  }

  // --- The car and its driver ---------------------------------------------------
  const car = new T.Group();
  scene.add(car);
  const red = mat("#ff3d56");
  box(1.05, 0.28, 1.8, red, 0, 0, 0, car);
  box(0.77, 0.18, 0.55, red, 0, 0.17, 0.56, car);
  box(0.19, 0.016, 0.56, white, 0, 0.267, 0.56, car);
  box(0.57, 0.19, 0.58, rubber, 0, 0.14, -0.17, car);
  box(1.12, 0.1, 0.28, teal, 0, 0.34, -0.79, car);
  const wheels = [];
  for (const side of [-1, 1]) {
    box(0.23, 0.11, 0.035, white, side * 0.34, 0.03, 0.91, car);
    for (const z of [-0.58, 0.58]) {
      const wheel = new T.Group();
      wheel.position.set(side * 0.5, -0.07, z);
      car.add(wheel);
      for (const [radius, width, material, offset] of [
        [0.24, 0.23, rubber, 0],
        [0.13, 0.035, edge, side * 0.123],
      ]) {
        const part = mesh(
          new T.CylinderGeometry(radius, radius, width, 20),
          material,
          offset,
          0,
          0,
          wheel,
        );
        part.rotation.z = Math.PI / 2;
      }
      // A white spoke so you can see the wheels turn.
      box(0.04, 0.3, 0.06, white, side * 0.125, 0, 0, wheel);
      wheels.push(wheel);
    }
  }
  const driver = createAvatar("attacker", avatar);
  driver.position.set(0, 0.015, -0.17);
  driver.scale.set(0.38, 0.34, 0.38);
  driver.rotation.y = Math.PI;
  car.add(driver);

  // Where the car will land, while you steer.
  const marker = new T.Group();
  const ringMat = new T.MeshBasicMaterial({
    color: "#fff6a8",
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const ring = mesh(
    new T.RingGeometry(0.55, 0.78, 36),
    ringMat,
    0,
    0.03,
    0,
    marker,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  const dot = mesh(new T.CircleGeometry(0.18, 20), ringMat, 0, 0.03, 0, marker);
  dot.rotation.x = -Math.PI / 2;
  dot.castShadow = false;
  marker.visible = false;
  scene.add(marker);

  // --- Camera ------------------------------------------------------------------
  const trackOrientation = new T.Quaternion();
  const worldUp = new T.Vector3(0, 1, 0);
  const chase = new T.Vector3();
  const chaseAim = new T.Vector3();
  const camAim = new T.Vector3();
  const camUp = new T.Vector3(0, 1, 0);
  const screenPoint = new T.Vector3();
  let clock = 0;
  let cheer = 0;
  let heading = 0;
  let spin = 0;
  let lastPhase = "";

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    if (
      camera.aspect !== width / height ||
      canvas.width !== Math.floor(width * renderer.getPixelRatio())
    ) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1 ? 70 : 55;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  return {
    // Canvas-relative pixels for a point in the yard (for the pops).
    toScreen(x, y, z) {
      screenPoint.set(x, y, z).project(camera);
      return {
        x: ((screenPoint.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - screenPoint.y) / 2) * canvas.clientHeight,
      };
    },
    // A new yard: build its pieces.
    build(pieces) {
      for (const p of pieceModels) {
        scene.remove(p.group);
        p.group.traverse((n) => n.geometry?.dispose());
      }
      pieceModels = pieces.map(makePiece);
    },
    bump(piece) {
      const model = pieceModels.find((p) => p.piece === piece);
      if (model) model.wobble = 0.3;
    },
    cheer(seconds = 1.6) {
      cheer = seconds;
    },
    // view: { run, landing: { x, z } | null }
    draw(dt, { run, landing }) {
      if (!fit()) return;
      clock += dt;
      cheer = Math.max(0, cheer - dt);
      animateAvatar(driver, {}, dt, cheer > 0 ? "win" : undefined);

      // --- The car.
      const phase = run.phase;
      const fresh = phase !== lastPhase && phase === "track";
      lastPhase = phase;
      if (fresh) heading = 0;
      const speed = Math.hypot(run.vx, run.vz);
      if (phase === "track") {
        trackOrientation.setFromRotationMatrix(
          trackFrame(Math.min(run.distance, TRACK_LENGTH - 0.01)),
        );
        car.quaternion.copy(trackOrientation);
        car.position.set(run.x, run.y - RIDE_HEIGHT, run.z);
        car.position.addScaledVector(up, RIDE_HEIGHT);
      } else {
        // On the ramp the run gives the ride height; off it the body is a
        // ball, so sit the car's wheels at the bottom of the ball.
        const lift = phase === "drive" ? 0 : RIDE_HEIGHT - CAR_RADIUS;
        car.position.set(run.x, run.y + lift, run.z);
        if (speed > 0.6) heading = Math.atan2(run.vx, run.vz);
        const flying = phase !== "drive" && run.y > CAR_RADIUS + 0.12;
        const pitch =
          phase === "drive"
            ? run.pitch
            : flying
              ? Math.atan2(run.vy ?? 0, Math.max(speed, 0.1)) * 0.6
              : 0;
        car.rotation.set(
          -pitch,
          heading,
          phase === "drive" ? -run.vx * 0.04 : 0,
          "YXZ",
        );
      }
      spin += (speed / 0.24) * dt;
      for (const wheel of wheels) wheel.rotation.x = spin;

      // --- The landing marker.
      marker.visible = !!landing;
      if (landing) {
        marker.position.set(landing.x, landing.y ?? 0, landing.z);
        marker.scale.setScalar(1 + Math.sin(clock * 7) * 0.08);
      }

      // --- The pieces.
      for (const p of pieceModels) {
        const { position, quaternion } = p.piece.body;
        p.group.position.set(position.x, position.y, position.z);
        p.group.quaternion.set(
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w,
        );
        if (p.wobble > 0) {
          p.wobble = Math.max(0, p.wobble - dt);
          p.group.scale.setScalar(1 + Math.sin(p.wobble * 40) * p.wobble * 0.5);
        } else p.group.scale.setScalar(1);
      }

      // --- The camera. On the track it rides behind the car round the loop
      // (as in Loop & Glide); after that it eases to a chase view that looks
      // down the yard toward the table.
      const back = Math.max(1, 1.1 / camera.aspect);
      if (phase === "track") {
        const trailing = Math.max(0, run.distance - 2.3);
        trackFrame(trailing);
        camera.position.copy(point(trailing)).addScaledVector(up, 1.45);
        camUp.copy(up);
        camAim
          .set(0, 0.45, 1.0)
          .applyQuaternion(trackOrientation)
          .add(car.position);
      } else {
        if (phase === "drive") {
          // High enough to see over the lip to the stacks and the landing
          // ring beyond.
          chase.set(
            run.x * 0.8,
            Math.max(run.y + 3.4, 6.2) * back,
            run.z - 6 * back,
          );
          chaseAim.set(run.x * 0.6, 0, 13);
        } else {
          // Stay up above the ramp and watch the car roll into the stacks.
          const z = Math.min(run.z, 24);
          chase.set(run.x * 0.6, 6 * back, z - 7 * back);
          chaseAim.set(run.x * 0.6, 0.8, Math.max(z + 5, 17));
        }
        const ease = 1 - Math.exp(-dt * (phase === "drive" ? 5 : 3));
        camera.position.lerp(chase, ease);
        camAim.lerp(chaseAim, ease);
        camUp.lerp(worldUp, ease).normalize();
      }
      camera.up.copy(camUp);
      camera.lookAt(camAim);
      renderer.render(scene, camera);
    },
    dispose() {
      pickets.dispose();
      sun.shadow.dispose();
      driver.removeFromParent();
      disposeAvatar(driver);
      const materials = new Set();
      scene.traverse(({ geometry, material }) => {
        geometry?.dispose();
        if (material) for (const item of [material].flat()) materials.add(item);
      });
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      renderer.dispose();
    },
  };
}
