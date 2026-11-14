// Small portraits of each character's head for the home menu, drawn one at
// a time with a shared off-screen renderer and cached as image URLs.
import * as T from "three";
import { createCritter, loadCritter } from "./avatars.js";

const SIZE = 112,
  cache = new Map();
let renderer = null,
  queue = Promise.resolve();

function draw(asset, fullBody) {
  renderer ||= new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0, 0);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0x5b4a73, 3));
  const light = new T.DirectionalLight(0xfff4e6, 3);
  light.position.set(-2, 4, -5);
  scene.add(light);
  const rig = createCritter(asset);
  rig.actions.idle?.play();
  rig.mixer.update(0);
  scene.add(rig.pivot);
  rig.pivot.updateMatrixWorld(true);

  // Chibi heads fill the top half of the figure; frame that, front on.
  const box = new T.Box3().setFromObject(rig.pivot, true),
    height = box.max.y - box.min.y,
    top = box.max.y,
    bottom = box.min.y + height * (fullBody ? 0 : 0.42),
    center = new T.Vector3(
      (box.min.x + box.max.x) / 2,
      (top + bottom) / 2,
      (box.min.z + box.max.z) / 2,
    ),
    span = Math.max(top - bottom, box.max.x - box.min.x) * 1.12,
    fitSpan = fullBody ? Math.max(span, (box.max.z - box.min.z) * 1.12) : span,
    distance = fitSpan / 2 / Math.tan(T.MathUtils.degToRad(13)),
    camera = new T.PerspectiveCamera(26, 1, distance / 100, distance * 10);
  camera.position
    .copy(center)
    .add(
      new T.Vector3(fullBody ? 0.42 : 0.12, fullBody ? 0.18 : 0.06, -1)
        .normalize()
        .multiplyScalar(distance),
    );
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  for (const skeleton of rig.skeletons) skeleton.dispose();
  rig.pivot.traverse((node) => {
    node.material?.dispose();
  });
  return url;
}

// Resolves to an image URL, or null if the model could not load.
export function headshot(id, fullBody = false, load = () => loadCritter(id)) {
  const key = fullBody ? `body:${id}` : id;
  if (!cache.has(key)) {
    const result = queue.then(async () => {
      const asset = await load();
      return asset ? draw(asset, fullBody) : null;
    });
    queue = result.catch(() => null);
    cache.set(key, queue);
  }
  return cache.get(key);
}
