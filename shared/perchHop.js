// Perch Hop rules: a side-on platformer where your critter runs, jumps and
// double-jumps around a backyard, landing on each of the ten perches as
// fast as it can. Kept free of DOM and Three.js so it can be tested in Node.
//
// The yard is a 2D side view. x runs left to right, y up; the player is a
// box standing on its feet at (x, y). Solid blocks (the deck, the lawn, the
// shed, the walls) stop you from every side. Ledges (the table, a branch, a
// lily pad...) are one-way: you land on them from above, jump up through
// them, and hold down to drop through. Some ledges slide back and forth and
// carry you along; trampolines throw you high and give your double jump
// back. A perch is a ledge (or block) with a flag: land on it to raise its
// flag. Raise all ten and the clock stops. Fall into the pond and you
// splash: on Easy you're put back on the deck, otherwise the run is over.

export const PLAYER_HALF_W = 0.3;
export const PLAYER_H = 1.05;
export const STEP = 1 / 120;
// The pond's surface, and how far below it your feet go before it's a splash.
export const WATER_Y = 0.8;
export const POND_Y = 0.1;
// How long after the GO you can't move ("Ready... GO!").
export const READY_TIME = 1.4;

export const MOVE = {
  run: 6.4,
  groundAccel: 46,
  groundStop: 52,
  airAccel: 26,
  gravity: 34,
  jump: 12.6,
  doubleJump: 11.2,
  // Letting go of jump early cuts the climb to this speed.
  shortHop: 5,
  fall: 15,
  fastFall: 21,
  bounce: 17.5,
  coyote: 0.09,
  buffer: 0.12,
  dropTime: 0.28,
};

// Highest a single jump (and a jump plus double jump) can climb.
export const jumpHeight = (v = MOVE.jump) => (v * v) / (2 * MOVE.gravity);
export const reachHeight = () => jumpHeight() + jumpHeight(MOVE.doubleJump);

// Stage pieces. block: [x0, x1, top, bottom, look]. ledge: { x, y, w, look,
// perch?, move?: { dx, dy, period, phase } } where (x, y) is the middle of
// its top at rest and move slides it by ±dx, ±dy, once round every period.
// spring: a trampoline ledge. Each stage also says where you start and the
// pond spans (for drawing the water).
const block = (x0, x1, top, bottom, look) => ({
  x0,
  x1,
  top,
  bottom,
  look,
});

