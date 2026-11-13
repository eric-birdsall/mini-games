// Skee Ball: roll a ball up an arcade lane, over the hump and into the
// rings of the target board. Units are metres; the lane runs toward +z.
//
// The ball's path up the lane and hump is scripted along the lane's centre
// line (distance s), with sideways drift x proportional to s (bouncing off
// the rails). Off the hump it flies freely until it lands on the tilted
// target board, then rolls into the hole of the ring it landed in.

export const G = 9.8;
export const BALL_RADIUS = 0.045;
export const LANE_HALF = 0.27; // inside the rails
export const LANE_Y = 0.8; // lane surface at the foul line
export const LANE_ANGLE = 0.14; // incline of the lane (≈8°)
export const LANE_LENGTH = 3; // along the slope, to the start of the hump
export const HUMP_LENGTH = 0.22;
export const HUMP_ANGLE = 0.72; // launch angle at the hump's tip (≈41°)
export const ROLL_FRICTION = 0.25; // m/s² of rolling drag
export const BOARD_ANGLE = 0.42; // tilt of the target board (≈24°)
export const BOARD_LENGTH = 0.95; // along its slope
export const BALLS_PER_ROUND = 9;

// Power 0..1 maps to the roll speed at the foul line. The weakest rolls
// don't make it over the hump and come back.
export const SPEED_MIN = 3.4;
export const SPEED_MAX = 4.85;
export const rollSpeed = (power) =>
  SPEED_MIN + Math.max(0, Math.min(1, power)) * (SPEED_MAX - SPEED_MIN);
export const AIM_LIMIT = 0.085; // radians either side of straight

// easy: a glowing dot shows where the ball will land; slower power meter.
export const SKEE_LEVELS = {
  easy: { guide: true, meterPeriod: 2.2, balls: BALLS_PER_ROUND },
  normal: { guide: false, meterPeriod: 1.6, balls: BALLS_PER_ROUND },
  hard: { guide: false, meterPeriod: 1.1, balls: BALLS_PER_ROUND },
};
export const skeeLevel = (level) => SKEE_LEVELS[level] || SKEE_LEVELS.normal;

// --- The lane and hump --------------------------------------------------------

const HUMP_STEPS = 24;
const hump = (() => {
  // Integrate the curve from the end of the straight lane.
  const points = [];
  let z = LANE_LENGTH * Math.cos(LANE_ANGLE);
  let y = LANE_Y + LANE_LENGTH * Math.sin(LANE_ANGLE);
  const ds = HUMP_LENGTH / HUMP_STEPS;
  for (let i = 0; i <= HUMP_STEPS; i++) {
    const angle = LANE_ANGLE + (HUMP_ANGLE - LANE_ANGLE) * (i / HUMP_STEPS);
    points.push({ z, y, angle });
    z += Math.cos(angle) * ds;
    y += Math.sin(angle) * ds;
  }
  return points;
})();
export const PATH_LENGTH = LANE_LENGTH + HUMP_LENGTH;
export const HUMP_TIP = hump[HUMP_STEPS];

// The lane's centre line (surface) at distance s from the foul line.
export function lanePoint(s) {
  if (s <= LANE_LENGTH)
    return {
      z: s * Math.cos(LANE_ANGLE),
      y: LANE_Y + s * Math.sin(LANE_ANGLE),
      angle: LANE_ANGLE,
    };
  const f = Math.min(
    HUMP_STEPS,
    ((s - LANE_LENGTH) / HUMP_LENGTH) * HUMP_STEPS,
  );
  const i = Math.min(HUMP_STEPS - 1, Math.floor(f));
  const t = f - i;
  const a = hump[i];
  const b = hump[i + 1];
  return {
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t,
    angle: a.angle + (b.angle - a.angle) * t,
  };
}

// --- The target board -----------------------------------------------------------

// The board starts just past and below the hump's tip and rises away from
// the player. Board coordinates: x across, u up the slope from its front edge.
export const BOARD_START = { z: HUMP_TIP.z + 0.06, y: HUMP_TIP.y - 0.14 };
export const BOARD_END = {
  z: BOARD_START.z + BOARD_LENGTH * Math.cos(BOARD_ANGLE),
  y: BOARD_START.y + BOARD_LENGTH * Math.sin(BOARD_ANGLE),
};
export const boardPoint = (x, u, lift = 0) => ({
  x,
  y: BOARD_START.y + u * Math.sin(BOARD_ANGLE) + lift * Math.cos(BOARD_ANGLE),
  z: BOARD_START.z + u * Math.cos(BOARD_ANGLE) - lift * Math.sin(BOARD_ANGLE),
});
// World point → board coordinates (u along the slope, h above it).
export function toBoard(y, z) {
  const dy = y - BOARD_START.y;
  const dz = z - BOARD_START.z;
  const c = Math.cos(BOARD_ANGLE);
  const s = Math.sin(BOARD_ANGLE);
  return { u: dz * c + dy * s, h: dy * c - dz * s };
}

