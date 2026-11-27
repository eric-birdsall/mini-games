import { padState } from "./padBridge.js";

// Keep seats stable when a controller disconnects. New/returning controllers
// must release action and pause buttons before they can trigger anything.
export class TwoPlayerPads {
  constructor() {
    this.seats = [];
    this.previous = new Map();
  }
  reset() {
    this.previous.clear();
  }
  read(pads) {
    const connected = Array.from(pads || []).filter(
      (p) => p && p.connected !== false,
    );
    for (const pad of connected) {
      if (!this.seats.includes(pad.index) && this.seats.length < 2)
        this.seats.push(pad.index);
    }
    return [0, 1].map((seat) => {
      const index = this.seats[seat];
      const pad = connected.find((p) => p.index === index);
      if (!pad) {
        this.previous.delete(index);
        return {
          left: false,
          right: false,
          action: false,
          hold: false,
          tug: false,
          pause: false,
        };
      }
      const now = padState(pad);
      const was = this.previous.get(index);
      this.previous.set(index, now);
      return {
        left: now.left,
        right: now.right,
        action: !!was && now.action && !was.action,
        // A / RT held down, and a fresh X / LT press (Kite Day).
        hold: !!was && now.action,
        tug: !!was && now.pump && !was.pump,
        pause: !!was && ((now.b && !was.b) || (now.menu && !was.menu)),
      };
    });
  }
}
