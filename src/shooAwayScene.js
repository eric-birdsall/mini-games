import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import colormap from "./assets/food/colormap.png";
import { createCritter, loadCritter } from "./avatars.js";
import { COLORS } from "../shared/avatars.js";
import {
  BLANKET,
  PITCH,
  REACH,
  RETURN_TIME,
  SNACKS,
  at,
  random,
} from "../shared/shooAway.js";

// The picnic seen from where you sit: the middle of the blanket, looking out
// across the lawn. Turning is the camera's yaw (see shared/shooAway.js
// for how angles map onto the ground).

const SNACK_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob("./assets/food/*.glb", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  )
    .map(([path, url]) => [path.match(/([^/]+)\.glb$/)[1], url])
    .filter(([id]) => SNACKS.includes(id)),
);

const EYE = 1.05; // sitting down
const SNACK_SIZE = 0.3;
const SQUIRREL_SCALE = 0.36; // critters are built 1.78 tall
const SKY = "#bfe3ff";
// Your arm, in the camera's space: the shoulder sits low and to the right,
// and the arm rests pointing forward and down so only the paw peeks in.
const SHOULDER = new T.Vector3(0.21, -0.21, -0.2);
const ARM_LENGTH = 0.3;
const REST = new T.Vector3(-0.1, -0.35, -1).normalize();
const SWAT_TIME = 0.42;
const FORWARD = new T.Vector3(0, 0, -1);
const UP = new T.Vector3(0, 1, 0);

// Cut the right arm (with its paw) out of a character's model: the
// triangles skinned to the arm_R bone, in the bind pose, moved so the
// shoulder is at the origin and the arm points down -z, ARM_LENGTH long.
function cutArm(asset) {
  let skinned = null;
  asset.scene.traverse((node) => {
    if (node.isSkinnedMesh && !skinned) skinned = node;
  });
  const bones = skinned?.skeleton.bones ?? [];
  const arm = bones.findIndex((b) => b.name === "arm_R");
  if (arm < 0) return null;
  const g = skinned.geometry;
  const { position, normal, uv, color, skinIndex, skinWeight } = g.attributes;
  const boneOf = (i) => {
    let best = 0;
    for (let k = 1; k < 4; k++)
      if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best))
        best = k;
    return skinIndex.getComponent(i, best);
  };
  const index = g.index ? g.index.array : [...Array(position.count).keys()];
  const verts = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    if (tri.every((i) => boneOf(i) === arm)) verts.push(...tri);
  }
  if (!verts.length) return null;
  const out = new T.BufferGeometry();
  const copy = (attr, size) =>
    new T.Float32BufferAttribute(
      verts.flatMap((i) =>
        Array.from({ length: size }, (_, k) => attr.getComponent(i, k)),
      ),
      size,
    );
  out.setAttribute("position", copy(position, 3));
  if (normal) out.setAttribute("normal", copy(normal, 3));
  if (uv) out.setAttribute("uv", copy(uv, 2));
  if (color) out.setAttribute("color", copy(color, color.itemSize));
  // Into the bind pose's space, then shoulder to the origin.
  out.applyMatrix4(skinned.bindMatrix);
  const shoulder = new T.Vector3().applyMatrix4(
    skinned.skeleton.boneInverses[arm].clone().invert(),
  );
  out.translate(-shoulder.x, -shoulder.y, -shoulder.z);
  // The paw is the far end.
  const p = out.attributes.position;
  const tip = new T.Vector3();
  const v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.lengthSq() > tip.lengthSq()) tip.copy(v);
  }
  const length = tip.length() || 1;
  out.applyQuaternion(
    new T.Quaternion().setFromUnitVectors(tip.normalize(), FORWARD),
  );
  // A little slimmer than the chibi original, so it reads as an arm.
  const k = ARM_LENGTH / length;
  out.scale(k * 0.72, k * 0.72, k);
  out.computeBoundingBox();
  const material = skinned.material.clone();
  return new T.Mesh(out, material);
}

function gingham() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff6ec";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#e5484d99";
  g.fillRect(0, 0, 32, 64);
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#d63a40";
  g.fillRect(0, 0, 32, 32);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter;
  texture.anisotropy = 8;
  return texture;
}

