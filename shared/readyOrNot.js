export const HIDE_TIME = 15;
export const SEEK_TIME = 90;
const SEEKER_TIMES = { easy: Infinity, normal: 120, hard: 60 };
export const PORCH = { x: 0, z: 8 };
export const LIMIT = { x: 14.5, east: 21.5, z: 15.5 };
export const WALLS = [
  [-8, 0, 0.35, 12],
  [8, -3.9, 0.35, 4.2],
  [8, 4.15, 0.35, 3.7],
  [15, 0, 0.35, 12],
  [11.5, -6, 7, 0.35],
  [11.5, 6, 7, 0.35],
  [9.5, 2, 3, 0.25],
  [14, 2, 2, 0.25],
  [9.4, -2, 2.8, 0.25],
  [13.95, -2, 2.1, 0.25],
  [-4.65, 6, 6.7, 0.35],
  [4.65, 6, 6.7, 0.35],
  [-5.55, -6, 4.9, 0.35],
  [3.7, -6, 8.6, 0.35],
  [0, 4.2, 0.25, 3.6],
  [0, -3.8, 0.25, 4.4],
  [1.2, 0, 2.4, 0.25],
  [6.3, 0, 3.4, 0.25],
];
export const FURNITURE = [
  { kind: "couch", x: -5, z: 2.5, w: 3.5, d: 1.25, h: 1.1 },
  { kind: "bed", x: 5.8, z: 3.4, w: 2.4, d: 3.1, h: 0.75 },
  { kind: "table", x: 4.9, z: -3.3, w: 2.6, d: 1.55, h: 0.95 },
  { kind: "counter", x: 7.2, z: -3.7, w: 1, d: 3.5, h: 1 },
  { kind: "shelf", x: -7.25, z: -3.9, w: 0.9, d: 2.6, h: 1.4 },
  { kind: "shed", x: -10.9, z: -11, w: 3.2, d: 3, h: 2.65 },
  { kind: "tree", x: 8.8, z: -11.5, w: 0.85, d: 0.85, h: 3.7 },
  { kind: "bench", x: 0, z: -10.3, w: 2.4, d: 0.8, h: 0.8 },
  { kind: "bed", x: 13, z: 4.25, w: 2.4, d: 2.7, h: 0.75 },
  { kind: "bed", x: 13.15, z: -4.25, w: 2.4, d: 2.7, h: 0.75 },
  { kind: "table", x: 12, z: 0, w: 2.6, d: 1.55, h: 0.95 },
  { kind: "table", x: 10, z: 4.8, w: 2, d: 1.35, h: 0.95 },
  { kind: "table", x: 10, z: -4.9, w: 2, d: 1.35, h: 0.95 },
  { kind: "bins", x: 10.5, z: 10, w: 2.15, d: 1, h: 1.15 },
];
export const SPOTS = [
  { name: "Behind the couch", x: -5, z: 1.3, kind: "cover" },
  { name: "Coat closet", x: 4.25, z: 1.5, kind: "closet" },
  { name: "Front hedge", x: -9.9, z: 11, kind: "bush" },
  { name: "Flower bushes", x: 17.6, z: 5, kind: "bush" },
  { name: "Tree canopy", x: 8.8, z: -10.2, kind: "tree" },
  { name: "Backyard bushes", x: -4.9, z: -12.7, kind: "bush" },
  { name: "Behind the shed", x: -11, z: -13.3, kind: "cover" },
  { name: "Behind the bins", x: 10.5, z: 9.05, kind: "cover" },
  { name: "Laundry cupboard", x: -5.9, z: -4.55, kind: "closet" },
  { name: "Blanket fort", x: -4.9, z: -1.6, kind: "fort" },
  { name: "Under the couch", x: -5, z: 3.65, kind: "under" },
  { name: "Under the bed", x: 3.95, z: 3.4, kind: "under" },
  { name: "Under the kitchen table", x: 4.9, z: -1.95, kind: "under" },
  { name: "Living room closet", x: -6.65, z: 4.75, kind: "closet" },
  { name: "Hall closet", x: 2.15, z: 4.8, kind: "closet" },
  { name: "Kitchen pantry", x: 1.65, z: -4.75, kind: "closet" },
  { name: "Porch bushes", x: 4.1, z: 7.65, kind: "bush" },
  { name: "Front fence bushes", x: -5.1, z: 14.1, kind: "bush" },
  { name: "Driveway bushes", x: 7, z: 12.2, kind: "bush" },
  { name: "West side bushes", x: -12.6, z: 1.2, kind: "bush" },
  { name: "East side bushes", x: 19, z: -2.2, kind: "bush" },
  { name: "Deck bushes", x: -6.9, z: -8.25, kind: "bush" },
  { name: "Back fence bushes", x: 1.9, z: -14, kind: "bush" },
  { name: "Corner bushes", x: 12.8, z: -13.6, kind: "bush" },
  { name: "Inside the backyard shed", x: -10.9, z: -9.05, kind: "shed" },
  { name: "Under the guest bed", x: 11.25, z: 3.85, kind: "under" },
  { name: "Under the kids’ bed", x: 11.35, z: -3.8, kind: "under" },
  { name: "Under the dining table", x: 12, z: 1.28, kind: "under" },
  { name: "Under the guest room table", x: 10, z: 3.65, kind: "under" },
  { name: "Under the craft table", x: 10, z: -3.75, kind: "under" },
  { name: "Under the garden bench", x: 0, z: -9.35, kind: "under" },
];

