// Comet Dash: an endless runner across floating sky islands.
//
// The runner goes right on its own, faster the further it gets. Jump (hold
// for a higher jump, press again in the air for a second jump) across the
// gaps, and dash to smash the crystals standing in the way. Falling into the
// sky or running into a crystal or the side of an island costs a star.
//
// Units are metres and seconds. x is the runner's centre, y the soles of its
// feet. A platform's top is at `y`, from `x` to `x + w`, and its rock goes
// down `depth` below that.

export const PHYSICS = {
  gravity: 42,
  jumpSpeed: 13.2, // first jump
  airJumpSpeed: 12.4, // the second jump, in the air
  holdGravity: 0.42, // gravity while the jump is held on the way up
  holdTime: 0.26, // how long holding the jump keeps it floaty
  coyote: 0.09, // a jump just after running off an edge still counts
  dashTime: 0.42,
  dashBoost: 1.75, // speed multiplier while dashing
  dashCooldown: 0.3,
  width: 0.7,
  height: 1.2,
  crystalWidth: 1.0,
  crystalHeight: 2.6,
  sparkleRadius: 1.0,
  safeTime: 1.6, // after a lost star: blinking, crystals pass through
};

export const LEVELS = {
  // speed: m/s at the start, `ramp` more per metre run, up to `top`.
  // margin: the widest gap is this share of the longest possible jump.
  // doubles: how often a gap needs the second jump.
  // crystals: chance an island long enough gets a crystal.
  // forgive: running into a crystal (not dashing) just knocks it over.
  easy: {
    stars: 5,
    speed: 8,
    ramp: 0.0028,
    top: 12,
    margin: 0.62,
    doubles: 0,
    rise: 1.2,
    drop: 2.5,
    width: [12, 32],
    crystals: 0.45,
    forgive: true,
  },
  normal: {
    stars: 3,
    speed: 9.5,
    ramp: 0.003,
    top: 15,
    margin: 0.72,
    doubles: 0.35,
    rise: 2.2,
    drop: 3.6,
    width: [9, 28],
    crystals: 0.6,
    forgive: false,
  },
  hard: {
    stars: 3,
    speed: 11,
    ramp: 0.0035,
    top: 18,
    margin: 0.8,
    doubles: 0.6,
    rise: 3,
    drop: 4.5,
    width: [7, 22],
    crystals: 0.75,
    forgive: false,
  },
};

export const dashLevel = (level) => LEVELS[level] ?? LEVELS.normal;

export const speedAt = (level, x) => {
  const l = dashLevel(level);
  return Math.min(l.top, l.speed + l.ramp * Math.max(0, x));
};

// A small seeded random so a course can be replayed in tests.
export function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

// The path of a jump from the ground at `speed`, holding the jump the whole
// way, with the second jump at the top when `jumps` is 2. Points are
// [x, y] relative to where it started, every `dt`, until it is `below`
// under the start.
export function jumpPath(speed, jumps = 1, below = 8, dt = 1 / 120) {
  const P = PHYSICS;
  let x = 0,
    y = 0,
    vy = P.jumpSpeed,
    hold = P.holdTime,
    second = jumps > 1;
  const points = [[0, 0]];
  while (y > -below && points.length < 2000) {
    if (second && vy <= 0) {
      vy = P.airJumpSpeed;
      hold = P.holdTime;
      second = false;
    }
    const g = P.gravity * (hold > 0 && vy > 0 ? P.holdGravity : 1);
    hold -= dt;
    vy -= g * dt;
    x += speed * dt;
    y += vy * dt;
    points.push([x, y]);
  }
  return points;
}

// How far a jump can go and still come down onto a platform `dy` higher
// (negative: lower) than the one it left, and how far it must go before it
// is safely above that platform's top (so it doesn't hit the side).
export function reach(speed, dy, jumps = 1) {
  const path = jumpPath(speed, jumps, Math.max(8, 2 - dy));
  let clear = -1,
    far = -1;
  for (const [x, y] of path) {
    if (clear < 0 && y >= dy + 0.25) clear = x;
    if (y >= dy) far = x;
  }
  if (clear < 0 || far < 0) return null;
  return { clear, far };
}

// ---------------------------------------------------------------------------
// The course: islands, crystals and sparkles, made a stretch at a time.

export function createCourse(level, seed = (Math.random() * 2 ** 32) >>> 0) {
  const course = {
    level,
    rand: random(seed),
    platforms: [{ x: -12, w: 46, y: 0, depth: 4, kind: 0 }],
    crystals: [],
    sparkles: [],
    end: 34,
    lastY: 0,
    count: 0,
  };
  // A first line of sparkles to run through.
  for (let i = 0; i < 5; i++)
    course.sparkles.push({ x: 12 + i * 1.6, y: 0.9, taken: false });
  return course;
}

const pick = (rand, [a, b]) => a + rand() * (b - a);

