// Kickabout: 3v3 backyard soccer. Each side has a goalkeeper (always a
// bot) and two outfield players. The player controls whichever of their two
// outfielders has the ball; when the other side has it (or nobody does) they
// control the one nearest the ball and can switch.
//
// Field coordinates are metres: x runs goal to goal (team 0, the player's
// team, attacks +x), y runs across (+y is the far touchline, the top of the
// screen). Everything here is plain data and deterministic for a seed, so
// tests can play whole matches.

export const FIELD = {
  halfL: 22, // goal line at x = ±halfL
  halfW: 13, // touchlines at y = ±halfW (the fence keeps the ball in)
  goalHalf: 3.2,
  goalDepth: 1.8,
  crossbar: 2.1,
  boxDepth: 6.5,
  boxHalf: 7.5,
  circle: 4,
};

export const PHYS = {
  speed: 7, // top running speed
  carrySpeed: 6.3, // with the ball at your feet
  accel: 30,
  radius: 0.45,
  ball: 0.25,
  friction: 0.55, // ball speed lost per second, proportional…
  drag: 1.8, // …plus a constant roll-out, m/s²
  bounce: 0.6,
  gravity: 18,
  control: 0.8, // how close you need to be to take a loose ball
  trapSpeed: 17, // faster than this and it bounces off you
  dribble: 0.62, // ball distance in front of the carrier
  shotMin: 19,
  shotMax: 28,
  charge: 0.7, // seconds of holding for a full-power shot
  passMin: 8,
  passMax: 16,
  lunge: 12,
  lungeTime: 0.22,
  lungeCooldown: 0.8,
  turn: 12, // radians per second
};

// The opponents get better with the difficulty; the player's own keeper and
// teammate stay the same.
export const LEVELS = {
  easy: {
    botSpeed: 0.72,
    keeperReach: 0.9,
    userTackle: 0.15,
    keeperSpeed: 4.4,
    keeperHold: 1.2,
    tackleTime: 0.8,
    think: 0.5,
    aimError: 2.6,
    shootRange: 15,
    passChance: 0.35,
  },
  normal: {
    botSpeed: 0.86,
    keeperReach: 1.6,
    userTackle: 0.3,
    keeperSpeed: 5.4,
    keeperHold: 0.9,
    tackleTime: 0.42,
    think: 0.28,
    aimError: 1.4,
    shootRange: 13,
    passChance: 0.55,
  },
  hard: {
    botSpeed: 1.04,
    keeperReach: 2.0,
    userTackle: 0.45,
    keeperSpeed: 6.4,
    keeperHold: 0.7,
    tackleTime: 0.2,
    think: 0.14,
    aimError: 0.5,
    shootRange: 12,
    passChance: 0.7,
  },
};
export const FRIEND = {
  botSpeed: 0.9,
  keeperReach: 1.35,
  keeperSpeed: 5.6,
  keeperHold: 0.8,
  tackleTime: 0.35,
  think: 0.2,
  aimError: 0.9,
  shootRange: 13,
  passChance: 0.55,
};
export const MATCH_TIME = 180;
export const KICKOFF_TIME = 1.6;
export const GOAL_TIME = 2.6;

export const kickLevel = (level) => LEVELS[level] ?? LEVELS.normal;

