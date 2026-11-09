// Breakout on the server (see PARTY.breakout in shared/party.js and the
// course in shared/breakout.js). One run: the runner (the infiltrator) runs
// on their own down a long, straight, three-lane hallway, picking a lane and
// jumping the low hurdles and going around the tall ones, as far as they
// can. Running into one ends the run. Anyone else waits in a sealed booth and
// watches.
import { CONFIG } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { PARTY } from "../shared/party.js";
import { partyHalfOver } from "./party.js";
import {
  HURDLE_D,
  laneX,
  nearestLane,
  progressOf,
} from "../shared/breakout.js";

const B = PARTY.breakout,
  R = CONFIG.playerRadius;
export const breakoutSpeed = (m) =>
  CONFIG.sprintSpeed +
  B.acceleration * Math.max(0, (m.activeTime || 0) - B.rampDelay);
const runnerOf = (m) =>
  Object.values(m.players).find((p) => p.team === "attacker");

// The 3-2-1 at the start line: no kit, nothing to set up.
export function breakoutPrepare(m, prepEnd) {
  m.party.run = null;
  m.time = Math.min(m.time, prepEnd);
  const runner = runnerOf(m);
  m.notify(
    runner?.bot
      ? "The bot runs first. Watch its run."
      : "Get ready to run. Jump the logs, go around the hay bales.",
  );
}
// Go: every hurdle back in place.
export function breakoutActivate(m) {
  const map = MAPS[m.map];
  m.time = B.runSeconds;
  m.party.run = {
    s: map.startS,
    best: map.startS,
    hazards: map.hazards.map((h) => ({ ...h })),
  };
  for (const p of Object.values(m.players)) {
    p.lane = 0;
    p.laneHeld = 0;
  }
  m.notify("Run! Go as far as you can.");
}

// Before each move, the runner's input becomes auto run: always forward at
// a sprint, facing up the hallway. Left or right (a fresh push, not a hold)
// moves one lane over. No crouching or sliding: hurdles are jumped.
export function breakoutSteer(m, p) {
  if (p.team !== "attacker" || m.phase !== "active" || !m.party.run) return;
  const input = p.input || (p.input = {}),
    side = input.side || 0;
  p.lane ??= nearestLane(p.x);
  if (Math.abs(side) < 0.3) p.laneHeld = 0;
  else if (Math.abs(side) > 0.5 && Math.sign(side) !== p.laneHeld) {
    p.laneHeld = Math.sign(side);
    p.lane = Math.max(-1, Math.min(1, p.lane + p.laneHeld));
  }
  p.yaw = 0;
  input.forward = 1;
  input.side = 0;
  input.sprint = true;
  input.crouch = input.prone = false;
  input.slide = p.slideSeen || 0;
  p.crouch = p.prone = false;
  p.slide = null;
}

// Every tick of the run: how far along the runner is, and whether they've
// made it to the end of the hall.
export function breakoutTick(m) {
  const run = m.party.run,
    p = runnerOf(m);
  if (m.phase !== "active" || !run || !p) return;
  const map = MAPS[m.map];
  run.s = progressOf(map.path, p);
  run.best = Math.max(run.best, run.s);
  if (run.s >= map.finishS) partyHalfOver(m, "Ran the whole hall", true);
}

