import { Vector3 } from "three";

// Fit the entire fence volume with space for the HUD. A raised angle
// shows more of the lawn while keeping the yard centered.
export function frameSprinklerYard(camera, map) {
  const corners = [];
  for (const x of [-map.size.x - 1, map.size.x + 1])
    for (const z of [-map.size.z - 0.7, map.size.z + 0.7])
      for (const y of [0, 1.4]) corners.push(new Vector3(x, y, z));
  const direction = new Vector3(0, 0.65, 1).normalize();
  const up = new Vector3(0, direction.z, -direction.y);
  const tanY = Math.tan((camera.fov * Math.PI) / 360);
  const tanX = tanY * camera.aspect;
  let distance = 0;
  for (const p of corners) {
    const depth = p.dot(direction);
    distance = Math.max(
      distance,
      depth + Math.abs(p.x) / (tanX * 0.82),
      depth + Math.abs(p.dot(up)) / (tanY * 0.7),
    );
  }
  camera.position.copy(direction).multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  // Center the projected bounds, compensating for perspective foreshortening.
  const projected = corners.map((p) => p.clone().project(camera));
  const center =
    (Math.min(...projected.map((p) => p.y)) +
      Math.max(...projected.map((p) => p.y))) /
    2;
  const shift = up.clone().multiplyScalar(center * distance * tanY);
  camera.position.add(shift);
  camera.lookAt(shift);
  camera.updateMatrixWorld();
}
