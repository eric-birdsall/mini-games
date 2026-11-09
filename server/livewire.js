// Beach Ball Dodge on the server (see PARTY.livewire in shared/party.js and
// the balls in shared/livewire.js). Both players stand on the float; bots on
// the pool deck throw beach balls straight across it on a seeded schedule,
// faster every wave. Each bot picks its lane as it lifts the ball, mostly
// where a player is standing. One that hits you shoves you on in its
// direction, stuns you a moment, then gives a moment's grace. Off the edge
// is the pool water, and the first one in loses.
import { MAPS } from "../shared/maps.js";
import { PARTY, partyScore } from "../shared/party.js";
import {
  PLAT,
  PLAT_H,
  FALLEN_Y,
  HIT_HALF,
  wireSchedule,
  wireAt,
  wireEnd,
  waveAt,
  along,
  across,
  catches,
  inLane,
  settleLane,
  shoveDistance,
} from "../shared/livewire.js";

const L = PARTY.livewire;
// The run's clock is generous: long before this, the wires win.
const RUN_SECONDS = 600;
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

// Put a player back on their mark on the platform.
const toMark = (m, p) =>
  Object.assign(p, MAPS[m.map].spawns[p.team], {
    y: PLAT_H,
    vy: 0,
    grounded: true,
    slide: null,
    wallRun: null,
    clamber: null,
    kick: null,
  });

// The 3-2-1 on the platform: no kit, nothing to set up.
export function livewirePrepare(m, prepEnd) {
  m.party.run = null;
  m.time = Math.min(m.time, prepEnd);
  for (const p of Object.values(m.players)) toMark(m, p);
  m.notify("Get ready! Stay on the float and dodge the beach balls.");
}
// Go: a fresh schedule of wires, and everyone's tally.
export function livewireActivate(m, seed = newSeed()) {
  m.time = RUN_SECONDS;
  m.party.run = {
    seed,
    t: 0,
    wires: wireSchedule(seed, RUN_SECONDS),
    runners: Object.fromEntries(
      Object.values(m.players).map((p) => {
        toMark(m, p);
        p.immobile = 0;
        return [
          p.id,
          {
            trips: 0,
            fell: false,
            time: 0,
            grace: 0,
            trip: null,
            last: { x: p.x, z: p.z },
            face: 0,
          },
        ];
      }),
    ),
  };
  m.notify("Beach balls incoming! Step out of their way.");
}

// Hit: shoved on along the ball's way, stunned, then a moment's grace.
function trip(p, r, w) {
  const far = shoveDistance(w.speed),
    v = (w.dir * far) / L.shoveSeconds;
  r.trips++;
  r.trip = {
    vx: w.axis === "x" ? v : 0,
    vz: w.axis === "z" ? v : 0,
    left: L.shoveSeconds,
  };
  r.grace = L.graceSeconds;
  Object.assign(p, {
    immobile: Math.max(p.immobile || 0, L.stunSeconds),
    slide: null,
    wallRun: null,
    kick: null,
  });
}

// Every tick of the run: bots lifting a ball pick its lane, the balls fly
// on, hit whoever's in the way, and anyone who's dropped into the pool water
// is out.
export function livewireTick(m, dt) {
  const run = m.party.run;
  if (m.phase !== "active" || !run) return;
  const before = run.t;
  run.t += dt;
  const t = run.t,
    spots = Object.values(m.players)
      .sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : 0))
      .filter((p) => !run.runners[p.id]?.fell);
  for (const w of run.wires) {
    if (w.at > t) break;
    if (!w.settled) {
      w.lane = settleLane(w, spots, run.wires, t);
      w.settled = true;
    }
  }
  const moving = run.wires.filter(
    (w) => w.settled && w.launch < t && wireEnd(w) > before,
  );
  const fell = [];
  for (const p of Object.values(m.players)) {
    const r = run.runners[p.id];
    if (!r || r.fell) continue;
    r.grace = Math.max(0, r.grace - dt);
    // Facing the way they're going (they always steer as if facing north).
    const dx = p.x - r.last.x,
      dz = p.z - r.last.z;
    if (Math.hypot(dx, dz) > 0.02 && !r.trip) r.face = Math.atan2(-dx, -dz);
    // In the pool already, nothing more can hit you.
    if (r.grace <= 0 && p.y > FALLEN_Y)
      for (const w of moving) {
        const from = wireAt(w, before),
          to = wireAt(w, t);
        if (
          inLane(w, r.last, p) &&
          catches(w, from, to, along(w, r.last), along(w, p))
        ) {
          trip(p, r, w);
          break;
        }
      }
    r.last = { x: p.x, z: p.z };
    if (p.y < FALLEN_Y) {
      r.fell = true;
      r.time = t;
      fell.push(p);
    }
  }
  if (fell.length) livewireOver(m, "Splash! Into the pool");
}

// After each move: before the go, everyone waits on their mark; hit, the
// shove carries you on (stunned, you can't fight it).
export function livewireClamp(m, p, old, dt) {
  if (m.phase === "prep" || m.phase === "purchase") return void toMark(m, p);
  const r = m.party.run?.runners[p.id];
  if (m.phase !== "active" || !r?.trip) return;
  const step = Math.min(dt, r.trip.left);
  p.x += r.trip.vx * step;
  p.z += r.trip.vz * step;
  r.trip.left -= step;
  if (r.trip.left <= 1e-6) r.trip = null;
}

