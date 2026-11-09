// Shared throwing feedback for the HUD and authoritative server rejection.
export function weaponBlockReason(p, phase) {
  if (phase !== "active")
    return "Water balloons unlock when infiltration starts.";
  if (!p.alive) return "You have been eliminated.";
  if (!p.inventory[p.equipped]) return "Nothing to throw — switch equipment.";
  if (p.camera || p.mirror) return "Leave the camera view to throw.";
  if (p.immobile > 0) return "Restrained — can't throw.";
  if (p.blind > 0) return "Blinded — can't throw.";
  return null;
}
