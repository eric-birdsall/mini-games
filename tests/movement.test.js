import { test } from "node:test";
import assert from "node:assert/strict";
import { StanceControl, eyeHeight, movementNoise } from "../shared/movement.js";
import { CONFIG, MOVEMENT_AUDIO } from "../shared/config.js";
import { Match } from "../server/simulation.js";
test("C tap crouches, second tap stands; hold goes prone; from prone a tap crouches, then stands", () => {
  const c = new StanceControl();
  c.down(0);
  c.up(100);
  assert.equal(c.stance, "crouch");
  c.down(200);
  c.up(300);
  assert.equal(c.stance, "standing");
  c.down(400);
  c.update(900);
  assert.equal(c.stance, "prone");
  c.up(1000);
  assert.equal(c.stance, "prone");
  c.down(1100);
  c.up(1150);
  assert.equal(c.stance, "crouch", "prone → crouch-walk");
  c.down(1200);
  c.up(1250);
  assert.equal(c.stance, "standing", "crouch → stand");
});
test("movement noise is silent at rest and ordered crawl to sprint", () => {
  const p = { alive: true, grounded: true, prone: true };
  assert.equal(movementNoise(p, 0), "silent");
  assert.equal(movementNoise(p, 0.65), "crawl");
  p.prone = false;
  p.crouch = true;
  assert.equal(movementNoise(p, 1.8), "crouch");
  p.crouch = false;
  assert.equal(movementNoise(p, 3.5), "walk");
  assert.equal(movementNoise(p, 5.5), "sprint");
  assert.ok(
    MOVEMENT_AUDIO.crawl.gain < MOVEMENT_AUDIO.crouch.gain &&
      MOVEMENT_AUDIO.crouch.gain < MOVEMENT_AUDIO.walk.gain &&
      MOVEMENT_AUDIO.walk.gain < MOVEMENT_AUDIO.sprint.gain,
  );
});
test("prone lowers authoritative eye, limits speed, prevents jumping and replicates sound", () => {
  const m = new Match("MOVE");
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  const p = m.players.a;
  m.action("a", {
    type: "input",
    input: { forward: 1, prone: true, sprint: true, jump: true },
  });
  m.tick(1 / 30);
  assert.equal(p.y, 0);
  assert.equal(m.eye(p).y, CONFIG.proneEye);
  assert.ok(Math.abs(p.moveSpeed - CONFIG.proneSpeed) < 0.001);
  assert.equal(m.snapshot("a").players[0].noise, "crawl");
  m.action("a", { type: "input", input: { prone: true } });
  m.tick(1 / 30);
  assert.equal(p.noise, "silent");
});

test("sprint then crouch slides you forward, low, and further than a crouch walk", async () => {
  const { Match } = await import("../server/simulation.js");
  const { CONFIG } = await import("../shared/config.js");
  const run = (crouchAt, ticks = 60) => {
    // Down Pier 9's open east yard aisle.
    const m = new Match("SLIDE", true, "seen", false, "docks");
    m.addPlayer("a", "attacker");
    m.phase = "active";
    m.time = 240;
    const a = m.players.a;
    Object.assign(a, {
      x: 5.6,
      z: 20,
      yaw: 0,
      input: { forward: 1, sprint: true },
    });
    const log = [];
    for (let i = 0; i < ticks; i++) {
      // The client sends a slide request (not a crouch) for this press.
      if (i === crouchAt) a.input = { forward: 1, sprint: true, slide: 1 };
      m.tick(1 / 30);
      log.push({ z: a.z, slide: !!a.slide, crouch: a.crouch, noise: a.noise });
    }
    return { a, log };
  };
  // Sprint for half a second, then press crouch.
  const { log } = run(15);
  const during = log.slice(16, 15 + Math.round(CONFIG.slideSeconds * 30) - 1);
  assert.ok(
    during.every((t) => t.slide && t.crouch),
    "sliding, low",
  );
  assert.ok(
    during.every((t) => t.noise === "walk"),
    "it scrapes",
  );
  const slid = log[15].z - log[15 + Math.round(CONFIG.slideSeconds * 30)].z;
  assert.ok(
    slid > CONFIG.walkSpeed * CONFIG.slideSeconds * 1.2,
    `slid ${slid.toFixed(2)} m`,
  );
  assert.ok(!log.at(-1).slide, "over");
  assert.ok(!log.at(-1).crouch, "back on your feet");
  // Still holding sprint, you're running again straight after.
  assert.ok(log.at(-1).noise === "sprint", `then ${log.at(-1).noise}`);
  // Crouching from a walk (no sprint) is just a crouch.
  const m = new Match("SLIDE", true, "seen", false, "docks");
  m.addPlayer("a", "attacker");
  m.phase = "active";
  m.time = 240;
  const a = m.players.a;
  Object.assign(a, { x: 5.6, z: 20, yaw: 0, input: { forward: 1 } });
  for (let i = 0; i < 15; i++) m.tick(1 / 30);
  a.input = { forward: 1, slide: 1 };
  m.tick(1 / 30);
  assert.ok(!a.slide, "walking: no slide");
});
