// Builds ChibiCritters3D_v1.0/Models/GLB/Shark.glb from the Chibi Critters
// pack (see tools/critterKit.mjs).
//
//   node tools/make_shark.mjs
//
// Bear's head, body, arms and legs in shark blue with a white snout and
// belly, a happy open mouth with little teeth, gills, a dorsal fin on top
// of the head and a crescent tail fin.

import {
  Critter,
  HEAD,
  add,
  color,
  hexAt,
  loadCritter,
  onEllipsoid,
} from "./critterKit.mjs";

const BODY = color("#4fa8e8");
const DEEP = color("#2f6fb0"); // gills and feet
const BELLY = color("#f2f6f9");
const MOUTH = color("#8f1f2a");
const TOOTH = color("#ffffff");

const bear = loadCritter("Bear");
const shark = new Critter("Shark", bear);

const isNose = (v) =>
  hexAt(v.uv) === "#1f1a24" && Math.abs(v.p[0]) < 0.06 && v.p[2] > 0.3;

// Everything but the bear's ears, tail and nose.
shark.addPart(
  bear,
  (v) => !["ear_L", "ear_R", "tail"].includes(v.bone) && !isNose(v),
  { recolor: { "#9a5d32": BODY, "#f2c99a": BELLY, "#6a3b1f": DEEP } },
);

// Happy open mouth on the snout, with four little teeth.
const SNOUT = { centre: [0, 0.665, 0.24], radii: [0.12, 0.085, 0.1] };
const mouth = onEllipsoid(SNOUT, 0, 0.64);
shark.addEllipsoid(
  add(mouth.p, [0, 0, -0.004]),
  [0.07, 0.03, 0.012],
  MOUTH,
  "head",
  { basis: [mouth.across, mouth.up, mouth.n], seg: 16, rows: 8 },
);
for (const x of [-0.042, -0.014, 0.014, 0.042]) {
  const t = onEllipsoid(SNOUT, x, 0.657);
  shark.addEllipsoid(
    add(t.p, [0, 0, 0.004]),
    [0.011, 0.014, 0.006],
    TOOTH,
    "head",
    {
      basis: [t.across, t.up, t.n],
    },
  );
}

// Three gill lines on each cheek.
for (const side of [-1, 1])
  for (let i = 0; i < 3; i++) {
    const x = (0.24 + i * 0.03) * side;
    const line = [0.615, 0.645, 0.675].map((y) =>
      add(onEllipsoid(HEAD, x, y).p, [0, 0, -0.004]),
    );
    shark.addTube(line, () => 0.011, DEEP, [["head", 1]], {
      rings: 6,
      sides: 6,
    });
  }

// Dorsal fin on top of the head, thin side to side.
shark.addTube(
  [
    [0, 0.97, -0.08],
    [0, 1.12, -0.16],
    [0, 1.2, -0.3],
  ],
  (t) => 0.09 * (1 - t) + 0.012,
  BODY,
  [["head", 1]],
  { rings: 12, sides: 12, flatten: 0.3 },
);

// Tail: a short stub and a crescent fin.
shark.addTube(
  [
    [0, 0.3, -0.12],
    [0, 0.31, -0.24],
    [0, 0.32, -0.33],
  ],
  (t) => 0.085 - 0.035 * t,
  BODY,
  [["tail", 1]],
  { rings: 8, sides: 12, flatten: 0.7 },
);
for (const [mid, tip, root] of [
  [[0, 0.42, -0.42], [0, 0.56, -0.5], 0.06],
  [[0, 0.24, -0.4], [0, 0.16, -0.45], 0.05],
])
  shark.addTube(
    [[0, 0.32, -0.32], mid, tip],
    (t) => root * (1 - t) + 0.01,
    BODY,
    [["tail", 1]],
    { rings: 10, sides: 12, flatten: 0.35 },
  );

shark.write();
