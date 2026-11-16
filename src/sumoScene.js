import * as T from "three";
import { SUMO, SUMO_STATE as S } from "../shared/sumo.js";
import { COLORS } from "../shared/avatars.js";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";

const TOP = SUMO.ring.height;
const RADIUS = SUMO.ring.radius;
const turn = Math.PI * 2;
const palette = {
  grass: "#7fa74d",
  deck: "#bf7c51",
  sand: "#efd095",
  line: "#fff4d4",
  base: "#7d493c",
  trim: "#c06346",
};

export function createSumoScene(canvas, seats) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new T.Scene();
  scene.background = new T.Color(palette.grass);
  const camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 90);
  const horizontal = 16 / Math.sqrt(2);
  camera.position.set(
    horizontal,
    16 * Math.tan((55 * Math.PI) / 180),
    horizontal,
  );
  camera.lookAt(0, TOP - 0.2, 0);
  scene.add(new T.HemisphereLight("#fff6df", "#526440", 2.25));
  const sun = new T.DirectionalLight("#fff0cf", 2.05);
  sun.position.set(-6, 12, 4);
  scene.add(sun);

  const material = (color) =>
    new T.MeshStandardMaterial({ color, roughness: 0.93 });
  const mesh = (geometry, surface, x, y, z) => {
    const item = new T.Mesh(geometry, surface);
    item.position.set(x, y, z);
    scene.add(item);
    return item;
  };
  const flatRing = (inner, outer, color, y, x = 0, z = 0) => {
    const item = mesh(
      new T.RingGeometry(inner, outer, 96),
      new T.MeshBasicMaterial({ color }),
      x,
      y,
      z,
    );
    item.rotation.x = -Math.PI / 2;
    return item;
  };
  const cylinder = (r1, r2, height, color, y) =>
    mesh(new T.CylinderGeometry(r1, r2, height, 96), material(color), 0, y, 0);

  const lawn = mesh(
    new T.PlaneGeometry(120, 120),
    material(palette.grass),
    0,
    -0.04,
    0,
  );
  lawn.rotation.x = -Math.PI / 2;
  const shade = flatRing(0, RADIUS + 0.58, "#67863f", -0.02, 0.35, 0.38);
  shade.scale.y = 1.02;
  cylinder(RADIUS - 0.37, RADIUS + 0.13, TOP, palette.base, TOP / 2 - 0.06);
  cylinder(
    RADIUS,
    RADIUS + 0.05,
    SUMO.ring.thickness,
    palette.deck,
    TOP - SUMO.ring.thickness / 2,
  );
  cylinder(RADIUS + 0.052, RADIUS + 0.062, 0.16, palette.trim, TOP - 0.43);
  flatRing(0, RADIUS, palette.sand, TOP + 0.002);
  flatRing(RADIUS - 0.15, RADIUS, palette.line, TOP + 0.008);
  flatRing(RADIUS - 0.36, RADIUS - 0.32, "#dbaf73", TOP + 0.009);
  flatRing(1.71, 1.74, "#deb57b", TOP + 0.009);
  const startLine = new T.BoxGeometry(1.22, 0.025, 0.13);
  const chalk = material(palette.line);
  for (const sign of [-1, 1])
    mesh(startLine, chalk, 0, TOP + 0.009, sign * 0.55);

  // Painted grass clumps outside the ring, placed consistently on each visit.
  const blade = new T.ConeGeometry(0.11, 0.38, 3);
  const blades = [material("#6a963e"), material("#94b75c")];
  for (let i = 0; i < 67; i++) {
    const angle = i * 2.399963,
      distance = RADIUS + 0.9 + (i % 13) * 0.54;
    const x = Math.cos(angle) * distance,
      z = Math.sin(angle) * distance;
    for (let j = -1; j <= 1; j++) {
      const stem = mesh(blade, blades[i % 2], x + j * 0.13, 0.13, z);
      stem.rotation.set(0, angle, j * 0.38);
    }
  }

  const actors = seats.map(({ avatar }) => {
    const root = createAvatar("attacker", avatar);
    scene.add(root);
    const marker = flatRing(0.53, 0.67, COLORS[avatar.color], TOP + 0.017);
    const shadow = flatRing(0, 0.55, "#c3a16c", TOP + 0.012);
    const guard = flatRing(0.72, 0.86, "#faffb5", TOP + 0.025);
    return { root, marker, shadow, guard };
  });
  const label = new T.Vector3();
  const resize = () => {
    const width = canvas.clientWidth || 1,
      height = canvas.clientHeight || 1;
    const aspect = width / height;
    const halfY = Math.max(7.7, (RADIUS + 1.3) / aspect);
    Object.assign(camera, {
      left: -halfY * aspect,
      right: halfY * aspect,
      top: halfY,
      bottom: -halfY,
    });
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  return {
    resize,
    draw(match, time, dt, finishedFor, tags) {
      match.players.forEach((p, i) => {
        const { root, marker, shadow, guard } = actors[i];
        const out = p.state === S.OUT;
        const age = (match.clock - p.outAt) * SUMO.step + finishedFor;
        const dodge =
          p.state === S.DODGE
            ? Math.sin(
                (Math.PI * (p.until - match.clock) * SUMO.step) /
                  SUMO.dodge.duration,
              )
            : 0;
        const win = match.phase === "finished" && !out;
        const fall = out ? age : 0;
        root.visible = !out || fall < 0.95;
        root.position.set(
          p.x + p.vx * fall * 0.44,
          TOP +
            0.48 * dodge -
            fall * fall * 8 +
            (win ? Math.abs(Math.sin(time * 6)) * 0.26 : 0),
          p.z + p.vz * fall * 0.44,
        );
        root.rotation.y = -p.facing - Math.PI / 2 + fall * 3;
        root.rotation.x = out
          ? fall * 7
          : p.state === S.DASH
            ? -0.43
            : p.state === S.WINDUP
              ? 0.21
              : p.state === S.HOLD || match.clock - p.throwAt < 10
                ? -0.24
                : p.state === S.CAUGHT || p.state === S.HIT
                  ? 0.3
                  : -dodge * 0.2;
        root.rotation.z = out ? fall * 4 : 0;
        animateAvatar(
          root,
          {
            moveSpeed: out ? 0 : Math.hypot(p.vx, p.vz),
            grounded: !dodge && !out,
            crouch: p.state === S.BRACE || p.state === S.PLANT,
            hits: p.hits,
          },
          dt,
          win ? "win" : undefined,
        );
        marker.visible = shadow.visible = !out;
        marker.position.x = shadow.position.x = guard.position.x = p.x;
        marker.position.z = shadow.position.z = guard.position.z = p.z;
        guard.visible = [S.PLANT, S.BRACE, S.DASH, S.CAUGHT, S.DODGE].includes(
          p.state,
        );
        guard.material.color.set(
          p.state === S.CAUGHT
            ? "#ed5a48"
            : p.state === S.DASH
              ? "#fff8db"
              : p.state === S.DODGE
                ? "#9bf9fd"
                : "#eff667",
        );
        guard.scale.setScalar(1 + Math.sin(time * 22) * 0.08);
        const tag = tags[i];
        tag.hidden = out;
        if (!out) {
          label.copy(root.position);
          label.y += 1.98;
          label.project(camera);
          tag.style.left = `${(label.x + 1) * 50}%`;
          tag.style.top = `${(1 - label.y) * 50}%`;
          const caption =
            p.state === S.CAUGHT
              ? `P${i + 1} · ${seats[i].counter}!`
              : `P${i + 1}`;
          if (tag.textContent !== caption) tag.textContent = caption;
          tag.classList.toggle("caught", p.state === S.CAUGHT);
        }
      });
      renderer.render(scene, camera);
    },
    dispose() {
      actors.forEach(({ root }) => releaseAvatar(root));
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((obj) => {
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material) materials.add(obj.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      renderer.dispose();
    },
  };
}
