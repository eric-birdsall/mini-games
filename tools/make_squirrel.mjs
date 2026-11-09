// Builds ChibiCritters3D_v1.0/Models/GLB/Squirrel.glb from the Chibi
// Critters pack (see tools/critterKit.mjs).
//
//   node tools/make_squirrel.mjs
//
// Parts: Bear's head, face, body, arms and legs (recoloured), Fox's pointy
// ears (with dark tufts), two buck teeth and a new bushy tail that curls up
// behind the head.

import { Critter, color, loadCritter, smooth } from "./critterKit.mjs";

const BODY = color("#c97f1c"); // amber fur (no other critter uses it)
const CREAM = color("#f7e8cd"); // belly, muzzle, inner ears
const DARK = color("#7a4a26"); // feet and ear tufts
const WHITE = color("#ffffff"); // teeth
const recolor = {
  "#9a5d32": BODY, // bear fur
  "#f2c99a": CREAM, // bear muzzle and belly
  "#6a3b1f": DARK, // bear feet
  "#f08a3c": BODY, // fox ear
  "#f7e8cd": CREAM, // fox inner ear
  "#472512": DARK, // fox ear tip -> tuft
};

const bear = loadCritter("Bear");
const fox = loadCritter("Fox");
const squirrel = new Critter("Squirrel", bear);

// Head, face, body, arms and legs from the bear.
squirrel.addPart(bear, (v) => !["ear_L", "ear_R", "tail"].includes(v.bone), {
  recolor,
});

// Fox ears, a little smaller; their dark tips read as squirrel ear tufts.
squirrel.addPart(fox, (v) => v.bone === "ear_L" || v.bone === "ear_R", {
  recolor,
  transform(v) {
    const base = [0.2 * Math.sign(v.p[0]), 0.94, -0.01];
    v.p = v.p.map((x, i) => base[i] + (x - base[i]) * 0.82);
    return v;
  },
});

// Bushy tail: a fat tube swept along an S-curve from the rump up behind the
// head and leaning out past one cheek, curling forward at the top. Its base
// rides the tail bone and the top mostly the hips, so wags bend it instead
// of swinging it into the head.
squirrel.addTube(
  [
    [0, 0.25, -0.16],
    [0, 0.2, -0.5],
    [0.08, 0.5, -0.74],
    [0.3, 0.9, -0.62],
    [0.34, 1.1, -0.4],
    [0.26, 1.02, -0.22],
  ],
  (t) =>
    0.055 +
    0.17 * Math.sin(Math.min(1, t * 1.45) * Math.PI * 0.5) ** 1.3 -
    0.06 * Math.max(0, (t - 0.75) / 0.25) ** 2,
  BODY,
  (t) => {
    const hipShare = 0.75 * smooth(Math.min(1, t / 0.55));
    return [
      ["tail", 1 - hipShare],
      ["hips", hipShare],
    ];
  },
  { flatten: 0.85 },
);

// Two little buck teeth just under the nose.
const ink = color("#1f1a24"); // eyes and nose
const face = squirrel.verts.filter((v) => v.bone === "head");
const nose = face.filter(
  (v) =>
    v.uv[0] === ink[0] &&
    v.uv[1] === ink[1] &&
    Math.abs(v.p[0]) < 0.05 &&
    v.p[2] > 0.3,
);
const noseBottom = Math.min(...nose.map((v) => v.p[1]));
const muzzle = face.filter(
  (v) =>
    v.uv === CREAM &&
    Math.abs(v.p[0]) < 0.03 &&
    Math.abs(v.p[1] - (noseBottom - 0.035)) < 0.02,
);
const front = Math.max(...muzzle.map((v) => v.p[2]));
for (const side of [-1, 1])
  squirrel.addEllipsoid(
    [0.019 * side, noseBottom - 0.037, front - 0.006],
    [0.017, 0.024, 0.008],
    WHITE,
    "head",
  );

squirrel.write();
