// Pop Patrol: a backyard tower defense. The neighbour's bubble machine
// blows soap bubbles through a gap in the fence; they float along the
// stepping-stone path to the back door. Backyard defenders placed on the
// lawn pop them first. Each pop strips one layer of soap: a pink bubble
// becomes yellow, then green, blue and clear, and a clear one is gone.
// Rainbow bubbles burst into two pinks, and a Big Soapy into three rainbows.
//
// The yard is the x–z plane: x from -18 (the bubble machine) to 18, z from
// -11 (the house) to 11 (nearest the camera). Everything here is plain data
// so the tests can play whole games without a renderer.

export const YARD = { minX: -17, maxX: 17, minZ: -10, maxZ: 10 };
export const PATH_HALF = 1.2; // half the width of the path
export const TOWER_RADIUS = 0.8;
export const TOWER_GAP = 1.7; // closest two defenders can stand

// The stepping-stone path, from the fence gap to the back door.
export const PATH = [
  [-19, -6],
  [-11, -6],
  [-11, 6],
  [-3, 6],
  [-3, -5],
  [5, -5],
  [5, 7],
  [13, 7],
  [13, -10.5],
];

// Places nothing can be built: trees, the kiddie pool, the sandbox.
export const OBSTACLES = [
  { kind: "tree", x: -15.5, z: 3, r: 1.7 },
  { kind: "tree", x: 16, z: 3.5, r: 1.6 },
  { kind: "tree", x: 1, z: 9, r: 1.5 },
  { kind: "pool", x: 9, z: 0.5, r: 2 },
  { kind: "sandbox", x: -7, z: -9, r: 1.6 },
];

const SEGMENTS = [];
let total = 0;
for (let i = 1; i < PATH.length; i++) {
  const [ax, az] = PATH[i - 1];
  const [bx, bz] = PATH[i];
  const length = Math.hypot(bx - ax, bz - az);
  SEGMENTS.push({ ax, az, bx, bz, length, start: total });
  total += length;
}
export const PATH_LENGTH = total;

// Where a bubble `d` metres along the path is.
export function pointAt(d) {
  const clamped = Math.max(0, Math.min(PATH_LENGTH, d));
  for (const s of SEGMENTS) {
    if (clamped <= s.start + s.length || s === SEGMENTS.at(-1)) {
      const t = (clamped - s.start) / s.length;
      return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t };
    }
  }
}

export function distanceToPath(x, z) {
  let best = Infinity;
  for (const s of SEGMENTS) {
    const dx = s.bx - s.ax,
      dz = s.bz - s.az;
    const t = Math.max(
      0,
      Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / s.length ** 2),
    );
    best = Math.min(best, Math.hypot(x - s.ax - dx * t, z - s.az - dz * t));
  }
  return best;
}

// Bubble kinds, weakest first. A popped layer drops to the kind below; the
// two big ones have hit points and burst into `children`.
export const BUBBLES = [
  { name: "Clear", speed: 2.8, radius: 0.42, color: "#e8f7ff", lives: 1 },
  { name: "Blue", speed: 3.2, radius: 0.47, color: "#5fb2ff", lives: 2 },
  { name: "Green", speed: 3.6, radius: 0.52, color: "#5ddb6e", lives: 3 },
  { name: "Yellow", speed: 4.4, radius: 0.55, color: "#ffd83a", lives: 4 },
  { name: "Pink", speed: 5, radius: 0.58, color: "#ff6fc2", lives: 5 },
  {
    name: "Rainbow",
    speed: 2.9,
    radius: 0.72,
    color: "#b58cff",
    lives: 10,
    hp: 4,
    children: [4, 4],
  },
  {
    name: "Big Soapy",
    speed: 1.25,
    radius: 1.35,
    color: "#9fe8ff",
    lives: 40,
    hp: 70,
    children: [5, 5, 5],
    giant: true,
  },
];
export const RAINBOW = 5;
export const GIANT = 6;

