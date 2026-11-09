import * as T from "three";
import { FAR_Z, NEAR_Z, targetX } from "../shared/targetBlaster.js";

// You stand on the patio looking down the yard. Cans and bottles sit on a
// table and a shelf; bullseyes hang from rails and slide back and forth.
const EYE = new T.Vector3(0, 1.5, 1.2);
const LOOK = new T.Vector3(0, 1.45, -10);
const NEAR_TOP = 0.95;
const FAR_TOP = 1.45;
const FENCE_Z = -17;
const WATER_SPEED = 26;
const BOARD_RADIUS = 0.45;
const GRAVITY = 9.8;

export function createTargetBlasterScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe6f5");
  scene.fog = new T.Fog("#bfe6f5", 28, 60);
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 120);
  camera.position.copy(EYE);
  camera.lookAt(LOOK);
  scene.add(camera);

  scene.add(new T.HemisphereLight("#fff7df", "#6d9a52", 2.1));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.position.set(6, 12, 4);
  sun.target.position.set(0, 0, -11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -11,
    right: 11,
    top: 10,
    bottom: -10,
    far: 40,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const mat = (color, extra = {}) =>
    new T.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  const cylinder = (rt, rb, h, material, x, y, z, parent, segments = 16) =>
    mesh(
      new T.CylinderGeometry(rt, rb, h, segments),
      material,
      x,
      y,
      z,
      parent,
    );

  // Yard: grass, patio, back fence and trees.
  box(120, 0.2, 120, mat("#88b35a"), 0, -0.1, -20).castShadow = false;
  const patio = box(5, 0.04, 2.4, mat("#c9b9a0"), 0, 0.02, 1.4);
  patio.castShadow = false;
  const fenceWood = [mat("#b98a5a"), mat("#a97b4e")];
  for (let i = 0; i < 46; i++)
    box(0.48, 1.8, 0.08, fenceWood[i % 2], -11.25 + i * 0.5, 0.9, FENCE_Z);
  box(23, 0.1, 0.06, mat("#8f6741"), 0, 1.45, FENCE_Z + 0.07);
  box(23, 0.1, 0.06, mat("#8f6741"), 0, 0.4, FENCE_Z + 0.07);
  const trunk = mat("#7c5636");
  const leaves = [mat("#5a8c47"), mat("#6f9d4c"), mat("#4f7f41")];
  for (let i = 0; i < 11; i++) {
    const x = -15 + i * 3 + Math.sin(i * 3.1) * 0.8;
    const z = FENCE_Z - 2.5 - (i % 3) * 1.6;
    const h = 2.4 + (i % 4) * 0.5;
    cylinder(0.18, 0.26, h, trunk, x, h / 2, z, scene, 8);
    const crown = mesh(
      new T.IcosahedronGeometry(1.7 + (i % 3) * 0.35, 1),
      leaves[i % 3],
      x,
      h + 1.3,
      z,
    );
    crown.scale.y = 1.15;
  }
  for (const [x, z] of [
    [-6.5, -6],
    [6.8, -9.5],
    [-7.5, -15],
    [7.2, -16],
  ]) {
    const bush = mesh(new T.IcosahedronGeometry(0.9, 1), leaves[1], x, 0.55, z);
    bush.scale.set(1.3, 0.75, 1);
  }

  // Near table (cans and bottles) and far shelf.
  const plank = mat("#a8774a");
  const leg = mat("#7a5434");
  box(6.6, 0.1, 0.7, plank, 0, NEAR_TOP - 0.05, NEAR_Z);
  for (const x of [-3.1, 3.1])
    for (const z of [NEAR_Z + 0.25, NEAR_Z - 0.25])
      box(0.1, NEAR_TOP - 0.1, 0.1, leg, x, (NEAR_TOP - 0.1) / 2, z);
  box(7.6, 0.1, 0.5, plank, 0, FAR_TOP - 0.05, FAR_Z);
  for (const x of [-3.7, 0, 3.7])
    box(0.12, FAR_TOP - 0.1, 0.12, leg, x, (FAR_TOP - 0.1) / 2, FAR_Z);

  // Bullseye face: red and white rings drawn once into a texture.
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = faceCanvas.height = 256;
  {
    const g = faceCanvas.getContext("2d");
    const rings = [
      [1, "#e8473b"],
      [0.82, "#fbf7ef"],
      [0.65, "#e8473b"],
      [0.47, "#fbf7ef"],
      [0.3, "#e8473b"],
    ];
    for (const [r, color] of rings) {
      g.beginPath();
      g.arc(128, 128, r * 126, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    }
    g.beginPath();
    g.arc(128, 128, 10, 0, Math.PI * 2);
    g.fillStyle = "#fff3a6";
    g.fill();
  }
  const faceTexture = new T.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = T.SRGBColorSpace;
  const faceMaterial = mat("#ffffff", { map: faceTexture, roughness: 0.55 });

  const hitMaterial = new T.MeshBasicMaterial({
    visible: false,
    side: T.DoubleSide,
  });
  const canColors = ["#d8423a", "#3e8ed0", "#4caf62", "#f2b632"].map((c) =>
    mat(c, { metalness: 0.45, roughness: 0.35 }),
  );
  const tin = mat("#d3d8db", { metalness: 0.75, roughness: 0.3 });
  const label = mat("#f4f1e8");
  const glass = [
    mat("#4fa46b", { transparent: true, opacity: 0.78, roughness: 0.15 }),
    mat("#8a5b2b", { transparent: true, opacity: 0.8, roughness: 0.15 }),
    mat("#79b9d8", { transparent: true, opacity: 0.7, roughness: 0.1 }),
  ];
  const rope = mat("#d9c8a2");
  const railMaterial = mat("#59616a", { metalness: 0.4 });

  // Each target: a group placed at its base, a model inside it that falls or
  // swings when hit, and an invisible hit box the water is traced against.
  let targets = [];
  const rails = new T.Group();
  scene.add(rails);

  function buildTarget(plan, index) {
    const s = plan.scale;
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    let hit;
    if (plan.kind === "can") {
      const color = canColors[index % canColors.length];
      cylinder(0.11 * s, 0.11 * s, 0.34 * s, color, 0, 0.17 * s, 0, body, 20);
      cylinder(0.112 * s, 0.112 * s, 0.12 * s, label, 0, 0.17 * s, 0, body, 20);
      cylinder(0.1 * s, 0.11 * s, 0.02 * s, tin, 0, 0.35 * s, 0, body, 20);
      hit = box(0.3 * s, 0.4 * s, 0.3 * s, hitMaterial, 0, 0.2 * s, 0, body);
    } else if (plan.kind === "bottle") {
      const color = glass[index % glass.length];
      cylinder(0.09 * s, 0.09 * s, 0.3 * s, color, 0, 0.15 * s, 0, body, 18);
      cylinder(0.035 * s, 0.09 * s, 0.1 * s, color, 0, 0.35 * s, 0, body, 18);
      cylinder(0.035 * s, 0.035 * s, 0.1 * s, color, 0, 0.45 * s, 0, body, 12);
      cylinder(0.04 * s, 0.04 * s, 0.03 * s, tin, 0, 0.51 * s, 0, body, 12);
      cylinder(0.092 * s, 0.092 * s, 0.1 * s, label, 0, 0.14 * s, 0, body, 18);
      hit = box(
        0.26 * s,
        0.56 * s,
        0.26 * s,
        hitMaterial,
        0,
        0.27 * s,
        0,
        body,
      );
    } else {
      // Bullseye: a round board hung from a little trolley on a rail. The
      // body group is the hinge at the top of the board.
      const r = BOARD_RADIUS * s;
      const hang = 0.3;
      body.position.y = r + hang;
      const back = cylinder(
        r * 1.04,
        r * 1.04,
        0.06,
        mat("#8d6239"),
        0,
        0,
        0,
        body,
        40,
      );
      back.rotation.x = Math.PI / 2;
      back.position.y = -hang - r;
      const face = mesh(
        new T.CircleGeometry(r, 48),
        faceMaterial,
        0,
        -hang - r,
        0.032,
        body,
      );
      face.castShadow = false;
      for (const x of [-0.6, 0.6])
        cylinder(0.008, 0.008, hang + 0.05, rope, x * r, -hang / 2, 0, body, 5);
      box(r * 1.5, 0.08, 0.12, railMaterial, 0, 0.04, 0, root).position.y =
        r + hang + 0.04;
      hit = mesh(
        new T.CircleGeometry(r * 1.05, 24),
        hitMaterial,
        0,
        -hang - r,
        0.04,
        body,
      );
      hit.castShadow = hit.receiveShadow = false;
      // The rail this board slides along.
      const left = plan.x - plan.range - r - 0.4;
      const right = plan.x + plan.range + r + 0.4;
      const top = plan.y + r + hang + 0.12;
      const bar = cylinder(
        0.03,
        0.03,
        right - left,
        railMaterial,
        (left + right) / 2,
        top,
        plan.z - 0.08,
        rails,
        8,
      );
      bar.rotation.z = Math.PI / 2;
      for (const x of [left, right])
        cylinder(
          0.05,
          0.05,
          top + 0.05,
          railMaterial,
          x,
          (top + 0.05) / 2,
          plan.z - 0.08,
          rails,
          8,
        );
    }
    hit.castShadow = hit.receiveShadow = false;
    hit.userData.target = index;
    const baseY =
      plan.kind === "bullseye"
        ? plan.y - BOARD_RADIUS * s - 0.3
        : plan.z <= FAR_Z
          ? FAR_TOP
          : NEAR_TOP;
    root.position.set(plan.x, baseY, plan.z);
    scene.add(root);
    return {
      plan,
      root,
      body,
      hit,
      down: false,
      knockedAt: 0,
      revivedAt: -9,
      velocity: new T.Vector3(),
      spin: new T.Vector3(),
    };
  }

  function clearTargets() {
    for (const target of targets) {
      scene.remove(target.root);
      target.root.traverse((node) => node.geometry?.dispose());
    }
    for (const node of [...rails.children]) {
      rails.remove(node);
      node.geometry?.dispose();
    }
    targets = [];
  }

  // Water blaster held in the lower right of the view. Built pointing along
  // +z so lookAt aims it.
  const blaster = new T.Group();
  camera.add(blaster);
  const gun = new T.Group();
  blaster.add(gun);
  gun.scale.setScalar(0.26);
  const orange = mat("#ff8a2a", { roughness: 0.45 });
  const lime = mat("#7bd64a", { roughness: 0.45 });
  const purple = mat("#7b5cd6", { roughness: 0.45 });
  box(0.16, 0.18, 0.7, orange, 0, 0, 0.05, gun);
  const barrel = cylinder(0.045, 0.05, 0.42, lime, 0, 0.03, 0.56, gun, 14);
  barrel.rotation.x = Math.PI / 2;
  const nozzle = cylinder(0.03, 0.04, 0.06, purple, 0, 0.03, 0.79, gun, 12);
  nozzle.rotation.x = Math.PI / 2;
  const grip = box(0.12, 0.3, 0.14, purple, 0, -0.2, -0.15, gun);
  grip.rotation.x = -0.35;
  box(0.04, 0.1, 0.12, lime, 0, -0.12, 0.02, gun);
  // Tank on top: the water level shows the pressure.
  const tankGlass = mat("#dff4ff", {
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    depthWrite: false,
  });
  const tank = cylinder(0.085, 0.085, 0.42, tankGlass, 0, 0.17, -0.02, gun, 20);
  tank.rotation.x = Math.PI / 2;
  const tankWaterMaterial = mat("#3da3e8", {
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
    emissive: "#0b3d66",
  });
  const tankWater = new T.Group();
  tankWater.position.set(0, 0.17, -0.23);
  gun.add(tankWater);
  const water = cylinder(
    0.072,
    0.072,
    1,
    tankWaterMaterial,
    0,
    0,
    0.5,
    tankWater,
    20,
  );
  water.rotation.x = Math.PI / 2;
  water.castShadow = false;
  for (const z of [-0.23, 0.19])
    cylinder(0.092, 0.092, 0.025, purple, 0, 0.17, z, gun, 20).rotation.x =
      Math.PI / 2;
  // Pump handle under the barrel slides back and forth.
  const pumpHandle = new T.Group();
  gun.add(pumpHandle);
  cylinder(0.06, 0.06, 0.2, lime, 0, -0.06, 0.48, pumpHandle, 14).rotation.x =
    Math.PI / 2;
  for (let i = 0; i < 3; i++)
    cylinder(
      0.064,
      0.064,
      0.02,
      purple,
      0,
      -0.06,
      0.41 + i * 0.07,
      pumpHandle,
      14,
    ).rotation.x = Math.PI / 2;
  const muzzle = new T.Object3D();
  muzzle.position.set(0, 0.03, 0.84);
  gun.add(muzzle);
  gun.traverse((node) => {
    node.castShadow = false;
    node.receiveShadow = false;
  });

  // Water drops: a pool shared by the stream and the splashes.
  const dropGeometry = new T.SphereGeometry(1, 8, 6);
  const dropMaterial = new T.MeshStandardMaterial({
    color: "#7fd0ff",
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    emissive: "#1b6fa8",
    emissiveIntensity: 0.4,
  });
  const drops = Array.from({ length: 240 }, () => {
    const drop = new T.Mesh(dropGeometry, dropMaterial);
    drop.visible = false;
    drop.userData = {
      age: 0,
      life: 0,
      kind: "",
      from: new T.Vector3(),
      to: new T.Vector3(),
      velocity: new T.Vector3(),
      size: 0.03,
    };
    scene.add(drop);
    return drop;
  });
  let nextDrop = 0;
  const takeDrop = () => drops[nextDrop++ % drops.length];

  function splash(point, amount = 10, power = 1) {
    for (let i = 0; i < amount; i++) {
      const drop = takeDrop();
      const data = drop.userData;
      const angle = Math.random() * Math.PI * 2;
      const out = (0.6 + Math.random() * 1.4) * power;
      data.kind = "splash";
      data.age = 0;
      data.life = 0.45 + Math.random() * 0.35;
      data.size = 0.02 + Math.random() * 0.03;
      data.velocity.set(
        Math.cos(angle) * out,
        1 + Math.random() * 2.2 * power,
        Math.sin(angle) * out * 0.6 + 0.6,
      );
      drop.position.copy(point);
      drop.visible = true;
    }
  }

  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const aimPoint = new T.Vector3();
  const muzzleAt = new T.Vector3();
  const local = new T.Vector3();
  const size = new T.Vector2();
  const groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const fencePlane = new T.Plane(new T.Vector3(0, 0, 1), -FENCE_Z);
  let clock = 0;
  let pumpKick = -9;
  let fireKick = -9;
  let level = 1;
  let shownLevel = 1;

  function castRay(aim) {
    ndc.set(aim.x, aim.y);
    ray.setFromCamera(ndc, camera);
  }

  // Where the water ends up for this aim right now: a standing target if it
  // is in the way, otherwise the fence or the grass.
  function trace(aim) {
    castRay(aim);
    const boxes = targets.filter((t) => !t.down).map((t) => t.hit);
    const [hit] = ray.intersectObjects(boxes, false);
    if (hit) {
      const target = targets[hit.object.userData.target];
      let offset = 0;
      if (target.plan.kind === "bullseye") {
        local.copy(hit.point);
        hit.object.worldToLocal(local);
        offset =
          Math.hypot(local.x, local.y) / (BOARD_RADIUS * target.plan.scale);
      }
      return { id: target.plan.id, offset, point: hit.point.clone() };
    }
    const point = new T.Vector3();
    const toFence = ray.ray.intersectPlane(fencePlane, new T.Vector3());
    const toGround = ray.ray.intersectPlane(groundPlane, new T.Vector3());
    if (
      toGround &&
      (!toFence || toGround.distanceTo(EYE) < toFence.distanceTo(EYE))
    )
      point.copy(toGround);
    else if (toFence && toFence.y < 1.8) point.copy(toFence);
    else ray.ray.at(30, point);
    return { id: null, point };
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      camera.aspect = aspect;
      // Keep the whole table and the rails in view on tall, narrow screens.
      camera.fov = aspect < 1.3 ? Math.min(84, 42 * (1.3 / aspect) ** 0.7) : 42;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      // Tuck the blaster into the lower right corner of whatever fits.
      const depth = 0.75;
      const halfH = depth * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      const halfW = halfH * aspect;
      blaster.position.set(Math.min(0.3, halfW * 0.6), -halfH * 0.68, -depth);
    }
    return true;
  }

  return {
    setWave(plans) {
      clearTargets();
      targets = plans.map(buildTarget);
    },
    trace,
    // Fire one burst along the aim. Returns how long the water takes to get
    // there; the game checks what it hit when it lands.
    spray(aim) {
      const landing = trace(aim).point;
      muzzle.getWorldPosition(muzzleAt);
      const distance = muzzleAt.distanceTo(landing);
      const travel = T.MathUtils.clamp(distance / WATER_SPEED, 0.12, 0.9);
      fireKick = clock;
      for (let i = 0; i < 16; i++) {
        const drop = takeDrop();
        const data = drop.userData;
        data.kind = "stream";
        data.age = -i * 0.008;
        data.life = travel;
        data.size = 0.035 - i * 0.0012;
        data.from.copy(muzzleAt);
        data.to.copy(landing);
        data.to.x += (Math.random() - 0.5) * 0.08;
        data.to.y += (Math.random() - 0.5) * 0.08;
        data.arch = Math.min(0.5, distance * 0.025);
        drop.visible = false;
      }
      return travel;
    },
    splash(point, power = 1) {
      splash(point, 12, power);
    },
    // A sputter of drips when the tank is out of pressure.
    dribble() {
      muzzle.getWorldPosition(muzzleAt);
      for (let i = 0; i < 4; i++) {
        const drop = takeDrop();
        const data = drop.userData;
        data.kind = "splash";
        data.age = 0;
        data.life = 0.5;
        data.size = 0.012;
        data.velocity.set((Math.random() - 0.5) * 0.3, 0.3, -0.4);
        drop.position.copy(muzzleAt);
        drop.visible = true;
      }
    },
    pumped() {
      pumpKick = clock;
    },
    knock(id, point) {
      const target = targets.find((t) => t.plan.id === id);
      if (!target || target.down) return;
      target.down = true;
      target.knockedAt = clock;
      const side = T.MathUtils.clamp(
        point.x - target.root.position.x,
        -0.3,
        0.3,
      );
      if (target.plan.kind === "can")
        target.velocity.set(side * 4 + (Math.random() - 0.5), 3, -3.4);
      else target.velocity.set(side * 3, 1.6, -1.8);
      target.spin.set(
        -6 - Math.random() * 4,
        (Math.random() - 0.5) * 6,
        side * 10,
      );
      splash(point, 14, 1.2);
    },
    revive(id) {
      const target = targets.find((t) => t.plan.id === id);
      if (!target) return;
      target.down = false;
      target.revivedAt = clock;
      target.body.position.set(
        0,
        target.plan.kind === "bullseye" ? target.body.position.y : 0,
        0,
      );
      target.body.rotation.set(0, 0, 0);
      target.body.visible = true;
    },
    // Canvas-relative pixel position of a world point (for score popups).
    toScreen(point) {
      local.copy(point).project(camera);
      return {
        x: ((local.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - local.y) / 2) * canvas.clientHeight,
      };
    },
    draw(dt, view) {
      if (!resize()) return;
      clock += dt;
      level = view.pressure;

      // Targets: sliders glide; knocked ones fall or swing back.
      for (const target of targets) {
        const { plan, root, body } = target;
        root.position.x = targetX(plan, view.waveTime);
        const since = clock - target.knockedAt;
        if (plan.kind === "bullseye") {
          let swing = 0;
          if (target.down) {
            const f = Math.min(1, since / 0.3);
            swing =
              -1.35 * (1 - (1 - f) ** 3) +
              Math.sin(since * 14) * 0.12 * Math.max(0, 1 - since * 1.5);
          } else {
            const f = Math.min(1, (clock - target.revivedAt) / 0.45);
            swing =
              -1.35 * (1 - f) ** 2 + Math.sin(f * Math.PI * 3) * 0.08 * (1 - f);
            swing += Math.sin(clock * 2 + plan.id) * 0.03;
          }
          body.rotation.x = swing;
        } else if (target.down) {
          if (body.visible) {
            target.velocity.y -= GRAVITY * dt;
            body.position.addScaledVector(target.velocity, dt);
            body.rotation.x += target.spin.x * dt;
            body.rotation.y += target.spin.y * dt;
            body.rotation.z += target.spin.z * dt;
            const floor = -root.position.y + 0.1;
            if (body.position.y < floor) {
              body.position.y = floor;
              target.velocity.multiplyScalar(0.3);
              target.velocity.y = Math.abs(target.velocity.y);
            }
            if (since > 1.3) body.visible = false;
          }
        } else {
          // Pop back up when respawned.
          const f = Math.min(1, (clock - target.revivedAt) / 0.3);
          const pop = f < 1 ? 1 + Math.sin(f * Math.PI) * 0.25 : 1;
          body.scale.set(1, f < 1 ? f * pop : 1, 1);
        }
      }

      // Blaster: point at the aim, kick on fire, pump handle slides.
      castRay(view.aim);
      ray.ray.at(12, aimPoint);
      gun.lookAt(aimPoint);
      const kick = Math.max(0, 1 - (clock - fireKick) / 0.16);
      gun.position.z = -0.05 * kick;
      const stroke = clock - pumpKick;
      const slide =
        stroke < view.pumpTime
          ? Math.sin((stroke / view.pumpTime) * Math.PI)
          : 0;
      pumpHandle.position.z = -0.16 * slide;
      shownLevel += (level - shownLevel) * Math.min(1, dt * 10);
      tankWater.scale.z = Math.max(0.02, shownLevel) * 0.42;
      tankWater.visible = shownLevel > 0.01;
      tankWaterMaterial.emissiveIntensity =
        level < 0.1 ? 0.2 + Math.sin(clock * 10) * 0.2 : 0.4;

      // Water drops.
      for (const drop of drops) {
        const data = drop.userData;
        if (!data.kind) continue;
        data.age += dt;
        if (data.age < 0) continue;
        if (data.kind === "stream") {
          const f = data.age / data.life;
          if (f >= 1) {
            drop.visible = false;
            data.kind = "";
            continue;
          }
          drop.visible = true;
          drop.position.lerpVectors(data.from, data.to, f);
          drop.position.y += Math.sin(f * Math.PI) * data.arch;
          drop.scale.setScalar(data.size * (1 + f * 1.4));
        } else {
          if (data.age >= data.life) {
            drop.visible = false;
            data.kind = "";
            continue;
          }
          data.velocity.y -= GRAVITY * dt;
          drop.position.addScaledVector(data.velocity, dt);
          drop.scale.setScalar(data.size * (1 - data.age / data.life));
        }
      }

      renderer.render(scene, camera);
    },
    dispose() {
      clearTargets();
      faceTexture.dispose();
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      hitMaterial.dispose();
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