const closets = SPOTS.filter((spot) => spot.kind === "closet").map((spot) => ({
  x: spot.x,
  z: spot.z - 0.95,
  w: 1.52,
  d: 0.92,
  h: 1.92,
}));
const obstacles = [
  ...closets,
  ...WALLS.map(([x, z, w, d]) => ({ x, z, w, d, h: 3 })),
  ...FURNITURE,
];
const radius = 0.28;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (x, z, box, padding = 0) =>
  Math.abs(x - box.x) < box.w / 2 + padding &&
  Math.abs(z - box.z) < box.d / 2 + padding;

function walkable(x, z) {
  return (
    x >= -LIMIT.x &&
    x <= LIMIT.east &&
    Math.abs(z) <= LIMIT.z &&
    !obstacles.some((box) => inside(x, z, box, radius))
  );
}

export function move(actor, x, z, step) {
  const old = { x: actor.x, z: actor.z };
  if (walkable(actor.x + x * step, actor.z)) actor.x += x * step;
  if (walkable(actor.x, actor.z + z * step)) actor.z += z * step;
  if (x || z) actor.yaw = Math.atan2(x, z);
  return distance(actor, old);
}

export function clearSight(from, to) {
  const length = distance(from, to);
  const fromEye = from.crouch ? 0.52 : 1.25;
  const toEye = to.crouch ? 0.47 : 1.15;
  for (let offset = 0.16; offset < length; offset += 0.16) {
    const t = offset / length;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const height = fromEye + (toEye - fromEye) * t;
    if (obstacles.some((box) => box.h >= height && inside(x, z, box)))
      return false;
  }
  return true;
}

export function visibleTo(observer, target, range, cone = -1) {
  if (target.hidden || target.tagged) return false;
  const gap = distance(observer, target);
  if (gap > range) return false;
  const facing =
    Math.sin(observer.yaw) * (target.x - observer.x) +
    Math.cos(observer.yaw) * (target.z - observer.z);
  return (gap < 1.4 || facing >= gap * cone) && clearSight(observer, target);
}

// The same collision geometry is used for the player and for grid paths.
const spacing = 0.5;
const width = (LIMIT.x + LIMIT.east) / spacing + 1;
const depth = (LIMIT.z * 2) / spacing + 1;
const grid = Array.from({ length: width * depth }, (_, i) => {
  const x = (i % width) * spacing - LIMIT.x;
  const z = Math.floor(i / width) * spacing - LIMIT.z;
  return walkable(x, z) ? { x, z } : null;
});
const neighbors = grid.map((point, i) => {
  if (!point) return [];
  return [
    i - width,
    i + width,
    i % width ? i - 1 : -1,
    i % width < width - 1 ? i + 1 : -1,
  ].filter((index) => {
    const next = grid[index];
    return next && walkable((point.x + next.x) / 2, (point.z + next.z) / 2);
  });
});

