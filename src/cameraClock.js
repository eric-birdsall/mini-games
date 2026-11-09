// A jammed feed advances for six seconds, then holds for one. It loses one
// second per seven-second cycle; it does not jump forward after the hold.
export class CameraClocks {
  constructor() {
    this.feeds = new Map();
  }
  sample(id, jammed, wallTime = Date.now(), elapsedTime = performance.now()) {
    let clock = this.feeds.get(id);
    if (!jammed) {
      this.feeds.set(id, { jammed: false });
      return wallTime;
    }
    if (!clock?.jammed) {
      clock = { jammed: true, started: elapsedTime, timestamp: wallTime };
      this.feeds.set(id, clock);
    }
    const elapsed = Math.max(0, elapsedTime - clock.started);
    const cycle = Math.floor(elapsed / 7000);
    const phase = elapsed % 7000;
    return clock.timestamp + cycle * 6000 + Math.min(phase, 6000);
  }
}
