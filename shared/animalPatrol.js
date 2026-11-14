const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const FLIGHT = 0.43;
export const CAPTURE = 1.45;
export const BREAKOUT = 0.38;
export const BALLS = [
  { id: "poke", name: "Poké Ball", stock: Infinity, chance: 0.75 },
  { id: "great", name: "Great Ball", stock: 3, chance: 0.9 },
  { id: "ultra", name: "Ultra Ball", stock: 2, chance: 0.97 },
  { id: "master", name: "Master Ball", stock: 1, chance: 1 },
];
export const LAUNCH = { x: 0.5, y: 0.83 };
export const CLEARING = { left: 0.13, right: 0.87, top: 0.36, bottom: 0.75 };

export const SCENES = [
  {
    name: "Forest Clearing",
    theme: "forest",
    critters: [["fox", 0.45, 0.56]],
    cover: [],
  },
  {
    name: "Creek Bend",
    theme: "creek",
    critters: [
      ["bunny", 0.25, 0.54],
      ["squirrel", 0.74, 0.65],
    ],
    cover: [{ kind: "rock", x: 0.49, y: 0.57, width: 0.19, height: 0.16 }],
  },
  {
    name: "Twilight Grove",
    theme: "grove",
    critters: [
      ["fox", 0.17, 0.65],
      ["raccoon", 0.51, 0.64],
      ["squirrel", 0.82, 0.57],
    ],
    cover: [
      { kind: "tree", x: 0.32, y: 0.48, width: 0.15, height: 0.32 },
      { kind: "rock", x: 0.64, y: 0.62, width: 0.17, height: 0.16 },
    ],
  },
];

export function createPatrol(scene = SCENES[0], supply) {
  return {
    critters: scene.critters.map(([kind, x, y], index) => ({
      kind,
      x,
      y,
      facing: 1,
      move: null,
      nextMove: 2.5 + index * 0.35,
      caught: false,
    })),
    cover: scene.cover,
    supply: supply
      ? { ...supply }
      : Object.fromEntries(BALLS.map(({ id, stock }) => [id, stock])),
    selected: "poke",
    caught: 0,
    shot: null,
    capture: null,
    throws: 0,
    time: 0,
    status: "ready",
  };
}

export function coverAt(patrol, x, y) {
  return patrol.cover.find(
    (cover) =>
      Math.abs(x - cover.x) < cover.width * 0.43 &&
      Math.abs(y - cover.y) < cover.height * 0.38,
  );
}

function moveTo(critter, time, x, y, duration) {
  const destX = clamp(x, CLEARING.left, CLEARING.right);
  const destY = clamp(y, CLEARING.top, CLEARING.bottom);
  if (Math.abs(destX - critter.x) > 0.005)
    critter.facing = Math.sign(destX - critter.x);
  critter.move = {
    x: critter.x,
    y: critter.y,
    destX,
    destY,
    start: time,
    duration,
  };
}

const distance = (point, critter) =>
  Math.hypot(
    (point.x - critter.x) / point.reach.x,
    (point.y - critter.y) / point.reach.y,
  );

function closest(patrol, point, limit) {
  let target;
  for (const critter of patrol.critters) {
    if (critter.caught || coverAt(patrol, critter.x, critter.y)) continue;
    const gap = distance(point, critter);
    if (gap > limit) continue;
    target = critter;
    limit = gap;
  }
  return target;
}

export function throwBall(patrol, x, y, reach, random = Math.random) {
  if (patrol.shot || patrol.capture || patrol.status === "complete")
    return false;
  const type = BALLS.find(({ id }) => id === patrol.selected);
  if (!type || patrol.supply[type.id] <= 0) return false;
  patrol.supply[type.id]--;
  if (!patrol.supply[type.id]) patrol.selected = "poke";
  const shot = { x, y, reach, start: patrol.time, dodge: null, type };
  if (!coverAt(patrol, x, y)) {
    const target = closest(patrol, shot, 2);
    if (target && random() < 0.2) shot.dodge = target;
  }
  patrol.shot = shot;
  patrol.throws++;
  patrol.status = "flying";
  return true;
}

export function stepPatrol(patrol, dt, random = Math.random) {
  patrol.time += dt;
  const { time, shot, capture } = patrol;
  if (capture) {
    const elapsed = time - capture.start;
    if (elapsed < CAPTURE) return;
    if (capture.escapes) {
      patrol.status = "escaped";
      if (elapsed >= CAPTURE + BREAKOUT) {
        capture.critter.move = null;
        capture.critter.nextMove = time + 2.5;
        patrol.capture = null;
      }
    } else {
      capture.critter.caught = true;
      patrol.caught++;
      patrol.capture = null;
      patrol.status =
        patrol.caught === patrol.critters.length ? "complete" : "caught";
    }
    return;
  }

  for (const critter of patrol.critters) {
    if (critter.caught) continue;
    const { move } = critter;
    if (move) {
      const t = clamp((time - move.start) / move.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);
      critter.x = move.x + (move.destX - move.x) * eased;
      critter.y = move.y + (move.destY - move.y) * eased;
      if (t === 1) critter.move = null;
    } else if (time >= critter.nextMove && !shot) {
      const hiding = coverAt(patrol, critter.x, critter.y);
      const shelter =
        !hiding && patrol.cover.length && random() < 0.3
          ? patrol.cover[Math.floor(random() * patrol.cover.length)]
          : null;
      const x = shelter ? shelter.x : critter.x + (random() - 0.5) * 0.47;
      const y = hiding
        ? hiding.y + hiding.height * 0.46
        : shelter
          ? shelter.y
          : critter.y + (random() - 0.5) * 0.29;
      const duration = 0.3 + random() * 0.35;
      moveTo(critter, time, x, y, duration);
      critter.nextMove = time + duration + (shelter ? 1.1 : 2.4 + random());
    }
  }
  if (!shot) return;
  if (shot.dodge && time - shot.start >= 0.17) {
    const critter = shot.dodge;
    const direction =
      critter.x < 0.28
        ? 1
        : critter.x > 0.72
          ? -1
          : critter.x < shot.x
            ? -1
            : 1;
    moveTo(
      critter,
      time,
      critter.x + direction * 0.19,
      critter.y + (critter.y < 0.55 ? 0.08 : -0.08),
      0.3,
    );
    critter.nextMove = time + 2.7;
    shot.dodge = null;
  }
  if (time - shot.start < FLIGHT) return;
  patrol.shot = null;
  const blocked = coverAt(patrol, shot.x, shot.y);
  const critter = !blocked && closest(patrol, shot, 1);
  if (critter) {
    patrol.capture = {
      x: critter.x,
      y: critter.y,
      start: time,
      critter,
      type: shot.type,
      escapes: shot.type.chance < 1 && random() >= shot.type.chance,
    };
    patrol.status = "capturing";
  } else {
    patrol.status = blocked ? "blocked" : "miss";
  }
}
