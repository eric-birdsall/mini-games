/** Gameplay tuning in world units and seconds. Each call to stepSumo advances one tick. */
export const SUMO = {
  players: 4,
  step: 1 / 60,
  countdown: 3,
  inputBuffer: 0.12,
  ring: { radius: 7, height: 1.5, thickness: 0.6, spawn: 3.5 },
  body: { radius: 0.55, transfer: 0.55, maxSpeed: 14, passes: 4 },
  move: { speed: 5, acceleration: 18, friction: 14, turn: 19, deadZone: 0.15 },
  dash: {
    cooldown: 2.5,
    windup: 0.1,
    duration: 0.3,
    speed: 11,
    recovery: 0.2,
    impulse: 9,
    clash: 7,
    contactBrake: 0.24,
  },
  grab: {
    cooldown: 3.5,
    range: 1.5,
    arc: 100,
    hold: 0.35,
    speed: 10,
    miss: 0.3,
    recovery: 0.25,
    counter: 2.8,
  },
  brace: {
    cooldown: 2,
    windup: 0.1,
    duration: 1.25,
    resistance: 0.8,
    rebound: 7,
    damping: 0.55,
  },
  dodge: {
    cooldown: 2,
    duration: 0.25,
    speed: 9,
    protection: 0.18,
    recovery: 0.15,
  },
  hit: { stun: 0.15, recovery: 0.35, control: 0.2, friction: 5 },
  points: [100, 60, 30, 0],
};

export const SUMO_STATE = {
  FREE: "free",
  WINDUP: "dash-windup",
  DASH: "dash",
  HOLD: "holding",
  CAUGHT: "caught",
  PLANT: "brace-windup",
  BRACE: "brace",
  DODGE: "dodge",
  HIT: "hit",
  RECOVER: "recover",
  OUT: "out",
};
const S = SUMO_STATE;
export const SUMO_ACTIONS = ["dash", "grab", "brace", "dodge"];
const priority = ["dodge", "dash", "brace", "grab"];
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const ticks = (seconds) => Math.ceil(seconds / SUMO.step - 1e-8);
const active = (p) => p.state !== S.OUT;
const protectedDodge = (p, clock) =>
  p.state === S.DODGE &&
  p.until - clock > ticks(SUMO.dodge.duration) - ticks(SUMO.dodge.protection);
const invMass = (p) => (p.state === S.BRACE ? 1 - SUMO.brace.resistance : 1);
const state = (p, next, clock, seconds = 0) => {
  p.state = next;
  p.until = clock + ticks(seconds);
};
const setSpeed = (p, speed, angle = p.facing) => {
  p.vx = Math.cos(angle) * speed;
  p.vz = Math.sin(angle) * speed;
};
const recover = (p, clock, seconds) => state(p, S.RECOVER, clock, seconds);

export const sumoStick = (x, z) => {
  const length = Math.hypot(x, z);
  const { deadZone } = SUMO.move;
  if (length <= deadZone) return { x: 0, z: 0 };
  const scale = (Math.min(1, length) - deadZone) / ((1 - deadZone) * length);
  return { x: x * scale, z: z * scale };
};

/** Participant IDs are supplied by the host. Player indices remain stable for rendering. */
export const createSumo = (ids) => ({
  clock: 0,
  start: ticks(SUMO.countdown),
  phase: "countdown",
  events: [],
  placements: null,
  players: ids.map((id, index) => {
    const angle = Math.PI / 4 + (index * Math.PI * 2) / ids.length;
    return {
      id,
      index,
      x: Math.cos(angle) * SUMO.ring.spawn,
      z: Math.sin(angle) * SUMO.ring.spawn,
      vx: 0,
      vz: 0,
      facing: angle + Math.PI,
      state: S.FREE,
      until: 0,
      partner: null,
      ready: Object.fromEntries(SUMO_ACTIONS.map((key) => [key, 0])),
      buffer: {},
      outAt: null,
      hits: 0,
    };
  }),
});

const release = (match, holder) => {
  const victim = match.players[holder.partner];
  holder.partner = null;
  victim.partner = null;
  const { clock } = match;
  for (const p of [holder, victim])
    if (active(p)) recover(p, clock, SUMO.grab.recovery);
  return victim;
};

