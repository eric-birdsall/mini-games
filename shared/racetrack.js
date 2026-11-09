// Racetrack Builder rules: the build grid, track pieces, placement, the 3D
// path a track makes, and the toy-car physics. Kept free of DOM and Three.js
// so it can be tested in Node.
//
// The board is a GRID x GRID grid of cells, CELL metres wide. Track sits on
// whole height levels (LEVEL metres apart). A track is built RollerCoaster
// Tycoon style: a start piece, then one piece at a time from the open end.
// Each piece enters a cell heading one of four directions at some level, and
// leaves into a neighbouring cell. A track is closed when the open end comes
// back round into the start cell, heading the same way, on the floor.

export const CELL = 2;
export const LEVEL = 1;
export const GRID = 12;
export const MAX_LEVEL = 6;
export const TRACK_WIDTH = 0.46;
export const LOOP_RADIUS = 0.9;
// The loop's exit is shifted sideways by this much so it clears its entry.
export const LOOP_SHIFT = 0.5;
// The car starts this far along the start piece.
export const START_S = 0.7;

// Headings: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x).
export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// turn: -1 left, 1 right. dh: levels gained. loop / boost: special pieces.
export const PIECES = {
  straight: { label: "Straight", turn: 0, dh: 0, key: "1" },
  left: { label: "Left curve", turn: -1, dh: 0, key: "2" },
  right: { label: "Right curve", turn: 1, dh: 0, key: "3" },
  climb: { label: "Climb", turn: 0, dh: 1, key: "4" },
  descent: { label: "Descent", turn: 0, dh: -1, key: "5" },
  upLeft: { label: "Uphill left", turn: -1, dh: 1, key: "6" },
  upRight: { label: "Uphill right", turn: 1, dh: 1, key: "7" },
  downLeft: { label: "Downhill left", turn: -1, dh: -1, key: "8" },
  downRight: { label: "Downhill right", turn: 1, dh: -1, key: "9" },
  loop: { label: "Loop", turn: 0, dh: 0, loop: true, key: "0" },
  booster: { label: "Booster", turn: 0, dh: 0, boost: true, key: "b" },
};
export const PIECE_TYPES = Object.keys(PIECES);
const START = { label: "Start", turn: 0, dh: 0 };
const piece = (type) => (type === "start" ? START : PIECES[type]);

export const isCurve = (type) => !!piece(type)?.turn;

// The cell an `at` state enters, and the cells (with levels) a piece there
// takes up, plus the state at its open end.
export function footprint(type, at) {
  const p = piece(type);
  const { x, z, h, d } = at;
  const low = p.dh < 0 ? h - 1 : h;
  const high = p.loop || p.dh > 0 ? h + 1 : h;
  const cells = [];
  for (let level = low; level <= high; level++) cells.push([x, z, level]);
  const nd = (d + p.turn + 4) % 4;
  return {
    cells,
    next: { x: x + DIRS[nd][0], z: z + DIRS[nd][1], h: h + p.dh, d: nd },
  };
}

const cellKey = (x, z, level) => `${x},${z},${level}`;
const sameState = (a, b) =>
  a.x === b.x && a.z === b.z && a.h === b.h && a.d === b.d;
export const startState = (start) => ({
  x: start.x,
  z: start.z,
  h: 0,
  d: start.d,
});

// Why a piece can't go at `at`, or null if it fits.
function blocked(type, at, used) {
  const p = piece(type);
  if (!p) return "unknown";
  if (at.h + p.dh < 0) return "low";
  if (at.h + p.dh > MAX_LEVEL || (p.loop && at.h + 1 > MAX_LEVEL))
    return "high";
  const { cells } = footprint(type, at);
  for (const [x, z, level] of cells) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return "edge";
    if (used.has(cellKey(x, z, level))) return "blocked";
  }
  return null;
}

export const BLOCK_REASONS = {
  closed: "The track is already a closed loop!",
  low: "Can't go lower than the floor.",
  high: "That's as high as the track can go.",
  edge: "That would go off the edge of the board.",
  blocked: "Another piece of track is in the way.",
  nostart: "Pick a starting spot first.",
};

