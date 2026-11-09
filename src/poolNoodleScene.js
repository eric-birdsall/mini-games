import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
import {
  BLADE_Y,
  HANG_BOTTOM,
  NOODLE_LENGTH,
  RATTLE,
  STATIONS,
  noodleBottom,
} from "../shared/poolNoodle.js";

// Four chopping stations side by side. Each has a rack whose arm holds a
// pool noodle over the station, and a critter with a foam sword whose blade
// sweeps flat at BLADE_Y. The noodle hangs at x = noodleX(station), z = 0.
export const STATION_WIDTH = 2.8;
const NOODLE_RADIUS = 0.07;
const HOLE_RADIUS = 0.026;
const SWORD_LENGTH = 1.08;
// How long a swing takes, and the blade angles (about y) it sweeps through:
// pointing back past the shoulder, through the noodle (0), out to the front.
const SWING_TIME = 0.16;
const REST_ANGLE = 1.3;
const REST_LIFT = 0.95;
const WINDUP_ANGLE = 0.55;
const FOLLOW_ANGLE = -1.65;
const GRAVITY_REST = 9;
// The slice of the yard that must stay on screen whatever the aspect ratio.
const VIEW_HALF_WIDTH = 5.75;
const VIEW_HALF_HEIGHT = 2.95;
const LOOK = new T.Vector3(0, 2.35, 0);

export const stationX = (i) => (i - (STATIONS - 1) / 2) * STATION_WIDTH;
export const noodleX = (i) => stationX(i) + 0.35;
const pivotX = (i) => stationX(i) - 0.4;
const PIVOT_Z = 0.05;

export const NOODLE_COLORS = [
  "#ff5fa2",
  "#ffd23f",
  "#46d37a",
  "#ff8a3d",
  "#3fb4ff",
];
const STRIPE_COLOR = "#1d2b5a";

