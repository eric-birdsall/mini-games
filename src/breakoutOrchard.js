import * as T from "three";

export const isFarmFence = (wall) => wall.kind === "wall" && !wall.breakout;

// The course keeps its collision boxes. Dress their visible edges as fences.
export function dressBreakoutOrchard(world, map) {
  const timber = world.material("#8c6240"),
    rails = world.material("#b98b57"),
    grass = world.material("#86ae58");
  const pieces = [],
    posts = [],
    trunks = [],
    crowns = [],
    apples = [];
  const dummy = new T.Object3D();
  function batch(geometry, material, instances) {
    const mesh = new T.InstancedMesh(geometry, material, instances.length);
    instances.forEach(([x, y, z, w, h, d], i) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.receiveShadow = true;
    world.level.add(mesh);
  }
  for (const wall of map.walls.filter(isFarmFence)) {
    const alongX = wall.w > wall.d;
    const length = alongX ? wall.w : wall.d;
    const spans = Math.ceil(length / 2.7);
    const step = length / spans;
    for (let i = 0; i <= spans; i++) {
      const offset = i * step - length / 2;
      const x = wall.x + (alongX ? offset : 0);
      const z = wall.z + (alongX ? 0 : offset);
      posts.push([x, 0.87, z, 0.3, 1.78, 0.3]);
      if (i === spans) continue;
      for (const y of [0.46, 0.96, 1.44]) {
        pieces.push([
          x + (alongX ? step / 2 : 0),
          y,
          z + (alongX ? 0 : step / 2),
          alongX ? step : 0.13,
          0.17,
          alongX ? 0.13 : step,
        ]);
      }
    }
  }
  const [west, east] = map.walls;
  for (const wall of [west, east]) {
    const side = Math.sign(wall.x);
    world.box(
      wall.x + side * (24 + wall.w / 2),
      -0.01,
      wall.z,
      48,
      0.02,
      wall.d,
      grass,
    ).castShadow = false;
    for (let row = 0; row < 2; row++) {
      for (
        let i = 0, z = wall.d / 2 - 13 - row * 4 - (side > 0 ? 5 : 0);
        z > -wall.d / 2 + 12;
        i++, z -= 11 + 2 * Math.sin(i * 2.4)
      ) {
        const x = wall.x + side * (5.5 + row * 7 + 1.3 * Math.sin(i * 1.7));
        const size = 1 + 0.22 * Math.sin(i * 2.1 + row + side);
        trunks.push([
          x,
          1.45 * size - 0.02,
          z,
          0.55 * size,
          2.9 * size + 0.04,
          0.55 * size,
        ]);
        for (const [dx, dy, dz] of [
          [0, 0.5, 0],
          [-0.9, 0, 0.4],
          [0.75, -0.15, -0.55],
        ]) {
          crowns.push([
            x + dx * size,
            (3.1 + dy) * size,
            z + dz * size,
            1.6 * size,
            1.3 * size,
            1.55 * size,
          ]);
        }
        for (let fruit = 0; fruit < 7; fruit++) {
          const angle = fruit * 2.4 + i;
          apples.push([
            x + 1.55 * size * Math.cos(angle),
            (2.75 + (fruit % 3) * 0.34) * size,
            z + 1.5 * size * Math.sin(angle),
            0.16,
            0.16,
            0.16,
          ]);
        }
      }
    }
  }
  batch(new T.BoxGeometry(), timber, posts);
  batch(new T.BoxGeometry(), rails, pieces);
  batch(new T.CylinderGeometry(0.38, 0.55, 1, 6), timber, trunks);
  batch(new T.IcosahedronGeometry(1, 1), world.material("#538a38"), crowns);
  batch(new T.IcosahedronGeometry(1, 0), world.material("#cb4033"), apples);

  // Tall enough to remain a landmark above the orchard from inside the lane.
  const x = map.finish.x,
    z = map.finish.z - 24;
  const red = world.material("#ae382e"),
    cream = world.material("#fff0cf"),
    roof = world.material("#494d4b");
  world.box(x, 5, z, 20, 10, 14, red);
  const gable = new T.Shape();
  gable.moveTo(-10, 0);
  gable.lineTo(10, 0);
  gable.lineTo(0, 6);
  gable.closePath();
  const top = new T.Mesh(
    new T.ExtrudeGeometry(gable, { depth: 14, bevelEnabled: false }),
    red,
  );
  top.position.set(x, 10, z - 7);
  world.level.add(top);
  for (const side of [-1, 1]) {
    const panel = world.box(
      x + side * 5,
      13,
      z,
      Math.hypot(10, 6) + 0.6,
      0.28,
      15,
      roof,
    );
    panel.rotation.z = -side * Math.atan2(6, 10);
    world.box(x + side * 9.8, 5, z + 7.1, 0.3, 10, 0.18, cream);
  }
  for (let offset = -9; offset <= 9; offset += 0.7)
    world.box(x + offset, 5, z + 7.04, 0.055, 10, 0.06, cream);
  world.box(x, 3, z + 7.16, 6, 6, 0.22, world.material("#76291f"));
  for (const side of [-1, 1]) {
    world.box(x + side * 3, 3, z + 7.32, 0.22, 6.2, 0.12, cream);
    const brace = world.box(x, 3, z + 7.34, 0.18, 8.2, 0.12, cream);
    brace.rotation.z = (side * Math.PI) / 4;
  }
  world.box(x, 6.1, z + 7.3, 6.3, 0.22, 0.12, cream);
  world.box(x, 11, z + 7.16, 2.1, 2.1, 0.12, cream);
  world.box(x, 11, z + 7.24, 1.6, 1.6, 0.12, roof);
}
