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

function bowl(group, finish, position, scale) {
  const profile = [
    [0, 0],
    [0.23, 0],
    [0.39, 0.07],
    [0.49, 0.21],
    [0.5, 0.27],
    [0.46, 0.27],
    [0.44, 0.2],
    [0.35, 0.1],
    [0.2, 0.05],
    [0, 0.05],
  ].map(([x, y]) => new T.Vector2(x, y));
  const mesh = add(
    group,
    new T.LatheGeometry(profile, 32),
    finish,
    ...position,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function makeObjects() {
  const brass = material("#e5a34c", 0.45);
  const steel = material("#c3d7dc", 0.5);
  const teal = material("#42988e");
  const wood = material("#b77843");
  const orange = material("#e77b48");
  const ribbon = material("#db6394");
  const pieces = Array.from({ length: 6 }, () => new T.Group());
  const [rake, scoop, scraper, hook, bow, tongs] = pieces;

  rod(rake, [0, -0.82, 0], [0, 0.43, 0], 0.055, wood);
  add(rake, new T.BoxGeometry(1.13, 0.13, 0.14), teal, 0, 0.46);
  for (let i = -4; i <= 4; i++) {
    rod(rake, [i * 0.123, 0.48, 0], [i * 0.123, 0.73, 0.07], 0.024, teal);
    rod(rake, [i * 0.123, 0.73, 0.07], [i * 0.123, 0.77, 0.17], 0.024, teal);
  }
  const cup = bowl(scoop, brass, [0, 0.28, 0], [0.75, 0.67, 1.12]);
  cup.rotation.x = Math.PI * 0.38;
  rod(scoop, [0, -0.7, 0], [0, 0.1, 0.02], 0.071, wood);
  oval(scoop, brass, [0, -0.68, 0], [0.092, 0.1, 0.077]);

  oval(scraper, orange, [0, -0.34, 0], [0.125, 0.45, 0.105]);
  rod(scraper, [0, -0.23, 0], [0, 0.39, 0], 0.069, steel);
  const blade = new T.Shape();
  blade.moveTo(-0.16, 0.24);
  blade.lineTo(-0.44, 0.67);
  blade.lineTo(0.44, 0.67);
  blade.lineTo(0.16, 0.24);
  blade.closePath();
  add(
    scraper,
    new T.ExtrudeGeometry(blade, {
      depth: 0.06,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 2,
    }),
    teal,
  );

  oval(hook, wood, [0, 0, -0.19], [0.25, 0.57, 0.085]);
  for (const y of [-0.38, 0.38])
    oval(hook, brass, [0, y, -0.105], [0.035, 0.035, 0.018]);
  const curve = new T.CatmullRomCurve3(
    [
      [0, 0.28, -0.14],
      [0, 0.39, 0.13],
      [0, 0.54, 0.34],
      [0, 0.22, 0.27],
      [0, -0.28, 0.13],
      [0, -0.39, 0.35],
      [0, -0.21, 0.48],
    ].map((point) => new T.Vector3(...point)),
  );
  add(hook, new T.TubeGeometry(curve, 40, 0.065, 12), brass);
  oval(hook, brass, [0, -0.21, 0.48], [0.085, 0.085, 0.085]);

  for (const side of [-1, 1]) {
    const loop = add(
      bow,
      new T.TorusGeometry(0.25, 0.083, 12, 30),
      ribbon,
      side * 0.34,
      0.12,
    );
    loop.scale.set(1.35, 0.85, 1);
    loop.rotation.z = side * 0.38;
    const tail = add(
      bow,
      new T.BoxGeometry(0.21, 0.56, 0.055),
      ribbon,
      side * 0.2,
      -0.21,
    );
    tail.rotation.z = side * 0.42;

    rod(tongs, [side * 0.045, -0.64, 0], [side * 0.21, 0.48, 0], 0.044, steel);
    oval(tongs, teal, [side * 0.22, 0.51, 0], [0.11, 0.21, 0.07]).rotation.z =
      -side * 0.23;
  }
  oval(bow, ribbon, [0, 0.05, 0.05], [0.145, 0.18, 0.14]);
  add(tongs, new T.TorusGeometry(0.105, 0.032, 10, 24), steel, 0, -0.67);
  return pieces;
}

export function createShadowShopModels(canvas) {
  const renderer = new T.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.position.set(0, 0, 7);
  scene.add(new T.HemisphereLight("#fff0df", "#634c70", 2.2));
  const lamp = new T.DirectionalLight("#ffcf90", 3.1);
  lamp.position.set(-3, 2, 4);
  scene.add(lamp);
  const pieces = makeObjects();
  scene.add(...pieces);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let currentRound = 0;
  let currentAngles = [0, 0];
  let frame;
  let width = 0;
  let height = 0;

  function draw(time) {
    frame = requestAnimationFrame(draw);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.right = (2 * w) / h;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
    }

    pieces.forEach((piece, index) => {
      piece.visible = Math.floor(index / 2) === currentRound;
      if (!piece.visible) return;
      const side = index % 2;
      const bob = motion.matches ? 0 : Math.sin(time / 650 + side * 2) * 0.09;
      const scale = Math.min(1, camera.right * 0.46);
      piece.position.set(
        camera.right * (side ? 0.06 : -0.34),
        (side ? -0.64 : -0.48) + bob,
        side ? -0.55 : 0.55,
      );
      piece.scale.setScalar(scale * (side ? 0.89 : 1));
      piece.rotation.set(
        side ? 0.12 : -0.12,
        T.MathUtils.degToRad(currentAngles[side] - 36),
        side ? -0.23 : 0.19,
      );
    });
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(draw);

  return {
    update(round, angles) {
      currentRound = round;
      currentAngles = angles;
    },
    dispose() {
      cancelAnimationFrame(frame);
      const materials = new Set();
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        materials.add(object.material);
      });
      materials.forEach((finish) => finish.dispose());
      renderer.dispose();
    },
  };
}
