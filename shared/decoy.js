import { CONFIG } from "./config.js";
import {
  WALLS,
  BOUNDS,
  distance,
  movePlayer,
  segmentBox,
  overlapsFootprint,
} from "./map.js";
import { movementNoise } from "./movement.js";
export const DECOY_ACTIONS = {
  crouch: "Crouch",
  stand: "Stand up",
  move: "Move to trigger mark",
  prone: "Lie down",
  look: "Look at heading",
  wait: "Wait",
};
export const DEFAULT_DECOY_PROGRAM = {
  steps: [
    { type: "crouch", duration: 0.4 },
    { type: "move", speed: "walk" },
    { type: "prone", duration: 0.4 },
  ],
  repeats: 1,
};
export function validateProgram(value) {
  if (
    !value ||
    !Array.isArray(value.steps) ||
    value.steps.length < 1 ||
    value.steps.length > CONFIG.decoyMaxSteps
  )
    return null;
  const steps = [];
  for (const step of value.steps) {
    if (!step || !Object.hasOwn(DECOY_ACTIONS, step.type)) return null;
    const out = { type: step.type };
    // Only Look has a heading; a move always faces where it is walking.
    if (step.type === "look") {
      if (
        !Number.isFinite(step.heading) ||
        step.heading < 0 ||
        step.heading >= 360
      )
        return null;
      out.heading = step.heading;
    }
    if (step.type === "move") {
      if (!["walk", "sprint"].includes(step.speed)) return null;
      out.speed = step.speed;
    } else {
      if (
        !Number.isFinite(step.duration) ||
        step.duration < 0.1 ||
        step.duration > 30
      )
        return null;
      out.duration = step.duration;
    }
    steps.push(out);
  }
  if (
    !Number.isInteger(value.repeats) ||
    value.repeats < 1 ||
    value.repeats > 5
  )
    return null;
  return { steps, repeats: value.repeats };
}
export function freeDecoyPoint(p) {
  return (
    Math.abs(p.x) < BOUNDS.x - 0.5 &&
    Math.abs(p.z) < BOUNDS.z - 0.5 &&
    !WALLS.some(
      (w) =>
        !w.soft &&
        !w.leaf &&
        (w.bottom || 0) < 1.8 &&
        overlapsFootprint(w, p.x, p.z, 0.38),
    )
  );
}
function walkable(a, b) {
  // Hedges are walked through and doors opened, so neither blocks a route.
  return !WALLS.some(
    (w) =>
      !w.soft &&
      !w.leaf &&
      segmentBox({ ...a, y: 0.3 }, { ...b, y: 0.3 }, w, 0.36) !== null,
  );
}
// Which grid cells are open floor, kept between routes while the walls that
// matter stay the same (bots ask for routes many times a second).
let cellCache = new Map(),
  cellWalls = "";
