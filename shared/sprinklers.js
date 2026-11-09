import { MAPS } from "./maps.js";
import { PARTY } from "./party.js";
import { rng } from "./livewire.js";
const S = PARTY.sprinklers;
export const sprinklerWave = (t) =>
  1 + Math.floor(Math.max(0, t) / S.waveSeconds);
export const sprinklerStage = (h, t) =>
  t < h.at
    ? "hidden"
    : t < h.at + S.warnSeconds
      ? "warning"
      : t < (h.sprayUntil ?? h.at + S.warnSeconds + S.spraySeconds)
        ? "spray"
        : t < h.end
          ? "retract"
          : "hidden";
// Nine permanent sites span the lawn with a small fence inset.
// Spray may extend beyond the yard; only the heads need to stay inside.
export const SPRINKLER_SITES = Array.from({ length: 9 }, (_, i) => ({
  x: (((i % 3) / 2) * 2 - 1) * (MAPS.yard.size.x - 1),
  z: ((Math.floor(i / 3) / 2) * 2 - 1) * (MAPS.yard.size.z - 1),
}));
export function sprinklerSchedule(seed) {
  const random = rng(seed),
    heads = [];
  for (let at = 2; at < S.runSeconds; at += S.gap) {
    const sites = [...SPRINKLER_SITES];
    const count = Math.min(sites.length, sprinklerWave(at));
    for (let i = 0; i < count; i++) {
      const [{ x, z }] = sites.splice(Math.floor(random() * sites.length), 1);
      heads.push({
        id: heads.length + 1,
        x,
        z,
        at,
        end: at + S.warnSeconds + S.spraySeconds + S.retractSeconds,
      });
    }
  }
  return heads;
}
// Sweep the player's movement segment so fast movement cannot skip a spray.
export function sprinklerHits(h, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = dx * dx + dz * dz;
  const u = d
    ? Math.max(0, Math.min(1, ((h.x - a.x) * dx + (h.z - a.z) * dz) / d))
    : 0;
  return Math.hypot(a.x + u * dx - h.x, a.z + u * dz - h.z) <= S.radius + 0.3;
}
