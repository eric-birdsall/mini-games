import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { OBJECTIVES } from "../shared/config.js";
import { distance } from "../shared/map.js";
import { useMap } from "../shared/maps.js";
// The solo opponent only knows what a player would: what's in its field of
// view, what it hears, and what its side's gadgets report.

const advance = (m, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
};
// A sentinel bot at (0, -16) facing +z (toward the infiltrator's side), or
// -z with `away`, held in place.
function sentinel({ away = false, level = "normal", map = "compound" } = {}) {
  const m = new Match("BOT", true, "seen", false, map);
  m.botLevel = level;
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  m.debug.stationary = true;
  Object.assign(m.players.bot, {
    x: 0,
    z: -16,
    yaw: away ? 0 : Math.PI,
    pitch: 0,
  });
  return m;
}
// Seconds until the bot has plainly seen the intruder ("!").
function timeToSpot(m) {
  for (let t = 0; t < 10; t += 1 / 30) {
    m.tick(1 / 30);
    if (m.players.bot.brain?.alert === "!") return t;
  }
  return Infinity;
}

test("a sentinel bot can't see behind itself", () => {
  const m = sentinel({ away: true }),
    a = m.players.a;
  Object.assign(a, { x: 0, z: -10, yaw: 0, input: {} });
  advance(m, 5);
  assert.equal(a.alive, true, "standing still right behind it");
  assert.equal(m.players.bot.brain.alert, null);
  assert.equal(m.snapshot("a").players.find((p) => p.bot).alert, null);
});

test("in front of it you're noticed, then identified; lying low takes longer", () => {
  const standing = sentinel();
  Object.assign(standing.players.a, { x: 0, z: -10, input: {} });
  const prone = sentinel();
  Object.assign(prone.players.a, { x: 0, z: -10, input: { prone: true } });
  const quick = timeToSpot(standing),
    slow = timeToSpot(prone);
  assert.ok(quick > 0.2 && quick < 1.5, `standing: ${quick.toFixed(2)} s`);
  assert.ok(slow > quick * 1.5, `prone: ${slow.toFixed(2)} s`);
  assert.equal(
    standing.snapshot("a").players.find((p) => p.bot).alert,
    "!",
    "the bot's '!' is shown to you",
  );
  advance(standing, 3.5);
  assert.equal(standing.players.a.alive, false);
});

test("Hard notices sooner than Normal, and Normal sooner than Easy", () => {
  const times = ["easy", "normal", "hard"].map((level) => {
    const m = sentinel({ level });
    Object.assign(m.players.a, { x: 0, z: -10, input: {} });
    return timeToSpot(m);
  });
  assert.ok(times[0] > times[1] && times[1] > times[2], times.join(" > "));
});

test("it hears running behind it and turns, but not someone creeping", () => {
  const run = sentinel({ away: true }),
    a = run.players.a;
  // Running across, 5 m behind it.
  Object.assign(a, {
    x: -6,
    z: -11,
    yaw: -Math.PI / 2,
    input: { forward: 1, sprint: true },
  });
  advance(run, 1.2);
  // Heard, then (once facing that way) seen.
  assert.ok(["heard", "glimpse"].includes(run.players.bot.brain.lead?.why));
  const facing = Math.cos(run.players.bot.yaw - Math.PI);
  assert.ok(facing > 0.5, "turned round toward the sound");

  const creep = sentinel({ away: true });
  Object.assign(creep.players.a, {
    x: -6,
    z: -11,
    yaw: -Math.PI / 2,
    input: { forward: 1, crouch: true },
  });
  advance(creep, 1.2);
  assert.equal(creep.players.bot.brain.lead, undefined);
  assert.ok(Math.cos(creep.players.bot.yaw) > 0.99, "still facing away");
});

test("a terminal alert sends the sentinel bot to that terminal", () => {
  const m = new Match("ALERT", true, "seen", false, "docks");
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.activate();
  const bot = m.players.bot,
    site = OBJECTIVES[0];
  Object.assign(m.players.a, { x: 0, z: 30 });
  m.botFocus = { site: site.id, until: (m.clock || 0) + 20 };
  const start = distance(bot, site);
  advance(m, 2);
  assert.equal(bot.brain.lead.why, "terminal");
  assert.ok(distance(bot, site) < start - 4, "on its way, at a run");
  useMap("compound");
});

test("an infiltrator bot that's looked at throws smoke and gets out of sight", () => {
  const m = new Match("SEEN", true, "seen", false, "compound");
  m.addPlayer("d", "defender");
  m.addPlayer("bot", "attacker", true);
  m.activate();
  const bot = m.players.bot,
    d = m.players.d;
  assert.equal(bot.inventory.smoke, 2, "a solo infiltrator carries smoke");
  Object.assign(bot, { x: 0, z: 18, yaw: 0, direct: true, path: null });
  Object.assign(d, { x: 0, z: 10, yaw: Math.PI, pitch: 0 });
  advance(m, 0.5);
  assert.equal(bot.inventory.smoke, 1, "smoke thrown");
  assert.equal(bot.brain.task.kind, "hide");
  advance(m, 3.5);
  assert.equal(bot.alive, true);
  assert.ok(distance(bot, { x: 0, z: 18 }) > 3, "moved off");
  assert.equal(m.pairs["d:bot"], 0, "out of sight");
});

test("an infiltrator bot jumps a low tripwire it has marked", () => {
  for (const marked of [true, false]) {
    const m = new Match("WIRE", true, "seen", false, "compound");
    m.addPlayer("d", "defender");
    m.addPlayer("bot", "attacker", true);
    m.debug.botRoute = 0;
    m.activate();
    m.players.d.alive = false;
    const bot = m.players.bot;
    // Its first route heads north along x 4.6 from about z 20.
    advance(m, 1.5);
    m.gadgets.push({
      id: 900,
      kind: "tripwire",
      team: "defender",
      owner: "d",
      active: true,
      marked,
      x: 3,
      y: 0.32,
      z: 16,
      b: { x: 6.5, y: 0.32, z: 16 },
    });
    let caught = false;
    for (let i = 0; i < 90; i++) {
      m.tick(1 / 30);
      caught ||= bot.immobile > 0;
    }
    assert.equal(caught, !marked, marked ? "jumped it" : "didn't know");
    if (marked) assert.ok(bot.z < 15, "on past the wire");
  }
});
