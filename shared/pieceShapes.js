// What stands inside a builder piece's rectangle, in world coordinates.
// One description feeds collision (buildCustomMap), the 3D editor and level
// meshes, the 2D planner and the piece thumbnails, so they always agree.
//
// Parts:
//   { k: "box", x0, x1, z0, z1, y0, y1, solid, hidden?, see?, role? }
//   { k: "cyl", x, z, r, y0, y1, solid }
//   { k: "slope", x0, x1, z0, z1, y0, y1, dir, solid }   (a ramp)
//   { k: "arc", cx, cz, rx, rz, t, a0, a1, y0, y1 }      (drawn only;
//     arcColliders gives its collision)
// `solid` parts collide; `hidden` ones are collision only (not drawn);
// `see` ones block movement and shots but not sight. `role` marks the thin
// visual parts of fences and railings ("post", "rail", "bar", "panel") and
// the drawn parts of special pieces ("leaf", "glass", "foliage", "rung").
// Special colliders: `soft` (a hedge: blocks sight and shots, not movement),
// `oneWay` (glass that team sees through), `ladder` (climbable) and `leaf`
// (a door's leaf, removed while the door is open).

// Quarter-arc centres: the corner the curve bends around, by `dir`. They
// turn clockwise with dir (-z → +x → +z → -x), like rotatePieces.
const ARC_CORNERS = {
  "-z": { x: "x0", z: "z1", a0: -Math.PI / 2 },
  "+x": { x: "x0", z: "z0", a0: 0 },
  "+z": { x: "x1", z: "z0", a0: Math.PI / 2 },
  "-x": { x: "x1", z: "z1", a0: Math.PI },
};
const DOOR = { width: 1.4, height: 2.6 },
  WINDOW = { width: 1.4, sill: 1, head: 2.1, bay: 3 },
  // A vault window you clamber through; a vent you only fit through prone.
  // (A vault lifts you 0.25 m over the sill, so the head clears a body.)
  VAULT = { width: 1.6, sill: 0.8, head: 3 },
  VENT = { width: 0.9, head: 0.6 },
  // A hinged door: the leaf fills the opening while it's shut.
  LEAF = { width: 1.2, height: 2.4, thick: 0.06 },
  STAIR_RISE = 0.3,
  RUNG = 0.3,
  // A slit at standing eye height: see and shoot through, never climb.
  SLIT = { width: 2.4, sill: 1.35, head: 1.75 },
  // A pillbox's firing slits and doorway.
  PILLBOX = { slit: 1.3, slitTop: 1.7, door: 1.4, doorHead: 2.4, corner: 0.6 };

// The smallest window opening, each way.
export const MIN_WINDOW = 0.3;
// A window opening kept inside a wall `length` long and `h` tall, or null if
// too little of it is left (or it would take the whole wall).
export function clampWindow(win, length, h) {
  const c = (v, max) => Math.max(0, Math.min(max, Number(v) || 0)),
    o = {
      x0: c(win.x0, length),
      x1: c(win.x1, length),
      y0: c(win.y0, h),
      y1: c(win.y1, h),
    };
  if (o.x1 - o.x0 < MIN_WINDOW || o.y1 - o.y0 < MIN_WINDOW) return null;
  if (o.x0 <= 0 && o.x1 >= length && o.y0 <= 0 && o.y1 >= h) return null;
  return o;
}
// Where a window wall's (first) opening is: its own, or the default bays'.
export function windowOpening(p, type) {
  const alongX = p.x1 - p.x0 >= p.z1 - p.z0,
    length = alongX ? p.x1 - p.x0 : p.z1 - p.z0,
    h = p.h ?? type.h;
  if (p.win) return clampWindow(p.win, length, h);
  const n = Math.max(1, Math.floor(length / WINDOW.bay)),
    bay = length / n,
    width = Math.min(WINDOW.width, bay - 0.6);
  if (h < WINDOW.head + 0.1 || width < 0.5) return null;
  return {
    x0: bay / 2 - width / 2,
    x1: bay / 2 + width / 2,
    y0: WINDOW.sill,
    y1: WINDOW.head,
  };
}