function random(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dirOf = (team) => (team === 0 ? 1 : -1);
export const settingsFor = (m, p) => (p.team === 0 ? m.friend : m.opp);

function player(i, team, keeper, slot) {
  return {
    i,
    team,
    keeper,
    slot,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: team === 0 ? 0 : Math.PI,
    cooldown: 0, // can't touch the ball yet (just kicked it)
    protect: 0, // can't be tackled yet (just got the ball)
    stun: 0, // just lost the ball or missed a dive
    tackle: 0,
    think: 0,
    mode: "cover",
    lunge: 0,
    lungeCool: 0,
    lungeX: 0,
    lungeY: 0,
    hold: 0,
    carry: 0,
  };
}

export function createMatch(level = "normal", options = {}) {
  const m = {
    level,
    opp: kickLevel(level),
    friend: FRIEND,
    rand: random(options.seed ?? Math.floor(Math.random() * 2 ** 32)),
    clock: options.time ?? MATCH_TIME,
    golden: false,
    score: [0, 0],
    phase: "kickoff",
    phaseTime: KICKOFF_TIME,
    players: [],
    ball: {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: null,
      last: null,
      passTo: null,
      shot: false,
      tried: new Set(),
    },
    controlled: 1,
    switchTimer: 0,
    prevShoot: false,
    prevPass: false,
    charge: -1,
    stats: { shots: [0, 0], saves: [0, 0], steals: [0, 0], passes: [0, 0] },
    scorer: null,
    endAfterGoal: false,
  };
  for (const team of [0, 1])
    for (const slot of [0, 1, 2])
      m.players.push(player(m.players.length, team, slot === 0, slot));
  resetKickoff(m, options.kickoff ?? 0);
  return m;
}

export const keeperOf = (m, team) => m.players[team * 3];
export const fieldOf = (m, team) => [
  m.players[team * 3 + 1],
  m.players[team * 3 + 2],
];
export const mateOf = (m, p) =>
  p.keeper ? null : m.players[p.team * 3 + (p.slot === 1 ? 2 : 1)];

export function resetKickoff(m, team) {
  for (const p of m.players) {
    const dir = dirOf(p.team);
    Object.assign(p, {
      vx: 0,
      vy: 0,
      face: dir > 0 ? 0 : Math.PI,
      cooldown: 0,
      protect: 0,
      stun: 0,
      tackle: 0,
      lunge: 0,
      lungeCool: 0,
      hold: 0,
      carry: 0,
      think: 0,
      mode: "cover",
    });
    const side = p.slot === 1 ? -1 : 1;
    if (p.keeper) {
      p.x = -dir * (FIELD.halfL - 0.7);
      p.y = 0;
    } else if (p.team === team) {
      p.x = p.slot === 1 ? -dir * 0.5 : -dir * 4;
      p.y = p.slot === 1 ? 0 : 6 * side;
    } else {
      p.x = -dir * 7;
      p.y = 4 * side;
    }
  }
  const kicker = m.players[team * 3 + 1];
  const b = m.ball;
  Object.assign(b, {
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    owner: kicker,
    last: kicker,
    passTo: null,
    shot: false,
  });
  b.tried.clear();
  kicker.protect = 1.2;
  placeOwned(m);
  m.phase = "kickoff";
  m.phaseTime = KICKOFF_TIME;
  m.kickoffTeam = team;
  m.charge = -1;
  m.controlled = 1;
}

function placeOwned(m) {
  const b = m.ball;
  const p = b.owner;
  if (!p) return;
  b.x = clamp(
    p.x + Math.cos(p.face) * PHYS.dribble,
    -FIELD.halfL + PHYS.ball,
    FIELD.halfL - PHYS.ball,
  );
  b.y = clamp(
    p.y + Math.sin(p.face) * PHYS.dribble,
    -FIELD.halfW + PHYS.ball,
    FIELD.halfW - PHYS.ball,
  );
  b.z = 0;
  b.vx = p.vx;
  b.vy = p.vy;
  b.vz = 0;
}

// --- Kicking ----------------------------------------------------------

function kick(m, p, vx, vy, vz, kind, passTo = null) {
  const b = m.ball;
  b.owner = null;
  b.last = p;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  b.passTo = passTo;
  b.shot = kind === "shot";
  b.tried.clear();
  p.cooldown = 0.35;
  p.carry = 0;
  p.hold = 0;
  p.protect = 0;
  return { type: "kick", kind, p, power: Math.hypot(vx, vy) };
}

export function passSpeed(d) {
  return clamp(4 + d * 0.75, PHYS.passMin, PHYS.passMax);
}

export function pass(m, p, to) {
  const b = m.ball;
  let d = dist(b, to);
  const speed = passSpeed(d);
  const t = d / (speed * 0.75);
  const tx = clamp(to.x + to.vx * t * 0.6, -FIELD.halfL + 1, FIELD.halfL - 1);
  const ty = clamp(to.y + to.vy * t * 0.6, -FIELD.halfW + 1, FIELD.halfW - 1);
  d = Math.hypot(tx - b.x, ty - b.y) || 1;
  const s = passSpeed(d);
  m.stats.passes[p.team]++;
  return kick(
    m,
    p,
    ((tx - b.x) / d) * s,
    ((ty - b.y) / d) * s,
    d > 12 ? 4 : 0.5,
    "pass",
    to,
  );
}

// Shoot at a spot on the opponents' goal line, `power` 0..1.
export function shoot(m, p, aimY, power, error = 0) {
  const b = m.ball;
  const gx = dirOf(p.team) * (FIELD.halfL + 0.5);
  const ty = clamp(aimY + error, -FIELD.goalHalf - 2, FIELD.goalHalf + 2);
  const d = Math.hypot(gx - b.x, ty - b.y) || 1;
  const s = PHYS.shotMin + (PHYS.shotMax - PHYS.shotMin) * power;
  m.stats.shots[p.team]++;
  return kick(
    m,
    p,
    ((gx - b.x) / d) * s,
    ((ty - b.y) / d) * s,
    1 + 3 * power,
    "shot",
  );
}

// Aim away from the keeper: the far side of the goal from where they stand.
function cornerAway(m, team, from) {
  const k = keeperOf(m, 1 - team);
  const side = Math.abs(k.y) > 0.3 ? -Math.sign(k.y) : from.y > 0 ? -1 : 1;
  return side * FIELD.goalHalf * 0.62;
}

// Is the lane from the ball to `to` clear of opponents?
function laneOpen(m, from, to, team, room = 1.3) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    len2 = dx * dx + dy * dy || 1;
  for (const o of m.players) {
    if (o.team === team) continue;
    const t = clamp(((o.x - from.x) * dx + (o.y - from.y) * dy) / len2, 0, 1);
    if (Math.hypot(from.x + dx * t - o.x, from.y + dy * t - o.y) < room)
      return false;
  }
  return true;
}

