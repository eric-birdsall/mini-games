// Freeze scripted game steps together with their visual animations.
export class GameTimers {
  constructor(
    clock = {
      now: () => performance.now(),
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (id) => clearTimeout(id),
    },
  ) {
    this.clock = clock;
    this.jobs = new Set();
    this.paused = false;
  }
  later(fn, ms) {
    const job = { fn, remaining: ms };
    this.jobs.add(job);
    if (!this.paused) this.arm(job);
  }
  arm(job) {
    job.started = this.clock.now();
    job.id = this.clock.set(() => {
      this.jobs.delete(job);
      job.fn();
    }, job.remaining);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    for (const job of this.jobs) {
      this.clock.clear(job.id);
      job.remaining = Math.max(
        0,
        job.remaining - (this.clock.now() - job.started),
      );
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const job of this.jobs) this.arm(job);
  }
  clear() {
    for (const job of this.jobs) this.clock.clear(job.id);
    this.jobs.clear();
    this.paused = false;
  }
}
