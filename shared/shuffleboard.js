export const TABLE = { length: 960, width: 190, launch: 48, radius: 13 };
export const ZONES = [690, 790, 880];
export const WIN_SCORE = 15;
export const PUCKS_PER_PLAYER = 4;
export const MAX_AIM = 8;
export const FRICTION = 450;
const MAX_SPEED = 940;

export function launchPuck(team, aim, power) {
  const angle = (aim * Math.PI) / 180;
  const speed = power * MAX_SPEED;
  return {
    team,
    x: TABLE.launch,
    y: TABLE.width / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    out: false,
  };
}

export function powerForDistance(distance) {
  return Math.sqrt(2 * FRICTION * distance) / MAX_SPEED;
}

// Cull pucks in the gutters, but allow a resting puck to hang over the far lip.
export function stepPucks(pucks, dt) {
  for (const puck of pucks) {
    if (puck.out) continue;
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed === 0) continue;
    const time = Math.min(dt, speed / FRICTION);
    const remaining = Math.max(0, speed - FRICTION * dt);
    const travel = ((speed + Math.max(0, speed - FRICTION * time)) / 2) * time;
    puck.x += (puck.vx / speed) * travel;
    puck.y += (puck.vy / speed) * travel;
    puck.vx *= remaining / speed;
    puck.vy *= remaining / speed;
    puck.out =
      puck.x < 0 ||
      puck.x > TABLE.length ||
      puck.y < TABLE.radius ||
      puck.y > TABLE.width - TABLE.radius;
  }

  for (let i = 0; i < pucks.length; i++) {
    const a = pucks[i];
    if (a.out) continue;
    for (let j = i + 1; j < pucks.length; j++) {
      const b = pucks[j];
      if (b.out) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const diameter = 2 * TABLE.radius;
      if (distance >= diameter) continue;
      const nx = distance ? dx / distance : 1;
      const ny = distance ? dy / distance : 0;
      const overlap = (diameter - distance) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      const impulse = Math.max(0, closing) * 0.91;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }

  for (const puck of pucks) {
    puck.out ||=
      puck.x < 0 ||
      puck.x > TABLE.length ||
      puck.y < TABLE.radius ||
      puck.y > TABLE.width - TABLE.radius;
  }
  return pucks.some((puck) => !puck.out && (puck.vx !== 0 || puck.vy !== 0));
}

export function puckPoints(puck) {
  if (puck.x + TABLE.radius > TABLE.length) return 4;
  return ZONES.filter((line) => puck.x - TABLE.radius >= line).length;
}

export function scoreEnd(pucks) {
  const scoring = pucks
    .filter((puck) => !puck.out && puckPoints(puck) > 0)
    .sort((a, b) => b.x - a.x);
  const team = scoring[0]?.team;
  const rival = scoring.find((puck) => puck.team !== team);
  const points = scoring
    .filter((puck) => puck.team === team && (!rival || puck.x > rival.x + 1e-6))
    .reduce((sum, puck) => sum + puckPoints(puck), 0);
  return { team, points };
}
