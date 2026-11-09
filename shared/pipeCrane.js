// Pipe Crane rules: the building site's grid of pre-dug trenches, the pipe
// pieces and how they turn, and the water that flows through them. Kept free
// of DOM and Three.js so it can be tested in Node.
//
// The site is a grid of cells. Some cells are trench (dug out); pipes can
// only be lowered into trench cells. Pipe A (the water main) pokes into the
// site from outside its left edge; one or two outlet pipes (B, and C on
// later sites) poke in from other edges. After a countdown the valve opens
// and water runs out of pipe A one cell at a time. It flows through every
// opening of each pipe it fills. If it reaches an open end (an empty cell,
// a pipe that doesn't line up, or the edge of the site) it spills and the
// job is lost. Fill every outlet with no spills and the job is done.

// Directions: 0 up (row - 1), 1 right, 2 down, 3 left.
export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const opposite = (d) => (d + 2) % 4;

// Each piece's openings before turning. `rot` turns it clockwise in
// quarter turns.
export const PIECES = {
  straight: [0, 2],
  corner: [0, 1],
  tee: [0, 1, 3],
  cross: [0, 1, 2, 3],
};

export function openings(piece) {
  return PIECES[piece.type].map((d) => (d + piece.rot) % 4);
}

export const opensTo = (piece, dir) => !!piece && openings(piece).includes(dir);

// cols / rows: site size. countdown: seconds before the valve opens.
// flow: seconds for water to fill one pipe. decoys: dead-end trenches that
// lead nowhere. twoOutletsFrom: the first site (0-based) with a second
// outlet, which needs a tee. cross: whether the cross piece is in the yard.
// Each site after the first is a little quicker (`faster` per site, down
// to `fastest` of the first).
export const PIPE_LEVELS = {
  easy: {
    cols: 6,
    rows: 4,
    countdown: 40,
    flow: 3.2,
    decoys: 1,
    twoOutletsFrom: 3,
    cross: false,
    faster: 0.05,
  },
  normal: {
    cols: 7,
    rows: 5,
    countdown: 30,
    flow: 2.5,
    decoys: 2,
    twoOutletsFrom: 2,
    cross: false,
    faster: 0.06,
  },
  hard: {
    cols: 8,
    rows: 5,
    countdown: 22,
    flow: 1.9,
    decoys: 3,
    twoOutletsFrom: 1,
    cross: true,
    faster: 0.07,
  },
};
const FASTEST = 0.6;
// Once every outlet is joined up the water hurries along.
export const HURRY = 4;

export const pipeLevel = (level) => PIPE_LEVELS[level] || PIPE_LEVELS.normal;

export function yardPieces(level) {
  const s = pipeLevel(level);
  return s.cross
    ? ["straight", "corner", "tee", "cross"]
    : ["straight", "corner", "tee"];
}

// Small seeded random generator (mulberry32) so a site can be replayed.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cellOf = (site, x, y) => y * site.cols + x;
export const xyOf = (site, cell) => [
  cell % site.cols,
  Math.floor(cell / site.cols),
];

export function neighbour(site, cell, dir) {
  const [x, y] = xyOf(site, cell);
  const nx = x + DIRS[dir][0];
  const ny = y + DIRS[dir][1];
  if (nx < 0 || ny < 0 || nx >= site.cols || ny >= site.rows) return -1;
  return cellOf(site, nx, ny);
}

