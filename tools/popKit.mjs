// Shared builder for the "Pop" collectible-vinyl-figure versions of pack
// critters (tools/make_pop_<name>.mjs): the pack critter's own small body,
// arms, legs and tail under a big rounded-square head, with wide-set glossy
// black eyes. Each script then adds the face markings, nose and ears that
// make it that critter. The original pack critters are left untouched.

import {
  Critter,
  add,
  color,
  loadCritter,
  hexAt,
  onRoundedBox,
  scale,
  sub,
} from "./critterKit.mjs";

import { buildPopBody, writePublicPop } from "./publicPopRig.mjs";

export { add, color, scale };

const publicBuild = process.argv.includes("--public");
const publicModels = new URL("../public-pages/pops/", import.meta.url);

export function loadPopSource(name, fur, accent) {
  if (!publicBuild) return loadCritter(name);
  return buildPopBody(new Critter(name), name, fur, accent);
}

export function writePop(figure) {
  return publicBuild
    ? writePublicPop(figure, publicModels, hexAt)
    : figure.write();
}

export const INK = color("#1f1a24");
export const WHITE = color("#ffffff");
export const BLUSH = color("#ff9aa8");

// The same head as the Dog (tools/make_dog.mjs).
export const POP_HEAD = {
  centre: [0, 0.88, 0.02],
  half: [0.44, 0.35, 0.34],
  round: 0.55,
};

const BODY = ["root", "hips", "arm_L", "arm_R", "leg_L", "leg_R", "tail"];

/**
 * Start a Pop figure named `name` from pack critter `source`, copying its
 * body (with optional `recolor`) and adding the big head in `headColor`.
 */
export function popFigure(name, source, headColor, { recolor = {} } = {}) {
  const src = loadPopSource(source, headColor, color("#f7e8cd"));
  const pop = new Critter(name, src);
  pop.addPart(src, (v) => BODY.includes(v.bone), { recolor });
  pop.addRoundedBox(POP_HEAD, headColor, "head");

  const face = (x, y) => onRoundedBox(POP_HEAD, x, y);

  /** A flattened ellipsoid laid on the face at (x, y), optionally tilted. */
  function decal(
    x,
    y,
    radii,
    uv,
    { lift = 0, offset = [0, 0], tilt = 0 } = {},
  ) {
    const f = face(x, y);
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const across = add(scale(f.across, c), scale(f.up, s));
    const up = add(scale(f.up, c), scale(f.across, -s));
    const centre = add(
      add(f.p, scale(f.n, lift)),
      add(scale(f.across, offset[0]), scale(f.up, offset[1])),
    );
    pop.addEllipsoid(centre, radii, uv, "head", {
      basis: [across, up, f.n],
      seg: 18,
      rows: 10,
    });
  }

  /**
   * Wide-set glossy eyes with a shine each. `ring` puts a white rim round
   * each eye so it shows up on a dark mask.
   */
  function eyes({ y = 0.84, x = 0.19, size = 1, ring = false } = {}) {
    for (const side of [-1, 1]) {
      if (ring)
        decal(x * side, y, [0.085 * size, 0.097 * size, 0.026], WHITE, {
          lift: -0.012,
        });
      decal(x * side, y, [0.07 * size, 0.082 * size, 0.03], INK, {
        lift: -0.012,
      });
      decal(x * side, y, [0.02 * size, 0.022 * size, 0.008], WHITE, {
        lift: 0.017,
        offset: [-0.025 * size, 0.032 * size],
      });
    }
  }

  /** Rosy cheeks; raise `lift` to sit them on a face marking. */
  function cheeks({ y = 0.73, x = 0.31, lift = -0.003 } = {}) {
    for (const side of [-1, 1])
      decal(x * side, y, [0.045, 0.026, 0.01], BLUSH, { lift });
  }

  /**
   * Copy the source critter's ears, scaled up by `grow` about their base
   * and moved so the base sits at `base` (left ear; the right is mirrored).
   * The base is the bottom middle of the ear unless `from` gives it.
   */
  function ears(grow, base, { recolor: earColors = {}, from: anchor } = {}) {
    for (const [bone, side] of [
      ["ear_L", 1],
      ["ear_R", -1],
    ]) {
      const verts = src.verts.filter((v) => v.bone === bone);
      const xs = verts.map((v) => v.p[0]);
      const from = anchor
        ? [anchor[0] * side, anchor[1], anchor[2]]
        : [
            (Math.min(...xs) + Math.max(...xs)) / 2,
            Math.min(...verts.map((v) => v.p[1])),
            (Math.min(...verts.map((v) => v.p[2])) +
              Math.max(...verts.map((v) => v.p[2]))) /
              2,
          ];
      const to = [base[0] * side, base[1], base[2]];
      pop.addPart(src, (v) => v.bone === bone, {
        recolor: earColors,
        transform: (v) => {
          v.p = add(to, scale(sub(v.p, from), grow));
          return v;
        },
      });
    }
  }

  /** The point `out` in front of the face at (x, y). */
  const at = (x, y, out = 0) => {
    const f = face(x, y);
    return add(f.p, scale(f.n, out));
  };

  /** A rounded lump standing out of the face (a nose, beak or snout). */
  function bump(x, y, radii, uv, out = radii[2] * 0.6) {
    pop.addEllipsoid(at(x, y, out), radii, uv, "head", { seg: 16, rows: 10 });
  }

  /** A small glossy nose. */
  function nose(y = 0.75, uv = INK, size = 1) {
    bump(0, y, [0.05 * size, 0.032 * size, 0.03 * size], uv, 0.045);
  }

  /** A raised muzzle patch. */
  function muzzle(y, radii, uv) {
    decal(0, y, radii, uv, { lift: -0.02 });
  }

  /** A thin curved line on the face through `points` ([x, y] pairs). */
  function line(points, radius, uv) {
    pop.addTube(
      points.map(([x, y]) => at(x, y, 0.004)),
      () => radius,
      uv,
      [["head", 1]],
      { rings: 14, sides: 8 },
    );
  }

  return {
    pop,
    src,
    face,
    at,
    decal,
    eyes,
    cheeks,
    ears,
    bump,
    nose,
    muzzle,
    line,
  };
}