// Concentric rings, innermost first; outer radius of each.
export const RING_CENTER = { x: 0, u: 0.44 };
export const RINGS = [
  { points: 50, radius: 0.07 },
  { points: 40, radius: 0.13 },
  { points: 30, radius: 0.19 },
  { points: 20, radius: 0.245 },
  { points: 10, radius: 0.3 },
];
// The two 100 pockets sit in the top corners.
export const CORNERS = [-1, 1].map((side) => ({
  points: 100,
  x: side * 0.2,
  u: 0.8,
  radius: 0.055,
}));

// Which pocket a ball landing at (x, u) drops into, and where its hole is.
// The 100 pockets have hoods, so a ball banked off the back wall can't
// drop into them.
export function pocketAt(x, u, banked = false) {
  for (const corner of banked ? [] : CORNERS)
    if (Math.hypot(x - corner.x, u - corner.u) < corner.radius)
      return { points: 100, hole: { x: corner.x, u: corner.u } };
  const d = Math.hypot(x - RING_CENTER.x, u - RING_CENTER.u);
  let inner = 0;
  for (const ring of RINGS) {
    if (d < ring.radius) {
      // A ball in a ring rolls down the slope to the hole at its bottom.
      const hole =
        ring.points === 50
          ? { ...RING_CENTER }
          : { x: RING_CENTER.x, u: RING_CENTER.u - (inner + ring.radius) / 2 };
      return { points: ring.points, hole };
    }
    inner = ring.radius;
  }
  // Outside the rings: down the gutter at the front of the board.
  return {
    points: 0,
    hole: { x: Math.max(-0.2, Math.min(0.2, x)), u: 0.02 },
  };
}

// --- The ball ---------------------------------------------------------------

export function newBall(aim, power) {
  return {
    phase: "lane", // lane | back | air | drop | done
    s: 0,
    speed: rollSpeed(power),
    drift: Math.tan(Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aim))),
    x: 0,
    y: LANE_Y + BALL_RADIUS,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    banked: false,
    landing: null,
    pocket: null,
    dropTime: 0,
  };
}

const DROP_ROLL = 0.45;
const DROP_SINK = 0.3;
const STEP = 1 / 240;

// Advance the ball by dt. Returns what happened this step.
export function stepBall(ball, dt) {
  const events = { launched: false, rail: false, back: false, landed: false };
  let left = dt;
  while (left > 1e-9 && ball.phase !== "done") {
    const h = Math.min(STEP, left);
    left -= h;
    substep(ball, h, events);
  }
  return events;
}

