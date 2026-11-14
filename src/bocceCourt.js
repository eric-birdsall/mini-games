import * as T from "three";
import { COURSE, COURT, terrainHeight, terrainSlope } from "../shared/bocce.js";

const { width, height, startX, startY } = COURT;
const palette = ["#ffc15a", "#43bcb1", "#fff5dc"];
const worldZ = (y, section) => (y - height - section * height) / 100;
const worldX = (x) => (x - width / 2) / 100;
const groundY = (x, y, section) => terrainHeight(x, y, section) / 100;
const material = (color) =>
  new T.MeshStandardMaterial({ color, roughness: 0.9 });

export function createBocceCourse(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new T.Scene();
  scene.background = new T.Color("#b5d4db");
  scene.fog = new T.FogExp2("#b5d4db", 0.033);
  const size = new T.Vector2();
  const camera = new T.PerspectiveCamera(58, 1, 0.035, 80);
  scene.add(new T.HemisphereLight("#e2f4ff", "#756341", 2.3));
  const sun = new T.DirectionalLight("#fff1ce", 2.2);
  sun.position.set(-8, 13, 5);
  scene.add(sun);

  const box = new T.BoxGeometry(1, 1, 1);
  const sphere = new T.SphereGeometry(1, 16, 12);
  const crown = new T.IcosahedronGeometry(1, 1);
  const trunk = new T.CylinderGeometry(0.72, 1, 1, 7);
  const pine = new T.ConeGeometry(1, 1, 9);
  const lawn = material("#687d41");
  const plaster = material("#e7d6b7");
  const stone = material("#b9ab91");
  const dark = material("#34474a");
  const leaf = ["#294d33", "#376448", "#517444", "#667d3f"].map(material);
  const wood = material("#63503c");
  const flowers = ["#f8cd9b", "#b4a0d0", "#d98275"].map(material);
  const ballMaterials = palette.map(material);
  const shadowMaterial = new T.MeshBasicMaterial({
    color: "#292719",
    transparent: true,
    opacity: 0.29,
    depthWrite: false,
  });
  const shadowGeometry = new T.CircleGeometry(1, 16);
  const field = new T.Group();
  scene.add(field);

  function mesh(geometry, mat, x, y, z, sx, sy, sz, parent = field) {
    const piece = new T.Mesh(geometry, mat);
    piece.position.set(x, y, z);
    piece.scale.set(sx, sy, sz);
    parent.add(piece);
    return piece;
  }

  mesh(box, lawn, 0, -0.55, -15, 31, 0.24, 53);
  for (const side of [-1, 1]) {
    mesh(box, lawn, side * 8.65, -0.12, -15, 13.7, 0.24, 53);
  }
  mesh(box, plaster, 0, 2.25, 4, 14, 4.5, 3.5);
  mesh(box, dark, 0, 4.6, 4, 14.5, 0.34, 4);
  mesh(box, stone, 0, 0.14, 0.95, 10, 0.28, 2.5);
  for (const x of [-5.5, -3.4, -1.3, 1.3, 3.4, 5.5]) {
    mesh(box, dark, x, 2.74, 2.22, 0.77, 1.18, 0.06);
    mesh(trunk, plaster, x, 1.5, 1.65, 0.13, 3, 0.13);
  }
  mesh(box, dark, 0, 1.12, 2.2, 1.3, 2.25, 0.09);
  for (const side of [-1, 1]) {
    mesh(box, stone, side * 2.9, 0.17, -3.0, 0.55, 0.35, 4.9);
    for (let i = 0; i < 11; i++) {
      mesh(crown, leaf[2], side * 2.9, 0.47, -0.8 - i * 0.46, 0.34, 0.34, 0.35);
      mesh(
        sphere,
        flowers[i % 3],
        side * (2.69 + (i % 2) * 0.28),
        0.67,
        -0.8 - i * 0.46,
        0.1,
        0.1,
        0.1,
      );
    }
    mesh(sphere, leaf[1], side * 2.2, 1.05, -5.9, 0.45, 0.67, 0.45);
    mesh(box, stone, side * 2.2, 0.24, -5.9, 0.6, 0.48, 0.6);
  }

  const basin = new T.CylinderGeometry(1, 0.76, 1, 32);
  const water = new T.CylinderGeometry(1, 1, 1, 32);
  const waterMaterial = new T.MeshStandardMaterial({
    color: "#71b7bd",
    roughness: 0.23,
  });
  const fountainX = 2.85;
  const fountainZ = -4.7;
  mesh(basin, stone, fountainX, 0.31, fountainZ, 0.65, 0.22, 0.65);
  mesh(water, waterMaterial, fountainX, 0.43, fountainZ, 0.55, 0.026, 0.55);
  mesh(trunk, plaster, fountainX, 0.61, fountainZ, 0.09, 0.41, 0.09);
  mesh(basin, stone, fountainX, 0.83, fountainZ, 0.28, 0.105, 0.28);
  mesh(sphere, waterMaterial, fountainX, 0.94, fountainZ, 0.045, 0.11, 0.045);

  let seed = 5481;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 95; i++) {
    const z = -6 - random() * 33;
    const x = (2.25 + random() * 12) * (i % 2 ? 1 : -1);
    const size = 0.6 + random() * 1.55;
    const mat = leaf[i % leaf.length];
    mesh(trunk, wood, x, size * 0.9, z, size * 0.13, size * 1.8, size * 0.13);
    if (i % 3) {
      for (let tier = 0; tier < 3; tier++) {
        const radius = size * (0.8 - tier * 0.17);
        mesh(
          pine,
          mat,
          x,
          size * (1.15 + tier * 0.63),
          z,
          radius,
          size * 1.55,
          radius,
        );
      }
    } else {
      mesh(crown, mat, x, size * 1.95, z, size, size * 1.24, size);
    }
    const fernX = (2 + random() * 1.65) * Math.sign(x);
    mesh(crown, leaf[(i + 1) % leaf.length], fernX, 0.07, z, 0.3, 0.29, 0.42);
  }

  const gridMaterial = new T.LineBasicMaterial({
    color: "#def1b1",
    transparent: true,
    opacity: 0.65,
  });
  const grids = [];
  const dots = [];
  for (let section = 0; section < COURSE.length; section++) {
    const geometry = new T.PlaneGeometry(width, height, 18, 34);
    const vertices = geometry.attributes.position;
    const colors = [];
    const tint = new T.Color(section === 0 ? "#759547" : "#879250");
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i) + width / 2;
      const y = height / 2 - vertices.getY(i);
      vertices.setXYZ(i, worldX(x), groundY(x, y, section), worldZ(y, section));
      const color = tint.clone().multiplyScalar(0.87 + random() * 0.24);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    scene.add(
      new T.Mesh(
        geometry,
        new T.MeshStandardMaterial({
          vertexColors: true,
          side: T.DoubleSide,
          roughness: 1,
        }),
      ),
    );

    const grid = new T.Group();
    const bars = [];
    const markers = [];
    const point = (x, y) => [
      worldX(x),
      groundY(x, y, section) + 0.014,
      worldZ(y, section),
    ];
    for (let y = 60; y <= 600; y += 45) {
      for (let x = 45; x <= 315; x += 45) {
        const [sx, sy] = terrainSlope(x + 22, y + 22, section);
        const steep = Math.hypot(sx, sy);
        if (x < 315) bars.push(...point(x, y), ...point(x + 45, y));
        if (y < 600) bars.push(...point(x, y), ...point(x, y + 45));
        if (x === 315 || y === 600 || steep < 0.012) continue;
        markers.push({
          x: x + 22,
          y: y + 22,
          sx: -sx / steep,
          sy: -sy / steep,
          steep,
        });
      }
    }
    grid.add(
      new T.LineSegments(
        new T.BufferGeometry().setAttribute(
          "position",
          new T.Float32BufferAttribute(bars, 3),
        ),
        gridMaterial,
      ),
    );
    const movingDots = new T.BufferGeometry();
    movingDots.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(markers.length * 9), 3),
    );
    const particles = new T.Points(
      movingDots,
      new T.PointsMaterial({ color: "#ffe597", size: 0.036 }),
    );
    particles.frustumCulled = false;
    grid.add(particles);
    dots.push({ movingDots, markers });
    scene.add(grid);
    grids.push(grid);
  }

  const pieces = Array.from({ length: 9 }, () => ({
    ball: mesh(sphere, ballMaterials[0], 0, 0, 0, 1, 1, 1),
    shadow: mesh(shadowGeometry, shadowMaterial, 0, 0, 0, 1, 1, 1),
  }));
  pieces.forEach(({ shadow }) => {
    shadow.rotation.x = -Math.PI / 2;
  });
  const held = mesh(
    sphere,
    ballMaterials[0],
    0.23,
    -0.23,
    -0.48,
    0.072,
    0.072,
    0.072,
    camera,
  );
  scene.add(camera);

  function paint(end, angle, aiming, pallinoTurn, time) {
    const section = end.section;
    renderer.getSize(size);
    if (size.x !== canvas.clientWidth || size.y !== canvas.clientHeight) {
      renderer.setSize(
        canvas.clientWidth || 1,
        canvas.clientHeight || 1,
        false,
      );
      camera.aspect = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
      camera.updateProjectionMatrix();
    }
    camera.position.set(
      0,
      groundY(startX, startY, section) + 1.64,
      worldZ(startY, section),
    );
    camera.rotation.set(-0.23, -angle, 0, "YXZ");
    held.visible = aiming;
    held.material = ballMaterials[pallinoTurn ? 2 : 0];
    held.scale.setScalar(pallinoTurn ? 0.047 : 0.072);
    grids.forEach((grid, i) => {
      grid.visible = i === section;
    });
    const { movingDots, markers } = dots[section];
    const positions = movingDots.attributes.position;
    markers.forEach(({ x, y, sx, sy, steep }, i) => {
      for (let j = 0; j < 3; j++) {
        const slide =
          ((((time * (0.3 + steep * 11)) / 1000 + j / 3) % 1) - 0.5) * 33;
        const px = x + sx * slide;
        const py = y + sy * slide;
        positions.setXYZ(
          i * 3 + j,
          worldX(px),
          groundY(px, py, section) + 0.037,
          worldZ(py, section),
        );
      }
    });
    positions.needsUpdate = true;
    pieces.forEach(({ ball, shadow }, i) => {
      const piece = end.balls[i];
      ball.visible = shadow.visible = !!piece;
      if (!piece) return;
      const { x, y, r, team, flight = 0 } = piece;
      const base = groundY(x, y, section);
      const lift = Math.sin((Math.PI * flight) / 0.65) * 0.63;
      ball.material = ballMaterials[team < 0 ? 2 : team];
      ball.scale.setScalar(r / 100);
      ball.position.set(worldX(x), base + r / 100 + lift, worldZ(y, section));
      shadow.scale.set(r / 82, r / 82, 1);
      shadow.position.set(worldX(x), base + 0.01, worldZ(y, section));
    });
    renderer.render(scene, camera);
  }

  return {
    paint,
    dispose() {
      const geometries = new Set(),
        materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      renderer.dispose();
    },
  };
}
