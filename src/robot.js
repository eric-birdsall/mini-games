import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Splash's characters: friendly round robots. A big rounded head with a
// screen face (glowing eyes and a smile), a bulb antenna, a little body with
// a heart light, stubby legs and mitten hands. Infiltrators are sunny
// orange, sentinels sky blue. Built facing -Z, about 1.78 m tall.
const LOOKS = {
  attacker: { body: "#ffb347", trim: "#fff1d6", glow: "#ffe36e" },
  defender: { body: "#5cc8ff", trim: "#e3f6ff", glow: "#9dffcf" },
};

export function createRobot(team, showBackpack = true) {
  const look = LOOKS[team] || LOOKS.attacker,
    root = new T.Group(),
    pivot = new T.Group(),
    body = new T.MeshStandardMaterial({
      color: look.body,
      roughness: 0.45,
      metalness: 0.1,
    }),
    trim = new T.MeshStandardMaterial({
      color: look.trim,
      roughness: 0.5,
      metalness: 0.05,
    }),
    screen = new T.MeshStandardMaterial({
      color: "#1c2433",
      roughness: 0.2,
      metalness: 0.3,
    }),
    glow = new T.MeshStandardMaterial({
      color: look.glow,
      emissive: look.glow,
      emissiveIntensity: 0.9,
    }),
    cheek = new T.MeshStandardMaterial({
      color: "#ff8fb1",
      emissive: "#ff8fb1",
      emissiveIntensity: 0.4,
    });
  root.userData.team = team;
  root.add(pivot);
  const add = (mesh, x, y, z, parent = pivot) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const rounded = (w, h, d, r, mat) =>
    new T.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
  // Overlapping ball joints keep the limb chains connected as they bend.
  const knees = [],
    elbows = [];
  const joint = (radius, mat, y, parent) =>
    add(new T.Mesh(new T.SphereGeometry(radius, 16, 12), mat), 0, y, 0, parent);
  const segment = (radius, length, parent) =>
    add(
      new T.Mesh(
        new T.CapsuleGeometry(radius, length - radius * 2, 6, 12),
        trim,
      ),
      0,
      -length / 2,
      0,
      parent,
    );
  const legs = [-0.13, 0.13].map((x) => {
    const hip = new T.Group();
    hip.position.set(x, 0.67, 0);
    pivot.add(hip);
    joint(0.09, body, 0, hip);
    segment(0.075, 0.28, hip);
    const knee = new T.Group();
    knee.position.y = -0.28;
    hip.add(knee);
    joint(0.077, trim, 0, knee);
    segment(0.07, 0.28, knee);
    const foot = add(
      new T.Mesh(new T.SphereGeometry(0.12, 16, 12), body),
      0,
      -0.56 + 0.28,
      -0.04,
      knee,
    );
    foot.scale.set(1, 0.65, 1.35);
    knees.push(knee);
    return hip;
  });
  // Body: a soft barrel with a belt and a heart light on the chest.
  add(rounded(0.52, 0.56, 0.38, 0.16, body), 0, 0.92, 0);
  add(
    new T.Mesh(new T.CylinderGeometry(0.27, 0.27, 0.06, 20), trim),
    0,
    0.68,
    0,
  );
  const heart = new T.Shape();
  heart.moveTo(0, -0.05);
  heart.bezierCurveTo(-0.09, 0.01, -0.05, 0.08, 0, 0.04);
  heart.bezierCurveTo(0.05, 0.08, 0.09, 0.01, 0, -0.05);
  const chest = add(
    new T.Mesh(
      new T.ExtrudeGeometry(heart, { depth: 0.02, bevelEnabled: false }),
      glow,
    ),
    0,
    0.98,
    -0.2,
  );
  chest.rotation.y = Math.PI;
  // A backpack stuffed with water balloons: a canvas pack with a rolled
  // rim and a front pocket, straps over the shoulders, and a bunch of
  // bright balloons crowding out of the top.
  const backpack = new T.Group();
  backpack.name = "backpack";
  backpack.visible = showBackpack;
  pivot.add(backpack);
  const canvas = new T.MeshStandardMaterial({
    color: "#4f6d7a",
    roughness: 0.85,
  });
  add(rounded(0.4, 0.42, 0.2, 0.07, canvas), 0, 0.92, 0.29, backpack);
  add(rounded(0.42, 0.05, 0.22, 0.025, trim), 0, 1.12, 0.29, backpack);
  add(rounded(0.28, 0.16, 0.06, 0.03, canvas), 0, 0.82, 0.4, backpack);
  for (const x of [-0.14, 0.14]) {
    add(rounded(0.06, 0.4, 0.02, 0.01, canvas), x, 0.95, -0.195, backpack);
    add(rounded(0.06, 0.03, 0.42, 0.01, canvas), x, 1.18, 0.02, backpack);
  }
  const balloons = new T.Group();
  balloons.position.set(0, 1.12, 0.3);
  backpack.add(balloons);
  const hue = Math.random();
  [
    [-0.12, 0.06, 0.02, 0.35],
    [0.12, 0.06, 0.02, -0.35],
    [0, 0.07, 0.07, 0],
    [-0.06, 0.14, 0.03, 0.2],
    [0.06, 0.14, 0.04, -0.15],
    [-0.09, 0.05, 0.08, 0.25],
    [0.09, 0.05, 0.08, -0.25],
  ].forEach(([x, y, z, tilt], i) => {
    const rubber = new T.MeshStandardMaterial({
        color: new T.Color().setHSL((hue + i * 0.29) % 1, 0.9, 0.6),
        roughness: 0.25,
        metalness: 0.05,
      }),
      balloon = add(
        new T.Mesh(new T.SphereGeometry(0.09, 16, 12), rubber),
        x,
        y,
        z,
        balloons,
      );
    balloon.scale.set(1, 1.15, 1);
    balloon.rotation.z = tilt;
  });
  // Shoulder sockets sit inside the torso; elbows and wrists overlap.
  const arms = [-1, 1].map((side) => {
    const shoulder = new T.Group();
    shoulder.position.set(side * 0.255, 1.1, 0);
    pivot.add(shoulder);
    joint(0.095, body, 0, shoulder);
    segment(0.06, 0.2, shoulder);
    const elbow = new T.Group();
    elbow.position.y = -0.2;
    shoulder.add(elbow);
    joint(0.063, trim, 0, elbow);
    segment(0.055, 0.19, elbow);
    joint(0.085, body, -0.39 + 0.2, elbow);
    elbows.push(elbow);
    shoulder.rotation.z = side * 0.15;
    return shoulder;
  });
  // Head on a short neck: a big rounded box with a dark screen face.
  const head = new T.Group();
  head.position.y = 1.47;
  pivot.add(head);
  add(
    new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.16, 16), trim),
    0,
    1.225,
    0,
    pivot,
  );
  add(rounded(0.56, 0.42, 0.44, 0.16, body), 0, 0, 0, head);
  add(rounded(0.44, 0.3, 0.04, 0.08, screen), 0, 0, -0.215, head);
  // Ear bolts.
  for (const side of [-1, 1]) {
    const ear = add(
      new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.06, 16), trim),
      side * 0.29,
      0,
      0,
      head,
    );
    ear.rotation.z = Math.PI / 2;
  }
  // Eyes: glowing ovals that blink, and grow wide when splashed.
  const eyes = [-0.1, 0.1].map((x) => {
    const eye = add(
      new T.Mesh(new T.SphereGeometry(0.05, 14, 10), glow),
      x,
      0.03,
      -0.235,
      head,
    );
    eye.scale.set(0.85, 1.15, 0.4);
    eye.castShadow = false;
    return eye;
  });
  // A smile, and an "o" mouth for when it's splashed.
  const smile = add(
    new T.Mesh(new T.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), glow),
    0,
    -0.05,
    -0.237,
    head,
  );
  smile.rotation.z = Math.PI;
  const gasp = add(
    new T.Mesh(new T.TorusGeometry(0.03, 0.012, 6, 16), glow),
    0,
    -0.07,
    -0.237,
    head,
  );
  gasp.visible = false;
  for (const x of [-0.17, 0.17]) {
    const c = add(
      new T.Mesh(new T.CircleGeometry(0.03, 12), cheek),
      x,
      -0.04,
      -0.238,
      head,
    );
    c.rotation.y = Math.PI;
    c.castShadow = false;
  }
  // Antenna with a glowing bulb that bobs.
  const antenna = new T.Group();
  antenna.position.y = 0.21;
  head.add(antenna);
  add(
    new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 6), trim),
    0,
    0.08,
    0,
    antenna,
  );
  add(
    new T.Mesh(new T.SphereGeometry(0.045, 12, 10), glow),
    0,
    0.18,
    0,
    antenna,
  );
  root.userData.robot = {
    pivot,
    head,
    legs,
    arms,
    knees,
    elbows,
    eyes,
    smile,
    gasp,
    antenna,
    balloons,
    phase: 0,
    speed: 0,
    crouch: 0,
    prone: 0,
    startle: 0,
    blink: 2 + Math.random() * 3,
  };
  return root;
}

