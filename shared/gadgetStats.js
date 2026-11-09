// Planning-phase gadget tuning. Each tunable gadget has three stats rated 1–5.
// Level 3 is the untuned value, so the default build (3/3/3 = 9) plays exactly
// like the original gadget.
//
// Two tuning modes, chosen per match:
// - "free": set each stat 1–5; a gadget's levels may total STAT_BUDGET.
// - "upgrades": every stat is Normal (level 3). Buy upgrades one property at a
//   time for UPGRADE_COST credits each: UPGRADE_TOTAL per gadget in all, at
//   most +UPGRADE_MAX on any one property.
export const STAT_BUDGET = 10;
export const STAT_MIN = 1;
export const STAT_MAX = 5;
export const STAT_DEFAULT = 3;
export const UPGRADE_COST = 100;
export const UPGRADE_MAX = 2;
export const UPGRADE_TOTAL = 2;
export const upgradeCount = (owned) =>
  Object.values(owned || {}).reduce((sum, n) => sum + n, 0);
export const TUNING_MODES = {
  upgrades: "Upgrades (buy +1 / +2 per property)",
  free: "10-point builds (customize every stat)",
};

// The levels a player's gadgets actually use under the match's tuning mode.
export function activeBuilds(mode, gadgetStats, upgrades) {
  if (mode !== "upgrades") return gadgetStats;
  return Object.fromEntries(
    Object.entries(upgrades || {}).map(([kind, stats]) => [
      kind,
      Object.fromEntries(
        Object.entries(stats).map(([key, n]) => [key, STAT_DEFAULT + n]),
      ),
    ]),
  );
}

const degrees = (v) => Math.round((v * 180) / Math.PI);

