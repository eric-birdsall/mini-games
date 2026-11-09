// Builds ChibiCritters3D_v1.0/Models/GLB/Dog.glb from the Chibi Critters
// pack (see tools/critterKit.mjs).
//
//   node tools/make_dog.mjs
//
// Collectible-vinyl-figure proportions: a big rounded-square head on the
// pack's small body, with wide-set glossy black eyes, a white muzzle and
// nose, floppy brown ears, a patch over one eye, rosy cheeks, a red collar
// with a gold tag and a little tail.

import {
  Critter,
  add,
  color,
  onRoundedBox,
  scale,
} from "./critterKit.mjs";

import { loadPopSource, writePop } from "./popKit.mjs";

const FUR = color("#efe6cf");
const BROWN = color("#b37845");
const WHITE = color("#ffffff");
const INK = color("#1f1a24");
const BLUSH = color("#ff9aa8");
const COLLAR = color("#d63c3c");
const TAG = color("#ffd84a");

const bear = loadPopSource("Bear", FUR, WHITE);
const dog = new Critter("Dog", bear);

// The pack's small body, arms and legs: cream fur, white belly, brown socks.
dog.addPart(
  bear,
  (v) => ["root", "hips", "arm_L", "arm_R", "leg_L", "leg_R"].includes(v.bone),
  { recolor: { "#9a5d32": FUR, "#f2c99a": WHITE, "#6a3b1f": BROWN } },
);

// Big rounded-square head, pivoting where it sits on the body.
const HEAD = { centre: [0, 0.88, 0.02], half: [0.44, 0.35, 0.34], round: 0.55 };
dog.addRoundedBox(HEAD, FUR, "head");
const face = (x, y) => onRoundedBox(HEAD, x, y);

// Lay a flattened ellipsoid on the face at (x, y).
function decal(x, y, radii, uv, lift = 0, offset = [0, 0]) {
  const f = face(x, y);
  const centre = add(
    add(f.p, scale(f.n, lift)),
    add(scale(f.across, offset[0]), scale(f.up, offset[1])),
  );
  dog.addEllipsoid(centre, radii, uv, "head", {
    basis: [f.across, f.up, f.n],
    seg: 16,
    rows: 10,
  });
}

// Brown patch around one eye, then the eyes with a shine each.
decal(0.19, 0.85, [0.125, 0.13, 0.012], BROWN, -0.003);
for (const side of [-1, 1]) {
  const x = 0.19 * side;
  decal(x, 0.84, [0.07, 0.082, 0.03], INK, -0.012);
  decal(x, 0.84, [0.02, 0.022, 0.008], WHITE, 0.017, [-0.025, 0.032]);
  decal(0.31 * side, 0.73, [0.045, 0.026, 0.01], BLUSH, -0.003);
}

// Muzzle and nose.
decal(0, 0.72, [0.15, 0.09, 0.07], WHITE, -0.02);
const noseAt = face(0, 0.765);
dog.addEllipsoid(
  add(noseAt.p, [0, 0, 0.05]),
  [0.052, 0.034, 0.03],
  INK,
  "head",
  { seg: 14, rows: 8 },
);

// Floppy ears hanging down the sides, flaring out at the bottom.
for (const side of [-1, 1]) {
  const long = [-0.29 * side, 0.957, 0];
  const thin = [0.957, 0.29 * side, 0];
  dog.addEllipsoid(
    [0.47 * side, 0.83, -0.02],
    [0.045, 0.22, 0.13],
    BROWN,
    "head",
    { basis: [thin, long, [0, 0, 1]], seg: 16, rows: 12 },
  );
}

// Red collar around the top of the body, with a gold tag in front.
const COLLAR_Y = 0.485;
const neck = dog.verts.filter(
  (v) => v.bone === "hips" && Math.abs(v.p[1] - COLLAR_Y) < 0.025,
);
const rx = Math.max(...neck.map((v) => Math.abs(v.p[0])));
const zFront = Math.max(...neck.map((v) => v.p[2]));
const zBack = Math.min(...neck.map((v) => v.p[2]));
const zMid = (zFront + zBack) / 2;
const rz = (zFront - zBack) / 2;
const collar = [];
for (let i = 0; i < 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  collar.push([rx * Math.cos(a), COLLAR_Y, zMid + rz * Math.sin(a)]);
}
dog.addLoop(collar, 0.032, COLLAR, "hips", [0, 1, 0]);
dog.addEllipsoid(
  [0, COLLAR_Y - 0.045, zFront + 0.02],
  [0.035, 0.035, 0.012],
  TAG,
  "hips",
  {
    seg: 12,
    rows: 8,
  },
);

// Little tail, curving up, with a brown tip.
const tailTip = [0, 0.5, -0.3];
dog.addTube(
  [[0, 0.28, -0.15], [0, 0.32, -0.3], tailTip],
  (t) => 0.04 - 0.012 * t,
  FUR,
  [["tail", 1]],
  { rings: 10, sides: 10 },
);
dog.addEllipsoid(tailTip, [0.034, 0.045, 0.034], BROWN, "tail");

await writePop(dog);