function openCells() {
  let n = 0,
    h = 0;
  for (const w of WALLS)
    if (!w.soft && !w.leaf) {
      n++;
      h = (h * 31 + Math.round(w.x * 7 + w.z * 13 + w.w * 3 + w.d * 5)) | 0;
      h = (h * 31 + Math.round((w.h || 0) * 11 + (w.bottom || 0) * 17)) | 0;
    }
  const walls = `${n}:${h}:${BOUNDS.x}:${BOUNDS.z}`;
  if (walls !== cellWalls) {
    cellWalls = walls;
    cellCache = new Map();
  }
  return cellCache;
}
// Shortest walkable route from start to goal around walls and cover: A* over
// a 0.5 m grid (eight directions, no corner cutting), then pulled taut by
// skipping every waypoint the decoy can walk past in a straight line.
const CELL = 0.5;
// `limit` caps the cells searched, for a quick answer to "is it close?".
export function decoyPath(start, goal, limit = Infinity) {
  if (!freeDecoyPoint(start) || !freeDecoyPoint(goal)) return null;
  if (walkable(start, goal)) return [{ ...goal }];
  const center = (i, j) => ({ x: i * CELL, z: j * CELL }),
    key = (i, j) => `${i},${j}`,
    freeCache = openCells(),
    open = (i, j) => {
      const k = key(i, j);
      if (!freeCache.has(k)) freeCache.set(k, freeDecoyPoint(center(i, j)));
      return freeCache.get(k);
    };
  // The nearest open cell reachable in a straight line from a point.
  const snap = (p) => {
    const ci = Math.round(p.x / CELL),
      cj = Math.round(p.z / CELL);
    let best = null;
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const c = center(ci + di, cj + dj),
          d = distance(p, c);
        if ((!best || d < best.d) && open(ci + di, cj + dj) && walkable(p, c))
          best = { i: ci + di, j: cj + dj, d };
      }
    return best;
  };
  const from = snap(start),
    to = snap(goal);
  if (!from || !to) return null;
  const heuristic = (i, j) => {
      const dx = Math.abs(i - to.i),
        dz = Math.abs(j - to.j);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    },
    cost = new Map([[key(from.i, from.j), 0]]),
    came = new Map(),
    heap = new MinHeap();
  heap.push(heuristic(from.i, from.j), [from.i, from.j]);
  let found = false;
  while (heap.size && limit-- > 0) {
    const [i, j] = heap.pop(),
      k = key(i, j);
    if (i === to.i && j === to.j) {
      found = true;
      break;
    }
    const base = cost.get(k);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di,
          nj = j + dj;
        if (!open(ni, nj)) continue;
        // Diagonals only when both sides are open, so it never clips a corner.
        if (di && dj && (!open(i + di, j) || !open(i, j + dj))) continue;
        const nk = key(ni, nj),
          next = base + (di && dj ? Math.SQRT2 : 1);
        if (next >= (cost.get(nk) ?? Infinity)) continue;
        cost.set(nk, next);
        came.set(nk, k);
        heap.push(next + heuristic(ni, nj), [ni, nj]);
      }
  }
  if (!found) return null;
  const cells = [];
  for (let k = key(to.i, to.j); k; k = came.get(k)) {
    const [i, j] = k.split(",").map(Number);
    cells.unshift(center(i, j));
  }
  // Pull the route taut: from each point, jump to the farthest point it can
  // reach in a straight line.
  const points = [start, ...cells, goal],
    route = [];
  for (let at = 0; at < points.length - 1;) {
    let next = points.length - 1;
    while (next > at + 1 && !walkable(points[at], points[next])) next--;
    route.push({ x: points[next].x, z: points[next].z });
    at = next;
  }
  return route;
}
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(priority, value) {
    const items = this.items;
    items.push({ priority, value });
    for (let i = items.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items,
      top = items[0],
      last = items.pop();
    if (items.length) {
      items[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < items.length && items[l].priority < items[m].priority) m = l;
        if (r < items.length && items[r].priority < items[m].priority) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.value;
  }
}
export function stepDecoy(d, dt) {
  if (!d.active) return;
  d.remaining -= dt;
  if (d.remaining <= 0) {
    d.active = false;
    return;
  }
  const old = { x: d.x, z: d.z };
  if (d.step >= d.program.steps.length) {
    d.status = "Program complete";
    d.noise = "silent";
    d.moveSpeed = 0;
    return;
  }
  const action = d.program.steps[d.step];
  if (d.entered !== d.step) {
    d.entered = d.step;
    d.elapsed = 0;
    d.status = DECOY_ACTIONS[action.type];
    if (action.type === "crouch") {
      d.crouch = true;
      d.prone = false;
    }
    if (action.type === "stand") {
      d.crouch = false;
      d.prone = false;
    }
    if (action.type === "prone") {
      d.crouch = false;
      d.prone = true;
    }
    if (action.heading !== undefined) d.yaw = (-action.heading * Math.PI) / 180;
    if (action.type === "move") {
      d.path = decoyPath(d, d.mark);
      if (!d.path) {
        d.status = "Mark unreachable";
        d.step = d.program.steps.length;
        d.noise = "silent";
        return;
      }
    }
  }
  d.elapsed += dt;
  let complete = false;
  if (action.type === "move") {
    const next = d.path[0];
    if (!next) complete = true;
    else {
      const length = distance(d, next),
        speed = d.prone
          ? CONFIG.proneSpeed
          : d.crouch
            ? CONFIG.crouchSpeed
            : action.speed === "sprint"
              ? CONFIG.sprintSpeed
              : CONFIG.walkSpeed;
      const travel = Math.min(length, speed * dt);
      // Walk straight at the next point, facing the way it's going.
      if (length > 0.001) d.yaw = Math.atan2(d.x - next.x, d.z - next.z);
      if (length > 0.001)
        movePlayer(
          d,
          ((next.x - d.x) / length) * travel,
          ((next.z - d.z) / length) * travel,
        );
      if (distance(d, next) < 0.08) d.path.shift();
      complete = d.path.length === 0;
    }
  } else complete = d.elapsed >= action.duration;
  d.moveSpeed = distance(d, old) / dt;
  d.noise = movementNoise(d, d.moveSpeed);
  if (complete) {
    d.step++;
    if (d.step >= d.program.steps.length && d.cycle + 1 < d.program.repeats) {
      d.cycle++;
      d.step = 0;
      d.entered = -1;
    }
  }
}
