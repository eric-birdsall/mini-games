// Pure edit transforms and walk collision for the in-world builder.
import {
  CUSTOM_SIZES,
  MAX_BUILD_HEIGHT,
  PIECE_TYPES,
  pieceBase,
  pieceTop,
  validateCustomMap,
} from "./customMap.js";
const grid = (v) => Math.round(v * 2) / 2;
const tenth = (v) => Math.round(v * 10) / 10;
export function worldPiece(def, tool, point, options) {
  if (!PIECE_TYPES[tool] || !point) return null;
  let width = Number(options.width),
    depth = Number(options.depth),
    h = Number(options.height);
  if (
    ![width, depth, h, point.x, point.y, point.z].every(Number.isFinite) ||
    width < 0.5 ||
    depth < 0.5 ||
    width > 40 ||
    depth > 76 ||
    h < 0.1 ||
    h > 12
  )
    return null;
  const rotation = (options.rotation || 0) % 4;
  if (rotation % 2) [width, depth] = [depth, width];
  const x0 = grid(point.x - width / 2),
    z0 = grid(point.z - depth / 2),
    y = tenth(point.y);
  const p = {
    t: tool,
    x0,
    x1: x0 + grid(width),
    z0,
    z1: z0 + grid(depth),
    y,
    h: tenth(h),
    ...(PIECE_TYPES[tool].dir
      ? { dir: ["-z", "+x", "+z", "-x"][rotation] }
      : {}),
    ...(options.color ? { color: options.color } : {}),
    ...(options.opacity < 1 ? { opacity: options.opacity } : {}),
  };
  const s = CUSTOM_SIZES[def.size];
  if (
    p.x0 < -s.x ||
    p.x1 > s.x ||
    p.z0 < -s.z ||
    p.z1 > s.z ||
    y < 0 ||
    pieceTop(p) > MAX_BUILD_HEIGHT
  )
    return null;
  return p;
}
export function moveWorldSelection(def, indices, delta) {
  if (!indices.length || ![delta.x, delta.y, delta.z].every(Number.isFinite))
    return null;
  const next = structuredClone(def),
    s = CUSTOM_SIZES[def.size];
  for (const i of indices) {
    const p = next.pieces[i];
    if (!p) return null;
    p.x0 += grid(delta.x);
    p.x1 += grid(delta.x);
    p.z0 += grid(delta.z);
    p.z1 += grid(delta.z);
    p.y = tenth(pieceBase(p) + delta.y);
    if (
      p.x0 < -s.x ||
      p.x1 > s.x ||
      p.z0 < -s.z ||
      p.z1 > s.z ||
      p.y < 0 ||
      pieceTop(p) > MAX_BUILD_HEIGHT
    )
      return null;
  }
  if (validateCustomMap(next).error) return null;
  return next;
}