// Layers (pops) in a whole bubble, children included.
export function layers(tier) {
  const b = BUBBLES[tier];
  if (!b.hp) return tier + 1;
  return b.hp + b.children.reduce((sum, c) => sum + layers(c), 0);
}

export const LEVELS = {
  easy: { lives: 150, cash: 750, waves: 15, speed: 0.85, count: 0.8, gap: 1.2 },
  normal: { lives: 100, cash: 650, waves: 20, speed: 1, count: 1, gap: 1 },
  hard: { lives: 80, cash: 650, waves: 25, speed: 1.05, count: 1.15, gap: 0.9 },
};
export const levelSettings = (level) => LEVELS[level] ?? LEVELS.normal;

// The defenders. `base` is the unbought stats; each has two upgrade paths of
// two steps. An upgrade adds (`add`), multiplies (`mul`) or sets (`set`)
// stats. Stats: range (m), rate (seconds between shots), damage (layers per
// hit), pierce (bubbles a pinecone can pass through), shots (pinecones per
// throw), targets (bubbles per burst or squirt), splash (balloon radius),
// slow (speed multiplier inside a fan's breeze), popRate (fan pops).
export const TOWERS = {
  gnome: {
    name: "Pinecone Gnome",
    icon: "🍄",
    blurb: "Throws pinecones that pop a couple of bubbles in a row.",
    cost: 170,
    base: { range: 5, rate: 0.95, damage: 1, pierce: 2, shots: 1, speed: 19 },
    paths: [
      [
        { name: "Pointy Pinecones", cost: 110, add: { pierce: 2 } },
        { name: "Pinecone Spray", cost: 380, set: { shots: 3 } },
      ],
      [
        { name: "Quick Hands", cost: 140, mul: { rate: 0.68 } },
        { name: "Long Throw", cost: 180, add: { range: 2 } },
      ],
    ],
  },
  sprinkler: {
    name: "Sprinkler",
    icon: "💦",
    blurb: "Sprays all around, popping every bubble close by.",
    cost: 260,
    base: { range: 3, rate: 1.15, damage: 1, targets: 10 },
    paths: [
      [
        { name: "Turbo Spray", cost: 180, mul: { rate: 0.65 } },
        { name: "Super Soak", cost: 420, add: { damage: 1 } },
      ],
      [
        { name: "Wide Spray", cost: 160, add: { range: 1 } },
        { name: "Jet Ring", cost: 320, add: { range: 0.8, targets: 10 } },
      ],
    ],
  },
  catapult: {
    name: "Balloon Catapult",
    icon: "🎈",
    blurb: "Lobs water balloons that splash a whole bunch at once.",
    cost: 420,
    base: { range: 6.5, rate: 1.6, damage: 1, splash: 1.5, targets: 16 },
    paths: [
      [
        {
          name: "Bigger Balloons",
          cost: 260,
          add: { splash: 0.8, targets: 10 },
        },
        { name: "Mega Splash", cost: 600, add: { damage: 2 } },
      ],
      [
        { name: "Quick Reload", cost: 240, mul: { rate: 0.7 } },
        { name: "Far Fling", cost: 200, add: { range: 2.5 } },
      ],
    ],
  },
  fan: {
    name: "Breezy Fan",
    icon: "🌀",
    blurb: "Blows a breeze that slows down every bubble near it.",
    cost: 320,
    base: { range: 3.6, slow: 0.55, popRate: 0, damage: 1, targets: 20 },
    paths: [
      [
        { name: "Big Gust", cost: 200, add: { range: 1.2 } },
        { name: "Gale", cost: 350, set: { slow: 0.38 } },
      ],
      [
        { name: "Prickly Breeze", cost: 300, set: { popRate: 1.6 } },
        { name: "Whirlwind", cost: 500, set: { popRate: 0.75 } },
      ],
    ],
  },
  frog: {
    name: "Squirt Frog",
    icon: "🐸",
    blurb: "A super-fast water squirter. Great against big bubbles.",
    cost: 550,
    base: { range: 5.5, rate: 0.2, damage: 1, targets: 1 },
    paths: [
      [
        { name: "High Pressure", cost: 500, add: { damage: 1 } },
        { name: "Fire Hose", cost: 900, mul: { rate: 0.5 } },
      ],
      [
        { name: "Eagle Eye", cost: 250, add: { range: 2.5 } },
        { name: "Double Squirt", cost: 650, set: { targets: 2 } },
      ],
    ],
  },
};
export const TOWER_KINDS = Object.keys(TOWERS);
export const TARGETING = ["first", "last", "strong", "close"];
export const TARGET_NAMES = {
  first: "First",
  last: "Last",
  strong: "Strongest",
  close: "Closest",
};
export const SELL_BACK = 0.7;

