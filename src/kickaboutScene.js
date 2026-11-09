import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import { COLORS } from "../shared/avatars.js";
import { FIELD } from "../shared/kickabout.js";

// A backyard soccer pitch seen from high up on the near touchline. Field
// coordinates (x along the pitch, y across it, +y away from the camera) map
// to three.js as (x, height, -y).

const BALL_R = 0.3; // drawn a little bigger than it plays, so it's easy to see
const PX = 40; // field texture pixels per metre
const MARGIN = 3;

function fieldTexture() {
  const w = (FIELD.halfL + MARGIN) * 2,
    h = (FIELD.halfW + MARGIN) * 2;
  const c = document.createElement("canvas");
  c.width = w * PX;
  c.height = h * PX;
  const g = c.getContext("2d");
  // Mowing stripes across the pitch.
  for (let i = 0; i * 4 < w; i++) {
    g.fillStyle = i % 2 ? "#5fb948" : "#6cc552";
    g.fillRect(i * 4 * PX, 0, 4 * PX, c.height);
  }
  const X = (x) => (x + FIELD.halfL + MARGIN) * PX;
  const Y = (y) => (FIELD.halfW + MARGIN - y) * PX;
  g.strokeStyle = "#ffffffe8";
  g.lineWidth = 0.14 * PX;
  g.strokeRect(
    X(-FIELD.halfL),
    Y(FIELD.halfW),
    2 * FIELD.halfL * PX,
    2 * FIELD.halfW * PX,
  );
  g.beginPath();
  g.moveTo(X(0), Y(FIELD.halfW));
  g.lineTo(X(0), Y(-FIELD.halfW));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), FIELD.circle * PX, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffffffe8";
  g.beginPath();
  g.arc(X(0), Y(0), 0.2 * PX, 0, Math.PI * 2);
  g.fill();
  for (const s of [-1, 1]) {
    const gx = s * FIELD.halfL;
    g.strokeRect(
      Math.min(X(gx), X(gx - s * FIELD.boxDepth)),
      Y(FIELD.boxHalf),
      FIELD.boxDepth * PX,
      2 * FIELD.boxHalf * PX,
    );
    g.strokeRect(
      Math.min(X(gx), X(gx - s * 2.2)),
      Y(FIELD.goalHalf + 1.4),
      2.2 * PX,
      2 * (FIELD.goalHalf + 1.4) * PX,
    );
    g.beginPath();
    g.arc(X(gx - s * 4.6), Y(0), 0.16 * PX, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w, h };
}

function ballTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#26324a";
  const spots = [
    [32, 64],
    [96, 64],
    [160, 64],
    [224, 64],
    [0, 14],
    [64, 14],
    [128, 14],
    [192, 14],
    [256, 14],
    [0, 114],
    [64, 114],
    [128, 114],
    [192, 114],
    [256, 114],
  ];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 13);
    }
    g.fill();
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export function createKickaboutScene(canvas, teams) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color("#9fdcff");
  scene.fog = new T.Fog("#bfe8ff", 60, 140);
  const camera = new T.PerspectiveCamera(40, 1, 0.5, 300);

  scene.add(new T.HemisphereLight("#fffbe8", "#5b8a3a", 1.9));
  const sun = new T.DirectionalLight("#fff1d0", 2.4);
  sun.position.set(-10, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -FIELD.halfL - 4,
    right: FIELD.halfL + 4,
    top: FIELD.halfW + 4,
    bottom: -FIELD.halfW - 4,
    near: 1,
    far: 80,
  });
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const mats = new Map();
  const mat = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!mats.has(key))
      mats.set(
        key,
        new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra }),
      );
    return mats.get(key);
  };
  const box = new T.BoxGeometry(1, 1, 1);
  const add = (
    geo,
    material,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    shadow = true,
  ) => {
    const mesh = new T.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // --- The yard ---------------------------------------------------------
  const lawn = add(
    new T.PlaneGeometry(220, 160),
    mat("#58a83f"),
    0,
    -0.02,
    0,
    1,
    1,
    1,
    false,
  );
  lawn.rotation.x = -Math.PI / 2;
  const { tex: pitchTex, w: pw, h: ph } = fieldTexture();
  const pitch = add(
    new T.PlaneGeometry(pw, ph),
    new T.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }),
    0,
    0,
    0,
    1,
    1,
    1,
    false,
  );
  pitch.rotation.x = -Math.PI / 2;

  // A wooden fence round the yard (low on the near side so it never hides
  // the play).
  const plank = mat("#c99a6b");
  const postMat = mat("#a8774b");
  const fx = FIELD.halfL + MARGIN + 0.4,
    fz = FIELD.halfW + MARGIN - 0.6;
  for (const [x, z, len, rot, tall] of [
    [0, -fz, fx * 2, 0, 1.6],
    [0, fz, fx * 2, 0, 0.7],
    [-fx, 0, fz * 2, Math.PI / 2, 1.6],
    [fx, 0, fz * 2, Math.PI / 2, 1.6],
  ]) {
    const wall = add(box, plank, x, tall / 2, z, len, tall, 0.12);
    wall.rotation.y = rot;
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 2.5) {
      const px = rot ? x : x + s,
        pz = rot ? z + s : z;
      add(box, postMat, px, tall / 2 + 0.05, pz, 0.22, tall + 0.1, 0.22);
    }
  }
  // Trees and bushes beyond the fence.
  const trunk = new T.CylinderGeometry(0.35, 0.5, 1, 8);
  const crown = new T.IcosahedronGeometry(1, 1);
  const leaves = ["#3f8f3a", "#4ea345", "#357d33", "#5bb04b"];
  for (let i = 0; i < 26; i++) {
    const back = i < 16;
    const x = back
      ? -40 + i * 5.4 + Math.sin(i * 7) * 1.5
      : (i % 2 ? 1 : -1) * (fx + 5 + (i % 3) * 2.5);
    const z = back ? -fz - 4 - (i % 3) * 3 : -12 + Math.floor((i - 16) / 2) * 6;
    const s = 1.6 + ((i * 37) % 10) / 6;
    add(trunk, mat("#7a5232"), x, s * 1.1, z, s * 0.7, s * 2.2, s * 0.7);
    add(
      crown,
      mat(leaves[i % 4], { flatShading: true }),
      x,
      s * 2.8,
      z,
      s * 1.9,
      s * 1.7,
      s * 1.9,
    );
  }
  for (let i = 0; i < 18; i++) {
    const x = -fx + 2 + i * ((fx * 2 - 4) / 17);
    add(
      crown,
      mat(leaves[(i + 1) % 4], { flatShading: true }),
      x,
      0.6,
      -fz - 1.2,
      1.4,
      1,
      1,
    );
  }
  // A little shed in the far corner.
  add(box, mat("#e8735a"), -fx - 5, 1.6, -fz - 3, 6, 3.2, 4);
  const roof = add(
    new T.ConeGeometry(4.6, 1.8, 4),
    mat("#7a4a3a"),
    -fx - 5,
    4.1,
    -fz - 3,
  );
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.75);

  // --- Goals --------------------------------------------------------------
  const white = mat("#ffffff", { roughness: 0.4 });
  const postGeo = new T.CylinderGeometry(0.08, 0.08, 1, 10);
  const netMat = new T.LineBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.55,
  });
  const nets = [];
  for (const s of [-1, 1]) {
    const gx = s * FIELD.halfL;
    const H = FIELD.crossbar,
      W = FIELD.goalHalf,
      D = FIELD.goalDepth;
    for (const z of [-W, W]) add(postGeo, white, gx, H / 2, z, 1, H, 1);
    const bar = add(postGeo, white, gx, H, 0, 1, W * 2, 1);
    bar.rotation.x = Math.PI / 2;
    // Net: a grid over the back, the sides and the top.
    const pts = [];
    const line = (a, b) => pts.push(...a, ...b);
    const bx = gx + s * D;
    for (let z = -W; z <= W + 0.01; z += 0.4) {
      line([bx, 0, z], [bx, H * 0.9, z]);
      line([gx, H, z], [bx, H * 0.9, z]);
    }
    for (let y = 0; y <= H * 0.9 + 0.01; y += 0.35)
      line([bx, y, -W], [bx, y, W]);
    for (let t = 0; t <= 1.001; t += 0.2) {
      const x = gx + s * D * t,
        y = H + (H * 0.9 - H) * t;
      line([x, y, -W], [x, y, W]);
      for (const z of [-W, W]) line([x, 0, z], [x, y, z]);
    }
    for (const z of [-W, W])
      for (let y = 0; y <= H; y += 0.35)
        line([gx, y, z], [bx, Math.min(y, H * 0.9), z]);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    const net = new T.LineSegments(g, netMat);
    scene.add(net);
    nets.push({ net, side: s, wobble: 0 });
  }

  // --- Ball -----------------------------------------------------------------
  const ballTex = ballTexture();
  const ball = add(
    new T.SphereGeometry(BALL_R, 24, 16),
    new T.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }),
    0,
    BALL_R,
    0,
  );
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "#000000aa");
    grad.addColorStop(1, "#00000000");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();
  const ballShadow = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  scene.add(ballShadow);

  // --- Players ----------------------------------------------------------------
  const discGeo = new T.CircleGeometry(0.62, 32);
  const ringGeo = new T.RingGeometry(0.7, 0.86, 40);
  const actors = teams.flatMap((team, t) =>
    team.players.map((choice, slot) => {
      const root = createAvatar(
        t === 0 ? "attacker" : "defender",
        choice,
        false,
      );
      root.scale.setScalar(1.35);
      scene.add(root);
      const color = COLORS[team.color];
      const disc = new T.Mesh(
        discGeo,
        new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      scene.add(disc);
      let gloves = null;
      if (slot === 0) {
        gloves = new T.Mesh(
          ringGeo,
          new T.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
          }),
        );
        gloves.rotation.x = -Math.PI / 2;
        scene.add(gloves);
      }
      return { root, disc, gloves, tilt: 0, tiltDir: 0 };
    }),
  );

  // The controlled player: a bouncing arrow and a bright ring.
  const arrow = new T.Mesh(
    new T.ConeGeometry(0.5, 0.9, 4),
    new T.MeshStandardMaterial({
      color: "#ffe14a",
      emissive: "#ffb800",
      emissiveIntensity: 0.6,
    }),
  );
  arrow.rotation.x = Math.PI;
  scene.add(arrow);
  const youRing = new T.Mesh(
    new T.RingGeometry(0.78, 1.0, 40),
    new T.MeshBasicMaterial({
      color: "#ffe14a",
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  youRing.rotation.x = -Math.PI / 2;
  scene.add(youRing);

  // --- Particles -------------------------------------------------------------
  const bits = [];
  const bitGeo = new T.PlaneGeometry(0.22, 0.14);
  function burst(x, y, z, colors, n, speed, life = 1.4, up = 4) {
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(
        bitGeo,
        new T.MeshBasicMaterial({
          color: colors[i % colors.length],
          side: T.DoubleSide,
          transparent: true,
        }),
      );
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      m.userData = {
        vx: Math.cos(a) * s,
        vy: up * (0.5 + Math.random()),
        vz: Math.sin(a) * s,
        spin: (Math.random() - 0.5) * 12,
        life,
        max: life,
      };
      scene.add(m);
      bits.push(m);
    }
  }
  function updateBits(dt) {
    for (let i = bits.length - 1; i >= 0; i--) {
      const m = bits[i],
        u = m.userData;
      u.life -= dt;
      if (u.life <= 0) {
        scene.remove(m);
        m.material.dispose();
        bits.splice(i, 1);
        continue;
      }
      u.vy -= 9 * dt;
      u.vx *= 1 - dt * 1.5;
      u.vz *= 1 - dt * 1.5;
      m.position.x += u.vx * dt;
      m.position.y = Math.max(0.03, m.position.y + u.vy * dt);
      m.position.z += u.vz * dt;
      m.rotation.x += u.spin * dt;
      m.rotation.y += u.spin * 0.7 * dt;
      m.material.opacity = Math.min(1, (u.life / u.max) * 2);
    }
  }

  // --- Camera ------------------------------------------------------------------
  let width = 0,
    height = 0,
    camDist = 30,
    camX = 0,
    camZ = 0,
    shake = 0,
    span = FIELD.halfL;
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Wide screens see most of the pitch; tall ones step back and follow
    // the ball more closely.
    camera.fov = camera.aspect < 1 ? 50 : 40;
    camera.updateProjectionMatrix();
    camDist = Math.min(46, Math.max(37, 30 * (1.5 / camera.aspect) ** 0.55));
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    span = Math.max(0, FIELD.halfL + 2 - tan * camera.aspect * camDist * 0.95);
  }

  const q = new T.Quaternion(),
    axis = new T.Vector3();
  let time = 0;
  let lastBall = null;

  function draw(dt, m, view = {}) {
    resize();
    time += dt;
    const b = m.ball;

    // Ball: roll it the way it moves.
    const bx = b.x,
      bz = -b.y;
    if (lastBall) {
      const dx = bx - lastBall.x,
        dz = bz - lastBall.z,
        d = Math.hypot(dx, dz);
      if (d > 1e-4 && d < 3) {
        axis.set(dz, 0, -dx).normalize();
        q.setFromAxisAngle(axis, d / BALL_R);
        ball.quaternion.premultiply(q);
      }
    }
    lastBall = { x: bx, z: bz };
    ball.position.set(bx, BALL_R + b.z, bz);
    ballShadow.position.set(bx, 0.02, bz);
    const ss = 0.9 / (1 + b.z * 0.4);
    ballShadow.scale.set(ss, ss, 1);

    m.players.forEach((p, i) => {
      const a = actors[i];
      a.root.position.set(p.x, 0, -p.y);
      // Critter rigs face -Z at rotation 0.
      a.root.rotation.y = p.face - Math.PI / 2;
      a.tilt = Math.max(0, a.tilt - dt);
      const lean = a.tilt > 0 ? a.tiltDir * 1.1 : 0;
      a.root.rotation.z +=
        (lean - a.root.rotation.z) * (1 - Math.exp(-dt * 12));
      const lungeLean = p.lunge > 0 ? -0.45 : 0; // -X tips forward (-Z)
      a.root.rotation.x +=
        (lungeLean - a.root.rotation.x) * (1 - Math.exp(-dt * 14));
      const sp = Math.hypot(p.vx, p.vy);
      const celebrate =
        m.phase === "goal" && m.scorer?.team === p.team ? "win" : undefined;
      animateAvatar(
        a.root,
        { moveSpeed: sp, grounded: true },
        dt * (sp > 3.6 ? Math.max(1, sp / 6) : 1),
        celebrate,
      );
      a.disc.position.set(p.x, 0.03, -p.y);
      if (a.gloves) a.gloves.position.set(p.x, 0.035, -p.y);
    });

    const me = m.players[m.controlled];
    const showYou = view.showYou !== false && m.phase !== "over";
    arrow.visible = youRing.visible = showYou;
    arrow.position.set(me.x, 3.4 + Math.sin(time * 6) * 0.15, -me.y);
    arrow.rotation.y = time * 2;
    youRing.position.set(me.x, 0.04, -me.y);
    const pulse = 1 + Math.sin(time * 8) * 0.06;
    youRing.scale.set(pulse, pulse, 1);

    for (const n of nets) {
      n.wobble = Math.max(0, n.wobble - dt * 1.2);
      n.net.position.x = Math.sin(time * 30) * 0.06 * n.wobble * n.side;
    }

    // Camera: follow the ball along the pitch, a little towards it across.
    const followX = Math.max(-span, Math.min(span, b.x + (view.lead ?? 0)));
    camX += (followX - camX) * (1 - Math.exp(-dt * 3));
    const followZ = -b.y * 0.25;
    camZ += (followZ - camZ) * (1 - Math.exp(-dt * 2));
    shake = Math.max(0, shake - dt * 2);
    const sx = (Math.random() - 0.5) * shake,
      sy = (Math.random() - 0.5) * shake;
    camera.position.set(camX + sx, camDist * 0.84 + sy, camZ + camDist * 0.54);
    camera.lookAt(camX, 0, camZ + 0.5);

    updateBits(dt);
    renderer.render(scene, camera);
  }

  const v = new T.Vector3();
  return {
    draw,
    snap(m) {
      camX = Math.max(-span, Math.min(span, m.ball.x));
      camZ = -m.ball.y * 0.25;
      lastBall = null;
    },
    kick(b, power) {
      burst(
        b.x,
        0.1,
        -b.y,
        ["#7ed35f", "#a6e38a", "#ffffff"],
        power > 18 ? 8 : 4,
        2.2,
        0.6,
        2,
      );
      if (power > 18) shake = Math.max(shake, 0.12);
    },
    goal(team, b) {
      const n = nets.find((x) => Math.sign(b.x) === x.side);
      if (n) n.wobble = 1;
      const colors = [COLORS[teams[team].color], "#ffffff", "#ffe14a"];
      burst(b.x, 1.4, -b.y, colors, 70, 7, 2.4, 7);
      shake = 0.5;
    },
    save(p) {
      burst(p.x, 1, -p.y, ["#ffffff", "#ffe14a"], 10, 3, 0.7, 3);
    },
    dive(p, dir) {
      const a = actors[p.i];
      a.tilt = 0.55;
      // Leaning "left" or "right" on screen depends which way they face.
      a.tiltDir = (p.team === 0 ? 1 : -1) * dir;
    },
    steal(p) {
      burst(p.x, 0.4, -p.y, ["#ffffff", "#ffe14a"], 6, 2.5, 0.5, 2);
    },
    screen(x, y, h = 0) {
      v.set(x, h, -y).project(camera);
      return {
        x: ((v.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - v.y) / 2) * canvas.clientHeight,
      };
    },
    dispose() {
      for (const a of actors) releaseAvatar(a.root);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose?.();
      });
      for (const m of mats.values()) m.dispose();
      pitchTex.dispose();
      ballTex.dispose();
      shadowTex.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}