// Lay a track out piece by piece. A track is { start: {x, z, d} | null,
// pieces: [type, ...] }. Pieces that don't fit (from an old save, say) are
// dropped from the first one that doesn't.
export function layout(track) {
  const result = { pieces: [], open: null, closed: false, used: new Map() };
  const start = track?.start;
  if (!start) return result;
  if (start.x < 0 || start.z < 0 || start.x >= GRID || start.z >= GRID)
    return result;
  const place = (type, at) => {
    const { cells, next } = footprint(type, at);
    const index = result.pieces.length;
    for (const [x, z, level] of cells)
      result.used.set(cellKey(x, z, level), index);
    result.pieces.push({ type, ...at, cells });
    result.open = next;
  };
  const home = startState(start);
  place("start", home);
  for (const type of track.pieces || []) {
    if (result.closed) break;
    if (blocked(type, result.open, result.used)) break;
    place(type, result.open);
    if (sameState(result.open, home)) result.closed = true;
  }
  return result;
}

// Why `type` can't be added to the laid-out track, or null if it can.
export function canAdd(laid, type) {
  if (!laid.open) return "nostart";
  if (laid.closed) return "closed";
  return blocked(type, laid.open, laid.used);
}

// Would adding `type` close the circuit?
export function wouldClose(laid, start, type) {
  if (!laid.open || laid.closed || canAdd(laid, type)) return false;
  return sameState(footprint(type, laid.open).next, startState(start));
}

// The track's pieces as plain types, keeping only the ones that fit.
export function cleanTrack(track) {
  const laid = layout(track);
  if (!laid.pieces.length) return { start: null, pieces: [] };
  return {
    start: { x: track.start.x, z: track.start.z, d: track.start.d },
    pieces: laid.pieces.slice(1).map((p) => p.type),
  };
}

// ---------------------------------------------------------------- the path

const MID = (GRID - 1) / 2;
export const cellCentre = (x, z) => [(x - MID) * CELL, (z - MID) * CELL];

// Horizontal length of a piece's centre line.
const pieceRun = (type) =>
  piece(type).turn ? (Math.PI / 2) * (CELL / 2) : CELL;

const smooth = (u) => u * u * (3 - 2 * u);

// A point along piece `type` at u in [0, 1], in the piece's own frame:
// f forward from the entry edge, l to the right, y up from its entry level.
// up is the way the track faces, as (forward, up) parts.
function localPoint(type, u, m0, m1) {
  const p = piece(type);
  if (p.loop) {
    const R = LOOP_RADIUS;
    const lead = CELL / 2;
    const ring = 2 * Math.PI * R;
    const a = u * (2 * lead + ring);
    const S = LOOP_SHIFT;
    if (a < lead)
      return { f: a, l: (-S / 2) * smooth(a / lead), y: 0, up: [0, 1] };
    if (a < lead + ring) {
      const th = (a - lead) / R;
      return {
        f: lead + R * Math.sin(th),
        l: -S / 2 + S * smooth(th / (2 * Math.PI)),
        y: R - R * Math.cos(th),
        up: [-Math.sin(th), Math.cos(th)],
        ring: true,
      };
    }
    const b = (a - lead - ring) / lead;
    return {
      f: lead + b * lead,
      l: (S / 2) * (1 - smooth(b)),
      y: 0,
      up: [0, 1],
    };
  }
  // Height: a cubic that leaves and arrives at the joint slopes.
  const run = pieceRun(type);
  const dy = p.dh * LEVEL;
  const u2 = u * u;
  const u3 = u2 * u;
  const y =
    (u3 - 2 * u2 + u) * m0 * run +
    (-2 * u3 + 3 * u2) * dy +
    (u3 - u2) * m1 * run;
  if (!p.turn) return { f: u * CELL, l: 0, y, up: [0, 1] };
  const r = CELL / 2;
  const th = u * (Math.PI / 2);
  return {
    f: r * Math.sin(th),
    l: p.turn * r * (1 - Math.cos(th)),
    y,
    up: [0, 1],
  };
}

const grade = (type) => {
  const p = piece(type);
  return p.loop ? 0 : (p.dh * LEVEL) / pieceRun(type);
};
// Climbs in a row share their slope where they meet; anything else meets flat.
const joint = (a, b) =>
  a && b && Math.sign(a) === Math.sign(b)
    ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b))
    : 0;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

const STEP = 0.04;