export function towerStats(tower) {
  const def = TOWERS[tower.kind];
  const stats = { ...def.base };
  def.paths.forEach((path, p) => {
    for (const u of path.slice(0, tower.levels[p])) {
      for (const [k, v] of Object.entries(u.add ?? {})) stats[k] += v;
      for (const [k, v] of Object.entries(u.mul ?? {})) stats[k] *= v;
      Object.assign(stats, u.set);
    }
  });
  return stats;
}

// The next upgrade on a path, or null when the path is finished.
export const nextUpgrade = (tower, path) =>
  TOWERS[tower.kind].paths[path][tower.levels[path]] ?? null;

export const sellValue = (tower) => Math.floor(tower.spent * SELL_BACK);

// The groups of bubbles in wave `n` (1-based): [{ tier, count, gap }].
const INTRO = [1, 2, 4, 6, 8];
export function waveGroups(n, settings = LEVELS.normal) {
  const groups = [];
  const gap = Math.max(0.16, 0.9 - n * 0.03) * settings.gap;
  INTRO.forEach((intro, tier) => {
    if (n < intro) return;
    const age = n - intro;
    const count = age < 6 ? 6 + age * 2.5 : 21 - (age - 6) * 2.5;
    const scaled = Math.round(Math.max(0, count) * settings.count);
    if (scaled > 0)
      groups.push({ tier, count: scaled, gap: gap * (tier >= 3 ? 1.3 : 1) });
  });
  // Old kinds come back in bulk now and then, so sprinklers keep their job.
  if (n >= 12 && n % 3 === 0)
    groups.unshift({
      tier: 2,
      count: Math.round((10 + n) * settings.count),
      gap: gap * 0.5,
    });
  if (n >= 11)
    groups.push({
      tier: RAINBOW,
      count: Math.max(1, Math.round((1 + (n - 11) * 0.8) * settings.count)),
      gap: 1.3 * settings.gap,
    });
  const last = n === settings.waves;
  if (n >= 15 && ((n - 15) % 3 === 0 || last))
    groups.push({
      tier: GIANT,
      count: 1 + Math.floor((n - 15) / 6) + (last && n > 15 ? 1 : 0),
      gap: 5,
    });
  return groups;
}

// Every bubble of a wave with the second it leaves the machine.
export function waveSpawns(n, settings) {
  const spawns = [];
  let at = 0;
  for (const g of waveGroups(n, settings)) {
    for (let i = 0; i < g.count; i++)
      spawns.push({ at: at + i * g.gap, tier: g.tier });
    at += g.count * g.gap * 0.65 + 1;
  }
  return spawns.sort((a, b) => a.at - b.at);
}

export const waveBonus = (n) => 90 + n * 6;

export function createGame(level = "normal") {
  const settings = levelSettings(level);
  return {
    level,
    settings,
    cash: settings.cash,
    lives: settings.lives,
    wave: 0, // waves started
    waveActive: false,
    waveTime: 0,
    spawns: [],
    bubbles: [],
    towers: [],
    shots: [],
    nextId: 1,
    popped: 0,
    leaked: 0,
    over: null, // "won" | "lost"
  };
}

