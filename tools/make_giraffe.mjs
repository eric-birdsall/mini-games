// Builds ChibiCritters3D_v1.0/Models/GLB/Giraffe.glb from the Chibi
// Critters pack (see tools/critterKit.mjs).
//
//   node tools/make_giraffe.mjs
//
// Parts: Bear's head, face, body, arms and legs (recoloured), lifted on a
// short chibi neck, plus ossicones, leaf-shaped ears, a mane, patchy spots
// and a thin tail with a tuft. The neck, head, ears and horns all ride the
// head bone, so nods pivot from the shoulders.

import {
  Critter,
  add,
  color,
  dot,
  hexAt,
  loadCritter,
  normalize,
  scale,
  sub,
} from "./critterKit.mjs";

const COAT = color("#f4b83a"); // golden coat
const SPOT = color("#b0703f"); // chestnut patches
const PALE = color("#ffe08a"); // muzzle and belly
const HOOF = color("#6a3b1f"); // feet, horn knobs, tail tuft
const INNER = color("#ffc9de"); // inner ears
const recolor = {
  "#9a5d32": COAT, // bear fur
  "#f2c99a": PALE, // bear muzzle and belly
  "#6a3b1f": HOOF, // bear feet
};

const NECK = 0.22; // how far the head is lifted
const HEAD = [0, 0.74 + NECK, 0.02]; // centre of the lifted head

const bear = loadCritter("Bear");
const giraffe = new Critter("Giraffe", bear);

// Body, arms and legs as they are.
giraffe.addPart(
  bear,
  (v) => ["root", "hips", "arm_L", "arm_R", "leg_L", "leg_R"].includes(v.bone),
  { recolor },
);

// Head and face, lifted onto the neck, with a slightly longer muzzle (the
// nose moves with it).
const muzzleCentre = [0, 0.665, 0.25];
giraffe.addPart(bear, (v) => v.bone === "head", {
  recolor,
  transform(v) {
    const nose =
      hexAt(v.uv) === "#1f1a24" && Math.abs(v.p[0]) < 0.06 && v.p[2] > 0.3;
    if (hexAt(v.uv) === "#f2c99a" || nose) {
      const d = sub(v.p, muzzleCentre);
      v.p = add(muzzleCentre, [d[0] * 1.12, d[1] * 1.1, d[2] * 1.25]);
    }
    v.p = add(v.p, [0, NECK, 0.02]);
    return v;
  },
});

// Neck: a soft tapered column from the shoulders into the head.
const neckSpine = [
  [0, 0.4, 0],
  [0, 0.56, 0.0],
  [0, 0.72, 0.01],
  [0, HEAD[1] - 0.12, 0.02],
];
giraffe.addTube(neckSpine, (t) => 0.125 - 0.025 * t, COAT, [["head", 1]], {
  rings: 8,
  sides: 16,
});
// Short mane down the back of the neck.
giraffe.addTube(
  [
    [0, HEAD[1] - 0.12, -0.22],
    [0, HEAD[1] - 0.24, -0.15],
    [0, 0.52, -0.13],
  ],
  (t) => 0.045 - 0.012 * t,
  SPOT,
  [["head", 1]],
  { rings: 10, sides: 10, flatten: 0.6 },
);

// Ossicones: two little horns with dark knobs.
for (const side of [-1, 1]) {
  const base = add(HEAD, [0.1 * side, 0.26, -0.04]);
  const top = add(base, [0.035 * side, 0.15, -0.01]);
  giraffe.addTube(
    [base, add(base, [0.01 * side, 0.08, 0]), top],
    () => 0.032,
    COAT,
    [["head", 1]],
    { rings: 6, sides: 10 },
  );
  giraffe.addEllipsoid(top, [0.048, 0.042, 0.048], HOOF, "head", {
    seg: 10,
    rows: 8,
  });
}

