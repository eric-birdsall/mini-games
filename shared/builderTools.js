// Editor geometry helpers, shared with the server for safe playtest starts.
import {
  CUSTOM_SIZES,
  ensurePieceIds,
  PIECE_TYPES,
  MAX_PIECES,
  buildCustomMap,
  pieceBase,
  pieceHeight,
  pieceTop,
  pieceSurface,
  MAX_BUILD_HEIGHT,
} from "./customMap.js";
import { overlapsFootprint, STEP } from "./map.js";
export const PLAYER_RADIUS = 0.32;
export const PLAYER_WIDTH = PLAYER_RADIUS * 2;
const bounds = (pieces) => ({
  x0: Math.min(...pieces.map((p) => p.x0)),
  x1: Math.max(...pieces.map((p) => p.x1)),
  z0: Math.min(...pieces.map((p) => p.z0)),
  z1: Math.max(...pieces.map((p) => p.z1)),
});
export function movePieces(def, indices, dx, dz) {
  const pieces = indices.map((i) => def.pieces[i]).filter(Boolean);
  if (!pieces.length) return false;
  const b = bounds(pieces),
    s = CUSTOM_SIZES[def.size];
  dx = Math.max(-s.x - b.x0, Math.min(s.x - b.x1, dx));
  dz = Math.max(-s.z - b.z0, Math.min(s.z - b.z1, dz));
  if (!dx && !dz) return false;
  for (const p of pieces) {
    p.x0 += dx;
    p.x1 += dx;
    p.z0 += dz;
    p.z1 += dz;
  }
  return true;
}
export function duplicatePieces(def, indices) {
  const originals = indices.map((i) => def.pieces[i]).filter(Boolean);
  if (!originals.length || def.pieces.length + originals.length > MAX_PIECES)
    return null;
  const copies = originals.map((p) => {
      const copy = { ...p };
      delete copy.id;
      return copy;
    }),
    start = def.pieces.length;
  const temp = { ...def, pieces: copies };
  // Keep the group intact near edges; use the opposite offset when needed.
  const b = bounds(copies),
    s = CUSTOM_SIZES[def.size];
  movePieces(
    temp,
    copies.map((_, i) => i),
    b.x1 + 1 <= s.x ? 1 : -1,
    b.z1 + 1 <= s.z ? 1 : -1,
  );
  def.pieces.push(...copies);
  if (originals.some((p) => p.id)) ensurePieceIds(def);
  return copies.map((_, i) => start + i);
}
export function rotatePieces(def, indices) {
  const pieces = indices.map((i) => def.pieces[i]).filter(Boolean);
  if (!pieces.length) return false;
  const b = bounds(pieces),
    s = CUSTOM_SIZES[def.size];
  // Anchor the group's north-west bounds on the grid. This preserves every
  // spacing and returns exactly to the original after four turns.
  const rotated = pieces.map((p) => ({
    ...p,
    x0: b.x0 + b.z1 - p.z1,
    x1: b.x0 + b.z1 - p.z0,
    z0: b.z0 + p.x0 - b.x0,
    z1: b.z0 + p.x1 - b.x0,
    ...(p.dir
      ? { dir: { "-z": "+x", "+x": "+z", "+z": "-x", "-x": "-z" }[p.dir] }
      : {}),
    // A window measured from a north–south wall's z0 end would flip: its
    // start end becomes x1, so measure it from the other end.
    ...(p.win && p.z1 - p.z0 > p.x1 - p.x0
      ? {
          win: {
            ...p.win,
            x0: p.z1 - p.z0 - p.win.x1,
            x1: p.z1 - p.z0 - p.win.x0,
          },
        }
      : {}),
  }));
  const r = bounds(rotated);
  if (r.x1 - r.x0 > 2 * s.x || r.z1 - r.z0 > 2 * s.z) return false;
  const dx = r.x0 < -s.x ? -s.x - r.x0 : r.x1 > s.x ? s.x - r.x1 : 0;
  const dz = r.z0 < -s.z ? -s.z - r.z0 : r.z1 > s.z ? s.z - r.z1 : 0;
  rotated.forEach((p, i) =>
    Object.assign(pieces[i], p, {
      x0: p.x0 + dx,
      x1: p.x1 + dx,
      z0: p.z0 + dz,
      z1: p.z1 + dz,
    }),
  );
  return true;
}