export function canPlace(game, x, z, ignore) {
  if (x < YARD.minX || x > YARD.maxX || z < YARD.minZ || z > YARD.maxZ)
    return false;
  if (distanceToPath(x, z) < PATH_HALF + TOWER_RADIUS) return false;
  for (const o of OBSTACLES)
    if (Math.hypot(x - o.x, z - o.z) < o.r + TOWER_RADIUS * 0.6) return false;
  for (const t of game.towers)
    if (t !== ignore && Math.hypot(x - t.x, z - t.z) < TOWER_GAP) return false;
  return true;
}

export function place(game, kind, x, z) {
  const def = TOWERS[kind];
  if (!def || game.cash < def.cost || !canPlace(game, x, z)) return null;
  game.cash -= def.cost;
  const tower = {
    id: game.nextId++,
    kind,
    x,
    z,
    levels: [0, 0],
    spent: def.cost,
    cooldown: 0,
    popCooldown: 0,
    target: "first",
    angle: Math.atan2(-z, -x),
    pops: 0,
  };
  game.towers.push(tower);
  return tower;
}

export function upgrade(game, tower, path) {
  const u = nextUpgrade(tower, path);
  if (!u || game.cash < u.cost) return false;
  game.cash -= u.cost;
  tower.spent += u.cost;
  tower.levels[path]++;
  return true;
}

export function sell(game, tower) {
  const i = game.towers.indexOf(tower);
  if (i < 0) return 0;
  game.towers.splice(i, 1);
  const value = sellValue(tower);
  game.cash += value;
  return value;
}

export const towerAt = (game, x, z) =>
  game.towers.find((t) => Math.hypot(x - t.x, z - t.z) < TOWER_RADIUS + 0.2);

export function startWave(game) {
  if (game.waveActive || game.over || game.wave >= game.settings.waves)
    return false;
  game.wave++;
  game.waveActive = true;
  game.waveTime = 0;
  game.spawns = waveSpawns(game.wave, game.settings);
  return true;
}

function spawnBubble(game, tier, d = 0) {
  const b = BUBBLES[tier];
  const bubble = {
    id: game.nextId++,
    tier,
    hp: b.hp ?? 0,
    d,
    slow: 1,
    ...pointAt(d),
  };
  game.bubbles.push(bubble);
  return bubble;
}

// Pop `damage` layers off a bubble. Returns the bubbles that replace it.
function hit(game, bubble, damage, events, by) {
  if (bubble.gone) return [];
  const credit = (n) => by && (by.pops += n);
  let def = BUBBLES[bubble.tier];
  if (def.hp) {
    const used = Math.min(damage, bubble.hp);
    bubble.hp -= used;
    game.cash += used;
    credit(used);
    if (bubble.hp > 0) {
      events.push({ type: "hit", id: bubble.id, x: bubble.x, z: bubble.z });
      return [bubble];
    }
    bubble.gone = true;
    game.popped++;
    events.push({
      type: "pop",
      id: bubble.id,
      tier: bubble.tier,
      x: bubble.x,
      z: bubble.z,
      burst: true,
    });
    return def.children.map((c, i) => {
      const child = spawnBubble(game, c, Math.max(0, bubble.d - i * 0.5));
      child.parent = bubble.id;
      return child;
    });
  }
  const from = bubble.tier;
  const layersOff = Math.min(damage, bubble.tier + 1);
  game.cash += layersOff;
  credit(layersOff);
  game.popped++;
  bubble.tier -= layersOff;
  events.push({
    type: "pop",
    id: bubble.id,
    tier: from,
    to: bubble.tier,
    x: bubble.x,
    z: bubble.z,
  });
  if (bubble.tier < 0) {
    bubble.gone = true;
    return [];
  }
  return [bubble];
}

const live = (game) => game.bubbles.filter((b) => !b.gone);

function inRange(game, tower, range) {
  return live(game).filter(
    (b) =>
      Math.hypot(b.x - tower.x, b.z - tower.z) <=
      range + BUBBLES[b.tier].radius * 0.5,
  );
}

