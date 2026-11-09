import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { useMap } from "../shared/maps.js";
import { WALLS } from "../shared/map.js";
import { CONFIG } from "../shared/config.js";
// A wall run: sprint along a long, tall wall and jump beside it.
const wall = (x, z, w, d, h = 4, extra = {}) => ({
  x,
  z,
  w,
  d,
  h,
  kind: "building",
  ...extra,
});
function run(boxes, script, ticks = 90, start = {}) {
  useMap("compound");
  const saved = [...WALLS];
  WALLS.splice(0, WALLS.length, ...boxes);
  try {
    const m = new Match("WALL", true, "seen", true, "compound");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    const p = m.players.a;
    // Running north (−z) with a wall face 0.13 m off your right shoulder.
    Object.assign(p, { x: 1.45, z: 8, y: 0, yaw: 0, ...start });
    const log = [];
    for (let i = 0; i < ticks; i++) {
      p.input = script(i);
      m.tick(1 / 30);
      log.push({
        x: p.x,
        y: p.y,
        z: p.z,
        running: !!p.wallRun,
        noise: p.noise,
        kick: !!p.kick,
      });
    }
    return { p, log };
  } finally {
    WALLS.splice(0, WALLS.length, ...saved);
  }
}
const long = wall(2, -5, 0.4, 30);
// Sprint forward and tap jump a third of a second in.
const sprintJump = (i) => ({
  forward: 1,
  sprint: true,
  jump: i >= 10 && i < 13,
});

test("sprint and jump beside a long wall: run along it, sinking, as loud as a sprint", () => {
  const { log } = run([long], sprintJump);
  const ran = log.filter((s) => s.running);
  assert.ok(ran.length > 0, "starts a run");
  const seconds = ran.length / 30;
  assert.ok(seconds > 1 && seconds <= CONFIG.wallRunSeconds + 0.05, "≈1.2 s");
  const distance = Math.abs(ran.at(-1).z - ran[0].z);
  assert.ok(distance > 4 && distance < 6.5, `≈5 m (${distance.toFixed(2)})`);
  assert.ok(
    Math.max(...ran.map((s) => s.y)) > 0.9,
    "carried up past low cover",
  );
  assert.ok(
    ran.at(-1).y < Math.max(...ran.map((s) => s.y)),
    "sinks at the end",
  );
  assert.ok(
    ran.every((s) => s.noise === "sprint"),
    "heard like a sprint",
  );
  assert.ok(
    ran.every((s) => Math.abs(s.x - 1.45) < 0.05),
    "stays on the wall",
  );
  // Longer in the air than the same jump without the wall.
  const plain = run([], sprintJump).log.filter((s) => s.y > 0).length;
  assert.ok(log.filter((s) => s.y > 0).length > plain + 15);
});

test("no run without sprint, facing into the wall, or on a short, low or round wall", () => {
  const none = (boxes, script = sprintJump, start) =>
    assert.equal(
      run(boxes, script, 60, start).log.some((s) => s.running),
      false,
    );
  none([long], (i) => ({ forward: 1, jump: i >= 10 && i < 13 }));
  // Heading 50° into the wall.
  none([long], sprintJump, { yaw: -0.87 });
  none([wall(2, 4, 0.4, 1.2)], sprintJump);
  none([wall(2, -5, 0.4, 30, 1.2)], sprintJump);
  none([wall(2.6, -5, 1.6, 1.6, 4, { shape: "cylinder" })], sprintJump);
  none([wall(2, -5, 0.12, 30, 4, { style: "halfwall" })], sprintJump);
});

test("one run per jump; a wall kick allows one more on another wall", () => {
  // After the run ends you fall, still beside the wall, without a second
  // run (holding jump would jump again on landing: a new jump, a new run).
  const once = run([long], sprintJump);
  let runs = 0;
  once.log.forEach((s, i) => {
    if (s.running && !once.log[i - 1]?.running) runs++;
  });
  assert.equal(runs, 1);
  // Kick off mid-run toward a facing wall 3 m across: a second run there.
  const across = wall(-1.6, -5, 0.4, 30);
  const kicked = run([long, across], (i) => ({
    forward: 1,
    sprint: true,
    jump: (i >= 10 && i < 13) || (i >= 25 && i < 28),
  }));
  assert.ok(
    kicked.log.some((s) => s.kick),
    "kicks off",
  );
  const kickAt = kicked.log.findIndex((s) => s.kick);
  assert.ok(kicked.log[kickAt + 8].x < 1.2, "away from the wall");
  assert.ok(
    kicked.log.slice(kickAt).some((s) => s.running && s.x < 0),
    "runs on the far wall",
  );
});
