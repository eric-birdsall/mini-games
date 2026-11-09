// Builds ChibiCritters3D_v1.0/Models/GLB/Baby.glb from the Chibi Critters
// pack (see tools/critterKit.mjs).
//
//   node tools/make_baby.mjs
//
// Bear's round head (no muzzle or bear ears) with the pack's eyes and blush,
// a button nose, small smile, side ears and a hair curl; bare skin all
// over except a puffy white diaper with two blue tabs.

import {
  Critter,
  HEAD,
  add,
  color,
  hexAt,
  loadCritter,
  onEllipsoid,
} from "./critterKit.mjs";

const SKIN = color("#f2c99a"); // same warm tone as the Astronaut's face
const DIAPER = color("#ffffff");
const TAB = color("#8fb4ff");
const HAIR = color("#6a3b1f");
const INK = color("#1f1a24");

const bear = loadCritter("Bear");
const baby = new Critter("Baby", bear);

const isNose = (v) =>
  hexAt(v.uv) === "#1f1a24" && Math.abs(v.p[0]) < 0.06 && v.p[2] > 0.3;

// Body, arms and legs: all bare skin.
baby.addPart(
  bear,
  (v) => ["root", "hips", "arm_L", "arm_R", "leg_L", "leg_R"].includes(v.bone),
  {
    transform(v) {
      v.uv = SKIN;
      return v;
    },
  },
);

// Diaper: a puffy shell round the bottom half of the body. Its top edge is
// where it meets the body (about the waist); the legs come out underneath.
baby.addEllipsoid([0, 0.25, 0.012], [0.218, 0.118, 0.212], DIAPER, "hips", {
  seg: 28,
  rows: 16,
});
// Two tabs on the front of the waistband.
for (const side of [-1, 1])
  baby.addEllipsoid(
    [0.12 * side, 0.3, 0.17],
    [0.04, 0.026, 0.014],
    TAB,
    "hips",
    {
      basis: [
        [Math.cos(0.6) , 0, -Math.sin(0.6) * side],
        [0, 1, 0],
        [Math.sin(0.6) * side, 0, Math.cos(0.6)],
      ],
      seg: 12,
      rows: 8,
    },
  );

// Head: skin, keeping the eyes, highlights and blush.
baby.addPart(
  bear,
  (v) => v.bone === "head" && hexAt(v.uv) !== "#f2c99a" && !isNose(v),
  {
    transform(v) {
      if (hexAt(v.uv) === "#9a5d32") v.uv = SKIN;
      return v;
    },
  },
);
// Button nose.
const nose = onEllipsoid(HEAD, 0, 0.68);
baby.addEllipsoid(
  add(nose.p, [0, 0, -0.006]),
  [0.03, 0.022, 0.018],
  SKIN,
  "head",
  {
    seg: 12,
    rows: 8,
  },
);

// Small smile.
const smile = [-0.04, -0.015, 0.015, 0.04].map((x) => {
  const y = 0.622 - (Math.abs(x) < 0.03 ? 0.018 : 0);
  return add(onEllipsoid(HEAD, x, y).p, [0, 0, -0.002]);
});
baby.addTube(smile, () => 0.008, INK, [["head", 1]], { rings: 10, sides: 6 });

// Ears on the sides of the head.
for (const side of [-1, 1])
  baby.addEllipsoid(
    [0.322 * side, 0.71, -0.01],
    [0.04, 0.068, 0.052],
    SKIN,
    "head",
    {
      seg: 12,
      rows: 8,
    },
  );

// A single curl of hair on top.
baby.addTube(
  [
    [-0.01, 0.98, 0.12],
    [-0.03, 1.13, 0.15],
    [0.1, 1.14, 0.13],
    [0.07, 1.05, 0.15],
  ],
  (t) => 0.028 - 0.014 * t,
  HAIR,
  [["head", 1]],
  { rings: 14, sides: 10 },
);

baby.write();
