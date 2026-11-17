// Sink or Float: cross a pond on stepping stones. Some stones float and hold
// you up; the rest look the same but sink the moment you land on them.
//
// Row 0 is the near bank and row `rows + 1` is the far bank. Every stone row
// has LANES stones. A hidden path of floaters always reaches the far bank
// using forward, back and sideways hops (no diagonals), and a few extra
// floaters are scattered around it as red herrings.

export const LANES = 5;
export const HOP_TIME = 0.34;
export const SINK_TIME = 1.25; // from landing on a sinker to back on the bank
export const EXTRA_FLOATERS = 0.28;

export const POND_ROUNDS = [
  { rows: 5, name: "Lily Shallows" },
  { rows: 7, name: "Reed Bend" },
  { rows: 9, name: "Deep Water" },
];

export const DIRS = {
  up: [1, 0],
  down: [-1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** Small seeded generator so tests and previews get the same pond. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * stones[r][lane] for r = 1..rows (index 0 is unused so rows match the board).
 * Each stone: { floats, sunk, known } where `known` means the player has
 * landed on it and found out.
 */
export function createPond(rows, random = Math.random) {
  const stones = [null];
  for (let r = 1; r <= rows; r++)
    stones.push(
      Array.from({ length: LANES }, () => ({
        floats: false,
        sunk: false,
        known: false,
      })),
    );
  // Random walk of floaters from the near bank to the far bank.
  let lane = Math.floor(random() * LANES);
  for (let r = 1; r <= rows; r++) {
    stones[r][lane].floats = true;
    if (r === rows) break;
    const step = Math.floor(random() * 3) - 1;
    const next = Math.max(0, Math.min(LANES - 1, lane + step));
    // Moving lanes happens sideways within this row, so both stones float.
    for (let l = Math.min(lane, next); l <= Math.max(lane, next); l++)
      stones[r][l].floats = true;
    lane = next;
  }
  // Red herrings, but every row keeps at least two sinkers.
  for (let r = 1; r <= rows; r++) {
    for (const stone of stones[r])
      if (
        !stone.floats &&
        random() < EXTRA_FLOATERS &&
        stones[r].filter((s) => !s.floats).length > 2
      )
        stone.floats = true;
  }
  return { rows, stones };
}

export function createRun(round, random = Math.random) {
  const pond = createPond(round.rows, random);
  return {
    pond,
    player: { row: 0, lane: Math.floor(LANES / 2) },
    splashes: 0,
    hops: 0,
    time: 0,
    done: false,
  };
}

export const isBank = (pond, row) => row === 0 || row === pond.rows + 1;

/** Where a hop in `dir` would land, or null when it isn't allowed. */
export function hopTarget(run, dir) {
  const [dr, dl] = DIRS[dir] ?? [0, 0];
  if (!dr && !dl) return null;
  const { pond, player } = run;
  const row = player.row + dr;
  const lane = player.lane + dl;
  if (row < 0 || row > pond.rows + 1 || lane < 0 || lane >= LANES) return null;
  // Don't hop back onto the start bank sideways or off the far bank.
  if (player.row === pond.rows + 1) return null;
  // Stones you've already seen sink stay gone: nothing to land on.
  if (!isBank(pond, row) && pond.stones[row][lane].sunk) return null;
  return { row, lane };
}

/**
 * Land on `to`. Returns "bank" | "float" | "sink" | "goal".
 * Sinking marks the stone sunk and counts a splash; the caller sends the
 * player back with `respawn` once the splash has played.
 */
export function land(run, to) {
  const { pond } = run;
  run.player = { ...to };
  run.hops++;
  if (to.row === pond.rows + 1) {
    run.done = true;
    return "goal";
  }
  if (to.row === 0) return "bank";
  const stone = pond.stones[to.row][to.lane];
  stone.known = true;
  if (stone.floats) return "float";
  stone.sunk = true;
  run.splashes++;
  return "sink";
}

export function respawn(run) {
  run.player = { row: 0, lane: run.player.lane };
}

/** Lanes of the floaters the player has found, for showing a safe trail. */
export function knownFloaters(pond) {
  const found = [];
  for (let r = 1; r <= pond.rows; r++)
    pond.stones[r].forEach((s, lane) => {
      if (s.known && s.floats) found.push({ row: r, lane });
    });
  return found;
}

/** Stars for a crossing: 3 for no splashes, 2 for up to 3, 1 otherwise. */
export const roundStars = (splashes) =>
  splashes === 0 ? 3 : splashes <= 3 ? 2 : 1;

export function summary(results) {
  const splashes = results.reduce((n, r) => n + r.splashes, 0);
  const time = results.reduce((n, r) => n + r.time, 0);
  const stars = results.reduce((n, r) => n + roundStars(r.splashes), 0);
  return { splashes, time, stars };
}