export function playtestPoint(def, point, compiledMap = null) {
  const s = CUSTOM_SIZES[def.size],
    r = PLAYER_RADIUS;
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.z) ||
    Math.abs(point.x) > s.x - r ||
    Math.abs(point.z) > s.z - r
  )
    return null;
  const map = compiledMap || buildCustomMap(def),
    touch = (w) => overlapsFootprint(w, point.x, point.z, r);
  const desired = Number.isFinite(point.y) ? point.y : Infinity;
  const heights = [
    0,
    ...map.walls
      .filter((w) => ["platform", "cover", "ramp"].includes(w.kind) && touch(w))
      .map((w) => w.h),
  ];
  const y = [...new Set(heights)].sort(
    (a, b) => Math.abs(a - desired) - Math.abs(b - desired) || b - a,
  )[0];
  if (y === undefined) return null;
  if (
    map.walls.some(
      (w) => touch(w) && w.h - y > STEP && (w.bottom || 0) < y + 1.8,
    )
  )
    return null;
  return { x: point.x, z: point.z, y };
}

export function clearanceIssues(def) {
  const issues = [],
    pieces = def.pieces,
    s = CUSTOM_SIZES[def.size];
  const add = (kind, rect, text, indices) =>
    issues.push({ kind, ...rect, text, indices });
  // Only warn about actual open slivers. Joined/overlapping pieces are valid.
  for (let i = 0; i < pieces.length; i++) {
    const a = pieces[i];
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j];
      if (
        Math.min(pieceTop(a), pieceTop(b)) -
          Math.max(pieceBase(a), pieceBase(b)) <=
        0.01
      )
        continue;
      const z0 = Math.max(a.z0, b.z0),
        z1 = Math.min(a.z1, b.z1),
        x0 = Math.max(a.x0, b.x0),
        x1 = Math.min(a.x1, b.x1);
      const left = a.x1 <= b.x0 ? a : b,
        right = left === a ? b : a;
      if (
        z1 > z0 &&
        right.x0 - left.x1 > 0 &&
        right.x0 - left.x1 < PLAYER_WIDTH
      )
        add(
          "gap",
          { x0: left.x1, x1: right.x0, z0, z1 },
          `Gap between pieces ${i + 1} and ${j + 1} is ${(right.x0 - left.x1).toFixed(2)} m; player needs ${PLAYER_WIDTH} m.`,
          [i, j],
        );
      const near = a.z1 <= b.z0 ? a : b,
        far = near === a ? b : a;
      if (x1 > x0 && far.z0 - near.z1 > 0 && far.z0 - near.z1 < PLAYER_WIDTH)
        add(
          "gap",
          { x0, x1, z0: near.z1, z1: far.z0 },
          `Gap between pieces ${i + 1} and ${j + 1} is ${(far.z0 - near.z1).toFixed(2)} m; player needs ${PLAYER_WIDTH} m.`,
          [i, j],
        );
    }
    for (const [gap, rect] of [
      [a.x0 + s.x, { x0: -s.x, x1: a.x0, z0: a.z0, z1: a.z1 }],
      [s.x - a.x1, { x0: a.x1, x1: s.x, z0: a.z0, z1: a.z1 }],
      [a.z0 + s.z, { x0: a.x0, x1: a.x1, z0: -s.z, z1: a.z0 }],
      [s.z - a.z1, { x0: a.x0, x1: a.x1, z0: a.z1, z1: s.z }],
    ])
      if (gap > 0 && gap < PLAYER_WIDTH)
        add(
          "gap",
          rect,
          `Piece ${i + 1} leaves a ${gap.toFixed(2)} m gap against the map edge.`,
          [i],
        );
    const type = PIECE_TYPES[a.t];
    if (!type.ramp) continue;
    const along = a.dir.endsWith("z"),
      width = along ? a.x1 - a.x0 : a.z1 - a.z0,
      length = along ? a.z1 - a.z0 : a.x1 - a.x0;
    if (width < PLAYER_WIDTH)
      add("ramp", a, `Ramp ${i + 1} is too narrow (${width.toFixed(2)} m).`, [
        i,
      ]);
    if ((pieceHeight(a) / length) * PLAYER_WIDTH > STEP)
      add("ramp", a, `Ramp ${i + 1} is steep; test its approach and landing.`, [
        i,
      ]);
    const end = { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 };
    if (a.dir === "+x") end.x = a.x1 + PLAYER_RADIUS;
    else if (a.dir === "-x") end.x = a.x0 - PLAYER_RADIUS;
    else if (a.dir === "+z") end.z = a.z1 + PLAYER_RADIUS;
    else end.z = a.z0 - PLAYER_RADIUS;
    const landing = {
      x0: end.x - PLAYER_RADIUS,
      x1: end.x + PLAYER_RADIUS,
      z0: end.z - PLAYER_RADIUS,
      z1: end.z + PLAYER_RADIUS,
    };
    if (
      Math.abs(end.x) > s.x - PLAYER_RADIUS ||
      Math.abs(end.z) > s.z - PLAYER_RADIUS ||
      pieces.some(
        (b, j) =>
          j !== i &&
          pieceTop(b) > pieceTop(a) + STEP &&
          pieceBase(b) < pieceTop(a) + 1.8 &&
          b.x0 < landing.x1 &&
          b.x1 > landing.x0 &&
          b.z0 < landing.z1 &&
          b.z1 > landing.z0,
      )
    )
      add("ramp", landing, `Ramp ${i + 1} has a blocked upper landing.`, [i]);
  }
  return issues;
}

