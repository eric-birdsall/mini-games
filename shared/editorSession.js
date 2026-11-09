import { Match } from "../server/simulation.js";
import { registerCustomMap, ensurePieceIds, PIECE_TYPES } from "./customMap.js";
import { WALLS, overlapsFootprint } from "./map.js";
import { playtestPoint } from "./builderTools.js";
function safeArrival(def, point) {
  const direct = playtestPoint(def, point);
  if (direct) return direct;
  for (let radius = 0.5; radius <= 8; radius += 0.5)
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        spot = playtestPoint(def, {
          x: point.x + Math.cos(a) * radius,
          z: point.z + Math.sin(a) * radius,
          y: point.y,
        });
      if (spot) return spot;
    }
  return null;
}
export function createEditorSession(def, saved) {
  ensurePieceIds(def);
  const match = new Match(
    "EDITOR",
    false,
    "seen",
    true,
    registerCustomMap(def),
  );
  match.addPlayer("editor", "attacker");
  match.activate();
  // Doors stand open while you build, so you can walk the whole map.
  const openAll = (d) =>
    (match.openDoors = new Set(
      d.pieces.flatMap((p, i) =>
        PIECE_TYPES[p.t]?.shape === "leafDoor" ? [i] : [],
      ),
    ));
  openAll(def);
  const p = match.players.editor;
  p.equipped = null;
  p.inventory = {};
  const spot = safeArrival(
    def,
    saved
      ? { x: saved.x, z: saved.z, y: saved.y }
      : { ...def.spawns.attacker, y: 0 },
  );
  if (spot)
    Object.assign(p, spot, { yaw: saved?.yaw || 0, pitch: saved?.pitch || 0 });
  if (saved?.fly && spot && Number.isFinite(saved.y))
    p.y = Math.max(0, Math.min(38, saved.y));
  return {
    match,
    player: p,
    updateMap(next) {
      match.map = registerCustomMap(ensurePieceIds(next));
      openAll(next);
      match.useLevel();
      const blocked = WALLS.some(
        (w) =>
          !w.soft &&
          w.h > p.y + 0.45 &&
          (w.bottom || 0) < p.y + 1.8 &&
          overlapsFootprint(w, p.x, p.z, 0.32),
      );
      const safe = blocked && playtestPoint(next, { x: p.x, z: p.z, y: p.y });
      if (blocked) {
        const fallback =
          safe ||
          safeArrival(next, { x: p.x, z: p.z, y: p.y }) ||
          safeArrival(next, { ...next.spawns.attacker, y: 0 });
        if (fallback)
          Object.assign(p, fallback, { vy: 0, grounded: true, clamber: null });
        return true;
      }
      return false;
    },
    step(input, dt) {
      p.input = input;
      p.yaw = input.yaw ?? p.yaw;
      p.pitch = input.pitch ?? p.pitch;
      match.tick(dt);
    },
    snapshot() {
      return match.snapshot("editor");
    },
  };
}