// Add islands until the course reaches `toX`.
export function extend(course, toX) {
  const l = dashLevel(course.level);
  const rand = course.rand;
  const P = PHYSICS;
  while (course.end < toX) {
    const from = course.platforms.at(-1);
    const speed = speedAt(course.level, course.end);
    const jumps = rand() < l.doubles ? 2 : 1;
    // Islands stay within a band so the camera can follow.
    let dy = -l.drop + rand() * (l.drop + l.rise);
    if (from.y + dy > 6) dy = -Math.abs(dy);
    if (from.y + dy < -6) dy = Math.abs(dy);
    let r = reach(speed, dy, jumps);
    while (!r || r.far * l.margin < r.clear + 1.4) {
      dy -= 0.4;
      r = reach(speed, dy, jumps);
    }
    const lo = Math.max(2.5, r.clear + 1.4);
    const hi = r.far * l.margin;
    // The first gaps are gentle.
    const easing = Math.min(1, course.count / 4);
    const gap =
      lo + (hi - lo) * (0.25 + 0.75 * easing) * (0.35 + 0.65 * rand());
    // Long enough to come down on even from the longest jump.
    const longest = reach(speed, dy, 2)?.far ?? r.far;
    const w = Math.max(
      pick(rand, l.width) * (course.count < 3 ? 1.4 : 1),
      longest - gap + 4,
    );
    const x = from.x + from.w + gap;
    const y = from.y + dy;
    const platform = {
      x,
      w,
      y,
      depth: 2.5 + rand() * 4,
      kind: course.count % 4,
    };
    course.platforms.push(platform);

    // Sparkles over the gap, along the jump that clears it.
    if (rand() < 0.7) {
      const path = jumpPath(speed, jumps);
      const startX = from.x + from.w - 0.4;
      const span = gap * 0.85;
      for (let i = 1; i <= 5; i++) {
        const target = (span * i) / 6 + 0.8;
        const point = path.find(([px]) => px >= target);
        if (point && point[1] > dy - 0.5)
          course.sparkles.push({
            x: startX + point[0],
            y: from.y + point[1] + 0.6,
            taken: false,
          });
      }
    }

    // A crystal on a long enough island, well clear of both edges. Easy and
    // early courses wait a little for the first one.
    // It stands past where even the longest jump comes down, so there is
    // always ground to dash along before it.
    const inset = Math.max(6, longest - gap + 3);
    const room = w - inset - 8;
    if (room > 0 && course.count >= 2 && rand() < l.crystals) {
      const cx = x + inset + rand() * room;
      course.crystals.push({ x: cx, y, alive: true });
      // A row of sparkles leading up to it, the reward for dashing.
      for (let i = 1; i <= 3; i++)
        course.sparkles.push({ x: cx + 1 + i * 1.3, y: y + 0.9, taken: false });
    } else if (w > 10 && rand() < 0.5) {
      const sx = x + 3 + rand() * (w - 9);
      for (let i = 0; i < 4; i++)
        course.sparkles.push({
          x: sx + i * 1.5,
          y: y + 0.9 + Math.sin((i / 3) * Math.PI) * 1.4,
          taken: false,
        });
    }

    course.end = x + w;
    course.lastY = y;
    course.count++;
  }
  return course;
}

// Forget everything well behind the runner.
export function trim(course, behindX) {
  const keep = (item) => item.x + (item.w ?? 2) > behindX;
  course.platforms = course.platforms.filter(keep);
  course.crystals = course.crystals.filter(keep);
  course.sparkles = course.sparkles.filter(keep);
}

// ---------------------------------------------------------------------------
// The runner.

export function createRunner(x = 0, y = 0) {
  return {
    x,
    y,
    vy: 0,
    grounded: true,
    offGround: 0, // seconds since last on the ground (coyote time)
    airJumps: 1,
    hold: 0,
    dash: 0, // seconds of dash left
    dashUsed: false, // one dash per time in the air
    cooldown: 0,
    safe: 0,
    lastTop: y,
    speed: 0,
  };
}

const overlapX = (r, p) =>
  r.x + PHYSICS.width / 2 > p.x && r.x - PHYSICS.width / 2 < p.x + p.w;