function nearestCell(point) {
  let index = -1;
  let best = Infinity;
  grid.forEach((cell, i) => {
    if (!cell) return;
    const gap = distance(cell, point);
    if (gap < best) {
      best = gap;
      index = i;
    }
  });
  return index;
}

export function route(from, to) {
  const start = nearestCell(from);
  const end = nearestCell(to);
  const parents = new Int32Array(grid.length).fill(-1);
  parents[start] = start;
  const queue = [start];
  for (let i = 0; i < queue.length && parents[end] < 0; i++) {
    const current = queue[i];
    for (const next of neighbors[current]) {
      if (parents[next] >= 0) continue;
      parents[next] = current;
      queue.push(next);
    }
  }
  if (parents[end] < 0) return [];
  const path = [to];
  for (let current = end; current !== start; current = parents[current]) {
    path.push(grid[current]);
  }
  return path.reverse();
}

export function follow(actor, path, speed, dt) {
  while (path.length && distance(actor, path[0]) < 0.07) path.shift();
  if (!path.length) return 0;
  const next = path[0];
  const gap = distance(actor, next);
  return (
    move(
      actor,
      (next.x - actor.x) / gap,
      (next.z - actor.z) / gap,
      Math.min(gap, speed * dt),
    ) / dt
  );
}

const settings = {
  easy: { speed: 3.15, sight: 5.5, hearing: 4, wait: 1.9, checks: 4 },
  normal: { speed: 3.7, sight: 7.25, hearing: 6, wait: 1.4, checks: 6 },
  hard: { speed: 4.2, sight: 8.5, hearing: 8, wait: 0.9, checks: 7 },
};
const actor = (point, yaw = Math.PI) => ({
  x: point.x,
  z: point.z,
  yaw,
  speed: 0,
  crouch: false,
  hidden: null,
  tagged: false,
});
const shuffled = (values, random) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export function createRound(role, level, random = Math.random) {
  const difficulty = settings[level] ?? settings.normal;
  const seeking = role === "seek";
  const seeker = actor(PORCH);
  const hiders = [-1.7, 0, 1.7].map((x) => actor({ x, z: 9.5 }));
  const destinations = shuffled(SPOTS, random).slice(0, hiders.length);
  hiders.forEach((hider, i) => {
    const spot = destinations[i];
    if (seeking) {
      Object.assign(hider, actor(spot), {
        hidden: spot,
      });
    } else if (i > 0) {
      hider.destination = spot;
      hider.path = route(hider, spot);
    }
  });
  return {
    role,
    seeker,
    hiders,
    player: seeking ? seeker : hiders[0],
    phase: seeking ? "seek" : "hide",
    time: seeking ? (SEEKER_TIMES[level] ?? SEEKER_TIMES.normal) : HIDE_TIME,
    won: false,
    settings: difficulty,
    patrol: shuffled(
      [
        ...shuffled(SPOTS, random).slice(0, difficulty.checks),
        { x: -10.7, z: -0.6 },
        { x: 10.8, z: -2.5 },
        { x: 2.5, z: 11 },
        { x: 1.8, z: -10.5 },
      ],
      random,
    ),
    path: [],
    wait: 0,
    replan: 0,
    noise: 0,
    message: "",
    messageTime: 0,
  };
}

export const remaining = (round) =>
  round.hiders.filter((hider) => !hider.tagged).length;

function say(round, message) {
  round.message = message;
  round.messageTime = 2.4;
}

function finish(round) {
  round.phase = "done";
  round.won =
    round.role === "seek" ? remaining(round) === 0 : !round.player.tagged;
}

function tag(round, hider) {
  hider.foundAt = hider.hidden;
  hider.tagged = true;
  hider.speed = 0;
  hider.crouch = false;
  hider.hidden = null;
  say(round, hider === round.player ? "You got tagged!" : "Found one!");
  if (hider === round.player || !remaining(round)) finish(round);
}

export function nearbySpot(round) {
  let nearest = null;
  let best = 1.45;
  for (const spot of SPOTS) {
    const gap = distance(round.player, spot);
    if (gap >= best || !clearSight(round.player, spot)) continue;
    nearest = spot;
    best = gap;
  }
  return nearest;
}

export function tagTarget(round) {
  return round.hiders.find((hider) => visibleTo(round.seeker, hider, 1.3));
}

