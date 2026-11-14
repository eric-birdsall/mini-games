export const WIDTH = 5;
export const LENGTH = 8;
export const GRAVITY = 9.81;
export const BATONS = 6;
export const HEIGHT = 1.05;
export const PITCH = 0.16;
export const speed = (power) => 5 + 10 * power;
export const direction = (side) => (side === 0 ? 1 : -1);

export function newMatch() {
  const pieces = Array.from({ length: 10 }, (_, id) => ({
    id,
    side: Math.floor(id / 5),
    x: ((id % 5) - 2) * 1.04,
    z: id < 5 ? 0 : LENGTH,
    kind: "base",
    standing: true,
  }));
  pieces.push({ id: 10, x: 0, z: LENGTH / 2, kind: "king", standing: true });
  return {
    pieces,
    side: 0,
    line: 0,
    round: 1,
    left: BATONS,
    winner: null,
    hits: [0, 0],
  };
}

export function targets(match) {
  const rivals = match.pieces.filter(
    (p) => p.standing && p.side === 1 - match.side,
  );
  const fields = rivals.filter((p) => p.kind === "field");
  return fields.length ? fields : rivals.length ? rivals : [match.pieces[10]];
}

export const activeLine = (match) =>
  targets(match)[0].kind === "king" ? match.side * LENGTH : match.line;
export const throwLine = (match) =>
  activeLine(match) - direction(match.side) * 0.46;

export function flight(match, aim, pitch, power) {
  const sign = direction(match.side);
  const v = speed(power);
  const horizontal = v * Math.cos(pitch);
  return {
    z: throwLine(match),
    vx: sign * horizontal * Math.sin(aim),
    vz: sign * horizontal * Math.cos(aim),
    vy: v * Math.sin(pitch),
  };
}

export function position(shot, t) {
  return {
    x: shot.vx * t,
    z: shot.z + shot.vz * t,
    y: HEIGHT + shot.vy * t - (GRAVITY * t * t) / 2,
  };
}

export function collision(match, point) {
  return match.pieces.find((p) => {
    if (!p.standing || p.side === match.side) return false;
    const king = p.kind === "king";
    return (
      point.y <= (king ? 0.76 : 0.39) &&
      Math.hypot(point.x - p.x, point.z - p.z) <= (king ? 0.28 : 0.23)
    );
  });
}

export function settle(match, hit) {
  match.left--;
  if (!hit) return "Miss. The baton hit the turf.";
  if (hit.kind === "king") {
    const legal = targets(match)[0] === hit;
    hit.standing = false;
    match.winner = legal ? match.side : 1 - match.side;
    return legal ? "The king is down!" : "The king fell too early.";
  }
  if (!targets(match).includes(hit))
    return "Field kubbs come first. The baseline kubb is reset.";
  hit.standing = false;
  match.hits[match.side]++;
  return hit.kind === "base" ? "Baseline kubb down!" : "Field kubb down!";
}

export function nextTurn(match) {
  const oldSide = match.side;
  const newSide = 1 - oldSide;
  const standingFields = match.pieces.filter(
    (p) => p.standing && p.side === newSide && p.kind === "field",
  );
  const advance = standingFields.length
    ? (newSide === 0 ? Math.max : Math.min)(...standingFields.map((p) => p.z))
    : newSide * LENGTH;
  // Automatically stake knocked kubbs in the throwing team's half.
  const placements = [
    [-1.3, 2.15],
    [1.3, 2.15],
    [0, 1.3],
    [-1.87, 3.05],
    [1.87, 3.05],
    [-0.9, 0.8],
    [0.9, 0.8],
    [-0.65, 3.25],
    [0.65, 3.25],
    [1.8, 1.05],
  ];
  const moved = [];
  for (const p of match.pieces) {
    if (p.standing || p.kind === "king") continue;
    const spot = placements.find(([x, d]) => {
      const z = oldSide === 0 ? d : LENGTH - d;
      return !match.pieces.some(
        (other) =>
          other.standing && Math.hypot(other.x - x, other.z - z) < 0.52,
      );
    });
    const [x, d] = spot ?? placements[p.id];
    Object.assign(p, {
      side: oldSide,
      kind: "field",
      standing: true,
      x,
      z: oldSide === 0 ? d : LENGTH - d,
    });
    moved.push(p);
  }
  match.side = newSide;
  match.line = advance;
  match.left = BATONS;
  if (newSide === 0) match.round++;
  return moved;
}

export function solveShot(match, target, pitch = PITCH) {
  const z = direction(match.side) * (target.z - throwLine(match));
  const x = direction(match.side) * target.x;
  const distance = Math.hypot(x, z);
  const y = target.kind === "king" ? 0.44 : 0.19;
  const v =
    Math.sqrt(
      (GRAVITY * distance ** 2) /
        (2 * Math.max(0.1, HEIGHT + distance * Math.tan(pitch) - y)),
    ) / Math.cos(pitch);
  return {
    aim: Math.atan2(x, z),
    power: Math.max(0, Math.min(1, (v - 5) / 10)),
  };
}
