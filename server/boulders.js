// Boulder Dash on the server (see PARTY.boulders in shared/party.js and the
// channel in shared/boulders.js). Both players climb at once; boulders come
// out of the portal at the top on an uneven rhythm and roll down, faster as
// they go. A full-width one fills the channel, so the only safe place is a
// recess; a half-width one rolls down one side and can be sidestepped. A
// hit flattens you: held a moment, back in the last recess you passed.
// First to the top wins the race outright.
import { CONFIG } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { PARTY, partyScore } from "../shared/party.js";
import { WIDTH, NOOK, sOf, zOf, groundAt, laneX } from "../shared/boulders.js";

const D = PARTY.boulders,
  R = CONFIG.playerRadius;
const between = ([a, b], f) => a + (b - a) * f;

// The 3-2-1 at the foot of the channel: no kit, nothing to set up.
export function bouldersPrepare(m, prepEnd) {
  m.party.race = null;
  m.time = Math.min(m.time, prepEnd);
  m.notify("Get ready. Race to the top; duck into the recesses.");
}
// Go: the clock, everyone's climb, the first boulder on its way.
export function bouldersActivate(m) {
  m.time = D.raceSeconds;
  m.party.race = {
    next: D.firstAt,
    boulders: [],
    released: 0,
    climbers: Object.fromEntries(
      Object.values(m.players).map((p) => [
        p.id,
        { s: sOf(MAPS[m.map], p.z), best: 0, hits: 0, flat: 0, done: false },
      ]),
    ),
  };
  for (const p of Object.values(m.players)) p.immobile = 0;
  m.notify("Climb! Boulders incoming: get into a recess.");
}

// How far into the race the rhythm has tightened, 0 to 1.
const ramped = (t) => Math.min(1, t / D.rampUp);
// Let a boulder go from the portal, and pick when the next one comes.
function release(m, race, t, rand = Math.random) {
  const map = MAPS[m.map],
    f = ramped(t),
    half = rand() < between(D.halfShare, f) ? (rand() < 0.5 ? -1 : 1) : 0;
  race.boulders.push({
    id: m.nextId++,
    half,
    x: laneX(half),
    s: map.releaseS,
    r: half ? D.halfRadius : D.fullRadius,
    v: D.speed,
  });
  race.released++;
  const tight = 1 - D.tighten * f,
    roll = rand(),
    // The second of a pair follows close behind; then the usual gap.
    gap = race.pairing
      ? between(D.single, rand())
      : roll < D.pairChance
        ? D.pair
        : roll < D.pairChance + D.lullChance
          ? between(D.lull, rand())
          : between(D.single, rand());
  race.pairing = !race.pairing && roll < D.pairChance;
  race.next = t + gap * tight;
}

// Whether boulder `b` is on top of player `p` (`s` m up the channel).
export function crushes(map, b, p, s) {
  if (Math.abs(s - b.s) > b.r * 0.85 + R * 0.5) return false;
  if (p.y > groundAt(map, b.s) + b.r * 2) return false;
  return b.half
    ? Math.abs(p.x - b.x) < b.r + R * 0.5
    : // In a recess (most of your body past the wall line) it rolls by.
      Math.abs(p.x) < WIDTH / 2 + 0.1;
}
// The recess a flattened player goes back to: the last one they reached.
export function lastRecess(map, s) {
  return map.recesses.filter((r) => r.s - NOOK / 2 <= s).at(-1) || null;
}
function flatten(m, p, c) {
  const map = MAPS[m.map],
    back = lastRecess(map, c.s),
    at = back
      ? { x: back.x, z: back.z, y: back.y + 0.05 }
      : { ...map.spawns[p.team], y: 0 };
  c.hits++;
  // Held, then a moment's grace to get your bearings.
  c.flat = D.flatSeconds + 0.5;
  Object.assign(p, at, {
    vy: 0,
    slide: null,
    wallRun: null,
    clamber: null,
    immobile: D.flatSeconds,
  });
  c.s = sOf(map, p.z);
}

