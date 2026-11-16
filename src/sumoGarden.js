import * as T from "three";

const diagonal = Math.SQRT1_2;
const position = (across, y, depth) =>
  new T.Vector3((across + depth) * diagonal, y, (depth - across) * diagonal);

export function createSumoGarden(scene) {
  scene.background = new T.Color("#b8ccc0");
  scene.fog = new T.FogExp2("#b8ccc0", 0.019);

  const material = (color) =>
    new T.MeshStandardMaterial({ color, roughness: 0.94 });
  const add = (geometry, surface, x, y, z) => {
    const mesh = new T.Mesh(geometry, surface);
    mesh.position.copy(position(x, y, z));
    scene.add(mesh);
    return mesh;
  };
  const water = add(
    new T.PlaneGeometry(180, 180),
    material("#578d7e"),
    0,
    -0.055,
    0,
  );
  water.rotation.x = -Math.PI / 2;

  const stone = new T.IcosahedronGeometry(1, 1);
  const stones = ["#536b62", "#647a6d", "#718577", "#7e9179"].map(material);
  const moss = ["#718b57", "#809968", "#92a375"].map(material);
  const rock = (x, y, z, w, h, d, seed) => {
    const mesh = add(stone, stones[seed % stones.length], x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.set(seed * 0.43, seed * 1.29, seed * 0.19);
    return mesh;
  };

  // Distant ledges frame the water and leave the foreground open for the ring.
  for (let i = 0; i < 22; i++) {
    const x = (i - 10.5) * 2.1;
    const depth = -16.5 - Math.cos(i * 0.71) * 2.3;
    rock(x, 0.7, depth, 3, 1.7 + (i % 4) * 0.55, 2.7, i);
    const bank = add(stone, moss[i % 3], x, 1.4, depth - 1.2);
    bank.scale.set(3.2, 1.15 + (i % 3) * 0.43, 2.2);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const depth = -11 + i * 2.1;
      const across = side * (9.1 + Math.sin(i * 1.8) * 1.1);
      rock(
        across,
        0.1,
        depth,
        0.65 + (i % 4) * 0.25,
        0.45 + (i % 3) * 0.23,
        0.92,
        i + 4,
      );
      const tuft = add(stone, moss[i % 3], across + side * 1.15, 0.13, depth);
      tuft.scale.set(1.45, 0.56, 1.26);
    }
  }

  const fallX = 0.25;
  for (let i = 0; i < 14; i++) {
    const lane = i % 7;
    const top = i >= 7;
    rock(
      fallX + (lane - 3) * 1.02,
      top ? 2.9 : 1.1,
      -13.6 - Math.sin(lane) * 0.37,
      1.4,
      top ? 1.65 : 1.38,
      1.65,
      i + 15,
    );
  }
  for (const side of [-1, 1]) {
    const cap = add(stone, moss[0], fallX + side * 2.25, 3.72, -13.25);
    cap.scale.set(1.35, 0.77, 1.15);
  }

  // The texture scrolls down the stepped lip and over the face of the falls.
  const flow = new T.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    side: T.DoubleSide,
    vertexShader: `
      varying vec2 flowUv;
      void main() {
        flowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 flowUv;
      void main() {
        float x = flowUv.x;
        float y = flowUv.y;
        float streak = sin(x * 102.0 + sin(x * 33.0) * 3.0 + sin(y * 8.0) * 0.32);
        float current = sin(y * 29.0 + time * 8.5 + sin(x * 30.0) * 2.5);
        float spray = (1.0 - smoothstep(0.0, 0.24, y)) * 0.22;
        float light = clamp(0.48 + streak * 0.18 + streak * current * 0.14 + spray, 0.0, 1.0);
        vec3 color = mix(vec3(0.23, 0.52, 0.51), vec3(0.83, 0.95, 0.89), light);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const cascade = new T.BufferGeometry();
  const vertices = [];
  const uv = [];
  for (const [y, depth, halfWidth, v] of [
    [0.04, -11.05, 1.8, 0],
    [0.65, -11.35, 1.64, 0.16],
    [3.84, -11.65, 1.51, 0.88],
    [4.03, -13.3, 1.58, 1],
  ]) {
    for (const side of [-1, 1]) {
      vertices.push(...position(fallX + side * halfWidth, y, depth).toArray());
      uv.push((side + 1) / 2, v);
    }
  }
  cascade.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  cascade.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  cascade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 6, 5, 7]);
  scene.add(new T.Mesh(cascade, flow));

  const ripple = new T.RingGeometry(0.95, 1, 64);
  const ripples = Array.from({ length: 5 }, () => {
    const surface = new T.MeshBasicMaterial({
      color: "#d2ecdc",
      transparent: true,
      depthWrite: false,
    });
    const item = add(ripple, surface, fallX, -0.037, -10.85);
    item.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    return item;
  });
  const glint = new T.PlaneGeometry(1, 1);
  const glints = ["#99beb0", "#83afa0", "#6f9e8e"].map(
    (color) =>
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }),
  );
  for (let i = 0; i < 48; i++) {
    const x = Math.sin(i * 2.15) * (4.5 + (i % 9) * 1.45);
    const depth = -15 + ((i * 37) % 310) * 0.11;
    if (Math.hypot(x, depth) < 7.4) continue;
    const line = add(glint, glints[i % 3], x, -0.039, depth);
    line.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    line.scale.set(0.24 + (i % 7) * 0.18, 0.016 + (i % 5) * 0.008, 1);
  }

  const padShape = new T.CircleGeometry(1, 24, 0.35, Math.PI * 2 - 0.52);
  const pads = ["#516e49", "#638855", "#759461"].map(material);
  const petals = material("#e6b4ac");
  const centers = material("#eee1aa");
  for (const [i, [x, depth]] of [
    [-3.9, 9.6],
    [-4.7, 10],
    [-3.05, 10.5],
    [5.1, 7.5],
    [6.25, 8.1],
    [5.45, 8.75],
    [-6.7, -6.5],
    [4.2, -9.3],
    [5.2, -8.85],
  ].entries()) {
    const width = 0.27 + (i % 3) * 0.14;
    const pad = add(padShape, pads[i % 3], x, -0.018, depth);
    pad.rotation.set(-Math.PI / 2, 0, i * 2.4);
    pad.scale.set(width, width * 0.88, 1);
    if (i % 4 !== 0) continue;
    for (let n = 0; n < 6; n++) {
      const angle = (n * Math.PI) / 3;
      const petal = add(
        stone,
        petals,
        x + Math.cos(angle) * 0.11,
        0.045,
        depth + Math.sin(angle) * 0.11,
      );
      petal.scale.set(0.085, 0.078, 0.065);
    }
    const center = add(stone, centers, x, 0.075, depth);
    center.scale.setScalar(0.061);
  }

  const stem = new T.CylinderGeometry(0.84, 1, 1, 8);
  const joint = new T.CylinderGeometry(1, 1, 1, 8);
  const leaf = new T.BufferGeometry();
  leaf.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, 0, 0, 0.39, 0.14, 0.12, 1, 0, 0.02, 0.38, -0.1, -0.07, 0.44, 0.013,
        0.08,
      ],
      3,
    ),
  );
  leaf.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  leaf.computeVertexNormals();
  const stems = ["#4e7550", "#63854d", "#779554"].map(material);
  const joints = material("#a1ad6d");
  const leaves = ["#406747", "#567b4b", "#769756"].map(
    (color) => new T.MeshStandardMaterial({ color, side: T.DoubleSide }),
  );

  const grove = new T.Group();
  const bamboo = (x, depth, height, seed) => {
    const group = new T.Group();
    group.position.copy(position(x, 0.28, depth));
    group.rotation.z = Math.sin(seed * 1.8) * 0.15;
    group.rotation.x = Math.cos(seed * 1.7) * 0.12;
    grove.add(group);
    const width = 0.07 + (seed % 4) * 0.017;
    const pole = new T.Mesh(stem, stems[seed % 3]);
    pole.position.y = height / 2;
    pole.scale.set(width, height, width);
    group.add(pole);
    for (let n = 1; n < height / 0.64; n++) {
      const collar = new T.Mesh(joint, joints);
      collar.position.y = n * 0.64;
      collar.scale.set(width * 1.03, 0.028, width * 1.03);
      group.add(collar);
    }
    for (let n = 0; n < 9; n++) {
      const sprig = new T.Mesh(leaf, leaves[(n + seed) % 3]);
      sprig.position.y = height * (0.54 + n * 0.052);
      sprig.rotation.set(0, seed + n * 2.39, 0.22 - (n % 4) * 0.19);
      const length = 0.66 + (n % 4) * 0.28;
      sprig.scale.set(length, 1.66, length);
      group.add(sprig);
    }
  };

  for (const [i, [x, depth]] of [
    [-10.2, -6],
    [-6.1, -11.8],
    [-3.9, -15.6],
    [4.2, -15.2],
    [6.6, -10.3],
    [10.1, -6.5],
    [11.3, -1],
    [-11.5, -0.1],
  ].entries()) {
    for (let j = 0; j < 5; j++) {
      const seed = i * 5 + j;
      bamboo(
        x + Math.sin(j * 2.4) * 0.81,
        depth + Math.cos(j * 2.4) * 0.77,
        3.8 + (seed % 7) * 0.42,
        seed,
      );
    }
  }

  // Share one draw call per bamboo geometry and material across the whole grove.
  grove.updateMatrixWorld(true);
  const batches = new Map();
  grove.traverse((item) => {
    if (!item.isMesh) return;
    const batch = batches.get(item.material) || [];
    batch.push(item);
    batches.set(item.material, batch);
  });
  for (const [surface, items] of batches) {
    const batch = new T.InstancedMesh(items[0].geometry, surface, items.length);
    items.forEach((item, i) => batch.setMatrixAt(i, item.matrixWorld));
    scene.add(batch);
  }

  return (time) => {
    flow.uniforms.time.value = time;
    ripples.forEach((item, index) => {
      const phase = (time * 0.34 + index / ripples.length) % 1;
      item.scale.set(1.6 + phase * 2.7, 0.26 + phase * 1.75, 1);
      item.position.copy(
        position(fallX, -0.037 + index * 0.001, -10.85 + phase),
      );
      item.material.opacity = Math.sin(phase * Math.PI) * 0.38;
    });
  };
}
