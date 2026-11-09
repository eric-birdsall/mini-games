import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { pieceBase, partsOf } from "../shared/customMap.js";

// One part (see shared/pieceShapes.js) as geometry, in world coordinates.
function partGeometry(part) {
  if (part.k === "cyl")
    return new T.CylinderGeometry(
      part.r,
      part.r,
      part.y1 - part.y0,
      28,
    ).translate(part.x, (part.y0 + part.y1) / 2, part.z);
  if (part.k === "arc") {
    // An elliptical quarter ring, extruded up from y0.
    const shape = new T.Shape(),
      steps = 24,
      at = (rx, rz, i) => {
        const a = part.a0 + ((part.a1 - part.a0) * i) / steps;
        return [rx * Math.cos(a), rz * Math.sin(a)];
      };
    shape.moveTo(...at(part.rx, part.rz, 0));
    for (let i = 1; i <= steps; i++) shape.lineTo(...at(part.rx, part.rz, i));
    for (let i = steps; i >= 0; i--)
      shape.lineTo(...at(part.rx - part.t, part.rz - part.t, i));
    return new T.ExtrudeGeometry(shape, {
      depth: part.y1 - part.y0,
      bevelEnabled: false,
    })
      .rotateX(Math.PI / 2)
      .translate(part.cx, part.y1, part.cz);
  }
  const w = part.x1 - part.x0,
    h = part.y1 - part.y0,
    d = part.z1 - part.z0,
    geo = new T.BoxGeometry(w, h, d);
  if (part.k === "slope") {
    const a = geo.attributes.position;
    for (let n = 0; n < a.count; n++) {
      const fraction =
        part.dir === "+x"
          ? a.getX(n) / w + 0.5
          : part.dir === "-x"
            ? 0.5 - a.getX(n) / w
            : part.dir === "+z"
              ? a.getZ(n) / d + 0.5
              : 0.5 - a.getZ(n) / d;
      a.setY(n, a.getY(n) > 0 ? h * fraction : 0);
    }
    geo.computeVertexNormals();
    return geo.translate(
      (part.x0 + part.x1) / 2,
      part.y0,
      (part.z0 + part.z1) / 2,
    );
  }
  return geo.translate(
    (part.x0 + part.x1) / 2,
    (part.y0 + part.y1) / 2,
    (part.z0 + part.z1) / 2,
  );
}
// Parts merged into one geometry, shifted so `origin` is (0, 0, 0).
export function partsGeometry(parts, origin = { x: 0, y: 0, z: 0 }) {
  if (!parts.length) return null;
  const geometries = parts.map((part) => {
    const g = partGeometry(part);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.deleteAttribute("uv");
    return flat;
  });
  const merged =
    geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  if (geometries.length > 1) for (const g of geometries) g.dispose();
  return merged.translate(-origin.x, -origin.y, -origin.z);
}
// What a piece looks like (its drawn parts, not collision-only ones), relative
// to the centre of its footprint at its base: the editor's ghost shape.
export function builderPieceGeometry(p, roles = null) {
  const parts = partsOf(p).filter(
    (part) => !part.hidden && (!roles || roles(part.role)),
  );
  return partsGeometry(parts, {
    x: (p.x0 + p.x1) / 2,
    y: pieceBase(p),
    z: (p.z0 + p.z1) / 2,
  });
}
