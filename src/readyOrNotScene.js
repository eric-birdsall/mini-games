import * as T from "three";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import {
  clearSight,
  distance,
  FURNITURE,
  LIMIT,
  SPOTS,
  WALLS,
} from "../shared/readyOrNot.js";

export function createReadyOrNotScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  renderer.setClearColor("#a5d7e9");
  const camera = new T.OrthographicCamera(-12, 12, 12, -12, 0.1, 100);
  const target = new T.Vector3();
  const playerPosition = new T.Vector3();
  let previousWidth = 0;
  let previousHeight = 0;
  const materials = new Map();
  const objects = new T.Group();
  scene.add(objects, new T.HemisphereLight("#fff9e9", "#a9a69b", 2.1));
  const sun = new T.DirectionalLight("#fff0d0", 2.4);
  sun.position.set(-14, 24, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -23,
    right: 23,
    top: 23,
    bottom: -23,
    far: 65,
  });
  scene.add(sun);

  function mesh(geometry, color, x, y, z) {
    if (!materials.has(color))
      materials.set(color, new T.MeshStandardMaterial({ color }));
    const object = new T.Mesh(geometry, materials.get(color));
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    objects.add(object);
    return object;
  }
  const box = (w, h, d, color, x, y, z) =>
    mesh(new T.BoxGeometry(w, h, d), color, x, y, z);
  const leaves = (x, y, z, size, color, flat = 0.8) => {
    const leaf = mesh(new T.IcosahedronGeometry(size, 1), color, x, y, z);
    leaf.scale.y = flat;
  };
  const floor = (w, d, color, x, z, y = -0.065) =>
    box(w, 0.12, d, color, x, y, z);
  floor(74, 74, "#99bd78", 0, 0, -0.2);
  for (let x = -14; x <= LIMIT.east + 0.5; x += 2)
    floor(2, 32, x % 4 ? "#94c46b" : "#9fcd76", x, 0);
  floor(23, 12, "#e7bf8e", 3.5, 0, -0.045);
  floor(6.85, 3.8, "#d4c4e2", 11.5, 4, -0.022);
  floor(6.85, 3.8, "#b9d6df", 11.5, -4, -0.022);
  floor(6.85, 3.8, "#e9c9a0", 11.5, 0, -0.022);
  floor(7.75, 5.9, "#f5d7ad", -4, 3, -0.028);
  floor(7.75, 5.9, "#d9e5df", 4, -3, -0.027);
  floor(3.15, 10, "#ddcbb6", 0, 11, -0.035);
  floor(5.3, 2.3, "#f5deba", 0, 7.15, -0.025);
  floor(5.4, 2.9, "#ba8865", -3.1, -7.45, -0.025);
  for (let z = -8.7; z < -6; z += 0.34)
    box(5.4, 0.026, 0.024, "#8b624d", -3.1, 0.042, z);
  floor(5.3, 4.2, "#9ebeb3", -4.2, 2.25, -0.009);
  floor(3.25, 3.8, "#d7a4a9", 5.65, 3.1, -0.01);
  for (const side of [-1, 1]) {
    for (let z = -15; z <= 15; z += 1.5) {
      box(
        0.14,
        1.25,
        0.18,
        "#fbefd6",
        side < 0 ? -15 : LIMIT.east + 0.5,
        0.625,
        z,
      );
      box(
        0.1,
        0.22,
        1.5,
        "#f4e6c9",
        side < 0 ? -15 : LIMIT.east + 0.5,
        0.79,
        z,
      );
    }
    for (let x = -15; x <= LIMIT.east + 0.5; x += 1.5) {
      if (side === 1 && Math.abs(x) < 2) continue;
      box(0.18, 1.25, 0.14, "#fbefd6", x, 0.625, side * 16);
      box(1.5, 0.22, 0.1, "#f4e6c9", x, 0.79, side * 16);
    }
  }
  // Cutaway walls leave the near side of every room readable from above.
  const walls = WALLS.map(([x, z, w, d]) => ({
    x,
    z,
    body: box(
      w,
      2.65,
      d,
      Math.abs(x) > 7 || Math.abs(z) === 6 ? "#fff2d8" : "#f6dfba",
      x,
      1.325,
      z,
    ),
    cap: box(w + 0.07, 0.1, d + 0.07, "#628d85", x, 2.69, z),
  }));

  for (const { kind, x, z, w, d, h } of FURNITURE) {
    switch (kind) {
      case "couch":
        box(w, 0.31, d, "#4e9c93", x, 0.465, z);
        for (const dx of [-1.48, 1.48])
          for (const dz of [-0.46, 0.46])
            box(0.16, 0.31, 0.16, "#89644f", x + dx, 0.155, z + dz);
        box(w, 0.58, 0.28, "#4e9c93", x, 0.81, z - 0.46);
        for (const offset of [-1.52, 1.52])
          box(0.45, 0.42, d, "#60a9a0", x + offset, 0.65, z);
        for (const offset of [-0.65, 0.65])
          box(1.25, 0.15, 0.85, "#83c2af", x + offset, 0.66, z + 0.12);
        break;
      case "bed":
        box(w, 0.19, d, "#ad795c", x, 0.405, z);
        for (const dx of [-1.02, 1.02])
          for (const dz of [-1.36, 1.36])
            box(0.15, 0.31, 0.15, "#ad795c", x + dx, 0.155, z + dz);
        box(w, 0.25, d, "#fff4da", x, 0.63, z);
        const quilt = x < 8 ? "#dd8591" : z > 0 ? "#a78abc" : "#77aebb";
        box(w + 0.06, 0.13, d * 0.69, quilt, x, 0.79, z + d * 0.145);
        box(1.7, 0.2, 0.57, "#fffaf1", x, 0.83, z - d * 0.33);
        break;
      case "table":
        for (const dx of [-w / 2 + 0.3, w / 2 - 0.3])
          for (const dz of [-d / 2 + 0.24, d / 2 - 0.24])
            box(0.15, 0.86, 0.15, "#a66e50", x + dx, 0.43, z + dz);
        box(w, 0.15, d, "#e5a77c", x, h - 0.075, z);
        box(0.72, 0.025, d + 0.03, "#fff6dd", x, h + 0.013, z);
        break;
      case "bench":
        box(w, 0.14, d, "#cb935f", x, 0.64, z);
        for (const dx of [-0.9, 0.9])
          box(0.15, 0.57, 0.6, "#87614d", x + dx, 0.285, z);
        break;
      case "tree":
        mesh(new T.CylinderGeometry(0.32, 0.43, h, 9), "#976445", x, h / 2, z);
        leaves(x - 0.7, 3.35, z, 1.65, "#5b984f");
        leaves(x + 0.75, 3.65, z - 0.45, 1.68, "#70ae57");
        leaves(x + 0.1, 4.53, z + 0.1, 1.4, "#8ac261");
        for (let i = 0; i < 5; i++)
          box(0.64, 0.08, 0.12, "#d8a673", x, 0.4 + i * 0.4, z + 0.58);
        break;
      case "shed": {
        const siding = "#a54f38";
        const trim = "#ffe1af";
        const front = z + d / 2;
        box(w, h, d, siding, x, h / 2, z);
        for (let y = 0.3; y < h; y += 0.29) {
          box(w + 0.04, 0.035, d + 0.04, "#833c2c", x, y, z);
        }
        for (const side of [-1, 1]) {
          for (const end of [-1, 1])
            box(
              0.16,
              h,
              0.16,
              trim,
              x + (side * w) / 2,
              h / 2,
              z + (end * d) / 2,
            );
        }

        const rise = 0.95;
        const run = w / 2 + 0.24;
        const gable = new T.Shape();
        gable.moveTo(-w / 2, 0);
        gable.lineTo(w / 2, 0);
        gable.lineTo(0, (rise * (w / 2)) / run);
        gable.closePath();
        mesh(
          new T.ExtrudeGeometry(gable, { depth: d, bevelEnabled: false }),
          siding,
          x,
          h,
          z - d / 2,
        );
        const slope = Math.atan2(rise, run);
        const roofLength = Math.hypot(rise, run);
        for (const side of [-1, 1]) {
          const roof = box(
            roofLength,
            0.14,
            d + 0.48,
            "#485966",
            x + (side * run) / 2,
            h + rise / 2,
            z,
          );
          roof.rotation.z = -side * slope;
          for (let rib = -1.5; rib <= 1.5; rib += 0.5) {
            const seam = box(
              roofLength,
              0.035,
              0.038,
              "#687984",
              roof.position.x,
              roof.position.y + 0.085,
              z + rib,
            );
            seam.rotation.z = roof.rotation.z;
          }
        }
        box(0.18, 0.14, d + 0.5, "#384752", x, h + rise, z);

        box(1.64, 2.18, 0.09, trim, x, 1.09, front + 0.035);
        for (const side of [-1, 1]) {
          const doorX = x + side * 0.36;
          box(0.7, 2, 0.09, "#723e32", doorX, 1.02, front + 0.085);
          for (const y of [0.3, 1.73])
            box(0.68, 0.11, 0.045, trim, doorX, y, front + 0.14);
          const brace = box(0.11, 1.51, 0.045, trim, doorX, 1.02, front + 0.14);
          brace.rotation.z = side * 0.39;
          box(0.09, 0.12, 0.09, "#e3b65d", x + side * 0.13, 1.05, front + 0.17);
        }
        box(1.76, 0.1, 0.62, "#c4b29a", x, 0.05, front + 0.27);
        break;
      }
      case "bins":
        for (const offset of [-0.56, 0.56]) {
          box(
            0.91,
            1.02,
            d,
            offset < 0 ? "#719681" : "#689bba",
            x + offset,
            0.51,
            z,
          );
          box(1, 0.15, d + 0.08, "#546f70", x + offset, 1.07, z);
        }
        break;
      default:
        box(w, h, d, kind === "counter" ? "#89b1a6" : "#c89367", x, h / 2, z);
        box(w + 0.08, 0.09, d + 0.08, "#fff0ce", x, h + 0.045, z);
    }
  }
  for (const { kind, x, z: accessZ } of SPOTS) {
    const z = kind === "closet" ? accessZ - 0.95 : accessZ;
    if (kind === "bush") {
      leaves(x - 0.6, 0.55, z, 0.93, "#558e50");
      leaves(x + 0.55, 0.57, z + 0.17, 0.92, "#6da652");
      leaves(x, 0.76, z - 0.35, 1.03, "#77b358");
      for (let i = 0; i < 5; i++)
        leaves(
          x + Math.sin(i * 2) * 0.93,
          0.88 + (i % 2) * 0.19,
          z + Math.cos(i * 2) * 0.57,
          0.12,
          i % 2 ? "#ffd88a" : "#f5a5a7",
          1,
        );
    }
    if (kind === "closet") {
      box(1.52, 1.92, 0.92, "#b1836c", x, 0.96, z);
      for (const dx of [-0.36, 0.36]) {
        box(0.66, 1.72, 0.07, "#e0b995", x + dx, 0.92, z + 0.47);
        box(0.09, 0.14, 0.07, "#806449", x + dx * 0.27, 0.95, z + 0.53);
      }
    }
    if (kind === "fort") {
      const tent = mesh(
        new T.CylinderGeometry(1.16, 1.16, 1.7, 3),
        "#c48bb8",
        x,
        0.52,
        z,
      );
      tent.rotation.x = Math.PI / 2;
      tent.scale.z = 0.83;
      box(0.65, 0.05, 0.6, "#f5d4dd", x, 0.055, z + 0.8);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = 2.8 + i * 1.24;
    const z = 13.8 + Math.sin(i * 1.5) * 0.28;
    leaves(x, 0.19, z, 0.27, "#6eaa53");
    leaves(x, 0.4, z, 0.15, i % 2 ? "#ec9f9c" : "#ffe49b", 1);
  }
  for (let i = 0; i < 5; i++)
    floor(
      1.45,
      0.8,
      "#d1c5a8",
      -4.4 + i * 1.52,
      -9.2 + Math.sin(i) * 0.45,
      -0.035,
    );

  const marker = mesh(new T.RingGeometry(0.7, 0.8, 32), "#ffd664", 0, 0.055, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.castShadow = false;
  const silhouette = new T.MeshBasicMaterial({
    color: "#baf6ff",
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const silhouetteLayer = 1;
  let actors = [];
  const choices = [
    { character: "fox", color: "rose" },
    { character: "bunny", color: "mint" },
    { character: "frog", color: "sky" },
    { character: "bear", color: "violet" },
  ];

  function setRound(round) {
    for (const model of actors) {
      scene.remove(model);
      disposeAvatar(model);
    }
    actors = [round.seeker, ...round.hiders].map((actor, i) => {
      const model = createAvatar(
        i ? "attacker" : "defender",
        actor === round.player ? avatar : choices[i],
      );
      model.scale.setScalar(0.82);
      scene.add(model);
      return model;
    });
    target.set(round.player.x, 0, round.player.z);
  }

  function render(round, spot, dt) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (width !== previousWidth || height !== previousHeight) {
      renderer.setSize(width, height, false);
      previousWidth = width;
      previousHeight = height;
    }
    const aspect = width / height;
    const half = round ? 7.4 : Math.max(16.6, 19.5 / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();

    const player = round?.player;
    if (player)
      target.lerp(
        playerPosition.set(player.x, 0, player.z),
        1 - Math.exp(-dt * 10),
      );
    else target.set((LIMIT.east - LIMIT.x) / 2, 0, 0);
    camera.position.set(target.x, 22, target.z + 12);
    camera.lookAt(target);
    for (const wall of walls) {
      const nearSide =
        player && wall.z > player.z - 0.55 && Math.abs(wall.x - player.x) < 7.5;
      wall.body.scale.y = nearSide ? 0.27 : 1;
      wall.body.position.y = 1.325 * wall.body.scale.y;
      wall.cap.position.y = wall.body.position.y * 2 + 0.04;
    }
    marker.visible = !!spot;
    if (spot) marker.position.set(spot.x, 0.075, spot.z);

    let hiddenModel;
    if (round) {
      [round.seeker, ...round.hiders].forEach((actor, i) => {
        const model = actors[i];
        const isPlayer = actor === player;
        model.visible =
          !actor.hidden &&
          (isPlayer ||
            (distance(player, actor) < 11 && clearSight(player, actor)));
        if (isPlayer && actor.hidden) {
          hiddenModel = model;
          const spot = actor.hidden;
          const furniture =
            spot.kind === "under" ||
            spot.kind === "shed" ||
            spot.kind === "tree"
              ? FURNITURE.find(
                  (piece) =>
                    (spot.kind === "under"
                      ? ["bed", "bench", "couch", "table"].includes(piece.kind)
                      : piece.kind === spot.kind) &&
                    distance(piece, spot) < 2.15,
                )
              : null;
          model.position.set(
            furniture?.x ?? spot.x,
            spot.kind === "tree" ? 2.5 : 0,
            furniture?.z ?? (spot.kind === "closet" ? spot.z - 0.95 : spot.z),
          );
          model.rotation.y = actor.yaw + Math.PI;
          animateAvatar(model, { crouch: spot.kind === "under" }, dt);
        }
        if (!model.visible) return;
        if (actor.tagged)
          model.userData.revealTime = (model.userData.revealTime ?? 0) + dt;
        const hop =
          Math.sin(
            Math.PI * Math.min(1, (model.userData.revealTime ?? 0) / 0.55),
          ) * 0.8;
        // Step out past the foliage so the revealed character stays visible.
        const exitOffset = actor.foundAt?.kind === "bush" ? 1.05 : 0;
        model.position.set(actor.x, hop, actor.z + exitOffset);
        model.rotation.y = actor.yaw + Math.PI;
        animateAvatar(
          model,
          { moveSpeed: actor.speed, crouch: actor.crouch },
          dt,
        );
      });
    }
    renderer.render(scene, camera);

    // Draw only the local avatar over cover, without casting a shadow.
    if (hiddenModel) {
      const body =
        hiddenModel.userData.critter?.pivot ?? hiddenModel.userData.fallback;
      body.traverse((node) => node.layers.enable(silhouetteLayer));
      hiddenModel.visible = true;
      camera.layers.set(silhouetteLayer);
      scene.overrideMaterial = silhouette;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(scene, camera);
      renderer.shadowMap.autoUpdate = true;
      renderer.autoClear = true;
      scene.overrideMaterial = null;
      camera.layers.set(0);
      hiddenModel.visible = false;
      body.traverse((node) => node.layers.disable(silhouetteLayer));
    }
  }

  function dispose() {
    for (const model of actors) disposeAvatar(model);
    objects.traverse((object) => object.geometry?.dispose());
    for (const material of materials.values()) material.dispose();
    silhouette.dispose();
    sun.shadow.dispose();
    renderer.dispose();
  }
  return { setRound, render, dispose };
}