// The centre line of a laid-out track as samples about STEP apart, each with
// position p, tangent t, track-up u, side w, curvature vector k, distance s,
// and which piece it's on. Closed tracks wrap round.
export function buildPath(laid) {
  const { pieces, closed } = laid;
  const samples = [];
  const n = pieces.length;
  const grades = pieces.map((p) => grade(p.type));
  const at = (i) => (closed ? grades[(i + n) % n] : grades[i] || 0);
  pieces.forEach((pc, i) => {
    const m0 = joint(at(i - 1), grades[i]);
    const m1 = joint(grades[i], at(i + 1));
    const [cx, cz] = cellCentre(pc.x, pc.z);
    const [dx, dz] = DIRS[pc.d];
    const [rx, rz] = DIRS[(pc.d + 1) % 4];
    const ex = cx - (dx * CELL) / 2;
    const ez = cz - (dz * CELL) / 2;
    const base = pc.h * LEVEL;
    const p = piece(pc.type);
    const length = p.loop
      ? CELL + 2 * Math.PI * LOOP_RADIUS
      : Math.hypot(pieceRun(pc.type), p.dh * LEVEL);
    const count = Math.max(4, Math.ceil(length / STEP));
    const last = !closed && i === n - 1;
    for (let j = 0; j < count + (last ? 1 : 0); j++) {
      const q = localPoint(pc.type, j / count, m0, m1);
      samples.push({
        p: [ex + dx * q.f + rx * q.l, base + q.y, ez + dz * q.f + rz * q.l],
        hint: [dx * q.up[0], q.up[1], dz * q.up[0]],
        piece: i,
        type: pc.type,
        ring: !!q.ring,
      });
    }
  });
  const count = samples.length;
  const wrap = (i) =>
    closed ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
  let s = 0;
  samples.forEach((smp, i) => {
    if (i) s += Math.hypot(...sub(smp.p, samples[i - 1].p));
    smp.s = s;
  });
  const length = closed
    ? s + Math.hypot(...sub(samples[0].p, samples[count - 1].p))
    : s;
  for (let i = 0; i < count; i++) {
    const smp = samples[i];
    smp.t = norm(sub(samples[wrap(i + 1)].p, samples[wrap(i - 1)].p));
    const up = sub(smp.hint, scale(smp.t, dot(smp.hint, smp.t)));
    smp.u = norm(up);
    smp.w = cross(smp.t, smp.u);
  }
  // Curvature from how fast the tangent turns.
  const gap = (a, b) => {
    let d = samples[b].s - samples[a].s;
    if (d <= 0) d += length;
    return d || STEP;
  };
  for (let i = 0; i < count; i++) {
    const a = wrap(i - 1);
    const b = wrap(i + 1);
    samples[i].k = scale(sub(samples[b].t, samples[a].t), 1 / gap(a, b));
  }
  // Smooth out the little jolts where pieces meet.
  const raw = samples.map((smp) => smp.k);
  for (let i = 0; i < count; i++) {
    const k = [0, 0, 0];
    for (let j = -2; j <= 2; j++) {
      const r = raw[wrap(i + j)];
      k[0] += r[0] / 5;
      k[1] += r[1] / 5;
      k[2] += r[2] / 5;
    }
    samples[i].k = k;
  }
  return { samples, length, closed };
}

// The sample at distance s along the path (s wraps on closed tracks).
export function sampleAt(path, s) {
  const { samples, length, closed } = path;
  if (closed) s = ((s % length) + length) % length;
  else s = Math.max(0, Math.min(length, s));
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo];
  const b = samples[lo + 1] || (closed ? samples[0] : a);
  const span = (b.s > a.s ? b.s : length) - a.s;
  const f = span > 0 ? Math.min(1, (s - a.s) / span) : 0;
  const mix = (x, y) => [
    x[0] + (y[0] - x[0]) * f,
    x[1] + (y[1] - x[1]) * f,
    x[2] + (y[2] - x[2]) * f,
  ];
  return {
    p: mix(a.p, b.p),
    t: norm(mix(a.t, b.t)),
    u: norm(mix(a.u, b.u)),
    w: norm(mix(a.w, b.w)),
    k: a.k,
    piece: a.piece,
    type: a.type,
    ring: a.ring,
    index: lo,
  };
}

// ------------------------------------------------------------ the physics