// After each move: hold everyone where they belong, slide the runner into
// their lane, and end the run if they run into a hurdle.
export function breakoutClamp(m, p, old, dt) {
  const map = MAPS[m.map];
  if (p.team === "defender" || m.phase !== "active") {
    // The watcher stays in the booth; before the go, the runner waits at
    // the start line.
    if (p.team === "defender" || m.phase === "prep" || m.phase === "purchase")
      Object.assign(p, map.spawns[p.team], { vy: 0 });
    return;
  }
  const run = m.party.run;
  if (!run || run.tripped) return;
  // Across to the lane picked, at laneSpeed.
  const want = laneX(p.lane ?? 0),
    step = B.laneSpeed * dt;
  p.x += Math.max(-step, Math.min(step, want - p.x));
  for (const h of run.hazards) {
    // In its lanes, up against it (or beside it, sliding across into it)
    // and not over it: tripped, and the run is over.
    const face = h.z + HURDLE_D / 2,
      back = h.z - HURDLE_D / 2,
      against = old.z >= back && p.z - face < R + 0.16,
      inLane = Math.abs(p.x - h.x) < h.w / 2 + R * 0.5,
      // A log can be stepped onto by normal movement, which still counts
      // as hitting it if the runner approached on the ground.
      under =
        p.y < h.h - 0.05 || (old.grounded && old.y < h.h - 0.05 && p.y <= h.h);
    if (against && inLane && under) {
      run.tripped = true;
      run.s = progressOf(map.path, p);
      run.best = Math.max(run.best, run.s);
      m.notify(h.tall ? "Bumped into the hay bales!" : "Tripped on a log!");
      partyHalfOver(
        m,
        h.tall ? "Bumped into the hay bales" : "Tripped on a log",
      );
      return;
    }
  }
}

// What everyone is told: where the runner is along the course, and how
// many hurdles they've passed.
export function breakoutView(m) {
  const run = m.party.run,
    map = MAPS[m.map];
  if (!run || !map?.path) return { run: null };
  const runner = runnerOf(m);
  return {
    run: {
      runner: runner?.id ?? null,
      s: run.s,
      best: run.best,
      startS: map.startS,
      finishS: map.finishS,
      cleared: run.hazards.filter((h) => h.s < run.best - 0.5).length,
      speed: breakoutSpeed(m),
      tripped: !!run.tripped,
    },
  };
}
// A half's result for the runner.
export function breakoutScore(m, finished, time) {
  const run = m.party.run,
    map = MAPS[m.map];
  return {
    finished,
    time,
    tripped: !!run?.tripped,
    distance: run
      ? Math.min(map.finishS - map.startS, run.best - map.startS)
      : 0,
  };
}

// --- The bot runner -------------------------------------------------------
// Auto run does the running; the bot steers for a lane clear of the next
// tall hurdle and jumps the low ones in its lane. Each hurdle it rolls once
// to fumble (PARTY.breakout.botMiss): then it does nothing about it, and
// trips.
export function breakoutBot(m, p, dt, level, brain) {
  const run = m.party.run;
  if (!run || p.team !== "attacker") return;
  const s = run.s,
    miss = B.botMiss[m.botLevel] ?? B.botMiss.normal,
    lane = p.lane ?? 0;
  brain.miss ??= {};
  let jump = false,
    want = lane;
  const speedScale = breakoutSpeed(m) / CONFIG.sprintSpeed;
  const ahead = run.hazards.filter(
    (h) => h.s - s > -1 && h.s - s < 9 * speedScale,
  );
  for (const h of ahead) {
    if (!(h.id in brain.miss)) brain.miss[h.id] = Math.random() < miss;
  }
  // The nearest hurdle in front that's in the way of the lane it's in.
  const next = ahead.find((h) => h.s - s > 0.3 && h.lanes.includes(want));
  if (next && !brain.miss[next.id]) {
    if (next.tall) {
      // Over to the nearest open lane.
      const open = [-1, 0, 1]
        .filter((l) => !next.lanes.includes(l))
        .sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane));
      want = open[0] ?? lane;
    } else {
      const d = next.s - s;
      // Mid-window: anywhere from about 1.4 to 3 m out clears it.
      if (d > 1.6 * speedScale && d < 2.4 * speedScale) jump = true;
    }
  }
  // One tap at a time toward the lane it wants.
  const side = want === lane ? 0 : Math.sign(want - lane);
  p.input.forward = 1;
  p.input.side = brain.tapped && side ? 0 : side;
  brain.tapped = !!side && !brain.tapped;
  p.input.sprint = true;
  p.input.jump = jump && p.grounded;
}