export const STAGES = {
  easy: {
    name: "The Patio",
    width: 24,
    height: 15,
    start: [3.2, 1],
    respawn: true,
    pond: [7, 17],
    blocks: [
      block(-3, 0, 30, -4, "house"),
      block(24, 27, 30, -4, "trunk"),
      block(0, 7, 1, -4, "deck"),
      block(17, 24, 1, -4, "lawn"),
    ],
    ledges: [
      { x: 2.6, y: 2.7, w: 2.8, look: "table", perch: true },
      { x: 5.8, y: 4.4, w: 1.6, look: "grill", perch: true },
      { x: 9.6, y: 0.95, w: 1.9, look: "lily", perch: true },
      {
        x: 13.6,
        y: 0.95,
        w: 1.9,
        look: "lily",
        perch: true,
        move: { dx: 1.6, dy: 0, period: 5, phase: 0 },
      },
      { x: 20.4, y: 3.2, w: 2.2, look: "swing", perch: true },
      { x: 23, y: 5.6, w: 1.4, look: "post", perch: true },
      { x: 11.8, y: 4.8, w: 3, look: "plank", perch: true },
      { x: 1.3, y: 6.4, w: 2.2, look: "windowbox", perch: true },
      { x: 4.4, y: 8.2, w: 2.4, look: "gutter" },
      { x: 18.6, y: 7.6, w: 2.8, look: "branch", perch: true },
      { x: 8.4, y: 9.2, w: 2.4, look: "birdhouse", perch: true },
      { x: 15, y: 9.9, w: 2.2, look: "branch" },
      { x: 20, y: 1.4, w: 1.6, look: "spring", spring: true },
    ],
  },
  normal: {
    name: "The Garden",
    width: 24,
    height: 15,
    start: [1.2, 1],
    respawn: false,
    pond: [5, 19.5],
    blocks: [
      block(-3, 0, 30, -4, "house"),
      block(24, 27, 30, -4, "trunk"),
      block(0, 5, 1, -4, "deck"),
      block(19.5, 24, 1, -4, "lawn"),
      block(10.6, 13.4, 3.4, -4, "shed"),
    ],
    ledges: [
      { x: 2.2, y: 3.4, w: 2.2, look: "table", perch: true },
      {
        x: 7.6,
        y: 0.95,
        w: 1.6,
        look: "lily",
        perch: true,
        move: { dx: 1.2, dy: 0, period: 4, phase: 0.25 },
      },
      { x: 12, y: 3.4, w: 2.8, look: "shedroof", perch: true, solid: true },
      {
        x: 16.4,
        y: 2.4,
        w: 1.6,
        look: "balloons",
        perch: true,
        move: { dx: 0, dy: 1, period: 3.6, phase: 0 },
      },
      { x: 22.4, y: 3, w: 1.4, look: "post", perch: true },
      { x: 20.2, y: 5.6, w: 2.2, look: "branch", perch: true },
      { x: 1.2, y: 6.6, w: 2, look: "windowbox", perch: true },
      {
        x: 6.6,
        y: 6.2,
        w: 2.2,
        look: "plank",
        move: { dx: 1.6, dy: 0, period: 5, phase: 0.5 },
      },
      { x: 12, y: 7.4, w: 1.6, look: "birdhouse", perch: true },
      { x: 16.6, y: 8.8, w: 2.4, look: "branch", perch: true },
      { x: 4.4, y: 9.8, w: 2.2, look: "gutter" },
      { x: 9, y: 11, w: 1.8, look: "balloons" },
      { x: 13.4, y: 12, w: 1.6, look: "branch", perch: true },
      { x: 3.8, y: 1.4, w: 1.4, look: "spring", spring: true },
    ],
  },
  hard: {
    name: "The Big Oak",
    width: 24,
    height: 15,
    start: [2.2, 1],
    respawn: false,
    pond: [4.5, 24],
    blocks: [
      block(-3, 0, 30, -4, "house"),
      block(24, 27, 30, -4, "trunk"),
      block(0, 4.5, 1, -4, "deck"),
      block(17.4, 19, 6.6, -4, "oak"),
    ],
    ledges: [
      { x: 1.2, y: 3.6, w: 1.4, look: "windowbox", perch: true },
      {
        x: 7,
        y: 0.95,
        w: 1.3,
        look: "lily",
        perch: true,
        move: { dx: 1.4, dy: 0, period: 3.4, phase: 0 },
      },
      {
        x: 11.6,
        y: 2.6,
        w: 1.3,
        look: "balloons",
        perch: true,
        move: { dx: 0, dy: 1.2, period: 3, phase: 0.5 },
      },
      { x: 15.2, y: 3.8, w: 1.2, look: "post" },
      { x: 18.2, y: 6.6, w: 1.6, look: "stump", perch: true, solid: true },
      { x: 22.6, y: 3, w: 1.2, look: "post", perch: true },
      { x: 22.2, y: 1, w: 1.4, look: "spring", spring: true },
      { x: 21.6, y: 9.4, w: 1.8, look: "branch", perch: true },
      {
        x: 13.4,
        y: 7.6,
        w: 1.8,
        look: "plank",
        move: { dx: 1.8, dy: 0, period: 4.4, phase: 0.25 },
      },
      { x: 9, y: 8.2, w: 1.3, look: "birdhouse", perch: true },
      { x: 4, y: 6.6, w: 1.6, look: "gutter" },
      { x: 1.3, y: 9.4, w: 1.4, look: "windowbox", perch: true },
      {
        x: 5.4,
        y: 11.6,
        w: 1.8,
        look: "balloons",
        move: { dx: 0, dy: 0.8, period: 3, phase: 0 },
      },
      { x: 11, y: 12.4, w: 1.4, look: "branch", perch: true },
      { x: 16.4, y: 11.8, w: 2.2, look: "branch", perch: true },
    ],
  },
};