export const PHYS = {
  G: 9.8,
  // Rolling friction, as a share of how hard the track pushes on the car.
  ROLL: 0.015,
  // Air drag.
  DRAG: 0.006,
  // The curve walls hold the car in up to this sideways push (m/s²).
  GRIP: 90,
  // Boosters push this hard (m/s²) until the car reaches BOOST_MAX.
  BOOST: 20,
  BOOST_MAX: 8.6,
  SUBSTEP: 1 / 240,
};

export const PUSH_MIN = 2;
export const PUSH_MAX = 12;

export const EVENT_TEXT = {
  stall: "Stalled on the climb! Rolling back down…",
  loopShort: "Not enough speed for the loop! Rolling back…",
  loopFall: "Too slow! The car fell out of the loop.",
  curve: "Too fast! The car flew off the curve.",
  end: "The car ran off the end of the track.",
  stopped: "The car stopped.",
  crashed: "Crash! The car tumbled to a stop.",
  lap: "Lap!",
  boost: "Boost!",
};

// A fresh run: the car sits on the start piece, pushed at `push` m/s.
export function createRun(path, push = 0) {
  return {
    mode: push ? "track" : "waiting", // waiting | track | free | rest
    s: START_S,
    travel: START_S,
    v: push,
    laps: 0,
    lapTimes: [],
    lapStart: 0,
    time: 0,
    top: push,
    events: [],
    said: new Set(),
    free: null,
    path,
  };
}

function emit(run, kind, once) {
  if (once) {
    if (run.said.has(once)) return;
    run.said.add(once);
  }
  run.events.push({ kind, text: EVENT_TEXT[kind], time: run.time });
}

function derail(run, smp, kind) {
  emit(run, kind);
  const { v } = run;
  // Tumble: roll over off a curve, flip end over end out of a loop.
  const axis = kind === "curve" ? smp.t : smp.w;
  const spinRate = (kind === "curve" ? 9 : 5) * Math.sign(v || 1);
  run.mode = "free";
  run.free = {
    p: [...smp.p],
    vel: scale(smp.t, v),
    t: smp.t,
    u: smp.u,
    w: smp.w,
    axis,
    spin: 0,
    spinRate:
      kind === "curve"
        ? spinRate * Math.sign(dot(smp.k, smp.w) || 1)
        : spinRate,
    landed: false,
  };
}

// Forces on the car at sample smp going v m/s: N is how hard the track
// pushes on the wheels, L how hard the walls push sideways (both m/s²).
export function trackForces(smp, v) {
  const { G } = PHYS;
  const t = smp.t;
  // F = v²k - g⊥, the push the track has to give to keep the car on it.
  const gperp = [G * t[1] * t[0], -G + G * t[1] * t[1], G * t[1] * t[2]];
  const F = sub(scale(smp.k, v * v), gperp);
  return { N: dot(F, smp.u), L: dot(F, smp.w) };
}

function stepTrack(run, dt) {
  const { G, ROLL, DRAG, GRIP, BOOST, BOOST_MAX } = PHYS;
  const path = run.path;
  const smp = sampleAt(path, run.s);
  const { N, L } = trackForces(smp, run.v);
  if (smp.ring && N < 0) return derail(run, smp, "loopFall");
  if (isCurve(smp.type) && Math.abs(L) > GRIP) return derail(run, smp, "curve");
  const along = -G * smp.t[1];
  let push = along;
  const boosting = smp.type === "booster" && run.v < BOOST_MAX;
  if (boosting) {
    push += BOOST;
    emit(run, "boost", `boost-${smp.piece}-${run.laps}`);
  }
  const grip = ROLL * (Math.max(N, 0) + 0.5 * Math.abs(L));
  // Sitting still: friction holds the car if the slope isn't too steep.
  if (run.v === 0) {
    if (Math.abs(push) <= grip * 1.5 + 0.05) {
      if (run.mode !== "rest") {
        run.mode = "rest";
        emit(run, "stopped");
      }
      return;
    }
  }
  const friction = grip * Math.sign(run.v) + DRAG * run.v * Math.abs(run.v);
  let v = run.v + (push - friction) * dt;
  // Friction can stop the car but never push it backwards.
  if (run.v !== 0 && Math.sign(v) !== Math.sign(run.v)) {
    const rolling = Math.abs(push) > grip * 1.5 + 0.05;
    if (run.v > 0) {
      if (smp.ring) emit(run, "loopShort", `short-${smp.piece}`);
      else if (smp.t[1] > 0.05) emit(run, "stall", `stall-${smp.piece}`);
    }
    v = rolling ? v : 0;
  }
  run.v = v;
  run.top = Math.max(run.top, Math.abs(v));
  run.s += v * dt;
  run.travel += v * dt;
  if (!path.closed && (run.s > path.length || run.s < 0)) {
    run.s = Math.max(0, Math.min(path.length, run.s));
    return derail(run, sampleAt(path, run.s), "end");
  }
  if (path.closed) {
    run.s = ((run.s % path.length) + path.length) % path.length;
    const laps = Math.floor((run.travel - START_S) / path.length);
    if (laps > run.laps) {
      run.laps = laps;
      run.lapTimes.push(run.time - run.lapStart);
      run.lapStart = run.time;
      emit(run, "lap");
    }
  }
}

