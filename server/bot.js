import { sprinklersBot } from "./sprinklers.js";
// The solo opponent's mind. It gets what a player gets: a field of view, so
// it can't see behind itself; footsteps heard by how loud they are; and its
// own side's alerts (sensors, wires, camera tags, terminal activity). It
// notices you over a moment, faster up close and in the middle of its view,
// slower when you crouch, lie down or keep still, and acts on what it knows.
import { CONFIG, OBJECTIVES, SPAWNS, wetRule } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { distance, clearSight, clearShot } from "../shared/map.js";
import { freeDecoyPoint, decoyPath } from "../shared/decoy.js";
import { eyeHeight } from "../shared/movement.js";
import { THROW_GRAVITY, LOFT } from "../shared/throwing.js";
import { baseOf, isDecoy, isPortable } from "../shared/variants.js";
import { PARTY, lightsPulse } from "../shared/party.js";
import { breakoutBot } from "./breakout.js";
import { bouldersBot } from "./boulders.js";
import { livewireBot } from "./livewire.js";

// fov: half-angle of view (degrees); notice: time to notice, times; hearing:
// how far footsteps carry, times; turn: rad/s when reacting; reaction: s from
// seeing you to the first shot; aim: degrees off a shot may be; cameras:
// share of watches spent on a camera feed; tricks: smoke and hiding.
export const BOT_LEVELS = {
  easy: {
    name: "Easy",
    fov: 40,
    notice: 1.7,
    hearing: 0.7,
    turn: 1.8,
    reaction: 1.4,
    cameras: 0,
    tricks: false,
  },
  normal: {
    name: "Normal",
    fov: 55,
    notice: 1,
    hearing: 1,
    turn: 2.8,
    reaction: 1,
    cameras: 0.3,
    tricks: true,
  },
  hard: {
    name: "Hard",
    fov: 70,
    notice: 0.65,
    hearing: 1.35,
    turn: 4,
    reaction: 0.7,
    cameras: 0.6,
    tricks: true,
  },
};
// How far footsteps carry (m), before the level's hearing.
export const HEARING = { sprint: 22, walk: 12, crouch: 5, crawl: 2.5 };
const SIGHT = 36,
  DEG = Math.PI / 180,
  clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)),
  yawTo = (p, t) => Math.atan2(-(t.x - p.x), -(t.z - p.z));

export function runBot(m, p, dt) {
  p.input = {};
  if (m.phase !== "active") return;
  const level = BOT_LEVELS[m.botLevel] || BOT_LEVELS.normal;
  p.brain ??= { aware: {}, task: null };
  const brain = p.brain;
  // Bots plan straight through doors, so they open any shut one they reach.
  const door = m.doorNear(p, 1.2, true);
  if (door && !m.openDoors.has(door.pieceIndex)) m.toggleDoor(door, p);
  if (p.camera && !(brain.task?.kind === "camera")) p.camera = null;
  // Party minigames: the hider or builder just watches; the sweeper hunts
  // devices and the runner races for the terminal.
  // Lights Out's guard is a sentinel like any other, only in the dark (see
  // noticeTime).
  const darkGuard = m.party?.kind === "lightsout" && p.team === "defender";
  if (m.party?.kind === "boulders") {
    bouldersBot(m, p, brain);
    return;
  }
  if (m.party?.kind === "sprinklers") return sprinklersBot(m, p);
  if (m.party?.kind === "livewire") {
    livewireBot(m, p, brain);
    return;
  }
  if (m.party?.kind === "breakout") {
    breakoutBot(m, p, dt, level, brain);
    return;
  }
  if (m.party?.kind === "hotpotato") {
    potatoBot(m, p, dt, level, brain);
    watchStuck(p, dt, brain);
    return;
  }
  if (m.party && !darkGuard) {
    if (p.team === "attacker" && m.party.kind === "sweep")
      sweeper(m, p, dt, level, brain);
    else if (p.team === "attacker") runner(m, p, dt, brain, sneaking(m, p));
    else turn(p, p.yaw + 1, 0.4, dt);
    watchStuck(p, dt, brain);
    return;
  }
  const sense = perceive(m, p, dt, level, brain);
  brain.alert = sense.spotted ? "!" : sense.glimpse ? "?" : null;
  if (wetRule(m.rule) && runAway(m, p, dt, brain)) return;
  if (wetRule(m.rule) && lobBalloon(m, p, dt, level, sense)) return;
  usePortables(m, p, brain);
  if (p.team === "defender") sentinel(m, p, dt, level, brain, sense);
  else infiltrator(m, p, dt, level, brain, sense);
  watchStuck(p, dt, brain);
}

// --- Senses ---------------------------------------------------------------

const opponents = (m, p) =>
  [...Object.values(m.players), ...m.decoys.filter((d) => d.active)].filter(
    (q) => q.team !== p.team && q.alive,
  );
