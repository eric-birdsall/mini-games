import * as T from "three";
import { createRobot } from "./robot.js";
import { COLORS } from "../shared/avatars.js";

// Keep the shared movement rig, with purpose-built heads and costume pieces.
export function createGuest(team, selected) {
  const root = createRobot(team, false);
  const rig = root.userData.robot;
  const color = COLORS[selected.color];
  root.traverse((node) => {
    if (
      node.isMesh &&
      ["ffb347", "5cc8ff"].includes(node.material.color?.getHexString())
    )
      node.material.color.set(color);
  });
  const head = rig.head;
  const keep = new Set([...rig.eyes, rig.smile, rig.gasp]);
  for (const child of [...head.children]) {
    if (keep.has(child)) continue;
    head.remove(child);
    child.traverse((n) => {
      n.geometry?.dispose();
    });
  }
  const mat = (c, metalness = 0) =>
    new T.MeshStandardMaterial({ color: c, roughness: 0.65, metalness });
  const suit = mat(color),
    cream = mat("#fff0d4"),
    dark = mat("#273244"),
    pink = mat("#ef9ba9");
  function shape(
    geometry,
    material,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    parent = head,
  ) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const ball = (m, x, y, z, sx, sy, sz) =>
    shape(new T.SphereGeometry(1, 20, 14), m, x, y, z, sx, sy, sz);
  const cylinder = (m, top, bottom, h, y) =>
    shape(new T.CylinderGeometry(top, bottom, h, 24), m, 0, y, 0);
  const kind = selected.character;
  ball(
    kind === "cat" || kind === "dog" ? suit : cream,
    0,
    0,
    0,
    0.29,
    0.25,
    0.24,
  );
  for (const eye of rig.eyes) {
    eye.material = dark;
    eye.position.z = -0.239;
  }
  rig.smile.material = dark;
  rig.gasp.material = dark;
  if (kind === "astronaut") {
    ball(suit, 0, 0, 0.03, 0.35, 0.32, 0.29);
    ball(mat("#233c59", 0.4), 0, 0, -0.2, 0.29, 0.24, 0.09);
    for (const eye of rig.eyes) eye.material = mat("#bffaff");
    rig.smile.material = mat("#bffaff");
    for (const x of [-0.34, 0.34]) ball(cream, x, 0, 0, 0.065, 0.12, 0.12);
    cylinder(cream, 0.32, 0.32, 0.07, -0.25);
  }
  if (kind === "cat" || kind === "dog") {
    for (const side of [-1, 1]) {
      if (kind === "cat") {
        const ear = shape(
          new T.ConeGeometry(0.13, 0.26, 3),
          suit,
          side * 0.2,
          0.25,
          0,
        );
        ear.rotation.y = Math.PI;
        ball(pink, side * 0.2, 0.25, -0.065, 0.05, 0.075, 0.025);
      } else ball(dark, side * 0.28, -0.03, 0.01, 0.1, 0.25, 0.1);
      ball(cream, side * 0.065, -0.09, -0.23, 0.09, 0.065, 0.045);
    }
    ball(dark, 0, -0.055, -0.29, 0.045, 0.03, 0.025);
    const tail = shape(
      new T.TorusGeometry(0.18, 0.055, 8, 18, Math.PI * 1.4),
      suit,
      0,
      0.65,
      0.32,
      1,
      1,
      1,
      rig.pivot,
    );
    tail.rotation.y = Math.PI / 2;
  }
  if (kind === "magician") {
    cylinder(dark, 0.37, 0.37, 0.045, 0.25);
    cylinder(dark, 0.23, 0.25, 0.35, 0.43);
    cylinder(suit, 0.245, 0.25, 0.07, 0.31);
    for (const side of [-1, 1])
      shape(
        new T.ConeGeometry(0.085, 0.13, 3),
        suit,
        side * 0.065,
        -0.31,
        -0.2,
      ).rotation.z = (side * Math.PI) / 2;
    const cape = shape(
      new T.ConeGeometry(0.38, 0.7, 24, 1, true, 0, Math.PI),
      suit,
      0,
      0.86,
      0.16,
      1,
      1,
      1,
      rig.pivot,
    );
    cape.rotation.y = -Math.PI / 2;
  }
  if (kind === "chef") {
    cylinder(cream, 0.27, 0.27, 0.16, 0.25);
    for (const x of [-0.17, 0, 0.17]) ball(cream, x, 0.4, 0, 0.15, 0.16, 0.17);
  }
  if (kind === "farmer") {
    const straw = mat("#e8c16e");
    cylinder(straw, 0.4, 0.4, 0.045, 0.23);
    cylinder(straw, 0.21, 0.26, 0.2, 0.34);
    cylinder(suit, 0.26, 0.27, 0.045, 0.26);
  }
  if (kind === "chef" || kind === "farmer") {
    shape(
      new T.BoxGeometry(0.34, 0.38, 0.025),
      kind === "chef" ? cream : mat("#405d8c"),
      0,
      0.91,
      -0.205,
      1,
      1,
      1,
      rig.pivot,
    );
    for (const x of [-0.11, 0.11])
      shape(
        new T.BoxGeometry(0.045, 0.23, 0.03),
        cream,
        x,
        1.13,
        -0.205,
        1,
        1,
        1,
        rig.pivot,
      );
  }
  return root;
}
