import * as T from "three";
import { direction, LENGTH, WIDTH, position } from "../shared/kubb.js";

export function createKubbScene(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0xbadacb);
  scene.fog = new T.FogExp2(0xbadacb, 0.034);
  const camera = new T.PerspectiveCamera(58, 1, 0.06, 100);
  const stage = new T.Group();
  scene.add(stage, new T.HemisphereLight(0xffefd5, 0x61785b, 2.2));
  const sun = new T.DirectionalLight(0xffe0a6, 2.5);
  sun.position.set(-7, 14, -6);
  sun.target.position.set(0, 0, 4);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 10,
    bottom: -10,
    near: 1,
    far: 32,
  });
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const block = new T.BoxGeometry(1, 1, 1);
  const cone = new T.ConeGeometry(1, 1, 6);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 12);
  const mat = (color, flatShading = false) =>
    new T.MeshStandardMaterial({ color, flatShading });
  const grass = mat(0x557740),
    darkGrass = mat(0x4b703e),
    paleGrass = mat(0x62854c);
  const twine = mat(0xe8d4a2),
    oak = mat(0x9e6940),
    grain = mat(0x7e5030);
  const orange = mat(0xe18f49),
    blue = mat(0x58b3bb),
    king = mat(0xa32a35),
    crown = mat(0xffc86c);
  const leaves = [0x264c41, 0x365c47, 0x41654d, 0x506f52].map((c) =>
    mat(c, true),
  );
  function mesh(parent, geometry, material, x, y, z, w, h, d, shadows = true) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  }
  mesh(stage, block, grass, 0, -0.38, 4, 115, 0.71, 115);
  for (let i = 0; i < 8; i++)
    mesh(
      stage,
      block,
      i % 2 ? darkGrass : paleGrass,
      0,
      -0.065,
      i + 0.5,
      WIDTH,
      0.13,
      1,
    );
  for (const z of [0, LENGTH / 2, LENGTH])
    mesh(
      stage,
      block,
      twine,
      0,
      0.004,
      z,
      WIDTH,
      0.008,
      z === LENGTH / 2 ? 0.018 : 0.04,
      false,
    );
  for (const x of [-WIDTH / 2, WIDTH / 2]) {
    mesh(stage, block, twine, x, 0.004, 4, 0.034, 0.008, LENGTH, false);
    for (const z of [0, LENGTH / 2, LENGTH]) {
      mesh(stage, cylinder, oak, x, 0.15, z, 0.045, 0.3, 0.045);
      mesh(
        stage,
        cylinder,
        z === LENGTH / 2 ? twine : z === 0 ? blue : orange,
        x,
        0.27,
        z,
        0.047,
        0.055,
        0.047,
      );
    }
  }
  let seed = 19;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 77; i++) {
    const a = random() * Math.PI * 2,
      r = 9.5 + random() * 31;
    const x = Math.cos(a) * r,
      z = 4 + Math.sin(a) * r,
      h = 2 + random() * 6;
    mesh(
      stage,
      cylinder,
      grain,
      x,
      h * 0.29,
      z,
      h * 0.027,
      h * 0.59,
      h * 0.027,
      false,
    );
    for (let j = 0; j < 3; j++) {
      const b = mesh(
        stage,
        cone,
        leaves[(i + j) % 4],
        x,
        h * (0.49 + j * 0.17),
        z,
        h * (0.24 - j * 0.052),
        h * 0.53,
        h * (0.24 - j * 0.052),
        false,
      );
      b.rotation.y = random() * 6.28;
    }
  }
  const rocks = new T.IcosahedronGeometry(1, 0);
  const slate = mat(0x79867a, true);
  for (let i = 0; i < 26; i++) {
    const x = (3.2 + random() * 12) * (i % 2 ? 1 : -1),
      z = -7 + random() * 23;
    mesh(
      stage,
      rocks,
      slate,
      x,
      0.04,
      z,
      0.14 + random() * 0.53,
      0.1 + random() * 0.25,
      0.22,
      false,
    );
  }
  const kubbs = Array.from({ length: 11 }, (_, i) => {
    const root = new T.Group(),
      body = new T.Group();
    stage.add(root);
    root.add(body);
    if (i === 10) {
      mesh(body, block, king, 0, 0.35, 0, 0.28, 0.7, 0.28);
      mesh(body, block, crown, 0, 0.63, 0, 0.3, 0.07, 0.3);
      for (const x of [-0.101, 0.101])
        for (const z of [-0.101, 0.101])
          mesh(body, block, crown, x, 0.716, z, 0.094, 0.12, 0.094);
      return { root, body };
    }
    mesh(body, block, oak, 0, 0.19, 0, 0.15, 0.38, 0.15);
    const stripe = mesh(body, block, blue, 0, 0.301, 0, 0.153, 0.103, 0.153);
    for (const x of [-0.028, 0.029])
      mesh(body, block, grain, x, 0.131, -0.075, 0.008, 0.21, 0.003);
    return { root, body, stripe };
  });
  const baton = new T.Group();
  mesh(baton, cylinder, oak, 0, 0, 0, 0.043, 0.42, 0.043);
  for (const y of [-0.155, 0.155])
    mesh(baton, cylinder, twine, 0, y, 0, 0.045, 0.035, 0.045);
  scene.add(baton);
  const held = baton.clone();
  held.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  camera.add(held);
  scene.add(camera);
  const dotGeometry = new T.SphereGeometry(0.027, 8, 6);
  const dotMaterial = new T.MeshBasicMaterial({ color: 0xffedb6 });
  const dots = Array.from({ length: 28 }, () => {
    const m = new T.Mesh(dotGeometry, dotMaterial);
    scene.add(m);
    return m;
  });
  const look = new T.Vector3();
  const eye = new T.Vector3();
  function draw({
    match,
    side,
    line,
    aim,
    pitch,
    shot,
    elapsed,
    preview,
    charge,
    impact,
    dt,
  }) {
    const sign = direction(side);
    eye.set(0, 1.55, line - sign * 0.95);
    camera.position.lerp(eye, Math.min(1, dt * 8));
    look.set(
      camera.position.x + Math.sin(aim) * sign * 5,
      camera.position.y + Math.sin(pitch - 0.22) * 5,
      camera.position.z + Math.cos(aim) * sign * 5,
    );
    camera.lookAt(look);
    for (const p of match.pieces) {
      const { root, body, stripe } = kubbs[p.id];
      root.position.set(p.x, 0, p.z);
      const target = p.standing && p !== impact ? 0 : 1.54;
      body.rotation.x += (target - body.rotation.x) * Math.min(1, dt * 11);
      if (stripe) stripe.material = p.side === 0 ? blue : orange;
    }
    baton.visible = !!shot;
    if (shot) {
      const p = position(shot, elapsed);
      baton.position.set(p.x, Math.max(0.06, p.y), p.z);
      baton.rotation.set(
        Math.PI / 2 + 0.26 * Math.sin(elapsed * 7),
        0.15,
        elapsed * 3,
      );
    }
    held.visible = side === 0 && !shot;
    held.position.set(0.31, -0.32 - charge * 0.13, -0.65 - charge * 0.17);
    held.rotation.set(-0.33 - charge * 0.35, 0.2, -0.28);
    let ended = false;
    dots.forEach((dot, i) => {
      if (!preview || ended) {
        dot.visible = false;
        return;
      }
      const p = position(preview, (i + 1) * 0.035);
      if (p.y <= 0.06) {
        ended = true;
        dot.visible = false;
        return;
      }
      dot.visible = true;
      dot.position.set(p.x, p.y, p.z);
    });
    const w = Math.max(canvas.clientWidth, 1),
      h = Math.max(canvas.clientHeight, 1);
    if (
      canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(h * renderer.getPixelRatio())
    ) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }
  camera.position.set(0, 1.55, -0.95);
  return {
    draw,
    dispose() {
      const resources = new Set();
      scene.traverse((obj) => {
        if (obj.isMesh) {
          resources.add(obj.geometry);
          resources.add(obj.material);
        }
      });
      for (const item of resources) item.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