const hit = (match, p, x, z, impulse) => {
  if (p.state === S.HOLD || p.state === S.CAUGHT) {
    release(match, p.state === S.HOLD ? p : match.players[p.partner]);
  }
  const strength = invMass(p) * impulse;
  p.vx += x * strength;
  p.vz += z * strength;
  p.hits++;
  if (p.state !== S.BRACE)
    state(p, S.HIT, match.clock, SUMO.hit.stun + SUMO.hit.recovery);
};

const resolveGrabs = (match, input) => {
  const { clock } = match;
  for (const p of match.players) {
    if (p.state !== S.HOLD) continue;
    const target = match.players[p.partner];
    const x = Math.cos(p.facing),
      z = Math.sin(p.facing);
    if (input[target.index]?.pressed?.grab && clock <= p.until) {
      release(match, p);
      hit(match, p, -x, -z, SUMO.grab.counter);
      recover(p, clock, SUMO.grab.recovery);
      setSpeed(target, SUMO.grab.counter * 0.65, p.facing);
      match.events.push("counter");
    } else if (clock >= p.until) {
      release(match, p);
      target.vx = target.vz = 0;
      hit(match, target, x, z, SUMO.grab.speed);
      p.throwAt = clock;
      match.events.push("throw");
    }
  }
};

const movePlayer = (match, p, input) => {
  const { clock, events } = match;
  if (!active(p) || p.state === S.CAUGHT || p.state === S.HOLD) return;
  if (p.state === S.WINDUP && clock >= p.until) {
    state(p, S.DASH, clock, SUMO.dash.duration);
    setSpeed(p, SUMO.dash.speed);
    events.push("dash");
  } else if (p.state === S.DASH && clock >= p.until) {
    recover(p, clock, SUMO.dash.recovery);
  } else if (p.state === S.DODGE && clock >= p.until) {
    recover(p, clock, SUMO.dodge.recovery);
  } else if (p.state === S.PLANT || p.state === S.BRACE) {
    if (!input.brace || (p.state === S.BRACE && clock >= p.until)) {
      state(p, S.FREE, clock);
    } else if (p.state === S.PLANT && clock >= p.until) {
      state(p, S.BRACE, clock, SUMO.brace.duration);
    }
  } else if ((p.state === S.HIT || p.state === S.RECOVER) && clock >= p.until) {
    state(p, S.FREE, clock);
  }
  const { x, z } = input;
  const length = Math.min(1, Math.hypot(x, z));
  const direction = length ? Math.atan2(z, x) : p.facing;
  if (p.state === S.FREE && length) {
    const delta = wrap(direction - p.facing);
    p.facing += clamp(
      delta,
      -SUMO.move.turn * SUMO.step,
      SUMO.move.turn * SUMO.step,
    );
  }
  if (p.state === S.FREE) {
    const action = priority.find(
      (key) =>
        p.buffer[key] >= clock &&
        p.ready[key] <= clock &&
        (key !== "brace" || input.brace),
    );
    if (action && action !== "grab") {
      delete p.buffer[action];
      p.ready[action] = clock + ticks(SUMO[action].cooldown);
      if (action === "brace") state(p, S.PLANT, clock, SUMO.brace.windup);
      if (action === "dash") state(p, S.WINDUP, clock, SUMO.dash.windup);
      if (action === "dodge") {
        state(p, S.DODGE, clock, SUMO.dodge.duration);
        p.facing = direction;
        setSpeed(p, SUMO.dodge.speed);
        events.push("dodge");
      }
    }
  }

  if (p.state === S.BRACE) {
    p.vx *= SUMO.brace.damping;
    p.vz *= SUMO.brace.damping;
  } else if (p.state !== S.DASH && p.state !== S.DODGE) {
    const { control: initial, recovery } = SUMO.hit;
    const control =
      p.state === S.FREE
        ? 1
        : p.state === S.HIT
          ? initial +
            (1 - initial) * clamp(1 - (p.until - clock) / ticks(recovery), 0, 1)
          : 0;
    const steer = length * SUMO.move.speed * control;
    const dx = Math.cos(direction) * steer - p.vx;
    const dz = Math.sin(direction) * steer - p.vz;
    const friction = p.state === S.HIT ? SUMO.hit.friction : SUMO.move.friction;
    const rate = steer ? SUMO.move.acceleration * control : friction;
    const scale = Math.min(1, (rate * SUMO.step) / (Math.hypot(dx, dz) || 1));
    p.vx += dx * scale;
    p.vz += dz * scale;
  }
  const cap = Math.min(1, SUMO.body.maxSpeed / (Math.hypot(p.vx, p.vz) || 1));
  p.vx *= cap;
  p.vz *= cap;
  p.x += p.vx * SUMO.step;
  p.z += p.vz * SUMO.step;
};

