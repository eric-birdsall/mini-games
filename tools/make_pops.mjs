// Builds the "Pop" collectible-vinyl-figure versions of the characters into
// ChibiCritters3D_v1.0/Models/GLB/Pop<Name>.glb (see tools/popKit.mjs).
//
//   node tools/make_pops.mjs              # all of them
//   node tools/make_pops.mjs Penguin Fox  # just these
//
// Each keeps its original's body, arms, legs and tail under the big
// rounded-square Pop head, with wide-set glossy eyes and the face markings,
// nose and ears that make it that character. The Squirrel, Giraffe,
// Astronaut, Baby and Shark versions start from the generated models, so
// run their tools/make_<name>.mjs first. The Dog is already Pop-shaped.

import { INK, WHITE, color, popFigure, writePop } from "./popKit.mjs";

const c = color;

const POPS = {
  Penguin() {
    const SLATE = c("#4a4458");
    const f = popFigure("PopPenguin", "Penguin", SLATE);
    // White heart-shaped face: a lobe round each eye and a band below.
    for (const side of [-1, 1])
      f.decal(0.17 * side, 0.87, [0.18, 0.22, 0.02], WHITE, { lift: -0.008 });
    f.decal(0, 0.72, [0.31, 0.15, 0.02], WHITE, { lift: -0.008 });
    f.eyes({ y: 0.86 });
    f.cheeks({ y: 0.74, x: 0.29, lift: 0.006 });
    f.bump(0, 0.755, [0.07, 0.042, 0.065], c("#f08a3c"), 0.03);
    // A little tuft curling up off the top.
    f.pop.addTube(
      [
        [0, 1.2, 0.06],
        [0, 1.32, 0.08],
        [0.02, 1.33, -0.04],
      ],
      (t) => 0.045 - 0.03 * t,
      SLATE,
      [["head", 1]],
      { rings: 10, sides: 10 },
    );
    return f;
  },

  Panda() {
    const f = popFigure("PopPanda", "Panda", WHITE);
    // Droopy eye patches, leaning in at the top.
    for (const side of [-1, 1])
      f.decal(0.2 * side, 0.83, [0.12, 0.15, 0.015], INK, {
        lift: -0.006,
        tilt: 0.45 * side,
      });
    f.eyes({ y: 0.845, x: 0.2, size: 0.8, ring: true });
    f.cheeks({ y: 0.7, x: 0.33 });
    f.muzzle(0.71, [0.14, 0.085, 0.06], WHITE);
    f.nose(0.75);
    f.ears(1.55, [0.31, 1.12, -0.02]);
    return f;
  },

  Raccoon() {
    const MASK = c("#4a4458");
    const f = popFigure("PopRaccoon", "Raccoon", c("#9aa0a8"));
    // White brows, then a bandit mask: a droopy lobe round each eye
    // joined over the nose.
    for (const side of [-1, 1]) {
      f.decal(0.2 * side, 0.97, [0.13, 0.055, 0.015], WHITE, {
        lift: -0.006,
        tilt: -0.15 * side,
      });
      f.decal(0.2 * side, 0.835, [0.17, 0.11, 0.015], MASK, {
        lift: -0.006,
        tilt: -0.3 * side,
      });
    }
    f.decal(0, 0.86, [0.1, 0.05, 0.015], MASK, { lift: -0.006 });
    f.eyes({ y: 0.845, x: 0.2, size: 0.8, ring: true });
    f.cheeks({ y: 0.71, x: 0.32 });
    f.muzzle(0.71, [0.16, 0.095, 0.06], WHITE);
    f.nose(0.755);
    f.ears(1.5, [0.3, 1.12, -0.02]);
    return f;
  },

  Frog() {
    const GREEN = c("#8fd14f");
    const f = popFigure("PopFrog", "Frog", GREEN);
    // Pale lower face and a wide smile.
    f.decal(0, 0.68, [0.36, 0.14, 0.02], c("#cdf59a"), { lift: -0.008 });
    f.line(
      [
        [-0.13, 0.74],
        [0, 0.66],
        [0.13, 0.74],
      ],
      0.013,
      c("#8f1f2a"),
    );
    f.cheeks({ y: 0.76, x: 0.29, lift: 0.006 });
    // Big eyes up on bumps at the top corners of the head.
    for (const side of [-1, 1]) {
      const x = 0.2 * side;
      f.pop.addEllipsoid([x, 1.16, 0.1], [0.15, 0.13, 0.15], GREEN, "head", {
        seg: 20,
        rows: 12,
      });
      f.pop.addEllipsoid([x, 1.17, 0.19], [0.11, 0.1, 0.07], WHITE, "head", {
        seg: 18,
        rows: 10,
      });
      f.pop.addEllipsoid([x, 1.17, 0.245], [0.065, 0.075, 0.03], INK, "head", {
        seg: 16,
        rows: 10,
      });
      f.pop.addEllipsoid(
        [x - 0.022, 1.2, 0.27],
        [0.018, 0.02, 0.01],
        WHITE,
        "head",
      );
    }
    return f;
  },

  Chick() {
    const GOLD = c("#f4b83a");
    const f = popFigure("PopChick", "Chick", c("#ffe08a"));
    f.eyes({ y: 0.85 });
    f.cheeks({ y: 0.74 });
    f.bump(0, 0.75, [0.075, 0.045, 0.07], c("#f08a3c"), 0.03);
    // Two little feathers sticking up on top.
    for (const side of [-1, 1])
      f.pop.addTube(
        [
          [0, 1.19, 0.02],
          [0.03 * side, 1.3, 0.03],
          [0.09 * side, 1.34, 0],
        ],
        (t) => 0.04 - 0.025 * t,
        GOLD,
        [["head", 1]],
        { rings: 10, sides: 10 },
      );
    return f;
  },

  Axolotl() {
    const f = popFigure("PopAxolotl", "Axolotl", c("#ffc9de"));
    f.eyes({ y: 0.84, x: 0.21 });
    f.cheeks({ y: 0.72, x: 0.32 });
    f.line(
      [
        [-0.07, 0.73],
        [0, 0.69],
        [0.07, 0.73],
      ],
      0.011,
      c("#d9568a"),
    );
    // The frilly gills, bigger, out of the sides of the head.
    f.ears(1.35, [0.42, 0.9, 0], { from: [0.3, 0.78, 0] });
    return f;
  },

  Bear() {
    const f = popFigure("PopBear", "Bear", c("#9a5d32"));
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.32 });
    f.muzzle(0.71, [0.15, 0.095, 0.06], c("#f2c99a"));
    f.nose(0.755);
    f.ears(1.5, [0.3, 1.12, -0.02]);
    return f;
  },

  Bunny() {
    const f = popFigure("PopBunny", "Bunny", c("#f4f2f8"));
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.32 });
    f.muzzle(0.71, [0.14, 0.09, 0.06], WHITE);
    f.nose(0.755, c("#ff8fb8"), 0.8);
    f.ears(1.15, [0.17, 1.15, -0.02]);
    return f;
  },

  Capybara() {
    const TAN = c("#d9a066");
    const f = popFigure("PopCapybara", "Capybara", TAN);
    f.eyes({ y: 0.88, size: 0.8 });
    f.cheeks({ y: 0.76, x: 0.33 });
    // Broad, flat blunt snout with two nostrils.
    f.decal(0, 0.72, [0.24, 0.13, 0.04], TAN, { lift: -0.012 });
    for (const side of [-1, 1])
      f.bump(0.06 * side, 0.76, [0.028, 0.014, 0.015], c("#a86f3a"), 0.03);
    f.ears(1.5, [0.33, 1.13, -0.06]);
    // An orange balanced on top, with a leaf.
    f.pop.addEllipsoid(
      [0, 1.29, 0.02],
      [0.1, 0.085, 0.1],
      c("#f08a3c"),
      "head",
      {
        seg: 18,
        rows: 12,
      },
    );
    f.pop.addEllipsoid(
      [0.04, 1.38, 0.02],
      [0.05, 0.014, 0.03],
      c("#2fb36a"),
      "head",
    );
    return f;
  },

  Cat() {
    const f = popFigure("PopCat", "Cat", c("#9aa0a8"));
    // Dark stripes on the forehead.
    for (const x of [-0.09, 0, 0.09])
      f.decal(x, 1.07 + (x ? -0.015 : 0), [0.025, 0.065, 0.012], c("#5c636b"), {
        lift: -0.005,
      });
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.32 });
    for (const side of [-1, 1])
      f.decal(0.055 * side, 0.71, [0.085, 0.065, 0.05], c("#c9d1d9"), {
        lift: -0.02,
      });
    f.nose(0.755, c("#ff8fb8"), 0.8);
    f.ears(1.4, [0.3, 1.12, 0]);
    return f;
  },

  Dragon() {
    const GREEN = c("#2fb36a");
    const f = popFigure("PopDragon", "Dragon", GREEN);
    f.eyes({ y: 0.87 });
    f.cheeks({ y: 0.75, x: 0.32 });
    f.bump(0, 0.71, [0.17, 0.1, 0.07], GREEN, 0);
    for (const side of [-1, 1])
      f.bump(0.05 * side, 0.74, [0.022, 0.016, 0.02], c("#1b7a45"), 0.065);
    // Cream horns, bigger, on top.
    f.ears(1.7, [0.22, 1.14, -0.04]);
    return f;
  },

  Fox() {
    const CREAM = c("#f7e8cd");
    const f = popFigure("PopFox", "Fox", c("#f08a3c"));
    // Cream cheeks sweeping down to the chin.
    for (const side of [-1, 1])
      f.decal(0.19 * side, 0.67, [0.17, 0.11, 0.02], CREAM, {
        lift: -0.008,
        tilt: 0.25 * side,
      });
    f.decal(0, 0.665, [0.13, 0.09, 0.02], CREAM, { lift: -0.008 });
    f.eyes({ y: 0.86 });
    f.cheeks({ y: 0.74, x: 0.31 });
    f.nose(0.735);
    f.ears(1.4, [0.3, 1.12, -0.01]);
    return f;
  },

  Owl() {
    const f = popFigure("PopOwl", "Owl", c("#9a5d32"));
    // Cream face disc, a lobe round each eye.
    for (const side of [-1, 1])
      f.decal(0.18 * side, 0.83, [0.2, 0.21, 0.02], c("#f7e8cd"), {
        lift: -0.008,
      });
    f.eyes({ y: 0.85 });
    f.cheeks({ y: 0.7, x: 0.3, lift: 0.006 });
    f.bump(0, 0.74, [0.05, 0.065, 0.05], c("#f4b83a"), 0.025);
    f.ears(1.5, [0.32, 1.13, -0.02]);
    return f;
  },

  Pig() {
    const f = popFigure("PopPig", "Pig", c("#ffc9de"));
    f.eyes({ y: 0.87 });
    f.cheeks({ y: 0.74, x: 0.32 });
    // A round snout with two nostrils.
    f.bump(0, 0.72, [0.12, 0.08, 0.06], c("#ff8fb8"), 0.03);
    for (const side of [-1, 1])
      f.bump(0.04 * side, 0.72, [0.022, 0.03, 0.02], c("#d9568a"), 0.085);
    f.ears(1.4, [0.3, 1.12, 0.02]);
    return f;
  },

  RedPanda() {
    const f = popFigure("PopRedPanda", "RedPanda", c("#c4612a"));
    // White brow spots, cheek patches and muzzle.
    for (const side of [-1, 1]) {
      f.decal(0.2 * side, 0.98, [0.065, 0.04, 0.012], WHITE, { lift: -0.005 });
      f.decal(0.34 * side, 0.74, [0.09, 0.08, 0.015], WHITE, { lift: -0.006 });
    }
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.33, lift: 0.004 });
    f.muzzle(0.71, [0.16, 0.1, 0.06], WHITE);
    f.nose(0.755);
    f.ears(1.5, [0.3, 1.12, -0.02]);
    return f;
  },

  Shiba() {
    const CREAM = c("#f7e8cd");
    const f = popFigure("PopShiba", "Shiba", c("#ffb070"));
    for (const side of [-1, 1]) {
      f.decal(0.2 * side, 0.98, [0.06, 0.035, 0.012], CREAM, { lift: -0.005 });
      f.decal(0.19 * side, 0.67, [0.17, 0.11, 0.02], CREAM, {
        lift: -0.008,
        tilt: 0.25 * side,
      });
    }
    f.decal(0, 0.665, [0.13, 0.09, 0.02], CREAM, { lift: -0.008 });
    f.eyes({ y: 0.86 });
    f.cheeks({ y: 0.74, x: 0.31 });
    f.nose(0.735);
    f.ears(1.4, [0.3, 1.12, -0.01]);
    return f;
  },

  Squirrel() {
    const f = popFigure("PopSquirrel", "Squirrel", c("#c97f1c"));
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.32 });
    f.muzzle(0.71, [0.15, 0.095, 0.06], c("#f7e8cd"));
    f.nose(0.755);
    // Two little front teeth.
    for (const side of [-1, 1])
      f.bump(0.018 * side, 0.655, [0.016, 0.026, 0.01], WHITE, 0.055);
    f.ears(1.4, [0.3, 1.12, -0.01]);
    return f;
  },

  Giraffe() {
    const GOLD = c("#f4b83a");
    const SPOT = c("#b0703f");
    const DARK = c("#6a3b1f");
    const f = popFigure("PopGiraffe", "Giraffe", GOLD);
    for (const [x, y, r] of [
      [-0.33, 1.04, 0.06],
      [0.36, 0.98, 0.05],
      [0.13, 1.12, 0.045],
      [-0.38, 0.72, 0.04],
      [0.37, 0.67, 0.035],
    ])
      f.decal(x, y, [r, r * 0.85, 0.012], SPOT, { lift: -0.005 });
    f.eyes({ y: 0.88 });
    f.cheeks({ y: 0.77, x: 0.32 });
    f.muzzle(0.69, [0.2, 0.12, 0.07], c("#ffe08a"));
    for (const side of [-1, 1])
      f.bump(0.06 * side, 0.71, [0.022, 0.016, 0.02], DARK, 0.06);
    for (const side of [-1, 1]) {
      // Ossicones with dark knobs.
      const top = [0.15 * side, 1.4, -0.02];
      f.pop.addTube(
        [[0.12 * side, 1.15, -0.02], [0.13 * side, 1.3, -0.02], top],
        () => 0.035,
        GOLD,
        [["head", 1]],
        { rings: 8, sides: 10 },
      );
      f.pop.addEllipsoid(top, [0.05, 0.045, 0.05], DARK, "head", {
        seg: 14,
        rows: 8,
      });
      // Leaf-shaped ears sticking out sideways.
      f.pop.addEllipsoid(
        [0.5 * side, 1.08, -0.02],
        [0.12, 0.045, 0.07],
        GOLD,
        "head",
        {
          basis: [
            [0.96, 0.28 * side, 0],
            [-0.28 * side, 0.96, 0],
            [0, 0, 1],
          ],
          seg: 16,
          rows: 10,
        },
      );
    }
    return f;
  },

  Astronaut() {
    const SUIT = c("#f4f2f8");
    const TRIM = c("#c9d1d9");
    const f = popFigure("PopAstronaut", "Astronaut", SUIT);
    // An open face window with a rim, the face showing inside.
    const WIN = { y: 0.82, rx: 0.3, ry: 0.25 };
    f.decal(0, WIN.y, [WIN.rx, WIN.ry, 0.02], c("#f2c99a"), { lift: -0.008 });
    const rim = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      rim.push(f.at(WIN.rx * Math.cos(a), WIN.y + WIN.ry * Math.sin(a), 0.012));
    }
    f.pop.addLoop(rim, 0.03, TRIM, "head", [0, 0, 1]);
    f.eyes({ y: 0.85 });
    f.cheeks({ y: 0.74, x: 0.2, lift: 0.006 });
    // Ear pods, and an antenna with a red ball.
    for (const side of [-1, 1])
      f.pop.addEllipsoid(
        [0.45 * side, 0.88, 0.02],
        [0.05, 0.13, 0.13],
        TRIM,
        "head",
        {
          seg: 16,
          rows: 10,
        },
      );
    const tip = [0.28, 1.42, -0.1];
    f.pop.addTube(
      [[0.25, 1.17, -0.08], [0.27, 1.3, -0.09], tip],
      () => 0.016,
      c("#9aa0a8"),
      [["head", 1]],
      { rings: 8, sides: 8 },
    );
    f.pop.addEllipsoid(tip, [0.04, 0.04, 0.04], c("#d63c3c"), "head", {
      seg: 12,
      rows: 8,
    });
    return f;
  },

  Baby() {
    const SKIN = c("#f2c99a");
    const f = popFigure("PopBaby", "Baby", SKIN);
    f.eyes();
    f.cheeks({ y: 0.72, x: 0.3 });
    f.bump(0, 0.75, [0.04, 0.03, 0.03], c("#d9a070"), 0.02);
    f.line(
      [
        [-0.05, 0.69],
        [0, 0.66],
        [0.05, 0.69],
      ],
      0.01,
      c("#d63c3c"),
    );
    // Small ears and a curl of hair at the front of the head.
    for (const side of [-1, 1])
      f.pop.addEllipsoid(
        [0.45 * side, 0.84, 0.02],
        [0.045, 0.08, 0.06],
        SKIN,
        "head",
        {
          seg: 14,
          rows: 8,
        },
      );
    f.pop.addTube(
      [
        [0, 1.19, 0.14],
        [0.02, 1.34, 0.2],
        [0.1, 1.3, 0.12],
        [0.06, 1.24, 0.12],
      ],
      (t) => 0.035 - 0.015 * t,
      c("#6a3b1f"),
      [["head", 1]],
      { rings: 16, sides: 10 },
    );
    return f;
  },

  Shark() {
    const BLUE = c("#4fa8e8");
    const f = popFigure("PopShark", "Shark", BLUE);
    f.decal(0, 0.67, [0.38, 0.15, 0.02], c("#f2f6f9"), { lift: -0.008 });
    f.eyes({ y: 0.87 });
    f.cheeks({ y: 0.78, x: 0.33 });
    // An open grin with a row of little teeth.
    f.decal(0, 0.67, [0.17, 0.06, 0.015], c("#8f1f2a"), { lift: 0.006 });
    for (let i = -3; i <= 3; i++)
      f.decal(
        i * 0.042,
        0.712 - Math.abs(i) * 0.006,
        [0.016, 0.02, 0.01],
        WHITE,
        {
          lift: 0.012,
        },
      );
    // Gill slits on the sides of the face.
    for (const side of [-1, 1])
      for (const k of [0, 1, 2])
        f.line(
          [
            [(0.33 + 0.03 * k) * side, 0.92 - 0.01 * k],
            [(0.34 + 0.03 * k) * side, 0.86 - 0.01 * k],
            [(0.33 + 0.03 * k) * side, 0.8 - 0.01 * k],
          ],
          0.008,
          c("#2f6fb0"),
        );
    // Dorsal fin, flattened side to side.
    f.pop.addTube(
      [
        [0, 1.15, 0.04],
        [0, 1.38, -0.06],
        [0, 1.47, -0.22],
      ],
      (t) => 0.13 * (1 - t) + 0.015,
      BLUE,
      [["head", 1]],
      { rings: 14, sides: 14, flatten: 0.3 },
    );
    return f;
  },
};

const wanted = process.argv.slice(2).filter((arg) => arg !== "--public");
for (const name of wanted.length ? wanted : Object.keys(POPS)) {
  if (!POPS[name]) throw new Error(`No Pop figure called ${name}`);
  await writePop(POPS[name]().pop);
}