function substep(ball, h, events) {
  if (ball.phase === "lane" || ball.phase === "back") {
    const at = lanePoint(ball.s);
    const pull = G * Math.sin(at.angle);
    const drag = Math.sign(ball.speed) * ROLL_FRICTION;
    ball.speed -= (pull + drag) * h;
    const ds = ball.speed * h;
    ball.s += ds;
    ball.x += ball.drift * ds;
    const wall = LANE_HALF - BALL_RADIUS;
    if (Math.abs(ball.x) > wall) {
      ball.x = Math.sign(ball.x) * wall;
      ball.drift *= -0.7;
      ball.speed *= 0.93;
      events.rail = true;
    }
    if (ball.speed < 0 && ball.phase === "lane") {
      ball.phase = "back";
      events.back = true;
    }
    ball.spin += ds / BALL_RADIUS;
    if (ball.phase === "back" && ball.s <= 0) {
      ball.s = 0;
      ball.phase = "done";
      ball.pocket = null;
    }
    const p = lanePoint(Math.max(0, ball.s));
    ball.y = p.y + BALL_RADIUS * Math.cos(p.angle);
    ball.z = p.z - BALL_RADIUS * Math.sin(p.angle);
    if (ball.phase === "lane" && ball.s >= PATH_LENGTH) {
      ball.phase = "air";
      ball.vx = ball.speed * ball.drift;
      ball.vy = ball.speed * Math.sin(HUMP_ANGLE);
      ball.vz = ball.speed * Math.cos(HUMP_ANGLE);
      events.launched = true;
    }
    return;
  }
  if (ball.phase === "air") {
    ball.vy -= G * h;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    ball.z += ball.vz * h;
    const wall = LANE_HALF - BALL_RADIUS;
    if (Math.abs(ball.x) > wall) {
      ball.x = Math.sign(ball.x) * wall;
      ball.vx *= -0.5;
      events.rail = true;
    }
    // The back wall behind the board.
    if (ball.z > BOARD_END.z - BALL_RADIUS && ball.vz > 0) {
      ball.z = BOARD_END.z - BALL_RADIUS;
      ball.vz *= -0.35;
      ball.banked = true;
      events.rail = true;
    }
    const { u, h: above } = toBoard(ball.y, ball.z);
    if (above <= BALL_RADIUS && ball.vy < 0) {
      const landU = Math.max(0, Math.min(BOARD_LENGTH, u));
      ball.landing = { x: ball.x, u: landU };
      ball.pocket = pocketAt(ball.x, landU, ball.banked);
      ball.phase = "drop";
      ball.dropTime = 0;
      events.landed = true;
    }
    return;
  }
  if (ball.phase === "drop") {
    ball.dropTime += h;
    const { landing, pocket } = ball;
    const t = Math.min(1, ball.dropTime / DROP_ROLL);
    const ease = t * t * (3 - 2 * t);
    const x = landing.x + (pocket.hole.x - landing.x) * ease;
    const u = landing.u + (pocket.hole.u - landing.u) * ease;
    const sink = Math.max(0, (ball.dropTime - DROP_ROLL) / DROP_SINK);
    const p = boardPoint(x, u, BALL_RADIUS - sink * BALL_RADIUS * 2.4);
    ball.x = p.x;
    ball.y = p.y;
    ball.z = p.z;
    ball.spin += h * 20;
    if (sink >= 1) ball.phase = "done";
  }
}

// Where a roll would land on the board (board coordinates), or null if it
// comes back down the lane.
export function predictLanding(aim, power) {
  const ball = newBall(aim, power);
  for (let i = 0; i < 2000 && ball.phase !== "done"; i++) {
    stepBall(ball, 1 / 60);
    if (ball.landing) return { ...ball.landing, banked: ball.banked };
  }
  return null;
}

// The meter swings 0 → 1 → 0 over `period` seconds while held.
export const meterPower = (time, period) => {
  const t = (time / period) % 1;
  return t < 0.5 ? t * 2 : 2 - t * 2;
};

// The line the ball will follow for an aim, for drawing: dots up the lane
// (with rail bounces) and on across the board. Sideways travel doesn't
// depend on power until the ball leaves the hump, and in the air it keeps
// the same slant, so the line is exact except for banks off the back wall.
export function aimPath(aim, laneDots = 26, boardDots = 9) {
  const wall = LANE_HALF - BALL_RADIUS;
  let drift = Math.tan(Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, aim)));
  let x = 0;
  let s = 0;
  const lane = [];
  const step = PATH_LENGTH / 400;
  const every = PATH_LENGTH / laneDots;
  let next = every * 0.5;
  while (s < PATH_LENGTH) {
    s += step;
    x += drift * step;
    if (Math.abs(x) > wall) {
      x = Math.sign(x) * wall;
      drift *= -0.7;
    }
    if (s >= next) {
      lane.push({ x, s });
      next += every;
    }
  }
  // In the air: dx/dz = drift / cos(HUMP_ANGLE).
  const slant = drift / Math.cos(HUMP_ANGLE);
  const board = [];
  for (let i = 0; i < boardDots && boardDots > 1; i++) {
    const u = 0.04 + (i / (boardDots - 1)) * (BOARD_LENGTH - 0.12);
    const z = BOARD_START.z + u * Math.cos(BOARD_ANGLE);
    let bx = x + slant * (z - HUMP_TIP.z);
    // Bounce off the side walls (at half the speed, as in flight).
    for (let k = 0; k < 4 && Math.abs(bx) > wall; k++)
      bx = Math.sign(bx) * wall - (bx - Math.sign(bx) * wall) * 0.5;
    board.push({ x: bx, u });
  }
  return { lane, board };
}
