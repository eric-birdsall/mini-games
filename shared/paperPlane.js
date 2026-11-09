// Paper Plane Pitch: flight physics and layout, shared by the game and its
// tests. Units are metres and seconds. The thrower stands at the origin
// facing -z; x is right, y is up. Wind blows only sideways (along x).

export const PLANES_PER_ROUND = 10;
export const LAUNCH = Object.freeze({ x: 0, y: 1.3, z: 0 });
export const BASKET_HEIGHT = 0.55;
export const RIM = 0.06; // rim thickness
export const MAX_YAW = 0.7; // radians either side of straight ahead
const PITCH = 0.14; // launch angle above level, radians
const MIN_SPEED = 3.2;
const MAX_SPEED = 10.5;
const G = 9.8;
const LIFT = 0.13; // lift per (m/s)^2 of airspeed, capped below gravity
const MAX_LIFT = 0.82 * G;
const DRAG = 0.045;
const SIDE = 0.7; // how strongly paper is carried along by a crosswind
const STEP = 1 / 240;
const MAX_TIME = 8;

export const LEVELS = {
  easy: {
    near: 4.2,
    far: 5.2,
    side: 0.4,
    wind: 1.0,
    radius: 0.56,
    guide: 0.55,
  },
  normal: { near: 5, far: 7, side: 1, wind: 2.4, radius: 0.44, guide: 0 },
  hard: { near: 6.2, far: 8.6, side: 1.6, wind: 3.2, radius: 0.38, guide: 0 },
};

export const planeLevel = (level) => LEVELS[level] ?? LEVELS.normal;

// A small seeded random so a round can be replayed in tests.
export function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

// Where the basket sits and how the breeze blows for one throw.
export function nextSetup(level, rand = Math.random) {
  const l = planeLevel(level);
  const distance = l.near + (l.far - l.near) * rand();
  const x = (rand() * 2 - 1) * l.side;
  // Round the wind to a tenth so the sign shows exactly what blows.
  let wind = Math.round((rand() * 2 - 1) * l.wind * 10) / 10;
  if (Object.is(wind, -0)) wind = 0;
  return { basket: { x, z: -distance, radius: l.radius }, wind };
}

export const launchSpeed = (power) =>
  MIN_SPEED + (MAX_SPEED - MIN_SPEED) * Math.min(1, Math.max(0, power));

export function createPlane(yaw, power) {
  const a = Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw));
  const v = launchSpeed(power);
  const flat = v * Math.cos(PITCH);
  return {
    x: LAUNCH.x,
    y: LAUNCH.y,
    z: LAUNCH.z,
    vx: flat * Math.sin(a),
    vy: v * Math.sin(PITCH),
    vz: -flat * Math.cos(a),
    bank: 0,
    t: 0,
    result: null, // null while flying, then "in", "rim", "short", "long", "wide"
    bounced: false,
  };
}

// Advance the plane by dt. Returns its result once it has one.
export function stepPlane(p, setup, dt) {
  let left = dt;
  while (!p.result && left > 1e-9) {
    const h = Math.min(STEP, left);
    left -= h;
    tick(p, setup, h);
  }
  return p.result;
}

function tick(p, { basket, wind }, h) {
  const ax0 = p.vx - wind;
  const air = Math.hypot(ax0, p.vy, p.vz);
  const flat2 = ax0 * ax0 + p.vz * p.vz;
  const lift = Math.min(MAX_LIFT, LIFT * flat2);
  const ax = -DRAG * air * ax0 + SIDE * (wind - p.vx);
  const ay = -G + lift - DRAG * air * p.vy;
  const az = -DRAG * air * p.vz;
  p.vx += ax * h;
  p.vy += ay * h;
  p.vz += az * h;
  const was = { x: p.x, y: p.y, z: p.z };
  p.x += p.vx * h;
  p.y += p.vy * h;
  p.z += p.vz * h;
  p.t += h;
  // Bank into the sideways push, the way a real dart tips in a gust.
  p.bank += (Math.max(-0.9, Math.min(0.9, -ax * 0.25)) - p.bank) * h * 6;

  const R = basket.radius ?? 0.44;
  const dx = p.x - basket.x;
  const dz = p.z - basket.z;
  const d = Math.hypot(dx, dz);
  // Dropping through the top of the basket.
  if (was.y > BASKET_HEIGHT && p.y <= BASKET_HEIGHT) {
    if (d < R - 0.04) {
      p.result = "in";
      return;
    }
    if (d < R + RIM + 0.06 && !p.bounced) {
      // Clipped the rim: knock it back out.
      p.bounced = true;
      const nx = dx / (d || 1);
      const nz = dz / (d || 1);
      p.vx = nx * 1.2;
      p.vz = nz * 1.2;
      p.vy = 1.1;
      p.y = BASKET_HEIGHT + 0.01;
      p.rim = true;
      return;
    }
  }
  // Flying into the side of the basket.
  if (p.y < BASKET_HEIGHT && d < R + RIM) {
    const wd = Math.hypot(was.x - basket.x, was.z - basket.z);
    if (wd >= R + RIM) {
      p.x = was.x;
      p.z = was.z;
      p.vx *= -0.25;
      p.vz *= -0.25;
      p.bounced = true;
      p.rim = true;
    }
  }
  if (p.y <= 0.02) {
    p.y = 0.02;
    p.result = missKind(p, basket);
  } else if (p.t > MAX_TIME) p.result = missKind(p, basket);
}

// Why a plane missed, from where it came down relative to the basket.
function missKind(p, basket) {
  if (p.rim) return "rim";
  const along = basket.z - p.z; // positive: landed past the basket
  const across = p.x - basket.x;
  if (Math.abs(across) > Math.abs(along)) return "wide";
  return along > 0 ? "long" : "short";
}

// Whole flight path, for the easy-mode guide and the tests.
export function simulate(yaw, power, setup, sample = 1 / 30) {
  const p = createPlane(yaw, power);
  const points = [{ x: p.x, y: p.y, z: p.z }];
  while (!p.result) {
    stepPlane(p, setup, sample);
    points.push({ x: p.x, y: p.y, z: p.z });
  }
  return { result: p.result, points, plane: p };
}

// Swipe to throw: a drag up the screen of dx, dy pixels (dy < 0 is up) on a
// screen h pixels tall. The direction aims, the length sets the power.
export function swipeThrow(dx, dy, h) {
  const length = Math.hypot(dx, dy);
  if (dy > -h * 0.04 || length < h * 0.05) return null;
  const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, Math.atan2(dx, -dy)));
  const power = Math.min(1, Math.max(0, (length - h * 0.05) / (h * 0.5)));
  return { yaw, power };
}
