// Geometry and motion for the public Pop roster. The face recipes are shared
// with the local roster, but this rig never reads from the Chibi Critters pack.
import fs from "node:fs/promises";
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const joints = {
  root: [0, 0, 0],
  hips: [0, 0.31, 0],
  head: [0, 0.55, 0],
  arm_L: [0.2, 0.44, 0],
  arm_R: [-0.2, 0.44, 0],
  leg_L: [0.115, 0.22, 0],
  leg_R: [-0.115, 0.22, 0],
  tail: [0, 0.3, -0.17],
};

const earShapes = {
  Axolotl: [0.11, 0.09, 0.06],
  Bunny: [0.065, 0.18, 0.06],
  Capybara: [0.055, 0.055, 0.045],
  Cat: [0.08, 0.1, 0.06],
  Dragon: [0.06, 0.12, 0.055],
  Fox: [0.085, 0.115, 0.065],
  Owl: [0.075, 0.09, 0.06],
  Pig: [0.08, 0.085, 0.055],
  Shiba: [0.085, 0.105, 0.06],
};

const tails = {
  Cat: [0.08, 0.16, 0.075],
  Dragon: [0.085, 0.1, 0.2],
  Fox: [0.13, 0.17, 0.15],
  Raccoon: [0.105, 0.11, 0.18],
  RedPanda: [0.12, 0.13, 0.16],
  Shiba: [0.1, 0.12, 0.1],
  Squirrel: [0.13, 0.24, 0.15],
  Shark: [0.15, 0.1, 0.16],
};

export function buildPopBody(body, name, fur, accent) {
  body.addEllipsoid([0, 0.33, 0], [0.225, 0.25, 0.175], fur, "hips");
  body.addEllipsoid([0, 0.34, 0.12], [0.14, 0.16, 0.065], accent, "hips");
  for (const side of ["L", "R"]) {
    const sign = side === "L" ? 1 : -1;
    body.addEllipsoid(
      [0.245 * sign, 0.315, 0],
      [0.085, 0.15, 0.085],
      fur,
      `arm_${side}`,
    );
    body.addEllipsoid(
      [0.115 * sign, 0.12, 0.025],
      [0.092, 0.12, 0.115],
      fur,
      `leg_${side}`,
    );
    const ear = earShapes[name] ?? [0.075, 0.075, 0.055];
    const earCenter = [0.3 * sign, name === "Axolotl" ? 0.78 : 0.8, 0];
    body.addEllipsoid(earCenter, ear, fur, `ear_${side}`);
    body.addEllipsoid(
      [earCenter[0], earCenter[1], 0.04],
      [ear[0] * 0.65, ear[1] * 0.65, 0.026],
      accent,
      `ear_${side}`,
    );
  }
  if (tails[name]) {
    body.addEllipsoid([0, 0.36, -0.26], tails[name], fur, "tail");
  }
  return body;
}

function rotationTrack(bone, axis, angles, duration) {
  const direction = new T.Vector3(...axis);
  return new T.QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    angles.map((_, i) => (duration * i) / (angles.length - 1)),
    angles.flatMap((angle) =>
      new T.Quaternion().setFromAxisAngle(direction, angle).toArray(),
    ),
  );
}

function popAnimations() {
  const x = [1, 0, 0],
    z = [0, 0, 1];
  const clip = (name, duration, poses) =>
    new T.AnimationClip(
      name,
      duration,
      poses.map(([bone, axis, angles]) =>
        rotationTrack(bone, axis, angles, duration),
      ),
    );
  const gait = (name, duration, swing) => {
    const stride = [0, swing, 0, -swing, 0];
    const opposite = stride.map((angle) => -angle);
    return clip(name, duration, [
      ["leg_L", x, stride],
      ["leg_R", x, opposite],
      ["arm_L", x, opposite],
      ["arm_R", x, stride],
      ["head", z, [0, 0.04, 0, -0.04, 0]],
    ]);
  };
  return [
    clip("Idle", 1.8, [["head", z, [0, 0.035, 0, -0.035, 0]]]),
    gait("Walk", 0.8, 0.38),
    gait("Run", 0.48, 0.64),
    clip("Jump", 0.45, [
      ["arm_L", x, [0, -0.9, 0]],
      ["arm_R", x, [0, -0.9, 0]],
    ]),
    clip("Wave", 1, [["arm_L", z, [0, 2.1, 1.8, 2.1, 0]]]),
    clip("Hit", 0.35, [["hips", x, [0, -0.25, 0]]]),
    clip("Death", 0.65, [["head", z, [0, -0.22, -0.32]]]),
  ];
}

export async function writePublicPop(figure, outputDir, hexAt) {
  const geometry = new T.BufferGeometry();
  const boneNames = Object.keys(joints);
  const { verts, tris } = figure;
  geometry.setIndex(tris.flat());
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      verts.flatMap((v) => v.p),
      3,
    ),
  );
  geometry.setAttribute(
    "normal",
    new T.Float32BufferAttribute(
      verts.flatMap((v) => v.n),
      3,
    ),
  );
  geometry.setAttribute(
    "color",
    new T.Float32BufferAttribute(
      verts.flatMap((v) => new T.Color(hexAt(v.uv)).toArray()),
      3,
    ),
  );
  geometry.setAttribute(
    "skinIndex",
    new T.Uint16BufferAttribute(
      verts.flatMap((v) =>
        [0, 1, 2, 3].map((i) =>
          Math.max(0, boneNames.indexOf(v.weights[i]?.[0])),
        ),
      ),
      4,
    ),
  );
  geometry.setAttribute(
    "skinWeight",
    new T.Float32BufferAttribute(
      verts.flatMap((v) => [0, 1, 2, 3].map((i) => v.weights[i]?.[1] ?? 0)),
      4,
    ),
  );

  geometry.normalizeNormals();

  const mesh = new T.SkinnedMesh(
    geometry,
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }),
  );
  const bones = boneNames.map((name) => {
    const bone = new T.Bone();
    bone.name = name;
    bone.position.set(...joints[name]);
    return bone;
  });
  mesh.add(bones[0]);
  for (const bone of bones.slice(1)) {
    const parent = bone.name === "hips" ? bones[0] : bones[1];
    bone.position.sub(new T.Vector3(...joints[parent.name]));
    parent.add(bone);
  }
  mesh.bind(new T.Skeleton(bones));

  // GLTFExporter uses FileReader to convert the output Blob into a GLB.
  globalThis.FileReader ??= class {
    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend();
    }
  };
  const glb = await new GLTFExporter().parseAsync(mesh, {
    binary: true,
    animations: popAnimations(),
  });
  const id = figure.name
    .replace(/^Pop/, "")
    .replace("RedPanda", "Red-Panda")
    .toLowerCase();
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(new URL(`${id}.glb`, outputDir), Buffer.from(glb));
}