const grabTarget = (match, p) => {
  let best = null;
  const arc = Math.cos((SUMO.grab.arc * Math.PI) / 360);
  for (const foe of match.players) {
    if (
      p === foe ||
      !active(foe) ||
      foe.partner !== null ||
      protectedDodge(foe, match.clock)
    )
      continue;
    const x = foe.x - p.x,
      z = foe.z - p.z;
    const distance = Math.hypot(x, z);
    if (distance > SUMO.grab.range || !distance) continue;
    const alignment =
      (x * Math.cos(p.facing) + z * Math.sin(p.facing)) / distance;
    if (
      alignment >= arc &&
      (!best ||
        alignment > best.alignment + 1e-8 ||
        (Math.abs(alignment - best.alignment) <= 1e-8 &&
          distance < best.distance))
    )
      best = { foe, alignment, distance };
  }
  return best;
};

const startGrabs = (match) => {
  const { clock } = match;
  const intents = new Map();
  for (const p of match.players) {
    if (p.state !== S.FREE || !(p.buffer.grab >= clock) || p.ready.grab > clock)
      continue;
    delete p.buffer.grab;
    p.ready.grab = clock + ticks(SUMO.grab.cooldown);
    const target = grabTarget(match, p);
    if (target) intents.set(p, target);
    else recover(p, clock, SUMO.grab.miss);
  }
  // Mutual attempts clash. Other competing grabs go to best alignment,
  // then shortest reach, then the stable participant order for exact ties.
  for (const [p, { foe }] of intents) {
    if (intents.get(foe)?.foe !== p) continue;
    intents.delete(p);
    intents.delete(foe);
    for (const [who, other] of [
      [p, foe],
      [foe, p],
    ]) {
      setSpeed(
        who,
        SUMO.grab.counter,
        Math.atan2(who.z - other.z, who.x - other.x),
      );
      recover(who, clock, SUMO.grab.recovery);
    }
    match.events.push("clash");
  }
  const ranked = [...intents].sort(
    ([a, u], [b, v]) =>
      v.alignment - u.alignment || u.distance - v.distance || a.index - b.index,
  );
  for (const [p, { foe }] of ranked) {
    if (p.state !== S.FREE) continue;
    if (p.partner !== null || foe.partner !== null) {
      recover(p, clock, SUMO.grab.miss);
      continue;
    }
    p.partner = foe.index;
    foe.partner = p.index;
    p.vx = p.vz = foe.vx = foe.vz = 0;
    p.buffer = {};
    foe.buffer = {};
    state(p, S.HOLD, clock, SUMO.grab.hold);
    state(foe, S.CAUGHT, clock, SUMO.grab.hold);
    match.events.push("grab");
  }
};

const contacts = (players) => {
  const pairs = [];
  for (const [i, a] of players.entries()) {
    if (!active(a)) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (!active(b) || a.partner === b.index) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      const overlap = SUMO.body.radius * 2 - distance;
      if (overlap > 0)
        pairs.push({
          a,
          b,
          overlap,
          x: distance ? dx / distance : 1,
          z: distance ? dz / distance : 0,
        });
    }
  }
  return pairs;
};