function grass() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#7cbf55";
  g.fillRect(0, 0, 256, 256);
  const rand = random(17);
  for (let i = 0; i < 2600; i++) {
    const shade = rand();
    g.fillStyle =
      shade < 0.5 ? "#6aae47" : shade < 0.85 ? "#8ccc62" : "#a5d977";
    g.fillRect(rand() * 256, rand() * 256, 2, 3 + rand() * 4);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(30, 30);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// A soft round shadow to sit things on the ground.
function blob() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#0007");
  grad.addColorStop(1, "#0000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

export function createShooAwayScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.background = new T.Color(SKY);
  scene.fog = new T.Fog(SKY, 18, 46);
  scene.add(new T.HemisphereLight("#fff8e6", "#5d8a3e", 1.7));
  const sun = new T.DirectionalLight("#fff1d0", 2);
  sun.position.set(-6, 12, 4);
  scene.add(sun);

  const camera = new T.PerspectiveCamera(70, 1, 0.05, 80);
  camera.rotation.order = "YXZ";
  camera.position.set(0, EYE, 0);
  camera.rotation.x = PITCH;
  scene.add(camera);

  const disposables = [];
  const keep = (thing) => (disposables.push(thing), thing);

  // The lawn and the blanket.
  const lawn = new T.Mesh(
    keep(new T.CircleGeometry(60, 48)),
    keep(new T.MeshLambertMaterial({ map: keep(grass()) })),
  );
  lawn.rotation.x = -Math.PI / 2;
  scene.add(lawn);
  const blanket = new T.Mesh(
    keep(new T.PlaneGeometry(BLANKET * 2, BLANKET * 2)),
    keep(new T.MeshLambertMaterial({ map: keep(gingham()) })),
  );
  blanket.rotation.x = -Math.PI / 2;
  blanket.rotation.z = 0.12;
  blanket.position.y = 0.01;
  scene.add(blanket);

  const shadowTexture = keep(blob());
  const shadowGeometry = keep(new T.PlaneGeometry(1, 1));
  const shadowMaterial = keep(
    new T.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  const shadow = (size) => {
    const mesh = new T.Mesh(shadowGeometry, shadowMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.scale.setScalar(size);
    return mesh;
  };

  // Trees all the way round, so you can tell which way you're facing.
  const rand = random(42);
  const trunkGeometry = keep(new T.CylinderGeometry(0.22, 0.32, 2.4, 7));
  const trunkMaterial = keep(new T.MeshLambertMaterial({ color: "#7a5230" }));
  const leafGeometry = keep(new T.IcosahedronGeometry(1.6, 1));
  const leafMaterials = ["#3f8f3a", "#4fa245", "#5bb04c", "#e08a2c"].map(
    (color) => keep(new T.MeshLambertMaterial({ color, flatShading: true })),
  );
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const p = at(angle, 15 + rand() * 9);
    const tree = new T.Group();
    const trunk = new T.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.2;
    const top = new T.Mesh(
      leafGeometry,
      leafMaterials[i % 7 === 3 ? 3 : Math.floor(rand() * 3)],
    );
    top.position.y = 3.2;
    top.scale.set(1, 0.9 + rand() * 0.4, 1);
    tree.add(trunk, top, shadow(4));
    tree.position.set(p.x, 0, p.z);
    tree.scale.setScalar(0.8 + rand() * 0.6);
    tree.rotation.y = rand() * 6;
    scene.add(tree);
  }
  // A few low bushes out on the lawn for squirrels to scurry past.
  const bushGeometry = keep(new T.IcosahedronGeometry(0.5, 1));
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + rand() * 0.6;
    const p = at(angle, 6.5 + rand() * 3);
    const bush = new T.Mesh(
      bushGeometry,
      leafMaterials[Math.floor(rand() * 3)],
    );
    bush.position.set(p.x, 0.25, p.z);
    bush.scale.set(1.3, 0.7, 1);
    const under = shadow(1.6);
    under.position.set(p.x, 0.02, p.z);
    scene.add(bush, under);
  }
  // Flowers dotted about.
  const flowerGeometry = keep(new T.SphereGeometry(0.04, 6, 4));
  const flowerMaterials = ["#ffffff", "#ffd93b", "#ff7eb6", "#b88cff"].map(
    (color) => keep(new T.MeshLambertMaterial({ color })),
  );
  for (let i = 0; i < 70; i++) {
    const p = at(rand() * Math.PI * 2, 2.4 + rand() * 12);
    const f = new T.Mesh(flowerGeometry, flowerMaterials[i % 4]);
    f.position.set(p.x, 0.06, p.z);
    scene.add(f);
  }
  // A picnic basket on the corner of the blanket.
  const basket = new T.Group();
  const wicker = keep(new T.MeshLambertMaterial({ color: "#c58b4a" }));
  const body = new T.Mesh(keep(new T.BoxGeometry(0.5, 0.28, 0.34)), wicker);
  body.position.y = 0.14;
  const handle = new T.Mesh(
    keep(new T.TorusGeometry(0.18, 0.025, 6, 16, Math.PI)),
    wicker,
  );
  handle.position.y = 0.28;
  basket.add(body, handle, shadow(0.8));
  const corner = at(Math.PI * 0.75, 2.05);
  basket.position.set(corner.x, 0.01, corner.z);
  basket.rotation.y = 0.6;
  basket.scale.setScalar(0.8);
  scene.add(basket);

  // Snacks.
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) =>
    url.endsWith("colormap.png") ? colormap : url,
  );
  const loader = new GLTFLoader(manager);
  const snackModels = new Map(); // snack id -> group
  const snackRoots = [];
  for (let i = 0; i < SNACKS.length; i++) {
    const root = new T.Group();
    const plate = new T.Mesh(
      keep(new T.CylinderGeometry(0.22, 0.19, 0.025, 20)),
      keep(new T.MeshLambertMaterial({ color: "#ffffff" })),
    );
    plate.position.y = 0.0125;
    const holder = new T.Group();
    root.add(holder);
    scene.add(root);
    // The plate stays put; an empty one shows what's been taken.
    const plateRoot = new T.Group();
    plateRoot.add(plate);
    scene.add(plateRoot);
    snackRoots.push({ root, holder, plate: plateRoot });
  }
  Promise.all(
    SNACKS.map((kind, i) =>
      loader
        .loadAsync(SNACK_URLS[kind])
        .then((gltf) => {
          const model = gltf.scene;
          const box = new T.Box3().setFromObject(model);
          const size = box.getSize(new T.Vector3());
          const centre = box.getCenter(new T.Vector3());
          model.position.set(-centre.x, -box.min.y, -centre.z);
          const s = SNACK_SIZE / Math.max(size.x, size.z, size.y);
          snackRoots[i].holder.scale.setScalar(s);
          snackRoots[i].holder.add(model);
          snackModels.set(i, model);
        })
        .catch((error) => console.warn(`Shoo Away: no ${kind}`, error)),
    ),
  );

  // How far your arm reaches, marked on the lawn.
  const reachRing = new T.Mesh(
    keep(new T.RingGeometry(REACH - 0.035, REACH + 0.035, 96)),
    keep(
      new T.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    ),
  );
  reachRing.rotation.x = -Math.PI / 2;
  reachRing.position.y = 0.025;
  scene.add(reachRing);

  // Your arm: cut from your character, with a sleeve in your colour.
  const shoulder = new T.Group();
  shoulder.position.copy(SHOULDER);
  camera.add(shoulder);
  const armHolder = new T.Group();
  shoulder.add(armHolder);
  const sleeveColor = COLORS[avatar?.color] ?? COLORS.sunshine;
  const sleeveMaterial = keep(
    new T.MeshLambertMaterial({ color: sleeveColor }),
  );
  function fitArm(mesh) {
    armHolder.clear();
    armHolder.add(mesh);
    // A short sleeve over the top of the arm.
    // As thick as the top of the arm, near the shoulder.
    const p = mesh.geometry.attributes.position;
    let thick = 0;
    for (let i = 0; i < p.count; i++)
      if (p.getZ(i) > -0.15)
        thick = Math.max(thick, Math.hypot(p.getX(i), p.getY(i)));
    thick = Math.min(0.11, thick * 1.1 || 0.08);
    const sleeve = new T.Mesh(
      keep(
        new T.CylinderGeometry(
          thick * 0.98,
          thick * 1.06,
          ARM_LENGTH * 0.42,
          16,
        ),
      ),
      sleeveMaterial,
    );
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = -ARM_LENGTH * 0.19;
    armHolder.add(sleeve);
  }
  {
    // Until your character loads (or if it can't): a plain round arm.
    const plain = new T.Mesh(
      keep(new T.CapsuleGeometry(0.06, ARM_LENGTH - 0.12, 4, 10)),
      keep(new T.MeshLambertMaterial({ color: "#f2c99a" })),
    );
    plain.geometry.rotateX(Math.PI / 2);
    plain.geometry.translate(0, 0, -ARM_LENGTH / 2);
    plain.geometry.computeBoundingBox();
    fitArm(plain);
  }
  let armMesh = null;
  loadCritter(avatar?.character ?? "bear").then((asset) => {
    if (!asset || disposed) return;
    armMesh = cutArm(asset);
    if (armMesh) fitArm(armMesh);
  });
  const qRest = new T.Quaternion().setFromUnitVectors(FORWARD, REST);
  shoulder.quaternion.copy(qRest);
  let swatT = -1; // seconds into a swat, or -1
  const aim = new T.Vector3();
  const q = new T.Quaternion();
  const qFrom = new T.Quaternion();
  const qTo = new T.Quaternion();
  const turned = (dir, by) =>
    new T.Quaternion().setFromUnitVectors(
      FORWARD,
      dir.clone().applyAxisAngle(UP, by).normalize(),
    );
  let qWind = qRest.clone();
  let qSweep = qRest.clone();
  function poseArm(dt) {
    if (swatT < 0) {
      // Resting, with a gentle bob.
      shoulder.quaternion.slerp(qRest, Math.min(1, dt * 10));
      armHolder.scale.z = 1;
      shoulder.position.y = SHOULDER.y + Math.sin(time * 2) * 0.006;
      return;
    }
    swatT += dt;
    const k = swatT / SWAT_TIME;
    const ease = (x) => 1 - (1 - x) ** 2;
    if (k < 0.22) {
      qFrom.copy(qRest);
      qTo.copy(qWind);
      q.slerpQuaternions(qFrom, qTo, ease(k / 0.22));
      armHolder.scale.z = 1 + 0.4 * (k / 0.22);
    } else if (k < 0.55) {
      q.slerpQuaternions(qWind, qSweep, ease((k - 0.22) / 0.33));
      armHolder.scale.z = 1.4;
    } else if (k < 1) {
      q.slerpQuaternions(qSweep, qRest, ease((k - 0.55) / 0.45));
      armHolder.scale.z = 1.4 - 0.4 * ((k - 0.55) / 0.45);
    } else {
      q.copy(qRest);
      swatT = -1;
      armHolder.scale.z = 1;
    }
    shoulder.quaternion.copy(q);
  }
  let disposed = false;

  // Squirrels and foxes: one rig per critter on the lawn, reused.
  const critterAssets = {};
  for (const kind of ["squirrel", "fox"])
    loadCritter(kind).then((asset) => (critterAssets[kind] = asset));
  const fallbackGeometry = keep(new T.CapsuleGeometry(0.4, 0.6, 4, 8));
  const fallbackMaterials = {
    squirrel: keep(new T.MeshLambertMaterial({ color: "#c97f1c" })),
    fox: keep(new T.MeshLambertMaterial({ color: "#e8661f" })),
  };
  const rigs = new Map(); // squirrel id -> { root, rig, ... }
  // A ring under a squirrel that's close enough to shoo.
  const markerGeometry = keep(new T.RingGeometry(0.3, 0.4, 32));
  const markerMaterial = keep(
    new T.MeshBasicMaterial({
      color: "#ffe14d",
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  // A "!" over the head of a squirrel you've spotted.
  const alertTexture = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d");
    g.font = "900 112px Fredoka, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 14;
    g.strokeStyle = "#7a2e1d";
    g.strokeText("!", 32, 68);
    g.fillStyle = "#ffd23f";
    g.fillText("!", 32, 68);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  keep(alertTexture);
  const alertMaterial = keep(
    new T.SpriteMaterial({ map: alertTexture, depthWrite: false }),
  );
  const ALERT_Y = 0.88;
  function makeSquirrel(kind = "squirrel") {
    const root = new T.Group();
    const body = new T.Group();
    body.scale.setScalar(SQUIRREL_SCALE);
    body.rotation.y = Math.PI; // the critter rigs face the other way
    const marker = new T.Mesh(markerGeometry, markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.03;
    marker.visible = false;
    const alert = new T.Sprite(alertMaterial);
    alert.position.y = ALERT_Y;
    alert.visible = false;
    root.add(body, shadow(0.55), marker, alert);
    const entry = {
      root,
      body,
      marker,
      alert,
      alertT: 0,
      rig: null,
      action: null,
      hop: 0,
      shake: 0,
    };
    const asset = critterAssets[kind];
    if (asset) {
      entry.rig = createCritter(asset);
      body.add(entry.rig.pivot);
    } else {
      const capsule = new T.Mesh(
        fallbackGeometry,
        fallbackMaterials[kind] ?? fallbackMaterials.squirrel,
      );
      capsule.position.y = 0.7;
      body.add(capsule);
    }
    scene.add(root);
    return entry;
  }
  function play(entry, state, speed = 1) {
    const action = entry.rig?.actions[state] ?? entry.rig?.actions.idle;
    if (!action) return;
    action.timeScale = speed;
    if (action === entry.action) return;
    entry.action?.fadeOut(0.12);
    action.reset().fadeIn(0.12).play();
    entry.action = action;
  }
  function removeSquirrel(id) {
    const entry = rigs.get(id);
    if (!entry) return;
    if (entry.rig) {
      entry.rig.mixer.stopAllAction();
      entry.rig.mixer.uncacheRoot(entry.rig.model);
      entry.rig.model.traverse((node) => {
        if (node.isMesh) node.material.dispose();
      });
    }
    scene.remove(entry.root);
    rigs.delete(id);
  }

  // Puffs of dust when one is shooed.
  const puffGeometry = keep(new T.SphereGeometry(0.12, 6, 4));
  const puffMaterial = keep(
    new T.MeshLambertMaterial({
      color: "#f3ead6",
      transparent: true,
      depthWrite: false,
    }),
  );
  const puffs = [];

  let time = 0;
  let width = 0;
  let height = 0;
  function fit() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // At least ~80° across, so a phone held upright still sees enough.
      const across = T.MathUtils.degToRad(80);
      const fov = 2 * Math.atan(Math.tan(across / 2) / camera.aspect);
      camera.fov = T.MathUtils.clamp(T.MathUtils.radToDeg(fov), 62, 100);
      camera.updateProjectionMatrix();
    }
    return true;
  }

  const v = new T.Vector3();
  return {
    camera,
    arm: shoulder,
    renderer,
    // Where a point on the lawn lands on screen (CSS pixels), and whether
    // it's in front of you.
    screenOf(x, y, z) {
      v.set(x, y, z).project(camera);
      return {
        x: ((v.x + 1) / 2) * width,
        y: ((1 - v.y) / 2) * height,
        visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05,
      };
    },
    // Pixels per metre for something `d` metres away.
    scaleAt(d) {
      const f = height / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
      return f / Math.max(0.3, d);
    },
    // Swing your arm towards a point on the screen (CSS pixels).
    swat(x, y) {
      v.set((x / width) * 2 - 1, 1 - (y / height) * 2, 0.5).unproject(camera);
      camera.updateMatrixWorld();
      const local = camera.worldToLocal(v.clone());
      aim.copy(local).normalize().multiplyScalar(3).sub(SHOULDER).normalize();
      // Wind up out to the right, then sweep across through the target.
      qWind = turned(aim.clone().add(new T.Vector3(0, 0.12, 0)), -0.4);
      qSweep = turned(aim, 0.35);
      swatT = 0;
    },
    shoo(id) {
      const entry = rigs.get(id);
      if (!entry) return;
      entry.hop = 1;
      entry.shake = 0.35;
      for (let i = 0; i < 8; i++) {
        const puff = new T.Mesh(puffGeometry, puffMaterial);
        puff.position.copy(entry.root.position).y += 0.15;
        const a = (i / 8) * Math.PI * 2;
        puff.userData.v = new T.Vector3(
          Math.cos(a) * 1.2,
          0.8 + Math.random() * 0.6,
          Math.sin(a) * 1.2,
        );
        puff.userData.age = 0;
        scene.add(puff);
        puffs.push(puff);
      }
    },
    reset() {
      for (const id of [...rigs.keys()]) removeSquirrel(id);
      for (const p of puffs.splice(0)) scene.remove(p);
    },
    // view: { picnic, yaw, pitch, inReach(squirrel) }
    draw(dt, view) {
      if (!fit()) return;
      time += dt;
      camera.rotation.y = view.yaw;
      camera.rotation.x = view.pitch ?? PITCH;
      poseArm(dt);
      const { picnic } = view;

      // Snacks: on the blanket, carried overhead, or hopping home.
      picnic.snacks.forEach((snack, i) => {
        const r = snackRoots[i];
        r.plate.position.set(snack.home.x, 0.01, snack.home.z);
        r.root.visible = snack.state !== "gone";
        let y = 0.03;
        if (snack.state === "carried") y = 0.5 + Math.sin(time * 14 + i) * 0.03;
        else if (snack.state === "dropped") {
          const k = Math.min(1, snack.returnT / RETURN_TIME);
          y = 0.03 + Math.sin(Math.PI * k) * 0.7;
          r.root.rotation.y += dt * 9;
        } else r.root.rotation.y = snack.angle;
        r.root.position.set(snack.x, y, snack.z);
      });

      // Squirrels.
      const seen = new Set();
      for (const s of picnic.squirrels) {
        seen.add(s.id);
        let entry = rigs.get(s.id);
        if (!entry) {
          entry = makeSquirrel(s.kind);
          entry.root.rotation.y = s.heading;
          rigs.set(s.id, entry);
        }
        entry.root.position.set(s.x, 0, s.z);
        // Always facing the blanket (see faceBlanket in the rules).
        entry.root.rotation.y = s.heading;
        // "!" pops up over a squirrel the moment you spot it.
        const spotted = !!s.frozen && s.state !== "shooed";
        entry.alertT = spotted ? entry.alertT + dt : 0;
        entry.alert.visible = spotted;
        if (spotted) {
          const k = Math.min(1, entry.alertT / 0.22);
          const pop = k < 1 ? Math.sin(k * Math.PI * 0.75) * 1.25 : 1;
          entry.alert.scale.set(0.16 * pop, 0.32 * pop, 1);
          entry.alert.position.y =
            ALERT_Y + entry.body.position.y + Math.sin(time * 5) * 0.02;
        }
        // A hop and a shake when shooed.
        entry.hop = Math.max(0, entry.hop - dt * 2.2);
        entry.shake = Math.max(0, entry.shake - dt);
        entry.body.position.y = Math.sin(Math.PI * entry.hop) * 0.45;
        entry.body.rotation.z = Math.sin(time * 50) * entry.shake * 0.6;
        // A little hunch while grabbing, nose down while sniffing.
        entry.body.rotation.x =
          s.state === "grab" ? 0.35 + Math.sin(time * 20) * 0.08 : 0;
        if (s.state === "dash") play(entry, "run", 1.1);
        else if (s.state === "flee") play(entry, "run", 1.3);
        else if (s.state === "shooed") play(entry, "run", 1.6);
        else play(entry, "idle", s.state === "grab" ? 2.5 : 1.4);
        entry.marker.visible =
          s.state !== "shooed" && !!view.inReach?.(s) && !!s.frozen;
        if (entry.marker.visible)
          entry.marker.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
        // Watched squirrels freeze like statues, mid-step.
        if (s.frozen && s.state !== "shooed") continue;
        if (!entry.rig)
          entry.body.position.y += Math.abs(Math.sin(time * 12)) * 0.05;
        entry.rig?.mixer.update(dt);
      }
      for (const id of [...rigs.keys()]) if (!seen.has(id)) removeSquirrel(id);

      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.userData.age += dt;
        p.userData.v.y -= 3 * dt;
        p.position.addScaledVector(p.userData.v, dt);
        p.scale.setScalar(1 + p.userData.age * 3);
        if (p.userData.age > 0.6) {
          scene.remove(p);
          puffs.splice(i, 1);
        }
      }
      puffMaterial.opacity = 0.85;
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      this.reset();
      armMesh?.geometry.dispose();
      armMesh?.material.dispose();
      for (const thing of disposables) thing.dispose();
      snackModels.forEach((model) =>
        model.traverse((node) => {
          node.geometry?.dispose();
          node.material?.dispose?.();
        }),
      );
      renderer.dispose();
    },
  };
}
