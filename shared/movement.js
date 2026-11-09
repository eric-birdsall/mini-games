import { CONFIG } from "./config.js";
export const eyeHeight = (p) =>
  p.prone ? CONFIG.proneEye : p.crouch ? CONFIG.crouchEye : CONFIG.standingEye;
export function movementNoise(p, speed) {
  if (!p.alive || !p.grounded || speed < 0.05) return "silent";
  if (p.prone) return "crawl";
  if (p.crouch) return "crouch";
  return speed > CONFIG.walkSpeed + 0.2 ? "sprint" : "walk";
}
// Tap steps up one stance at a time: prone → crouch → stand, and stand →
// crouch. Holding enters prone and remains prone on release.
export class StanceControl {
  constructor() {
    this.reset();
  }
  reset() {
    this.stance = "standing";
    this.pressedAt = null;
    this.held = false;
  }
  down(now) {
    if (this.pressedAt === null) {
      this.pressedAt = now;
      this.held = false;
    }
  }
  update(now) {
    if (this.pressedAt !== null && now - this.pressedAt >= CONFIG.proneHoldMs) {
      this.stance = "prone";
      this.held = true;
    }
    return this.stance;
  }
  up(now) {
    if (this.pressedAt === null) return;
    this.update(now);
    if (!this.held)
      this.stance = this.stance === "crouch" ? "standing" : "crouch";
    this.cancel();
  }
  cancel() {
    this.pressedAt = null;
    this.held = false;
  }
}
