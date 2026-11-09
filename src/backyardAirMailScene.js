import * as T from "three";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import {
  picnicTable,
  rideHeight,
  targets,
  trackLength,
  trackPoint,
} from "./backyardAirMailFlight.js";

export function createAirMailScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bce5f4");
  scene.fog = new T.Fog("#bce5f4", 65, 135);
  const camera = new T.PerspectiveCamera(53, 1, 0.1, 140);
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

  const mat = (color) => new T.MeshStandardMaterial({ color });
  const orange = mat("#ff5e19");
  const edge = mat("#ffab38");
  const metal = mat("#354669");
  const rubber = mat("#17192a");
  const white = mat("#edf9ff");
  const teal = mat("#20bbce");
  const textures = [];
  function mesh(geometry, material, x, y, z, parent = scene) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  const point = (distance) => {
    const { x, y, z } = trackPoint(distance);
    return new T.Vector3(x, y, z);
  };
  const tangent = (distance) =>
    point(Math.min(trackLength, distance + 0.005))
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
    for (let i = 0; i <= 350; i++) {
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
  trackStrip(0, 1.55, 0, orange);
  for (const side of [-1, 1]) {
    trackStrip(side * 0.75, 0.15, 0.085, edge);
    trackStrip(side * 0.75, 0.15, -0.065, orange);
  }
  for (const distance of [0, 4, 8, 12, 28, 30, 32, 34.9]) {
    const { x, y, z } = trackPoint(distance);
    for (const side of [-1, 1])
      box(0.13, y, 0.15, metal, x + side * 0.68, y / 2, z);
  }

  function paintedTexture(width, height, paint) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext("2d"));
    const map = new T.CanvasTexture(canvas);
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
    const along = (offset) => [
      x + Math.cos(angle) * offset,
      z + Math.sin(angle) * offset,
    ];
    for (let offset = -length / 2 + 0.6; offset < length / 2; offset += 1.2) {
      const [bx, bz] = along(offset);
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
      const [px, pz] = along(offset);
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
  const leaves = ["#497a40", "#5b8c45", "#729749"].map(mat);
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

  const table = picnicTable;
  const wood = mat("#a86437");
  const frameWood = mat("#815032");
  const slats = ["#ae6d43", "#bd7c4b", "#a86a40"].map(mat);
  box(table.w * 2, 0.36, table.d * 2, wood, table.x, table.y - 0.2, table.z);
  for (const side of [-1, 1]) {
    box(
      0.24,
      0.38,
      table.d * 1.94,
      frameWood,
      side * (table.w - 0.36),
      table.y - 0.54,
      table.z,
    );
    for (let i = 0; i < 3; i++) {
      box(
        0.69,
        0.2,
        table.d * 1.83,
        slats[i],
        side * (table.w + 1.65 + (i - 1) * 0.73),
        1.16,
        table.z,
      );
    }
  }
  for (const end of [-1, 0, 1]) {
    const z = table.z + end * 17;
    box((table.w + 2.8) * 2, 0.27, 0.48, frameWood, 0, 0.93, z);
    for (const side of [-1, 1]) {
      const leg = box(0.48, 2.37, 0.58, wood, side * (table.w - 0.95), 1.13, z);
      leg.rotation.z = side * 0.27;
      box(0.36, 1.08, 0.47, frameWood, side * (table.w + 1.65), 0.54, z);
    }
  }

  const gingham = paintedTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#fff4e6";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#e27880";
    ctx.fillRect(0, 0, 32, 64);
    ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = "#bb3244";
    ctx.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 64; i += 4) {
      ctx.fillStyle = "#ffffff22";
      ctx.fillRect(i, 0, 1, 64);
      ctx.fillRect(0, i, 64, 1);
    }
  });
  gingham.wrapS = gingham.wrapT = T.RepeatWrapping;
  gingham.repeat.set(12, 21);
  const cloth = new T.MeshStandardMaterial({ map: gingham });
  const top = mesh(
    new T.PlaneGeometry(table.w * 2, table.d * 2),
    cloth,
    table.x,
    table.y,
    table.z,
  );
  top.rotation.x = -Math.PI / 2;
  top.castShadow = false;
  const drapeMap = gingham.clone();
  drapeMap.repeat.set(12, 0.28);
  textures.push(drapeMap);
  const hem = new T.MeshStandardMaterial({ map: drapeMap, side: T.DoubleSide });
  const sideMap = drapeMap.clone();
  sideMap.repeat.x = 21;
  textures.push(sideMap);
  const sideHem = new T.MeshStandardMaterial({
    map: sideMap,
    side: T.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const skirt = mesh(
      new T.PlaneGeometry(table.d * 2, 0.47),
      sideHem,
      side * table.w,
      table.y - 0.235,
      table.z,
    );
    skirt.rotation.y = Math.PI / 2;
    mesh(
      new T.PlaneGeometry(table.w * 2, 0.47),
      hem,
      0,
      table.y - 0.235,
      table.z + side * table.d,
    );
  }

  const wickerMap = paintedTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#a65d2b";
    ctx.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 4; col++) {
        ctx.fillStyle = row % 2 ? "#e4ad63" : "#cc8d4c";
        ctx.fillRect(col * 20 + (row % 2) * 10, row * 16 + 2, 17, 12);
      }
    }
  });
  wickerMap.wrapS = wickerMap.wrapT = T.RepeatWrapping;
  wickerMap.repeat.set(7, 2);
  const wicker = new T.MeshStandardMaterial({ map: wickerMap });
  const lining = mat("#77c9ef");
  const gold = mat("#ffd35a");
  const silver = mat("#afc2cf");
  const berry = mat("#383078");
  const crust = mat("#e5a354");
  const crumb = mat("#b77635");
  const tread = mat("#241945");

  const dish = (radius, bottom, height, material, y, parent) =>
    mesh(
      new T.CylinderGeometry(radius, bottom, height, 64),
      material,
      0,
      y,
      0,
      parent,
    );
  const rim = (radius, thickness, material, y, parent) => {
    const ring = mesh(
      new T.TorusGeometry(radius, thickness, 8, 64),
      material,
      0,
      y,
      0,
      parent,
    );
    ring.rotation.x = -Math.PI / 2;
  };

  const props = {};
  const labels = {};
  for (const target of targets) {
    const { id, x, y, z, w, d, points } = target;
    const prop = new T.Group();
    prop.position.set(x, y, z);
    scene.add(prop);
    props[id] = prop;
    if (id === "basket") {
      // Recess the wicker beneath the lining so the two surfaces never share a plane.
      box(
        w * 2 + 0.52,
        y - table.y - 0.04,
        d * 2 + 0.52,
        wicker,
        0,
        (table.y - y - 0.04) / 2,
        0,
        prop,
      );
      box(w * 2 - 0.025, 0.05, d * 2 - 0.025, lining, 0, -0.025, 0, prop);
      for (const side of [-1, 1]) {
        box(
          0.26,
          0.475,
          d * 2 + 0.52,
          wicker,
          side * (w + 0.13),
          0.1975,
          0,
          prop,
        );
        box(
          w * 2 - 0.002,
          0.475,
          0.26,
          wicker,
          0,
          0.1975,
          side * (d + 0.13),
          prop,
        );
      }
      const lid = box(
        w * 2 + 0.45,
        0.15,
        2.65,
        wicker,
        0,
        0.86,
        d + 1.35,
        prop,
      );
      lid.rotation.x = -0.37;
      const handle = mesh(
        new T.TorusGeometry(0.66, 0.09, 8, 24, Math.PI),
        wicker,
        0,
        0.5,
        -d - 0.13,
        prop,
      );
      props.handle = handle;
    } else if (id === "plate") {
      dish(w, w - 0.36, y - table.y, gold, (table.y - y) / 2, prop);
      rim(w - 0.07, 0.065, gold, 0, prop);
      rim(w - 0.42, 0.027, white, 0.008, prop);
    } else {
      // Sink the tin below the filling so their top faces cannot compete.
      const tinHeight = y - table.y - 0.06;
      dish(w, w - 0.27, tinHeight, silver, -0.06 - tinHeight / 2, prop);
      dish(w - 0.13, w - 0.13, 0.075, berry, -0.0575, prop);

      rim(w - 0.12, 0.11, crust, 0.015, prop);
      const lattice = new T.Group();
      lattice.rotation.y = Math.PI / 5;
      prop.add(lattice);
      for (const offset of [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35]) {
        const length = 2 * Math.sqrt((w - 0.14) ** 2 - offset ** 2);
        box(0.13, 0.035, length, crust, offset, 0.017, 0, lattice);
        box(length, 0.035, 0.13, crust, 0, 0.039, offset, lattice);
      }
    }

    const map = paintedTexture(256, 96, (ctx) => {
      ctx.fillStyle = "#372324";
      ctx.roundRect(4, 4, 248, 88, 24);
      ctx.fill();
      ctx.fillStyle = "#fff7de";
      ctx.textAlign = "center";
      ctx.font = "bold 58px sans-serif";
      ctx.fillText(points, 128, 69);
    });
    const label = mesh(
      new T.PlaneGeometry(1.75, 0.66),
      new T.MeshBasicMaterial({ map, transparent: true }),
      x,
      table.y + 0.008,
      z - d - 0.83,
    );
    label.rotation.set(-Math.PI / 2, 0, Math.PI);
    label.castShadow = false;
    labels[id] = label;
  }

  const crumbs = Array.from({ length: 12 }, (_, i) =>
    box(0.08 + (i % 3) * 0.025, 0.08, 0.11, crumb, 0, 0, 0),
  );
  const tireTracks = new T.Group();
  const treadPosition = new T.Vector3();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const mark = box(
        0.18,
        0.009,
        0.08,
        tread,
        side * 0.51,
        0,
        i * 0.13 - 0.26,
        tireTracks,
      );
      mark.rotation.y = side * 0.32;
    }
  }
  scene.add(tireTracks);

  const car = new T.Group();
  scene.add(car);
  const red = mat("#ff3d56");
  box(1.05, 0.28, 1.8, red, 0, 0, 0, car);
  box(0.77, 0.18, 0.55, red, 0, 0.17, 0.56, car);
  box(0.19, 0.016, 0.56, white, 0, 0.267, 0.56, car);
  box(0.57, 0.19, 0.58, rubber, 0, 0.14, -0.17, car);
  box(1.12, 0.1, 0.28, teal, 0, 0.34, -0.79, car);
  for (const side of [-1, 1]) {
    box(0.23, 0.11, 0.035, white, side * 0.34, 0.03, 0.91, car);
    for (const z of [-0.58, 0.58]) {
      for (const [radius, width, material, offset] of [
        [0.24, 0.23, rubber, 0.5],
        [0.13, 0.035, edge, 0.623],
      ]) {
        const wheel = mesh(
          new T.CylinderGeometry(radius, radius, width, 20),
          material,
          side * offset,
          -0.07,
          z,
          car,
        );
        wheel.rotation.z = Math.PI / 2;
      }
    }
  }
  const driver = createAvatar("attacker", avatar);
  driver.position.set(0, 0.015, -0.17);
  driver.scale.set(0.38, 0.34, 0.38);
  driver.rotation.y = Math.PI;
  car.add(driver);

  const glider = new T.Group();
  car.add(glider);
  const wing = new T.PlaneGeometry(4.2, 1.15, 24, 8);
  const vertices = wing.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const chord = vertices.getY(i) / 1.15 + 0.5;
    const span = Math.abs(x) / 2.1;
    vertices.setXYZ(
      i,
      x,
      2.05 - 0.58 * span ** 2 + 0.27 * Math.sin(chord * Math.PI),
      (chord - 0.5) * (1.15 - 0.42 * span) - 0.46 * span ** 2,
    );
  }
  wing.computeVertexNormals();
  const canopy = mat("#40dfec");
  const stripe = mat("#faf16a");
  canopy.side = stripe.side = T.DoubleSide;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 24; col += 8) {
      const start = (row * 24 + col) * 6;
      wing.addGroup(start, 12, 1);
      wing.addGroup(start + 12, 36, 0);
    }
  }
  mesh(wing, [canopy, stripe], 0, 0, 0, glider);
  const cords = [];
  for (const side of [-1, 1]) {
    for (const z of [-0.67, -0.18])
      cords.push(side * 0.38, 0.21, 0, side * 1.98, 1.57, z);
  }
  const lines = new T.BufferGeometry();
  lines.setAttribute("position", new T.Float32BufferAttribute(cords, 3));
  glider.add(
    new T.LineSegments(lines, new T.LineBasicMaterial({ color: "#e5f6ff" })),
  );

  const chase = new T.Vector3();
  const trackCamera = new T.Vector3();
  const trackOrientation = new T.Quaternion();
  const trackCameraUp = new T.Vector3();
  const worldUp = new T.Vector3(0, 1, 0);
  const aim = new T.Vector3();
  const chaseAim = new T.Vector3();
  function draw(state, flightView, touchdown) {
    const { x, y, z } = state;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (
      camera.aspect !== width / height ||
      canvas.width !== Math.floor(width * renderer.getPixelRatio())
    ) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    animateAvatar(driver, {}, 0);
    trackOrientation.setFromRotationMatrix(trackFrame(state.distance));
    car.position.set(x, y, z);
    if (state.phase === "track") {
      car.quaternion.copy(trackOrientation);
      car.position.addScaledVector(up, rideHeight);
    } else {
      car.rotation.set(
        state.phase === "air" ? -Math.atan2(state.vy, state.vz) * 0.55 : 0,
        Math.atan2(state.vx, state.vz) * 0.65,
        state.phase === "air" ? -state.vx * 0.07 : 0,
      );
    }
    const landed = state.phase === "done" ? state.surface?.id : null;
    const wobble = Math.sin(touchdown * 31) * Math.exp(-touchdown * 7);
    props.plate.scale.y = landed === "plate" ? 1 - wobble * 0.42 : 1;
    props.basket.rotation.z = landed === "basket" ? wobble * 0.06 : 0;
    props.handle.rotation.y = landed === "basket" ? wobble * 0.5 : 0;
    crumbs.forEach((piece, i) => {
      piece.visible = landed === "plate" && touchdown > 0 && touchdown < 0.65;
      if (!piece.visible) return;
      const angle = (i * Math.PI * 2) / crumbs.length;
      const spread = touchdown * (1.2 + (i % 4) * 0.35);
      piece.position.set(
        x + Math.cos(angle) * spread,
        y - rideHeight + 7 * touchdown * (0.66 - touchdown),
        z + Math.sin(angle) * spread,
      );
      piece.rotation.set(touchdown * 9, angle, touchdown * 6);
    });
    tireTracks.visible = landed === "pie";
    if (tireTracks.visible) {
      const pie = state.surface;
      tireTracks.position.set(x, y - rideHeight + 0.064, z - 0.76);
      tireTracks.rotation.y = car.rotation.y;
      for (const mark of tireTracks.children) {
        tireTracks.localToWorld(treadPosition.copy(mark.position));
        mark.visible =
          Math.hypot(treadPosition.x - pie.x, treadPosition.z - pie.z) <
          pie.w - 0.24;
      }
    }
    glider.visible = state.deploy > 0;
    glider.scale.setScalar(Math.max(0.01, state.deploy));
    const distance = Math.max(1, 1.2 / camera.aspect);
    // Follow the curve behind the car so the camera stays on the driving
    // side of the track through the loop.
    const trailingDistance = state.distance - 2.3;
    trackCameraUp.copy(up);
    trackFrame(Math.max(0, trailingDistance));
    trackCamera.copy(point(trailingDistance)).addScaledVector(up, 1.45);
    if (state.phase !== "track") {
      const launch = trackPoint(trackLength);
      trackCamera.x += x - launch.x;
      trackCamera.y += y - launch.y - rideHeight;
      trackCamera.z += z - launch.z;
    }
    aim.set(0, 0.45, 1.0).applyQuaternion(trackOrientation).add(car.position);
    chase.set(x * 0.85, y + 5.4 * distance, z - 8.5 * distance);
    chaseAim.set(x * 0.7, Math.max(0.3, y - 2), z + 12);
    const blend = T.MathUtils.smoothstep(flightView, 0, 1);
    camera.position.copy(trackCamera).lerp(chase, blend);
    camera.up.copy(trackCameraUp).lerp(worldUp, blend).normalize();
    camera.lookAt(aim.lerp(chaseAim, blend));
    renderer.render(scene, camera);
  }

  return {
    draw,
    setTargets(layout) {
      for (const { id, x, z, d } of layout) {
        props[id].position.x = x;
        props[id].position.z = z;
        labels[id].position.x = x;
        labels[id].position.z = z - d - 0.83;
      }
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