// A random simple path of cells from `from` to `goal`. It never runs next to
// a trench already dug (except where it starts), so trenches stay clear,
// separate lines. Returns null if this attempt got stuck.
function walk(site, rand, from, goal, dug, minLength) {
  const path = [from];
  const used = new Set([from]);
  const [gx, gy] = xyOf(site, goal);
  const touches = (cell, prev) =>
    [0, 1, 2, 3].some((d) => {
      const n = neighbour(site, cell, d);
      return (
        n !== -1 && n !== prev && (dug.has(n) || (used.has(n) && n !== prev))
      );
    });
  for (let guard = 0; guard < site.cols * site.rows * 3; guard++) {
    const here = path[path.length - 1];
    if (here === goal && path.length >= minLength) return path;
    const [x, y] = xyOf(site, here);
    const options = [];
    for (let d = 0; d < 4; d++) {
      const n = neighbour(site, here, d);
      if (n === -1 || used.has(n) || dug.has(n)) continue;
      if (n !== goal && touches(n, here)) continue;
      if (n === goal && path.length + 1 < minLength) continue;
      const [nx, ny] = xyOf(site, n);
      const closer =
        Math.abs(gx - nx) + Math.abs(gy - ny) <
        Math.abs(gx - x) + Math.abs(gy - y);
      // Mostly head for the goal, sometimes wander.
      options.push({ n, weight: closer ? 3 : 1 });
    }
    if (!options.length) return null;
    let pick = rand() * options.reduce((sum, o) => sum + o.weight, 0);
    const choice = options.find((o) => (pick -= o.weight) < 0) || options[0];
    path.push(choice.n);
    used.add(choice.n);
  }
  return null;
}

// Which pipe (type and turn) joins the given set of directions.
export function pieceFor(dirs) {
  const want = [...new Set(dirs)].sort();
  for (const type of Object.keys(PIECES))
    for (let rot = 0; rot < 4; rot++) {
      const got = openings({ type, rot }).sort();
      if (got.length === want.length && got.every((d, i) => d === want[i]))
        return { type, rot };
    }
  return null;
}