// Every tick of the race: the release rhythm, the boulders rolling down,
// who they hit, and whether someone's at the top.
export function bouldersTick(m, dt) {
  const race = m.party.race;
  if (m.phase !== "active" || !race) return;
  const map = MAPS[m.map],
    t = m.activeTime || 0;
  if (t >= race.next) release(m, race, t);
  for (const b of race.boulders) {
    b.v = Math.min(D.top, b.v + D.accel * dt);
    b.s -= b.v * dt;
  }
  // At the foot of the slope they smash into the buffer and break up.
  race.boulders = race.boulders.filter((b) => b.s > b.r * 0.5);
  for (const p of Object.values(m.players)) {
    const c = race.climbers[p.id];
    if (!c) continue;
    c.s = sOf(map, p.z);
    c.best = Math.max(c.best, Math.min(map.finishS, Math.max(0, c.s)));
    if (c.flat > 0) c.flat = Math.max(0, c.flat - dt);
    else if (race.boulders.some((b) => crushes(map, b, p, c.s)))
      flatten(m, p, c);
    if (c.s >= map.finishS && !c.done) {
      c.done = true;
      c.time = t;
    }
  }
  const top = Object.values(m.players).filter((p) => race.climbers[p.id]?.done);
  if (top.length) bouldersOver(m, "Topped out");
}

// After each move: before the go, everyone waits at the foot; going up
// the slope, nobody is faster than a climb.
export function bouldersClamp(m, p, old, dt) {
  const map = MAPS[m.map];
  if (m.phase === "prep" || m.phase === "purchase") {
    Object.assign(p, map.spawns[p.team], { vy: 0 });
    return;
  }
  if (m.phase !== "active") return;
  const s = sOf(map, p.z);
  if (p.z >= old.z || s <= 0 || s >= map.length) return;
  const dx = p.x - old.x,
    dz = p.z - old.z,
    d = Math.hypot(dx, dz),
    most = D.climbTop * dt;
  if (d > most) {
    p.x = old.x + (dx * most) / d;
    p.z = old.z + (dz * most) / d;
  }
}

// What everyone is told: each climber's progress and the boulders.
export function bouldersView(m) {
  const race = m.party.race,
    map = MAPS[m.map];
  if (!race || !map?.boulders) return { race: null };
  return {
    race: {
      finishS: map.finishS,
      released: race.released,
      climbers: Object.fromEntries(
        Object.entries(race.climbers).map(([id, c]) => [
          id,
          {
            s: c.s,
            best: c.best,
            hits: c.hits,
            flat: c.flat,
            done: c.done,
          },
        ]),
      ),
      boulders: race.boulders.map((b) => ({
        id: b.id,
        half: b.half,
        x: b.x,
        s: b.s,
        r: b.r,
        v: b.v,
      })),
    },
  };
}

// The race is over: someone topped out, or the clock ran out. Everyone's
// result, and the better one wins.
export function bouldersOver(m, reason) {
  if (m.phase === "results") return;
  const party = m.party,
    race = party.race,
    map = MAPS[m.map];
  for (const p of Object.values(m.players)) {
    const c = race?.climbers[p.id];
    party.scores[p.id] = {
      finished: !!c?.done,
      time: c?.done ? c.time : Math.min(m.activeTime || 0, D.raceSeconds),
      best: c ? Math.min(map.finishS, c.best) : 0,
      hits: c?.hits || 0,
    };
  }
  const ranked = Object.values(m.players)
    .map((p) => ({ p, rank: partyScore("boulders", party.scores[p.id]).rank }))
    .sort((a, b) => a.rank - b.rank);
  const winner =
    ranked.length > 1 && ranked[0].rank < ranked[1].rank
      ? ranked[0].p
      : ranked.length === 1
        ? ranked[0].p
        : null;
  const said =
    winner && party.scores[winner.id].finished ? reason : "Time's up";
  m.phase = "results";
  m.result = {
    party: party.kind,
    half: 1,
    final: true,
    reason: said,
    winnerId: winner?.id ?? null,
    winner: winner?.team ?? null,
    remaining: Math.ceil(m.time),
    ...m.stats,
  };
  m.notify(
    winner
      ? `${said}. ${winner.bot ? "The bot wins" : "Winner decided"}.`
      : `${said}. It's a tie!`,
  );
}

