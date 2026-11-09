export const COURSE_LENGTH = 420;
export const TRACK_HALF = 5.6;
export function course() {
  const items = [];
  for (let i = 0; i < 23; i++) {
    const z = 24 + i * 16;
    items.push({
      id: `hazard${i}`,
      kind: "mud",
      x: [-3.6, 0, 3.6][(i + 1) % 3],
      z,
      width: 3.2,
      length: 5,
    });
  }
  for (let i = 0; i < 8; i++) {
    items.push({
      id: `slide${i}`,
      kind: "slide",
      x: [-3.6, 0, 3.6][i % 3],
      z: 30 + i * 49,
      width: 2.8,
      length: 32,
    });
  }
  return items;
}
export function racer(name, x = 0) {
  return {
    name,
    x,
    z: 0,
    speed: 10,
    chain: 0,
    boost: 0,
    mud: false,
    mudEntries: 0,
    finish: null,
    lastSlide: null,
  };
}
export function stepRacer(r, input, dt, elapsed, items) {
  if (r.finish !== null) return;
  r.boost = Math.max(0, r.boost - dt);
  if (!r.boost) r.chain = 0;
  r.x = Math.max(
    -TRACK_HALF,
    Math.min(TRACK_HALF, r.x + (input.steer || 0) * 8 * dt),
  );
  const slide = items.find(
    (o) =>
      o.kind === "slide" &&
      Math.abs(o.x - r.x) < o.width / 2 &&
      Math.abs(o.z - r.z) < o.length / 2,
  );
  if (slide && r.lastSlide !== slide.id) {
    r.chain = Math.min(5, r.chain + 1);
    r.lastSlide = slide.id;
  }
  if (slide) r.boost = 2.4;
  const inMud = items.some(
    (o) =>
      o.kind === "mud" &&
      Math.abs(o.x - r.x) < o.width / 2 + 0.35 &&
      Math.abs(o.z - r.z) < o.length / 2,
  );
  if (inMud && !r.mud) r.mudEntries++;
  r.mud = inMud;
  if (inMud) {
    r.boost = 0;
    r.chain = 0;
  }
  const target =
    (r.mud ? 4 : 10 + (r.boost > 0 ? 3 + r.chain * 1.7 : 0)) *
    (input.pace ?? 1);
  r.speed += (target - r.speed) * Math.min(1, dt * 9);
  const oldZ = r.z;
  r.z = Math.min(COURSE_LENGTH, r.z + r.speed * dt);
  if (r.z >= COURSE_LENGTH)
    r.finish =
      elapsed + dt * ((COURSE_LENGTH - oldZ) / Math.max(0.001, r.speed * dt));
}
export const SLIPSTREAM_LEVELS = {
  easy: { pace: 0.85, lookahead: 12, avoid: 6, steer: 0.55 },
  normal: { pace: 1, lookahead: 20, avoid: 12, steer: 0.9 },
  hard: { pace: 1.12, lookahead: 30, avoid: 18, steer: 1.3 },
};
export function botInput(r, items, index, level = "normal") {
  const settings = SLIPSTREAM_LEVELS[level] || SLIPSTREAM_LEVELS.normal;
  const ahead = items.filter(
    (o) =>
      o.z + o.length / 2 > r.z && o.z - o.length / 2 < r.z + settings.lookahead,
  );
  const obstacle = ahead.find(
    (o) =>
      o.kind === "mud" &&
      o.z - r.z < settings.avoid &&
      Math.abs(o.x - r.x) < 1.9,
  );
  const slide = ahead.find((o) => o.kind === "slide");
  const target = obstacle
    ? obstacle.x >= 0
      ? -3.6
      : 3.6
    : slide
      ? slide.x
      : (index - 1) * 2;
  return {
    pace: settings.pace,
    steer: Math.max(-1, Math.min(1, (target - r.x) * settings.steer)),
  };
}