// Site `index` (0-based) of a run on `level`. Same level, index and seed
// always give the same site.
export function makeSite(level, index = 0, seed = 1) {
  const s = pipeLevel(level);
  const rand = seeded(seed * 7919 + index * 104729 + 13);
  const speedUp = Math.max(FASTEST, 1 - s.faster * index);
  const outletCount = index >= s.twoOutletsFrom ? 2 : 1;
  for (let attempt = 0; attempt < 400; attempt++) {
    const site = {
      level,
      index,
      cols: s.cols,
      rows: s.rows,
      countdown: Math.round(s.countdown * speedUp),
      flow: +(s.flow * speedUp).toFixed(2),
      trench: new Set(),
      source: null,
      outlets: [],
      // The pieces that would join everything up, by cell.
      solution: new Map(),
    };
    const { cols, rows } = site;
    // Pipe A comes in from the left; the first outlet leaves from the right
    // half of the top, right or bottom edge.
    const ay = 1 + Math.floor(rand() * (rows - 2));
    site.source = { cell: cellOf(site, 0, ay), dir: 3 };
    const edgeSpot = (avoid) => {
      for (let i = 0; i < 30; i++) {
        const side = [0, 1, 2][Math.floor(rand() * 3)];
        let x, y;
        if (side === 1) {
          x = cols - 1;
          y = Math.floor(rand() * rows);
        } else {
          x = Math.ceil(cols / 2) + Math.floor(rand() * Math.floor(cols / 2));
          y = side === 0 ? 0 : rows - 1;
        }
        const cell = cellOf(site, x, y);
        if (avoid.some((o) => o.cell === cell)) continue;
        // Corner cells: take the side we rolled.
        return { cell, dir: side };
      }
      return null;
    };
    const b = edgeSpot([]);
    if (!b) continue;
    const minLength = Math.ceil((cols + rows) * 0.6);
    const main = walk(
      site,
      rand,
      site.source.cell,
      b.cell,
      new Set(),
      minLength,
    );
    if (!main) continue;
    site.outlets.push(b);
    const dug = new Set(main);
    // Which directions each trench cell's pipe must open to.
    const joins = new Map(main.map((c) => [c, []]));
    const link = (path, startDir, endDir) => {
      for (let i = 0; i < path.length; i++) {
        const dirs = joins.get(path[i]) || [];
        if (i === 0 && startDir !== undefined) dirs.push(startDir);
        for (const other of [path[i - 1], path[i + 1]]) {
          if (other === undefined) continue;
          const d = [0, 1, 2, 3].find(
            (d) => neighbour(site, path[i], d) === other,
          );
          dirs.push(d);
        }
        if (i === path.length - 1 && endDir !== undefined) dirs.push(endDir);
        joins.set(path[i], dirs);
      }
    };
    link(main, site.source.dir, b.dir);

    let ok = true;
    if (outletCount === 2) {
      ok = false;
      for (let tries = 0; tries < 20 && !ok; tries++) {
        const c = edgeSpot(site.outlets);
        if (!c || dug.has(c.cell)) continue;
        // Branch off somewhere along the middle of the main line, where a
        // straight-through cell can become a tee.
        const options = main
          .slice(2, -2)
          .filter((cell) => joins.get(cell).length === 2);
        if (!options.length) break;
        const from = options[Math.floor(rand() * options.length)];
        const branchDug = new Set(dug);
        branchDug.delete(from);
        const branch = walk(site, rand, from, c.cell, branchDug, 3);
        if (!branch) continue;
        // The tee: the cell's two main openings and the branch.
        const firstStep = [0, 1, 2, 3].find(
          (d) => neighbour(site, from, d) === branch[1],
        );
        joins.get(from).push(firstStep);
        const rest = branch.slice(1);
        for (const cell of rest) dug.add(cell);
        const dirs = [];
        joins.set(rest[0], dirs);
        link(rest, opposite(firstStep), c.dir);
        site.outlets.push(c);
        ok = true;
      }
    }
    if (!ok) continue;

    // Dead-end trenches off the line, to keep you thinking.
    let decoys = 0;
    for (let tries = 0; tries < 40 && decoys < s.decoys; tries++) {
      const line = [...joins.keys()];
      const from = line[Math.floor(rand() * line.length)];
      if (from === site.source.cell) continue;
      if (site.outlets.some((o) => o.cell === from)) continue;
      if (joins.get(from).length > 2) continue;
      const free = [0, 1, 2, 3].filter((d) => {
        const n = neighbour(site, from, d);
        if (n === -1 || dug.has(n)) return false;
        return [0, 1, 2, 3].every((e) => {
          const m = neighbour(site, n, e);
          return m === -1 || m === from || !dug.has(m);
        });
      });
      if (!free.length) continue;
      const d = free[Math.floor(rand() * free.length)];
      const spur = [neighbour(site, from, d)];
      // Sometimes a second cell, straight on or round a bend.
      if (rand() < 0.6) {
        const turns = [d, (d + 1) % 4, (d + 3) % 4];
        const e = turns[Math.floor(rand() * turns.length)];
        const n = neighbour(site, spur[0], e);
        if (
          n !== -1 &&
          !dug.has(n) &&
          [0, 1, 2, 3].every((f) => {
            const m = neighbour(site, n, f);
            return m === -1 || m === spur[0] || !dug.has(m);
          })
        )
          spur.push(n);
      }
      for (const cell of spur) dug.add(cell);
      decoys++;
    }

    if (decoys < s.decoys) continue;
    site.trench = dug;
    for (const [cell, dirs] of joins) site.solution.set(cell, pieceFor(dirs));
    if ([...site.solution.values()].some((p) => !p)) continue;
    return site;
  }
  throw new Error(`No site for ${level} #${index} seed ${seed}`);
}

// --- A job in progress -------------------------------------------------

// `pipes` maps cell → { type, rot }. `water` maps each wet cell to
// { from, t, t0 } where `from` is the side water came in (-1 for none),
// t its fill from 0 to 1. `fronts` are the cells still filling.
export function newJob(site) {
  return {
    site,
    pipes: new Map(),
    clock: site.countdown,
    flowing: false,
    water: new Map(),
    fronts: [],
    filled: new Set(),
    spill: null,
    done: false,
    hurry: false,
    placed: 0,
  };
}

export const isWet = (job, cell) => job.water.has(cell);

export function canPlace(job, cell) {
  return (
    !job.done && !job.spill && job.site.trench.has(cell) && !isWet(job, cell)
  );
}

// Lower a pipe into a trench cell (swapping out any dry pipe there).
export function place(job, cell, piece) {
  if (!canPlace(job, cell) || !PIECES[piece?.type]) return false;
  job.pipes.set(cell, { type: piece.type, rot: ((piece.rot % 4) + 4) % 4 });
  job.placed++;
  return true;
}

// Lift a dry pipe back out. Returns it, or null.
export function lift(job, cell) {
  if (!canPlace(job, cell) || !job.pipes.has(cell)) return null;
  const piece = job.pipes.get(cell);
  job.pipes.delete(cell);
  return piece;
}

