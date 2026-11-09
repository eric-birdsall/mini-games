import * as T from "three";
import { animateAvatar, createAvatar, releaseAvatar } from "./avatars.js";
// A little pizza kitchen seen from the front. The dough, a pot of marinara
// and the oven sit on a counter along the back wall; a long island along the
// front holds the pizza pan, the cheese and four topping bowls. Your critter,
// in a chef's hat, walks the aisle between them and uses whatever it's
// standing next to. The customer stands at the left end holding up a
// picture of the pizza they'd like.

const COUNTER_TOP = 1;
const BACK_Z = -1.95; // the back counter's middle
const FRONT_Z = 1.6; // the island's middle
const WALL_Z = -2.75;
// The aisle the chef walks: x and z limits.
const AISLE = { left: -6.1, right: 6.1, back: -0.75, front: 0.3 };
const CHEF_SPEED = 3.8;
const CHEF_SCALE = 1.12;
// How close the chef has to be to use something: along the counter, and
// out from the counter's edge.
const REACH_X = 0.95;
const REACH_Z = 0.8;
const CUSTOMER_X = -7.5;
const CUSTOMER_Z = 1.7;
const OFFSTAGE_X = -12.5;
const LOOK = new T.Vector3(-0.5, 0.9, -0.2);
const VIEW_HALF_WIDTH = 8.5;
const VIEW_HALF_HEIGHT = 4;

// Where each station sits on the counter (x).
const BACK_X = { dough: -4.3, sauce: -1.2, oven: 2.9 };
const FRONT_X = [-5.1, -3.1, -1.1, 0.9, 2.9, 4.9];

// Colours for the pizza as it bakes: raw, golden (ready), dark, burnt.
const BROWNING = {
  dough: ["#f3e1bf", "#e2b06c", "#a8682f", "#30251f"],
  cheese: ["#fff2b0", "#ffcf4a", "#d08a2a", "#3a2a1c"],
  sauce: ["#d6452f", "#c23a26", "#8a2a1c", "#2e1f1a"],
};
const shade = (list, d) => {
  const i = Math.min(2, Math.floor(d));
  return new T.Color(list[i]).lerp(
    new T.Color(list[i + 1]),
    Math.min(1, d - i),
  );
};

const ease = (t) => 1 - (1 - t) ** 3;

// Tiles for the back wall.
function tiles() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#cfe9e2";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#fff9ee";
  g.fillRect(2, 2, 28, 28);
  g.fillRect(34, 34, 28, 28);
  g.fillStyle = "#e3f4ee";
  g.fillRect(34, 2, 28, 28);
  g.fillRect(2, 34, 28, 28);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function checker() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f3e6cf";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#e4c9a1";
  g.fillRect(0, 0, 32, 32);
  g.fillRect(32, 32, 32, 32);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// --- Little models ------------------------------------------------------------
// Every builder returns a fresh group so the thumbnail renderer can build
// its own copy.

function kit() {
  const mats = new Map();
  const mat = (color, roughness = 0.6, extra = {}) => {
    const key = `${color}-${roughness}-${JSON.stringify(extra)}`;
    if (!mats.has(key))
      mats.set(key, new T.MeshStandardMaterial({ color, roughness, ...extra }));
    return mats.get(key);
  };
  const geo = {
    round: new T.SphereGeometry(1, 20, 14),
    half: new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    disc: new T.CylinderGeometry(1, 1, 1, 28),
    box: new T.BoxGeometry(1, 1, 1),
    cone: new T.ConeGeometry(1, 1, 16),
    ring: new T.TorusGeometry(1, 0.28, 10, 28),
  };
  function mesh(g, material, x = 0, y = 0, z = 0, parent) {
    const m = new T.Mesh(g, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent?.add(m);
    return m;
  }
  const part = (g, material, [x, y, z], [sx, sy, sz], parent) => {
    const m = mesh(g, material, x, y, z, parent);
    m.scale.set(sx, sy, sz);
    return m;
  };

  // Toppings, about 0.12 across, sitting on y = 0.
  const toppingModels = {
    pepperoni(p) {
      part(
        geo.disc,
        mat("#c2352b", 0.55),
        [0, 0.012, 0],
        [0.11, 0.022, 0.11],
        p,
      );
      for (const [x, z] of [
        [0.04, 0.02],
        [-0.03, -0.04],
        [-0.02, 0.05],
      ])
        part(geo.disc, mat("#e8a090"), [x, 0.024, z], [0.015, 0.004, 0.015], p);
    },
    mushrooms(p) {
      part(geo.half, mat("#c9a27a", 0.7), [0, 0.06, 0], [0.09, 0.07, 0.09], p);
      part(geo.disc, mat("#f4e7d2", 0.8), [0, 0.03, 0], [0.04, 0.06, 0.04], p);
    },
    olives(p) {
      const o = part(
        geo.ring,
        mat("#2b2b2b", 0.3),
        [0, 0.02, 0],
        [0.06, 0.06, 0.08],
        p,
      );
      o.rotation.x = Math.PI / 2;
    },
    // A ring of green pepper.
    peppers(p) {
      const r = part(
        geo.ring,
        mat("#3f9a3a", 0.4),
        [0, 0.02, 0],
        [0.09, 0.09, 0.06],
        p,
      );
      r.rotation.x = Math.PI / 2;
    },
    // A chunk of pineapple: pale and juicy with an orange edge, so it
    // stands out on the cheese.
    pineapple(p) {
      const c = new T.Group();
      part(geo.box, mat("#fff6b8", 0.3), [0, 0.06, 0], [0.15, 0.1, 0.12], c);
      part(
        geo.box,
        mat("#f08a1c", 0.5),
        [0, 0.06, -0.065],
        [0.155, 0.1, 0.02],
        c,
      );
      c.rotation.y = 0.4;
      p.add(c);
    },
  };
  function topping(id) {
    const g = new T.Group();
    toppingModels[id](g);
    return g;
  }

  // A pizza as it's being made. `parts` lets the game show each bit as it
  // goes on (crust, sauce, cheese, each topping) and brown it as it bakes;
  // `parts.toppings[id]` are that topping's spots, in counting order.
  function dish(order) {
    const g = new T.Group();
    const parts = { toppings: {} };
    const foodMats = [];
    const brownable = (list) => {
      const m = new T.MeshStandardMaterial({ color: list[0], roughness: 0.65 });
      foodMats.push([m, list]);
      return m;
    };
    const food = new T.Group();
    g.add(food);
    parts.food = food;
    const crust = brownable(BROWNING.dough);
    part(geo.disc, crust, [0, 0.04, 0], [0.78, 0.08, 0.78], food);
    const rim = part(geo.ring, crust, [0, 0.08, 0], [0.72, 0.72, 0.4], food);
    rim.rotation.x = Math.PI / 2;
    parts.sauce = part(
      geo.disc,
      brownable(BROWNING.sauce),
      [0, 0.085, 0],
      [0.66, 0.012, 0.66],
      g,
    );
    const cheese = new T.Group();
    const cheeseMat = brownable(BROWNING.cheese);
    part(geo.disc, cheeseMat, [0, 0.095, 0], [0.45, 0.016, 0.45], cheese);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 0.12 + (i % 3) * 0.12;
      part(
        geo.round,
        cheeseMat,
        [Math.cos(a) * r, 0.1, Math.sin(a) * r],
        [0.08, 0.02, 0.06],
        cheese,
      );
    }
    g.add(cheese);
    parts.cheese = cheese;
    const top = 0.105;

    // Spots for the counted toppings: in a ring across the pizza (with one
    // in the middle when there are lots), each kind kept together so it's
    // easy to count in the picture.
    const n = order.toppings.reduce((sum, t) => sum + t.count, 0);
    const middle = n >= 4 && order.toppings.length === 1;
    const ringN = middle ? n - 1 : n;
    const spots = [];
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + Math.PI / 2;
      spots.push(new T.Vector3(Math.cos(a) * 0.42, top, Math.sin(a) * 0.42));
    }
    if (middle) spots.push(new T.Vector3(0, top, 0));
    let next = 0;
    for (const { topping: id, count } of order.toppings) {
      parts.toppings[id] = [];
      for (let i = 0; i < count; i++) {
        const spot = spots[next++];
        const t = topping(id);
        t.position.copy(spot);
        t.rotation.y = spot.x * 7;
        // Big enough to count at a glance in the picture.
        t.scale.setScalar(1.5);
        g.add(t);
        parts.toppings[id].push(t);
      }
    }
    parts.allToppings = Object.values(parts.toppings).flat();
    parts.brown = (d) => {
      for (const [m, list] of foodMats) m.color.copy(shade(list, d));
    };
    return {
      group: g,
      parts,
      dispose: () => foodMats.forEach(([m]) => m.dispose()),
    };
  }

  return {
    mat,
    geo,
    mesh,
    part,
    topping,
    dish,
    dispose: () => {
      for (const m of mats.values()) m.dispose();
      for (const g of Object.values(geo)) g.dispose();
    },
  };
}