// --- The bot climber ------------------------------------------------------
// It climbs recess to recess. Coming up to each one (or on the start pad) it
// looks up the channel: if a boulder it can see would meet it before the
// next recess, it ducks in and waits; otherwise it carries straight on. Each
// time it decides to wait it rolls once (PARTY.boulders.botMiss) to
// misjudge it and go anyway. Out in the open it sidesteps a half-width
// boulder in its lane.
export function bouldersBot(m, p, brain) {
  const race = m.party.race,
    map = MAPS[m.map],
    c = race?.climbers[p.id];
  if (!race || !c || p.immobile > 0 || m.phase !== "active") return;
  const s = c.s,
    nooks = map.recesses,
    miss = D.botMiss[m.botLevel] ?? D.botMiss.normal;
  // The recess it's making for: the one it's in or the next one up (after a
  // flattening, the one it was put back in).
  let i = brain.target ?? 0;
  if (i < nooks.length && nooks[i].s < s - NOOK / 2 - 0.5)
    i = nooks.findIndex((r) => r.s > s - NOOK / 2 + 0.2);
  if (i < 0) i = nooks.length;
  const here = nooks[i],
    onPad = s < -0.3,
    // Coming up to it (or waiting in it, or on the pad): time to decide.
    deciding = onPad ? i === 0 : here && here.s - s < 2.6;
  if (deciding) {
    const from = onPad ? 0 : here.s,
      ahead = nooks[onPad ? 0 : i + 1],
      leg =
        ((ahead ? ahead.s : map.finishS + 1) - Math.max(s, 0)) / D.climbTop +
        (ahead ? 0.5 : 0) +
        (onPad ? 0 : Math.max(0, here.s - s) / D.climbTop);
    const danger = race.boulders.some((b) => {
      // Rolling past right now.
      if (b.s > from - b.r - 0.3 && b.s < from + b.r + 1.5) return true;
      if (b.s < from) return false;
      const meet = (b.s - from - b.r) / (D.climbTop + b.v);
      // A half-width one can be sidestepped, unless it's nearly here.
      return b.half ? meet < 1.2 : meet < leg + 0.4;
    });
    const spot = onPad ? -1 : i;
    if (brain.spot !== spot) {
      brain.spot = spot;
      brain.rolled = false;
      brain.go = false;
      brain.waited = false;
      brain.clear = null;
    }
    // Clear: off, after a moment's hesitation (none if it never stopped).
    const now = m.activeTime || 0,
      pause = D.botPause[m.botLevel] ?? D.botPause.normal;
    if (danger) brain.clear = null;
    else brain.clear ??= now;
    if (!danger && (brain.waited ? now - brain.clear >= pause : true))
      brain.go = true;
    else if (danger && !brain.go && !brain.rolled) {
      brain.rolled = true;
      // Misjudged it: off anyway.
      if (Math.random() < miss) brain.go = true;
    }
    if (!brain.go) {
      brain.waited = true;
      brain.target = i;
      steer(p, onPad ? map.spawns[p.team] : { x: here.x, z: here.z });
      return;
    }
    if (!onPad) i++;
  }
  brain.target = i;
  // Out in the open: up the side of the recess it's making for.
  const next = nooks[i],
    goal = next ? next.s : map.finishS + 1;
  let x = next ? next.side * (WIDTH / 2 - 0.6) : 0;
  const threat = race.boulders.find(
    (b) =>
      b.half && b.s > s && b.s - s < 9 && Math.abs(p.x - b.x) < b.r + R + 0.3,
  );
  if (threat) x = -Math.sign(threat.x) * (WIDTH / 4 + 0.2);
  steer(p, { x, z: zOf(map, Math.min(goal, s + 4)) });
}
// Head for a point, facing up the channel.
function steer(p, to) {
  p.yaw += Math.max(-5 / 30, Math.min(5 / 30, -p.yaw));
  p.pitch *= 0.9;
  const dx = to.x - p.x,
    dz = to.z - p.z,
    len = Math.hypot(dx, dz);
  if (len < 0.12) return;
  const k = Math.min(1, len / 0.6) / len,
    ahead = -Math.cos(p.yaw) * dz - Math.sin(p.yaw) * dx,
    across = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
  p.input.forward = ahead * k;
  p.input.side = across * k;
}