// startle: seconds left of being startled by a splash (eyes wide, "o" mouth,
// arms flailing).
export function animateRobot(root, data, dt) {
  const rig = root.userData.robot;
  if (!rig) return;
  dt = Math.min(dt, 0.1);
  const blend = 1 - Math.exp(-dt * 12);
  rig.crouch += ((data.crouch && !data.prone ? 1 : 0) - rig.crouch) * blend;
  rig.prone += ((data.prone ? 1 : 0) - rig.prone) * blend;
  rig.speed += ((data.moveSpeed || 0) - rig.speed) * blend;
  rig.startle = Math.max(0, rig.startle - dt);
  const moving = T.MathUtils.smoothstep(rig.speed, 0.05, 0.6),
    scared = rig.startle > 0 || data.fleeing ? 1 : 0;
  rig.phase += dt * (2 + rig.speed * 2.2);
  const swing = Math.sin(rig.phase) * 0.5 * moving;
  rig.legs[0].rotation.x = swing;
  rig.legs[1].rotation.x = -swing;
  rig.knees.forEach((knee, i) => {
    knee.rotation.x =
      -Math.max(0, Math.sin(rig.phase + i * Math.PI)) * 0.65 * moving;
  });
  rig.elbows.forEach((elbow, i) => {
    elbow.rotation.x =
      -0.12 - (0.12 + Math.sin(rig.phase + i * Math.PI) * 0.1) * moving;
  });
  rig.arms.forEach((arm, i) => {
    const side = i ? 1 : -1;
    if (scared) {
      // Arms up, waving.
      arm.rotation.x = 0;
      arm.rotation.z = side * (2.5 + Math.sin(rig.phase * 2.5 + i * 2) * 0.35);
    } else {
      arm.rotation.x = (i ? swing : -swing) * 0.8;
      arm.rotation.z = side * 0.15;
    }
  });
  // A happy bounce in its step; a little sway when standing.
  const bounce = (1 - Math.cos(rig.phase * 2)) * 0.015 * moving;
  rig.head.rotation.z = Math.sin(rig.phase * 0.5) * 0.06 * (1 - moving);
  rig.antenna.rotation.z = Math.sin(rig.phase * 1.3) * 0.25;
  // The balloons in the pack jostle as it walks.
  rig.balloons.rotation.z = Math.sin(rig.phase) * 0.08 * moving;
  rig.balloons.rotation.x = -Math.abs(Math.sin(rig.phase)) * 0.06 * moving;
  // Blink now and then; wide eyes when startled.
  rig.blink -= dt;
  if (rig.blink < -0.12) rig.blink = 2 + Math.random() * 3;
  const open = rig.blink < 0 ? 0.15 : 1;
  for (const eye of rig.eyes)
    eye.scale.set(0.85 + scared * 0.3, 1.15 * open + scared * 0.3, 0.4);
  rig.smile.visible = !scared;
  rig.gasp.visible = !!scared;
  rig.pivot.rotation.x = (-Math.PI / 2) * rig.prone;
  rig.pivot.position.y =
    bounce - 0.35 * rig.crouch * (1 - rig.prone) + 0.25 * rig.prone;
  rig.pivot.position.z = -0.6 * rig.prone;
  rig.pivot.scale.y = 1 - 0.1 * rig.crouch;
}