export function createPerfectPizzaScene(canvas, avatar) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new T.Scene();
  scene.background = new T.Color("#cfe9e2");
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 80);
  camera.position.set(LOOK.x, 8.2, 11);
  camera.lookAt(LOOK);

  scene.add(new T.HemisphereLight("#fffaf0", "#c9a77c", 1.9));
  const sun = new T.DirectionalLight("#fff3dc", 2.2);
  sun.position.set(-3, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 1024);
  Object.assign(sun.shadow.camera, {
    left: -10,
    right: 10,
    top: 6,
    bottom: -4,
  });
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const K = kit();
  const { mat, geo, part, mesh } = K;

  // --- The room -----------------------------------------------------------------
  const floorTex = checker();
  floorTex.repeat.set(16, 8);
  const floor = mesh(
    new T.PlaneGeometry(40, 20),
    new T.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
    0,
    0,
    2,
    scene,
  );
  floor.rotation.x = -Math.PI / 2;
  const wallTex = tiles();
  wallTex.repeat.set(20, 6);
  mesh(
    new T.PlaneGeometry(40, 12),
    new T.MeshStandardMaterial({ map: wallTex, roughness: 0.8 }),
    0,
    6,
    WALL_Z,
    scene,
  );
  // A shelf with jars and a window with a sunny view.
  part(geo.box, mat("#b9875a"), [-3, 3.4, -2.5], [5, 0.12, 0.5], scene);
  const jarColors = ["#f7c1d4", "#ffe08a", "#bfe3a8", "#b9d7f5", "#f5b98a"];
  jarColors.forEach((c, i) => {
    part(
      geo.disc,
      mat(c, 0.4),
      [-5 + i * 1, 3.75, -2.45],
      [0.22, 0.55, 0.22],
      scene,
    );
    part(
      geo.disc,
      mat("#ffffff", 0.4),
      [-5 + i * 1, 4.07, -2.45],
      [0.24, 0.1, 0.24],
      scene,
    );
  });
  part(geo.box, mat("#ffffff"), [4, 3.9, -2.71], [3.2, 2.2, 0.06], scene);
  part(
    geo.box,
    mat("#9fd8ff", 0.2, { emissive: "#9fd8ff", emissiveIntensity: 0.25 }),
    [4, 3.9, -2.65],
    [2.9, 1.9, 0.04],
    scene,
  );
  part(geo.box, mat("#ffffff"), [4, 3.9, -2.61], [0.1, 1.9, 0.04], scene);
  part(geo.box, mat("#ffffff"), [4, 3.9, -2.61], [2.9, 0.1, 0.04], scene);

  // --- The counter -------------------------------------------------------------
  const COUNTER_LEFT = -6.6;
  const COUNTER_RIGHT = 6.4;
  const counterW = COUNTER_RIGHT - COUNTER_LEFT;
  const counterX = (COUNTER_LEFT + COUNTER_RIGHT) / 2;
  // The back counter against the wall and the island in front, with the
  // aisle between.
  for (const z of [BACK_Z, FRONT_Z]) {
    part(
      geo.box,
      mat("#7cc4b5", 0.7),
      [counterX, COUNTER_TOP / 2, z],
      [counterW, COUNTER_TOP - 0.08, 1.5],
      scene,
    );
    part(
      geo.box,
      mat("#f2d7a8", 0.6),
      [counterX, COUNTER_TOP - 0.04, z],
      [counterW + 0.2, 0.08, 1.65],
      scene,
    );
  }
  for (let x = COUNTER_LEFT + 0.95; x < COUNTER_RIGHT; x += 1.9) {
    part(
      geo.box,
      mat("#92d1c3", 0.7),
      [x, 0.48, FRONT_Z + 0.76],
      [1.7, 0.72, 0.02],
      scene,
    );
    part(
      geo.round,
      mat("#f6f1e4", 0.4),
      [x, 0.7, FRONT_Z + 0.8],
      [0.06, 0.06, 0.04],
      scene,
    );
  }

  // The bin, for burnt food.
  const bin = new T.Group();
  bin.position.set(7.35, 0, FRONT_Z);
  part(
    new T.CylinderGeometry(0.45, 0.38, 1.1, 20),
    mat("#7d8fa3", 0.5),
    [0, 0.55, 0],
    [1, 1, 1],
    bin,
  );
  part(geo.disc, mat("#5f7085", 0.5), [0, 1.12, 0], [0.48, 0.06, 0.48], bin);
  scene.add(bin);
  const binTop = new T.Vector3(7.35, 1.2, FRONT_Z);

  // --- Stations ----------------------------------------------------------------
  // id -> {group, x, z, anchor (where food sits), wiggle, ...}
  const stations = new Map();
  function station(id, x, z) {
    const g = new T.Group();
    g.position.set(x, COUNTER_TOP, z);
    g.userData.station = id;
    scene.add(g);
    const s = {
      id,
      group: g,
      x,
      z,
      wiggle: 0,
      anchor: new T.Vector3(x, COUNTER_TOP, z),
      lift: 0.5,
    };
    stations.set(id, s);
    return s;
  }

  // The dough: a floury wooden board with a ball of dough (and more waiting
  // behind it, so there's always another).
  const dough = station("dough", BACK_X.dough, BACK_Z);
  part(
    geo.box,
    mat("#c99862", 0.7),
    [0, 0.05, 0],
    [1.6, 0.1, 1.1],
    dough.group,
  );
  part(
    geo.disc,
    mat("#fbf6ec", 0.95),
    [0.1, 0.105, 0.05],
    [0.6, 0.01, 0.45],
    dough.group,
  );
  for (const [x, z] of [
    [-0.45, -0.3],
    [0.45, -0.32],
  ])
    part(
      geo.round,
      mat("#f3e1bf", 0.75),
      [x, 0.25, z],
      [0.26, 0.17, 0.25],
      dough.group,
    );
  dough.ball = part(
    geo.round,
    mat("#f3e1bf", 0.75),
    [0, 0.33, 0.12],
    [0.38, 0.25, 0.36],
    dough.group,
  );
  dough.lift = 0.7;
  // A rolling pin beside it.
  const pin = part(
    geo.disc,
    mat("#e0b47e", 0.6),
    [0.95, 0.16, 0.3],
    [0.09, 0.9, 0.09],
    dough.group,
  );
  pin.rotation.z = Math.PI / 2;
  pin.rotation.y = 0.5;

  // A pot of marinara with a big spoon in it.
  const sauce = station("sauce", BACK_X.sauce, BACK_Z);
  part(
    geo.disc,
    mat("#c8452f", 0.45),
    [0, 0.32, 0],
    [0.62, 0.64, 0.62],
    sauce.group,
  );
  part(
    geo.disc,
    mat("#e25a40", 0.4),
    [0, 0.65, 0],
    [0.66, 0.04, 0.66],
    sauce.group,
  );
  part(
    geo.disc,
    mat("#b52a1a", 0.55),
    [0, 0.63, 0],
    [0.56, 0.02, 0.56],
    sauce.group,
  );
  for (const side of [-1, 1])
    part(
      geo.box,
      mat("#2b2b2b", 0.5),
      [side * 0.72, 0.5, 0],
      [0.18, 0.08, 0.2],
      sauce.group,
    );
  const spoon = new T.Group();
  part(geo.disc, mat("#a9784a", 0.6), [0, 0.45, 0], [0.04, 0.9, 0.04], spoon);
  part(geo.round, mat("#a9784a", 0.6), [0, 0, 0], [0.12, 0.04, 0.16], spoon);
  // The sauce in its bowl, shown while it's carried.
  spoon.userData.full = part(
    geo.round,
    mat("#c8331f", 0.4),
    [0, 0.03, 0],
    [0.1, 0.035, 0.13],
    spoon,
  );
  spoon.userData.full.visible = false;
  sauce.spoon = spoon;
  function homeSpoon() {
    scene.remove(spoon);
    spoon.userData.full.visible = false;
    spoon.position.set(0.2, 0.6, 0.05);
    spoon.rotation.set(0, 0, -0.45);
    sauce.group.add(spoon);
  }
  homeSpoon();
  sauce.lift = 1;

  // A bag of flour at the end of the counter.
  part(
    geo.box,
    mat("#f6f1e4", 0.9),
    [-5.95, COUNTER_TOP + 0.4, BACK_Z - 0.2],
    [0.6, 0.8, 0.45],
    scene,
  );
  part(
    geo.box,
    mat("#4f9ad6", 0.6),
    [-5.95, COUNTER_TOP + 0.4, BACK_Z + 0.03],
    [0.45, 0.25, 0.01],
    scene,
  );

  // A countertop oven with a window, a door handle and dials.
  const oven = station("oven", BACK_X.oven, BACK_Z - 0.15);
  part(geo.box, mat("#f2b33d", 0.5), [0, 0.85, 0], [2.6, 1.7, 1.5], oven.group);
  // The door, hinged along its bottom edge so it can swing open.
  const door = new T.Group();
  door.position.set(-0.35, 0.22, 0.76);
  oven.group.add(door);
  oven.door = door;
  part(geo.box, mat("#2c2620", 0.6), [0, 0.58, -0.04], [1.7, 1.15, 0.08], door);
  const ovenGlow = new T.MeshStandardMaterial({
    color: "#3a2e24",
    roughness: 0.2,
    transparent: true,
    opacity: 0.55,
    emissive: "#ff7a1a",
    emissiveIntensity: 0,
  });
  part(geo.box, ovenGlow, [0, 0.58, 0.01], [1.5, 0.95, 0.02], door);
  part(
    geo.box,
    mat("#e8e2d8", 0.3, { metalness: 0.4 }),
    [0, 1.06, 0.1],
    [1.5, 0.1, 0.1],
    door,
  );
  oven.open = 0; // seconds left with the door open
  for (const y of [1.2, 0.8, 0.4])
    part(
      geo.disc,
      mat("#fff6e4", 0.4),
      [0.9, y, 0.76],
      [0.14, 0.06, 0.14],
      oven.group,
    ).rotation.x = Math.PI / 2;
  // Inside, the rack the food sits on (seen through the window).
  part(
    geo.box,
    mat("#888888", 0.4),
    [-0.35, 0.42, 0.2],
    [1.5, 0.03, 0.8],
    oven.group,
  );
  oven.anchor.set(oven.x - 0.35, COUNTER_TOP + 0.44, oven.z + 0.2);
  oven.heat = ovenGlow;
  oven.lift = 1.9;
  oven.inside = true;

  // Front-row items, rebuilt for each order.
  const frontBuilders = {
    // A round metal pizza pan.
    pan(g, s) {
      part(
        geo.disc,
        mat("#b9c0c8", 0.35, { metalness: 0.5 }),
        [0, 0.03, 0],
        [0.9, 0.06, 0.9],
        g,
      );
      const lip = part(
        geo.ring,
        mat("#a3abb5", 0.35, { metalness: 0.5 }),
        [0, 0.06, 0],
        [0.88, 0.88, 0.15],
        g,
      );
      lip.rotation.x = Math.PI / 2;
      s.anchor.set(s.x, COUNTER_TOP + 0.06, s.z);
      return 0.7;
    },
    cheese(g) {
      bowlOf(g, "#ffffff", () => {
        const c = new T.Group();
        for (let i = 0; i < 26; i++) {
          const a = i * 2.39;
          const r = Math.sqrt((i + 0.5) / 26) * 0.42;
          const s = part(
            geo.box,
            mat("#ffd84a", 0.5),
            [Math.cos(a) * r, 0.36 + (i % 3) * 0.03, Math.sin(a) * r],
            [0.22, 0.04, 0.05],
            c,
          );
          s.rotation.y = a * 1.7;
        }
        return c;
      });
      return 0.9;
    },
  };
  function bowlOf(g, color, filling) {
    const m = mat(color, 0.35);
    m.side = T.DoubleSide;
    part(
      new T.SphereGeometry(1, 22, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      m,
      [0, 0.38, 0],
      [0.55, 0.38, 0.55],
      g,
    );
    part(geo.disc, m, [0, 0.02, 0], [0.26, 0.04, 0.26], g);
    g.add(filling());
  }
  const BOWL_COLORS = ["#ffe9a8", "#cdeccf", "#d6e8ff", "#ffd6e0"];
  function toppingBowl(g, id, i) {
    bowlOf(g, BOWL_COLORS[i % BOWL_COLORS.length], () => {
      const pile = new T.Group();
      const n = 11;
      for (let k = 0; k < n; k++) {
        const a = k * 2.39;
        const r = Math.sqrt((k + 0.5) / n) * 0.36;
        const t = K.topping(id);
        t.position.set(Math.cos(a) * r, 0.3 + (k % 3) * 0.03, Math.sin(a) * r);
        t.rotation.set((k % 3) * 0.3, a, (k % 2) * 0.3);
        t.scale.setScalar(1.3);
        pile.add(t);
      }
      return pile;
    });
    return 0.9;
  }

  let frontIds = [];
  function clearFront() {
    for (const id of frontIds) {
      const s = stations.get(id);
      if (!s) continue;
      scene.remove(s.group);
      stations.delete(id);
    }
    frontIds = [];
  }

  // --- Your chef and the customer -------------------------------------------------
  const chef = createAvatar("attacker", avatar, false);
  chef.scale.setScalar(CHEF_SCALE);
  chef.position.set(-3, 0, -0.2);
  scene.add(chef);
  const hat = new T.Group();
  part(geo.disc, mat("#ffffff", 0.7), [0, 0.12, 0], [0.24, 0.24, 0.24], hat);
  part(geo.round, mat("#ffffff", 0.7), [0, 0.32, 0], [0.32, 0.2, 0.32], hat);
  hat.visible = false;
  chef.add(hat);
  let chefCheer = 0;
  // Walking: the held direction (x, z, each -1..1), or a spot to walk to.
  const move = new T.Vector2();
  let walkTarget = null;
  // Critters face -z at rotation 0 (away from the camera), so a heading
  // (x, z) is rotation atan2(-x, -z).
  let facing = 0; // toward the back counter
  // What the chef is carrying to the pan: the dough, the sauce spoon or a
  // handful of cheese.
  let carried = null;
  let carriedItem = null;
  const carryPoint = () =>
    carriedItem === "pizza"
      ? new T.Vector3(chef.position.x, 1.3, chef.position.z + 0.55)
      : new T.Vector3(chef.position.x + 0.35, 1.55, chef.position.z + 0.25);
  function handful() {
    const g = new T.Group();
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39;
      const r = Math.sqrt((i + 0.5) / 12) * 0.16;
      const s = part(
        geo.box,
        mat("#ffd84a", 0.5),
        [Math.cos(a) * r, (i % 3) * 0.03, Math.sin(a) * r],
        [0.16, 0.035, 0.04],
        g,
      );
      s.rotation.y = a * 1.7;
    }
    return g;
  }
  function dropCarried() {
    if (carried === current?.group) {
      // newDish() clears the pizza itself.
    } else if (carried === sauce.spoon) homeSpoon();
    else if (carried) scene.remove(carried);
    carried = null;
    carriedItem = null;
  }

  // Where the chef stands to use a station, and whether it can now.
  function reachPoint(s) {
    const x = s.id === "oven" ? s.x - 0.35 : s.x;
    return new T.Vector2(
      Math.max(AISLE.left, Math.min(AISLE.right, x)),
      s.z < 0 ? AISLE.back : AISLE.front,
    );
  }
  function inReach() {
    let best = null;
    let bestScore = Infinity;
    for (const s of stations.values()) {
      const at = reachPoint(s);
      const dx = Math.abs(chef.position.x - at.x);
      const dz = Math.abs(chef.position.z - at.y);
      const wide = s.id === "oven" ? 1.35 : REACH_X;
      if (dx > wide || dz > REACH_Z) continue;
      const score = dx / wide + dz / REACH_Z;
      if (score < bestScore) {
        bestScore = score;
        best = s.id;
      }
    }
    return best;
  }

  let customer = null;
  let customerTarget = CUSTOMER_X;
  let customerCheer = 0;
  let leaving = null;
  const sign = new T.Group();
  const signTexture = new T.Texture();
  signTexture.colorSpace = T.SRGBColorSpace;
  part(geo.box, mat("#b9875a"), [0, 0.9, 0], [0.06, 1.8, 0.06], sign);
  part(geo.box, mat("#ffffff", 0.7), [0, 2.15, 0], [1.25, 1.25, 0.05], sign);
  const signFace = mesh(
    new T.PlaneGeometry(1.1, 1.1),
    new T.MeshBasicMaterial({ map: signTexture }),
    0,
    2.15,
    0.03,
    sign,
  );
  signFace.castShadow = false;
  scene.add(sign);

  // --- The dish being made ---------------------------------------------------------
  let order = null;
  let current = null; // {group, parts, dispose}
  let dishAt = "pan";
  let dishPan = null; // the pizza pan on the island

  // Things flying across the kitchen: {obj, from, to, t, time, arc, spin,
  // done, tip}
  const flyers = [];
  function fly(
    obj,
    from,
    to,
    {
      time = 0.55,
      arc = 1,
      done,
      spin = 0,
      parent = scene,
      shrink = false,
    } = {},
  ) {
    parent.add(obj);
    obj.position.copy(from);
    flyers.push({
      obj,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      time,
      arc,
      done,
      spin,
      shrink,
      base: obj.scale.clone(),
    });
  }
  // Puffs of smoke and sparkles.
  const puffs = [];
  function puff(at, color, count = 8, rise = 1.2, size = 0.25) {
    for (let i = 0; i < count; i++) {
      const p = new T.Mesh(
        geo.round,
        new T.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      p.position
        .copy(at)
        .add(
          new T.Vector3(
            (Math.random() - 0.5) * 0.6,
            Math.random() * 0.2,
            (Math.random() - 0.5) * 0.4,
          ),
        );
      p.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      p.userData = {
        v: new T.Vector3(
          (Math.random() - 0.5) * 0.6,
          rise * (0.6 + Math.random() * 0.6),
          0,
        ),
        life: 1 + Math.random() * 0.6,
        size: p.scale.x,
      };
      scene.add(p);
      puffs.push(p);
    }
  }
  const confettiColors = [
    "#ff5d8f",
    "#ffd23f",
    "#3ec1ff",
    "#7be36b",
    "#b57bff",
  ];
  function sparkle(at) {
    for (let i = 0; i < 26; i++) {
      const p = new T.Mesh(
        new T.PlaneGeometry(0.14, 0.09),
        new T.MeshBasicMaterial({
          color: confettiColors[i % 5],
          side: T.DoubleSide,
          transparent: true,
        }),
      );
      p.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      p.userData = {
        v: new T.Vector3(
          Math.cos(a) * 2.5,
          4 + Math.random() * 3,
          Math.sin(a) * 1.5,
        ),
        life: 1.3 + Math.random() * 0.4,
        spin: Math.random() * 9,
        confetti: true,
      };
      scene.add(p);
      puffs.push(p);
    }
  }

  function anchorOf(where) {
    return stations.get(where)?.anchor.clone() ?? new T.Vector3();
  }
  function placeDish(where) {
    dishAt = where;
    current.group.position.copy(anchorOf(where));
    scene.add(current.group);
  }
  const topOfDish = () =>
    current.group.position.clone().add(new T.Vector3(0, 0.3, 0));

  function newDish(o) {
    if (current) {
      scene.remove(current.group);
      current.dispose();
    }
    current = K.dish(o);
    const p = current.parts;
    p.food.visible = p.sauce.visible = p.cheese.visible = false;
    for (const t of p.allToppings) t.visible = false;
    p.brown(0);
    placeDish("pan");
  }

  // Pop something in: scale from nothing with a little overshoot.
  const pops = [];
  function popIn(obj, time = 0.35) {
    obj.visible = true;
    const to = obj.scale.clone();
    obj.scale.setScalar(0.001);
    pops.push({ obj, to, t: 0, time });
  }

  // --- Rings and highlights ---------------------------------------------------
  const ringGeometry = new T.RingGeometry(0.8, 0.95, 48);
  const makeRing = (color) => {
    const ring = new T.Mesh(
      ringGeometry,
      new T.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    return ring;
  };
  const hintRing = makeRing("#ffd23f");
  const cursorRing = makeRing("#2a7fff");
  let hinted = null;
  let cursored = null;

  // --- Picking ------------------------------------------------------------------
  const ray = new T.Raycaster();
  const floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const pointer = new T.Vector2();
  const screenPoint = new T.Vector3();
  function toScreen(v) {
    screenPoint.copy(v).project(camera);
    return {
      x: ((screenPoint.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - screenPoint.y) / 2) * canvas.clientHeight,
    };
  }
  function stationAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    scene.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    const targets = [...stations.values()].map((s) => s.group);
    if (current) targets.push(current.group);
    const hit = ray.intersectObjects(targets, true)[0];
    if (hit) {
      for (let o = hit.object; o; o = o.parent) {
        if (o === current?.group) return dishAt;
        if (o.userData.station) return o.userData.station;
      }
    }
    // Nothing hit: the nearest station's middle, within reach (generous
    // for small fingers).
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Math.max(50, rect.width * 0.05);
    for (const s of stations.values()) {
      const at = toScreen(new T.Vector3(s.x, COUNTER_TOP + s.lift * 0.5, s.z));
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  // --- Fitting the view -----------------------------------------------------------
  const size = new T.Vector2();
  function fit() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    renderer.getSize(size);
    if (width !== size.x || height !== size.y) {
      const aspect = width / height;
      const distance = camera.position.distanceTo(LOOK);
      const tanHalf = Math.max(
        VIEW_HALF_HEIGHT / distance,
        VIEW_HALF_WIDTH / (aspect * distance),
      );
      camera.fov = T.MathUtils.radToDeg(2 * Math.atan(tanHalf));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    return true;
  }

  // --- Drawing ------------------------------------------------------------------
  let clock = 0;
  let heat = { station: null, level: 0 };
  function draw(dt) {
    if (!fit()) return;
    clock += dt;

    // The chef walks the aisle: held direction, else toward a tapped spot.
    const was = chef.position.clone();
    let vx = move.x;
    let vz = move.y;
    if (!vx && !vz && walkTarget) {
      const tx = walkTarget.x - chef.position.x;
      const tz = walkTarget.y - chef.position.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.05) walkTarget = null;
      else {
        const k = Math.min(1, d / (CHEF_SPEED * Math.max(dt, 1e-3)));
        vx = (tx / d) * k;
        vz = (tz / d) * k;
      }
    }
    const len = Math.hypot(vx, vz);
    if (len > 1) {
      vx /= len;
      vz /= len;
    }
    chef.position.x = Math.max(
      AISLE.left,
      Math.min(AISLE.right, chef.position.x + vx * CHEF_SPEED * dt),
    );
    chef.position.z = Math.max(
      AISLE.back,
      Math.min(AISLE.front, chef.position.z + vz * CHEF_SPEED * dt),
    );
    const moved = chef.position.distanceTo(was);
    const walking = moved > 1e-4;
    if (walking) facing = Math.atan2(-vx, -vz);
    else {
      // Standing still: face what's in reach.
      const near = stations.get(inReach());
      if (near) facing = near.z < 0 ? 0 : Math.PI;
    }
    let turn = facing - chef.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    chef.rotation.y += turn * Math.min(1, dt * 12);
    chefCheer = Math.max(0, chefCheer - dt);
    if (carried && !flyers.some((f) => f.obj === carried)) {
      carried.position.copy(carryPoint());
      // The pizza is held flat; everything else tipped a little.
      carried.rotation.z = carriedItem === "pizza" ? 0 : -0.4;
    }
    // The oven door swings open while you use it.
    oven.open = Math.max(0, oven.open - dt);
    const doorTo = oven.open > 0 ? 1.35 : 0;
    oven.door.rotation.x +=
      (doorTo - oven.door.rotation.x) * Math.min(1, dt * 7);
    animateAvatar(
      chef,
      { moveSpeed: walking ? moved / Math.max(dt, 1e-3) : 0 },
      dt,
      chefCheer > 0 && !walking ? "win" : undefined,
    );
    if (!hat.visible && chef.userData.critter) {
      // Sit the hat on top of the critter's head once it has loaded.
      const box = new T.Box3().setFromObject(chef.userData.critter.pivot);
      hat.position.y = (box.max.y - chef.position.y) / CHEF_SCALE - 0.12;
      hat.visible = true;
    }

    // The customer walks in, cheers, and walks off with the food.
    for (const who of [customer, leaving]) {
      if (!who) continue;
      const target = who === customer ? customerTarget : OFFSTAGE_X;
      const d = target - who.position.x;
      const move = Math.sign(d) * Math.min(Math.abs(d), dt * 4.2);
      who.position.x += move;
      const moving = Math.abs(d) > 0.05;
      const face = moving ? -Math.sign(d) * Math.PI * 0.5 : Math.PI + 0.5;
      const spin = face - who.rotation.y;
      who.rotation.y +=
        Math.atan2(Math.sin(spin), Math.cos(spin)) * Math.min(1, dt * 8);
      animateAvatar(
        who,
        { moveSpeed: moving ? 2 : 0 },
        dt,
        who === customer && customerCheer > 0 && !moving ? "win" : undefined,
      );
      if (who === leaving && Math.abs(d) < 0.1) {
        releaseAvatar(leaving);
        scene.remove(leaving);
        for (const c of leaving.userData.carry ?? []) scene.remove(c);
        leaving = null;
      }
    }
    customerCheer = Math.max(0, customerCheer - dt);
    if (customer) {
      sign.visible =
        Math.abs(customer.position.x - customerTarget) < 0.3 &&
        customerCheer <= 0;
      sign.position.set(
        customer.position.x + 0.85,
        0,
        customer.position.z + 0.15,
      );
      sign.rotation.y = 0.35;
      sign.position.y = Math.sin(clock * 2) * 0.03;
    } else sign.visible = false;
    if (leaving?.userData.carry)
      for (const c of leaving.userData.carry)
        c.position.set(
          leaving.position.x + 0.1,
          1.45,
          leaving.position.z + 0.6,
        );

    // Flyers.
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      const t = Math.min(1, f.t / f.time);
      const e = ease(t);
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(t * Math.PI) * f.arc;
      if (f.spin) f.obj.rotation.y += f.spin * dt;
      if (f.shrink)
        f.obj.scale.copy(f.base).multiplyScalar(Math.max(0.001, 1 - t));
      if (t >= 1) {
        flyers.splice(i, 1);
        f.done?.(f.obj);
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      const g = Math.min(1, p.t / p.time);
      p.obj.scale
        .copy(p.to)
        .multiplyScalar(Math.max(0.001, g * (1 + Math.sin(g * Math.PI) * 0.3)));
      if (g >= 1) {
        p.obj.scale.copy(p.to);
        pops.splice(i, 1);
      }
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      const d = p.userData;
      d.life -= dt;
      if (d.confetti) {
        d.v.y -= 12 * dt;
        p.position.addScaledVector(d.v, dt * 0.6);
        p.rotation.x += d.spin * dt;
        p.rotation.y += d.spin * dt;
        p.material.opacity = Math.min(1, d.life * 2);
      } else {
        p.position.addScaledVector(d.v, dt);
        p.scale.setScalar(d.size * (1 + (1.6 - d.life) * 0.9));
        p.material.opacity = Math.max(0, Math.min(0.7, d.life * 0.6));
      }
      if (d.life <= 0) {
        scene.remove(p);
        p.material.dispose();
        if (d.confetti) p.geometry.dispose();
        puffs.splice(i, 1);
      }
    }

    // Wiggles: "over here!"
    for (const s of stations.values()) {
      s.wiggle = Math.max(0, s.wiggle - dt);
      const w = s.wiggle;
      s.group.rotation.z = Math.sin(w * 30) * w * 0.25;
      const hop = s.id === hinted ? Math.abs(Math.sin(clock * 5)) * 0.12 : 0;
      s.group.position.y =
        COUNTER_TOP + hop + Math.max(0, Math.sin(w * 15)) * w * 0.3;
    }
    for (const [ring, id, pulse] of [
      [hintRing, hinted, 6],
      [cursorRing, cursored, 3],
    ]) {
      const s = stations.get(id);
      ring.visible = Boolean(s);
      if (!s) continue;
      const r = id === "oven" ? 1.6 : 0.9;
      ring.position.set(
        s.id === "oven" ? s.x - 0.35 : s.x,
        COUNTER_TOP + 0.01,
        s.z + (s.id === "oven" ? 0.5 : 0),
      );
      ring.scale.setScalar(r * (1 + Math.sin(clock * pulse) * 0.05));
      ring.material.opacity = 0.75 + Math.sin(clock * pulse) * 0.2;
    }

    // Heat: the oven window glows while it bakes.
    const on = heat.station === "oven" ? heat.level : 0;
    oven.heat.emissiveIntensity +=
      ((on ? 0.6 + Math.sin(clock * 8) * 0.1 : 0) -
        oven.heat.emissiveIntensity) *
      Math.min(1, dt * 6);
    // A wisp of steam while it cooks, smoke when it's getting too hot.
    if (
      heat.station &&
      current &&
      Math.random() < dt * (heat.level > 1 ? 9 : 3)
    )
      puff(
        current.group.position
          .clone()
          .add(new T.Vector3(0, heat.station === "oven" ? 1.3 : 0.3, 0)),
        heat.level > 1 ? "#5a524c" : "#ffffff",
        1,
        0.9,
        0.16,
      );

    renderer.render(scene, camera);
  }

  // --- The order picture -------------------------------------------------------------
  let thumbRenderer;
  function thumbnail(o) {
    thumbRenderer ||= new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    thumbRenderer.setSize(420, 420, false);
    thumbRenderer.outputColorSpace = T.SRGBColorSpace;
    const ts = new T.Scene();
    ts.add(new T.HemisphereLight("#fffaf0", "#c9a77c", 2.2));
    const light = new T.DirectionalLight("#fff3dc", 2);
    light.position.set(-2, 5, 4);
    ts.add(light);
    const made = K.dish(o);
    made.parts.brown(1);
    const holder = new T.Group();
    holder.add(made.group);
    ts.add(holder);
    const sphere = new T.Box3()
      .setFromObject(holder)
      .getBoundingSphere(new T.Sphere());
    const cam = new T.PerspectiveCamera(30, 1, 0.05, 50);
    const distance =
      (sphere.radius * 0.88) / Math.sin(T.MathUtils.degToRad(15));
    const angle = T.MathUtils.degToRad(62);
    cam.position
      .set(0, Math.sin(angle), Math.cos(angle))
      .multiplyScalar(distance)
      .add(sphere.center);
    cam.lookAt(sphere.center);
    thumbRenderer.render(ts, cam);
    made.dispose();
    return thumbRenderer.domElement.toDataURL("image/png");
  }

  const observer = new ResizeObserver(() => fit());
  observer.observe(canvas);

  return {
    // Lay out the counter for an order: front[i] is a station id (or null).
    setOrder(o, front, picture) {
      order = o;
      clearFront();
      hinted = cursored = null;
      dropCarried();
      dough.ball.visible = true;
      front.forEach((id, i) => {
        if (!id) return;
        const s = station(id, FRONT_X[i], FRONT_Z);
        const builder = frontBuilders[id];
        s.lift = builder ? builder(s.group, s, o) : toppingBowl(s.group, id, i);
        frontIds.push(id);
        popIn(s.group, 0.3 + i * 0.04);
      });
      dishPan = stations.get("pan");
      newDish(o);
      const img = new Image();
      img.onload = () => {
        signTexture.image = img;
        signTexture.needsUpdate = true;
      };
      img.src = picture;
    },
    // A new customer walks in from the left.
    customerIn(choice) {
      if (customer) this.customerOut();
      customer = createAvatar("attacker", choice, false);
      customer.scale.setScalar(CHEF_SCALE);
      customer.position.set(OFFSTAGE_X, 0, CUSTOMER_Z);
      customerTarget = CUSTOMER_X;
      scene.add(customer);
    },
    customerOut() {
      if (!customer) return;
      if (leaving) {
        releaseAvatar(leaving);
        scene.remove(leaving);
        for (const c of leaving.userData.carry ?? []) scene.remove(c);
      }
      leaving = customer;
      customer = null;
    },
    thumbnail,
    stationAt,
    stationIds: () => [...stations.keys()],
    // Where a station is on screen (CSS px from the canvas corner), for the
    // keyboard ring and the cooking timer. `top` gives its top instead.
    screenOf(id, top = false) {
      const s = stations.get(id);
      if (!s) return null;
      const x = s.id === "oven" ? s.x - 0.35 : s.x;
      return toScreen(
        new T.Vector3(
          x,
          COUNTER_TOP + (top ? s.lift + 0.25 : s.lift * 0.5),
          s.z,
        ),
      );
    },
    // Held walking direction: x left/right, z back(-)/front(+).
    setMove(x, z) {
      move.set(x, z);
      if (x || z) walkTarget = null;
    },
    // Walk to a station (to stand in reach of it) or a tapped floor spot.
    walkTo(id) {
      const s = stations.get(id);
      if (s) walkTarget = reachPoint(s);
    },
    walkToScreen(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.ray.intersectPlane(floorPlane, new T.Vector3());
      if (hit)
        walkTarget = new T.Vector2(
          Math.max(AISLE.left, Math.min(AISLE.right, hit.x)),
          Math.max(AISLE.back, Math.min(AISLE.front, hit.z)),
        );
    },
    // The station the chef can use from where it stands, if any.
    reach: inReach,
    // Using a station: the oven door swings open for a moment.
    poke(id) {
      if (id === "oven") oven.open = 1.1;
    },
    cheer() {
      chefCheer = 1.6;
      customerCheer = 1.6;
    },
    wiggle(id) {
      const s = stations.get(id);
      if (s) s.wiggle = 0.6;
    },
    hint(id) {
      hinted = id;
    },
    cursor(id) {
      cursored = id;
    },

    // --- Steps, shown ----------------------------------------------------------
    // Picking up: the dough, a spoonful of sauce, a handful of cheese or the
    // pizza itself leaves where it was and the chef carries it. Nothing moves
    // on until the chef puts it down.
    pick(item) {
      const s = stations.get(item === "pizza" ? "pan" : item);
      if (!s) return;
      s.wiggle = 0.25;
      let thing;
      let start;
      if (item === "pizza") {
        thing = current.group;
        start = thing.position.clone();
        dishAt = null;
      } else if (item === "dough") {
        start = new T.Vector3().setFromMatrixPosition(dough.ball.matrixWorld);
        dough.ball.visible = false;
        thing = mesh(geo.round, mat("#f3e1bf", 0.75));
        thing.scale.set(0.3, 0.2, 0.28);
      } else if (item === "sauce") {
        // The big spoon comes out of the pot full of sauce.
        thing = sauce.spoon;
        start = new T.Vector3().setFromMatrixPosition(thing.matrixWorld);
        sauce.group.remove(thing);
        thing.userData.full.visible = true;
      } else {
        start = new T.Vector3(s.x, COUNTER_TOP + 0.45, s.z);
        thing = handful();
      }
      carried = thing;
      carriedItem = item;
      fly(thing, start, carryPoint(), { time: 0.35, arc: 0.3 });
    },
    // Putting it on the pan: the dough pats out flat, the sauce spreads, the
    // cheese sprinkles over.
    place(item) {
      const thing = carriedItem === item ? carried : null;
      carried = null;
      carriedItem = null;
      if (item === "baked") {
        // The baked pizza goes back on its pan, ready for the customer.
        const g = current.group;
        for (let i = flyers.length - 1; i >= 0; i--)
          if (flyers[i].obj === g) flyers.splice(i, 1);
        g.rotation.set(0, 0, 0);
        fly(g, g.position.clone(), anchorOf("pan"), {
          time: 0.4,
          arc: 0.4,
          done: () => (dishAt = "pan"),
        });
        return;
      }
      if (item === "pizza") {
        // Into the oven (its door is swinging open).
        const g = current.group;
        for (let i = flyers.length - 1; i >= 0; i--)
          if (flyers[i].obj === g) flyers.splice(i, 1);
        g.rotation.set(0, 0, 0);
        fly(g, g.position.clone(), anchorOf("oven"), {
          time: 0.5,
          arc: 0.4,
          done: () => (dishAt = "oven"),
        });
        return;
      }
      const part = {
        dough: current.parts.food,
        sauce: current.parts.sauce,
        cheese: current.parts.cheese,
      }[item];
      const done = () => {
        popIn(part, 0.45);
        if (item === "dough") popIn(dough.ball, 0.4);
        if (thing === sauce.spoon) {
          thing.rotation.z = -1.6;
          thing.userData.full.visible = false;
          setTimeout(() => homeSpoon(), 450);
        } else if (thing) scene.remove(thing);
      };
      if (!thing) return done();
      for (let i = flyers.length - 1; i >= 0; i--)
        if (flyers[i].obj === thing) flyers.splice(i, 1);
      const over = item === "sauce" ? 0.75 : 0.25;
      fly(
        thing,
        thing.position.clone(),
        anchorOf("pan").add(new T.Vector3(0, over, 0)),
        { time: 0.45, arc: 0.6, done },
      );
    },
    // The n-th (1-based) of a topping flies on.
    topping(id, n) {
      const s = stations.get(id);
      if (!s) return;
      s.wiggle = 0.25;
      const target = current.parts.toppings[id]?.[n - 1];
      if (!target) return;
      const t = K.topping(id);
      t.scale.setScalar(1.3);
      const to = current.group.position.clone().add(target.position);
      fly(t, new T.Vector3(s.x, COUNTER_TOP + 0.45, s.z), to, {
        time: 0.42,
        arc: 0.8,
        spin: 6,
        done: () => {
          scene.remove(t);
          popIn(target, 0.25);
          puff(
            to.clone().add(new T.Vector3(0, 0.1, 0)),
            "#fff6b0",
            3,
            0.6,
            0.06,
          );
        },
      });
    },
    // Out of the oven and into the chef's hands (put it on the pan with
    // place("baked")).
    take() {
      const g = current.group;
      for (let i = flyers.length - 1; i >= 0; i--)
        if (flyers[i].obj === g) flyers.splice(i, 1);
      carried = g;
      carriedItem = "pizza";
      dishAt = null;
      heat = { station: null, level: 0 };
      fly(g, g.position.clone(), carryPoint(), { time: 0.45, arc: 0.3 });
    },
    // Cooking: how browned (0–3, or null to leave it as it is) and how hot
    // (0 off, 1 on, 2 too hot).
    cooking(d, level) {
      if (!current) return;
      if (d != null) current.parts.brown(d);
      heat = { station: level ? dishAt : null, level };
    },
    burnt() {
      const g = current.group;
      puff(
        g.position
          .clone()
          .add(new T.Vector3(0, dishAt === "oven" ? 1.2 : 0.3, 0)),
        "#4a4440",
        14,
        1.4,
        0.3,
      );
      heat = { station: null, level: 0 };
      // Into the bin, then a fresh one ready to make again.
      const o = order;
      current = null;
      fly(g, g.position, binTop, {
        time: 0.8,
        arc: 2.2,
        spin: 8,
        shrink: true,
        done: () => {
          scene.remove(g);
          bin.rotation.z = 0.12;
          setTimeout(() => (bin.rotation.z = 0), 200);
        },
      });
      setTimeout(() => newDish(o), 900);
    },
    // The finished pizza, pan and all, goes to the customer.
    serve() {
      const g = current.group;
      for (let i = flyers.length - 1; i >= 0; i--)
        if (flyers[i].obj === g) flyers.splice(i, 1);
      sparkle(g.position.clone().add(new T.Vector3(0, 0.5, 0)));
      const pan = dishPan.group;
      const carry = new T.Group();
      carry.add(pan.clone());
      pan.visible = false;
      g.position.set(0, 0.06, 0);
      carry.add(g);
      const from = anchorOf("pan");
      current = null;
      const to = new T.Vector3(CUSTOMER_X + 0.1, 1.45, CUSTOMER_Z + 0.6);
      fly(carry, from, to, {
        time: 0.8,
        arc: 1.2,
        done: () => {
          if (customer) customer.userData.carry = [carry];
        },
      });
      carry.scale.setScalar(0.8);
      chefCheer = 1.8;
      customerCheer = 2.2;
    },
    draw,
    dispose() {
      observer.disconnect();
      for (const who of [chef, customer, leaving]) if (who) releaseAvatar(who);
      current?.dispose();
      scene.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material))
          node.material.forEach((m) => m.dispose());
        else node.material?.dispose();
      });
      K.dispose();
      floorTex.dispose();
      wallTex.dispose();
      signTexture.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      thumbRenderer?.dispose();
    },
  };
}