// Seconds of plain view p needs to notice q, or Infinity if p can't see q.
function noticeTime(m, p, q, level) {
  if (p.blind > 0 || p.camera) return Infinity;
  const d = distance(p, q);
  // Lights Out: the guard sees only close up, or while a pulse is lit.
  if (
    m.party?.kind === "lightsout" &&
    p.team === "defender" &&
    lightsPulse(m.activeTime || 0) < 0.5 &&
    d > PARTY.lightsout.darkSight
  )
    return Infinity;
  if (d > SIGHT || (q.cloak > 0 && d > 6)) return Infinity;
  const eye = m.eye(p),
    parts = m
      .bodyPoints(q)
      .filter(
        (t) =>
          m.inCone(p, t, level.fov * DEG) &&
          clearSight(eye, t, m.smokes, p.team),
      );
  if (!parts.length) return Infinity;
  return (
    level.notice *
    (0.35 + d / 18) *
    (q.prone ? 2 : q.crouch ? 1.3 : 1) *
    ((q.moveSpeed || 0) < 0.05 ? 1.5 : 1) *
    (m.inCone(p, parts[0], 15 * DEG) ? 0.7 : 1) *
    (q.cloak > 0 ? 3 : 1) *
    // Only a head over cover is harder to pick out than a whole body.
    (1 + (4 - parts.length) * 0.25)
  );
}
// Who p sees and how sure it is: awareness of each opponent rises while in
// view and fades out of it. A glimpse is half noticed; spotted is certain.
function perceive(m, p, dt, level, brain) {
  let spotted = null,
    glimpse = null,
    visible = null;
  for (const q of opponents(m, p)) {
    const time = noticeTime(m, p, q, level),
      was = brain.aware[q.id] || 0,
      aware = clamp(time < Infinity ? was + dt / time : was - dt * 0.3, 0, 1.2);
    brain.aware[q.id] = aware;
    if (time === Infinity) continue;
    if (!visible || distance(p, q) < distance(p, visible)) visible = q;
    if (aware >= 1 && (!spotted || distance(p, q) < distance(p, spotted)))
      spotted = q;
    else if (aware >= 0.3 && !glimpse) glimpse = q;
  }
  const now = m.clock || 0;
  if (spotted) {
    const last = brain.seen?.id === spotted.id ? brain.seen : null,
      gap = last ? Math.max(dt, now - last.at) : 0;
    brain.seen = {
      id: spotted.id,
      x: spotted.x,
      z: spotted.z,
      // Which way they were heading, to guess where they went.
      vx: last ? (spotted.x - last.x) / gap : 0,
      vz: last ? (spotted.z - last.z) / gap : 0,
      at: now,
    };
  }
  return { spotted, glimpse, visible };
}
// The loudest thing p can hear from the other side: footsteps, noisemakers,
// doors and balloons. Where it is comes with an error that grows with range.
function listen(m, p, level, brain) {
  let best = null;
  const hear = (src, range) => {
    const d = distance(p, src);
    if (d < range && (!best || d / range < best.d / best.range))
      best = { x: src.x, z: src.z, d, range };
  };
  for (const q of opponents(m, p))
    if (HEARING[q.noise]) hear(q, HEARING[q.noise] * level.hearing);
  for (const n of [...m.noises, ...(m.splashes || [])])
    if (n.team !== p.team) hear(n, n.range);
  if (!best) return null;
  const now = m.clock || 0,
    old = brain.heard;
  // Keep the guess while the sound stays put, so it doesn't jitter.
  if (
    old &&
    now - old.at < 1 &&
    Math.hypot(old.tx - best.x, old.tz - best.z) < 2
  )
    return (brain.heard = { ...old, at: now });
  const miss = best.d * 0.12,
    angle = Math.random() * Math.PI * 2;
  return (brain.heard = {
    tx: best.x,
    tz: best.z,
    x: best.x + Math.cos(angle) * miss,
    z: best.z + Math.sin(angle) * miss,
    d: best.d,
    at: now,
  });
}
// Opponents your side's gadgets are showing right now (sensors, wires,
// camera tags, pulses): their exact position.
function revealed(m, p) {
  const ids = Object.keys(m.reveals[p.team] || {});
  return opponents(m, p)
    .filter((q) => ids.includes(String(q.id)))
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
}
// Whether `watcher` is looking p's way with a clear view: what a player
// reads off a sentinel's model.
function watching(m, watcher, p) {
  if (watcher.blind > 0) return false;
  const eye = m.eye(watcher);
  return m
    .bodyPoints(p)
    .some(
      (t) =>
        m.inCone(watcher, t, 40 * DEG) &&
        clearSight(eye, t, m.smokes, watcher.team),
    );
}

// --- Moving and looking ---------------------------------------------------

function turn(p, yaw, rate, dt) {
  const delta = wrap(yaw - p.yaw);
  p.yaw = wrap(p.yaw + clamp(delta, -rate * dt, rate * dt));
  return Math.abs(delta);
}
function lookAt(m, p, t, rate, dt) {
  const off = turn(p, yawTo(p, t), rate, dt),
    pitch = Math.atan2(
      (t.y ?? m.eye(p).y) - m.eye(p).y,
      Math.max(0.5, distance(p, t)),
    );
  p.pitch += clamp(pitch - p.pitch, -rate * dt, rate * dt);
  return off;
}
// Walk (or run, or sneak) toward a point, around walls, facing the way.
// pace: "patrol" (unhurried walk), "walk", "run" or "sneak" (crouched).
function moveTo(m, p, goal, dt, pace = "walk") {
  if (m.botStill(p)) return void turn(p, yawTo(p, goal), 3, dt);
  const next = m.botStep(p, goal, dt),
    off = turn(p, yawTo(p, next), 7, dt);
  p.pitch *= 0.9;
  // Turn first on a sharp bend rather than drift wide.
  const ahead = off > 1 ? 0.15 : 1;
  p.input.forward = (pace === "patrol" ? 0.6 : 1) * ahead;
  p.input.sprint = pace === "run";
  p.input.crouch = pace === "sneak";
}
// Pressed against something: replan, hop, then give up on the task.
function watchStuck(p, dt, brain) {
  const at = { x: p.x, z: p.z },
    trying = (p.input.forward || 0) > 0.5;
  if (!trying || !brain.lastAt || distance(at, brain.lastAt) > 0.4 * dt) {
    brain.stuck = 0;
  } else brain.stuck = (brain.stuck || 0) + dt;
  brain.lastAt = at;
  if (brain.stuck > 1 && brain.stuck - dt <= 1) {
    p.path = null;
    p.input.jump = true;
  }
  if (brain.stuck > 3) {
    brain.stuck = 0;
    brain.task = null;
    p.path = null;
  }
}
// The nearest open floor to a point (spawn rooms and posts sit by walls).
function openNear(pt) {
  if (freeDecoyPoint(pt)) return { x: pt.x, z: pt.z };
  for (let r = 0.5; r <= 3; r += 0.5)
    for (let a = 0; a < 8; a++) {
      const c = {
        x: pt.x + Math.cos((a * Math.PI) / 4) * r,
        z: pt.z + Math.sin((a * Math.PI) / 4) * r,
      };
      if (freeDecoyPoint(c)) return c;
    }
  return { x: pt.x, z: pt.z };
}
// A spot near p that `threat` can't see into, and still can't after
// stepping a few metres closer, preferring short walks that gain distance.
function hidingSpot(m, p, threat) {
  const team = threat.team || "defender",
    eye = { x: threat.x, y: (threat.y || 0) + 1.6, z: threat.z },
    toward = Math.hypot(p.x - eye.x, p.z - eye.z) || 1,
    step = Math.min(3, toward / 2),
    nearer = {
      ...eye,
      x: eye.x + ((p.x - eye.x) / toward) * step,
      z: eye.z + ((p.z - eye.z) / toward) * step,
    };
  // Out of sight first (cheap), then walk only the likeliest few.
  const spots = [];
  for (const r of [3, 5, 7, 9.5, 12])
    for (let a = 0; a < 16; a++) {
      const c = {
        x: p.x + Math.cos((a * Math.PI) / 8) * r,
        z: p.z + Math.sin((a * Math.PI) / 8) * r,
        r,
      };
      if (!freeDecoyPoint(c)) continue;
      const head = { x: c.x, y: 1.2, z: c.z };
      if (
        clearSight(eye, head, m.smokes, team) ||
        clearSight(nearer, head, m.smokes, team)
      )
        continue;
      // Getting further from them is worth some extra walking.
      c.score = r - (distance(c, threat) - distance(p, threat)) * 0.8;
      spots.push(c);
    }
  let best = null;
  for (const c of spots.sort((a, b) => a.score - b.score).slice(0, 6)) {
    const route = decoyPath(p, c, 1500);
    if (!route) continue;
    const length = route.reduce(
      (sum, q, i) => sum + distance(i ? route[i - 1] : p, q),
      0,
    );
    if (length > c.r * 2) continue;
    const score = c.score + length - c.r;
    if (!best || score < best.score) best = { x: c.x, z: c.z, score };
  }
  return best;
}