export function createPoolNoodleScene(canvas, players) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfe3f0");
  scene.fog = new T.Fog("#bfe3f0", 26, 60);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(0, 3.3, 12.5);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fff6dc", "#6c8f55", 2.2));
  const sun = new T.DirectionalLight("#fff1ce", 2.6);
  sun.position.set(-5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -10,
    right: 10,
    top: 10,
    bottom: -6,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const mat = (color, roughness = 0.7) =>
    new T.MeshStandardMaterial({ color, roughness });
  function mesh(geometry, material, x, y, z, parent = scene) {
    const model = new T.Mesh(geometry, material);
    model.position.set(x, y, z);
    model.castShadow = model.receiveShadow = true;
    parent.add(model);
    return model;
  }
  const box = (w, h, d, material, x, y, z, parent) =>
    mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);

  // --- Yard ---------------------------------------------------------------
  box(90, 0.2, 90, mat("#86b25a"), 0, -0.1, 0).castShadow = false;
  const stripe = mat("#93bd64");
  for (let i = -3; i <= 3; i++)
    box(90, 0.01, 1.4, stripe, 0, 0.005, i * 2.8 + 1).castShadow = false;

  const picket = mat("#f4efe2");
  for (let i = -16; i <= 16; i++)
    box(0.32, 1.5, 0.08, picket, i * 0.62, 0.75, -6.5);
  box(21, 0.12, 0.06, picket, 0, 1.05, -6.45);
  box(21, 0.12, 0.06, picket, 0, 0.45, -6.45);

  const hedge = [mat("#5f8f45"), mat("#6e9d4c"), mat("#557f3e")];
  const blob = new T.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 14; i++) {
    const x = (i - 6.5) * 1.9 + Math.sin(i * 2.3) * 0.4;
    mesh(blob, hedge[i % 3], x, 0.9, -7.6 - (i % 2) * 0.6).scale.set(
      1.3,
      1.1,
      0.9,
    );
  }
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 4.6;
    mesh(
      new T.CylinderGeometry(0.15, 0.22, 2.4, 8),
      mat("#7a5532"),
      x,
      1.2,
      -15,
    );
    mesh(blob, hedge[(i + 1) % 3], x, 3.3, -15).scale.set(1.9, 2.1, 1.7);
  }

  // A kiddie pool off to the side, for the noodles' sake.
  const pool = mesh(
    new T.CylinderGeometry(1.6, 1.6, 0.4, 32, 1, true),
    mat("#4fb3e8", 0.5),
    -4.2,
    0.2,
    -4.4,
  );
  pool.material.side = T.DoubleSide;
  mesh(
    new T.CylinderGeometry(1.55, 1.55, 0.02, 32),
    new T.MeshStandardMaterial({ color: "#8fdcff", roughness: 0.15 }),
    -4.2,
    0.32,
    -4.4,
  );
  const poolRim = mesh(
    new T.TorusGeometry(1.6, 0.09, 8, 32),
    mat("#ffffff", 0.5),
    -4.2,
    0.4,
    -4.4,
  );
  poolRim.rotation.x = Math.PI / 2;

  // --- Noodles ------------------------------------------------------------
  const unit = new T.CylinderGeometry(NOODLE_RADIUS, NOODLE_RADIUS, 1, 14);
  const band = new T.CylinderGeometry(
    NOODLE_RADIUS * 1.04,
    NOODLE_RADIUS * 1.04,
    1,
    14,
  );
  const hole = new T.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 1, 10);
  const holeMat = mat("#2a2a2a", 0.9);
  const stripeMat = mat(STRIPE_COLOR, 0.6);
  const foamMats = NOODLE_COLORS.map((c) => mat(c, 0.75));

  // A piece of noodle from a to b (heights above the noodle's bottom end),
  // centred on its group's origin, with whatever part of the stripe it has.
  function makePiece(a, b, round, color) {
    const g = new T.Group();
    const length = b - a;
    const body = mesh(unit, foamMats[color], 0, 0, 0, g);
    body.scale.y = length;
    const core = mesh(hole, holeMat, 0, 0, 0, g);
    core.scale.y = length + 0.004;
    core.castShadow = false;
    const s0 = Math.max(a, round.stripe - round.width / 2);
    const s1 = Math.min(b, round.stripe + round.width / 2);
    if (s1 > s0) {
      const s = mesh(band, stripeMat, 0, (s0 + s1) / 2 - (a + b) / 2, 0, g);
      s.scale.y = s1 - s0;
    }
    g.userData = { a, b, length };
    scene.add(g);
    return g;
  }

  // Loose pieces tumbling to the grass.
  const pieces = [];
  function launch(model, from, vy, vx, vz, spin) {
    pieces.push({
      model,
      half: model.userData.length / 2,
      vx,
      vy,
      vz,
      spin,
      tilt: 0,
      age: 0,
      resting: false,
      ...from,
    });
  }

  // --- Stations -----------------------------------------------------------
  const rackWood = mat("#c08a52", 0.8);
  const rackDark = mat("#8d5f34", 0.8);
  const metal = mat("#b9c0c7", 0.35);
  const handleMat = mat("#3b3b4a", 0.6);
  const stations = players.map((player, i) => {
    const nx = noodleX(i);
    // Rack: a post at the back with an arm reaching over the noodle.
    box(0.6, 0.08, 0.6, rackDark, nx, 0.04, -0.85);
    box(0.14, 4.55, 0.14, rackWood, nx, 2.3, -0.85);
    box(0.12, 0.12, 1.0, rackWood, nx, 4.5, -0.4);
    const clamp = new T.Group();
    clamp.position.set(nx, 4.38, 0);
    scene.add(clamp);
    box(0.24, 0.14, 0.24, metal, 0, 0, 0, clamp);
    box(0.05, 0.12, 0.05, metal, 0, 0.08, 0, clamp);
    // A coloured tab on the post marks the blade's height.
    const tab = box(
      0.2,
      0.06,
      0.06,
      mat(player.color, 0.5),
      nx,
      BLADE_Y,
      -0.74,
    );
    tab.castShadow = false;

    // A coloured patch of grass marks whose station it is.
    const patch = new T.Mesh(
      new T.CircleGeometry(1.2, 32),
      new T.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(stationX(i), 0.015, 0.1);
    patch.scale.set(1, 0.75, 1);
    scene.add(patch);

    const avatar = createAvatar("attacker", player.avatar, false);
    avatar.position.set(stationX(i) - 0.62, 0, -0.2);
    avatar.rotation.y = 0.55;
    avatar.scale.setScalar(0.85);
    scene.add(avatar);

    // Foam sword: a handle and guard at the pivot, a foam blade along +x.
    const sword = new T.Group();
    sword.position.set(pivotX(i), BLADE_Y, PIVOT_Z);
    scene.add(sword);
    const blade = new T.Group();
    sword.add(blade);
    const along = (geometry, material, from, to) => {
      const m = mesh(geometry, material, (from + to) / 2, 0, 0, blade);
      m.rotation.z = Math.PI / 2;
      m.scale.y = to - from;
      return m;
    };
    along(new T.CylinderGeometry(0.035, 0.035, 1, 10), handleMat, -0.2, 0.04);
    box(0.06, 0.08, 0.3, mat(player.color, 0.5), 0.06, 0, 0, blade);
    along(
      new T.CylinderGeometry(0.055, 0.06, 1, 12),
      mat(player.color, 0.8),
      0.09,
      SWORD_LENGTH - 0.06,
    );
    const tip = mesh(
      new T.SphereGeometry(0.06, 12, 8),
      mat(player.color, 0.8),
      SWORD_LENGTH - 0.06,
      0,
      0,
      blade,
    );
    tip.scale.x = 1.2;

    // The blade's path: a faint sweep that lights up as it swings.
    const path = new T.Mesh(
      new T.RingGeometry(
        0.12,
        SWORD_LENGTH,
        40,
        1,
        FOLLOW_ANGLE,
        REST_ANGLE - FOLLOW_ANGLE,
      ),
      new T.MeshBasicMaterial({
        color: player.color,
        transparent: true,
        opacity: 0.2,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(pivotX(i), BLADE_Y - 0.01, PIVOT_Z);
    scene.add(path);

    return {
      i,
      clamp,
      avatar,
      sword,
      blade,
      path,
      noodle: null,
      swingAt: null,
      free: false,
    };
  });

  let round = null;
  let color = 0;

  function clearNoodles() {
    for (const s of stations) {
      if (s.noodle) dispose(s.noodle);
      s.noodle = null;
      s.swingAt = null;
      s.free = false;
    }
    for (const p of pieces) dispose(p.model);
    pieces.length = 0;
  }
  function dispose(group) {
    scene.remove(group);
    // Only the per-piece group; geometries and materials are shared.
  }

  // --- Drawing ------------------------------------------------------------
  const size = new T.Vector2();
  const point = new T.Vector3();
  let clock = 0;
  let lastT = 0;

  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      const distance = camera.position.distanceTo(LOOK);
      const tanHalf = Math.max(
        VIEW_HALF_HEIGHT / distance,
        VIEW_HALF_WIDTH / (aspect * distance),
      );
      camera.fov = T.MathUtils.radToDeg(2 * Math.atan(tanHalf));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  // The noodle's speed at round time t (negative = down).
  const speed = (t) => -round.gravity * Math.max(0, t - round.release);

  function hangingCentre(s, t) {
    const bottom = noodleBottom(round, t);
    let shake = 0;
    if (t < round.release && t > round.release - RATTLE)
      shake = Math.sin(clock * 55) * 0.02;
    return { x: noodleX(s.i) + shake, y: bottom + NOODLE_LENGTH / 2, z: 0 };
  }

  function stepPieces(dt) {
    for (const p of pieces) {
      p.age += dt;
      if (p.resting) continue;
      p.vy -= (p.y > p.half + 0.2 ? round.gravity : GRAVITY_REST) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.tilt += p.spin * dt;
      const lean = Math.abs(Math.sin(p.tilt));
      const lowest =
        p.y - p.half * Math.abs(Math.cos(p.tilt)) - NOODLE_RADIUS * lean;
      if (lowest < 0) {
        p.y -= lowest;
        if (p.vy < 0) p.vy = -p.vy * 0.28;
        p.vx *= 0.6;
        p.vz *= 0.6;
        // Topple over onto the grass, the way it was already leaning.
        p.side ??= Math.sign(Math.sin(p.tilt)) || (p.vx >= 0 ? -1 : 1);
      }
      if (p.side) {
        // Falling over speeds up as it leans further.
        p.spin += p.side * (2 + 9 * Math.abs(Math.sin(p.tilt))) * dt;
        if (p.side * p.tilt >= Math.PI / 2) {
          p.tilt = (Math.PI / 2) * p.side;
          p.spin = 0;
          if (Math.abs(p.vy) < 0.6 && p.y <= NOODLE_RADIUS + 0.05) {
            p.y = NOODLE_RADIUS;
            p.resting = true;
          }
        }
      }
      p.model.position.set(p.x, p.y, p.z);
      p.model.rotation.set(0, 0, p.tilt);
    }
  }

  function swingAngle(s, t) {
    if (s.swingAt === null || t < s.swingAt)
      return { angle: REST_ANGLE, lift: REST_LIFT, glow: 0 };
    const f = Math.min(1, (t - s.swingAt) / SWING_TIME);
    if (f < 1) {
      const e = 1 - (1 - f) ** 2;
      return {
        angle: T.MathUtils.lerp(WINDUP_ANGLE, FOLLOW_ANGLE, e),
        lift: 0,
        glow: 1 - f * 0.5,
      };
    }
    // Hold the follow-through, then drift back to rest.
    const back = T.MathUtils.clamp((t - s.swingAt - 0.6) / 0.5, 0, 1);
    return {
      angle: T.MathUtils.lerp(FOLLOW_ANGLE, REST_ANGLE, back),
      lift: back * REST_LIFT,
      glow: Math.max(0, 0.5 - (t - s.swingAt - SWING_TIME) * 1.5),
    };
  }

  return {
    // A new round: fresh noodles hang in every rack.
    setRound(next, colorIndex) {
      clearNoodles();
      round = next;
      color = colorIndex % NOODLE_COLORS.length;
      for (const s of stations) {
        s.noodle = makePiece(0, NOODLE_LENGTH, round, color);
        s.noodle.position.set(noodleX(s.i), HANG_BOTTOM + NOODLE_LENGTH / 2, 0);
        s.noodle.scale.setScalar(0.01);
      }
    },
    // A station swings at round time t.
    swing(i, t) {
      stations[i].swingAt = t;
    },
    // The blade went through the noodle `height` above its bottom end at
    // round time t: split it, and knock the bottom piece away.
    chop(i, height, t) {
      const s = stations[i];
      if (!s.noodle || s.free) return;
      s.free = true;
      const c = hangingCentre(s, t);
      const bottom = c.y - NOODLE_LENGTH / 2;
      dispose(s.noodle);
      s.noodle = null;
      const v = speed(t);
      const low = makePiece(0, height, round, color);
      const high = makePiece(height, NOODLE_LENGTH, round, color);
      if (height > 0.02)
        launch(
          low,
          { x: c.x, y: bottom + height / 2, z: 0 },
          v * 0.7 + 0.6,
          0.6,
          1.6,
          -2.5 - Math.random(),
        );
      else dispose(low);
      launch(
        high,
        { x: c.x, y: bottom + (height + NOODLE_LENGTH) / 2, z: 0 },
        v,
        0.15,
        0.25,
        -0.4,
      );
    },
    // Nobody cut it: the whole noodle falls past the blade.
    drop(i, t) {
      const s = stations[i];
      if (!s.noodle || s.free) return;
      s.free = true;
      const c = hangingCentre(s, t);
      const whole = s.noodle;
      s.noodle = null;
      launch(whole, c, speed(t), 0, 0.2, 0.3);
    },
    toScreen(x, y, z = 0) {
      point.set(x, y, z).project(camera);
      return {
        x: ((point.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - point.y) / 2) * canvas.clientHeight,
      };
    },
    // Where a station's cut pop should show.
    cutScreen(i) {
      return this.toScreen(noodleX(i) + 0.2, BLADE_Y + 0.9, 0);
    },
    // view: { t } — round time.
    draw(dt, view) {
      if (!fit()) return;
      clock += dt;
      const t = view.t;
      const step = Math.max(0, Math.min(t - lastT, 0.05));
      lastT = t;
      if (round) {
        for (const s of stations) {
          if (s.noodle && !s.free) {
            const c = hangingCentre(s, t);
            s.noodle.position.set(c.x, c.y, c.z);
            const grow = Math.min(1, s.noodle.scale.x + dt * 4);
            s.noodle.scale.setScalar(grow);
          }
        }
        stepPieces(step);
        for (const s of stations) {
          const rattle =
            t < round.release && t > round.release - RATTLE
              ? Math.sin(clock * 55) * 0.02
              : 0;
          s.clamp.position.x = noodleX(s.i) + rattle;
        }
      }
      for (const s of stations) {
        const { angle, lift, glow } = swingAngle(s, t);
        s.sword.rotation.set(0, angle, 0);
        s.blade.rotation.z = lift;
        s.path.material.opacity = 0.2 + glow * 0.4;
        // The critter twists with the swing.
        const twist = 0.55 + (REST_ANGLE - angle) * 0.18;
        s.avatar.rotation.y +=
          (twist - s.avatar.rotation.y) * Math.min(1, dt * 20);
        animateAvatar(s.avatar, { moveSpeed: 0 }, dt);
        const rig = s.avatar.userData.fallback?.userData.robot;
        rig?.arms.forEach((arm, k) => {
          arm.rotation.x = -1.2;
          arm.rotation.z = k ? -0.2 : 0.2;
          rig.elbows[k].rotation.x = 0.1;
        });
      }
      renderer.render(scene, camera);
    },
    dispose() {
      clearNoodles();
      for (const s of stations) releaseAvatar(s.avatar);
      scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      unit.dispose();
      band.dispose();
      hole.dispose();
      for (const m of [holeMat, stripeMat, ...foamMats]) m.dispose();
      sun.shadow.dispose();
      renderer.dispose();
    },
  };
}