export function pieceParts(p, type) {
  const y0 = p.y ?? 0,
    y1 = y0 + (p.h ?? type.h),
    h = y1 - y0,
    box = (x0, x1, z0, z1, b, t, extra = {}) => ({
      k: "box",
      x0,
      x1,
      z0,
      z1,
      y0: b,
      y1: t,
      solid: true,
      ...extra,
    }),
    full = box(p.x0, p.x1, p.z0, p.z1, y0, y1);
  // Straight runs (door/window walls, fences, railings) follow the long side.
  const alongX = p.x1 - p.x0 >= p.z1 - p.z0,
    length = alongX ? p.x1 - p.x0 : p.z1 - p.z0,
    start = alongX ? p.x0 : p.z0,
    // A segment [a, b] of the run, across its full thickness (or `inset`).
    run = (a, b, lo, hi, extra, inset = 0) => {
      const mid = alongX ? (p.z0 + p.z1) / 2 : (p.x0 + p.x1) / 2,
        half = ((alongX ? p.z1 - p.z0 : p.x1 - p.x0) / 2) * (1 - inset);
      return alongX
        ? box(start + a, start + b, mid - half, mid + half, lo, hi, extra)
        : box(mid - half, mid + half, start + a, start + b, lo, hi, extra);
    },
    centre = alongX ? (p.z0 + p.z1) / 2 : (p.x0 + p.x1) / 2,
    // A thin visual bar along the run, centred across it at `mid`.
    thin = (a, b, lo, hi, role, size, mid = centre) => {
      return alongX
        ? box(start + a, start + b, mid - size / 2, mid + size / 2, lo, hi, {
            solid: false,
            role,
          })
        : box(mid - size / 2, mid + size / 2, start + a, start + b, lo, hi, {
            solid: false,
            role,
          });
    },
    posts = (spacing, size, top = y1, lo = y0, mid = centre) => {
      const n = Math.max(1, Math.ceil(length / spacing)),
        out = [];
      for (let i = 0; i <= n; i++) {
        const at = Math.min(
          length - size / 2,
          Math.max(size / 2, (length * i) / n),
        );
        out.push(
          thin(at - size / 2, at + size / 2, lo, top, "post", size, mid),
        );
      }
      return out;
    },
    rail = (at, size, mid = centre) =>
      thin(0, length, at - size / 2, at + size / 2, "rail", size, mid),
    // One centred opening `width` wide from `sill` to `head` above the base
    // (a doorway when sill is 0), or the plain wall if it doesn't fit.
    opening = (width, sill, head) => {
      width = Math.min(width, length - 0.5);
      if (width < 0.6 || h < head + 0.05) return null;
      const a = (length - width) / 2,
        parts = [run(0, a, y0, y1), run(a + width, length, y0, y1)];
      if (sill) parts.push(run(a, a + width, y0, y0 + sill));
      if (h > head + 0.1) parts.push(run(a, a + width, y0 + head, y1));
      return { parts, a, width };
    },
    // An L or T's arm: a 0.5 m-thick wall along one edge, or across the middle.
    t = Math.min(0.5, (p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2);
  switch (type.shape) {
    case "door":
      return opening(DOOR.width, 0, DOOR.height)?.parts || [full];
    case "vault":
      return opening(VAULT.width, VAULT.sill, VAULT.head)?.parts || [full];
    case "vent":
      return opening(VENT.width, 0, VENT.head)?.parts || [full];
    case "leafDoor": {
      const o = opening(LEAF.width, 0, LEAF.height);
      if (!o) return [full];
      const top = y0 + LEAF.height - 0.02,
        leaf = (extra) =>
          thin(
            o.a + 0.02,
            o.a + o.width - 0.02,
            y0,
            top,
            null,
            LEAF.thick,
            centre,
          ),
        // The hinge is the leaf's start-side edge, for the swing.
        hinge = alongX
          ? { x: start + o.a, z: centre }
          : { x: centre, z: start + o.a };
      return [
        ...o.parts,
        { ...leaf(), solid: true, hidden: true, leaf: true },
        { ...leaf(), role: "leaf", hinge, alongX },
      ];
    }
    case "slit":
      return opening(SLIT.width, SLIT.sill, SLIT.head)?.parts || [full];
    case "arch":
      // A wide opening between two short piers, under a lintel.
      return (
        opening(length - 1.2, 0, Math.max(2.2, Math.min(3.2, h - 0.5)))
          ?.parts || [full]
      );
    case "cross": {
      const cx = (p.x0 + p.x1) / 2,
        cz = (p.z0 + p.z1) / 2,
        k = Math.min(0.5, (p.x1 - p.x0) / 3, (p.z1 - p.z0) / 3);
      return [
        box(p.x0, p.x1, cz - k / 2, cz + k / 2, y0, y1),
        box(cx - k / 2, cx + k / 2, p.z0, p.z1, y0, y1),
      ];
    }
    case "U":
    case "nest": {
      // Three sides; the side dir names is open.
      const k = Math.min(
          type.shape === "nest" ? 0.6 : 0.5,
          (p.x1 - p.x0) / 3,
          (p.z1 - p.z0) / 3,
        ),
        sides = {
          "-z": box(p.x0, p.x1, p.z0, p.z0 + k, y0, y1),
          "+z": box(p.x0, p.x1, p.z1 - k, p.z1, y0, y1),
          "-x": box(p.x0, p.x0 + k, p.z0, p.z1, y0, y1),
          "+x": box(p.x1 - k, p.x1, p.z0, p.z1, y0, y1),
        };
      return Object.entries(sides)
        .filter(([d]) => d !== (p.dir || "-z"))
        .map(([, b]) => b);
    }
    case "chicane": {
      // Two overlapping halves on opposite edges: an S-bend you walk
      // through with no straight sightline across.
      const across = alongX ? p.z1 - p.z0 : p.x1 - p.x0,
        k = Math.min(0.5, across / 3),
        half = (a, b, s) => {
          const mid = centre + s * (across / 2 - k / 2);
          return alongX
            ? box(start + a, start + b, mid - k / 2, mid + k / 2, y0, y1)
            : box(mid - k / 2, mid + k / 2, start + a, start + b, y0, y1);
        };
      return [half(0, length * 0.55, -1), half(length * 0.45, length, 1)];
    }
    case "crenel": {
      // A chest-high wall with taller merlons to duck behind.
      const base = y0 + Math.min(1.1, h * 0.6),
        n = Math.max(1, Math.round(length / 1.6)),
        bay = length / n,
        parts = [run(0, length, y0, base)];
      for (let i = 0; i < n; i++) {
        const c = bay * (i + 0.5);
        parts.push(
          run(c - Math.min(0.4, bay / 3), c + Math.min(0.4, bay / 3), base, y1),
        );
      }
      return parts;
    }
    case "barrels": {
      const w = p.x1 - p.x0,
        d = p.z1 - p.z0,
        cols = Math.max(1, Math.floor(w / 0.8)),
        rows = Math.max(1, Math.floor(d / 0.8)),
        r = Math.min(0.38, w / cols / 2, d / rows / 2),
        out = [];
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++)
          out.push({
            k: "cyl",
            x: p.x0 + (w * (i + 0.5)) / cols,
            z: p.z0 + (d * (j + 0.5)) / rows,
            r,
            y0,
            y1,
            solid: true,
          });
      return out;
    }
    case "pillbox": {
      // Four walls with firing slits, a doorway on the dir side, and a roof.
      const w = p.x1 - p.x0,
        d = p.z1 - p.z0;
      if (h < 2.6 || w < 3 || d < 3) return [full];
      const k = 0.4,
        roof = y1 - 0.3,
        lo = y0 + PILLBOX.slit,
        hi = y0 + PILLBOX.slitTop,
        // A segment [a, b] along one side, from its x0 / z0 end.
        side = (s, a, b, b0, b1) =>
          s === "-z"
            ? box(p.x0 + a, p.x0 + b, p.z0, p.z0 + k, b0, b1)
            : s === "+z"
              ? box(p.x0 + a, p.x0 + b, p.z1 - k, p.z1, b0, b1)
              : s === "-x"
                ? box(p.x0, p.x0 + k, p.z0 + a, p.z0 + b, b0, b1)
                : box(p.x1 - k, p.x1, p.z0 + a, p.z0 + b, b0, b1),
        parts = [box(p.x0, p.x1, p.z0, p.z1, roof, y1)];
      for (const s of ["-z", "+z", "-x", "+x"]) {
        const L = s === "-z" || s === "+z" ? w : d;
        if (s === (p.dir || "-z")) {
          const a = (L - PILLBOX.door) / 2;
          parts.push(
            side(s, 0, a, y0, roof),
            side(s, a + PILLBOX.door, L, y0, roof),
            side(s, a, a + PILLBOX.door, y0 + PILLBOX.doorHead, roof),
          );
        } else
          parts.push(
            side(s, 0, L, y0, lo),
            side(s, 0, L, hi, roof),
            side(s, 0, PILLBOX.corner, lo, hi),
            side(s, L - PILLBOX.corner, L, lo, hi),
          );
      }
      return parts;
    }
    case "tower": {
      // A deck on four legs: walk underneath, climb up by ladder or ramp.
      const r = 0.18,
        deck = Math.max(y0 + 0.3, y1 - 0.3),
        legs = [
          [p.x0 + r, p.z0 + r],
          [p.x1 - r, p.z0 + r],
          [p.x0 + r, p.z1 - r],
          [p.x1 - r, p.z1 - r],
        ];
      return [
        box(p.x0, p.x1, p.z0, p.z1, deck, y1),
        ...legs.map(([x, z]) => ({
          k: "cyl",
          x,
          z,
          r,
          y0,
          y1: deck,
          solid: true,
        })),
      ];
    }
    case "dais": {
      // Three tiers, each set in from the one below; low enough to walk up.
      const n = 3,
        step = Math.max(
          0,
          Math.min(
            0.75,
            (Math.min(p.x1 - p.x0, p.z1 - p.z0) - 1) / (2 * (n - 1)),
          ),
        );
      return Array.from({ length: n }, (_, i) =>
        box(
          p.x0 + step * i,
          p.x1 - step * i,
          p.z0 + step * i,
          p.z1 - step * i,
          y0,
          y0 + (h * (i + 1)) / n,
        ),
      );
    }
    case "shelves": {
      // Uprights and shelf boards: blocks movement and shots, not sight.
      const across = alongX ? p.z1 - p.z0 : p.x1 - p.x0,
        parts = [
          run(0, length, y0, y1, { hidden: true, see: true }),
          ...posts(1.2, 0.08),
        ];
      for (let y = y0 + 0.1; y < y1 - 0.1; y += 0.6)
        parts.push(thin(0, length, y, y + 0.04, "rail", across * 0.9));
      parts.push(thin(0, length, y1 - 0.04, y1, "rail", across * 0.9));
      return parts;
    }
    case "glass": {
      // A framed panel: drawn by the level per viewer's side.
      return [
        run(0, length, y0, y1, { hidden: true, oneWay: type.oneWay }),
        thin(0.04, length - 0.04, y0 + 0.04, y1 - 0.04, "glass", 0.05),
        ...posts(length, 0.08),
        rail(y1 - 0.04, 0.08),
        rail(y0 + 0.04, 0.08),
      ];
    }
    case "hedge": {
      // Leafy bulk you can push through; it hides whoever is inside.
      const parts = [{ ...full, hidden: true, soft: true }];
      const inset = 0.08;
      parts.push(
        box(
          p.x0 + inset,
          p.x1 - inset,
          p.z0 + inset,
          p.z1 - inset,
          y0,
          y1 - 0.2,
          {
            solid: false,
            role: "foliage",
          },
        ),
        box(
          p.x0 + inset * 2,
          p.x1 - inset * 2,
          p.z0 + inset * 2,
          p.z1 - inset * 2,
          y1 - 0.25,
          y1,
          { solid: false, role: "foliage" },
        ),
      );
      return parts;
    }
    case "catwalk": {
      // A 0.3 m deck with a railing down both long edges.
      const deck = Math.min(0.3, h - 0.3),
        top = y0 + deck,
        across = alongX ? p.z1 - p.z0 : p.x1 - p.x0,
        edge = (side) => centre + side * (across / 2 - 0.05),
        railRun = (side) => {
          const mid = edge(side);
          return alongX
            ? box(start, start + length, mid - 0.05, mid + 0.05, top, y1, {
                hidden: true,
                see: true,
              })
            : box(mid - 0.05, mid + 0.05, start, start + length, top, y1, {
                hidden: true,
                see: true,
              });
        };
      const parts = [box(p.x0, p.x1, p.z0, p.z1, y0, top)];
      for (const side of [-1, 1])
        parts.push(
          railRun(side),
          ...posts(1.5, 0.06, y1, top, edge(side)),
          rail(y1 - 0.03, 0.06, edge(side)),
          rail(top + (y1 - top) * 0.5, 0.04, edge(side)),
        );
      return parts;
    }
    case "container": {
      // Corrugated walls down both long sides and a roof; open at the ends.
      const wall = 0.1,
        across = alongX ? p.z1 - p.z0 : p.x1 - p.x0,
        side = (s) => {
          const mid = centre + s * (across / 2 - wall / 2);
          return alongX
            ? box(start, start + length, mid - wall / 2, mid + wall / 2, y0, y1)
            : box(
                mid - wall / 2,
                mid + wall / 2,
                start,
                start + length,
                y0,
                y1,
              );
        };
      return [side(-1), side(1), box(p.x0, p.x1, p.z0, p.z1, y1 - wall, y1)];
    }
    case "L": {
      // Two arms meeting at the corner dir names (like a curve's centre).
      const c = ARC_CORNERS[p.dir] || ARC_CORNERS["-z"],
        x = c.x === "x0" ? [p.x0, p.x0 + t] : [p.x1 - t, p.x1],
        z = c.z === "z0" ? [p.z0, p.z0 + t] : [p.z1 - t, p.z1];
      return [
        box(p.x0, p.x1, z[0], z[1], y0, y1),
        box(x[0], x[1], p.z0, p.z1, y0, y1),
      ];
    }
    case "T": {
      // A bar along the dir edge and a stem from its middle to the far edge.
      const cx = (p.x0 + p.x1) / 2,
        cz = (p.z0 + p.z1) / 2;
      switch (p.dir) {
        case "+x":
          return [
            box(p.x1 - t, p.x1, p.z0, p.z1, y0, y1),
            box(p.x0, p.x1 - t, cz - t / 2, cz + t / 2, y0, y1),
          ];
        case "+z":
          return [
            box(p.x0, p.x1, p.z1 - t, p.z1, y0, y1),
            box(cx - t / 2, cx + t / 2, p.z0, p.z1 - t, y0, y1),
          ];
        case "-x":
          return [
            box(p.x0, p.x0 + t, p.z0, p.z1, y0, y1),
            box(p.x0 + t, p.x1, cz - t / 2, cz + t / 2, y0, y1),
          ];
        default:
          return [
            box(p.x0, p.x1, p.z0, p.z0 + t, y0, y1),
            box(cx - t / 2, cx + t / 2, p.z0 + t, p.z1, y0, y1),
          ];
      }
    }
    case "cols": {
      // Columns down the run, spaced so a player fits between each pair.
      const r = Math.min(alongX ? p.z1 - p.z0 : p.x1 - p.x0, 1.2) / 2,
        gap = 1,
        n = Math.max(1, Math.floor((length + gap) / (r * 2 + gap))),
        step = n > 1 ? (length - r * 2) / (n - 1) : 0;
      return Array.from({ length: n }, (_, i) => {
        const at = n > 1 ? r + step * i : length / 2;
        return {
          k: "cyl",
          x: alongX ? start + at : centre,
          z: alongX ? centre : start + at,
          r,
          y0,
          y1,
          solid: true,
        };
      });
    }
    case "ladder": {
      // Two stiles and a rung every 0.3 m; climbed by pushing into it.
      const parts = [
        run(0, length, y0, y1, { hidden: true, ladder: true }),
        thin(0, 0.06, y0, y1, "post", 0.06),
        thin(length - 0.06, length, y0, y1, "post", 0.06),
      ];
      for (let y = y0 + RUNG; y < y1 - 0.05; y += RUNG)
        parts.push(thin(0.06, length - 0.06, y - 0.02, y + 0.02, "rung", 0.04));
      return parts;
    }
    case "window": {
      // One opening set in the editor: X along the run from its start, Y up
      // from the base. The wall stands everywhere else.
      if (p.win) {
        const o = clampWindow(p.win, length, h);
        if (!o) return [full];
        const parts = [];
        if (o.x0 > 0) parts.push(run(0, o.x0, y0, y1));
        if (o.x1 < length) parts.push(run(o.x1, length, y0, y1));
        if (o.y0 > 0) parts.push(run(o.x0, o.x1, y0, y0 + o.y0));
        if (o.y1 < h) parts.push(run(o.x0, o.x1, y0 + o.y1, y1));
        return parts;
      }
      if (h < WINDOW.head + 0.1) return [full];
      const n = Math.max(1, Math.floor(length / WINDOW.bay)),
        bay = length / n,
        width = Math.min(WINDOW.width, bay - 0.6);
      if (width < 0.5) return [full];
      const sill = y0 + WINDOW.sill,
        head = y0 + WINDOW.head,
        parts = [run(0, length, y0, sill), run(0, length, head, y1)];
      let at = 0;
      for (let i = 0; i < n; i++) {
        const centre = bay * (i + 0.5);
        parts.push(run(at, centre - width / 2, sill, head));
        at = centre + width / 2;
      }
      parts.push(run(at, length, sill, head));
      return parts;
    }
    case "cyl":
      return [
        {
          k: "cyl",
          x: (p.x0 + p.x1) / 2,
          z: (p.z0 + p.z1) / 2,
          r: Math.min(p.x1 - p.x0, p.z1 - p.z0) / 2,
          y0,
          y1,
          solid: true,
        },
      ];
    case "arc": {
      const c = ARC_CORNERS[p.dir] || ARC_CORNERS["-z"],
        rx = p.x1 - p.x0,
        rz = p.z1 - p.z0;
      return [
        {
          k: "arc",
          cx: p[c.x],
          cz: p[c.z],
          rx,
          rz,
          t: Math.min(type.h > 2 ? 0.5 : 0.6, rx / 2, rz / 2),
          a0: c.a0,
          a1: c.a0 + Math.PI / 2,
          y0,
          y1,
        },
      ];
    }
    case "crates":
    case "stairs": {
      // Steps climb toward dir, each at most STAIR_RISE (under STEP); a
      // crate stack is three big steps you clamber up.
      const n =
          type.shape === "crates" ? 3 : Math.max(2, Math.ceil(h / STAIR_RISE)),
        along = p.dir === "+z" || p.dir === "-z",
        len = along ? p.z1 - p.z0 : p.x1 - p.x0,
        parts = [];
      for (let i = 0; i < n; i++) {
        const a = (len * i) / n,
          b = (len * (i + 1)) / n,
          top = y0 + (h * (i + 1)) / n,
          [s, e] =
            p.dir === "+z" || p.dir === "+x" ? [a, b] : [len - b, len - a];
        parts.push(
          along
            ? box(p.x0, p.x1, p.z0 + s, p.z0 + e, y0, top)
            : box(p.x0 + s, p.x0 + e, p.z0, p.z1, y0, top),
        );
      }
      return parts;
    }
    case "railing":
      return [
        run(0, length, y0, y1, { hidden: true, see: true }),
        ...posts(1.5, 0.06),
        rail(y1 - 0.03, 0.06),
        rail(y0 + h * 0.5, 0.04),
      ];
    case "fence":
      return [
        run(0, length, y0, y1, { hidden: true, see: true }),
        ...posts(2.5, 0.1),
        rail(y1 - 0.04, 0.08),
        rail(y0 + 0.1, 0.06),
        thin(0, length, y0 + 0.1, y1 - 0.04, "panel", 0.02),
      ];
    case "gate": {
      const parts = [
        run(0, length, y0, y1, { hidden: true, see: true }),
        thin(0, 0.14, y0, y1, "post", 0.14),
        thin(length - 0.14, length, y0, y1, "post", 0.14),
        rail(y1 - 0.06, 0.12),
        rail(y0 + 0.12, 0.1),
      ];
      const n = Math.max(1, Math.floor((length - 0.28) / 0.18));
      for (let i = 1; i < n; i++) {
        const at = 0.14 + ((length - 0.28) * i) / n;
        parts.push(thin(at - 0.02, at + 0.02, y0, y1, "bar", 0.04));
      }
      return parts;
    }
  }
  if (type.ramp) return [{ ...full, k: "slope", dir: p.dir }];
  return [full];
}