export const GADGET_STATS = {
  smoke: {
    throw: { name: "Throw range", unit: "m", values: [10, 13, 16, 20, 24] },
    radius: {
      name: "Cloud radius",
      unit: "m",
      values: [2.5, 3.25, 4, 4.75, 5.5],
    },
    duration: { name: "Duration", unit: "s", values: [4, 6, 8, 10, 12] },
  },
  jammer: {
    throw: { name: "Throw range", unit: "m", values: [10, 13, 16, 20, 24] },
    radius: { name: "Jamming radius", unit: "m", values: [6, 8, 10, 12, 14] },
    duration: { name: "Duration", unit: "s", values: [3, 4.5, 6, 7.5, 9] },
  },
  shutter: {
    span: { name: "Max width", unit: "m", values: [2.5, 3, 3.5, 4.5, 5.5] },
    duration: { name: "Holds for", unit: "s", values: [30, 45, 60, 75, 90] },
    toughness: {
      name: "Extra disarm time",
      unit: "s",
      values: [0, 0.5, 1, 1.5, 2],
    },
  },
  noisemaker: {
    throw: { name: "Throw range", unit: "m", values: [10, 13, 16, 20, 24] },
    duration: { name: "Duration", unit: "s", values: [3, 4.5, 6, 7.5, 9] },
    range: {
      name: "Heard within",
      unit: "m",
      values: [12, 16, 20, 24, 28],
    },
  },
  flashbang: {
    throw: { name: "Throw range", unit: "m", values: [10, 13, 16, 20, 24] },
    radius: {
      name: "Blind radius",
      unit: "m",
      values: [5, 6.5, 8, 9.5, 11],
    },
    duration: {
      name: "Blind time",
      unit: "s",
      values: [1.5, 2.25, 3, 3.75, 4.5],
    },
  },
  pulse: {
    throw: { name: "Throw range", unit: "m", values: [10, 13, 16, 20, 24] },
    radius: {
      name: "Pulse radius",
      unit: "m",
      values: [5, 6.5, 8, 9.5, 11],
    },
    duration: {
      name: "Outline time",
      unit: "s",
      values: [1.5, 2.25, 3, 3.75, 4.5],
    },
  },
  scanner: {
    range: { name: "Scan range", unit: "m", values: [7, 9.5, 12, 14.5, 17] },
    sweep: {
      name: "Sweep speed",
      unit: "s sweep",
      values: [2.5, 2, 1.5, 1.1, 0.8],
    },
    width: {
      name: "Sector width",
      unit: "°",
      values: [0.55, 0.72, 0.9, 1.05, 1.2],
      format: degrees,
    },
  },
  disarm: {
    speed: {
      name: "Disarm speed",
      unit: "s hold",
      values: [1.2, 0.8, 0.5, 0.35, 0.2],
    },
    reach: { name: "Reach", unit: "m", values: [2, 2.5, 3, 3.5, 4] },
    tolerance: {
      name: "Aim tolerance",
      unit: "°",
      values: [0.35, 0.45, 0.55, 0.65, 0.75],
      format: degrees,
    },
  },
  tripwire: {
    hold: { name: "Hold time", unit: "s", values: [3, 4, 5, 6, 7] },
    width: {
      name: "Trigger width",
      unit: "m",
      values: [0.25, 0.32, 0.4, 0.5, 0.6],
    },
    span: { name: "Max span", unit: "m", values: [4, 5, 6, 7.5, 9] },
  },
  sensor: {
    radius: {
      name: "Detection radius",
      unit: "m",
      values: [4, 5.5, 7, 8.5, 10],
    },
    rearm: {
      name: "Re-alert speed",
      unit: "s delay",
      values: [7, 5.5, 4, 3, 2],
    },
    reveal: { name: "Reveal time", unit: "s", values: [2, 2.5, 3, 4, 5] },
  },
  cloak: {
    duration: { name: "Duration", unit: "s", values: [3, 4, 5, 6.5, 8] },
    recharge: { name: "Recharge", unit: "s", values: [20, 16, 12, 9, 7] },
    // How fast a sentinel's Seen bar fills while you are cloaked.
    seen: {
      name: "Seen speed",
      unit: "% of normal",
      values: [0.6, 0.45, 0.3, 0.2, 0.1],
      format: (v) => Math.round(v * 100),
    },
  },
  // Portable types can't be destroyed, so their standard values sit lower.
  jammerPortable: {
    radius: { name: "Jamming radius", unit: "m", values: [3, 4, 5, 6, 7] },
    duration: { name: "Duration", unit: "s", values: [2, 3, 4, 5, 6] },
    recharge: { name: "Recharge", unit: "s", values: [12, 10, 8, 6.5, 5] },
  },
  sensorPortable: {
    radius: {
      name: "Detection radius",
      unit: "m",
      values: [2.5, 3.5, 4.5, 5.5, 6.5],
    },
    rearm: {
      name: "Re-alert speed",
      unit: "s delay",
      values: [7, 5.5, 4, 3, 2],
    },
    reveal: { name: "Reveal time", unit: "s", values: [1.5, 2, 2.5, 3, 4] },
  },
  cameraPortable: {
    reach: { name: "Pole reach", unit: "m", values: [0.6, 0.9, 1.2, 1.5, 1.8] },
  },
};

export const isTunable = (kind) => kind in GADGET_STATS;

export function defaultStats(kind) {
  return Object.fromEntries(
    Object.keys(GADGET_STATS[kind] || {}).map((key) => [key, STAT_DEFAULT]),
  );
}

export const statTotal = (levels) =>
  Object.values(levels || {}).reduce((sum, v) => sum + v, 0);

// Returns a clean copy of the build, or null if any level is out of range or
// the total exceeds the budget. Unknown keys are dropped; missing keys fail.
export function validateStats(kind, levels, budget = STAT_BUDGET) {
  const stats = GADGET_STATS[kind];
  if (!stats || !levels || typeof levels !== "object") return null;
  const clean = {};
  for (const key of Object.keys(stats)) {
    const level = levels[key];
    if (!Number.isInteger(level) || level < STAT_MIN || level > STAT_MAX)
      return null;
    clean[key] = level;
  }
  return statTotal(clean) <= budget ? clean : null;
}

export function statLevel(builds, kind, stat) {
  return builds?.[kind]?.[stat] ?? STAT_DEFAULT;
}

export function statValue(builds, kind, stat) {
  return GADGET_STATS[kind][stat].values[statLevel(builds, kind, stat) - 1];
}

export function formatStat(kind, stat, level) {
  const def = GADGET_STATS[kind][stat],
    value = def.values[level - 1];
  // "52°" and "60% jammer reach" attach the symbol; "3 m" keeps a space.
  const gap = /^[°%]/.test(def.unit) ? "" : " ";
  return `${def.format ? def.format(value) : value}${gap}${def.unit}`;
}