// --- Gadgets and water balloons -------------------------------------------

function equipAnd(m, p, kind, act) {
  const held = p.equipped;
  p.equipped = kind;
  act();
  p.equipped = held;
}
// Cloak when there's someone about or the objective is close; a jammer
// burst at a terminal or beside a marked camera or sensor. In training both
// go off whenever they're ready, so you can practise against them.
function usePortables(m, p, brain) {
  if (p.cloak > 0) return;
  const now = m.clock || 0,
    always = m.training,
    danger = brain.threat && now - brain.threat.at < 6,
    near = OBJECTIVES.some((o) => distance(p, o) < 12),
    bugged = m.gadgets.some(
      (g) =>
        g.active &&
        g.team !== p.team &&
        g.marked &&
        ["camera", "sensor"].includes(baseOf(g.kind)) &&
        distance(p, g) < 10,
    );
  const ready = (k) => p.inventory[k] && !(p.cooldowns[k] > 0);
  if (ready("cloak") && (always || danger || near))
    equipAnd(m, p, "cloak", () => m.use(p));
  else if (
    ready("jammerPortable") &&
    (always || bugged || (near && p.capture > 0))
  )
    equipAnd(m, p, "jammerPortable", () => m.use(p));
}
// Just splashed: run off from whoever threw it, somewhere they can't see
// (or just away), until the moment passes. True while running.
function runAway(m, p, dt, brain) {
  const now = m.clock || 0;
  if (!(p.fleeUntil > now) || !p.fleeFrom) return false;
  if (brain.fleeing !== p.fleeUntil) {
    brain.fleeing = p.fleeUntil;
    const away = Math.hypot(p.x - p.fleeFrom.x, p.z - p.fleeFrom.z) || 1;
    brain.fleeTo =
      hidingSpot(m, p, p.fleeFrom) ||
      openNear({
        x: p.x + ((p.x - p.fleeFrom.x) / away) * 8,
        z: p.z + ((p.z - p.fleeFrom.z) / away) * 8,
      });
    p.path = null;
  }
  moveTo(m, p, brain.fleeTo, dt, "run");
  watchStuck(p, dt, brain);
  return true;
}
// The pitch that drops a balloon on `target` (chest high, or at `y`) from
// p, or null if it's out of reach. The lower of the two arcs that get there.
function balloonPitch(m, p, target, y = target.y + 1) {
  const v2 = THROW_GRAVITY * CONFIG.balloonRange,
    g = THROW_GRAVITY,
    d = Math.max(0.5, distance(p, target)),
    dy = y - (m.eye(p).y - 0.15),
    root = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  if (root < 0) return null;
  return Math.atan((v2 - Math.sqrt(root)) / (g * d)) - LOFT;
}
// Splash (kid-friendly) bots are gentler than Soak ones: they take this
// many times the level's reaction to throw, and wait this long (s) between
// balloons.
const SPLASH_REACTION = 2,
  SPLASH_GAP = 2,
  SOAK_REACTION = 1,
  SOAK_GAP = 1;
// Splash: throw at where they stand now (no leading, so moving dodges it),
// once they've been in view for the reaction time. True while throwing; out
// of reach, it goes on with whatever else it was doing.
function lobBalloon(m, p, dt, level, sense) {
  p.brain.lobWait = Math.max(0, (p.brain.lobWait || 0) - dt);
  const target = sense.visible;
  if (!target || p.weaponTarget !== target.id) p.weaponSightTime = 0;
  p.weaponTarget = target?.id ?? null;
  if (!target) return false;
  p.weaponSightTime = (p.weaponSightTime || 0) + dt;
  if ((p.brain.aware[target.id] || 0) < 0.3) return false;
  const pitch = balloonPitch(m, p, target);
  if (pitch === null) return false;
  const off = turn(p, yawTo(p, target), level.turn, dt);
  p.pitch += clamp(pitch - p.pitch, -level.turn * dt, level.turn * dt);
  if (
    p.weaponSightTime >=
      level.reaction * (m.kid ? SPLASH_REACTION : SOAK_REACTION) &&
    !p.brain.lobWait &&
    off < 3 * DEG &&
    Math.abs(p.pitch - pitch) < 0.02
  ) {
    equipAnd(m, p, "balloon", () => m.attack(p, true));
    p.brain.lobWait = m.kid ? SPLASH_GAP : SOAK_GAP;
  }
  return true;
}
// Lob a smoke between p and the threat.
function throwSmoke(m, p, threat) {
  if (!(p.inventory.smoke > 0) || p.cooldowns.smoke > 0) return false;
  const d = distance(p, threat);
  p.yaw = yawTo(p, threat);
  // Short and flat close in; a higher lob for a far sentinel.
  p.pitch = clamp(-0.45 + d * 0.025, -0.45, 0.2);
  equipAnd(m, p, "smoke", () => m.use(p));
  return true;
}

