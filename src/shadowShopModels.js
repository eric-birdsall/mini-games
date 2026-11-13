import * as T from "three";

const material = (color, metalness = 0) =>
  new T.MeshStandardMaterial({ color, metalness, roughness: 0.38 });

function add(group, geometry, finish, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, finish);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function rod(group, from, to, radius, finish) {
  const start = new T.Vector3(...from);
  const end = new T.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = add(
    group,
    new T.CylinderGeometry(radius, radius, direction.length(), 14),
    finish,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    direction.normalize(),
  );
}

function oval(group, finish, position, scale) {
  const mesh = add(group, new T.SphereGeometry(1, 24, 16), finish, ...position);
  mesh.scale.set(...scale);
  return mesh;
}

function plate(group, points, finish, holes) {
  const shape = new T.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) {
    if (point.length === 4) shape.quadraticCurveTo(...point);
    else shape.lineTo(...point);
  }
  shape.closePath();
  for (const [x, y, radius] of holes) {
    const hole = new T.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  add(
    group,
    new T.ExtrudeGeometry(shape, {
      depth: 0.13,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 2,
    }),
    finish,
  ).position.z = -0.065;
}

function makeObjects() {
  const brass = material("#e5a34c", 0.45);
  const teal = material("#42988e");
  const wood = material("#b77843");
  const orange = material("#e77b48");
  const ribbon = material("#db6394");
  const blue = material("#5f9fd3");
  const cream = material("#ffdd9d");
  const pieces = {};
  function prop(id, finish, profile, holes = []) {
    const group = new T.Group();
    pieces[id] = group;
    if (profile) plate(group, profile, finish, holes);
    return group;
  }

  // A serrated comb and a little scoop form a hedgehog in profile.
  const comb = prop("comb", teal, [
    [-0.64, -0.15],
    [-0.72, 0.19],
    [-0.52, 0.12],
    [-0.58, 0.46],
    [-0.34, 0.31],
    [-0.31, 0.63],
    [-0.11, 0.4],
    [0.02, 0.67],
    [0.16, 0.4],
    [0.38, 0.55],
    [0.38, 0.29],
    [0.59, 0.33],
    [0.51, 0.05],
    [0.68, -0.16],
    [0.45, -0.4, -0.3, -0.37],
    [-0.58, -0.37, -0.64, -0.15],
  ]);
  for (const x of [-0.37, 0.31]) {
    oval(comb, teal, [x, -0.34, 0], [0.14, 0.13, 0.08]);
  }
  const scoop = prop("scoop", brass, [
    [-0.51, -0.26],
    [-0.55, 0.27, -0.22, 0.3],
    [0.07, 0.36, 0.2, 0.12],
    [0.35, -0.02, 0.53, -0.05],
    [0.56, -0.21, 0.3, -0.3],
    [-0.18, -0.36, -0.51, -0.26],
  ]);
  oval(scoop, brass, [-0.16, -0.03, 0.02], [0.23, 0.24, 0.14]);

  // Two loop handles become ears above a crouching rabbit.
  const ears = prop("handles", ribbon);
  oval(ears, ribbon, [-0.18, -0.2, 0], [0.37, 0.3, 0.21]);
  oval(ears, ribbon, [-0.32, 0.28, 0], [0.13, 0.44, 0.1]).rotation.z = 0.2;
  oval(ears, ribbon, [-0.04, 0.33, 0.05], [0.12, 0.47, 0.09]).rotation.z =
    -0.26;
  const cushion = prop("cushion", cream);
  oval(cushion, cream, [0.14, -0.02, 0], [0.61, 0.47, 0.24]).rotation.z = -0.23;
  oval(cushion, cream, [-0.34, -0.34, 0.06], [0.35, 0.12, 0.13]);
  oval(cushion, cream, [0.69, 0.03, 0.01], [0.17, 0.17, 0.14]);

  const bow = prop("bow", blue);
  for (const side of [-1, 1]) {
    oval(bow, blue, [side * 0.52, 0.23, 0], [0.55, 0.28, 0.13]).rotation.z =
      side * 0.45;
    oval(bow, blue, [side * 0.41, -0.22, 0.02], [0.42, 0.23, 0.12]).rotation.z =
      -side * 0.35;
  }
  const clip = prop("clip", brass);
  oval(clip, brass, [0, -0.14, 0], [0.12, 0.48, 0.09]);
  oval(clip, brass, [0, 0.22, 0], [0.16, 0.19, 0.12]);
  for (const side of [-1, 1]) {
    rod(clip, [side * 0.07, 0.28, 0], [side * 0.39, 0.71, 0.02], 0.036, brass);
    oval(clip, brass, [side * 0.39, 0.71, 0.02], [0.067, 0.061, 0.055]);
  }

  prop(
    "crest",
    brass,
    [
      [-0.51, 0.47],
      [-0.23, 0.27],
      [0, 0.33, 0.23, 0.27],
      [0.51, 0.47],
      [0.49, 0.17],
      [0.72, -0.37, 0, -0.39],
      [-0.72, -0.37, -0.49, 0.17],
      [-0.51, 0.47],
    ],
    [
      [-0.23, 0.07, 0.15],
      [0.23, 0.07, 0.15],
    ],
  );
  const pendant = prop("pendant", wood);
  oval(pendant, wood, [0, 0, 0], [0.47, 0.51, 0.23]);
  for (const side of [-1, 1]) {
    oval(pendant, wood, [side * 0.25, -0.44, 0], [0.16, 0.13, 0.1]);
  }

  prop("funnel", orange, [
    [-0.56, 0.52],
    [-0.16, 0.25],
    [0.03, 0.28, 0.21, 0.23],
    [0.53, 0.49],
    [0.45, 0.05],
    [0.62, -0.02],
    [0.03, -0.49],
    [-0.67, -0.14],
    [-0.47, -0.03],
    [-0.56, 0.52],
  ]);
  prop("brush", wood, [
    [0.24, 0.24],
    [0.56, 0.16, 0.72, 0.41],
    [1.02, -0.1, 0.7, -0.4],
    [0.41, -0.65, -0.42, -0.54],
    [-0.7, -0.26, -0.33, 0.26],
    [-0.05, 0.37, 0.24, 0.24],
  ]);

  prop("spout", brass, [
    [-0.33, -0.38],
    [-0.38, -0.07, -0.31, 0.19],
    [-0.28, 0.57, 0.04, 0.57],
    [0.31, 0.59, 0.36, 0.3],
    [0.61, 0.25],
    [0.63, 0.13, 0.35, 0.07],
    [0.22, -0.03, 0.25, -0.39],
  ]);
  prop("dish", teal, [
    [-0.8, 0.22],
    [-0.62, 0.15, -0.38, 0.1],
    [0.12, 0.25, 0.51, 0.13],
    [0.82, 0.05, 0.66, -0.31],
    [0.42, -0.55, -0.05, -0.49],
    [-0.61, -0.47, -0.8, 0.22],
  ]);

  const shell = prop("dome", teal);
  oval(shell, teal, [-0.1, 0.11, 0], [0.68, 0.46, 0.27]);
  oval(shell, teal, [-0.12, -0.13, 0], [0.76, 0.17, 0.24]);
  const stamp = prop("stamp", cream, [
    [-0.75, 0.05],
    [-0.56, 0.03],
    [-0.37, 0.15],
    [0.27, 0.12],
    [0.57, 0.37, 0.76, 0.25],
    [1.02, 0.14, 0.82, -0.03],
    [0.53, -0.06, 0.43, -0.1],
    [0.48, -0.35],
    [0.27, -0.35],
    [0.13, -0.13],
    [-0.31, -0.14],
    [-0.52, -0.38],
    [-0.72, -0.38],
    [-0.62, -0.14],
    [-0.75, 0.05],
  ]);
  oval(stamp, cream, [0.68, 0.12, 0.02], [0.19, 0.14, 0.1]);

  prop("float", blue, [
    [-0.77, 0.13],
    [-0.69, 0.54, -0.21, 0.57],
    [0.25, 0.56, 0.49, 0.16],
    [0.63, -0.03, 0.78, 0.03],
    [0.78, -0.16],
    [0.49, -0.28, 0.25, -0.27],
    [0.26, -0.47],
    [0.08, -0.48, -0.09, -0.32],
    [-0.77, -0.36, -0.77, 0.13],
  ]);
  prop("splitter", brass, [
    [-0.64, -0.31],
    [-0.41, -0.11, -0.31, 0.11],
    [-0.51, 0.22, -0.58, 0.49],
    [-0.24, 0.44, 0, 0.18],
    [0.14, 0.56, 0.55, 0.57],
    [0.54, 0.27, 0.19, 0.1],
    [-0.01, -0.35, -0.6, -0.49],
  ]);
  return pieces;
}

