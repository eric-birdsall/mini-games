export const BOARD = {
  halfWidth: 1.65,
  halfLength: 5,
  radius: 0.19,
  launch: 4.28,
};
export const SHOTS = 5;
export const BUMPER_RADIUS = 0.24;
export const DIAMOND_TIP = 0.36;
export const SIDE_RAIL = {
  radius: 0.065,
  get x() {
    return BOARD.halfWidth - this.radius;
  },
  get start() {
    return BOARD.launch + this.radius;
  },
  get end() {
    return BOARD.halfLength - this.radius;
  },
};
const DIAMOND_HALF_SIDE = DIAMOND_TIP * Math.SQRT1_2;
export const STEP = 1 / 120;
// Leave a small forward component even at the two ends of the aim range.
export const MAX_ANGLE = (89.9 * Math.PI) / 180;
export function placeClashBumper(team, { x, z }) {
  const ownDepth = z * (team === 0 ? 1 : -1);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > BOARD.halfWidth - BUMPER_RADIUS ||
    ownDepth < BUMPER_RADIUS ||
    ownDepth > BOARD.halfLength - BUMPER_RADIUS ||
    Math.hypot(x, ownDepth - BOARD.launch) < BOARD.radius + BUMPER_RADIUS ||
    diamondContact(x, z, BUMPER_RADIUS) ||
    sideRailContact(x, z, BUMPER_RADIUS)
  )
    return null;
  return { team, x, z };
}

export function enforceClashLanding(shots) {
  const short = shots.filter(
    (puck) =>
      puck.fall === null &&
      !puck.hitRival &&
      puck.z * (puck.team === 0 ? -1 : 1) <= 0,
  );
  for (const puck of short) puck.fall = 0.7;
  return short;
}

export function scoreClash(pucks) {
  const points = [0, 0];
  for (const puck of pucks) {
    if (puck.fall !== null) points[1 - puck.team]++;
  }
  return points;
}

const DRAG = 2.3;
const WALL_BOUNCE = 0.58;

export function clashLaunchPosition(team, pucks, bumpers) {
  const facing = team === 0 ? 1 : -1;
  const clearance = 2 * BOARD.radius + 0.01;
  // Prefer the center of the launch line. Search beside it and behind it
  // before using the front of the launch area.
  for (const depth of [
    0, 0.2, 0.4, -0.2, -0.4, -0.6, -0.8, -1, -1.2, -1.4, -1.6,
  ]) {
    const z = (BOARD.launch + depth) * facing;
    for (let lane = 0; lane <= 13; lane++) {
      const offset = lane * 0.1;
      for (const side of lane === 0 ? [1] : [facing, -facing]) {
        const x = side * offset;
        if (
          sideRailContact(x, z) ||
          bumperBlocks(x, z, bumpers) ||
          pucks.some(
            (puck) =>
              puck.fall === null &&
              Math.hypot(puck.x - x, puck.z - z) < clearance,
          )
        )
          continue;
        return { x, z };
      }
    }
  }
  return { x: 0, z: BOARD.launch * facing };
}

export function launchClashPuck(
  team,
  { aim, power },
  position = { x: 0, z: BOARD.launch * (team === 0 ? 1 : -1) },
) {
  const forward = team === 0 ? -1 : 1;
  const speed = 1.5 + power * 6.2;
  const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, aim));
  return {
    team,
    ...position,
    vx: -forward * Math.sin(angle) * speed,
    vz: forward * Math.cos(angle) * speed,
    fall: null,
  };
}

export function sideRailContact(x, z, radius = BOARD.radius) {
  const clearance = SIDE_RAIL.radius + radius;
  if (
    Math.abs(x) < SIDE_RAIL.x - clearance ||
    Math.abs(z) < SIDE_RAIL.start - clearance
  )
    return null;
  const railX = Math.sign(x) * SIDE_RAIL.x;
  const railZ =
    Math.sign(z) *
    Math.max(SIDE_RAIL.start, Math.min(SIDE_RAIL.end, Math.abs(z)));
  const dx = x - railX;
  const dz = z - railZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= clearance) return null;
  return {
    nx: distance ? dx / distance : -Math.sign(x),
    nz: distance ? dz / distance : 0,
    overlap: clearance - distance,
  };
}

function checkEdges(puck) {
  const contact = sideRailContact(puck.x, puck.z);
  if (contact) rebound(puck, contact);
  if (Math.abs(puck.x) > BOARD.halfWidth) {
    puck.fall = 0;
    return;
  }
  const limit = BOARD.halfLength - BOARD.radius;
  if (Math.abs(puck.z) > limit) {
    puck.z = Math.sign(puck.z) * limit;
    if (puck.z * puck.vz > 0) puck.vz *= -WALL_BOUNCE;
  }
}

export function diamondContact(x, z, radius = BOARD.radius) {
  const u = (x + z) * Math.SQRT1_2;
  const v = (x - z) * Math.SQRT1_2;
  const du = Math.sign(u) * Math.max(0, Math.abs(u) - DIAMOND_HALF_SIDE);
  const dv = Math.sign(v) * Math.max(0, Math.abs(v) - DIAMOND_HALF_SIDE);
  const distance = Math.hypot(du, dv);
  if (distance >= radius) return null;

  let normalU = du;
  let normalV = dv;
  let overlap = radius - distance;
  if (distance > 0) {
    normalU /= distance;
    normalV /= distance;
  } else if (Math.abs(u) >= Math.abs(v)) {
    normalU = Math.sign(u) || 1;
    overlap += DIAMOND_HALF_SIDE - Math.abs(u);
  } else {
    normalV = Math.sign(v);
    overlap += DIAMOND_HALF_SIDE - Math.abs(v);
  }

  return {
    nx: (normalU + normalV) * Math.SQRT1_2,
    nz: (normalU - normalV) * Math.SQRT1_2,
    overlap,
  };
}