// --- Sentinel ---------------------------------------------------------------

// Where a sentinel keeps watch: by each terminal (or the flag), and at the
// infiltrator routes' points near them, each with the ways in to watch.
const postCache = new Map();
function posts(m) {
  // Plant & defend leaves some terminals out, so they're cached apart.
  const key = `${m.map}:${OBJECTIVES.map((o) => o.id).join()}`;
  if (postCache.has(key)) return postCache.get(key);
  const routes = MAPS[m.map].botRoutes || [],
    vias = routes.flatMap((r) => r.points || r.vias || []),
    list = [];
  const add = (pt, site) => {
    const at = openNear(pt);
    if (list.some((q) => distance(q, at) < 5)) return;
    // Watch toward the route points that lead in, or toward their spawn.
    const ins = vias
      .filter((v) => distance(v, at) > 3 && distance(v, at) < 22)
      .map((v) => yawTo(at, v));
    const yaws = ins.length ? ins : [yawTo(at, SPAWNS.attacker)];
    list.push({ ...at, site, yaws: [...new Set(yaws)].slice(0, 4) });
  };
  for (const o of OBJECTIVES)
    add({ x: o.x, z: o.z + (o.terminal ? 2.5 : 0) }, o.id);
  for (const v of vias)
    if (OBJECTIVES.some((o) => distance(o, v) < 20)) add(v, null);
  postCache.set(key, list);
  return list;
}
function nextPost(m, brain) {
  const all = posts(m),
    recent = brain.visited || [],
    // A terminal whose data is already out needs no guarding; the others
    // count double: that's what they're there to guard.
    live = all.filter(
      (q) =>
        !q.site ||
        // A party game's one terminal is the only one worth guarding.
        (m.party?.site
          ? q.site === m.party.site
          : !m.extracted.includes(q.site)),
    ),
    pool = live
      .filter((q) => !recent.includes(q))
      .flatMap((q) => (q.site ? [q, q] : [q]));
  const pick = pool[Math.floor(Math.random() * pool.length)] || live[0];
  brain.visited = [pick, ...recent].slice(0, Math.min(2, live.length - 1));
  return pick;
}
function sentinel(m, p, dt, level, brain, sense) {
  const now = m.clock || 0;
  if (m.uplink && pullUplink(m, p, dt, level, brain, sense)) return;
  if (sense.spotted) return engage(m, p, dt, level, brain, sense.spotted);
  // A lead is the freshest clue of where they are.
  const lead = (x, z, why, urgent = false) => {
    brain.lead = { x, z, why, urgent, at: now };
  };
  const shown = revealed(m, p);
  if (shown) lead(shown.x, shown.z, "revealed", true);
  if (sense.glimpse) {
    // Something moved over there: stop and look properly.
    lead(sense.glimpse.x, sense.glimpse.z, "glimpse");
    brain.task = null;
    lookAt(m, p, m.eye(sense.glimpse), level.turn, dt);
    return;
  }
  const heard = listen(m, p, level, brain);
  if (heard) lead(heard.x, heard.z, "heard", heard.d > 15);
  if (m.botFocus?.until > now && m.botFocus.until !== brain.answered) {
    const site = OBJECTIVES.find((o) => o.id === m.botFocus.site);
    if (site) lead(site.x, site.z + 2, "terminal", true);
    brain.answered = m.botFocus.until;
  }
  // Lost sight of them: where they were heading.
  if (brain.seen && now - brain.seen.at < 0.2) {
    const ahead = 1.5;
    lead(
      brain.seen.x + clamp(brain.seen.vx, -6, 6) * ahead,
      brain.seen.z + clamp(brain.seen.vz, -6, 6) * ahead,
      "lost",
      true,
    );
  }
  const fresh =
    brain.lead &&
    now - brain.lead.at < 12 &&
    brain.lead.at > (brain.cleared ?? -1);
  if (fresh) {
    const point = openNear(brain.lead);
    if (
      brain.task?.kind !== "investigate" ||
      distance(brain.task.point, point) > 2.5
    ) {
      brain.task = { kind: "investigate", point, urgent: brain.lead.urgent };
      p.path = null;
    }
    brain.task.urgent ||= brain.lead.urgent;
  }
  // Its post was a terminal that's just been lost: off to another.
  if (m.extracted.includes(brain.task?.post?.site)) brain.task = null;
  const task = (brain.task ??= { kind: "patrol", post: nextPost(m, brain) });
  if (task.kind === "investigate") {
    moveTo(
      m,
      p,
      task.point,
      dt,
      task.urgent && distance(p, task.point) > 6 ? "run" : "walk",
    );
    if (distance(p, task.point) < 1.5) {
      brain.cleared = now;
      brain.task = search(task.point, now);
    }
  } else if (task.kind === "search") {
    const step = task.steps[0];
    if (!step || now > task.until) {
      brain.task = null;
    } else if (step.look) {
      step.at ??= now;
      // Look all the way round, in three stops.
      turn(
        p,
        step.yaw + Math.floor((now - step.at) / 0.8) * 2.1,
        level.turn,
        dt,
      );
      p.pitch *= 0.9;
      if (now - step.at > 2.4) task.steps.shift();
    } else {
      moveTo(m, p, step, dt, "walk");
      if (distance(p, step) < 1) task.steps.shift();
    }
  } else if (task.kind === "camera") {
    // Watching a feed: the bot's own eyes see nothing meanwhile.
    const cam = m.gadgets.find((g) => g.id === task.camera && g.active);
    if (!cam || cam.jammed || now > task.until) {
      p.camera = null;
      brain.task = { kind: "patrol", post: task.post, held: now };
    } else p.camera = cam.id;
  } else {
    // Told to hold still: keep facing as it is until something happens.
    if (m.botStill(p)) return;
    const post = task.post;
    if (task.held === undefined && distance(p, post) > 1.2) {
      moveTo(m, p, post, dt, "patrol");
      return;
    }
    task.held ??= now;
    task.stay ??= 3.5 + Math.random() * 3;
    const watched = now - task.held,
      yaws = post.yaws;
    // Turn between the ways in, a second and a half on each.
    turn(
      p,
      yaws[Math.floor(watched / 1.5) % yaws.length],
      level.turn * 0.6,
      dt,
    );
    p.pitch *= 0.9;
    const cams = m.gadgets.filter(
      (g) =>
        g.active &&
        g.team === p.team &&
        baseOf(g.kind) === "camera" &&
        !isDecoy(g.kind) &&
        !g.jammed,
    );
    if (watched > task.stay) {
      if (cams.length && !task.watchedCam && Math.random() < level.cameras)
        brain.task = {
          kind: "camera",
          camera: cams[Math.floor(Math.random() * cams.length)].id,
          until: now + 3,
          post,
          watchedCam: true,
        };
      else brain.task = { kind: "patrol", post: nextPost(m, brain) };
    }
  }
}
// Plant & defend: an uplink is live, so get to it and pull it. Anyone in
// sight comes first, unless the pull is nearly done.
function pullUplink(m, p, dt, level, brain, sense) {
  const site = OBJECTIVES.find((o) => o.id === m.uplink.site);
  if (!site) return false;
  brain.task = null;
  p.camera = null;
  // Work it from its open side nearest where the bot heard about it.
  if (brain.pull?.site !== site.id) {
    const sides = [
      [0, 1.3],
      [0, -1.3],
      [1.25, 0],
      [-1.25, 0],
    ]
      .map(([dx, dz]) => ({ x: site.x + dx, z: site.z + dz }))
      .filter((c) => freeDecoyPoint(c))
      .sort((a, b) => distance(p, a) - distance(p, b));
    brain.pull = {
      site: site.id,
      spot: sides[0] || openNear({ x: site.x, z: site.z + 1.3 }),
    };
    p.path = null;
  }
  const working = distance(p, site) < CONFIG.captureRadius - 0.6,
    nearly = m.uplink.defuse > CONFIG.defuseSeconds * 0.7;
  if (sense.spotted && !(working && nearly)) {
    engage(m, p, dt, level, brain, sense.spotted);
    return true;
  }
  if (!working) {
    moveTo(
      m,
      p,
      brain.pull.spot,
      dt,
      distance(p, brain.pull.spot) > 4 ? "run" : "walk",
    );
    return true;
  }
  p.input.interact = true;
  // Keep an eye out while pulling it: on whatever caught its eye, or on
  // footsteps, or toward where the infiltrators come from.
  const heard = listen(m, p, level, brain),
    watch = sense.spotted
      ? m.eye(sense.spotted)
      : sense.glimpse
        ? m.eye(sense.glimpse)
        : heard
          ? { x: heard.x, y: 1.4, z: heard.z }
          : { ...SPAWNS.attacker, y: 1.4 };
  lookAt(m, p, watch, level.turn * (sense.glimpse ? 1 : 0.6), dt);
  return true;
}
// Look around where the clue was, then check two spots nearby.
function search(center, now) {
  const steps = [{ look: true, yaw: Math.random() * Math.PI * 2 }];
  for (let tries = 0; tries < 12 && steps.length < 5; tries++) {
    const a = Math.random() * Math.PI * 2,
      r = 3 + Math.random() * 4,
      c = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
    if (freeDecoyPoint(c) && decoyPath(center, c, 1500))
      steps.push(c, { look: true, yaw: a });
  }
  return { kind: "search", steps, until: now + 16 };
}
// Eyes on the intruder: keep them in view (that's what identifies them in
// Seen), close in to capture (Removed), or follow and keep looking.
function engage(m, p, dt, level, brain, target) {
  brain.task = null;
  p.camera = null;
  lookAt(m, p, m.eye(target), level.turn, dt);
  const d = distance(p, target);
  if (m.botStill(p)) return;
  if (m.rule === "removed") {
    moveTo(m, p, target, dt, "run");
    lookAt(m, p, m.eye(target), level.turn, dt);
  } else if (d > 12 && m.inCone(p, m.eye(target), 6 * DEG)) {
    // Ease closer while keeping them centred.
    p.input.forward = 0.4;
  }
}

