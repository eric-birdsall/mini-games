export const BAD_DRAW = Object.freeze({
  duration: 60_000,
  width: 960,
  height: 600,
  amplitude: 24,
  frequency: 1.8,
  strokeWidth: 5,
  ink: "#233c36",
  undo: 2,
  clear: 1,
  cursorSpeed: 530,
  deadZone: 0.15,
  sampleMs: 1000 / 120,
  sampleDistance: 5,
  maxSampleGap: 100,
  urgentSeconds: 10,
});

export const DRAW_PHASE = Object.freeze({
  READY: "ready",
  REVEAL: "reveal",
  PLAYING: "playing",
  RESULTS: "results",
});

/** Seeded smooth value noise, sampled at continuous time, with independent
 * fields on each axis. A second octave keeps the wander from feeling regular. */
export function createDrift(seed, config = BAD_DRAW) {
  const lattice = (i, salt) => {
    let n = Math.imul(i ^ seed, 0x9e3779b1) ^ salt;
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 0x7fffffff - 1;
  };
  const noise = (t, salt) => {
    const i = Math.floor(t);
    const u = t - i;
    const eased = u * u * u * (u * (u * 6 - 15) + 10);
    const a = lattice(i, salt);
    return a + (lattice(i + 1, salt) - a) * eased;
  };
  const axis = (t, salt) =>
    noise(t, salt) * 0.78 + noise(t * 2.37, salt ^ 0x75bc0b) * 0.22;
  return (timeMs) => {
    const t = (timeMs / 1000) * config.frequency;
    const x = axis(t, 0x463e4a);
    const y = axis(t, 0x413ff7);
    const scale = config.amplitude / Math.max(1, Math.hypot(x, y));
    return { x: x * scale, y: y * scale };
  };
}

/** Shared by Correct and the frame timer so the deadline always wins ties. */
export function roundResult(
  correct,
  deadline,
  now,
  duration = BAD_DRAW.duration,
) {
  const remaining = Math.max(0, Math.min(duration, deadline - now));
  const success = correct && remaining > 0;
  return {
    success,
    remaining,
    score: success ? Math.round((100 * remaining) / duration) : 0,
  };
}

/** Radial dead zone, preserving analog speed and diagonal direction. */
export function drawStick(x, y, deadZone = BAD_DRAW.deadZone) {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const scale = (Math.min(1, length) - deadZone) / ((1 - deadZone) * length);
  return { x: x * scale, y: y * scale };
}
