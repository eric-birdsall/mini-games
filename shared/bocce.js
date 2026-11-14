export const COURT = { width: 360, height: 680, startX: 180, startY: 630 };
export const DRAG = 240;
export const TOP_SPEED = 560;
export const AIM_LIMIT = 0.72;
export const WIN_SCORE = 7;

export const COURSE = [
  "Terrace Lawn",
  "Woodland Edge",
  "Fern Hollow",
  "Pine Ridge",
  "Forest Glade",
];

export function terrainHeight(x, y, section) {
  const crossSlope = Math.sin(section * 1.6 + 0.55) * 0.045;
  const alongSlope = 0.025 * Math.cos(section * 1.5);
  return (
    (x - 180) * crossSlope +
    (y - 340) * alongSlope +
    4 * Math.sin(x / 80 + y / 175 + section)
  );
}

export function terrainSlope(x, y, section) {
  return [
    (terrainHeight(x + 1, y, section) - terrainHeight(x - 1, y, section)) / 2,
    (terrainHeight(x, y + 1, section) - terrainHeight(x, y - 1, section)) / 2,
  ];
}

export function bocceEnd(section = 0) {
  return { balls: [], remaining: [4, 4], section };
}

export function throwPallino(end, angle, speed) {
  end.balls.push({
    team: -1,
    r: 8,
    x: COURT.startX,
    y: COURT.startY,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    flight: 0.65,
  });
}

export const restingSpeed = (distance) => Math.sqrt(2 * DRAG * distance);
export const distanceTo = (ball, pallino) =>
  Math.hypot(ball.x - pallino.x, ball.y - pallino.y);

export function rollBocce(end, team, angle, speed) {
  end.remaining[team]--;
  end.balls.push({
    team,
    r: 14,
    x: COURT.startX,
    y: COURT.startY,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
  });
}

export function bocceStanding(end) {
  const [pallino, ...balls] = end.balls;
  const ranked = balls
    .map((ball) => ({ ball, distance: distanceTo(ball, pallino) }))
    .sort((a, b) => a.distance - b.distance);
  if (!ranked.length) return { team: -1, points: 0 };
  const team = ranked[0].ball.team;
  const rival = ranked.find((entry) => entry.ball.team !== team);
  const cutoff = rival ? rival.distance - 0.1 : Infinity;
  return {
    team,
    points: ranked.filter(
      (entry) => entry.ball.team === team && entry.distance < cutoff,
    ).length,
  };
}

export function nextBocceTeam(end, current) {
  if (!end.remaining[0] && !end.remaining[1]) return -1;
  if (!end.remaining[0]) return 1;
  if (!end.remaining[1]) return 0;
  const { team, points } = bocceStanding(end);
  return points ? 1 - team : 1 - current;
}

export function stepBocce(end, dt) {
  const { balls } = end;
  for (const ball of balls) {
    if (ball.flight > 0) ball.flight = Math.max(0, ball.flight - dt);
    if (ball.vx || ball.vy) {
      const [slopeX, slopeY] = terrainSlope(ball.x, ball.y, end.section);
      ball.vx -= slopeX * 740 * dt;
      ball.vy -= slopeY * 740 * dt;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    const scale = speed ? Math.max(0, speed - DRAG * dt) / speed : 0;
    ball.vx *= scale;
    ball.vy *= scale;
  }
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const overlap = a.r + b.r - distance;
      if (overlap <= 0) continue;
      const x = distance ? dx / distance : 1;
      const y = distance ? dy / distance : 0;
      a.x -= (x * overlap) / 2;
      a.y -= (y * overlap) / 2;
      b.x += (x * overlap) / 2;
      b.y += (y * overlap) / 2;
      const closing = (a.vx - b.vx) * x + (a.vy - b.vy) * y;
      if (closing <= 0) continue;
      const impulse = 0.83 * closing;
      a.vx -= impulse * x;
      a.vy -= impulse * y;
      b.vx += impulse * x;
      b.vy += impulse * y;
    }
  }
  for (const ball of balls) {
    const x = Math.max(ball.r, Math.min(COURT.width - ball.r, ball.x));
    const y = Math.max(ball.r, Math.min(COURT.height - ball.r, ball.y));
    if (x !== ball.x) ball.vx *= -0.55;
    if (y !== ball.y) ball.vy *= -0.55;
    ball.x = x;
    ball.y = y;
  }
  return balls.some((ball) => ball.vx || ball.vy);
}