// --- Infiltrator ------------------------------------------------------------

function infiltrator(m, p, dt, level, brain, sense) {
  if (m.botStill(p)) return;
  const now = m.clock || 0,
    // A player clocks a sentinel on screen almost at once.
    seen =
      sense.visible && (brain.aware[sense.visible.id] || 0) >= 0.15
        ? sense.visible
        : null;
  // What it knows of the sentinel: seen, shown by a pulse, or heard.
  if (seen)
    brain.threat = {
      x: seen.x,
      y: seen.y,
      z: seen.z,
      at: now,
      seen,
      eyes: true,
    };
  else {
    const shown = revealed(m, p);
    if (shown) brain.threat = { x: shown.x, y: shown.y, z: shown.z, at: now };
    else {
      const heard = listen(m, p, level, brain);
      if (
        heard &&
        heard.d < 16 &&
        !(brain.threat?.eyes && now - brain.threat.at < 2)
      )
        brain.threat = { x: heard.x, y: 0, z: heard.z, at: now };
    }
  }
  // That terminal's data is out: on to the nearest one still standing.
  if (m.extracted.includes(OBJECTIVES[p.goal % OBJECTIVES.length]?.id)) {
    p.goal = otherGoal(m, p);
    p.direct = true;
    p.path = null;
  }
  const threat =
      brain.threat && now - brain.threat.at < 6 ? brain.threat : null,
    plan = m.botPlan(p),
    site = plan.site,
    need = m.plantMode
      ? CONFIG.plantSeconds
      : site.terminal
        ? CONFIG.terminalSeconds
        : CONFIG.captureSeconds,
    done = (m.plantMode ? p.capture : m.progress[site.id] || 0) / need,
    atSite = distance(p, site) < (site.terminal ? 1.6 : 1);
  const looked = seen && watching(m, seen, p);
  // Nearly there: finish the job rather than run.
  const gamble = atSite && done > 0.85;
  if (looked && !gamble && brain.task?.kind !== "hide") {
    if (level.tricks && distance(p, seen) < 22) throwSmoke(m, p, seen);
    takeCover(m, p, brain, seen, now, true);
  }
  // Someone closing in on the terminal: back off and come back later.
  if (
    atSite &&
    threat &&
    !gamble &&
    distance(threat, p) < 10 &&
    brain.task?.kind !== "hide" &&
    level.tricks
  )
    takeCover(m, p, brain, threat, now, false);
  // Seen on the way: that spot's no good from where they are now.
  if (
    looked &&
    brain.task?.kind === "hide" &&
    !brain.task.arrived &&
    now - brain.task.since > 1
  ) {
    brain.task.since = now;
    takeCover(m, p, brain, seen, now, true);
  }
  const task = brain.task;
  if (task?.kind === "hide") {
    if (distance(p, task.point) > 0.8 && !task.arrived) {
      moveTo(m, p, task.point, dt, task.run ? "run" : "sneak");
      return;
    }
    task.arrived = true;
    p.input.crouch = true;
    if (threat) lookAt(m, p, { ...threat, y: 1.6 }, level.turn, dt);
    // Found again, or they're coming this way: somewhere further off.
    const closing = threat && distance(threat, p) < 7;
    if ((looked || closing) && now - task.since > 1) {
      brain.task = null;
      takeCover(m, p, brain, threat, now, true);
    } else if (now > task.until) {
      brain.task = null;
      // Take another way in, and maybe another terminal if they were by it.
      p.direct = true;
      p.path = null;
      if (distance(task.threat, site) < 14) p.goal = otherGoal(m, p);
    }
    return;
  }
  // They're in view but looking elsewhere: freeze low until they turn away
  // or move off, unless the terminal's nearly done.
  if (seen && !looked && distance(p, seen) < 18 && !atSite) {
    brain.frozen ??= now;
    if (now - brain.frozen < 5) {
      p.input.crouch = true;
      lookAt(m, p, m.eye(seen), level.turn, dt);
      return;
    }
  } else brain.frozen = undefined;
  if (m.uplink) return guardUplink(m, p, dt, level, brain, threat);
  if (atSite) {
    p.input.interact = true;
    p.input.crouch = !!threat;
    // Keep an eye on the way they'd come.
    const from = threat || brain.watchFrom || SPAWNS.defender;
    lookAt(m, p, { ...from, y: m.eye(p).y }, 2, dt);
    return;
  }
  const near = distance(p, site) < 12,
    pace = (threat && distance(p, threat) < 16) || near ? "sneak" : "walk";
  if (hopWires(m, p, dt, brain, site)) return;
  if (p.direct) {
    moveTo(m, p, plan.points.at(-1), dt, pace);
    return;
  }
  p.waypoint ??= 0;
  const target = plan.points[p.waypoint];
  if (
    distance(p, target) < (target.radius ?? 0.7) &&
    p.waypoint < plan.points.length - 1
  ) {
    p.waypoint++;
    p.path = null;
  }
  if (plan.vias) moveTo(m, p, plan.points[p.waypoint], dt, pace);
  else {
    const next = plan.points[p.waypoint];
    turn(p, yawTo(p, next), 7, dt);
    p.input.forward = 1;
    p.input.crouch = pace === "sneak";
  }
}
// Plant & defend: once planted, wait it out at a lookout near the terminal.
// Under Shoot rules it holds an angle on the terminal, to catch whoever
// comes to pull it; otherwise there's no stopping a pull, so it keeps out of
// the terminal's view instead.
function guardUplink(m, p, dt, level, brain, threat) {
  const site = OBJECTIVES.find((o) => o.id === m.uplink.site);
  if (!site) return;
  if (brain.lookout?.site !== site.id)
    brain.lookout = { site: site.id, ...lookoutFor(m, p, site) };
  const spot = brain.lookout;
  if (distance(p, spot) > 0.8) {
    moveTo(m, p, spot, dt, threat ? "sneak" : "walk");
    return;
  }
  p.input.crouch = true;
  const aim =
    m.rule === "soak"
      ? { x: site.x, y: 1.3, z: site.z }
      : threat
        ? { ...threat, y: 1.6 }
        : { ...SPAWNS.defender, y: 1.6 };
  lookAt(m, p, aim, level.turn * 0.6, dt);
}
// A lookout within about 12 m of the planted terminal that the bot can
// reach: in crouched view of the terminal for Soak, out of it otherwise.
// Spots further from the sentinels' side score better; a little chance
// keeps it from always picking the same one.
function lookoutFor(m, p, site) {
  const want = m.rule === "soak",
    top = { x: site.x, y: 1.3, z: site.z },
    spots = [];
  for (const r of [5, 7, 9, 11.5])
    for (let a = 0; a < 16; a++) {
      const c = {
        x: site.x + Math.cos((a * Math.PI) / 8) * r,
        z: site.z + Math.sin((a * Math.PI) / 8) * r,
      };
      if (!freeDecoyPoint(c)) continue;
      const sees = clearSight({ ...c, y: 0.8 }, top, [], p.team);
      if (sees !== want) continue;
      c.score = distance(c, SPAWNS.defender) + Math.random() * 6;
      spots.push(c);
    }
  for (const c of spots.sort((a, b) => b.score - a.score).slice(0, 6))
    if (decoyPath(p, c, 1500)) return { x: c.x, z: c.z };
  return openNear({ x: site.x, z: site.z + 6 });
}
// The nearest objective other than the bot's current one that hasn't been
// extracted yet (or its current one, if that's all that's left).
function otherGoal(m, p) {
  // The Gauntlet has just the one terminal.
  if (m.party?.site) return OBJECTIVES.findIndex((o) => o.id === m.party.site);
  const current = p.goal % OBJECTIVES.length,
    left = OBJECTIVES.map((o, i) => ({ o, i })).filter(
      ({ o, i }) => i !== current && !m.extracted.includes(o.id),
    );
  if (!left.length) return current;
  return left.reduce((a, b) => (distance(p, b.o) < distance(p, a.o) ? b : a)).i;
}
function takeCover(m, p, brain, threat, now, run) {
  const spot = hidingSpot(m, p, threat);
  if (!spot) return;
  brain.task = {
    kind: "hide",
    point: spot,
    run,
    since: now,
    until: now + 3 + Math.random() * 3,
    threat: { x: threat.x, z: threat.z },
  };
  p.path = null;
}
// A tripwire it has marked on the way: jump a low one at a run; a high one
// can't be crossed, so try the other terminal (or straight there).
function hopWires(m, p, dt, brain, site) {
  for (const g of m.gadgets) {
    if (!g.active || !g.marked || !g.b || g.team === p.team) continue;
    if (baseOf(g.kind) !== "tripwire") continue;
    const ax = g.b.x - g.x,
      az = g.b.z - g.z,
      len = Math.hypot(ax, az) || 1,
      // Signed distance from the wire's line, and whether we're heading at it.
      side = ((p.x - g.x) * az - (p.z - g.z) * ax) / len,
      along = ((p.x - g.x) * ax + (p.z - g.z) * az) / len,
      heading =
        ((-Math.sin(p.yaw) * az + Math.cos(p.yaw) * ax) / len) *
        -Math.sign(side);
    if (along < -0.6 || along > len + 0.6) continue;
    if (Math.abs(side) > 2.6 || heading < 0.5) continue;
    // Is the place we're going on the far side?
    const goal = p.path?.[0] || site,
      far = ((goal.x - g.x) * az - (goal.z - g.z) * ax) / len;
    if (Math.sign(far) === Math.sign(side)) continue;
    const top = Math.max(g.y, g.b.y);
    if (top <= 0.5) {
      p.input.forward = 1;
      p.input.sprint = true;
      if (Math.abs(side) < 1.8 && p.grounded) p.input.jump = true;
      return true;
    }
    if (!brain.avoided?.includes(g.id)) {
      brain.avoided = [...(brain.avoided || []), g.id];
      p.goal = otherGoal(m, p);
      p.direct = true;
      p.path = null;
    }
  }
  return false;
}

