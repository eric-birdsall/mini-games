import * as THREE from "three";
import { TABLE, ZONES } from "../shared/shuffleboard.js";
import { createRecordPlayers } from "./shuffleboardRecords.js";
import { createShuffleboardRooms } from "./shuffleboardRooms.js";

const length = TABLE.length / 100;
const width = TABLE.width / 100;
const surface = 1.05;
const teams = [0xd44733, 0x299e98];

function texture(w, h, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"));
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function createShuffleboardStudy(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d1410");
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 40);
  const aimEye = new THREE.Vector3(-1.6, 1.88, 0);
  const aimTarget = new THREE.Vector3(6, 1.26, 0);
  const scoringCenter = (ZONES[0] + TABLE.length) / 200;
  const scoringEye = new THREE.Vector3(scoringCenter - 0.025, 4.24, 0);
  const scoringTarget = new THREE.Vector3(scoringCenter, surface, 0);
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const look = aimTarget.clone();
  camera.position.copy(aimEye);
  camera.lookAt(look);
  const material = (color, roughness = 0.75) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disk = new THREE.CylinderGeometry(1, 1, 1, 32);
  const globe = new THREE.SphereGeometry(1, 16, 12);
  const wood = material("#4a251a");
  const trim = material("#784327", 0.42);
  const brass = new THREE.MeshStandardMaterial({
    color: "#d4a35e",
    metalness: 0.48,
    roughness: 0.36,
  });
  const wall = material("#263d36");
  const ceiling = material("#4a251a");
  const black = material("#1d1615");
  const hearth = material("#a48b73");
  const marble = material("#cfb696", 0.45);
  const ember = new THREE.MeshBasicMaterial({ color: "#ff7941" });
  const lamp = new THREE.MeshBasicMaterial({ color: "#ffcf85" });
  let seed = 781;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function mesh(parent, geometry, mat, x, y, z, sx, sy, sz) {
    const result = new THREE.Mesh(geometry, mat);
    result.position.set(x, y, z);
    result.scale.set(sx, sy, sz);
    parent.add(result);
    return result;
  }

  function block(parent, mat, x, y, z, sx, sy, sz) {
    return mesh(parent, box, mat, x, y, z, sx, sy, sz);
  }

  function group(x, y, z, angle = 0) {
    const result = new THREE.Group();
    result.position.set(x, y, z);
    result.rotation.y = angle;
    scene.add(result);
    return result;
  }

  const ambient = new THREE.HemisphereLight("#ffe0b2", "#ab7459", 1.6);
  scene.add(ambient);
  const fill = new THREE.DirectionalLight("#fff1d5", 1.45);
  fill.position.set(-2.8, 6, 2);
  scene.add(fill);
  block(scene, wall, 5, 2.28, -4.65, 16, 4.65, 0.2);
  block(scene, wall, 5, 2.28, 4.65, 16, 4.65, 0.2);
  block(scene, wall, 12.8, 2.28, 0, 0.2, 4.65, 9.3);
  block(scene, wall, -3, 2.28, 0, 0.2, 4.65, 9.3);
  block(scene, ceiling, 5, 4.6, 0, 16, 0.15, 9.3);

  const flooring = ["#764c35", "#69432f", "#805640", "#714731"].map((color) =>
    material(color),
  );
  for (let i = 0; i < 26; i++) {
    const z = (i - 12.5) * 0.36;
    for (let j = 0; j < 6; j++) {
      block(
        scene,
        flooring[Math.floor(random() * flooring.length)],
        -3.45 + j * 3.15 + (i % 2) * 1.08,
        -0.07,
        z,
        3.14,
        0.13,
        0.353,
      );
    }
  }
  const rugMap = texture(1024, 512, (ctx) => {
    ctx.fillStyle = "#56302d";
    ctx.fillRect(0, 0, 1024, 512);
    for (const [inset, color, weight] of [
      [12, "#9a6c46", 6],
      [24, "#bc9c66", 2],
      [40, "#a07754", 4],
      [56, "#a07754", 2],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.strokeRect(inset, inset, 1024 - 2 * inset, 512 - 2 * inset);
    }
    ctx.strokeStyle = "#b48b5055";
    ctx.lineWidth = 2;
    for (let x = 70; x < 984; x += 42) {
      for (let y = 78; y < 470; y += 42) {
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 9, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 9, y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  });
  const rug = mesh(
    scene,
    new THREE.PlaneGeometry(12.4, 4.1),
    new THREE.MeshStandardMaterial({ map: rugMap }),
    4.2,
    0.007,
    0,
    1,
    1,
    1,
  );
  rug.rotation.x = -Math.PI / 2;

  const library = new THREE.Group();
  scene.add(library);
  const { cabin, sunroom, cabinFire, sunroomFire, updateSnow, updateRain } =
    createShuffleboardRooms(texture);
  scene.add(cabin, sunroom);

  const bookColors = [
    "#693330",
    "#a0754b",
    "#35574a",
    "#2e3d53",
    "#75504b",
    "#453730",
    "#858052",
    "#aa6548",
  ];
  const bookMaterials = bookColors.map((color) => material(color));
  const spineBands = material("#b3925e");
  const bookBatches = new Map();
  const spine = new THREE.Object3D();
  function bookPart(parent, mat, x, y, z, sx, sy, sz) {
    spine.position.set(x, y, z);
    spine.scale.set(sx, sy, sz);
    spine.updateMatrix();
    parent.updateMatrix();
    if (!bookBatches.has(mat)) bookBatches.set(mat, []);
    bookBatches
      .get(mat)
      .push(new THREE.Matrix4().multiplyMatrices(parent.matrix, spine.matrix));
  }

  function bookcase(x, z, angle) {
    const frame = group(x, 0, z, angle);
    library.add(frame);
    block(frame, black, 0, 2.15, -0.2, 2.47, 4.26, 0.13);
    for (const side of [-1, 1]) {
      block(frame, wood, side * 1.2, 2.15, 0, 0.14, 4.3, 0.55);
      block(frame, trim, side * 1.2, 2.15, 0.29, 0.07, 4.3, 0.035);
    }
    block(frame, wood, 0, 0.25, 0, 2.4, 0.47, 0.53);
    block(frame, trim, 0, 4.25, 0.05, 2.56, 0.19, 0.62);
    for (let row = 0; row < 6; row++) {
      const h = 0.51 + row * 0.61;
      block(frame, wood, 0, h, 0.02, 2.4, 0.09, 0.55);
      block(frame, trim, 0, h, 0.3, 2.38, 0.033, 0.025);
      let edge = -1.12;
      while (edge < 1) {
        const w = 0.085 + random() * 0.09;
        const size = 0.27 + random() * 0.21;
        const front = 0.13 + random() * 0.095;
        const center = edge + w / 2;
        bookPart(
          frame,
          bookMaterials[Math.floor(random() * bookMaterials.length)],
          center,
          h + 0.046 + size / 2,
          front - 0.12,
          w,
          size,
          0.24,
        );
        if (random() < 0.75) {
          for (const fraction of [0.21, 0.8]) {
            bookPart(
              frame,
              spineBands,
              center,
              h + 0.046 + size * fraction,
              front + 0.001,
              w * 0.73,
              0.009,
              0.006,
            );
          }
        }
        edge += w + 0.009;
      }
    }
    return frame;
  }

  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 6; bay++) {
      bookcase(-1.65 + bay * 2.52, side * 4.25, side === -1 ? 0 : Math.PI);
    }
  }
  bookcase(12.42, -3.07, -Math.PI / 2);
  bookcase(12.42, -0.55, -Math.PI / 2);
  for (const [mat, transforms] of bookBatches) {
    const batch = new THREE.InstancedMesh(box, mat, transforms.length);
    transforms.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    library.add(batch);
  }

  const fireplace = group(12.35, 0, 2.46, -Math.PI / 2);
  library.add(fireplace);
  const studyFire = new THREE.Group();
  const fireRig = new THREE.Group();
  fireplace.add(studyFire);
  studyFire.add(fireRig);
  const rooms = { study: library, cabin, sunroom };
  const fireAnchors = {
    study: studyFire,
    cabin: cabinFire,
    sunroom: sunroomFire,
  };
  let activeRoom = "study";
  const recordPlayers = createRecordPlayers(rooms);
  const recordRay = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const screenPoint = new THREE.Vector3();

  function recordPosition() {
    const { player } = recordPlayers[activeRoom];
    screenPoint.set(0, 1.01, 0.44);
    player.localToWorld(screenPoint);
    screenPoint.project(camera);
    if (
      screenPoint.z < -1 ||
      screenPoint.z > 1 ||
      Math.abs(screenPoint.x) > 0.87 ||
      Math.abs(screenPoint.y) > 0.82
    )
      return null;
    return { x: (screenPoint.x + 1) / 2, y: (1 - screenPoint.y) / 2 };
  }

  function recordAt(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((clientY - bounds.top) / bounds.height) * 2,
    );
    recordRay.setFromCamera(pointer, camera);
    return (
      recordRay.intersectObject(recordPlayers[activeRoom].player, true).length >
      0
    );
  }
  block(fireplace, black, 0, 0.91, -0.09, 2.13, 1.79, 0.14);
  block(fireplace, hearth, 0, 0.09, 0.4, 3.51, 0.17, 1.38);
  block(fireplace, marble, 0, 0.19, 0.4, 3.6, 0.07, 1.43);
  const archRadius = 0.86;
  for (const side of [-1, 1]) {
    block(fireplace, hearth, side * 1.27, 0.97, 0.15, 0.78, 1.85, 0.61);
    block(fireplace, marble, side * 1.42, 1.02, 0.49, 0.28, 1.48, 0.11);
    for (const y of [0.32, 1.71]) {
      block(fireplace, marble, side * 1.42, y, 0.51, 0.4, 0.12, 0.18);
    }
  }
  const arch = new THREE.TorusGeometry(
    archRadius + 0.12,
    0.13,
    10,
    44,
    Math.PI,
  );
  for (let i = 0; i <= 10; i++) {
    const angle = (i * Math.PI) / 10;
    const voussoir = block(
      fireplace,
      i === 5 ? brass : hearth,
      Math.cos(angle) * 1.06,
      0.99 + Math.sin(angle) * 0.92,
      0.46,
      0.22,
      0.15,
      0.18,
    );
    voussoir.rotation.z = angle;
  }
  const surround = mesh(fireplace, arch, marble, 0, 0.99, 0.38, 1, 0.89, 1);
  surround.name = "Carved fireplace arch";
  block(fireplace, hearth, 0, 2.04, 0.1, 3.3, 0.36, 0.76);
  block(fireplace, marble, 0, 2.23, 0.19, 3.65, 0.11, 0.94);
  block(fireplace, trim, 0, 2.33, 0.17, 3.78, 0.12, 1.02);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const brick = block(
        fireplace,
        flooring[(row + col) % 4],
        (col - 2) * 0.31 + (row % 2) * 0.1,
        0.31 + row * 0.17,
        0.01,
        0.298,
        0.155,
        0.06,
      );
      brick.material = row < 2 ? flooring[(row + col) % 4] : black;
    }
  }

  // A layered landscape above the mantel is painted directly onto its canvas.
  const landscape = texture(384, 256, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 180);
    sky.addColorStop(0, "#243c47");
    sky.addColorStop(1, "#e0a260");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 384, 256);
    ctx.fillStyle = "#f7ca87";
    ctx.beginPath();
    ctx.arc(264, 109, 26, 0, Math.PI * 2);
    ctx.fill();
    for (const [row, color] of [
      [133, "#76665a"],
      [152, "#4d5347"],
      [182, "#364339"],
      [212, "#263831"],
    ]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, row);
      for (let x = 0; x <= 384; x += 12) {
        ctx.lineTo(x, row + Math.sin(x / 46 + row) * 19 + random() * 13);
      }
      ctx.lineTo(384, 256);
      ctx.lineTo(0, 256);
      ctx.fill();
    }
  });
  block(fireplace, trim, 0, 3.36, 0.04, 2.48, 1.58, 0.18);
  block(fireplace, brass, 0, 3.36, 0.14, 2.34, 1.45, 0.07);
  mesh(
    fireplace,
    new THREE.PlaneGeometry(2.19, 1.31),
    new THREE.MeshBasicMaterial({ map: landscape }),
    0,
    3.36,
    0.18,
    1,
    1,
    1,
  );

  for (const side of [-1, 1]) {
    for (const x of [0.85, 5.9, 10.95]) {
      const fixture = group(x, 2.95, side * 3.94, side === -1 ? 0 : Math.PI);
      block(fixture, brass, 0, 0, 0.02, 0.16, 0.43, 0.06);
      block(fixture, brass, 0, -0.15, 0.2, 0.23, 0.045, 0.37);
      mesh(fixture, globe, lamp, 0, 0, 0.35, 0.13, 0.19, 0.13);
      const light = new THREE.PointLight("#ffc17f", 15, 5);
      light.position.set(0, 0, 0.58);
      fixture.add(light);
    }
  }

  const flameShape = new THREE.Shape();
  flameShape.moveTo(-0.26, 0);
  flameShape.bezierCurveTo(-0.45, 0.4, 0.09, 0.57, 0.08, 1);
  flameShape.bezierCurveTo(0.17, 0.72, 0.51, 0.37, 0.26, 0);
  flameShape.closePath();
  const flameGeometry = new THREE.ShapeGeometry(flameShape);
  const flameMats = ["#d74812", "#ff7822", "#ffd273"].map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
  );
  for (let i = 0; i < 4; i++) {
    const log = mesh(
      fireRig,
      disk,
      wood,
      (i - 1.5) * 0.26,
      0.29 + (i % 2) * 0.08,
      0.37 + (i % 2) * 0.19,
      0.085,
      0.87,
      0.085,
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i % 2 ? 0.27 : -0.24;
  }
  const flames = Array.from({ length: 12 }, (_, i) =>
    mesh(
      fireRig,
      flameGeometry,
      flameMats[i % 3],
      (Math.floor(i / 3) - 1.5) * 0.29,
      0.32,
      0.28 + (i % 3) * 0.13,
      0.77 - (i % 3) * 0.16,
      1,
      1,
    ),
  );
  const sparks = Array.from({ length: 12 }, (_, i) =>
    mesh(
      fireRig,
      globe,
      ember,
      0,
      0,
      0.46,
      0.019 - (i % 3) * 0.004,
      0.02,
      0.014,
    ),
  );
  const firelight = new THREE.PointLight("#ff7b32", 33, 7);
  firelight.position.set(0, 0.75, 0.77);
  fireRig.add(firelight);

  const boardMap = texture(2048, 384, (ctx) => {
    const grain = ctx.createLinearGradient(0, 0, 0, 384);
    grain.addColorStop(0, "#c38e58");
    grain.addColorStop(0.45, "#efc591");
    grain.addColorStop(1, "#d19b63");
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, 2048, 384);
    for (let i = 0; i < 420; i++) {
      const y = random() * 384;
      const wave = (random() - 0.5) * 28;
      ctx.strokeStyle = i % 3 ? "#77401c19" : "#fffada4c";
      ctx.lineWidth = 0.4 + random() * 1.9;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(720, y + wave, 1200, y - wave, 2048, y + wave * 0.25);
      ctx.stroke();
    }
    for (const [i, line] of ZONES.entries()) {
      const x = (line / TABLE.length) * 2048;
      const next = ((ZONES[i + 1] ?? TABLE.length) / TABLE.length) * 2048;
      ctx.fillStyle = "#633124";
      ctx.fillRect(x - 5, 0, 10, 384);
      for (const y of [55, 329]) {
        ctx.save();
        ctx.translate((x + next) / 2, y);
        ctx.rotate(Math.PI / 2);
        ctx.font = "bold 90px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), 0, 0);
        ctx.restore();
      }
    }
  });

  const board = mesh(
    scene,
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshPhysicalMaterial({
      map: boardMap,
      roughness: 0.33,
      clearcoat: 0.75,
      clearcoatRoughness: 0.29,
    }),
    length / 2,
    surface,
    0,
    1,
    1,
    1,
  );
  board.rotation.x = -Math.PI / 2;
  block(scene, trim, length / 2, surface - 0.078, 0, length, 0.15, width);
  block(
    scene,
    black,
    length / 2,
    surface - 0.15,
    0,
    length + 0.65,
    0.12,
    width + 0.62,
  );
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + 0.3);
    block(scene, wood, length / 2, surface - 0.1, z, length + 0.67, 0.3, 0.19);
    block(
      scene,
      trim,
      length / 2,
      surface + 0.055,
      z,
      length + 0.69,
      0.07,
      0.23,
    );
    block(
      scene,
      brass,
      length / 2,
      surface + 0.091,
      z - side * 0.065,
      length + 0.39,
      0.009,
      0.012,
    );
    const x = side === -1 ? -0.29 : length + 0.29;
    block(scene, wood, x, surface - 0.115, 0, 0.2, 0.25, width + 0.78);
    block(scene, trim, x, surface + 0.022, 0, 0.22, 0.075, width + 0.79);
  }
  for (const x of [0.45, 4.8, 9.15]) {
    for (const z of [-0.91, 0.91]) {
      block(scene, wood, x, 0.47, z, 0.23, 0.94, 0.25);
      block(scene, trim, x, 0.07, z, 0.29, 0.13, 0.3);
    }
    block(scene, wood, x, 0.43, 0, 0.17, 0.18, 1.73);
  }

  const puckMats = teams.map((color) => material(color, 0.3));
  const puckBase = material("#595561", 0.28);
  const puckRing = material("#e6d9bd", 0.33);
  const puckMeshes = Array.from({ length: 8 }, () => {
    const puck = group(0, 0, 0);
    const r = TABLE.radius / 100;
    mesh(puck, disk, puckBase, 0, 0.034, 0, r, 0.068, r);
    mesh(puck, disk, puckRing, 0, 0.069, 0, r * 0.96, 0.009, r * 0.96);
    mesh(puck, disk, puckMats[0], 0, 0.077, 0, r * 0.88, 0.015, r * 0.88);
    return puck;
  });
  const guideMat = new THREE.MeshBasicMaterial({
    color: "#fff2d2",
    transparent: true,
    opacity: 0.88,
  });
  const dashes = Array.from({ length: 33 }, () =>
    block(scene, guideMat, 0, surface + 0.006, 0, 0.11, 0.004, 0.022),
  );
  const landing = mesh(
    scene,
    new THREE.RingGeometry(0.105, 0.127, 32),
    new THREE.MeshBasicMaterial({ color: "#fff2d2", side: THREE.DoubleSide }),
    0,
    surface + 0.008,
    0,
    1,
    1,
    1,
  );
  landing.rotation.x = -Math.PI / 2;

  const shotRing = mesh(
    scene,
    new THREE.RingGeometry(0.155, 0.179, 32),
    new THREE.MeshBasicMaterial({ color: "#fff3c6", side: THREE.DoubleSide }),
    0,
    surface + 0.009,
    0,
    1,
    1,
    1,
  );
  shotRing.rotation.x = -Math.PI / 2;

  const size = new THREE.Vector2();
  function render(
    now,
    delta,
    pucks,
    guide,
    distance,
    shot,
    overhead,
    recordAngle,
  ) {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.getSize(size);
    if (size.x !== clientWidth || size.y !== clientHeight) {
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
    }

    const puckX = (shot?.x ?? TABLE.launch) / 100;
    const puckZ = (shot?.y ?? TABLE.width / 2) / 100 - width / 2;
    const scoringBlend = overhead
      ? 1
      : shot
        ? THREE.MathUtils.smoothstep(puckX, 6.05, 8.15)
        : 0;
    if (shot && !overhead) {
      eye.set(puckX - 1.62, 2.15, puckZ);
      target.set(puckX + 0.62, surface, puckZ);
    } else {
      eye.copy(aimEye);
      target.copy(aimTarget);
    }
    eye.lerp(scoringEye, scoringBlend);
    target.lerp(scoringTarget, scoringBlend);
    const follow = 1 - Math.exp(-delta * 9);
    camera.position.lerp(eye, follow);
    look.lerp(target, follow);
    camera.lookAt(look);
    const roomFov = THREE.MathUtils.radToDeg(
      2 * Math.atan(0.39 / camera.aspect),
    );
    const aimFov = Math.max(camera.aspect < 1.45 ? 58 : 48, roomFov);
    const scoringFov = camera.aspect < 0.85 ? 70 : 59;
    const fov = THREE.MathUtils.lerp(aimFov, scoringFov, scoringBlend);
    camera.fov = THREE.MathUtils.lerp(camera.fov, fov, follow);
    camera.updateProjectionMatrix();
    shotRing.visible = Boolean(shot && !shot.out);
    shotRing.position.set(puckX, surface + 0.009, puckZ);

    const inPlay = pucks.filter((puck) => !puck.out);
    if (guide)
      inPlay.push({ x: TABLE.launch, y: TABLE.width / 2, team: guide.team });
    puckMeshes.forEach((mesh, i) => {
      const puck = inPlay[i];
      mesh.visible = Boolean(puck);
      if (!puck) return;
      mesh.position.set(puck.x / 100, surface, puck.y / 100 - width / 2);
      mesh.children[2].material = puckMats[puck.team];
    });
    const angle = ((guide?.aim ?? 0) * Math.PI) / 180;
    for (const [i, dash] of dashes.entries()) {
      const x = TABLE.launch / 100 + 0.23 + i * 0.28;
      const z = (x - TABLE.launch / 100) * Math.tan(angle);
      dash.visible = Boolean(guide) && Math.abs(z) < width / 2 - 0.05;
      dash.position.set(x, surface + 0.006, z);
      dash.rotation.y = -angle;
    }
    const targetX = TABLE.launch / 100 + Math.cos(angle) * distance;
    const targetZ = Math.sin(angle) * distance;
    landing.visible =
      Boolean(guide) &&
      distance > 0.21 &&
      targetX < length &&
      Math.abs(targetZ) < width / 2;
    landing.position.set(targetX, surface + 0.009, targetZ);
    const t = now / 1000;
    if (activeRoom === "cabin") updateSnow(now);
    if (activeRoom === "sunroom") updateRain(now);
    flames.forEach((flame, i) => {
      const layer = i % 3;
      const wave = t * (4.1 + layer * 0.7) + Math.floor(i / 3) * 1.8;
      flame.scale.y =
        (0.87 - layer * 0.24) *
        (1 + 0.24 * Math.sin(wave) + 0.13 * Math.cos(wave * 1.7));
      flame.rotation.z = Math.sin(wave * 0.83) * 0.19;
    });
    sparks.forEach((spark, i) => {
      const age = (t * 0.78 + i * 0.318) % 1;
      spark.position.x =
        Math.sin(i * 7) * 0.58 + Math.sin(t * 3 + i) * age * 0.12;
      spark.position.y = 0.43 + age * 0.98;
      spark.visible = age < 0.8;
    });
    const glow =
      activeRoom === "sunroom" ? 12 : activeRoom === "cabin" ? 37 : 34;
    firelight.intensity = glow + 4 * Math.sin(t * 6) + 2 * Math.cos(t * 11);
    recordPlayers[activeRoom].record.rotation.y = recordAngle;
    renderer.render(scene, camera);
  }

  function setRoom(room) {
    activeRoom = room;
    fireAnchors[room].add(fireRig);
    for (const [name, decoration] of Object.entries(rooms)) {
      decoration.visible = name === room;
    }
    const palettes = {
      study: ["#263d36", "#4a251a", "#ffe0b2", "#fff1d5", "#cfb696"],
      cabin: ["#775035", "#71462e", "#e8dddc", "#ffe0bb", "#aa9788"],
      sunroom: ["#5c7060", "#a4ae99", "#d0e2dd", "#e0efe6", "#d0c0a5"],
    };
    const [walls, roof, sky, light, stone] = palettes[room];
    wall.color.set(walls);
    ceiling.color.set(roof);
    ambient.color.set(sky);
    fill.color.set(light);
    marble.color.set(stone);
  }
  setRoom("study");

  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) {
      mat.map?.dispose();
      mat.dispose();
    }
    puckMats.forEach((mat) => mat.dispose());
    renderer.dispose();
  }
  return { render, setRoom, recordPosition, recordAt, dispose };
}