function pick(tower, candidates) {
  const by = {
    first: (a, b) => b.d - a.d,
    last: (a, b) => a.d - b.d,
    strong: (a, b) => b.tier - a.tier || b.d - a.d,
    close: (a, b) =>
      Math.hypot(a.x - tower.x, a.z - tower.z) -
      Math.hypot(b.x - tower.x, b.z - tower.z),
  }[tower.target];
  return [...candidates].sort(by);
}

const speedOf = (game, b) =>
  BUBBLES[b.tier].speed * game.settings.speed * b.slow;

// Where a bubble will be after `t` seconds.
function lead(game, b, t) {
  return pointAt(b.d + speedOf(game, b) * t);
}

function fire(game, tower, stats, events) {
  const targets = pick(tower, inRange(game, tower, stats.range));
  if (!targets.length) return false;
  const first = targets[0];
  const aim = (b, t) => lead(game, b, t);
  if (tower.kind === "gnome") {
    const dist = Math.hypot(first.x - tower.x, first.z - tower.z);
    const p = aim(first, dist / stats.speed);
    const angle = Math.atan2(p.z - tower.z, p.x - tower.x);
    tower.angle = angle;
    for (let i = 0; i < stats.shots; i++) {
      const a = angle + (i - (stats.shots - 1) / 2) * 0.22;
      game.shots.push({
        id: game.nextId++,
        kind: "pinecone",
        x: tower.x + Math.cos(a) * 0.5,
        z: tower.z + Math.sin(a) * 0.5,
        vx: Math.cos(a) * stats.speed,
        vz: Math.sin(a) * stats.speed,
        life: (stats.range * 1.5) / stats.speed,
        pierce: stats.pierce,
        by: tower,
        damage: stats.damage,
        hits: new Set(),
      });
    }
    events.push({ type: "throw", tower: tower.id });
  } else if (tower.kind === "sprinkler") {
    const near = pick({ ...tower, target: "close" }, targets).slice(
      0,
      stats.targets,
    );
    for (const b of near) hit(game, b, stats.damage, events, tower);
    events.push({ type: "spray", tower: tower.id, range: stats.range });
  } else if (tower.kind === "catapult") {
    const dist = Math.hypot(first.x - tower.x, first.z - tower.z);
    const flight = 0.45 + dist / 14;
    const p = aim(first, flight);
    tower.angle = Math.atan2(p.z - tower.z, p.x - tower.x);
    game.shots.push({
      id: game.nextId++,
      kind: "balloon",
      fromX: tower.x,
      fromZ: tower.z,
      x: tower.x,
      z: tower.z,
      toX: p.x,
      toZ: p.z,
      t: 0,
      flight,
      splash: stats.splash,
      targets: stats.targets,
      damage: stats.damage,
      by: tower,
    });
    events.push({ type: "fling", tower: tower.id });
  } else if (tower.kind === "frog") {
    for (const b of targets.slice(0, stats.targets)) {
      tower.angle = Math.atan2(b.z - tower.z, b.x - tower.x);
      events.push({ type: "squirt", tower: tower.id, x: b.x, z: b.z });
      hit(game, b, stats.damage, events, tower);
    }
  }
  return true;
}