// --- Party minigames -------------------------------------------------------
// Hot Potato: grab the nearest grenade on its half (Normal and Hard go for
// the beeping one first), hold it for the level's reaction time, then throw
// it deep into the other half, away from you. Hard throws at you instead
// while you're holding one, to knock it loose.
const POTATO_REACTION = { easy: 0.9, normal: 0.5, hard: 0.25 };
function potatoPitch(m, p, target, height) {
  const v2 = THROW_GRAVITY * PARTY.hotpotato.throwRange,
    g = THROW_GRAVITY,
    d = Math.max(0.5, distance(p, target)),
    dy = height - (m.eye(p).y - 0.15),
    root = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  // Out of reach: as far as it goes.
  if (root < 0) return Math.PI / 4 - LOFT;
  return Math.atan((v2 - Math.sqrt(root)) / (g * d)) - LOFT;
}
function potatoBot(m, p, dt, level, brain) {
  const party = m.party,
    sign = p.team === "attacker" ? 1 : -1,
    foe = Object.values(m.players).find((q) => q.team !== p.team && q.alive),
    reaction = POTATO_REACTION[m.botLevel] ?? POTATO_REACTION.normal;
  if (p.immobile > 0) return;
  const mine = party.grenades.find((g) => g.holder === p.id);
  if (mine) {
    brain.held = (brain.held || 0) + dt;
    const foeHolds = foe && party.grenades.some((g) => g.holder === foe.id),
      atFoe = m.botLevel === "hard" && foeHolds;
    if (!brain.aim || brain.aim.atFoe !== atFoe) {
      // A spot deep in their half; Normal and Hard pick the side away
      // from where you stand.
      const away =
        m.botLevel === "easy" || !foe
          ? Math.random() < 0.5
            ? -1
            : 1
          : foe.x > 0
            ? -1
            : 1;
      brain.aim = {
        atFoe,
        x: away * (2 + Math.random() * 5),
        z: -sign * (4 + Math.random() * 6),
      };
    }
    const target = atFoe ? foe : brain.aim,
      pitch = potatoPitch(m, p, target, atFoe ? foe.y + 1 : 0),
      off = turn(p, yawTo(p, target), level.turn * 1.5, dt);
    p.pitch += clamp(pitch - p.pitch, -3 * dt, 3 * dt);
    if (
      brain.held >= reaction &&
      off < 4 * DEG &&
      Math.abs(p.pitch - pitch) < 0.03
    ) {
      m.attack(p);
      brain.held = 0;
      brain.aim = null;
    }
    return;
  }
  brain.held = 0;
  brain.aim = null;
  // What it can reach: anything on its half or the line.
  const reachable = party.grenades
    .filter((g) => !g.holder && !g.flight && g.z * sign > -0.5)
    .sort((a, b) => distance(p, a) - distance(p, b));
  const target =
    (m.botLevel !== "easy" && reachable.find((g) => g.id === party.beep)) ||
    reachable[0];
  if (target) {
    const gap = PARTY.hotpotato.lineGap;
    moveTo(
      m,
      p,
      { x: target.x, z: sign * Math.max(sign * target.z, gap) },
      dt,
      "run",
    );
    return;
  }
  // Nothing to grab: wait mid-half, facing the other side.
  const post = { x: foe ? clamp(foe.x, -4, 4) : 0, z: sign * 5 };
  if (distance(p, post) > 0.6) moveTo(m, p, post, dt, "walk");
  else if (foe) turn(p, yawTo(p, foe), level.turn, dt);
}
// How far off the sweeper notices a device it's looking toward, by level.
const SWEEP_SIGHT = { easy: 8, normal: 12, hard: 17 };
// Balloons at one device before walking up to it, and the wait (s) between
// them so each has landed first.
const SWEEP_MISSES = 3,
  SWEEP_WAIT = 1.2;