// What everyone is told: the wave, each runner's tally and the balls that
// are out (held up by their bots, or on their way).
export function livewireView(m) {
  const run = m.party.run;
  if (!run) return { run: null };
  const t = run.t;
  return {
    run: {
      t,
      wave: waveAt(t),
      runners: Object.fromEntries(
        Object.entries(run.runners).map(([id, r]) => [
          id,
          {
            trips: r.trips,
            fell: r.fell,
            time: r.fell ? r.time : t,
            grace: r.grace,
            face: r.face,
          },
        ]),
      ),
      wires: run.wires
        .filter((w) => w.settled && w.at <= t && wireEnd(w) > t)
        .map((w) => ({
          id: w.id,
          lane: w.lane,
          axis: w.axis,
          dir: w.dir,
          speed: w.speed,
          at: w.at,
          launch: w.launch,
        })),
    },
  };
}

// The run is over: someone's in the pool water (or, much later, the clock ran
// out). Whoever stayed on longer wins; in together, fewer hits.
export function livewireOver(m, reason) {
  if (m.phase === "results") return;
  const party = m.party,
    run = party.run,
    t = run?.t || 0;
  for (const p of Object.values(m.players)) {
    const r = run?.runners[p.id];
    party.scores[p.id] = {
      fell: !!r?.fell,
      time: r?.fell ? r.time : t,
      trips: r?.trips || 0,
    };
  }
  const ranked = Object.values(m.players)
    .map((p) => ({ p, rank: partyScore("livewire", party.scores[p.id]).rank }))
    .sort((a, b) => a.rank - b.rank);
  const winner =
    ranked.length > 1 && ranked[0].rank < ranked[1].rank
      ? ranked[0].p
      : ranked.length === 1
        ? ranked[0].p
        : null;
  const said = Object.values(party.scores).some((s) => s.fell)
    ? reason
    : "Time's up";
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
      : `${said}. It's a draw!`,
  );
}

// --- The bot --------------------------------------------------------------
// It notices each ball botReact s after its bot lifts it (and rolls once per
// ball, more often in later waves, to not notice it at all), then walks to
// the nearest spot on the float that's out of the way of every ball it has
// seen coming, keeping off the edges. With nothing coming it drifts back
// towards the middle (Easy only roughly).
const EDGE = 0.55,
  STEP = 0.25,
  // Room to spare beyond a ball's reach, so it isn't clipped.
  MARGIN = 0.25;
const GRID = [];
for (let x = -PLAT + EDGE; x <= PLAT - EDGE + 1e-9; x += STEP)
  for (let z = -PLAT + EDGE; z <= PLAT - EDGE + 1e-9; z += STEP)
    GRID.push({ x, z });
// The nearest safe spot for `p` out of every ball in `coming`, a little
// drawn to the middle; null if none.
export function safeSpot(p, coming, pull = 0.15) {
  let best = null,
    score = Infinity;
  for (const q of GRID) {
    if (coming.some((w) => Math.abs(across(w, q) - w.lane) < HIT_HALF + MARGIN))
      continue;
    const s = Math.hypot(q.x - p.x, q.z - p.z) + pull * Math.hypot(q.x, q.z);
    if (s < score) {
      score = s;
      best = q;
    }
  }
  return best;
}
export function livewireBot(m, p, brain) {
  const run = m.party.run,
    r = run?.runners[p.id];
  p.input = { forward: 0, side: 0 };
  p.yaw = 0;
  p.pitch = 0;
  if (!run || !r || r.fell || p.immobile > 0 || m.phase !== "active") return;
  const level = m.botLevel || "normal",
    t = run.t,
    react = L.botReact[level] ?? L.botReact.normal,
    wave = waveAt(t),
    miss =
      (L.botMiss[level] ?? L.botMiss.normal) +
      L.botMissStep * Math.max(0, wave - L.botMissFrom + 1);
  // A new run: ball ids start again.
  if (brain.seed !== run.seed) {
    brain.seed = run.seed;
    brain.blind = {};
  }
  // The balls it has seen that haven't gone past it yet.
  const coming = [];
  for (const w of run.wires) {
    if (!w.settled || w.at + react > t || wireEnd(w) <= t) continue;
    if ((along(w, p) - wireAt(w, t)) * w.dir < -0.6) continue;
    brain.blind[w.id] ??= Math.random() < miss;
    if (!brain.blind[w.id]) coming.push(w);
  }
  const slack = level === "easy" ? 1.6 : level === "hard" ? 0.3 : 0.7,
    home = coming.length
      ? safeSpot(p, coming)
      : Math.hypot(p.x, p.z) > slack
        ? { x: 0, z: 0 }
        : null;
  if (!home) return;
  const dx = home.x - p.x,
    dz = home.z - p.z,
    dist = Math.hypot(dx, dz);
  if (dist < 0.08) return;
  const k = Math.min(1, dist / 0.4) / dist;
  // Facing north: forward is -z, side is +x.
  p.input.forward = -dz * k;
  p.input.side = dx * k;
}