export const shadowShopRounds = [
  {
    name: "Hedgehog",
    objects: [
      { id: "comb", name: "Serrated comb", x: -0.34, y: 0 },
      { id: "scoop", name: "Brass scoop", x: 0.48, y: -0.14 },
    ],
    solution: [0, 0],
    start: [75, 75],
  },
  {
    name: "Rabbit",
    objects: [
      { id: "handles", name: "Ribbon handles", x: -0.3, y: 0.22 },
      { id: "cushion", name: "Pin cushion", x: 0.12, y: -0.32 },
    ],
    solution: [0, 0],
    start: [90, 75],
  },
  {
    name: "Moth",
    objects: [
      { id: "bow", name: "Ribbon bow", x: 0, y: -0.08 },
      { id: "clip", name: "Brass clip", x: 0, y: -0.06 },
    ],
    solution: [0, 0],
    start: [75, 90],
  },
  {
    name: "Owl",
    objects: [
      { id: "crest", name: "Brass crest", x: 0, y: 0.47 },
      { id: "pendant", name: "Wooden pendant", x: 0, y: -0.29 },
    ],
    solution: [15, 0],
    start: [90, 75],
  },
  {
    name: "Fox",
    objects: [
      { id: "funnel", name: "Copper funnel", x: -0.33, y: 0.4 },
      { id: "brush", name: "Carved brush", x: 0.16, y: -0.14 },
    ],
    solution: [15, 345],
    start: [75, 270],
  },
  {
    name: "Duck",
    objects: [
      { id: "spout", name: "Pouring spout", x: 0.37, y: 0.39 },
      { id: "dish", name: "Serving dish", x: -0.21, y: -0.24 },
    ],
    solution: [0, 345],
    start: [90, 270],
  },
  {
    name: "Turtle",
    objects: [
      { id: "dome", name: "Ceramic dome", x: -0.27, y: 0.08 },
      { id: "stamp", name: "Wax stamp", x: 0.19, y: -0.22 },
    ],
    solution: [0, 15],
    start: [90, 90],
  },
  {
    name: "Whale",
    objects: [
      { id: "float", name: "Fishing float", x: -0.36, y: 0 },
      { id: "splitter", name: "Carved wedge", x: 0.64, y: 0.14 },
    ],
    solution: [15, 0],
    start: [90, 75],
  },
];

