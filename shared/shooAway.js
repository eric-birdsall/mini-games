// Shoo Away: the picnic rules, shared by the game and its tests.
//
// You sit in the middle of a picnic blanket (the origin) with snacks laid
// out around you. Squirrels (and the odd, quicker fox) sneak in from every direction across the lawn in
// little stop-and-go dashes, grab the nearest snack and run off with it.
// Shoo one and it scampers away; shoo one that's carrying a snack and it
// drops it, and the snack goes back on the blanket. A snack is stolen once
// its squirrel gets past the edge of the lawn. Three stolen snacks and the
// picnic is over.
//
// Angles are measured like the camera's yaw: angle 0 points down -z (where
// you face at the start), and a point at angle `a`, distance `r` is
// { x: -sin(a) * r, z: -cos(a) * r }. Turning left increases the angle.

export const SNACKS = [
  "sandwich",
  "watermelon",
  "cupcake",
  "apple",
  "cookie-chocolate",
  "strawberry",
];
export const SNACK_NAMES = {
  sandwich: "sandwich",
  watermelon: "watermelon",
  cupcake: "cupcake",
  apple: "apple",
  "cookie-chocolate": "cookie",
  strawberry: "strawberry",
};
export const STOLEN_TO_LOSE = 3;
export const BLANKET = 1.6; // half the width of the blanket
export const SNACK_RING = 1.05; // how far out the snacks sit
export const SPAWN_RADIUS = 12; // squirrels appear this far out
export const ESCAPE_RADIUS = 10.5; // a snack carried this far is gone
export const GRAB_REACH = 0.32; // how close a squirrel gets to grab
export const RETURN_TIME = 1.4; // a dropped snack's hop back home
// Where you look: a little down at the snacks to start, and how far up
// (at the treetops) or down (at the blanket) you can tilt your head.
export const PITCH = -0.3;
export const PITCH_MIN = -1.2;
export const PITCH_MAX = 0.55;
export const clampPitch = (p) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
// How far your arm reaches: a squirrel can only be shooed this close in.
export const REACH = 3;
// The critters: foxes turn up a fifth as often as squirrels (one in six of
// all arrivals) and run 25% faster. Everything else about them is the same.
export const KINDS = {
  squirrel: { name: "squirrel", speed: 1 },
  fox: { name: "fox", speed: 1.25 },
};
export const FOX_CHANCE = 1 / 6;
export const kindOf = (s) => KINDS[s?.kind] ?? KINDS.squirrel;

export const LEVELS = {
  // speed: dash speed at the start (m/s), +ramp each minute, up to top.
  // dash / pause: seconds of running, then of stopping to sniff.
  // spawn: seconds between squirrels at the start, shrinking to minSpawn.
  // crowd: how many can be out at once at the start, and at most.
  // grab: seconds a squirrel fumbles with a snack before running off.
  // carry: how fast it runs with a snack, as a share of its speed.
  // sneaky: share of squirrels that come from behind you.
  easy: {
    speed: 1.1,
    ramp: 0.35,
    top: 1.9,
    dash: [0.9, 1.6],
    pause: [0.5, 1.1],
    spawn: 4.6,
    minSpawn: 2.2,
    crowd: [2, 4],
    grab: 1.1,
    carry: 0.55,
    sneaky: 0.2,
  },
  normal: {
    speed: 1.45,
    ramp: 0.45,
    top: 2.6,
    dash: [0.9, 1.8],
    pause: [0.35, 0.9],
    spawn: 3.4,
    minSpawn: 1.5,
    crowd: [3, 6],
    grab: 0.8,
    carry: 0.65,
    sneaky: 0.4,
  },
  hard: {
    speed: 1.8,
    ramp: 0.55,
    top: 3.3,
    dash: [1, 2],
    pause: [0.25, 0.7],
    spawn: 2.6,
    minSpawn: 1.05,
    crowd: [4, 8],
    grab: 0.6,
    carry: 0.75,
    sneaky: 0.55,
  },
};
export const squirrelLevel = (level) => LEVELS[level] ?? LEVELS.normal;

// A small seeded random so a round can be replayed in tests.
export function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