const GROUND = 0.0;

function stepFree(run, dt) {
  const { G } = PHYS;
  const f = run.free;
  f.vel[1] -= G * dt;
  f.p = [
    f.p[0] + f.vel[0] * dt,
    f.p[1] + f.vel[1] * dt,
    f.p[2] + f.vel[2] * dt,
  ];
  f.spin += f.spinRate * dt;
  if (f.p[1] <= GROUND) {
    f.p[1] = GROUND;
    if (f.vel[1] < -1) {
      f.vel[1] *= -0.3;
      f.vel[0] *= 0.7;
      f.vel[2] *= 0.7;
      f.spinRate *= 0.55;
      if (!f.landed) {
        f.landed = true;
        run.events.push({ kind: "thud", text: "", time: run.time });
      }
    } else {
      f.vel[1] = 0;
      const speed = Math.hypot(f.vel[0], f.vel[2]);
      const slow = Math.max(0, speed - 7 * dt);
      const k = speed ? slow / speed : 0;
      f.vel[0] *= k;
      f.vel[2] *= k;
      // Settle the right way up or on its roof.
      const rest = Math.round(f.spin / Math.PI) * Math.PI;
      f.spinRate = (rest - f.spin) * 6;
      if (slow < 0.02 && Math.abs(rest - f.spin) < 0.01) {
        f.spin = rest;
        run.mode = "rest";
        emit(run, "crashed");
      }
    }
  }
}

// Advance a run by dt seconds.
export function stepRun(run, dt) {
  if (run.mode === "waiting") return;
  if (run.mode === "rest") {
    run.time += dt;
    return;
  }
  const { SUBSTEP } = PHYS;
  let left = dt;
  while (left > 1e-9 && (run.mode === "track" || run.mode === "free")) {
    const h = Math.min(SUBSTEP, left);
    left -= h;
    run.time += h;
    if (run.mode === "track") stepTrack(run, h);
    else stepFree(run, h);
  }
  if (left > 1e-9) run.time += left;
}

// Push the car again from wherever it is on the track.
export function pushRun(run, push) {
  if (run.free) return;
  run.mode = "track";
  run.v = push;
  run.top = Math.max(run.top, push);
}

// Where the car is and which way it faces: { p, t, u } (t forward, u up).
export function carPose(run) {
  if (!run.free) {
    const smp = sampleAt(run.path, run.s);
    return { p: smp.p, t: smp.t, u: smp.u };
  }
  const f = run.free;
  const rot = (v) => rotate(v, f.axis, f.spin);
  return { p: f.p, t: rot(f.t), u: rot(f.u) };
}

// Rodrigues' rotation of v about unit axis k by angle a.
function rotate(v, k, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

// ------------------------------------------------------- saved examples

export const EXAMPLE_TRACKS = [
  {
    name: "Little oval",
    start: { x: 5, z: 8, d: 0 },
    pieces: [
      "straight",
      "right",
      "right",
      "straight",
      "straight",
      "right",
      "right",
    ],
  },
  {
    name: "Booster loop",
    start: { x: 5, z: 8, d: 0 },
    pieces: [
      "booster",
      "loop",
      "right",
      "right",
      "straight",
      "straight",
      "straight",
      "right",
      "right",
    ],
  },
  {
    name: "Hill climb",
    start: { x: 3, z: 9, d: 0 },
    pieces: [
      "booster",
      "climb",
      "climb",
      "straight",
      "right",
      "straight",
      "straight",
      "right",
      "descent",
      "descent",
      "straight",
      "straight",
      "straight",
      "right",
      "straight",
      "straight",
      "right",
    ],
  },
];
