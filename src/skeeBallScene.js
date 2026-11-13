import * as T from "three";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import {
  BALL_RADIUS,
  BOARD_ANGLE,
  BOARD_END,
  BOARD_LENGTH,
  BOARD_START,
  CORNERS,
  HUMP_LENGTH,
  LANE_ANGLE,
  LANE_HALF,
  LANE_LENGTH,
  LANE_Y,
  PATH_LENGTH,
  RINGS,
  RING_CENTER,
  aimPath,
  boardPoint,
  lanePoint,
  pocketAt,
} from "../shared/skeeBall.js";

// An arcade with three skee ball lanes side by side; you play the middle
// one. The camera stands behind the foul line looking up the lane (+z), so
// world +x is screen left. Your critter stands at the near end and rolls
// each ball underhand up the lane.

const RING_COLORS = {
  10: "#2f6fe0",
  20: "#e2483d",
  30: "#f4b62b",
  40: "#34b36b",
  50: "#9b4ee0",
  100: "#ffd23f",
};
const BOARD_WIDTH = LANE_HALF * 2;
const PX = 1000; // canvas pixels per metre on the target board

export function createSkeeBallScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#1c1238");
  scene.fog = new T.Fog("#1c1238", 7, 16);
  const camera = new T.PerspectiveCamera(48, 1, 0.05, 40);
  scene.add(new T.HemisphereLight("#e9dcff", "#3a2a4a", 1.5));
  const spot = new T.SpotLight("#fff4e0", 26, 9, 0.55, 0.5, 1.2);
  spot.position.set(0.3, 3.6, 0.6);
  spot.target.position.set(0, 1.2, 3.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);

  const textures = [];
  const mat = (color, roughness = 0.6, extra = {}) =>
    new T.MeshStandardMaterial({ color, roughness, ...extra });
  const glow = (color) =>
    new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
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
    paint(c.getContext("2d"), c);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures.push(map);
    return map;
  }

  // --- The arcade room --------------------------------------------------------
  const carpet = paintedTexture(512, 512, (g) => {
    g.fillStyle = "#24164a";
    g.fillRect(0, 0, 512, 512);
    const colors = ["#ff4fa3", "#3fd7ff", "#ffd23f", "#7cf06b"];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = colors[i % 4];
      g.lineWidth = 5;
      const x = rnd() * 512;
      const y = rnd() * 512;
      if (i % 3 === 0) {
        g.beginPath();
        g.arc(x, y, 8 + rnd() * 8, 0, Math.PI * 1.3);
        g.stroke();
      } else if (i % 3 === 1) {
        g.beginPath();
        g.moveTo(x - 10, y - 6);
        g.lineTo(x, y + 8);
        g.lineTo(x + 10, y - 6);
        g.stroke();
      } else {
        g.fillStyle = colors[(i + 1) % 4];
        g.fillRect(x, y, 7, 7);
      }
    }
  });
  carpet.wrapS = carpet.wrapT = T.RepeatWrapping;
  carpet.repeat.set(10, 10);
  const floor = mesh(
    new T.PlaneGeometry(30, 30),
    mat("#ffffff", 0.95, { map: carpet }),
    0,
    0,
    3,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const wallMat = mat("#2a1950", 0.9);
  box(30, 6, 0.2, wallMat, 0, 3, 6.4);
  for (const [color, y] of [
    ["#ff4fa3", 3.1],
    ["#3fd7ff", 3.3],
  ])
    box(14, 0.05, 0.05, glow(color), 0, y, 6.25);

  // --- Lane cabinets ---------------------------------------------------------
  const woodMap = paintedTexture(256, 1024, (g) => {
    g.fillStyle = "#e6c48c";
    g.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#dcb67a" : "#ebcd98";
      g.fillRect(i * 32, 0, 32, 1024);
      g.fillStyle = "#c79c5f55";
      g.fillRect(i * 32, 0, 2, 1024);
    }
    g.globalAlpha = 0.18;
    for (let i = 0; i < 90; i++) {
      g.fillStyle = "#9c6b34";
      g.fillRect(
        Math.random() * 256,
        Math.random() * 1024,
        1.5,
        30 + Math.random() * 80,
      );
    }
  });
  const boardMap = paintedTexture(
    Math.round(BOARD_WIDTH * PX),
    Math.round(BOARD_LENGTH * PX),
    paintBoard,
  );

  function cabinet(x, trim) {
    const group = new T.Group();
    group.position.x = x;
    scene.add(group);
    const wood = mat("#ffffff", 0.45, { map: woodMap });
    const side = mat(trim, 0.45);
    const dark = mat("#1b1430", 0.7);
    // The lane, tilted up away from the player.
    const mid = lanePoint(LANE_LENGTH / 2);
    const lane = box(
      BOARD_WIDTH,
      0.04,
      LANE_LENGTH,
      wood,
      0,
      mid.y - 0.02,
      mid.z,
      group,
    );
    lane.rotation.x = -LANE_ANGLE;
    // The hump: short slats following its curve.
    for (let i = 0; i < 12; i++) {
      const s = LANE_LENGTH + ((i + 0.5) / 12) * HUMP_LENGTH;
      const p = lanePoint(s);
      const slat = box(
        BOARD_WIDTH,
        0.04,
        HUMP_LENGTH / 12 + 0.006,
        wood,
        0,
        p.y - 0.02,
        p.z,
        group,
      );
      slat.rotation.x = -p.angle;
    }
    // Body under the lane and board.
    const endZ = BOARD_END.z + 0.12;
    box(
      BOARD_WIDTH + 0.16,
      LANE_Y,
      endZ + 0.3,
      dark,
      0,
      LANE_Y / 2,
      endZ / 2 - 0.15,
      group,
    );
    const under = BOARD_START.y - LANE_Y;
    box(
      BOARD_WIDTH,
      under,
      BOARD_END.z - lanePoint(LANE_LENGTH).z + 0.2,
      dark,
      0,
      LANE_Y + under / 2,
      (lanePoint(LANE_LENGTH).z + BOARD_END.z) / 2,
      group,
    );
    // Rails along both sides, following the slope, then the tall target box.
    for (const s of [-1, 1]) {
      const rail = box(
        0.06,
        0.09,
        LANE_LENGTH + 0.3,
        side,
        s * (LANE_HALF + 0.03),
        mid.y + 0.02,
        mid.z - 0.1,
        group,
      );
      rail.rotation.x = -LANE_ANGLE;
      box(
        0.05,
        0.03,
        LANE_LENGTH + 0.3,
        glow(trim),
        s * (LANE_HALF + 0.03),
        mid.y + 0.075,
        mid.z - 0.1,
        group,
      ).rotation.x = -LANE_ANGLE;
      const boxZ = (lanePoint(LANE_LENGTH).z + endZ) / 2;
      box(
        0.06,
        0.8,
        endZ - lanePoint(LANE_LENGTH).z,
        side,
        s * (LANE_HALF + 0.03),
        BOARD_START.y + 0.22,
        boxZ,
        group,
      );
    }
    // Back wall and marquee.
    box(BOARD_WIDTH + 0.12, 1.1, 0.08, side, 0, BOARD_END.y + 0.2, endZ, group);
    // The target board.
    const board = new T.Group();
    board.position.set(0, BOARD_START.y, BOARD_START.z);
    board.rotation.x = -BOARD_ANGLE;
    group.add(board);
    const face = mesh(
      new T.PlaneGeometry(BOARD_WIDTH, BOARD_LENGTH),
      mat("#ffffff", 0.55, { map: boardMap }),
      0,
      0.001,
      BOARD_LENGTH / 2,
      board,
    );
    face.rotation.x = -Math.PI / 2;
    box(
      BOARD_WIDTH,
      0.03,
      BOARD_LENGTH,
      dark,
      0,
      -0.016,
      BOARD_LENGTH / 2,
      board,
    );
    for (const ring of RINGS) {
      const wall = mesh(
        new T.CylinderGeometry(ring.radius, ring.radius, 0.035, 56, 1, true),
        mat(ring.points === 10 ? "#d9e4ff" : "#f6f0ff", 0.35, {
          side: T.DoubleSide,
        }),
        RING_CENTER.x,
        0.017,
        RING_CENTER.u,
        board,
      );
      wall.castShadow = false;
    }
    for (const corner of CORNERS) {
      mesh(
        new T.CylinderGeometry(corner.radius, corner.radius, 0.04, 36, 1, true),
        mat("#ffd23f", 0.3, { side: T.DoubleSide, metalness: 0.4 }),
        corner.x,
        0.02,
        corner.u,
        board,
      ).castShadow = false;
      // A hood behind the hole.
      const hood = mesh(
        new T.CylinderGeometry(
          corner.radius + 0.012,
          corner.radius + 0.012,
          0.09,
          36,
          1,
          true,
          -Math.PI / 2,
          Math.PI,
        ),
        mat(trim, 0.4, { side: T.DoubleSide }),
        corner.x,
        0.045,
        corner.u,
        board,
      );
      hood.castShadow = false;
    }
    return group;
  }

  function paintBoard(g, c) {
    const toPx = (x, u) => [(x + LANE_HALF) * PX, u * PX];
    g.fillStyle = "#1d2b5c";
    g.fillRect(0, 0, c.width, c.height);
    // Gutter along the front edge.
    g.fillStyle = "#0b0c18";
    g.fillRect(0, 0, c.width, 0.035 * PX);
    const [cx, cy] = toPx(RING_CENTER.x, RING_CENTER.u);
    for (const ring of [...RINGS].reverse()) {
      g.fillStyle = RING_COLORS[ring.points];
      g.beginPath();
      g.arc(cx, cy, ring.radius * PX, 0, Math.PI * 2);
      g.fill();
    }
    // Holes at the bottom of each ring, and numbers at the top. The
    // canvas reads upside down from the player, so the text is turned round.
    const label = (text, x, u, size) => {
      const [px, py] = toPx(x, u);
      g.save();
      g.translate(px, py);
      g.rotate(Math.PI);
      g.font = `900 ${size}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = size * 0.16;
      g.strokeStyle = "#1a1030";
      g.strokeText(text, 0, 0);
      g.fillStyle = "#ffffff";
      g.fillText(text, 0, 0);
      g.restore();
    };
    let inner = 0;
    for (const ring of RINGS) {
      const { hole } = pocketAt(
        RING_CENTER.x,
        RING_CENTER.u - (inner + ring.radius) / 2,
      );
      const [hx, hy] = toPx(hole.x, hole.u);
      g.fillStyle = "#090914";
      g.beginPath();
      g.arc(
        hx,
        hy,
        ring.points === 50 ? 0.036 * PX : 0.024 * PX,
        0,
        Math.PI * 2,
      );
      g.fill();
      if (ring.points !== 50)
        label(
          String(ring.points),
          RING_CENTER.x,
          RING_CENTER.u + (inner + ring.radius) / 2,
          38,
        );
      inner = ring.radius;
    }
    label("50", RING_CENTER.x, RING_CENTER.u + 0.052, 22);
    for (const corner of CORNERS) {
      const [x, y] = toPx(corner.x, corner.u);
      g.fillStyle = RING_COLORS[100];
      g.beginPath();
      g.arc(x, y, (corner.radius + 0.012) * PX, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#090914";
      g.beginPath();
      g.arc(x, y, (corner.radius - 0.006) * PX, 0, Math.PI * 2);
      g.fill();
      label("100", corner.x, corner.u - corner.radius - 0.03, 30);
    }
  }

  cabinet(0, "#ff4fa3");
  for (const [x, trim] of [
    [1.5, "#3fd7ff"],
    [-1.5, "#7cf06b"],
  ])
    cabinet(x, trim);

  // --- Scoreboard over your lane ----------------------------------------------
  const scoreCanvas = document.createElement("canvas");
  scoreCanvas.width = 512;
  scoreCanvas.height = 256;
  const scoreMap = new T.CanvasTexture(scoreCanvas);
  scoreMap.colorSpace = T.SRGBColorSpace;
  textures.push(scoreMap);
  const scoreboard = box(
    BOARD_WIDTH + 0.12,
    (BOARD_WIDTH + 0.12) / 2,
    0.05,
    [
      mat("#2a1950"),
      mat("#2a1950"),
      mat("#2a1950"),
      mat("#2a1950"),
      new T.MeshBasicMaterial({ map: scoreMap }),
      mat("#2a1950"),
    ],
    0,
    BOARD_END.y + 0.95,
    BOARD_END.z + 0.06,
  );
  scoreboard.rotation.y = Math.PI;
  scoreboard.castShadow = false;
  function paintScore(score, balls, flash = "") {
    const g = scoreCanvas.getContext("2d");
    g.fillStyle = "#120a26";
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = "#ff4fa3";
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 240);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 44px system-ui, sans-serif";
    g.fillStyle = "#3fd7ff";
    g.fillText(flash || "SKEE BALL", 256, 58);
    g.font = "900 110px ui-monospace, Menlo, monospace";
    g.fillStyle = "#ffd23f";
    g.fillText(String(score).padStart(3, "0"), 256, 150);
    g.font = "700 30px system-ui, sans-serif";
    g.fillStyle = "#ffffff";
    g.fillText(`BALLS ${balls}`, 256, 220);
    scoreMap.needsUpdate = true;
  }
  paintScore(0, 9);

  // --- Waiting balls, the rolling ball, aim line and guide -------------------
  const ballMap = paintedTexture(128, 64, (g) => {
    g.fillStyle = "#f1dcae";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#c7894a";
    g.fillRect(0, 26, 128, 12);
    g.fillRect(60, 0, 8, 64);
  });
  const ballGeo = new T.SphereGeometry(BALL_RADIUS, 24, 16);
  const ballMat = mat("#ffffff", 0.35, { map: ballMap });
  const ball = mesh(ballGeo, ballMat, 0, LANE_Y + BALL_RADIUS, 0);
  const tray = [];
  for (let i = 0; i < 9; i++) {
    const waiting = mesh(ballGeo, ballMat, 0, 0, 0);
    tray.push(waiting);
  }
  // The tray runs across the front of the cabinet.
  box(BOARD_WIDTH + 0.1, 0.03, 0.14, mat("#1b1430"), 0, LANE_Y - 0.06, -0.22);

  // The aim line: bright dots up the wooden lane showing which way the ball
  // will start off (with rail bounces). It covers only the first 70% of the
  // lane, so you still judge the rest of the roll yourself. Dark rims keep
  // the dots readable on the pale wood.
  const LANE_DOTS = 26;
  const AIM_REACH = 0.7 * PATH_LENGTH;
  const dotGeo = new T.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const rimGeo = new T.CircleGeometry(1.45, 20).rotateX(-Math.PI / 2);
  const dotMat = new T.MeshBasicMaterial({ color: "#ff2d95" });
  const rimMat = new T.MeshBasicMaterial({ color: "#2a0f3a" });
  const dots = new T.InstancedMesh(dotGeo, dotMat, LANE_DOTS);
  const rims = new T.InstancedMesh(rimGeo, rimMat, LANE_DOTS);
  for (const m of [dots, rims]) {
    m.frustumCulled = false;
    m.renderOrder = m === dots ? 2 : 1;
    scene.add(m);
  }
  const dotMatrix = new T.Matrix4();
  const dotTilt = new T.Quaternion();
  const dotScale = new T.Vector3();
  const dotPos = new T.Vector3();
  const xAxis = new T.Vector3(1, 0, 0);
  let lastAim = null;
  function placeAimLine(aim) {
    const { lane } = aimPath(aim, LANE_DOTS, 0);
    let n = 0;
    const put = (x, y, z, angle, size, lift) => {
      dotTilt.setFromAxisAngle(xAxis, -angle);
      // Lift along the surface normal so the dot sits just above it.
      dotPos.set(x, y + lift * Math.cos(angle), z - lift * Math.sin(angle));
      dotScale.setScalar(size);
      dotMatrix.compose(dotPos, dotTilt, dotScale);
      dots.setMatrixAt(n, dotMatrix);
      dotPos.set(
        x,
        y + (lift * Math.cos(angle)) / 2,
        z - (lift * Math.sin(angle)) / 2,
      );
      rims.setMatrixAt(n, dotMatrix.compose(dotPos, dotTilt, dotScale));
      n++;
    };
    lane
      .filter(({ s }) => s <= AIM_REACH)
      .forEach(({ x, s }, i) => {
        const p = lanePoint(s);
        put(x, p.y, p.z, p.angle, 0.011 + (i / LANE_DOTS) * 0.004, 0.004);
      });
    dots.count = rims.count = n;
    dots.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
  }

  const guide = new T.Mesh(
    new T.RingGeometry(0.022, 0.034, 32),
    new T.MeshBasicMaterial({
      color: "#7dffb0",
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  scene.add(guide);

  // --- Your critter, the bowler ---------------------------------------------
  // It stands at the near end, just left of the lane (screen left), facing
  // up the lane, and rolls with its right paw (the lane side). The figure
  // sits inside `lean`, which tips it forward from the feet, inside
  // `bowler`, which turns it a little with your aim.
  const BOWLER = { x: 0.33, z: -0.5, turn: -0.3, stool: 0.55 };
  // A little step stool so it can reach the lane.
  const stoolMat = mat("#ffd23f", 0.5);
  box(0.42, BOWLER.stool, 0.36, stoolMat, BOWLER.x, BOWLER.stool / 2, BOWLER.z);
  box(
    0.44,
    0.03,
    0.38,
    mat("#e0378a", 0.5),
    BOWLER.x,
    BOWLER.stool - 0.01,
    BOWLER.z,
  );
  const bowler = new T.Group();
  bowler.position.set(BOWLER.x, BOWLER.stool, BOWLER.z);
  scene.add(bowler);
  const lean = new T.Group();
  bowler.add(lean);
  const player = createAvatar("attacker", avatar);
  player.scale.setScalar(0.47);
  player.rotation.y = Math.PI; // the critter rigs face −z
  lean.add(player);
  // The ball in its paw until it's rolled.
  const heldBall = new T.Mesh(ballGeo, ballMat);
  heldBall.castShadow = true;
  heldBall.visible = false;
  let pose = null; // the bones, once the critter's model has loaded

  // The paw: the far end of the arm_R skin, in the bone's own space.
  function pawPoint(model) {
    let skinned = null;
    model.traverse((node) => {
      if (node.isSkinnedMesh && !skinned) skinned = node;
    });
    const bones = skinned?.skeleton.bones ?? [];
    const arm = bones.findIndex((b) => b.name === "arm_R");
    if (arm < 0) return null;
    const { position, skinIndex, skinWeight } = skinned.geometry.attributes;
    const toBone = skinned.skeleton.boneInverses[arm]
      .clone()
      .multiply(skinned.bindMatrix);
    const v = new T.Vector3();
    const tip = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++)
        if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, best))
          best = k;
      if (skinIndex.getComponent(i, best) !== arm) continue;
      v.fromBufferAttribute(position, i).applyMatrix4(toBone);
      if (v.lengthSq() > tip.lengthSq()) tip.copy(v);
    }
    return { bone: bones[arm], tip };
  }

  // Take the bones over from the animation clips (as the dances do).
  function takeOver() {
    const rig = player.userData.critter;
    if (!rig) return null;
    rig.mixer.stopAllAction();
    const bones = {};
    rig.model.traverse((node) => {
      if (
        node.isBone &&
        ["hips", "head", "arm_L", "arm_R", "leg_L", "leg_R"].includes(
          node.name,
        ) &&
        !bones[node.name]
      )
        bones[node.name] = { node, rest: node.quaternion.clone() };
    });
    const paw = pawPoint(rig.model);
    if (paw) {
      // Hold the ball just past the paw, at its real size.
      scene.updateMatrixWorld(true);
      const scale = paw.bone.getWorldScale(new T.Vector3()).x || 1;
      const out = paw.tip.clone().normalize();
      heldBall.position
        .copy(paw.tip)
        .addScaledVector(out, (BALL_RADIUS * 0.7) / scale);
      heldBall.scale.setScalar(1 / scale);
      paw.bone.add(heldBall);
    }
    return { rig, bones, paw: !!paw };
  }

  const boneTurn = new T.Quaternion();
  const boneEuler = new T.Euler();
  function setBone(name, x, y = 0, z = 0) {
    const bone = pose.bones[name];
    if (!bone) return;
    bone.node.quaternion
      .copy(bone.rest)
      .multiply(boneTurn.setFromEuler(boneEuler.set(x, y, z)));
  }
  // Bone axes: +x on an arm or leg swings it backward (−x forward); +z
  // raises arm_L out to the side, −z raises arm_R. See src/dances.js.
  const now = { arm: -0.3, lean: 0.05, crouch: 0, step: 0, stride: 0 };
  const THROW_TIME = 0.75;
  let throwClock = -1;
  function poseBowler(dt, { windup, aiming, aim }) {
    bowler.rotation.y = BOWLER.turn + (aiming ? aim * 3 : 0);
    if (!pose) pose = takeOver();
    if (!pose) {
      animateAvatar(player, {}, dt, cheer > 0 ? "win" : undefined);
      return;
    }
    const want = { arm: -0.3, lean: 0.06, crouch: 0, step: 0, stride: 0 };
    let hop = 0;
    let armsUp = 0;
    if (throwClock >= 0) {
      // The swing through: fast forward, then a follow-through and back.
      throwClock += dt;
      const t = throwClock / THROW_TIME;
      const swing = Math.min(1, t / 0.25);
      const settle = Math.max(0, (t - 0.55) / 0.45);
      const ease = (x) => x * x * (3 - 2 * x);
      const through = ease(swing) * (1 - ease(settle));
      Object.assign(now, {
        arm: 1.3 - ease(swing) * 2.5 + ease(settle) * 0.9,
        lean: 0.12 + through * 0.3,
        crouch: through * 0.06,
        step: through * 0.12,
        stride: through,
      });
      if (t >= 1) throwClock = -1;
    } else {
      if (windup !== null) {
        // Swing the paw back as the meter fills.
        Object.assign(want, {
          arm: 0.2 + windup * 1.1,
          lean: 0.12 + windup * 0.08,
          crouch: 0.03 + windup * 0.03,
          stride: 0.4,
        });
      }
      if (cheer > 0) {
        hop = Math.abs(Math.sin(clock * 9)) * 0.08;
        armsUp = Math.min(1, cheer * 3);
        want.lean = 0;
      }
      const k = 1 - Math.exp(-dt * 14);
      for (const key of Object.keys(want))
        now[key] += (want[key] - now[key]) * k;
    }
    setBone("arm_R", now.arm, 0, -armsUp * 1.4);
    setBone("arm_L", -now.stride * 0.3 + now.lean * 0.5, 0, armsUp * 1.4);
    setBone("leg_L", -now.stride * 0.5);
    setBone("leg_R", now.stride * 0.35);
    setBone("hips", 0, 0, 0);
    setBone("head", -now.lean * 0.6);
    lean.rotation.x = now.lean;
    lean.position.set(0, hop - now.crouch, now.step);
    // Idle breathing so it never looks frozen.
    if (throwClock < 0 && windup === null && cheer <= 0)
      lean.position.y += Math.sin(clock * 2.4) * 0.006;
    heldBall.visible = pose.paw && aiming;
  }

  // --- Drawing ----------------------------------------------------------------
  const screenPoint = new T.Vector3();
  // Two views: behind the foul line while aiming, and close to the target
  // while the ball flies and drops.
  const AIM_VIEW = {
    at: new T.Vector3(-0.75, 2.2, -2.2),
    look: new T.Vector3(0.1, 0.5, 1.6),
  };
  const TARGET_VIEW = {
    at: new T.Vector3(0, 1.98, 2.45),
    look: new T.Vector3(0, 1.28, 3.72),
  };
  const camAt = AIM_VIEW.at.clone();
  const camLook = AIM_VIEW.look.clone();
  const wantAt = new T.Vector3();
  const wantLook = new T.Vector3();
  let clock = 0;
  let cheer = 0;
  const HANDOFF = 0.22;
  let handoff = HANDOFF;
  const pawAt = new T.Vector3();

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
      camera.fov = camera.aspect < 1 ? 60 : 42;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  return {
    toScreen(x, y, z) {
      screenPoint.set(x, y, z).project(camera);
      return {
        x: ((screenPoint.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - screenPoint.y) / 2) * canvas.clientHeight,
      };
    },
    scoreboard: paintScore,
    cheer(seconds = 1.8) {
      cheer = seconds;
    },
    throw() {
      throwClock = 0;
      handoff = 0;
    },
    // view: { ball (state or null), aim, waiting (balls in the tray),
    //         showArrow, landing ({x,u} or null),
    //         windup (meter power while the roll is held, else null) }
    draw(dt, { ball: rolling, aim, waiting, showArrow, landing, windup }) {
      if (!fit()) return;
      clock += dt;
      cheer = Math.max(0, cheer - dt);
      poseBowler(dt, { windup: windup ?? null, aiming: showArrow, aim });

      // The ball is in the critter's paw until it's rolled (or at the foul
      // line while the critter's model is still loading).
      if (rolling && rolling.phase !== "done") {
        ball.visible = true;
        ball.position.set(rolling.x, rolling.y, rolling.z);
        ball.rotation.set(rolling.spin, 0, 0);
        // Just after letting go, slide the ball from the paw onto the lane
        // so it doesn't jump.
        if (pose?.paw && handoff < HANDOFF) {
          handoff += dt;
          const t = Math.min(1, handoff / HANDOFF);
          heldBall.getWorldPosition(pawAt);
          ball.position.lerpVectors(pawAt, ball.position, t * t * (3 - 2 * t));
        }
      } else if (showArrow && !pose?.paw) {
        ball.visible = true;
        ball.position.set(0, LANE_Y + BALL_RADIUS, 0);
        ball.rotation.set(0, 0, 0);
      } else ball.visible = false;
      tray.forEach((b, i) => {
        b.visible = i < waiting;
        b.position.set(
          LANE_HALF - 0.02 - i * (BALL_RADIUS * 2 + 0.006),
          LANE_Y - 0.045 + BALL_RADIUS,
          -0.22,
        );
      });

      dots.visible = rims.visible = showArrow;
      if (showArrow && aim !== lastAim) {
        placeAimLine(aim);
        lastAim = aim;
      }

      guide.visible = !!landing;
      if (landing) {
        const p = boardPoint(landing.x, landing.u, 0.004);
        guide.position.set(p.x, p.y, p.z);
        guide.rotation.set(-Math.PI / 2 - BOARD_ANGLE, 0, 0);
        guide.scale.setScalar(1 + Math.sin(clock * 8) * 0.12);
      }

      // The camera follows the ball up the lane to the target, stays there
      // while it drops, then goes back behind the foul line.
      let follow = 0;
      if (rolling && rolling.phase !== "back") {
        const t =
          rolling.phase === "lane"
            ? Math.max(0, Math.min(1, (rolling.z - 0.6) / 2.2))
            : 1;
        follow = t * t * (3 - 2 * t);
      }
      wantAt.lerpVectors(AIM_VIEW.at, TARGET_VIEW.at, follow);
      wantLook.lerpVectors(AIM_VIEW.look, TARGET_VIEW.look, follow);
      const ease = 1 - Math.exp(-dt * 3.5);
      camAt.lerp(wantAt, ease);
      camLook.lerp(wantLook, ease);
      const back = Math.max(0, 0.9 / camera.aspect - 0.6);
      camera.position.set(camAt.x, camAt.y + back * 0.4, camAt.z - back);
      camera.lookAt(camLook);
      renderer.render(scene, camera);
    },
    dispose() {
      spot.shadow.dispose();
      heldBall.removeFromParent();
      player.removeFromParent();
      disposeAvatar(player);
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