// A curve collides as a chain of overlapping cylinders along its middle.
export function arcColliders(a) {
  const mx = a.rx - a.t / 2,
    mz = a.rz - a.t / 2,
    length = (Math.PI / 2) * Math.sqrt((mx * mx + mz * mz) / 2),
    n = Math.max(2, Math.ceil(length / (a.t * 0.5)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const angle = a.a0 + ((a.a1 - a.a0) * i) / n;
    return {
      k: "cyl",
      x: a.cx + mx * Math.cos(angle),
      z: a.cz + mz * Math.sin(angle),
      r: a.t / 2,
      y0: a.y0,
      y1: a.y1,
      solid: true,
      hidden: true,
    };
  });
}

// Whether (x, z) lies on a part's footprint (for "on a surface" placement).
export function partCovers(part, x, z) {
  if (part.k === "cyl") return Math.hypot(x - part.x, z - part.z) <= part.r;
  if (part.k === "arc")
    return arcColliders(part).some((c) => Math.hypot(x - c.x, z - c.z) <= c.r);
  return x >= part.x0 && x <= part.x1 && z >= part.z0 && z <= part.z1;
}

// A part drawn `inset` in from each face and below its top (and above its
// bottom when it's off the ground), never more than a quarter of its size.
export function slimPart(part, inset) {
  if (part.k === "cyl") {
    const i = Math.min(inset, part.r / 4, (part.y1 - part.y0) / 4);
    return {
      ...part,
      r: part.r - i,
      y0: part.y0 ? part.y0 + i : 0,
      y1: part.y1 - i,
    };
  }
  if (part.k === "arc") {
    const i = Math.min(inset, part.t / 4, (part.y1 - part.y0) / 4);
    return {
      ...part,
      rx: part.rx - i,
      rz: part.rz - i,
      t: part.t - i * 2,
      y0: part.y0 ? part.y0 + i : 0,
      y1: part.y1 - i,
    };
  }
  const i = Math.min(
    inset,
    (part.x1 - part.x0) / 4,
    (part.z1 - part.z0) / 4,
    (part.y1 - part.y0) / 4,
  );
  return {
    ...part,
    x0: part.x0 + i,
    x1: part.x1 - i,
    z0: part.z0 + i,
    z1: part.z1 - i,
    y0: part.y0 ? part.y0 + i : part.y0,
    y1: part.y1 - i,
  };
}
