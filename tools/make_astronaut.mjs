// Builds ChibiCritters3D_v1.0/Models/GLB/Astronaut.glb from the Chibi
// Critters pack (see tools/critterKit.mjs).
//
//   node tools/make_astronaut.mjs
//
// Bear's body, arms and legs in a white spacesuit with grey boots, a round
// helmet with an open face window (the pack's eyes and blush inside), a
// rim, ear pods, an antenna, a chest panel with buttons and a backpack.

import {
  Critter,
  add,
  color,
  cross,
  hexAt,
  loadCritter,
  normalize,
} from "./critterKit.mjs";

const SUIT = color("#f4f2f8");
const TRIM = color("#c9d1d9"); // helmet rim, backpack, belly panel
const PANEL = color("#9aa0a8");
const BOOT = color("#5c636b");
const FACE = color("#f2c99a");
const BLUE = color("#3f7fe0");
const RED = color("#d63c3c");
const YELLOW = color("#ffd84a");

// The bear's head is close to an ellipsoid around this centre.
const HEAD = [0, 0.74, 0];
const HEAD_R = [0.33, 0.3, 0.3];
const helmetZ = (x, y) =>
  HEAD_R[2] *
  Math.sqrt(
    Math.max(0, 1 - (x / HEAD_R[0]) ** 2 - ((y - HEAD[1]) / HEAD_R[1]) ** 2),
  );

const bear = loadCritter("Bear");
const astronaut = new Critter("Astronaut", bear);

const isNose = (v) =>
  hexAt(v.uv) === "#1f1a24" && Math.abs(v.p[0]) < 0.06 && v.p[2] > 0.3;

// Suit: body, arms and legs; the belly patch becomes a pale panel.
astronaut.addPart(
  bear,
  (v) => ["root", "hips", "arm_L", "arm_R", "leg_L", "leg_R"].includes(v.bone),
  { recolor: { "#9a5d32": SUIT, "#f2c99a": TRIM, "#6a3b1f": BOOT } },
);

// Helmet: the head sphere in white with a hole cut for the face window,
// and the eyes moved forward onto the face. The bear's muzzle, nose and
// blush are left out.
const WINDOW = { x: 0.225, y: 0.175, cy: 0.72 };
const inWindow = (p, margin = 0.9) =>
  p[2] > 0 &&
  (p[0] / (WINDOW.x * margin)) ** 2 +
    ((p[1] - WINDOW.cy) / (WINDOW.y * margin)) ** 2 <
    1;
const shell = {
  ...bear,
  tris: bear.tris.filter((tri) => {
    if (bear.verts[tri[0]].bone !== "head") return true;
    if (hexAt(bear.verts[tri[0]].uv) !== "#9a5d32") return true;
    const c = [0, 1, 2].map(
      (k) => tri.reduce((sum, i) => sum + bear.verts[i].p[k], 0) / 3,
    );
    return !inWindow(c);
  }),
};
astronaut.addPart(
  shell,
  (v) =>
    v.bone === "head" &&
    !["#f2c99a", "#ff9aa8"].includes(hexAt(v.uv)) &&
    !isNose(v),
  {
    recolor: { "#9a5d32": SUIT },
    transform(v) {
      const hex = hexAt(v.uv);
      if (hex === "#1f1a24" || hex === "#ffffff") v.p[2] += 0.045;
      return v;
    },
  },
);

// Face in the window.
const FACE_C = [0, WINDOW.cy, 0.15];
const FACE_R = [0.24, 0.185, 0.2];
astronaut.addEllipsoid(FACE_C, FACE_R, FACE, "head", { seg: 28, rows: 18 });

// A point on the face and the directions along and out of it.
function onFace(x, y) {
  const u = x / FACE_R[0];
  const w = (y - FACE_C[1]) / FACE_R[1];
  const z = FACE_C[2] + FACE_R[2] * Math.sqrt(Math.max(0, 1 - u * u - w * w));
  const n = normalize([
    x / FACE_R[0] ** 2,
    (y - FACE_C[1]) / FACE_R[1] ** 2,
    (z - FACE_C[2]) / FACE_R[2] ** 2,
  ]);
  const across = normalize(cross([0, 1, 0], n));
  return { p: [x, y, z], n, across, up: cross(n, across) };
}

// Rosy cheeks.
for (const side of [-1, 1]) {
  const f = onFace(0.15 * side, 0.655);
  astronaut.addEllipsoid(f.p, [0.036, 0.022, 0.01], color("#ff9aa8"), "head", {
    basis: [f.across, f.up, f.n],
    seg: 12,
    rows: 6,
  });
}

// A small smile.
const smile = [-0.035, -0.012, 0.012, 0.035].map((x) => {
  const f = onFace(x, 0.632 - 120 * (0.035 ** 2 - x * x) * 0.2);
  return add(f.p, [0, 0, 0.002]);
});
astronaut.addTube(smile, () => 0.007, color("#1f1a24"), [["head", 1]], {
  rings: 10,
  sides: 6,
});

// The rim around the window.
const rim = [];
for (let i = 0; i < 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  const x = WINDOW.x * Math.cos(a);
  const y = WINDOW.cy + WINDOW.y * Math.sin(a);
  rim.push([x, y, helmetZ(x, y) + 0.005]);
}
astronaut.addLoop(rim, 0.032, TRIM, "head", [0, 0, 1], { sides: 10 });

// Ear pods on both sides of the helmet.
for (const side of [-1, 1]) {
  astronaut.addEllipsoid(
    [0.325 * side, 0.74, -0.01],
    [0.05, 0.095, 0.095],
    BLUE,
    "head",
    { seg: 14, rows: 8 },
  );
}

// Antenna with a red bobble.
const antennaBase = [0.13, 1.0, -0.06];
const antennaTop = add(antennaBase, [0.05, 0.17, -0.02]);
astronaut.addTube(
  [antennaBase, add(antennaBase, [0.02, 0.09, -0.01]), antennaTop],
  () => 0.016,
  PANEL,
  [["head", 1]],
  { rings: 6, sides: 8 },
);
astronaut.addEllipsoid(antennaTop, [0.045, 0.045, 0.045], RED, "head", {
  seg: 10,
  rows: 8,
});

// Chest panel with three buttons.
const chest = [0, 0.43, 0.175];
astronaut.addEllipsoid(chest, [0.09, 0.055, 0.035], PANEL, "hips", {
  seg: 14,
  rows: 8,
});
[RED, YELLOW, BLUE].forEach((uv, i) => {
  astronaut.addEllipsoid(
    add(chest, [(i - 1) * 0.05, 0.004, 0.03]),
    [0.017, 0.017, 0.012],
    uv,
    "hips",
  );
});

// Backpack.
astronaut.addEllipsoid([0, 0.38, -0.2], [0.17, 0.18, 0.09], TRIM, "hips", {
  seg: 16,
  rows: 10,
});
for (const side of [-1, 1])
  astronaut.addEllipsoid(
    [0.08 * side, 0.47, -0.28],
    [0.035, 0.035, 0.02],
    side < 0 ? BLUE : RED,
    "hips",
  );

astronaut.write();
