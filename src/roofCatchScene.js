import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";

const worldX = (x) => (x - 340) / 60;
const roofHeight = 2.65;
const basketHeight = 1.05;
const basketZ = 0.65;

export function createRoofCatchScene(
  canvas,
  avatar,
  kinds,
  laneX,
  fallTime,
  missLimit,
) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#b7dce8");
  scene.fog = new T.Fog("#b7dce8", 20, 58);
  const minHalfWidth = 6.7;
  const minHalfHeight = 4.34;
  const camera = new T.OrthographicCamera(
    -minHalfWidth,
    minHalfWidth,
    minHalfHeight,
    -minHalfHeight,
    0.1,
    80,
  );
  camera.position.set(0, 8.2, 10);
  camera.lookAt(0, 1.55, -1.4);

  scene.add(new T.HemisphereLight("#fff4d6", "#758f65", 2.3));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.position.set(-6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8 });
  sun.shadow.normalBias = 0.025;
  scene.add(sun);

  const mat = (color, metalness = 0) =>
    new T.MeshStandardMaterial({ color, metalness, roughness: 0.66 });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);

  box(90, 0.2, 90, mat("#86aa58"), 0, -0.13, 0).castShadow = false;
  box(11.2, 0.06, 2.4, mat("#d6b88a"), 0, -0.015, 1);
  const siding = [mat("#a9553e"), mat("#b96146"), mat("#b05841")];
  const trim = mat("#f0d3aa");
  box(10.15, 2.45, 3.8, siding[0], 0, 1.225, -2.1);
  for (let i = 0; i < 26; i++)
    box(0.38, 2.45, 0.06, siding[i % 3], (i - 12.5) * 0.39, 1.225, -0.17);
  box(1.9, 1.95, 0.08, trim, 0, 0.975, -0.12);
  box(1.68, 1.79, 0.08, mat("#784b38"), 0, 0.895, -0.06);
  for (const side of [-1, 1]) {
    box(0.18, 2.45, 0.11, trim, side * 4.98, 1.225, -0.11);
    box(1.18, 0.8, 0.11, trim, side * 3.12, 1.48, -0.11);
    box(1.02, 0.64, 0.12, mat("#466670"), side * 3.12, 1.48, -0.045);
    box(0.055, 0.68, 0.13, trim, side * 3.12, 1.48, 0.02);
  }

  const roof = new T.Group();
  roof.position.set(0, roofHeight, 0);
  roof.rotation.x = Math.atan2(1.65, 4);
  scene.add(roof);
  const length = Math.hypot(1.65, 4);
  const tin = [mat("#708990", 0.55), mat("#8da3a7", 0.5)];
  const seam = mat("#a3b6b7", 0.55);
  for (let i = 0; i < 30; i++) {
    const x = (i - 14.5) * 0.35;
    box(
      0.35,
      0.1,
      length,
      tin[Math.floor(i / 6) % 2],
      x,
      -0.05,
      -length / 2,
      roof,
    );
    box(0.055, 0.055, length, seam, x + 0.16, 0.02, -length / 2, roof);
  }
  box(10.6, 0.13, 0.13, tin[0], 0, roofHeight - 0.07, 0.02);
  const wood = mat("#835d38");
  const foliage = [mat("#5d8b49"), mat("#729a4e")];
  for (let i = 0; i < 10; i++) {
    const x = (i - 4.5) * 2.9;
    const z = -6 - (i % 3) * 1.5;
    mesh(new T.CylinderGeometry(0.11, 0.17, 1.8, 8), wood, x, 0.9, z);
    const crown = mesh(
      new T.IcosahedronGeometry(1.18, 1),
      foliage[i % 2],
      x,
      2.35,
      z,
    );
    crown.scale.y = 1.3;
  }

  const runner = createAvatar("attacker", avatar, false);
  runner.position.z = basketZ + 0.67;
  scene.add(runner);
  const basket = new T.Group();
  basket.position.set(0, basketHeight, basketZ);
  scene.add(basket);
  const wicker = mat("#a66530");
  wicker.side = T.DoubleSide;
  const rim = mat("#e1a455");
  const catchRadius = 36 / 60;
  mesh(
    new T.CylinderGeometry(catchRadius, 0.4, 0.32, 28, 1, true),
    wicker,
    0,
    -0.16,
    0,
    basket,
  );
  mesh(
    new T.CylinderGeometry(0.4, 0.4, 0.045, 28),
    wicker,
    0,
    -0.32,
    0,
    basket,
  );
  for (let i = 0; i < 4; i++) {
    const ring = mesh(
      new T.TorusGeometry(
        catchRadius - i * 0.049,
        i === 0 ? 0.045 : 0.02,
        8,
        28,
      ),
      rim,
      0,
      -i * 0.078,
      0,
      basket,
    );
    ring.rotation.x = Math.PI / 2;
  }

  const apple = mat("#e13930");
  const pear = mat("#efbd32");
  const stone = mat("#626e82");
  const mud = mat("#603e2b");
  const leaf = mat("#5c992c");
  const round = new T.SphereGeometry(1, 20, 14);
  const rock = new T.DodecahedronGeometry(1);
  const stem = new T.CylinderGeometry(0.025, 0.034, 0.15, 8);
  const models = kinds.map((kind) => {
    const group = new T.Group();
    scene.add(group);
    const ball = (material, x, y, z, sx, sy, sz, geometry = round) => {
      const model = mesh(geometry, material, x, y, z, group);
      model.scale.set(sx, sy, sz);
      return model;
    };
    if (kind === "apple" || kind === "pear") {
      const golden = kind === "pear";
      ball(golden ? pear : apple, 0, golden ? -0.05 : 0, 0, 0.23, 0.21, 0.22);
      if (golden) ball(pear, 0, 0.14, 0, 0.15, 0.18, 0.15);
      const top = golden ? 0.32 : 0.21;
      mesh(stem, wood, 0, top, 0, group).rotation.z = -0.27;
      ball(leaf, 0.09, top + 0.03, 0, 0.12, 0.025, 0.055).rotation.z = 0.45;
    } else if (kind === "pebble") {
      ball(stone, 0, 0, 0, 0.23, 0.17, 0.2, rock).rotation.y = 0.6;
    } else {
      ball(mud, 0, 0, 0, 0.26, 0.18, 0.23, rock);
      ball(mud, 0.13, 0.02, 0.06, 0.15, 0.14, 0.16, rock).rotation.z = 0.5;
    }
    return group;
  });

  const stains = Array.from({ length: missLimit }, () => {
    const stain = new T.Group();
    scene.add(stain);
    const material = new T.MeshBasicMaterial({ color: "#a82b28" });
    const blot = new T.CircleGeometry(1, 14);
    for (const [x, z, radius] of [
      [0, 0, 0.28],
      [0.24, 0.12, 0.13],
      [-0.26, 0.04, 0.1],
      [0.06, -0.24, 0.09],
    ]) {
      const mark = new T.Mesh(blot, material);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0, z);
      mark.scale.setScalar(radius);
      stain.add(mark);
    }
    return stain;
  });

  const confetti = new T.Group();
  scene.add(confetti);
  const paper = new T.PlaneGeometry(0.09, 0.13);
  const colors = ["#ffd953", "#fff2b0", "#f68c40", "#79c765"].map(
    (color) => new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
  );
  for (let i = 0; i < 12; i++) {
    const piece = new T.Mesh(paper, colors[i % colors.length]);
    confetti.add(piece);
  }

  const size = new T.Vector2();
  return {
    aim(clientX) {
      const bounds = canvas.getBoundingClientRect();
      const fraction = (clientX - bounds.left) / bounds.width;
      return T.MathUtils.lerp(camera.left, camera.right, fraction) * 60 + 340;
    },
    draw(x, drops, missed, time, movement, dt) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.getSize(size);
      if (width !== size.x || height !== size.y) {
        const aspect = width / height;
        const halfHeight = Math.max(minHalfHeight, minHalfWidth / aspect);
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.right = halfHeight * aspect;
        camera.left = -camera.right;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }
      runner.position.x = basket.position.x = worldX(x);
      animateAvatar(
        runner,
        { moveSpeed: dt ? Math.abs(movement) / (60 * dt) : 0 },
        dt,
      );
      const rig = runner.userData.fallback?.userData.robot;
      rig?.arms.forEach((arm, index) => {
        arm.rotation.x = 1.4;
        arm.rotation.z = index ? 0.12 : -0.12;
        rig.elbows[index].rotation.x = 0.1;
      });
      stains.forEach((stain, index) => {
        const drop = missed[index];
        stain.visible = Boolean(drop);
        if (!drop) return;
        stain.position.set(
          worldX(laneX(drop.lane)),
          0.02,
          basketZ + drop.landingOffset,
        );
        stain.children[0].material.color.set(
          drop.kind === "pear" ? "#be8b20" : "#a82b28",
        );
      });
      for (const model of models) model.visible = false;
      for (const drop of drops) {
        if (
          drop.caught ||
          drop.landed ||
          (drop.resolved &&
            drop.missAt === undefined &&
            time > drop.catchAt + 0.2)
        )
          continue;
        const model = models[drop.slot];
        const age = time - drop.start;
        model.visible = true;
        const roll = Math.min(age / drop.rollTime, 1);
        const fall = Math.max(0, (age - drop.rollTime) / fallTime);
        model.position.set(
          worldX(laneX(drop.lane)),
          roofHeight +
            0.22 +
            (1 - roll) * 1.65 -
            fall ** 2 * (roofHeight + 0.22 - basketHeight),
          -4 * (1 - roll) + basketZ * fall,
        );
        if (drop.missAt !== undefined) {
          const progress = T.MathUtils.clamp(
            (time - drop.catchAt) / (drop.missAt - drop.catchAt),
            0,
            1,
          );
          model.position.y = T.MathUtils.lerp(basketHeight, 0.2, progress);
          model.position.z = basketZ + drop.landingOffset * progress;
        }
        model.rotation.x = roll * 14 + fall * 3;
      }
      const pearCatch = drops.findLast(
        (drop) => drop.caughtAt !== undefined && time - drop.caughtAt < 0.55,
      );
      confetti.visible = Boolean(pearCatch);
      if (pearCatch) {
        const age = time - pearCatch.caughtAt;
        confetti.position.set(worldX(pearCatch.caughtX), basketHeight, basketZ);
        confetti.children.forEach((piece, index) => {
          const angle = (index * Math.PI * 2) / confetti.children.length;
          const radius = 0.15 + age * (1.4 + (index % 3) * 0.45);
          piece.position.set(
            Math.cos(angle) * radius,
            age * (2.2 + (index % 4) * 0.45) - 4.5 * age ** 2,
            Math.sin(angle) * radius,
          );
          piece.rotation.set(age * 9 + index, age * 7, angle);
          piece.scale.setScalar(1 - age / 0.55);
        });
      }
      renderer.render(scene, camera);
    },
    dispose() {
      releaseAvatar(runner);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
