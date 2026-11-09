import { MAPS } from "../shared/maps.js";
import { PARTY, partyScore } from "../shared/party.js";
import {
  sprinklerSchedule,
  sprinklerStage,
  sprinklerHits,
  sprinklerWave,
} from "../shared/sprinklers.js";
const S = PARTY.sprinklers;
const mark = (m, p) =>
  Object.assign(p, MAPS.yard.spawns[p.team], {
    y: 0,
    vy: 0,
    grounded: true,
    sprinklerFace: 0,
  });
export function sprinklersPrepare(m, end) {
  m.party.sprinklers = null;
  m.time = Math.min(m.time, end);
  for (const p of Object.values(m.players)) mark(m, p);
  m.notify("Get ready! Keep clear of the marked sprinkler circles.");
}
export function sprinklersActivate(m, seed = (Math.random() * 2 ** 32) >>> 0) {
  m.time = S.runSeconds;
  m.party.sprinklers = {
    t: 0,
    heads: sprinklerSchedule(seed),
    runners: Object.fromEntries(
      Object.values(m.players).map((p) => {
        mark(m, p);
        return [p.id, { wet: false, time: 0, last: { x: p.x, z: p.z } }];
      }),
    ),
  };
  m.notify("Stay dry! More sprinklers pop up every 15 seconds.");
}
export function sprinklersClamp(m, p) {
  const forward = p.input?.forward || 0,
    side = p.input?.side || 0;
  if (Math.hypot(forward, side) > 0.1)
    p.sprinklerFace = Math.atan2(-side, forward);
  if (m.phase === "prep" || m.phase === "purchase") return mark(m, p);
  p.x = Math.max(
    -MAPS.yard.size.x + 0.5,
    Math.min(MAPS.yard.size.x - 0.5, p.x),
  );
  p.z = Math.max(
    -MAPS.yard.size.z + 0.5,
    Math.min(MAPS.yard.size.z - 0.5, p.z),
  );
}
export function sprinklersTick(m, dt) {
  const run = m.party.sprinklers;
  if (m.phase !== "active" || !run) return;
  const before = run.t;
  run.t += dt;
  if (run.overAt != null) {
    if (run.t >= run.overAt) sprinklersOver(m, "Last dry player");
    return;
  }
  const spraying = run.heads.filter(
    (h) =>
      h.at + S.warnSeconds <= run.t &&
      h.at + S.warnSeconds + S.spraySeconds > before,
  );
  for (const p of Object.values(m.players)) {
    const r = run.runners[p.id];
    if (!r || r.wet) continue;
    const hit = spraying.find((h) => sprinklerHits(h, r.last, p));
    if (hit) {
      r.wet = true;
      r.time = run.t;
      p.immobile = S.runSeconds;
      p.vy = p.moveSpeed = 0;
      // Keep the catching head spraying for the entire soaking beat.
      hit.sprayUntil = Math.max(
        hit.sprayUntil || hit.at + S.warnSeconds + S.spraySeconds,
        run.t + S.soakSeconds,
      );
      hit.end = hit.sprayUntil + S.retractSeconds;
      m.notify("Splash! A player got wet.");
    }
    r.last = { x: p.x, z: p.z };
  }
  const dry = Object.values(run.runners).filter((r) => !r.wet).length;
  if (dry === 0 || (Object.keys(run.runners).length > 1 && dry === 1)) {
    run.overAt = run.t + S.soakSeconds;
    m.time = Math.max(m.time, S.soakSeconds + 1);
  }
}
export function sprinklersView(m) {
  const r = m.party.sprinklers;
  return {
    sprinklers: r
      ? {
          t: r.t,
          wave: sprinklerWave(r.t),
          heads: r.heads.filter((h) => sprinklerStage(h, r.t) !== "hidden"),
          runners: Object.fromEntries(
            Object.entries(r.runners).map(([id, p]) => [
              id,
              { wet: p.wet, time: p.wet ? p.time : r.t },
            ]),
          ),
        }
      : null,
  };
}
export function sprinklersOver(m, reason) {
  if (m.phase === "results") return;
  const run = m.party.sprinklers;
  for (const p of Object.values(m.players)) {
    const r = run?.runners[p.id];
    m.party.scores[p.id] = {
      wet: !!r?.wet,
      time: r?.wet ? r.time : run?.t || 0,
    };
  }
  const ranked = Object.values(m.players).sort(
    (a, b) =>
      partyScore("sprinklers", m.party.scores[a.id]).rank -
      partyScore("sprinklers", m.party.scores[b.id]).rank,
  );
  const winner =
    ranked.length > 1 &&
    partyScore("sprinklers", m.party.scores[ranked[0].id]).rank <
      partyScore("sprinklers", m.party.scores[ranked[1].id]).rank
      ? ranked[0]
      : null;
  m.phase = "results";
  m.result = {
    party: "sprinklers",
    half: 1,
    final: true,
    reason,
    winnerId: winner?.id ?? null,
    winner: winner?.team ?? null,
    remaining: Math.ceil(m.time),
    ...m.stats,
  };
}
export function sprinklersBot(m, p) {
  p.input = { forward: 0, side: 0 };
  p.yaw = 0;
  p.pitch = 0;
  const r = m.party.sprinklers;
  if (m.phase !== "active" || !r || r.runners[p.id]?.wet) return;
  const react = m.botLevel === "easy" ? 0.8 : m.botLevel === "hard" ? 0.1 : 0.4;
  const heads = r.heads.filter((h) => h.at + react < r.t && h.end > r.t);
  let target = null,
    best = -Infinity;
  for (let x = -MAPS.yard.size.x + 2; x <= MAPS.yard.size.x - 2; x += 2)
    for (let z = -MAPS.yard.size.z + 2; z <= MAPS.yard.size.z - 2; z += 2) {
      const clearance = Math.min(
        8,
        ...heads.map((h) => Math.hypot(x - h.x, z - h.z) - S.radius),
      );
      const score = clearance - Math.hypot(x - p.x, z - p.z) * 0.16;
      if (score > best) {
        best = score;
        target = { x, z };
      }
    }
  if (target) {
    const dx = target.x - p.x,
      dz = target.z - p.z,
      d = Math.hypot(dx, dz);
    if (d > 0.3) p.input = { side: dx / d, forward: -dz / d };
  }
}