// Leaf-shaped ears sticking out sideways, pink inside.
for (const side of [-1, 1]) {
  const along = normalize([side, 0.25, -0.1]);
  const facing = normalize([0.25 * side, 0.1, 1]);
  const up = [0, 1, 0];
  const width = normalize(sub(up, scale(along, dot(up, along))));
  const thin = [
    along[1] * width[2] - along[2] * width[1],
    along[2] * width[0] - along[0] * width[2],
    along[0] * width[1] - along[1] * width[0],
  ];
  const root = add(HEAD, [0.27 * side, 0.12, -0.04]);
  const centre = add(root, scale(along, 0.1));
  giraffe.addEllipsoid(centre, [0.12, 0.062, 0.026], COAT, "head", {
    basis: [along, width, thin],
    seg: 12,
    rows: 8,
  });
  giraffe.addEllipsoid(
    add(add(centre, scale(along, 0.012)), scale(facing, 0.016)),
    [0.085, 0.04, 0.014],
    INNER,
    "head",
    { basis: [along, width, thin], seg: 12, rows: 8 },
  );
}

// Thin tail with a dark tuft.
const tailEnd = [0, 0.13, -0.33];
giraffe.addTube(
  [[0, 0.3, -0.16], [0, 0.3, -0.3], tailEnd],
  () => 0.022,
  COAT,
  [["tail", 1]],
  { rings: 8, sides: 8 },
);
giraffe.addEllipsoid(
  add(tailEnd, [0, -0.03, -0.01]),
  [0.04, 0.06, 0.04],
  HOOF,
  "tail",
);

// Spots: flat chestnut patches laid on the coat, facing out from a centre.
function spot(bones, centre, direction, size) {
  const d = normalize(direction);
  let best = null;
  let bestScore = -Infinity;
  for (const v of giraffe.verts) {
    if (v.uv !== COAT || !bones.includes(v.bone)) continue;
    const score = dot(normalize(sub(v.p, centre)), d);
    if (score > bestScore) ((best = v), (bestScore = score));
  }
  const n = normalize(best.n);
  const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(sub(helper, scale(n, dot(helper, n))));
  const w = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  giraffe.addEllipsoid(
    add(best.p, scale(n, -0.003)),
    [size, size * 0.8, 0.016],
    SPOT,
    best.weights,
    { basis: [u, w, n], seg: 10, rows: 6 },
  );
}

const headOnly = ["head"];
for (const side of [-1, 1]) {
  // Head (avoiding the face).
  spot(headOnly, HEAD, [0.75 * side, 0.45, -0.5], 0.06);
  spot(headOnly, HEAD, [0.95 * side, -0.05, -0.3], 0.05);
  // Neck.
  spot(headOnly, [0, 0.62, 0.01], [side, 0.1, -0.15], 0.045);
  // Body.
  spot(["hips"], [0, 0.36, 0], [0.9 * side, 0.35, -0.3], 0.06);
  spot(["hips"], [0, 0.36, 0], [0.75 * side, -0.25, -0.55], 0.055);
  spot(["hips"], [0, 0.36, 0], [0.98 * side, -0.1, 0.15], 0.045);
  // Arms and legs, on the outside.
  spot(
    [side > 0 ? "arm_L" : "arm_R"],
    [0.235 * side, 0.35, 0],
    [side, 0, 0],
    0.035,
  );
  spot(
    [side > 0 ? "leg_L" : "leg_R"],
    [0.11 * side, 0.15, 0],
    [side, 0.2, 0],
    0.035,
  );
}
spot(headOnly, HEAD, [0, 0.55, -0.85], 0.06);
// A few that show from the front.
for (const side of [-1, 1]) {
  spot(["hips"], [0, 0.36, 0], [0.85 * side, 0.45, 0.45], 0.045);
  spot(headOnly, [0, 0.62, 0.01], [0.7 * side, -0.2, 0.7], 0.035);
  spot(headOnly, HEAD, [0.55 * side, 0.8, 0.25], 0.045);
}
spot(["hips"], [0, 0.36, 0], [0, 0.2, -1], 0.065);

giraffe.write();