export const at = (angle, r) => ({
  x: -Math.sin(angle) * r,
  z: -Math.cos(angle) * r,
});
export const angleOf = (x, z) => Math.atan2(-x, -z);
// The signed difference b - a, wrapped into (-PI, PI].
export function turnBetween(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
const between = ([lo, hi], rand) => lo + (hi - lo) * rand();

export function createPicnic(level = "normal") {
  const snacks = SNACKS.map((kind, i) => {
    const angle = (i / SNACKS.length) * Math.PI * 2 + Math.PI / SNACKS.length;
    const home = at(angle, SNACK_RING);
    return {
      id: i,
      kind,
      angle,
      home,
      x: home.x,
      z: home.z,
      state: "home", // home | carried | dropped | gone
      returnT: 0,
    };
  });
  return {
    level,
    t: 0,
    snacks,
    squirrels: [],
    nextId: 1,
    spawnIn: 1.2, // the first one turns up quickly
    spawned: 0,
    stolen: 0,
    shooed: 0,
    over: false,
  };
}

// How hard things are `t` seconds in.
export function pace(level, t) {
  const l = squirrelLevel(level);
  const minutes = t / 60;
  const ramp = Math.min(1, t / 150); // full crowd and spawn rate at 2:30
  return {
    speed: Math.min(l.top, l.speed + l.ramp * minutes),
    spawn: l.spawn + (l.minSpawn - l.spawn) * ramp,
    crowd: Math.round(l.crowd[0] + (l.crowd[1] - l.crowd[0]) * ramp),
  };
}

const active = (picnic) =>
  picnic.squirrels.filter((s) => s.state !== "gone" && s.state !== "shooed");

// Where to send a squirrel: the closest snack still on the blanket (or one
// lying on the lawn after a shoo). Snacks other squirrels are already after
// count as a little further away, so they spread out.
export function pickSnack(picnic, x, z) {
  let best = null;
  let bestScore = Infinity;
  for (const snack of picnic.snacks) {
    if (snack.state !== "home" && snack.state !== "dropped") continue;
    const chasers = picnic.squirrels.filter(
      (s) =>
        s.target === snack.id && s.state !== "gone" && s.state !== "shooed",
    ).length;
    const score = Math.hypot(snack.x - x, snack.z - z) + chasers * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = snack;
    }
  }
  return best;
}

// A new squirrel at the edge of the lawn. `facing` is where you're looking;
// sneaky ones come from somewhere you aren't.
export function spawnSquirrel(picnic, facing = 0, rand = Math.random) {
  const l = squirrelLevel(picnic.level);
  let angle;
  if (picnic.spawned === 0)
    angle = facing + (rand() - 0.5) * 0.5; // the first one, right in front
  else if (rand() < l.sneaky)
    angle = facing + Math.PI + (rand() - 0.5) * 2.2; // behind you
  else angle = rand() * Math.PI * 2;
  const p = at(angle, SPAWN_RADIUS);
  // The very first one is always a squirrel, for the "it freezes" hint.
  const kind = picnic.spawned > 0 && rand() < FOX_CHANCE ? "fox" : "squirrel";
  const squirrel = {
    id: picnic.nextId++,
    kind,
    x: p.x,
    z: p.z,
    heading: 0,
    state: "dash", // dash | sniff | grab | flee | shooed | gone
    timer: between(l.dash, rand),
    target: null,
    carrying: null,
    wiggle: rand() * Math.PI * 2,
    jitter: 0.85 + rand() * 0.3, // some are a bit quicker
    speed: KINDS[kind].speed, // foxes are quicker still
    frozen: false,
  };
  faceBlanket(squirrel);
  squirrel.target = pickSnack(picnic, p.x, p.z)?.id ?? null;
  picnic.squirrels.push(squirrel);
  picnic.spawned++;
  return squirrel;
}

// Squirrels always keep their eyes on the picnic, even backing away from
// it. `heading` is the model's yaw (0 faces +z).
export function faceBlanket(s) {
  if (s.x || s.z) s.heading = Math.atan2(-s.x, -s.z);
}

function moveToward(s, tx, tz, speed, dt, wiggle) {
  const dx = tx - s.x;
  const dz = tz - s.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  let ux = dx / d;
  let uz = dz / d;
  // Squirrels zigzag a little as they run, less so close in.
  if (wiggle) {
    const w = Math.sin(s.wiggle) * 0.5 * Math.min(1, d / 3);
    const nx = ux - uz * w;
    const nz = uz + ux * w;
    const n = Math.hypot(nx, nz);
    ux = nx / n;
    uz = nz / n;
  }
  const step = Math.min(d, speed * dt);
  s.x += ux * step;
  s.z += uz * step;
  faceBlanket(s);
  return d - step;
}

