// Where an aimed, placed gadget (tripwire anchor, camera, sensor) would go
// and whether it may. The server enforces this on use; the client draws the
// same verdict as a white (valid) or red (invalid) ghost while aiming.
import { CONFIG, SPAWNS } from "./config.js";
import { raySurface, distance, clearShot } from "./map.js";
import { baseOf } from "./variants.js";

// Wire ends sit just off their wall.
export const wireInset = (h) => ({
  x: h.x + h.normal.x * 0.03,
  y: h.y,
  z: h.z + h.normal.z * 0.03,
});

// The solid panel of a shutter lock (a gadget anchored at its ends like a
// wire): it spans its anchors along whichever axis they line up on, from the
// floor it was placed from, and reaches a little into each wall to seal it.
export function shutterBox(g) {
  const alongX = Math.abs(g.b.x - g.x) >= Math.abs(g.b.z - g.z),
    floor = g.floor || 0;
  return {
    x: (g.x + g.b.x) / 2,
    z: (g.z + g.b.z) / 2,
    w: alongX ? Math.abs(g.b.x - g.x) + 0.1 : 0.2,
    d: alongX ? 0.2 : Math.abs(g.b.z - g.z) + 0.1,
    ...(floor > 0 && { bottom: floor }),
    h: floor + CONFIG.shutterHeight,
    kind: "shutter",
    shutter: g.id,
  };
}

export function placementCheck(
  p,
  kind,
  { gadgets = [], anchor = null, span = 6, team } = {},
) {
  const hit = raySurface(p);
  if (!hit) return { ok: false, reason: "Aim at a surface within 7 m." };
  const no = (reason) => ({ ok: false, reason, hit });
  if (
    Object.values(SPAWNS).some((s) => distance(hit, s) < CONFIG.spawnProtection)
  )
    return no("Too close to a staging area.");
  // Only your own side's devices are in the way; you can place right next
  // to the other side's.
  if (
    gadgets.some(
      (d) => d.active && (!team || d.team === team) && distance(d, hit) < 0.5,
    )
  )
    return no("Overlaps one of your devices.");
  const base = baseOf(kind);
  if (base === "tripwire" || base === "shutter") {
    if (!hit.wall || hit.normal.y)
      return no(
        `Anchor the ${base === "shutter" ? "shutter" : "wire"} to a wall.`,
      );
    const height = hit.y - p.y;
    if (height < 0.1 || height > 1.5)
      return no(
        `Anchor ${height.toFixed(1)} m up: keep it 0.1–1.5 m above your footing.`,
      );
    if (!anchor) return { ok: true, hit, height };
    const length = Math.hypot(
      hit.x - anchor.x,
      hit.y - anchor.y,
      hit.z - anchor.z,
    );
    if (length < 1) return no("Anchors too close: at least 1 m apart.");
    if (length > span)
      return no(`Wire too long: ${length.toFixed(1)} m (max ${span} m).`);
    if (!clearShot(wireInset(anchor), wireInset(hit)))
      return no("The anchors can't see each other.");
    if (
      base === "shutter" &&
      Math.abs(hit.x - anchor.x) > 0.3 &&
      Math.abs(hit.z - anchor.z) > 0.3
    )
      return no("Line the anchors up straight across a doorway.");
    return {
      ok: true,
      hit,
      length,
      // The wire's height is its higher end.
      height: Math.max(height, anchor.y - p.y),
    };
  }
  if (base === "camera" && (!hit.wall || hit.normal.y))
    return no("Cameras go on a vertical wall.");
  if (base === "sensor" && hit.normal.y !== 1)
    return no("Sensors go on a floor or other flat top.");
  return { ok: true, hit };
}