export const stageFor = (level) => STAGES[level] || STAGES.normal;
export const perchCount = (stage) => stage.ledges.filter((l) => l.perch).length;

// A ledge's offset from rest at time t (seconds since the run began).
export function ledgeOffset(ledge, t) {
  const m = ledge.move;
  if (!m) return [0, 0];
  const s = Math.sin(((t / m.period + m.phase) % 1) * Math.PI * 2);
  return [m.dx * s, m.dy * s];
}

// Where every ledge is at time t: [{ i, x0, x1, top, ledge }].
export function ledgesAt(stage, t) {
  return stage.ledges.map((ledge, i) => {
    const [ox, oy] = ledgeOffset(ledge, t);
    const x = ledge.x + ox;
    return {
      i,
      x0: x - ledge.w / 2,
      x1: x + ledge.w / 2,
      top: ledge.y + oy,
      ledge,
    };
  });
}

// Ledges marked solid (the shed roof, the stump) sit on top of a block of
// the same width: they're perches you can't drop through.
const solidsAt = (stage) => stage.blocks;

export function newRun(stage) {
  const [x, y] = stage.start;
  return {
    t: 0,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    on: "block", // a ledge index, "block", or null in the air
    coyote: 0,
    buffer: 0,
    airJumps: 1,
    holdJump: false,
    dropping: null, // ledge index being dropped through
    dropTimer: 0,
    boarded: stage.ledges.map(() => false),
    count: 0,
    total: perchCount(stage),
    splashes: 0,
    done: false,
    splashed: false,
    events: [],
  };
}

