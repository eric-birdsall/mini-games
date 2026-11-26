import test from "node:test";
import assert from "node:assert/strict";
import { GameTimers } from "../src/gameTimers.js";

function setup() {
  let time = 0,
    next = 0;
  const pending = new Map();
  const timers = new GameTimers({
    now: () => time,
    set: (fn, ms) => {
      const id = ++next;
      pending.set(id, { at: time + ms, fn });
      return id;
    },
    clear: (id) => pending.delete(id),
  });
  const advance = (ms) => {
    const end = time + ms;
    while (true) {
      const due = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
      if (!due || due[1].at > end) break;
      time = due[1].at;
      pending.delete(due[0]);
      due[1].fn();
    }
    time = end;
  };
  return { timers, advance };
}

test("pausing a round preserves remaining effect timing across a long pause", () => {
  const { timers, advance } = setup();
  const effects = [];
  timers.later(() => {
    effects.push("hit");
    timers.later(() => effects.push("star"), 350);
  }, 650);
  advance(200);
  timers.pause();
  advance(10000);
  assert.deepEqual(effects, []);
  timers.resume();
  advance(449);
  assert.deepEqual(effects, []);
  advance(1);
  assert.deepEqual(effects, ["hit"]);
  advance(349);
  assert.deepEqual(effects, ["hit"]);
  advance(1);
  assert.deepEqual(effects, ["hit", "star"]);
});
test("restarting while paused discards effects and the pending results screen", () => {
  const { timers, advance } = setup();
  let old = 0,
    fresh = 0;
  timers.later(() => old++, 1800);
  advance(100);
  timers.pause();
  timers.clear();
  timers.later(() => fresh++, 100);
  advance(5000);
  timers.resume();
  advance(5000);
  assert.equal(old, 0);
  assert.equal(fresh, 1);
});
test("repeated pause/resume and scheduling while paused preserve delays", () => {
  const { timers, advance } = setup();
  let count = 0;
  timers.pause();
  timers.pause();
  timers.later(() => count++, 100);
  advance(500);
  timers.resume();
  timers.resume();
  advance(40);
  timers.pause();
  advance(500);
  timers.resume();
  advance(59);
  assert.equal(count, 0);
  advance(1);
  assert.equal(count, 1);
});
