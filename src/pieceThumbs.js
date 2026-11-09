// Small rendered pictures of library pieces and saved groups, drawn once
// with one shared off-screen renderer and cached as image URLs.
import * as T from "three";
import { PIECE_TYPES } from "../shared/customMap.js";
import { TYPE_COLORS } from "../shared/pieceCatalog.js";
import { builderPieceGeometry } from "./builderGeometry.js";

const SIZE = { w: 160, h: 112 },
  cache = new Map();
let renderer = null,
  queue = Promise.resolve();

// A preset as a piece at the origin: ramps and stairs climb north, and
// curves bend around the corner nearest the camera so their sweep shows.
export function presetPiece(p) {
  return {
    t: p.t,
    x0: 0,
    x1: p.w,
    z0: 0,
    z1: p.d,
    h: p.h,
    ...(PIECE_TYPES[p.t].dir
      ? { dir: PIECE_TYPES[p.t].shape === "arc" ? "-x" : "-z" }
      : {}),
  };
}
function draw(pieces) {
  renderer ||= new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(2);
  renderer.setSize(SIZE.w, SIZE.h, false);
  const scene = new T.Scene(),
    group = new T.Group();
  scene.add(new T.HemisphereLight("#ffffff", "#5a6168", 1.6));
  const sun = new T.DirectionalLight("#ffffff", 1.8);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  for (const p of pieces) {
    const geometry = builderPieceGeometry(p);
    if (!geometry) continue;
    const mesh = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({
        color: p.color || TYPE_COLORS[p.t],
        roughness: 0.8,
        transparent: PIECE_TYPES[p.t].see || (p.opacity ?? 1) < 1,
        opacity: Math.min(p.opacity ?? 1, 1),
      }),
    );
    mesh.position.set((p.x0 + p.x1) / 2, p.y ?? 0, (p.z0 + p.z1) / 2);
    group.add(mesh);
  }
  scene.add(group);
  // A three-quarter view from the south-east, framed to fit.
  const box = new T.Box3().setFromObject(group),
    sphere = box.getBoundingSphere(new T.Sphere()),
    r = Math.max(sphere.radius, 0.5),
    aspect = SIZE.w / SIZE.h,
    camera = new T.OrthographicCamera(
      -r * aspect,
      r * aspect,
      r,
      -r,
      0.1,
      r * 10,
    );
  camera.position
    .copy(sphere.center)
    .add(new T.Vector3(0.9, 0.85, 1.1).normalize().multiplyScalar(r * 4));
  camera.lookAt(sphere.center);
  camera.zoom = 1.08;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return url;
}
// Resolves to an image URL for these pieces; `key` names the picture.
export function thumbnail(key, pieces) {
  if (cache.has(key)) return cache.get(key);
  const result = (queue = queue.then(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          try {
            resolve(draw(pieces));
          } catch (error) {
            console.warn("Piece thumbnail:", error);
            resolve("");
          }
        }),
      ),
  ));
  cache.set(key, result);
  return result;
}