// Move everything on by `dt` seconds. Returns what happened, for sounds and
// pop-ups: [{ type: "spawn" | "grab" | "stolen" | "over", squirrel, snack }].
// `watched(squirrel)` is true while it's in view: like playground statues,
// a squirrel you're looking at freezes on the spot (grabbing and running
// off included) until you look away. Shooed ones keep running.
export function update(
  picnic,
  dt,
  facing = 0,
  rand = Math.random,
  watched = () => false,
) {
  const events = [];
  if (picnic.over) return events;
  const l = squirrelLevel(picnic.level);
  picnic.t += dt;
  const now = pace(picnic.level, picnic.t);

  // New arrivals.
  picnic.spawnIn -= dt;
  if (picnic.spawnIn <= 0) {
    if (active(picnic).length < now.crowd) {
      events.push({
        type: "spawn",
        squirrel: spawnSquirrel(picnic, facing, rand),
      });
      picnic.spawnIn = now.spawn * (0.75 + rand() * 0.5);
    } else picnic.spawnIn = 0.4;
  }

  // Shooed snacks hop back onto the blanket.
  for (const snack of picnic.snacks) {
    if (snack.state !== "dropped") continue;
    snack.returnT += dt;
    const k = Math.min(1, snack.returnT / RETURN_TIME);
    const e = 1 - (1 - k) ** 2;
    snack.x = snack.from.x + (snack.home.x - snack.from.x) * e;
    snack.z = snack.from.z + (snack.home.z - snack.from.z) * e;
    if (k >= 1) snack.state = "home";
  }

  for (const s of picnic.squirrels) {
    s.wiggle += dt * 5;
    if (s.state === "shooed") {
      // Scamper straight out, fast.
      const away = Math.hypot(s.x, s.z) || 1;
      s.x += (s.x / away) * now.speed * s.speed * 2.2 * dt;
      s.z += (s.z / away) * now.speed * s.speed * 2.2 * dt;
      faceBlanket(s);
      if (away > SPAWN_RADIUS + 1) s.state = "gone";
      continue;
    }
    if (s.state === "gone") continue;
    s.frozen = !!watched(s);
    if (s.frozen) continue;

    if (s.state === "flee") {
      const snack = picnic.snacks[s.carrying];
      const away = Math.hypot(s.x, s.z) || 1;
      const out = at(angleOf(s.x, s.z), SPAWN_RADIUS + 2);
      moveToward(
        s,
        out.x,
        out.z,
        now.speed * l.carry * s.jitter * s.speed,
        dt,
        true,
      );
      snack.x = s.x;
      snack.z = s.z;
      if (away >= ESCAPE_RADIUS) {
        snack.state = "gone";
        s.state = "gone";
        s.carrying = null;
        picnic.stolen++;
        events.push({ type: "stolen", squirrel: s, snack });
        if (picnic.stolen >= STOLEN_TO_LOSE) {
          picnic.over = true;
          events.push({ type: "over" });
          return events;
        }
      }
      continue;
    }

    // Still after a snack: make sure it's still there to take.
    let target = s.target == null ? null : picnic.snacks[s.target];
    if (!target || (target.state !== "home" && target.state !== "dropped")) {
      target = pickSnack(picnic, s.x, s.z);
      s.target = target?.id ?? null;
      if (s.state === "grab") {
        s.state = "sniff";
        s.timer = 0.3;
      }
    }

    if (s.state === "grab") {
      s.timer -= dt;
      if (s.timer <= 0) {
        target.state = "carried";
        s.carrying = target.id;
        s.state = "flee";
        events.push({ type: "grab", squirrel: s, snack: target });
      }
      continue;
    }

    s.timer -= dt;
    if (s.state === "sniff") {
      if (s.timer <= 0) {
        s.state = "dash";
        s.timer = between(l.dash, rand);
      }
      continue;
    }

    // Dashing. With nothing left to take, circle around and wait.
    if (!target) {
      const r = Math.hypot(s.x, s.z);
      const p = at(angleOf(s.x, s.z) + 0.3, Math.max(r, BLANKET + 1));
      moveToward(s, p.x, p.z, now.speed * 0.5 * s.speed, dt, false);
    } else {
      const left = moveToward(
        s,
        target.x,
        target.z,
        now.speed * s.jitter * s.speed,
        dt,
        true,
      );
      if (left <= GRAB_REACH) {
        s.state = "grab";
        s.timer = l.grab;
        continue;
      }
    }
    if (s.timer <= 0) {
      s.state = "sniff";
      s.timer = between(l.pause, rand);
    }
  }
  // Tidy up the ones that have left.
  picnic.squirrels = picnic.squirrels.filter((s) => s.state !== "gone");
  return events;
}

// Whether a squirrel is close enough to shoo.
export const inReach = (s) => Math.hypot(s.x, s.z) <= REACH;

// Shoo one squirrel. A carried snack drops where it is and hops back home.
// Returns the dropped snack, null if it had none, or false if it couldn't
// be shooed (out of reach, or already running off).
export function shoo(picnic, id) {
  const s = picnic.squirrels.find((q) => q.id === id);
  if (
    !s ||
    s.state === "shooed" ||
    s.state === "gone" ||
    picnic.over ||
    !inReach(s)
  )
    return false;
  let dropped = null;
  if (s.carrying != null) {
    dropped = picnic.snacks[s.carrying];
    dropped.state = "dropped";
    dropped.returnT = 0;
    dropped.from = { x: dropped.x, z: dropped.z };
    s.carrying = null;
  }
  s.state = "shooed";
  s.target = null;
  picnic.shooed++;
  return dropped;
}

// The squirrels that can still be shooed.
export const shooable = (picnic) =>
  picnic.squirrels.filter((s) => s.state !== "shooed" && s.state !== "gone");

// The snacks still to be had (at home, dropped or being carried off).
export const snacksLeft = (picnic) =>
  picnic.snacks.filter((s) => s.state !== "gone").length;
