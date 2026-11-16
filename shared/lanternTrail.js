export const TRAIL_STEP = 1 / 120;
export const PLAYER_WIDTH = 26;
export const PLAYER_HEIGHT = 32;
const ground = 350;

function makeLevel(
  name,
  hint,
  width,
  banks,
  ledges,
  coins,
  patrols,
  checkpoint,
) {
  return {
    name,
    hint,
    width,
    checkpoint,
    goal: width - 72,
    solids: [
      ...banks.map(([start, end]) => ({
        x: start,
        y: ground,
        w: end - start,
        h: 210,
      })),
      ...ledges.map(([x, y, w]) => ({ x, y, w, h: 24 })),
    ],
    coins: coins.flatMap(([x, y, count]) =>
      Array.from({ length: count }, (_, i) => ({ x: x + i * 30, y })),
    ),
    patrols: patrols.map(([min, max, y, speed]) => ({
      min,
      max,
      x: min,
      y: y - 22,
      speed,
    })),
  };
}

export const TRAIL_LEVELS = [
  makeLevel(
    "Clover Hollow",
    "Hold Jump to go higher. Follow the sparks to the lantern.",
    1470,
    [
      [0, 355],
      [445, 850],
      [955, 1470],
    ],
    [
      [153, 284, 100],
      [545, 264, 112],
      [691, 225, 90],
      [1085, 278, 116],
    ],
    [
      [172, 256, 3],
      [359, 285, 3],
      [566, 237, 3],
      [711, 198, 2],
      [1040, 317, 2],
      [1103, 251, 3],
    ],
    [
      [596, 762, 350, 57],
      [1235, 1315, 350, 65],
    ],
    995,
  ),
  makeLevel(
    "Bramble Run",
    "Bounce on beetles from above. Light the trail marker for a checkpoint.",
    1670,
    [
      [0, 270],
      [402, 740],
      [866, 1135],
      [1265, 1670],
    ],
    [
      [301, 300, 65],
      [485, 267, 112],
      [620, 224, 96],
      [774, 295, 62],
      [929, 264, 91],
      [1168, 285, 65],
      [1400, 255, 118],
    ],
    [
      [307, 272, 2],
      [510, 238, 3],
      [637, 196, 3],
      [781, 268, 2],
      [949, 236, 2],
      [1175, 256, 2],
      [1423, 228, 3],
    ],
    [
      [443, 687, 350, 73],
      [887, 1070, 350, 75],
      [1290, 1510, 350, 83],
    ],
    1075,
  ),
  makeLevel(
    "Moonrise Ridge",
    "Take the high route across the broken ridge.",
    1820,
    [
      [0, 280],
      [580, 848],
      [998, 1180],
      [1480, 1820],
    ],
    [
      [271, 295, 82],
      [402, 249, 90],
      [534, 294, 84],
      [701, 267, 101],
      [875, 290, 86],
      [1165, 287, 81],
      [1292, 242, 96],
      [1428, 280, 86],
      [1570, 250, 112],
    ],
    [
      [288, 269, 2],
      [417, 220, 3],
      [555, 268, 2],
      [726, 239, 2],
      [889, 261, 3],
      [1183, 259, 2],
      [1309, 215, 3],
      [1454, 253, 2],
      [1590, 222, 3],
    ],
    [
      [620, 792, 350, 82],
      [1020, 1095, 350, 77],
      [1518, 1689, 350, 90],
      [1590, 1648, 250, 53],
    ],
    1125,
  ),
];

function runner(x) {
  return {
    x,
    y: ground - PLAYER_HEIGHT,
    w: PLAYER_WIDTH,
    h: PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    grounded: true,
    facing: 1,
    grace: 0,
    buffer: 0,
  };
}

export function createTrailRun(level) {
  return {
    level,
    player: runner(42),
    coins: new Set(),
    patrols: level.patrols.map((patrol) => ({ ...patrol })),
    checkpoint: false,
    falls: 0,
    time: 0,
  };
}

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function respawn(run) {
  run.falls++;
  run.player = runner(run.checkpoint ? run.level.checkpoint : 42);
  run.patrols = run.level.patrols.map((patrol) => ({ ...patrol }));
  return "retry";
}

export function stepTrail(run, { direction, pressed, held }) {
  const dt = TRAIL_STEP;
  const p = run.player;
  run.time += dt;
  p.grace = p.grounded ? 0.1 : Math.max(0, p.grace - dt);
  p.buffer = pressed ? 0.13 : Math.max(0, p.buffer - dt);
  const target = direction * 278;
  const acceleration = (p.grounded ? 2600 : 1580) * dt;
  p.vx += Math.max(-acceleration, Math.min(acceleration, target - p.vx));
  if (direction) p.facing = direction;
  if (p.buffer > 0 && p.grace > 0) {
    p.vy = -540;
    p.grace = 0;
    p.buffer = 0;
  }
  p.vy = Math.min(780, p.vy + (p.vy < 0 && !held ? 2450 : 1350) * dt);
  p.x = Math.max(0, Math.min(run.level.width - p.w, p.x + p.vx * dt));
  for (const solid of run.level.solids) {
    if (!overlaps(p, solid)) continue;
    if (p.vx > 0) p.x = solid.x - p.w;
    if (p.vx < 0) p.x = solid.x + solid.w;
    p.vx = 0;
  }

  const prevBottom = p.y + p.h;
  p.y += p.vy * dt;
  p.grounded = false;
  for (const solid of run.level.solids) {
    if (!overlaps(p, solid)) continue;
    if (p.vy > 0) {
      p.y = solid.y - p.h;
      p.grounded = true;
    } else if (p.vy < 0) {
      p.y = solid.y + solid.h;
    }
    p.vy = 0;
  }

  // Swept foot contact also catches a stomp on the tick a beetle is reached.
  for (const beetle of run.patrols) {
    if (beetle.defeated) continue;
    beetle.x += beetle.speed * dt;
    if (beetle.x <= beetle.min || beetle.x >= beetle.max) {
      beetle.x = Math.max(beetle.min, Math.min(beetle.max, beetle.x));
      beetle.speed *= -1;
    }
    if (p.x >= beetle.x + 28 || p.x + p.w <= beetle.x) continue;
    if (prevBottom <= beetle.y + 6 && p.y + p.h >= beetle.y && p.y < beetle.y) {
      beetle.defeated = true;
      p.vy = -360;
      p.y = beetle.y - p.h;
      p.grounded = false;
      p.grace = 0;
    } else if (overlaps(p, { ...beetle, w: 28, h: 22 })) {
      return respawn(run);
    }
  }

  if (p.y > 470) return respawn(run);
  const { checkpoint, goal } = run.level;
  if (p.grounded && Math.abs(p.x + p.w / 2 - checkpoint) < 25)
    run.checkpoint = true;
  for (const [i, coin] of run.level.coins.entries()) {
    if (overlaps(p, { x: coin.x - 8, y: coin.y - 10, w: 16, h: 20 }))
      run.coins.add(i);
  }
  if (p.grounded && p.x + p.w >= goal) return "clear";
}
