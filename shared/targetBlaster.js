// Target Blaster rules: the water blaster's pressure, the waves of targets,
// and scoring. Kept free of DOM and Three.js so it can be tested in Node.

export const WAVES_PER_ROUND = 3;
// Every shot fires the same burst and uses this much of a full tank.
export const SHOT_COST = 0.1;
// Holding pump keeps pumping at this pace (seconds per stroke).
export const PUMP_INTERVAL = 0.22;
// A knocked-down target comes back after this long, so a wave always runs
// until its timer is out.
export const RESPAWN_TIME = 1.8;

export const TARGETS = {
  can: { name: "Can", points: 10 },
  bottle: { name: "Bottle", points: 15 },
  bullseye: { name: "Bullseye", points: 20 },
};

// Bullseye rings, from the middle out, as a fraction of the board radius.
export const RINGS = [
  { within: 0.3, points: 50, label: "Bullseye!" },
  { within: 0.65, points: 30, label: "Nice shot!" },
  { within: 1, points: 20, label: "Hit!" },
];

export const BLASTER_LEVELS = {
  easy: { pump: 0.25, size: 1.25, slide: 0.7, time: 35 },
  normal: { pump: 0.2, size: 1, slide: 1, time: 30 },
  hard: { pump: 0.15, size: 0.85, slide: 1.35, time: 25 },
};

export const blasterLevel = (level) =>
  BLASTER_LEVELS[level] || BLASTER_LEVELS.normal;

// --- Pressure ---------------------------------------------------------------
// Pressure runs from 0 (empty) to 1 (full meter). A small epsilon keeps
// floating-point leftovers (0.09999…) from blocking the last shot.
const EPSILON = 1e-6;

export const canFire = (pressure) => pressure + EPSILON >= SHOT_COST;

export function fire(pressure) {
  if (!canFire(pressure)) return { fired: false, pressure };
  return { fired: true, pressure: Math.max(0, pressure - SHOT_COST) };
}

export const pump = (pressure, gain) => Math.min(1, pressure + gain);

// Each wave starts with a full tank.
export const waveStartPressure = () => 1;

// How many shots the meter holds right now.
export const shotsLeft = (pressure) =>
  Math.floor((pressure + EPSILON) / SHOT_COST);

// --- Waves ------------------------------------------------------------------
// Positions are in metres in front of the player: x is left/right, y is the
// height of the target's centre and z is how far away it is (negative).
// Sliders move along x between x - range and x + range.

export const NEAR_Z = -6.5;
export const FAR_Z = -10.5;

const shelf = (z, y, xs, kinds) =>
  xs.map((x, i) => ({ kind: kinds[i % kinds.length], x, y, z }));

export function wavePlan(wave, level = "normal") {
  const { size, slide } = blasterLevel(level);
  const near = shelf(
    NEAR_Z,
    1.12,
    [-2.4, -1.2, 0, 1.2, 2.4],
    ["can", "bottle"],
  );
  const far = shelf(FAR_Z, 1.62, [-3, -1, 1, 3], ["bottle", "can"]);
  const slider = (x, y, z, range, speed, phase = 0) => ({
    kind: "bullseye",
    x,
    y,
    z,
    range,
    speed: speed * slide,
    phase,
  });
  let targets;
  if (wave === 1) targets = near;
  else if (wave === 2)
    targets = [
      ...near.filter((_, i) => i % 2 === 0),
      slider(0, 2.3, -9, 2.6, 0.7),
      slider(0, 1.75, -13, 3.6, 0.55, Math.PI),
    ];
  else
    targets = [
      ...far,
      slider(0, 2.55, -8.5, 2.8, 1.05),
      slider(0, 2.25, -12, 3.4, 0.8, Math.PI / 2),
      slider(0, 3.2, -14.5, 4.4, 0.65, Math.PI),
    ];
  return targets.map((target, id) => ({ ...target, id, scale: size }));
}

export const waveName = (wave) =>
  ["", "Cans and bottles", "Sliding bullseyes", "Everything at once"][wave] ||
  "";

// Where a target is at time t (seconds into the wave). Sliders glide back
// and forth with a smooth turn at each end.
export function targetX(target, t) {
  if (!target.range) return target.x;
  return target.x + target.range * Math.sin(t * target.speed + target.phase);
}

// --- Scoring ----------------------------------------------------------------
// offset is how far from the middle of a bullseye the water landed, as a
// fraction of the board's radius (0 = dead centre, 1 = the edge).
export function bullseyeRing(offset) {
  return RINGS.find((ring) => offset <= ring.within) || null;
}

export function hitPoints(kind, offset = 0) {
  if (kind === "bullseye") return bullseyeRing(offset)?.points ?? 0;
  return TARGETS[kind].points;
}

export function blasterSummary(hits, shots) {
  const score = hits.reduce((sum, hit) => sum + hit.points, 0);
  const count = (kind) => hits.filter((hit) => hit.kind === kind).length;
  return {
    score,
    hits: hits.length,
    shots,
    accuracy: shots ? Math.round((hits.length / shots) * 100) : 0,
    cans: count("can"),
    bottles: count("bottle"),
    bullseyes: count("bullseye"),
    centres: hits.filter((hit) => hit.kind === "bullseye" && hit.points === 50)
      .length,
  };
}