// Move the runner `dt` seconds. `input` is { jump, jumpHeld, dash }: jump and
// dash are fresh presses this frame. Returns a list of events:
// { type: "jump" | "airJump" | "dash" | "land" | "smash" | "knock" |
//   "sparkle" | "crash" | "fall", ... }. A crash or fall stops the step.
export function step(runner, course, input, dt, level = course.level) {
  const events = [];
  const P = PHYSICS;
  const l = dashLevel(level);
  let jump = input.jump,
    dash = input.dash;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    if (jump) {
      jump = false;
      if (runner.grounded || runner.offGround < P.coyote) {
        runner.vy = P.jumpSpeed;
        runner.grounded = false;
        runner.offGround = P.coyote;
        runner.hold = P.holdTime;
        runner.dash = 0;
        events.push({ type: "jump" });
      } else if (runner.airJumps > 0) {
        runner.airJumps--;
        runner.vy = P.airJumpSpeed;
        runner.hold = P.holdTime;
        runner.dash = 0;
        events.push({ type: "airJump" });
      }
    }
    if (dash) {
      dash = false;
      if (runner.cooldown <= 0 && !runner.dashUsed && runner.dash <= 0) {
        runner.dash = P.dashTime;
        runner.cooldown = P.dashTime + P.dashCooldown;
        if (!runner.grounded) {
          runner.dashUsed = true;
          runner.airJumps = Math.max(runner.airJumps, 1);
        }
        runner.vy = Math.max(0, runner.vy * 0.2);
        events.push({ type: "dash" });
      }
    }
    if (!input.jumpHeld) runner.hold = 0;

    const base = speedAt(level, runner.x);
    runner.speed = base * (runner.dash > 0 ? P.dashBoost : 1);
    const px = runner.x,
      py = runner.y;
    const nx = px + runner.speed * h;

    // Running into the side of an island.
    for (const p of course.platforms) {
      if (p.x > nx + 2) break;
      const right0 = px + P.width / 2,
        right1 = nx + P.width / 2;
      if (
        right0 <= p.x &&
        right1 > p.x &&
        py < p.y - 0.15 &&
        py + P.height > p.y - p.depth
      ) {
        runner.x = p.x - P.width / 2;
        events.push({ type: "crash", what: "wall", x: runner.x, y: runner.y });
        return events;
      }
    }
    runner.x = nx;

    // Up and down.
    if (runner.dash > 0) {
      runner.dash -= h;
      runner.vy = 0; // a dash flies straight
    } else if (!runner.grounded) {
      const g =
        P.gravity * (runner.hold > 0 && runner.vy > 0 ? P.holdGravity : 1);
      runner.vy -= g * h;
    }
    runner.hold -= h;
    runner.cooldown -= h;
    runner.safe -= h;
    let ny = py + runner.vy * h;
    let support = null;
    for (const p of course.platforms) {
      if (p.x > runner.x + 2) break;
      if (!overlapX(runner, p)) continue;
      if (runner.vy <= 0 && py >= p.y - 0.001 && ny <= p.y) support = p;
      else if (
        runner.vy > 0 &&
        py + P.height <= p.y - p.depth &&
        ny + P.height > p.y - p.depth
      ) {
        ny = p.y - p.depth - P.height;
        runner.vy = 0;
        events.push({ type: "bonk" });
      }
    }
    if (support) {
      if (!runner.grounded) events.push({ type: "land", fall: -runner.vy });
      ny = support.y;
      runner.vy = 0;
      runner.grounded = true;
      runner.offGround = 0;
      runner.airJumps = 1;
      runner.dashUsed = false;
      runner.lastTop = support.y;
    } else {
      if (runner.grounded) runner.vy = 0;
      runner.grounded = false;
      runner.offGround += h;
    }
    runner.y = ny;

    // Crystals.
    for (const c of course.crystals) {
      if (!c.alive || c.x - P.crystalWidth / 2 > runner.x + 1) continue;
      if (
        Math.abs(c.x - runner.x) < (P.crystalWidth + P.width) / 2 &&
        runner.y < c.y + P.crystalHeight &&
        runner.y + P.height > c.y
      ) {
        if (runner.dash > 0) {
          c.alive = false;
          events.push({ type: "smash", crystal: c });
        } else if (runner.safe > 0) {
          // pass through while blinking
        } else if (l.forgive) {
          c.alive = false;
          events.push({ type: "knock", crystal: c });
        } else {
          events.push({
            type: "crash",
            what: "crystal",
            x: runner.x,
            y: runner.y,
          });
          return events;
        }
      }
    }

    // Sparkles.
    for (const sp of course.sparkles) {
      if (sp.taken || sp.x > runner.x + 2) continue;
      const dx = sp.x - runner.x,
        dy = sp.y - (runner.y + P.height / 2);
      if (dx * dx + dy * dy < P.sparkleRadius ** 2) {
        sp.taken = true;
        events.push({ type: "sparkle", sparkle: sp });
      }
    }

    // Falling into the sky.
    const next = course.platforms.find((p) => p.x + p.w > runner.x);
    const floor = Math.min(runner.lastTop, next ? next.y : runner.lastTop) - 9;
    if (runner.y < floor) {
      events.push({ type: "fall", x: runner.x, y: runner.y });
      return events;
    }
  }
  return events;
}

// Where to start again after losing a star: the start of the next island
// (or further along this one, if there's plenty left), clear of crystals.
export function respawnPoint(course, x) {
  for (const p of course.platforms) {
    if (p.x + p.w < x) continue;
    const at = Math.max(p.x + 1.5, x + 1);
    if (at < p.x + p.w - 8) {
      for (const c of course.crystals)
        if (c.alive && c.x > at && c.x < at + 10) c.alive = false;
      return { x: at, y: p.y };
    }
  }
  const last = course.platforms.at(-1);
  return { x: last.x + 1.5, y: last.y };
}

// Points: sparkles in a row are worth more, and so are crystals in a row.
export const sparklePoints = (chain) => 10 * Math.min(10, chain);
export const smashPoints = (chain) => 100 * Math.min(5, chain);
export const CHAIN_TIME = 1.6; // seconds between sparkles to keep a chain
