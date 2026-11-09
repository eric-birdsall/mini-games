import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import colormap from "./assets/food/colormap.png";
import { layoutSpots, rng } from "../shared/foodFinder.js";

// Every Kenney food model points at Textures/colormap.png; serve them all
// the one bundled copy.
const MODEL_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob("./assets/food/*.glb", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([path, url]) => [path.match(/([^/]+)\.glb$/)[1], url]),
);

// The camera looks down at the blanket from this far above the horizon.
const TILT = T.MathUtils.degToRad(52);
// World units from the top to the bottom of the screen.
const VIEW = 10;
// A food's size, as a share of `cell` (the ring, hops and confetti go by
// the cell).
const FOOD_SIZE = 0.62;

const ease = (t) => 1 - (1 - t) ** 3;

function gingham() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  // Soft, so the foods stand out against it.
  g.fillStyle = "#fffaf2";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#f4b9bd88";
  g.fillRect(0, 0, 64, 128);
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#eea3a9";
  g.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter;
  texture.anisotropy = 4;
  return texture;
}

function lights(scene) {
  scene.add(new T.HemisphereLight("#fff8e8", "#6b8f4e", 1.6));
  const sun = new T.DirectionalLight("#fff2d6", 2.2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);
}

export function createFoodFinderScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.background = new T.Color("#8cc56a");
  lights(scene);

  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 30 * Math.sin(TILT), 30 * Math.cos(TILT));
  camera.lookAt(0, 0, 0);

  const blanketTexture = gingham();
  const blanket = new T.Mesh(
    new T.PlaneGeometry(1, 1),
    new T.MeshLambertMaterial({ map: blanketTexture }),
  );
  blanket.rotation.x = -Math.PI / 2;
  scene.add(blanket);

  // Soft dark spot under each food, and a ring for the hint / cursor.
  const shadowGeometry = new T.CircleGeometry(0.5, 32);
  const shadowMaterial = new T.MeshBasicMaterial({
    color: "#3a1d10",
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  const ringGeometry = new T.RingGeometry(0.42, 0.5, 48);
  const makeRing = (color) => {
    const ring = new T.Mesh(
      ringGeometry,
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    scene.add(ring);
    return ring;
  };
  const hintRing = makeRing("#ffe14d");
  const cursorRing = makeRing("#2a7fff");

  // Confetti for a find.
  const confetti = [];
  const confettiGeometry = new T.PlaneGeometry(0.14, 0.09);
  const confettiColors = [
    "#ff5d8f",
    "#ffd23f",
    "#3ec1ff",
    "#7be36b",
    "#b57bff",
  ];

  // Load every model once.
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) =>
    url.endsWith("colormap.png") ? colormap : url,
  );
  const loader = new GLTFLoader(manager);
  const templates = new Map();
  const ready = Promise.all(
    Object.entries(MODEL_URLS).map(([id, url]) =>
      loader
        .loadAsync(url)
        .then((gltf) => templates.set(id, normalize(gltf.scene)))
        .catch((error) => console.warn(`Food Finder: no ${id}`, error)),
    ),
  );

  // Centre a model on its footprint, sit it on y = 0 and scale it so its
  // biggest side is 1.
  function normalize(model) {
    const box = new T.Box3().setFromObject(model);
    const size = box.getSize(new T.Vector3());
    const centre = box.getCenter(new T.Vector3());
    const holder = new T.Group();
    model.position.set(-centre.x, -box.min.y, -centre.z);
    holder.add(model);
    // Tall things (bottles, cakes) look bigger than flat ones; weight height
    // a little less so a pizza isn't tiny beside a soda can.
    holder.userData.scale = 1 / Math.max(size.x, size.z, size.y * 0.85);
    holder.userData.height = size.y / Math.max(size.x, size.z, size.y * 0.85);
    return holder;
  }

  // Placed foods by slot: {id, root, spin, model, height, anim}.
  const slots = [];
  // Found foods on their way out.
  const leaving = [];
  let spots = [];
  let cell = 1;
  let area = { width: 1, depth: 1, top: 0 };
  let insetTop = 0;
  let insetBottom = 0;
  let time = 0;
  let hintSlot = -1;
  let cursorSlot = -1;

  function size() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = (-VIEW * aspect) / 2;
    camera.right = (VIEW * aspect) / 2;
    camera.top = VIEW / 2;
    camera.bottom = -VIEW / 2;
    camera.updateProjectionMatrix();
    // The ground seen by the screen.
    const groundW = VIEW * aspect;
    const groundD = VIEW / Math.sin(TILT);
    blanket.scale.set(groundW * 0.96, groundD * 0.96, 1);
    blanketTexture.repeat.set((groundW * 0.96) / 1.6, (groundD * 0.96) / 1.6);
    // Keep foods clear of the "Find…" card at the top, the basket at the
    // bottom and the edges.
    const top = (insetTop / height) * groundD;
    const bottom = (insetBottom / height) * groundD;
    const margin = Math.min(groundW, groundD) * 0.05;
    area = {
      width: groundW - margin * 2,
      depth: groundD - top - bottom - margin * 2.2,
      top: -groundD / 2 + top + margin * 1.6,
    };
    placeAll();
  }

  function spotWorld(index) {
    const spot = spots[index];
    return {
      x: spot.u * area.width - area.width / 2,
      z: area.top + spot.v * area.depth,
    };
  }

  function placeAll() {
    if (!spots.length) return;
    // The screen changed shape (a phone turned): scatter again to fit it.
    // Each food keeps its slot, only the spots move.
    const aspect = area.width / area.depth;
    if (Math.abs(Math.log(aspect / spots.aspect)) > 0.2)
      makeSpots(spots.length, spots.seed);
    // Foods shrink with the area; spots keep their relative place.
    const scale = Math.min(area.depth, area.width / spots.aspect);
    cell = (spots.size * scale) / FOOD_SIZE;
    slots.forEach((slot, index) => slot && position(slot, index));
  }

  function position(slot, index) {
    const { x, z } = spotWorld(index);
    const s = cell * FOOD_SIZE;
    slot.root.position.set(x, 0, z);
    slot.root.scale.setScalar(s);
    slot.radius = s * 0.62;
  }

  // Spots are kept as 0–1 fractions of the area.
  function makeSpots(count, seed) {
    const aspect = area.width / area.depth;
    const result = layoutSpots(count, aspect, 1, rng(seed));
    spots = result.spots.map((spot) => ({
      u: spot.x / aspect + 0.5,
      v: spot.z + 0.5,
    }));
    Object.assign(spots, {
      size: result.size,
      aspect,
      seed,
    });
  }

  function layout(count, random) {
    clear();
    makeSpots(count, (random() * 2 ** 32) >>> 0);
    placeAll();
  }

  function clear() {
    for (const slot of [...slots, ...leaving])
      if (slot) scene.remove(slot.root);
    slots.length = 0;
    leaving.length = 0;
    hintSlot = cursorSlot = -1;
  }

  function place(index, id, { drop = false } = {}) {
    const template = templates.get(id);
    if (!template) return;
    const root = new T.Group();
    const spin = new T.Group();
    const model = template.clone();
    model.scale.setScalar(template.userData.scale);
    // Turn each a little so they don't all face the same way.
    model.rotation.y = (Math.random() - 0.5) * 1.4;
    spin.add(model);
    const shadow = new T.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.setScalar(0.85);
    root.add(shadow, spin);
    scene.add(root);
    const slot = {
      id,
      root,
      spin,
      model,
      height: template.userData.height,
      anim: drop ? { kind: "drop", t: 0 } : null,
    };
    slots[index] = slot;
    position(slot, index);
    if (drop) spin.position.y = 6;
  }

  // A found food leaves its slot at once (a new one can drop in while it
  // celebrates) and is animated on its own until it's gone.
  function found(index) {
    const slot = slots[index];
    if (!slot) return;
    slot.anim = { kind: "found", t: 0 };
    slots[index] = null;
    leaving.push(slot);
    const { x, z } = spotWorld(index);
    for (let i = 0; i < 40; i++) {
      const piece = new T.Mesh(
        confettiGeometry,
        new T.MeshBasicMaterial({
          color: confettiColors[i % confettiColors.length],
          side: T.DoubleSide,
          transparent: true,
        }),
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      piece.position.set(x, cell * 0.5, z);
      piece.userData = {
        v: new T.Vector3(
          Math.cos(angle) * speed,
          5 + Math.random() * 4,
          Math.sin(angle) * speed,
        ),
        spin: new T.Vector3(Math.random() * 9, Math.random() * 9, 0),
        life: 1.4 + Math.random() * 0.4,
      };
      piece.scale.setScalar(cell * 0.9);
      scene.add(piece);
      confetti.push(piece);
    }
    if (hintSlot === index) hint(-1);
  }

  function wiggle(index) {
    const slot = slots[index];
    if (slot && !slot.anim) slot.anim = { kind: "wiggle", t: 0 };
  }

  function hint(index) {
    hintSlot = index;
  }

  function cursor(index) {
    cursorSlot = index;
  }

  // The slot under a tap: the model itself, else the food whose upright
  // middle line on screen is nearest, within reach (generous, for small
  // fingers and thin foods like carrots).
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Foods placed since the last frame have no world matrix yet.
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const live = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot);
    let best = -1;
    let bestDistance = Infinity;
    for (const { slot, index } of live) {
      const hit = raycaster.intersectObject(slot.model, true)[0];
      if (hit && hit.distance < bestDistance) {
        bestDistance = hit.distance;
        best = index;
      }
    }
    if (best >= 0) return best;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pxPerUnit = rect.height / VIEW;
    bestDistance = cell * FOOD_SIZE * 0.75 * pxPerUnit;
    for (const { slot, index } of live) {
      const base = toScreen(slot.root.position, 0, rect);
      const top = toScreen(
        slot.root.position,
        slot.height * cell * FOOD_SIZE,
        rect,
      );
      const distance = segmentDistance(x, y, base, top);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  function toScreen(position, lift, rect) {
    const at = position.clone();
    at.y += lift;
    at.project(camera);
    return {
      x: ((at.x + 1) / 2) * rect.width,
      y: ((1 - at.y) / 2) * rect.height,
    };
  }

  function segmentDistance(x, y, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
      : 0;
    return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
  }

  // Where a slot's food is on screen, in CSS pixels from the canvas corner.
  function screenOf(index) {
    const slot = slots[index];
    if (!slot) return null;
    return toScreen(
      slot.root.position,
      slot.height * cell * FOOD_SIZE * 0.5,
      canvas.getBoundingClientRect(),
    );
  }

  function animate(slot, index, dt) {
    const anim = slot.anim;
    slot.spin.rotation.set(0, 0, 0);
    slot.spin.position.y = 0;
    slot.spin.scale.setScalar(1);
    if (index >= 0 && index === hintSlot) {
      // Hop, hop: "here I am!"
      const hop = Math.abs(Math.sin(time * 5));
      slot.spin.position.y = hop * 0.35;
      slot.spin.scale.setScalar(1 + hop * 0.08);
    }
    if (!anim) return;
    anim.t += dt;
    if (anim.kind === "drop") {
      const t = Math.min(anim.t / 0.55, 1);
      // Fall, then a small bounce.
      slot.spin.position.y =
        t < 0.75
          ? 6 * (1 - (t / 0.75) ** 2)
          : Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.18;
      if (t >= 1) slot.anim = null;
    } else if (anim.kind === "wiggle") {
      const t = Math.min(anim.t / 0.6, 1);
      slot.spin.rotation.z = Math.sin(t * Math.PI * 5) * 0.28 * (1 - t);
      if (t >= 1) slot.anim = null;
    } else if (anim.kind === "found") {
      const t = Math.min(anim.t / 1.1, 1);
      // Up, a happy spin, then shrink away.
      slot.spin.position.y =
        Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5) * 1.4;
      slot.spin.rotation.y = ease(t) * Math.PI * 4;
      slot.spin.scale.setScalar(
        t < 0.6
          ? 1 + Math.sin((t / 0.6) * Math.PI) * 0.45
          : 1 - ease((t - 0.6) / 0.4),
      );
      slot.root.children[0].visible = t < 0.6;
      if (t >= 1) {
        scene.remove(slot.root);
        leaving.splice(leaving.indexOf(slot), 1);
      }
    }
  }

  function draw(dt) {
    time += dt;
    slots.forEach((slot, index) => slot && animate(slot, index, dt));
    for (const slot of [...leaving]) animate(slot, -1, dt);
    for (const [ring, index, pulse] of [
      [hintRing, hintSlot, 6],
      [cursorRing, cursorSlot, 3],
    ]) {
      const slot = slots[index];
      ring.visible = Boolean(slot);
      if (!slot) continue;
      ring.position.x = slot.root.position.x;
      ring.position.z = slot.root.position.z;
      ring.scale.setScalar(
        cell * FOOD_SIZE * 1.3 * (1 + Math.sin(time * pulse) * 0.06),
      );
      ring.material.opacity = 0.75 + Math.sin(time * pulse) * 0.2;
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const piece = confetti[i];
      const data = piece.userData;
      data.life -= dt;
      data.v.y -= 14 * dt;
      piece.position.addScaledVector(data.v, dt * cell * 0.5);
      piece.rotation.x += data.spin.x * dt;
      piece.rotation.y += data.spin.y * dt;
      piece.material.opacity = Math.min(1, data.life * 2);
      if (data.life <= 0) {
        scene.remove(piece);
        piece.material.dispose();
        confetti.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
  }

  // A picture of one food for the "Find…" card.
  let thumbRenderer;
  const thumbScene = new T.Scene();
  lights(thumbScene);
  const thumbCamera = new T.PerspectiveCamera(30, 1, 0.1, 50);
  const thumbs = new Map();
  // Trim the empty edges so the food fills the card's picture.
  function cropToFood(source) {
    const { width, height } = source;
    const flat = document.createElement("canvas");
    flat.width = width;
    flat.height = height;
    const g = flat.getContext("2d");
    g.drawImage(source, 0, 0);
    const pixels = g.getImageData(0, 0, width, height).data;
    let x0 = width,
      y0 = height,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (pixels[(y * width + x) * 4 + 3] > 8) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    if (x1 < 0) return flat.toDataURL("image/png");
    const side = Math.max(x1 - x0, y1 - y0) * 1.1;
    const out = document.createElement("canvas");
    out.width = out.height = 200;
    out
      .getContext("2d")
      .drawImage(
        flat,
        (x0 + x1 - side) / 2,
        (y0 + y1 - side) / 2,
        side,
        side,
        0,
        0,
        200,
        200,
      );
    return out.toDataURL("image/png");
  }
  function thumbnail(id) {
    if (thumbs.has(id)) return thumbs.get(id);
    const template = templates.get(id);
    if (!template) return "";
    thumbRenderer ||= new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    thumbRenderer.setSize(400, 400, false);
    thumbRenderer.outputColorSpace = T.SRGBColorSpace;
    const model = template.clone();
    model.scale.setScalar(template.userData.scale);
    model.rotation.y = -0.4;
    thumbScene.add(model);
    // Fill the frame: aim at the food's middle from the blanket's angle,
    // just far enough back for its bounding sphere.
    const sphere = new T.Box3()
      .setFromObject(model)
      .getBoundingSphere(new T.Sphere());
    const distance =
      (sphere.radius * 1.08) / Math.sin(T.MathUtils.degToRad(15));
    const angle = T.MathUtils.degToRad(35);
    thumbCamera.position
      .set(0, Math.sin(angle), Math.cos(angle))
      .multiplyScalar(distance)
      .add(sphere.center);
    thumbCamera.lookAt(sphere.center);
    thumbRenderer.render(thumbScene, thumbCamera);
    thumbScene.remove(model);
    const url = cropToFood(thumbRenderer.domElement);
    thumbs.set(id, url);
    return url;
  }

  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  size();

  return {
    ready,
    layout,
    place,
    found,
    wiggle,
    hint,
    cursor,
    pick,
    screenOf,
    thumbnail,
    draw,
    // Screen space (CSS px) the overlays take at the top and bottom.
    setInsets(top, bottom) {
      insetTop = top;
      insetBottom = bottom;
      size();
    },
    get slotCount() {
      return spots.length;
    },
    slotFood: (index) => slots[index]?.id ?? null,
    dispose() {
      observer.disconnect();
      clear();
      for (const piece of confetti) piece.material.dispose();
      blanketTexture.dispose();
      renderer.dispose();
      thumbRenderer?.dispose();
    },
  };
}