function moveShots(game, dt, events) {
  for (const s of game.shots) {
    if (s.kind === "pinecone") {
      const steps = Math.max(
        1,
        Math.ceil((Math.hypot(s.vx, s.vz) * dt) / 0.25),
      );
      for (let i = 0; i < steps && s.pierce > 0; i++) {
        s.x += (s.vx * dt) / steps;
        s.z += (s.vz * dt) / steps;
        for (const b of live(game)) {
          if (s.hits.has(b.id) || s.pierce <= 0) continue;
          if (Math.hypot(b.x - s.x, b.z - s.z) > BUBBLES[b.tier].radius + 0.25)
            continue;
          // A pinecone pops a bubble once, children included.
          s.hits.add(b.id);
          for (const after of hit(game, b, s.damage, events, s.by))
            s.hits.add(after.id);
          s.pierce--;
        }
      }
      s.life -= dt;
      if (s.life <= 0 || s.pierce <= 0) s.done = true;
    } else if (s.kind === "balloon") {
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.z = s.fromZ + (s.toZ - s.fromZ) * k;
      s.height = 1.2 + Math.sin(k * Math.PI) * 3;
      if (k >= 1) {
        s.done = true;
        const near = live(game)
          .filter(
            (b) =>
              Math.hypot(b.x - s.x, b.z - s.z) <=
              s.splash + BUBBLES[b.tier].radius,
          )
          .slice(0, s.targets);
        for (const b of near) hit(game, b, s.damage, events, s.by);
        events.push({ type: "splash", x: s.x, z: s.z, r: s.splash });
      }
    }
  }
  game.shots = game.shots.filter((s) => !s.done);
}

// Advance the yard by `dt` seconds. Returns what happened, for sounds and
// effects: spawn, pop, hit, leak, throw, spray, fling, squirt, splash,
// gust, waveEnd, won, lost.
export function step(game, dt) {
  const events = [];
  if (game.over) return events;
  if (game.waveActive) {
    game.waveTime += dt;
    while (game.spawns.length && game.spawns[0].at <= game.waveTime) {
      const s = game.spawns.shift();
      const b = spawnBubble(game, s.tier);
      events.push({ type: "spawn", id: b.id, tier: b.tier });
    }
  }

  // Breezes slow what's in them.
  for (const b of game.bubbles) b.slow = 1;
  for (const t of game.towers) {
    if (t.kind !== "fan") continue;
    const stats = towerStats(t);
    const near = inRange(game, t, stats.range);
    for (const b of near) {
      const slow = BUBBLES[b.tier].giant
        ? 1 - (1 - stats.slow) / 2
        : stats.slow;
      b.slow = Math.min(b.slow, slow);
    }
    if (near.length) {
      const f = pick(t, near)[0];
      t.angle = Math.atan2(f.z - t.z, f.x - t.x);
    }
    if (stats.popRate) {
      t.popCooldown -= dt;
      if (t.popCooldown <= 0 && near.length) {
        t.popCooldown = stats.popRate;
        for (const b of near.slice(0, stats.targets))
          hit(game, b, stats.damage, events, t);
        events.push({ type: "gust", tower: t.id, range: stats.range });
      }
    }
  }

  // Float along the path.
  for (const b of live(game)) {
    b.d += speedOf(game, b) * dt;
    if (b.d >= PATH_LENGTH) {
      b.gone = true;
      const lost = layers(b.tier) > 0 ? BUBBLES[b.tier].lives : 0;
      game.lives = Math.max(0, game.lives - lost);
      game.leaked += lost;
      events.push({ type: "leak", id: b.id, tier: b.tier, lives: lost });
      continue;
    }
    Object.assign(b, pointAt(b.d));
  }

  for (const t of game.towers) {
    if (t.kind === "fan") continue;
    const stats = towerStats(t);
    t.cooldown -= dt;
    if (t.cooldown <= 0 && fire(game, t, stats, events))
      t.cooldown = stats.rate;
    else t.cooldown = Math.max(t.cooldown, 0);
  }
  moveShots(game, dt, events);
  game.bubbles = game.bubbles.filter((b) => !b.gone);

  if (game.lives <= 0) {
    game.over = "lost";
    game.waveActive = false;
    events.push({ type: "lost" });
    return events;
  }
  if (game.waveActive && !game.spawns.length && !game.bubbles.length) {
    game.waveActive = false;
    game.shots = [];
    const bonus = waveBonus(game.wave);
    game.cash += bonus;
    events.push({ type: "waveEnd", wave: game.wave, bonus });
    if (game.wave >= game.settings.waves) {
      game.over = "won";
      events.push({ type: "won" });
    }
  }
  return events;
}