export function surfaceElevation(def, point, exclude = []) {
  let y = 0;
  def.pieces.forEach((p, i) => {
    if (
      !exclude.includes(i) &&
      point.x >= p.x0 &&
      point.x <= p.x1 &&
      point.z >= p.z0 &&
      point.z <= p.z1
    )
      y = Math.max(y, pieceSurface(p, point.x, point.z));
  });
  return Math.round(y * 10) / 10;
}
export function elevatePieces(def, indices, delta) {
  const pieces = indices.map((i) => def.pieces[i]).filter(Boolean);
  if (!pieces.length || !Number.isFinite(delta)) return false;
  const change = Math.round(delta * 10) / 10;
  if (
    !change ||
    pieces.some(
      (p) =>
        pieceBase(p) + change < 0 || pieceTop(p) + change > MAX_BUILD_HEIGHT,
    )
  )
    return false;
  pieces.forEach((p) => (p.y = Math.round((pieceBase(p) + change) * 10) / 10));
  return true;
}
export function stackPieces(def, indices, rise) {
  const originals = indices.map((i) => def.pieces[i]).filter(Boolean);
  if (
    !originals.length ||
    def.pieces.length + originals.length > MAX_PIECES ||
    !Number.isFinite(rise) ||
    rise <= 0
  )
    return null;
  const temp = { ...def, pieces: originals.map((p) => ({ ...p })) };
  if (
    !elevatePieces(
      temp,
      originals.map((_, i) => i),
      rise,
    )
  )
    return null;
  const start = def.pieces.length;
  temp.pieces.forEach((p) => delete p.id);
  def.pieces.push(...temp.pieces);
  if (originals.some((p) => p.id)) ensurePieceIds(def);
  return temp.pieces.map((_, i) => start + i);
}