const dashImpacts = (match, pairs) => {
  const stopped = new Set();
  const impulses = new Map();
  const add = (p, x, z, force) => {
    const impulse = impulses.get(p) ?? { x: 0, z: 0 };
    impulse.x += x * force;
    impulse.z += z * force;
    impulses.set(p, impulse);
  };
  for (const { a, b, x, z } of pairs.sort((u, v) => v.overlap - u.overlap)) {
    if (a.state === S.DASH && b.state === S.DASH) {
      if (stopped.has(a) || stopped.has(b)) continue;
      stopped.add(a);
      stopped.add(b);
      add(a, -x, -z, SUMO.dash.clash);
      add(b, x, z, SUMO.dash.clash);
      match.events.push("clash");
      continue;
    }
    for (const [p, foe, nx, nz] of [
      [a, b, x, z],
      [b, a, -x, -z],
    ]) {
      if (
        p.state !== S.DASH ||
        stopped.has(p) ||
        protectedDodge(foe, match.clock) ||
        p.vx * nx + p.vz * nz <= 0
      )
        continue;
      stopped.add(p);
      if (foe.state === S.BRACE) {
        add(p, -nx, -nz, SUMO.brace.rebound);
        match.events.push("rebound");
      } else {
        add(foe, nx, nz, SUMO.dash.impulse);
        match.events.push("impact");
      }
    }
  }
  for (const p of stopped) {
    p.vx *= SUMO.dash.contactBrake;
    p.vz *= SUMO.dash.contactBrake;
    recover(p, match.clock, SUMO.dash.recovery);
  }
  for (const [p, impulse] of impulses) hit(match, p, impulse.x, impulse.z, 1);
};

const separate = (pairs, transfer) => {
  for (const { a, b, x, z, overlap } of pairs) {
    const ma = invMass(a),
      mb = invMass(b);
    const da = (overlap * ma) / (ma + mb),
      db = overlap - da;
    a.x -= x * da;
    a.z -= z * da;
    b.x += x * db;
    b.z += z * db;
    const closing = (a.vx - b.vx) * x + (a.vz - b.vz) * z;
    if (!transfer || closing <= 0) continue;
    const impulse = (closing * SUMO.body.transfer) / (ma + mb);
    a.vx -= x * impulse * ma;
    a.vz -= z * impulse * ma;
    b.vx += x * impulse * mb;
    b.vz += z * impulse * mb;
  }
};

const eliminate = (match) => {
  const crossed = match.players.filter(
    (p) => active(p) && Math.hypot(p.x, p.z) > SUMO.ring.radius,
  );
  for (const p of crossed) {
    if (p.partner !== null)
      release(match, p.state === S.HOLD ? p : match.players[p.partner]);
    p.outAt = match.clock;
    state(p, S.OUT, match.clock);
    match.events.push("out");
  }
};

const finish = (match) => {
  if (match.players.filter(active).length > 1) return;
  match.phase = "finished";
  const order = [...match.players].sort(
    (a, b) => (b.outAt ?? Infinity) - (a.outAt ?? Infinity),
  );
  let place = 1;
  match.placements = order.map((p, i) => {
    if (i && p.outAt !== order[i - 1].outAt) place = i + 1;
    return { id: p.id, place, points: SUMO.points[place - 1] };
  });
  match.events.push("finish");
};

/** Advance a match. Input coordinates are world X/Z. pressed contains fresh button edges. */
export const stepSumo = (match, inputs = []) => {
  match.events = [];
  if (match.phase === "finished") return;
  const { players } = match;
  const clock = ++match.clock;
  if (match.phase === "countdown") {
    if (clock >= match.start) {
      match.phase = "playing";
      match.events.push("start");
    }
    return;
  }
  players.forEach((p, i) => {
    if (!active(p) || p.state === S.CAUGHT || p.state === S.HOLD) return;
    for (const key of SUMO_ACTIONS)
      if (inputs[i]?.pressed?.[key])
        p.buffer[key] = clock + ticks(SUMO.inputBuffer);
  });
  resolveGrabs(match, inputs);
  players.forEach((p, i) => movePlayer(match, p, { x: 0, z: 0, ...inputs[i] }));
  eliminate(match);
  dashImpacts(match, contacts(players));
  startGrabs(match);
  for (let i = 0; i < SUMO.body.passes; i++) {
    separate(contacts(players), i === 0);
    eliminate(match);
  }
  finish(match);
};