// Where to aim at a device: a wire's middle, otherwise the device itself.
const devicePoint = (g) =>
  g.b
    ? { x: (g.x + g.b.x) / 2, y: (g.y + g.b.y) / 2, z: (g.z + g.b.z) / 2 }
    : { x: g.x, y: g.y + 0.1, z: g.z };
// Bug Sweep: walk the map looking around; a device in view and in range is
// noticed, then turned on and splashed after the level's reaction time.
function sweeper(m, p, dt, level, brain) {
  const now = m.clock || 0,
    eye = m.eye(p),
    range = SWEEP_SIGHT[m.botLevel] ?? SWEEP_SIGHT.normal;
  brain.known ??= {};
  const devices = m.gadgets.filter(
    (g) => g.active && g.team !== p.team && !isPortable(g.kind),
  );
  for (const g of devices) {
    if (brain.known[g.id]) continue;
    const pt = devicePoint(g),
      ahead = Math.abs(wrap(yawTo(p, pt) - p.yaw)) < level.fov * DEG;
    if (ahead && distance(p, pt) < range && clearShot(eye, pt, m.smokes))
      brain.known[g.id] = now;
  }
  const target = devices
    .filter((g) => brain.known[g.id] !== undefined)
    .sort((a, b) => distance(p, a) - distance(p, b))[0];
  if (target) {
    const pt = devicePoint(target),
      close = distance(p, pt) < 3;
    // A few balloons that didn't get it (the arc clips something on the
    // way): walk right up to it and try again from there.
    brain.misses ??= {};
    if (close && brain.misses[target.id] >= SWEEP_MISSES)
      brain.misses[target.id] = 0;
    const pitch =
      clearShot(eye, pt, m.smokes) && !(brain.misses[target.id] >= SWEEP_MISSES)
        ? balloonPitch(m, p, pt, pt.y)
        : null;
    if (pitch !== null) {
      const off = turn(p, yawTo(p, pt), level.turn, dt);
      p.pitch += clamp(pitch - p.pitch, -level.turn * dt, level.turn * dt);
      if (
        now - brain.known[target.id] >= level.reaction &&
        off < 2 * DEG &&
        Math.abs(p.pitch - pitch) < 0.02 &&
        !(p.cooldowns.balloon > 0)
      ) {
        equipAnd(m, p, "balloon", () => m.attack(p, true));
        // Counted once it's had time to land.
        p.cooldowns.balloon = Math.max(p.cooldowns.balloon, SWEEP_WAIT);
        brain.misses[target.id] = (brain.misses[target.id] || 0) + 1;
      }
      return;
    }
    moveTo(m, p, openNear(pt), dt, "walk");
    return;
  }
  // Nothing in mind: the next spot on a shuffled tour of the map, glancing
  // side to side on the way.
  if (!brain.tour?.length) {
    const map = MAPS[m.map],
      spots = [
        ...map.botRoutes.flatMap((r) => r.points || r.vias),
        ...OBJECTIVES.map((o) => ({ x: o.x, z: o.z + 1.5 })),
        ...Object.values(map.botSpots).flat(),
      ].map((pt) => openNear(pt));
    brain.tour = spots.sort(() => Math.random() - 0.5);
    brain.tourSince = now;
  }
  const next = brain.tour[0];
  if (distance(p, next) < 1.5 || now - (brain.tourSince ?? now) > 15) {
    brain.tour.shift();
    brain.tourSince = now;
    p.path = null;
    return;
  }
  moveTo(m, p, next, dt, "walk");
  p.yaw = wrap(p.yaw + Math.sin(now * 1.3) * 0.9 * dt);
}
// Gauntlet: race to the terminal along a route, hop low wires it has
// spotted, then hold to extract.
// Lights Out: how a bot intruder moves. Easy walks the whole way; the
// others creep (crouched) once the guard is within earshot of a walk.
function sneaking(m, p) {
  if (m.party.kind !== "lightsout") return null;
  if (m.botLevel === "easy") return "walk";
  const guard = Object.values(m.players).find(
      (q) => q.team === "defender" && q.alive,
    ),
    near = m.botLevel === "hard" ? 15 : 10;
  return guard && distance(p, guard) < near ? "sneak" : "walk";
}
function runner(m, p, dt, brain, gait = null) {
  const plan = m.botPlan(p),
    site = plan.site;
  if (distance(p, site) < (site.terminal ? 1.6 : 1)) {
    p.input.interact = true;
    lookAt(m, p, { x: site.x, y: 1, z: site.z }, 3, dt);
    return;
  }
  if (hopWires(m, p, dt, brain, site)) return;
  // An easy runner doesn't sprint.
  const pace = gait || (m.botLevel === "easy" ? "walk" : "run");
  if (p.direct) return void moveTo(m, p, plan.points.at(-1), dt, pace);
  p.waypoint ??= 0;
  const target = plan.points[p.waypoint];
  if (
    distance(p, target) < (target.radius ?? 0.7) &&
    p.waypoint < plan.points.length - 1
  ) {
    p.waypoint++;
    p.path = null;
  }
  moveTo(m, p, plan.points[p.waypoint], dt, pace);
}
