// Sea Sweeper: walk a beach, pick up what the tide leaves behind and carry it
// off. Trash goes in the bin (that's the score); seashells go in the bucket
// (a bonus collection). The beach is seen from above with the sea along the
// top edge (negative z), the bin at the bottom left and the bucket at the
// bottom right.

export const TIDES = 5;
// Half-sizes of the walkable sand.
export const BEACH = { x: 8, z: 4.6 };
// Where the water meets the sand; new things land between here and DRY_LINE.
export const SHORE = -BEACH.z;
export const DRY_LINE = 1.6;
export const SPEED = 4.2;
// Walk within this of something to pick it up, or of the bin / bucket to
// drop it in. Generous, so small hands on a stick don't have to be exact.
export const PICK_RADIUS = 0.85;
export const DROP_RADIUS = 1.75;
export const BIN = { x: -BEACH.x + 1.8, z: BEACH.z - 1.5 };
export const BUCKET = { x: BEACH.x - 1.8, z: BEACH.z - 1.5 };
// Seconds for a wave to roll in, sweep the beach and pull back out. Halfway
// through, whatever is left washes away and the new things land.
export const WAVE = 2.6;

// Seconds each tide lasts before the next wave comes in, by difficulty.
export const TIDE_TIME = { easy: 60, normal: 45, hard: 34 };
export const tideTime = (level) => TIDE_TIME[level] ?? TIDE_TIME.normal;

// How many pieces of trash and shells each tide brings (30 trash in all).
export const TRASH_PER_TIDE = [4, 5, 6, 7, 8];
export const SHELLS_PER_TIDE = [2, 3, 3, 3, 4];
export const TOTAL_TRASH = TRASH_PER_TIDE.reduce((a, b) => a + b, 0);

// Trash, with the word shown under each piece so players learn them.
export const TRASH = [
  { id: "bottle", name: "Bottle" },
  { id: "can", name: "Can" },
  { id: "bag", name: "Trash bag" },
  { id: "cup", name: "Cup" },
  { id: "flipflop", name: "Flip-flop" },
  { id: "foam", name: "Styrofoam box" },
];
export const TRASH_KINDS = TRASH.map((t) => t.id);
// Shells, commonest first; weight is how often the tide brings one.
export const SHELL_KINDS = [
  { id: "clam", name: "Clam", weight: 34 },
  { id: "mussel", name: "Mussel", weight: 26 },
  { id: "spiral", name: "Spiral shell", weight: 16 },
  { id: "starfish", name: "Starfish", weight: 12 },
  { id: "sanddollar", name: "Sand dollar", weight: 9 },
  { id: "golden", name: "Golden shell", weight: 3 },
];

// A small seeded random number generator (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickShell(r) {
  const total = SHELL_KINDS.reduce((a, s) => a + s.weight, 0);
  let roll = r() * total;
  for (const s of SHELL_KINDS) {
    roll -= s.weight;
    if (roll < 0) return s.id;
  }
  return SHELL_KINDS[0].id;
}

// The word for a piece of trash or a shell.
export const itemName = (item) =>
  (item.type === "trash" ? TRASH : SHELL_KINDS).find((k) => k.id === item.kind)
    ?.name ?? item.kind;

const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;

// The things one tide leaves on the sand, spread out so none overlap and
// none land on the bin, the bucket or right under the walker.
export function tideItems(tide, seed, avoid = null) {
  const r = rng(seed + tide * 7919);
  const items = [];
  const kinds = [
    ...Array(TRASH_PER_TIDE[tide]).fill("trash"),
    ...Array(SHELLS_PER_TIDE[tide]).fill("shell"),
  ];
  for (const type of kinds) {
    let spot;
    for (let tries = 0; tries < 60; tries++) {
      spot = {
        x: (r() * 2 - 1) * (BEACH.x - 0.8),
        z: SHORE + 0.7 + r() * (DRY_LINE - SHORE - 0.7),
      };
      const crowded =
        items.some((o) => near(o, spot, 1.6)) ||
        // Keep clear of the bin and bucket, which are tall enough to hide
        // things just in front of them.
        near(spot, BIN, DROP_RADIUS + 1.3) ||
        near(spot, BUCKET, DROP_RADIUS + 1.3) ||
        (avoid && near(spot, avoid, PICK_RADIUS + 0.4));
      if (!crowded) break;
    }
    items.push({
      id: tide * 100 + items.length,
      type,
      kind:
        type === "trash"
          ? TRASH_KINDS[Math.floor(r() * TRASH_KINDS.length)]
          : pickShell(r),
      x: spot.x,
      z: spot.z,
      turn: r() * Math.PI * 2,
    });
  }
  return items;
}

export function newGame(level = "normal", seed = 1) {
  return {
    level,
    seed,
    tide: -1, // the tide on the beach now; -1 before the first wave
    phase: "wave", // wave | open | done
    waveT: 0,
    clock: tideTime(level),
    player: { x: 0, z: BEACH.z - 1.4, facing: 0 },
    carrying: null,
    items: [],
    trash: 0,
    trashSeen: 0,
    shells: {},
    washed: 0,
  };
}