// input: { x: -1..1, jump: held, jumpPressed, down: held, downPressed }
export function stepRun(run, stage, input, dt = STEP) {
  run.events.length = 0;
  if (run.done || run.splashed) return run;
  const before = ledgesAt(stage, run.t);
  run.t += dt;
  const now = ledgesAt(stage, run.t);

  // Ride a moving ledge.
  if (run.grounded && typeof run.on === "number") {
    run.x += now[run.on].x0 - before[run.on].x0;
    run.y = now[run.on].top;
  }

  // Run.
  const want = Math.max(-1, Math.min(1, input.x || 0));
  if (want) run.facing = Math.sign(want);
  const target = want * MOVE.run;
  const accel = run.grounded
    ? want && Math.sign(want) === Math.sign(run.vx || want)
      ? MOVE.groundAccel
      : MOVE.groundStop
    : MOVE.airAccel;
  if (run.vx < target) run.vx = Math.min(target, run.vx + accel * dt);
  else if (run.vx > target) run.vx = Math.max(target, run.vx - accel * dt);

  // Jump: buffered a moment, with a little grace after walking off an edge.
  if (input.jumpPressed) run.buffer = MOVE.buffer;
  else run.buffer = Math.max(0, run.buffer - dt);
  run.coyote = run.grounded ? MOVE.coyote : Math.max(0, run.coyote - dt);
  const standingOnLedge = run.grounded && typeof run.on === "number";

  // Press down on a ledge to drop through it.
  if (input.downPressed && standingOnLedge && !stage.ledges[run.on].solid) {
    run.dropping = run.on;
    run.dropTimer = MOVE.dropTime;
    run.grounded = false;
    run.on = null;
    run.coyote = 0;
    run.vy = -2;
    run.events.push("drop");
  }

  if (run.buffer > 0) {
    let jumped = false;
    if (run.grounded || run.coyote > 0) {
      run.vy = MOVE.jump;
      run.events.push("jump");
      jumped = true;
    } else if (run.airJumps > 0) {
      run.airJumps--;
      run.vy = MOVE.doubleJump;
      run.events.push("double");
      jumped = true;
    }
    if (jumped) {
      run.buffer = 0;
      run.coyote = 0;
      run.grounded = false;
      run.on = null;
      run.holdJump = true;
    }
  }
  if (run.holdJump && !input.jump) {
    run.holdJump = false;
    if (run.vy > MOVE.shortHop) run.vy = MOVE.shortHop;
  }
  if (run.vy <= 0) run.holdJump = false;

  if (run.dropTimer > 0) {
    run.dropTimer -= dt;
    if (run.dropTimer <= 0) run.dropping = null;
  }

  // Gravity; hold down on the way down to fall faster.
  if (!run.grounded) {
    const fast = input.down && run.vy <= 0;
    run.vy -= MOVE.gravity * (fast ? 2 : 1) * dt;
    run.vy = Math.max(fast ? -MOVE.fastFall : -MOVE.fall, run.vy);
  }

  // Move across, stopping at solid blocks.
  const solids = solidsAt(stage);
  run.x += run.vx * dt;
  for (const b of solids) {
    if (run.y >= b.top - 1e-6 || run.y + PLAYER_H <= b.bottom) continue;
    if (run.x + PLAYER_HALF_W <= b.x0 || run.x - PLAYER_HALF_W >= b.x1)
      continue;
    // Push out the nearer side.
    if (run.x < (b.x0 + b.x1) / 2) run.x = b.x0 - PLAYER_HALF_W;
    else run.x = b.x1 + PLAYER_HALF_W;
    run.vx = 0;
  }

  // Move up or down.
  const prevY = run.y;
  if (!run.grounded) run.y += run.vy * dt;
  const left = run.x - PLAYER_HALF_W;
  const right = run.x + PLAYER_HALF_W;
  let landed = null;
  if (!run.grounded && run.vy <= 0) {
    let best = -Infinity;
    for (const b of solids) {
      if (right <= b.x0 || left >= b.x1) continue;
      if (prevY >= b.top - 1e-6 && run.y <= b.top && b.top > best) {
        best = b.top;
        landed = "block";
      }
    }
    for (const l of now) {
      if (l.i === run.dropping) continue;
      if (right <= l.x0 || left >= l.x1) continue;
      const was = before[l.i].top;
      if (prevY >= was - 0.02 && run.y <= l.top && l.top >= best) {
        best = l.top;
        landed = l.i;
      }
    }
    if (landed !== null) {
      run.y = best;
      const ledge = typeof landed === "number" ? stage.ledges[landed] : null;
      if (ledge?.spring) {
        run.vy = MOVE.bounce;
        run.airJumps = 1;
        run.holdJump = false;
        run.events.push("bounce");
        run.spring = landed;
        landed = null;
      } else {
        run.vy = 0;
        run.grounded = true;
        run.on = landed;
        run.airJumps = 1;
        run.events.push("land");
      }
    }
  } else if (!run.grounded && run.vy > 0) {
    // Bump your head on a block.
    for (const b of solids) {
      if (right <= b.x0 || left >= b.x1) continue;
      if (prevY + PLAYER_H <= b.bottom + 1e-6 && run.y + PLAYER_H > b.bottom) {
        run.y = b.bottom - PLAYER_H;
        run.vy = 0;
        run.events.push("bonk");
      }
    }
  }

  // Walked off the edge?
  if (run.grounded) {
    let still = false;
    if (run.on === "block")
      still = solids.some(
        (b) => right > b.x0 && left < b.x1 && Math.abs(run.y - b.top) < 1e-4,
      );
    else if (typeof run.on === "number") {
      const l = now[run.on];
      still = right > l.x0 && left < l.x1;
    }
    if (!still) {
      run.grounded = false;
      run.on = null;
      run.vy = Math.min(run.vy, 0);
    }
  }

  // A new perch?
  if (run.grounded && typeof run.on === "number") {
    const ledge = stage.ledges[run.on];
    if (ledge.perch && !run.boarded[run.on]) {
      run.boarded[run.on] = true;
      run.count++;
      run.events.push("perch");
      if (run.count >= run.total) {
        run.done = true;
        run.events.push("done");
      }
    }
  }

  // Into the pond.
  if (run.y < POND_Y) {
    run.splashes++;
    run.events.push("splash");
    if (stage.respawn) {
      const [x, y] = stage.start;
      Object.assign(run, {
        x,
        y,
        vx: 0,
        vy: 0,
        grounded: true,
        on: "block",
        airJumps: 1,
        dropping: null,
      });
    } else run.splashed = true;
  }
  return run;
}