function bounceOffDiamond(puck) {
  if (
    Math.abs(puck.x) >= DIAMOND_TIP + BOARD.radius ||
    Math.abs(puck.z) >= DIAMOND_TIP + BOARD.radius
  )
    return;
  const contact = diamondContact(puck.x, puck.z);
  if (!contact) return;
  rebound(puck, contact);
}

function rebound(puck, { nx, nz, overlap }) {
  puck.x += nx * overlap;
  puck.z += nz * overlap;
  const inward = Math.min(0, puck.vx * nx + puck.vz * nz);
  puck.vx -= (1 + WALL_BOUNCE) * inward * nx;
  puck.vz -= (1 + WALL_BOUNCE) * inward * nz;
}

export function bumperBlocks(x, z, bumpers) {
  return bumpers.some(
    (bumper) =>
      Math.hypot(x - bumper.x, z - bumper.z) < BOARD.radius + BUMPER_RADIUS,
  );
}

function bounceOffBumpers(puck, bumpers) {
  const clearance = BOARD.radius + BUMPER_RADIUS;
  for (const { x, z } of bumpers) {
    const dx = puck.x - x;
    const dz = puck.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance >= clearance) continue;
    const nx = distance ? dx / distance : 0;
    const nz = distance ? dz / distance : Math.sign(z);
    puck.x = x + nx * clearance;
    puck.z = z + nz * clearance;
    const inward = Math.min(0, puck.vx * nx + puck.vz * nz);
    puck.vx -= (1 + WALL_BOUNCE) * inward * nx;
    puck.vz -= (1 + WALL_BOUNCE) * inward * nz;
  }
}

export function stepClash(pucks, dt, bumpers = []) {
  for (const puck of pucks) {
    if (puck.fall !== null) {
      if (puck.fall < 0.7) {
        puck.fall += dt;
        puck.x += (puck.vx + Math.sign(puck.x) * 0.65) * dt;
        puck.z += puck.vz * dt;
      }
      continue;
    }
    const speed = Math.hypot(puck.vx, puck.vz);
    const scale = speed ? Math.max(0, 1 - (DRAG * dt) / speed) : 0;
    puck.x += puck.vx * ((1 + scale) / 2) * dt;
    puck.z += puck.vz * ((1 + scale) / 2) * dt;
    puck.vx *= scale;
    puck.vz *= scale;
    bounceOffDiamond(puck);
    bounceOffBumpers(puck, bumpers);
    checkEdges(puck);
  }

  // Recheck clustered pucks after separating pairs and pushing them off bumpers.
  for (let pass = 0; pass < 6; pass++) {
    let separated = false;
    for (let i = 0; i < pucks.length; i++) {
      const a = pucks[i];
      if (a.fall !== null) continue;
      for (let j = i + 1; j < pucks.length; j++) {
        const b = pucks[j];
        if (b.fall !== null) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= 2 * BOARD.radius - 1e-6) continue;
        separated = true;
        const nx = distance ? dx / distance : 0;
        const nz = distance ? dz / distance : 1;
        const overlap = BOARD.radius - distance / 2;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;
        const aClosing = a.vx * nx + a.vz * nz;
        const bClosing = -(b.vx * nx + b.vz * nz);
        const impulse = Math.max(0, aClosing + bClosing) * 0.9;
        if (impulse > 0 && a.team !== b.team) {
          if (aClosing > 0) a.hitRival = true;
          if (bClosing > 0) b.hitRival = true;
        }
        a.vx -= impulse * nx;
        a.vz -= impulse * nz;
        b.vx += impulse * nx;
        b.vz += impulse * nz;
      }
    }

    if (!separated) break;
    for (const puck of pucks) {
      if (puck.fall !== null) continue;
      bounceOffDiamond(puck);
      bounceOffBumpers(puck, bumpers);
      checkEdges(puck);
    }
  }
  return pucks.some(({ fall, vx, vz }) =>
    fall === null ? vx !== 0 || vz !== 0 : fall < 0.7,
  );
}

export function countClashPucks(pucks) {
  const counts = [0, 0];
  for (const puck of pucks) if (puck.fall === null) counts[puck.team]++;
  return counts;
}

export function chooseClashShot(pucks, bumpers, random = Math.random) {
  const origin = clashLaunchPosition(1, pucks, bumpers);
  let best;
  let bestScore = -Infinity;
  for (let lane = -7; lane <= 7; lane++) {
    for (const power of [0.34, 0.53, 0.73, 0.91, 1]) {
      const shot = { aim: lane * 0.065, power };
      const practice = pucks
        .filter(({ fall }) => fall === null)
        .map((puck) => ({ ...puck }));
      const stone = launchClashPuck(1, shot, origin);
      practice.push(stone);
      for (
        let tick = 0;
        tick < 650 && stepClash(practice, STEP, bumpers);
        tick++
      );
      enforceClashLanding([stone]);
      const [blue, orange] = countClashPucks(practice);
      const score =
        (orange - blue) * 5 -
        Math.abs(stone.x) * 0.45 +
        (stone.fall === null ? (stone.z + BOARD.launch) * 0.08 : 0) +
        random() * 0.9;
      if (score > bestScore) {
        best = shot;
        bestScore = score;
      }
    }
  }
  return best;
}