export function interact(round) {
  if (round.phase === "done") return;
  if (round.role === "hide") {
    if (round.player.hidden) {
      round.player.hidden = null;
      say(round, "You left your hiding spot.");
    } else {
      const spot = nearbySpot(round);
      if (!spot) return;
      Object.assign(round.player, {
        x: spot.x,
        z: spot.z,
        hidden: spot,
        speed: 0,
      });
      say(round, `Hidden · ${spot.name}`);
      if (spot.kind === "bush" && round.phase === "seek") round.noise = 0.4;
    }
    return;
  }
  if (round.phase !== "seek") return;
  const target = tagTarget(round);
  if (target) {
    tag(round, target);
    return;
  }
  const spot = nearbySpot(round);
  if (!spot) return;
  const found = round.hiders.find(
    (hider) => hider.hidden === spot && !hider.tagged,
  );
  if (found) tag(round, found);
  else say(round, `${spot.name} is empty.`);
}

function search(round, dt) {
  const { seeker, settings, player } = round;
  round.replan -= dt;
  const seen = round.hiders
    .filter((hider) => visibleTo(seeker, hider, settings.sight, 0.3))
    .sort((a, b) => distance(seeker, a) - distance(seeker, b))[0];
  if (seen && distance(seeker, seen) < 1.2) {
    tag(round, seen);
    round.investigate = null;
    return;
  }
  const heard = round.noise > 0 && distance(seeker, player) < settings.hearing;
  if ((seen || heard) && round.replan <= 0) {
    round.investigate = { x: (seen ?? player).x, z: (seen ?? player).z };
    round.path = route(seeker, round.investigate);
    round.replan = 0.48;
    round.wait = 0;
    if (heard && !seen && round.messageTime <= 0)
      say(round, "The seeker heard a sound!");
  }
  if (round.path.length) {
    seeker.speed = follow(seeker, round.path, settings.speed, dt);
    return;
  }
  seeker.speed = 0;
  if (round.investigate) {
    const spot = SPOTS.find(
      (place) => place.kind && distance(place, round.investigate) < 0.9,
    );
    const found = spot && round.hiders.find((hider) => hider.hidden === spot);
    if (found && distance(seeker, spot) < 1.35) tag(round, found);
    round.investigate = null;
    round.path = round.checking ? route(seeker, round.checking) : [];
    round.wait = settings.wait;
    return;
  }
  if (round.wait > 0) {
    round.wait -= dt;
    return;
  }
  if (round.checking) {
    const found = round.hiders.find(
      (hider) => hider.hidden === round.checking && !hider.tagged,
    );
    if (found && distance(seeker, round.checking) < 1.35) tag(round, found);
  }
  round.checking = round.patrol.shift();
  round.patrol.push(round.checking);
  round.path = route(seeker, round.checking);
  round.wait = settings.wait;
}

export function stepRound(
  round,
  dt,
  { x = 0, z = 0, crouch = false, sprint = false } = {},
) {
  if (round.phase === "done" || dt <= 0) return;
  round.time = Math.max(0, round.time - dt);
  round.messageTime -= dt;
  round.noise -= dt;
  if (!round.time) {
    if (round.phase === "seek") {
      finish(round);
      return;
    }
    round.phase = "seek";
    round.time = SEEK_TIME;
    say(round, "Ready or not, here I come!");
  }

  const { player } = round;
  const hiding = round.role === "hide";
  const canMove = !player.hidden && (hiding || round.phase === "seek");
  player.crouch = hiding && crouch;
  const speed = player.crouch ? 2 : sprint ? 5.1 : 3.65;
  const length = Math.max(1, Math.hypot(x, z));
  player.speed = canMove
    ? move(player, x / length, z / length, speed * dt) / dt
    : 0;
  if (hiding && player.speed > 4.1) round.noise = 0.25;

  for (const hider of round.hiders) {
    if (!hider.path?.length || hider.tagged || hider.hidden) continue;
    hider.speed = follow(hider, hider.path, 3.9, dt);
    if (distance(hider, hider.destination) < 0.12) {
      hider.speed = 0;
      hider.hidden = hider.destination;
    }
  }
  if (hiding && round.phase === "seek") search(round, dt);
}