const openness = (m, p) =>
  Math.min(
    ...m.players.filter((o) => o.team !== p.team).map((o) => dist(o, p)),
  );

// --- The step -----------------------------------------------------------

// `input` is the player's controller: { x, y, shoot, pass } with x, y in
// -1..1 (+y is up the screen) and shoot / pass held. Pass null to let a bot
// play the player's side too (tests).
export function step(m, input, dt) {
  const events = [];
  const b = m.ball;
  if (m.phase === "over") return events;
  if (m.phase === "kickoff") {
    m.phaseTime -= dt;
    if (m.phaseTime <= 0) {
      m.phase = "play";
      events.push({ type: "whistle" });
    }
    m.prevShoot = !!input?.shoot;
    m.prevPass = !!input?.pass;
    return events;
  }
  if (m.phase === "goal") {
    m.phaseTime -= dt;
    for (const p of m.players) {
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    moveBall(m, dt, events);
    if (m.phaseTime <= 0) {
      if (m.endAfterGoal) {
        m.phase = "over";
        events.push({ type: "over" });
      } else {
        resetKickoff(m, 1 - m.scorer.team);
        events.push({ type: "kickoff", team: m.kickoffTeam });
      }
    }
    return events;
  }

  // phase === "play"
  m.clock -= dt;
  if (m.clock <= 0 && !m.golden) {
    m.clock = 0;
    if (m.score[0] !== m.score[1]) {
      m.phase = "over";
      events.push({ type: "over" });
      return events;
    }
    m.golden = true;
    events.push({ type: "golden" });
  }
  m.clock = Math.max(0, m.clock);
  for (const p of m.players) {
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.protect = Math.max(0, p.protect - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.lungeCool = Math.max(0, p.lungeCool - dt);
    if (p.lunge > 0) {
      p.lunge -= dt;
      if (p.lunge <= 0) p.stun = Math.max(p.stun, 0.2);
    }
  }
  m.switchTimer = Math.max(0, m.switchTimer - dt);

  m.human = !!input;
  chooseControlled(m);
  const want = new Map();
  for (const p of m.players) {
    if (p.keeper) want.set(p, keeperAI(m, p, dt, events));
    else if (input && p.i === m.controlled)
      want.set(p, userControl(m, p, input, dt, events));
    else want.set(p, fieldAI(m, p, dt, events));
  }
  if (input) {
    m.prevShoot = !!input.shoot;
    m.prevPass = !!input.pass;
  }
  for (const p of m.players) movePlayer(m, p, want.get(p), dt);
  separate(m);
  if (b.owner) {
    b.owner.carry += dt;
    placeOwned(m);
  } else moveBall(m, dt, events);
  if (m.phase === "play") {
    touches(m, events, input);
    tackles(m, dt, events, input);
  }
  chooseControlled(m);
  return events;
}

function chooseControlled(m) {
  const b = m.ball;
  const owner = b.owner;
  if (owner && owner.team === 0 && !owner.keeper) {
    m.controlled = owner.i;
    return;
  }
  if (b.passTo && b.passTo.team === 0 && !owner) {
    m.controlled = b.passTo.i;
    return;
  }
  if (owner && owner.team === 0) return; // our keeper has it
  const cur = m.players[m.controlled];
  const other = mateOf(m, cur);
  if (
    m.switchTimer <= 0 &&
    cur.lunge <= 0 &&
    dist(other, b) + 2.5 < dist(cur, b)
  ) {
    m.controlled = other.i;
    m.switchTimer = 0.7;
  }
}

function userControl(m, p, input, dt, events) {
  const b = m.ball;
  const has = b.owner === p;
  const shootDown = input.shoot && !m.prevShoot;
  const passDown = input.pass && !m.prevPass;
  let ix = input.x || 0,
    iy = input.y || 0;
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }
  if (has) {
    if (shootDown) m.charge = 0;
    if (m.charge >= 0) {
      if (input.shoot) m.charge = Math.min(PHYS.charge * 1.5, m.charge + dt);
      else {
        events.push(userShot(m, p, iy));
        m.charge = -1;
      }
    }
    if (b.owner === p && passDown) {
      m.charge = -1;
      events.push(pass(m, p, mateOf(m, p)));
      m.controlled = mateOf(m, p).i;
    }
  } else {
    m.charge = -1;
    if (shootDown && p.lungeCool <= 0 && p.stun <= 0) {
      // Lunge for the ball: towards it when it's close, else straight on.
      const d = dist(p, b);
      let lx = Math.cos(p.face),
        ly = Math.sin(p.face);
      if (d < 4.5 && d > 0.01) {
        lx = (b.x - p.x) / d;
        ly = (b.y - p.y) / d;
      } else if (len > 0.2) {
        lx = ix / len;
        ly = iy / len;
      }
      p.lunge = PHYS.lungeTime;
      p.lungeCool = PHYS.lungeCooldown;
      p.lungeX = lx;
      p.lungeY = ly;
      events.push({ type: "lunge", p });
    }
    if (passDown) {
      const other = mateOf(m, p);
      m.controlled = other.i;
      m.switchTimer = 1.2;
      events.push({ type: "switch", p: other });
    }
  }
  // Nudge towards a pass coming our way if the stick is left alone.
  if (len < 0.15 && !has && b.passTo === p && !b.owner)
    return towards(p, intercept(p, b), PHYS.speed);
  const speed = has ? PHYS.carrySpeed : PHYS.speed;
  return { x: ix * speed, y: iy * speed };
}

function userShot(m, p, iy) {
  const b = m.ball;
  const power = clamp(0.35 + (0.65 * m.charge) / PHYS.charge, 0.35, 1);
  const dir = dirOf(p.team);
  const gx = dir * FIELD.halfL;
  const toGoal = Math.atan2(-b.y, gx - b.x);
  let diff = Math.abs(
    ((p.face - toGoal + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
  );
  if (diff > Math.PI * 0.6) {
    // Facing away from goal: a big clearance the way you face.
    const s = PHYS.shotMin * (0.6 + 0.4 * power);
    return kick(
      m,
      p,
      Math.cos(p.face) * s,
      Math.sin(p.face) * s,
      2 + 3 * power,
      "clear",
    );
  }
  const aim =
    Math.abs(iy) > 0.3
      ? Math.sign(iy) * FIELD.goalHalf * 0.7
      : cornerAway(m, p.team, b);
  const d = Math.abs(gx - b.x);
  const error = (m.rand() - 0.5) * d * 0.05 * (0.5 + power);
  return shoot(m, p, aim, power, error);
}

function towards(p, t, speed, slow = 0.6) {
  const dx = t.x - p.x,
    dy = t.y - p.y,
    d = Math.hypot(dx, dy);
  if (d < 0.05) return { x: 0, y: 0 };
  const s = d < slow ? (speed * d) / slow : speed;
  return { x: (dx / d) * s, y: (dy / d) * s };
}

// Where to meet a rolling ball: the nearest point on its path ahead.
function intercept(p, b) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 1) return { x: b.x, y: b.y };
  const ux = b.vx / sp,
    uy = b.vy / sp;
  const along = clamp((p.x - b.x) * ux + (p.y - b.y) * uy, 0.3, sp * 0.8);
  return { x: b.x + ux * along, y: b.y + uy * along };
}

// --- Bots ---------------------------------------------------------------

function fieldAI(m, p, dt, events) {
  const s = settingsFor(m, p);
  const b = m.ball;
  const dir = dirOf(p.team);
  const speed = PHYS.speed * s.botSpeed;
  p.think -= dt;
  const decide = p.think <= 0;
  if (decide) p.think = s.think * (0.7 + 0.6 * m.rand());
  if (b.owner === p) return carry(m, p, s, decide, events);
  if (b.passTo === p && !b.owner) return towards(p, intercept(p, b), speed);

  const owner = b.owner;
  const mate = mateOf(m, p);
  const ownGoal = { x: -dir * FIELD.halfL, y: 0 };
  const stale =
    (p.mode === "support" && !(owner && owner.team === p.team)) ||
    (p.mode === "mark" && !owner?.keeper);
  if (decide || stale) {
    if (owner && owner.team === p.team) p.mode = "support";
    else if (owner && owner.keeper) p.mode = "mark";
    else {
      // The nearer of the two goes for the ball; the player's own controlled
      // outfielder counts as the chaser on their side.
      const userMate = m.human && p.team === 0 && mate.i === m.controlled;
      const mine = dist(p, b),
        theirs = dist(mate, b);
      const chase = userMate
        ? !owner && mine + 3 < theirs
        : p.mode === "chase"
          ? mine < theirs + 2
          : mine + 2 < theirs || (mine < theirs && mate.mode !== "chase");
      p.mode = chase && p.stun <= 0 ? "chase" : "cover";
    }
  }
  let t;
  if (p.mode === "chase") {
    t = owner
      ? { x: b.x + owner.vx * 0.2, y: b.y + owner.vy * 0.2 }
      : intercept(p, b);
  } else if (p.mode === "support") {
    if (owner.keeper) {
      t = {
        x: owner.x + dir * 11,
        y: p.slot === 1 ? -6 : 6,
      };
    } else {
      const side =
        Math.abs(owner.y) > 4 ? -Math.sign(owner.y) : p.slot === 1 ? -1 : 1;
      t = {
        x: clamp(owner.x + dir * 7, -FIELD.halfL + 4, FIELD.halfL - 4),
        y: side * 5,
      };
    }
  } else {
    // Mark: stay goal-side of an attacker who hasn't got the ball.
    const foes = fieldOf(m, 1 - p.team).filter((o) => o !== owner);
    const mark =
      p.mode === "mark"
        ? fieldOf(m, 1 - p.team)[p.slot - 1]
        : foes.sort((a, c) => dist(a, ownGoal) - dist(c, ownGoal))[0];
    if (mark && (owner || p.mode === "mark"))
      t = {
        x: ownGoal.x + (mark.x - ownGoal.x) * 0.75,
        y: ownGoal.y + (mark.y - ownGoal.y) * 0.75,
      };
    else
      t = {
        x: ownGoal.x + (b.x - ownGoal.x) * 0.55,
        y: b.y * 0.55,
      };
    if (p.mode === "mark") {
      const k = owner;
      // Keep out of the keeper's box while they hold it.
      if (Math.abs(t.x - k.x) < FIELD.boxDepth + 1)
        t.x = k.x + dirOf(k.team) * (FIELD.boxDepth + 1);
    }
  }
  return towards(p, t, speed);
}

function carry(m, p, s, decide, events) {
  const b = m.ball;
  const dir = dirOf(p.team);
  const gx = dir * FIELD.halfL;
  const mate = mateOf(m, p);
  const d = Math.hypot(gx - p.x, p.y);
  const foes = m.players.filter((o) => o.team !== p.team);
  const fx = Math.cos(p.face),
    fy = Math.sin(p.face);
  const pressure = foes.some(
    (o) => !o.keeper && dist(o, p) < 2.6 && (o.x - p.x) * dir > -0.5,
  );
  if (decide || p.carry > 3.5) {
    const ahead = dir * (gx - p.x);
    if (
      d < s.shootRange &&
      ahead > 1.5 &&
      Math.abs(p.y) < ahead * 1.1 + 1.5 &&
      fx * dir > 0
    ) {
      const error = (m.rand() - 0.5) * 2 * s.aimError * (d / 12);
      events.push(
        shoot(m, p, cornerAway(m, p.team, b), 0.55 + 0.45 * m.rand(), error),
      );
      return { x: p.vx, y: p.vy };
    }
    const forward = (mate.x - p.x) * dir > -3;
    if (
      (pressure || p.carry > 3.5) &&
      laneOpen(m, b, mate, p.team) &&
      (forward || pressure) &&
      (p.carry > 3.5 || m.rand() < s.passChance)
    ) {
      events.push(pass(m, p, mate));
      return { x: p.vx, y: p.vy };
    }
    if (p.carry > 5.5) {
      events.push(
        ahead > FIELD.halfL
          ? pass(m, p, mate)
          : shoot(m, p, cornerAway(m, p.team, b), 0.8, (m.rand() - 0.5) * 3),
      );
      return { x: p.vx, y: p.vy };
    }
  }
  // Dribble at goal, swerving round defenders and away from the fence.
  let tx = gx - dir * 3 - p.x,
    ty = clamp(p.y * 0.4, -2, 2) - p.y;
  let len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  for (const o of foes) {
    const ox = o.x - p.x,
      oy = o.y - p.y,
      od = Math.hypot(ox, oy);
    if (od > 4.5 || od < 0.01 || ox * tx + oy * ty < -0.3) continue;
    const push = ((4.5 - od) / 4.5) * 1.4;
    // Step sideways round them, on the side away from them.
    const side = ox * ty - oy * tx > 0 ? 1 : -1;
    tx += ((side * oy) / od) * push;
    ty += ((-side * ox) / od) * push;
  }
  if (Math.abs(p.y) > FIELD.halfW - 2.5) ty -= Math.sign(p.y) * 1.2;
  len = Math.hypot(tx, ty) || 1;
  const speed = PHYS.carrySpeed * s.botSpeed;
  return { x: (tx / len) * speed, y: (ty / len) * speed };
}

function keeperAI(m, k, dt, events) {
  const s = settingsFor(m, k);
  const b = m.ball;
  const dir = dirOf(k.team);
  const lineX = -dir * (FIELD.halfL - 0.7);
  if (b.owner === k) {
    k.hold -= dt;
    if (k.hold <= 0) {
      const mates = fieldOf(m, k.team);
      const to = mates.reduce((a, c) =>
        openness(m, c) + (c.x - k.x) * dir * 0.05 >
        openness(m, a) + (a.x - k.x) * dir * 0.05
          ? c
          : a,
      );
      events.push(pass(m, k, to));
      if (k.team === 0) m.controlled = to.i;
    }
    return { x: 0, y: 0 };
  }
  let t = { x: lineX, y: 0 };
  let speed = s.keeperSpeed;
  const loose = !b.owner;
  const coming = loose && b.vx * -dir > 4;
  const inBox =
    (b.x - lineX) * dir < FIELD.boxDepth && Math.abs(b.y) < FIELD.boxHalf;
  if (coming) {
    const tt = (lineX - b.x) / b.vx;
    t.y = tt > 0 && tt < 2 ? b.y + b.vy * tt : b.y * 0.5;
    t.y = clamp(t.y, -FIELD.goalHalf - 0.4, FIELD.goalHalf + 0.4);
    speed *= 1.5;
  } else {
    t.y = clamp(b.y * 0.4, -FIELD.goalHalf + 0.5, FIELD.goalHalf - 0.5);
    const far = Math.abs(b.x - lineX);
    if (far < 12) t.x = lineX + dir * Math.min(2, (12 - far) * 0.25);
    const foeNear = Math.min(
      ...m.players.filter((o) => o.team !== k.team).map((o) => dist(o, b)),
    );
    if (
      inBox &&
      ((loose && dist(k, b) < foeNear + 1) ||
        (b.owner && b.owner.team !== k.team && dist(k, b) < 4))
    )
      t = { x: b.x, y: b.y };
  }
  t.x =
    dir > 0
      ? clamp(t.x, lineX, lineX + FIELD.boxDepth)
      : clamp(t.x, lineX - FIELD.boxDepth, lineX);
  t.y = clamp(t.y, -FIELD.boxHalf, FIELD.boxHalf);
  return towards(k, t, speed, 0.3);
}

// --- Movement and the ball ---------------------------------------------

function movePlayer(m, p, want, dt) {
  if (p.lunge > 0) {
    p.vx = p.lungeX * PHYS.lunge;
    p.vy = p.lungeY * PHYS.lunge;
  } else {
    let wx = want.x,
      wy = want.y;
    if (p.stun > 0) {
      wx *= 0.35;
      wy *= 0.35;
    }
    const dx = wx - p.vx,
      dy = wy - p.vy,
      d = Math.hypot(dx, dy),
      max = PHYS.accel * dt;
    if (d > max) {
      p.vx += (dx / d) * max;
      p.vy += (dy / d) * max;
    } else {
      p.vx = wx;
      p.vy = wy;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const lx = FIELD.halfL - 0.3,
    ly = FIELD.halfW - 0.4;
  if (Math.abs(p.x) > lx) {
    p.x = Math.sign(p.x) * lx;
    p.vx = 0;
  }
  if (Math.abs(p.y) > ly) {
    p.y = Math.sign(p.y) * ly;
    p.vy = 0;
  }
  if (p.keeper) {
    // Keepers never leave their box.
    const line = -dirOf(p.team) * FIELD.halfL;
    const out = Math.abs(p.x - line) - FIELD.boxDepth;
    if (out > 0) p.x -= Math.sign(p.x - line) * out;
    p.y = clamp(p.y, -FIELD.boxHalf, FIELD.boxHalf);
  }
  const sp = Math.hypot(p.vx, p.vy);
  let aim = null;
  if (sp > 0.4) aim = Math.atan2(p.vy, p.vx);
  else if (p.keeper || m.ball.owner !== p)
    aim = Math.atan2(m.ball.y - p.y, m.ball.x - p.x);
  if (aim !== null) {
    let diff = ((aim - p.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const maxTurn = PHYS.turn * dt * (m.ball.owner === p ? 0.8 : 1);
    p.face += clamp(diff, -maxTurn, maxTurn);
  }
}

function separate(m) {
  const ps = m.players;
  const r2 = PHYS.radius * 2;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i],
        c = ps[j],
        dx = c.x - a.x,
        dy = c.y - a.y,
        d = Math.hypot(dx, dy);
      if (d >= r2 || d < 1e-6) continue;
      const push = (r2 - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      c.x += (dx / d) * push;
      c.y += (dy / d) * push;
    }
}

function moveBall(m, dt, events) {
  const b = m.ball;
  const sp = Math.hypot(b.vx, b.vy);
  b.px = b.x;
  if (sp > 0) {
    const grounded = b.z <= 0.02;
    const next = grounded
      ? Math.max(0, sp * Math.exp(-PHYS.friction * dt) - PHYS.drag * dt)
      : sp * Math.exp(-0.1 * dt);
    b.vx *= next / sp;
    b.vy *= next / sp;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.vz -= PHYS.gravity * dt;
  if (b.z <= 0) {
    b.z = 0;
    b.vz = b.vz < -2 ? -b.vz * 0.45 : 0;
  }
  const r = PHYS.ball;
  const inNet = Math.abs(b.x) > FIELD.halfL;
  // Touchlines: the fence.
  const wallY = inNet ? FIELD.goalHalf - r : FIELD.halfW - r;
  if (Math.abs(b.y) > wallY && (!inNet || m.phase === "goal")) {
    b.y = Math.sign(b.y) * wallY;
    b.vy = -b.vy * PHYS.bounce;
    events.push({ type: "bounce", hard: Math.abs(b.vy) > 4 });
  }
  if (m.phase === "goal") {
    const back = FIELD.halfL + FIELD.goalDepth - r;
    if (Math.abs(b.x) > back) {
      b.x = Math.sign(b.x) * back;
      b.vx = -b.vx * 0.2;
    }
    return;
  }
  if (Math.abs(b.x) > FIELD.halfL - r) {
    const mouth = Math.abs(b.y) < FIELD.goalHalf - r && b.z < FIELD.crossbar;
    if (mouth) {
      if (Math.abs(b.x) > FIELD.halfL + r) {
        const team = b.x > 0 ? 0 : 1;
        m.score[team]++;
        m.phase = "goal";
        m.phaseTime = GOAL_TIME;
        m.scorer = b.last && b.last.team === team ? b.last : null;
        m.scorer ??= { team, own: true };
        if (m.golden) m.endAfterGoal = true;
        b.owner = null;
        events.push({ type: "goal", team, scorer: b.last });
      }
    } else {
      const post = Math.abs(Math.abs(b.y) - FIELD.goalHalf) < r * 2;
      b.x = Math.sign(b.x) * (FIELD.halfL - r);
      b.vx = -b.vx * PHYS.bounce;
      b.shot = false;
      events.push({ type: "bounce", hard: Math.abs(b.vx) > 4, post });
    }
  }
}

// Picking up loose balls, saves and blocks.
function touches(m, events, input) {
  const b = m.ball;
  if (b.owner) return;
  const sp = Math.hypot(b.vx, b.vy);
  // Keepers first: they can dive for shots.
  for (const team of [0, 1]) {
    const k = keeperOf(m, team);
    if (k.stun > 0 || k.cooldown > 0) continue;
    const s = settingsFor(m, k);
    const d = dist(k, b);
    const dir = dirOf(team);
    const coming = b.vx * -dir > 3;
    const inBox =
      Math.abs(b.x - k.x) < FIELD.boxDepth && Math.abs(b.y) < FIELD.boxHalf;
    if (!inBox || b.z > FIELD.crossbar + 0.2) continue;
    if (d < PHYS.control + 0.1) {
      if (sp > 24 && m.rand() < 0.3) parry(m, k, events);
      else catchBall(m, k, events, b.shot);
      return;
    }
    // Judge a shot where it crosses the keeper's line: within arm's length
    // is a sure catch, further out a dive that gets less likely.
    // A shot from right on top of them (already past their line) is a
    // point-blank block.
    const crossed = (b.px - k.x) * (b.x - k.x) <= 0;
    const past = (b.x - k.x) * -dir > 0 && d < PHYS.control + s.keeperReach;
    if (coming && (crossed || past) && !b.tried.has(k.i)) {
      b.tried.add(k.i);
      const side = crossed ? Math.abs(b.y - k.y) : d;
      const reach = (side - PHYS.control) / s.keeperReach;
      const chance = 0.92 - 0.55 * reach - Math.max(0, sp - 20) * 0.015;
      if (reach < 1 && m.rand() < chance) {
        if (sp > 22 && m.rand() < 0.5) parry(m, k, events);
        else catchBall(m, k, events, true);
        return;
      }
      if (side < PHYS.control + s.keeperReach + 1) {
        k.stun = 0.6;
        events.push({ type: "dive", p: k, dir: Math.sign(b.y - k.y) });
      }
    }
  }
  if (b.z > 0.9) return;
  let best = null,
    bestD = PHYS.control;
  for (const p of m.players) {
    if (p.keeper || p.cooldown > 0 || p.stun > 0) continue;
    const reach = p.lunge > 0 ? PHYS.control + 0.3 : PHYS.control;
    const d = dist(p, b);
    if (d < reach && d < bestD + (p.lunge > 0 ? 0.3 : 0)) {
      best = p;
      bestD = d;
    }
  }
  if (!best) return;
  if (sp <= PHYS.trapSpeed || b.passTo === best) {
    const intercepted = b.last && b.last.team !== best.team;
    const shotBlock = b.shot && intercepted;
    b.owner = best;
    b.passTo = null;
    b.shot = false;
    best.protect = 0.35;
    best.carry = 0;
    best.lunge = 0;
    if (shotBlock) m.stats.saves[best.team]++;
    if (intercepted) m.stats.steals[best.team]++;
    events.push({ type: "trap", p: best, intercepted });
  } else {
    // Too fast to control: it cannons off.
    const a = Math.atan2(b.vy, b.vx) + (m.rand() - 0.5) * 1.6;
    const s = sp * 0.4;
    b.vx = Math.cos(a) * s;
    b.vy = Math.sin(a) * s;
    b.vz = 2;
    b.last = best;
    b.shot = false;
    b.passTo = null;
    best.cooldown = 0.3;
    events.push({ type: "block", p: best });
  }
}

function catchBall(m, k, events, save) {
  const b = m.ball;
  const s = settingsFor(m, k);
  b.owner = k;
  b.passTo = null;
  const wasShot = b.shot;
  b.shot = false;
  k.hold = s.keeperHold;
  k.protect = 99;
  if (wasShot) m.stats.saves[k.team]++;
  events.push({ type: "save", p: k, kind: "catch", shot: wasShot && save });
}

function parry(m, k, events) {
  const b = m.ball;
  const dir = dirOf(k.team);
  const s = Math.hypot(b.vx, b.vy) * 0.35;
  const a = (dir > 0 ? 0 : Math.PI) + (m.rand() - 0.5) * 2.2;
  b.vx = Math.cos(a) * s;
  b.vy = Math.sin(a) * s;
  b.vz = 3;
  b.last = k;
  b.shot = false;
  k.cooldown = 0.5;
  m.stats.saves[k.team]++;
  events.push({ type: "save", p: k, kind: "parry", shot: true });
}

function tackles(m, dt, events, input) {
  const b = m.ball;
  const owner = b.owner;
  for (const p of m.players) {
    if (!owner || owner.team === p.team || p.stun > 0 || owner.protect > 0) {
      p.tackle = Math.max(0, p.tackle - dt);
      continue;
    }
    if (p.keeper) {
      // Keepers only tackle in their own box.
      const dir = dirOf(p.team);
      if ((b.x + dir * FIELD.halfL) * dir > FIELD.boxDepth) continue;
    }
    const d = dist(p, b);
    const user = input && p.i === m.controlled;
    if (p.lunge > 0 && d < PHYS.control + 0.35) {
      steal(m, p, owner, events);
      return;
    }
    if (d < 0.85) {
      p.tackle += dt;
      const need = user ? m.opp.userTackle : settingsFor(m, p).tackleTime;
      if (p.tackle >= need) {
        steal(m, p, owner, events);
        return;
      }
    } else p.tackle = Math.max(0, p.tackle - dt);
  }
}

function steal(m, p, from, events) {
  const b = m.ball;
  b.owner = p;
  b.last = p;
  b.passTo = null;
  b.shot = false;
  from.stun = 0.6;
  from.carry = 0;
  p.protect = 0.7;
  p.tackle = 0;
  p.carry = 0;
  p.lunge = 0;
  if (p.keeper) {
    p.hold = settingsFor(m, p).keeperHold;
    p.protect = 99;
  }
  m.stats.steals[p.team]++;
  events.push({ type: "steal", p, from });
}

export const shotPower = (m) =>
  m.charge < 0 ? 0 : clamp(0.35 + (0.65 * m.charge) / PHYS.charge, 0.35, 1);