const rotation = ({ pitch = 0, roll = 0 }, angle) =>
  new T.Euler(pitch, T.MathUtils.degToRad(angle), roll, "ZXY");

export function createShadowShopGeometry() {
  const pieces = makeObjects();
  const surfaces = {};
  Object.entries(pieces).forEach(([id, group]) => {
    group.updateMatrixWorld(true);
    surfaces[id] = group.children.map((mesh) => {
      const { attributes, index } = mesh.geometry;
      const vertices = Array.from(
        { length: attributes.position.count },
        (_, i) =>
          new T.Vector3()
            .fromBufferAttribute(attributes.position, i)
            .applyMatrix4(mesh.matrixWorld),
      );
      return {
        vertices,
        indices: index?.array,
        color: mesh.material.color,
      };
    });
  });

  return {
    pieces,
    // Orthographic projection along the same axis used to view the props.
    project(object, angle, emit) {
      const orientation = new T.Matrix4().makeRotationFromEuler(
        rotation(object, angle),
      );
      for (const { vertices, indices, color } of surfaces[object.id]) {
        const rotated = vertices.map((vertex) =>
          vertex.clone().applyMatrix4(orientation),
        );
        for (let i = 0; i < (indices?.length ?? rotated.length); i += 3) {
          emit(
            rotated[indices?.[i] ?? i],
            rotated[indices?.[i + 1] ?? i + 1],
            rotated[indices?.[i + 2] ?? i + 2],
            color,
          );
        }
      }
    },
    dispose() {
      const materials = new Set();
      Object.values(pieces).forEach((piece) =>
        piece.traverse((mesh) => {
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          materials.add(mesh.material);
        }),
      );
      materials.forEach((finish) => finish.dispose());
    },
  };
}

export function createShadowShopModels(canvas, pieces, targets) {
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(0, 1, 0, -1, 0.1, 20);
  scene.add(new T.HemisphereLight("#fff0df", "#634c70", 2.2));
  const lamp = new T.DirectionalLight("#ffcf90", 3.1);
  lamp.position.set(-3, 2, 4);
  scene.add(lamp, ...Object.values(pieces));
  let current;
  let width = 0;
  let height = 0;

  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !current) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.right = w;
      camera.bottom = -h;
      // Prop positions and scales are in CSS pixels. Keep the whole depth
      // of the scaled meshes between the camera's near and far planes.
      const depth = Math.max(w, h);
      camera.position.z = depth;
      camera.far = depth * 2;
      camera.updateProjectionMatrix();
    }

    for (const piece of Object.values(pieces)) piece.visible = false;
    const bench = canvas.getBoundingClientRect();
    current.round.objects.forEach((object, side) => {
      const piece = pieces[object.id];
      const box = targets[side].getBoundingClientRect();
      piece.visible = true;
      piece.position.set(
        box.left - bench.left + box.width / 2,
        -(box.top - bench.top + box.height * 0.45),
        0,
      );
      piece.scale.setScalar(Math.min(box.width, box.height) * 0.43);
      piece.rotation.copy(rotation(object, current.angles[side]));
    });
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  return {
    update(round, angles) {
      current = { round, angles };
      draw();
    },
    dispose() {
      observer.disconnect();
      renderer.dispose();
    },
  };
}