// Turn a dry pipe in place by a quarter turn (clockwise by default).
export function turn(job, cell, by = 1) {
  if (!canPlace(job, cell) || !job.pipes.has(cell)) return false;
  const piece = job.pipes.get(cell);
  piece.rot = (((piece.rot + by) % 4) + 4) % 4;
  return true;
}

function outletAt(site, cell, dir) {
  return site.outlets.findIndex((o) => o.cell === cell && o.dir === dir);
}

// Do the laid pipes join pipe A to every outlet with no open ends?
export function joinedUp(job) {
  const { site, pipes } = job;
  const start = site.source;
  if (!opensTo(pipes.get(start.cell), start.dir)) return false;
  const seen = new Set([start.cell]);
  const queue = [start.cell];
  const reached = new Set();
  while (queue.length) {
    const cell = queue.shift();
    for (const d of openings(pipes.get(cell))) {
      if (cell === start.cell && d === start.dir) continue;
      const o = outletAt(site, cell, d);
      if (o !== -1) {
        reached.add(o);
        continue;
      }
      const n = neighbour(site, cell, d);
      if (n === -1 || !opensTo(pipes.get(n), opposite(d))) return false;
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return reached.size === site.outlets.length;
}

// Open the valve now instead of waiting out the countdown.
export function openValve(job) {
  if (job.flowing || job.done || job.spill) return;
  job.clock = 0;
  startFlow(job);
}

function enter(job, cell, from, time) {
  if (job.water.has(cell)) return;
  const piece = job.pipes.get(cell);
  if (!opensTo(piece, from)) {
    // Nothing there (or it doesn't line up): water pours out of the end
    // it came from.
    job.spill = { cell, from, at: time, empty: !piece };
    return;
  }
  const w = { from, t: 0 };
  job.water.set(cell, w);
  job.fronts.push(cell);
}

function startFlow(job) {
  job.flowing = true;
  enter(job, job.site.source.cell, job.site.source.dir, 0);
}

// Advance the job by dt seconds. Returns events: "valve", "fill" (a pipe
// filled), "outlet", "spill", "done".
export function stepJob(job, dt) {
  const events = [];
  if (job.done || job.spill) return events;
  if (!job.flowing) {
    job.clock -= dt;
    if (job.clock > 0) return events;
    job.clock = 0;
    startFlow(job);
    events.push("valve");
    if (job.spill) {
      events.push("spill");
      return events;
    }
  }
  job.hurry = joinedUp(job);
  const rate = (job.hurry ? HURRY : 1) / job.site.flow;
  const next = [];
  for (const cell of job.fronts) {
    const w = job.water.get(cell);
    w.t = Math.min(1, w.t + rate * dt);
    if (w.t < 1) {
      next.push(cell);
      continue;
    }
    events.push("fill");
    for (const d of openings(job.pipes.get(cell))) {
      if (d === w.from) continue;
      const o = outletAt(job.site, cell, d);
      if (o !== -1) {
        if (!job.filled.has(o)) {
          job.filled.add(o);
          events.push("outlet");
        }
        continue;
      }
      const n = neighbour(job.site, cell, d);
      if (n === -1) {
        job.spill = { cell, dir: d, edge: true };
        break;
      }
      if (job.water.has(n)) {
        // Joins water that's already there: fine if the pipes meet.
        if (!opensTo(job.pipes.get(n), opposite(d)))
          job.spill = { cell: n, from: opposite(d) };
        continue;
      }
      const before = job.fronts.length;
      enter(job, n, opposite(d), 0);
      if (job.fronts.length > before) next.push(n);
      if (job.spill) break;
    }
    if (job.spill) break;
  }
  // `enter` pushed onto job.fronts too; keep only what's still filling.
  job.fronts = [...new Set(next)];
  if (job.spill) {
    events.push("spill");
    return events;
  }
  if (!job.fronts.length) {
    if (job.filled.size === job.site.outlets.length) {
      job.done = true;
      events.push("done");
    } else {
      // Water went round in a loop and can't reach an outlet.
      job.spill = { closed: true };
      events.push("spill");
    }
  }
  return events;
}
