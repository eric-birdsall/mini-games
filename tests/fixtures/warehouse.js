// Stable movement fixture: the retired Pier 9 warehouse ramp and catwalk.
import { room, ramp } from "../../shared/maps.js";
const building = (x, z, w, d, h) => ({ x, z, w, d, h, kind: "building" });
const cover = (x, z, w, d, h = 1.1) => ({ x, z, w, d, h, kind: "cover" });
const platform = (x, z, w, d, h) => ({ x, z, w, d, h, kind: "platform" });
export function warehouseFixture() {
  const out = [
    ...room(-26, -17, -10, 21, {
      h: 7,
      skip: ["-x"],
      roof: 6.4,
      skylights: 2,
      openings: [
        { side: "+z", at: -21, w: 3 },
        { side: "+z", at: -14, w: 3 },
        // This is the office window itself, not another wall behind it.
        { side: "+z", at: -23.5, w: 1.6, window: true },
        { side: "-z", at: -17.5, w: 3.5 },
        // The east wall is the Left | Centre lane wall: one connector door
        // mid-map, and site A's side door (from the Centre lane's fork).
        { side: "+x", at: 4, w: 2.5 },
        { side: "+x", at: -11, w: 2.5 },
      ],
    }),
    ...room(-26, 12, -21, 16, {
      h: 3,
      skip: ["-x"],
      roof: 2.7,
      openings: [
        { side: "+x", at: 14, w: 1.2 },
        { side: "-z", at: -23.5, w: 1.6, window: true },
      ],
    }),
    // The north office now meets the exterior wall; there is no second
    // window-bearing partition at z=20.
    ...room(-26, 16, -21, 21, {
      h: 3,
      skip: ["-x", "-z", "+z"],
      roof: 2.7,
      openings: [{ side: "+x", at: 18, w: 1.2 }],
    }),
    ...[
      [-17.5, 8.5, 9],
      // Shortened to end at site A's wall.
      [-17.5, -5.9, 5.8],
      [-13.5, 1, 8],
    ].map(([x, z, d]) => ({ ...building(x, z, 1.2, d, 2.8), style: "rack" })),
    cover(-15.5, 19.5, 1.4, 1.2),
    cover(-11.5, -14.5, 1.2, 1.2),
  ];
  // Four connected sides. The east side has a continuous 1.6 m outer walk,
  // with ramps in a separate 2.4 m inner strip, avoiding any low ceiling
  // above someone ascending a ramp.
  const decks = [
    { x0: -25.8, x1: -23.8, z0: -16.8, z1: 20.8 },
    { x0: -23.8, x1: -11.8, z0: -16.8, z1: -14.8 },
    { x0: -23.8, x1: -11.8, z0: 18.8, z1: 20.8 },
    { x0: -11.8, x1: -10.2, z0: -16.8, z1: 20.8 },
    { x0: -14.2, x1: -11.8, z0: -14.8, z1: -13 },
    { x0: -14.2, x1: -11.8, z0: -4.6, z1: 8.6 },
    { x0: -14.2, x1: -11.8, z0: 17, z1: 18.8 },
  ];
  // Existing office ceilings/wall tops are already walkable at 3 m. Trim
  // floor panels around them so no coplanar faces flicker.
  const existing = out.filter((w) => Math.abs(w.h - 3) < 0.001);
  for (const deck of decks) {
    let pieces = [deck];
    for (const w of existing) {
      const next = [];
      for (const p of pieces) {
        const l = Math.max(p.x0, w.x - w.w / 2),
          r = Math.min(p.x1, w.x + w.w / 2),
          n = Math.max(p.z0, w.z - w.d / 2),
          b = Math.min(p.z1, w.z + w.d / 2);
        if (l >= r || n >= b) {
          next.push(p);
          continue;
        }
        const add = (x0, x1, z0, z1) => {
          if (x1 - x0 > 0.01 && z1 - z0 > 0.01) next.push({ x0, x1, z0, z1 });
        };
        add(p.x0, l, p.z0, p.z1);
        add(r, p.x1, p.z0, p.z1);
        add(l, r, p.z0, n);
        add(l, r, b, p.z1);
      }
      pieces = next;
    }
    for (const p of pieces)
      out.push({
        ...platform(
          (p.x0 + p.x1) / 2,
          (p.z0 + p.z1) / 2,
          p.x1 - p.x0,
          p.z1 - p.z0,
          3,
        ),
        bottom: 2.7,
        catwalk: true,
      });
  }
  // (Only the north ramp: site A's wall crosses where the south one was.)
  for (const [z, toward] of [[17, "-z"]]) {
    const floor = ramp(-13, z, 3, { toward, length: 8.4, width: 2.4 });
    out.push(...floor);
    // Visible side rails keep the capsule clear of the neighboring deck's
    // underside. Their underside follows the slope, so they don't seal it.
    for (const offset of [-1.14, 1.14]) {
      const rail = {
        x: -13 + offset,
        z,
        toward,
        length: 8.4,
        width: 0.12,
        base: 0.85,
        top: 3.85,
        slab: 0.85,
      };
      out.push(
        ...floor.map((w) => ({
          ...w,
          x: rail.x,
          w: 0.12,
          bottom: w.h,
          h: w.h + 0.85,
          kind: "rampRail",
          ramp: rail,
        })),
      );
    }
  }
  // Solid waist-high rails along the inner edge; the ramps join through
  // their upper ends without a railing across the landing.
  for (const [x, z, w, d] of [
    [-23.86, 2, 0.12, 33.6],
    [-19, -14.86, 9.6, 0.12],
    [-19, 18.86, 9.6, 0.12],
    [-14.14, -13.9, 0.12, 1.8],
    [-14.14, 2, 0.12, 13.2],
    [-14.14, 17.9, 0.12, 1.8],
  ])
    out.push({ ...cover(x, z, w, d, 4), bottom: 3, style: "halfwall" });
  return out;
}