// The walker's step for a stick or keys pushed (x, z), each -1..1.
export function walk(game, x, z, dt) {
  const len = Math.hypot(x, z);
  if (len < 0.05) return 0;
  const k = Math.min(1, len) / len;
  const p = game.player;
  const nx = Math.max(-BEACH.x, Math.min(BEACH.x, p.x + x * k * SPEED * dt));
  const nz = Math.max(SHORE + 0.2, Math.min(BEACH.z, p.z + z * k * SPEED * dt));
  const moved = Math.hypot(nx - p.x, nz - p.z);
  p.x = nx;
  p.z = nz;
  // Same convention as the other critter games: facing f looks along
  // (-sin f, -cos f).
  p.facing = Math.atan2(-x, -z);
  return moved;
}

// The beach is clear once nothing is left on the sand and the last thing
// picked up has gone in the bin or the bucket.
export const beachClear = (game) => game.items.length === 0 && !game.carrying;

// Moves the game on by dt with the stick at (x, z). Returns what happened
// this step as a list of events for sounds and pop-ups:
//   { type: "wave" }               a wave starts rolling in
//   { type: "land", tide }         new things are on the sand
//   { type: "washed", count }      the wave took that many things back out
//   { type: "pickup", item }
//   { type: "bin", item }          trash in the bin
//   { type: "bucket", item }       a shell in the bucket
//   { type: "cleared", tide }      the beach is clear before the clock ran out
//   { type: "timeup", tide }
//   { type: "done" }               the last tide is over
export function step(game, input, dt) {
  const events = [];
  if (game.phase === "done") return events;
  walk(game, input.x, input.z, dt);
  const p = game.player;

  if (game.phase === "wave") {
    const was = game.waveT;
    game.waveT += dt;
    if (was === 0) events.push({ type: "wave" });
    if (was < WAVE / 2 && game.waveT >= WAVE / 2) {
      if (game.items.length) {
        game.washed += game.items.filter((i) => i.type === "trash").length;
        events.push({ type: "washed", count: game.items.length });
      }
      game.tide++;
      if (game.tide >= TIDES) {
        game.items = [];
        game.phase = "done";
        events.push({ type: "done" });
        return events;
      }
      game.items = tideItems(game.tide, game.seed, p);
      game.trashSeen += TRASH_PER_TIDE[game.tide];
      events.push({ type: "land", tide: game.tide });
    }
    if (game.waveT >= WAVE) {
      game.phase = "open";
      game.clock = tideTime(game.level);
    }
  } else {
    game.clock = Math.max(0, game.clock - dt);
  }

  // Pick up the nearest thing in reach (once the wave has pulled back past
  // it, so you can't grab something mid-wave).
  if (!game.carrying && game.phase === "open") {
    let best = null;
    let bestD = PICK_RADIUS;
    for (const item of game.items) {
      const d = Math.hypot(item.x - p.x, item.z - p.z);
      if (d < bestD) {
        best = item;
        bestD = d;
      }
    }
    if (best) {
      game.items = game.items.filter((i) => i !== best);
      game.carrying = best;
      events.push({ type: "pickup", item: best });
    }
  }

  // Drop it off at the right place. Walking past the wrong one does nothing.
  const held = game.carrying;
  if (held) {
    if (held.type === "trash" && near(p, BIN, DROP_RADIUS)) {
      game.trash++;
      game.carrying = null;
      events.push({ type: "bin", item: held });
    } else if (held.type === "shell" && near(p, BUCKET, DROP_RADIUS)) {
      game.shells[held.kind] = (game.shells[held.kind] || 0) + 1;
      game.carrying = null;
      events.push({ type: "bucket", item: held });
    }
  }

  if (game.phase === "open") {
    // A cleared beach brings the next wave straight away. If the clock runs
    // out instead, whatever you're holding stays in your hands.
    if (beachClear(game)) {
      events.push({ type: "cleared", tide: game.tide });
      endTide(game, events);
    } else if (game.clock <= 0) {
      events.push({ type: "timeup", tide: game.tide });
      endTide(game, events);
    }
  }
  return events;
}

function endTide(game, events) {
  if (game.tide < TIDES - 1) {
    startWave(game);
    return;
  }
  game.washed += game.items.filter((i) => i.type === "trash").length;
  game.phase = "done";
  events.push({ type: "done" });
}

function startWave(game) {
  game.phase = "wave";
  game.waveT = 0;
}

// How far up the sand the wave reaches right now: SHORE when the sea is
// calm, up to just past DRY_LINE at the wave's peak.
export function waveReach(game) {
  if (game.phase !== "wave") return SHORE;
  const f = Math.sin(Math.min(1, game.waveT / WAVE) * Math.PI);
  return SHORE + f * (DRY_LINE + 0.6 - SHORE);
}

export const shellCount = (shells) =>
  Object.values(shells).reduce((a, b) => a + b, 0);

// Stars for the trash cleaned out of everything the tides brought.
export function stars(trash, total = TOTAL_TRASH) {
  const f = total ? trash / total : 0;
  return f >= 1 ? 3 : f >= 0.7 ? 2 : f >= 0.4 ? 1 : 0;
}
