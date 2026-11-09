import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { CONFIG, GADGETS } from "../shared/config.js";
import { soften } from "../shared/kidWords.js";
import { baseOf } from "../shared/variants.js";
import { throwPath } from "../shared/throwing.js";
// Splash, the kid-friendly rule: water balloons.
// Unlimited, one every 0.7 s, thrown on an arc; three splashes soak you out.

const advance = (m, seconds) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) m.tick(1 / 30);
};
// Infiltrator at z 18 facing the sentinel at z 10, on open floor.
function game(rule = "splash", training = false) {
  const m = new Match("SPLASH", false, rule, training, "compound");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  Object.assign(m.players.a, { x: 0, z: 18, y: 0, yaw: 0, pitch: 0 });
  Object.assign(m.players.d, { x: 0, z: 10, y: 0, yaw: Math.PI, pitch: 0 });
  return m;
}
// The pitch that lands a balloon `d` metres ahead at chest height.
function lob(m, d) {
  let best = 0,
    miss = Infinity;
  for (let pitch = -0.6; pitch < 0.6; pitch += 0.005) {
    const rest = Math.abs(
      landingZ({ ...m.players.a, pitch }) - (m.players.a.z - d),
    );
    if (rest < miss) [best, miss] = [pitch, rest];
  }
  return best;
}
// Where the arc passes chest height (1.2 m) on the way down.
function landingZ(p) {
  const { points } = throwPath(p, CONFIG.balloonRange);
  const down = points.findIndex(
    (q, i) => i > 0 && q.y < 1.2 && points[i - 1].y >= 1.2,
  );
  return (points[down] || points.at(-1)).z;
}

test("Splash arms everyone with water balloons that never run out", () => {
  const m = game(),
    a = m.players.a;
  assert.equal(m.kid, true, "Splash is always kid-friendly");
  assert.equal(a.equipped, "balloon");
  assert.equal(a.inventory.sidearm, undefined, "no gun");
  for (let i = 0; i < 12; i++) {
    m.attack(a);
    advance(m, 0.75);
  }
  assert.equal(a.inventory.balloon, 1, "still in hand");
  assert.ok(m.stats.equipment === 0, "not counted as a device");
});

test("a throw flies an arc; one every 0.7 s", () => {
  const m = game(),
    a = m.players.a;
  a.yaw = Math.PI / 2;
  m.attack(a);
  const first = m.projectiles[0];
  m.attack(a);
  assert.equal(m.projectiles.length, 1, "the second is too soon");
  assert.equal(first.kind, "balloon");
  assert.ok(first.points.length > 10, "an arc, not a straight line");
  advance(m, GADGETS.balloon.cooldown + 0.05);
  m.attack(a);
  assert.notEqual(m.projectiles.at(-1).id, first.id, "thrown again");
});

test("Splash is always a training game: soaked carries on, nobody wins", () => {
  const m = game(),
    a = m.players.a,
    d = m.players.d;
  assert.equal(m.training, true);
  assert.equal(m.solo, true);
  a.pitch = lob(m, 8);
  for (let i = 1; i < 3; i++) {
    m.attack(a);
    advance(m, 1.2);
    assert.equal(d.hits, i, `splash ${i}`);
  }
  m.attack(a);
  advance(m, 1.2);
  assert.equal(d.alive, true);
  assert.equal(d.hits, 0, "droplets reset");
  assert.equal(m.phase, "active");
  assert.ok(!m.result, "no winner or loser");
  assert.ok(m.events.some((e) => e.text.startsWith("Soaked!")));
  const time = m.time;
  advance(m, 2);
  assert.equal(m.time, time, "no timer");
});

test("Splash skips the loadout: every gadget it allows, always stocked", () => {
  const m = new Match("KIT", false, "splash", false, "compound");
  m.addPlayer("a", "attacker");
  const a = m.players.a;
  for (const [k, g] of Object.entries(GADGETS))
    if (!g.modeWeapon && m.canUse(a, g) && m.chosenType(a, baseOf(k)) === k)
      assert.equal(a.inventory[k], g.limit, k);
  assert.equal(a.inventory.balloon, 1);
});

test("a near miss on the ground still splashes; a wide one doesn't", () => {
  const m = game(),
    d = m.players.d,
    land = (x) =>
      m.detonate({
        kind: "balloon",
        owner: "a",
        team: "attacker",
        landing: { x, y: 0, z: 10 },
      });
  land(0.6);
  assert.equal(d.hits, 1, "0.6 m off: splashed");
  land(CONFIG.splashRadius + 0.5);
  assert.equal(d.hits, 1, "too far off: dry");
});

test("a direct hit splashes others standing close by", () => {
  const m = game(),
    d = m.players.d,
    decoy = (x) => ({
      team: "defender",
      x,
      y: 0,
      z: 10,
      active: true,
      crouch: false,
      prone: false,
    }),
    near = decoy(1.2),
    far = decoy(CONFIG.splashRadius + 1);
  m.decoys.push(near, far);
  m.burst({ owner: "a", team: "attacker" }, { x: 0, y: 1.2, z: 10 }, d);
  assert.equal(d.hits, 1, "the target");
  assert.equal(near.hits, 1, "the one beside them");
  assert.equal(far.hits, undefined, "too far off: dry");
});

test("a balloon fizzles out a device it splashes", () => {
  const m = game(),
    a = m.players.a;
  m.players.d.x = 10;
  m.gadgets.push({
    id: 77,
    kind: "camera",
    team: "defender",
    owner: "d",
    active: true,
    x: 0,
    y: 1.2,
    z: 10,
    yaw: 0,
  });
  a.pitch = lob(m, 8);
  m.attack(a);
  advance(m, 1.5);
  assert.equal(m.gadgets[0].active, false);
});

test("splashes and throws are heard nearby, not across the map", () => {
  const m = game(),
    a = m.players.a;
  a.pitch = lob(m, 8);
  m.attack(a);
  const throwSound = m.snapshot("d").splashes[0];
  assert.equal(throwSound.kind, "throw");
  assert.equal(throwSound.range, CONFIG.throwHearing);
  advance(m, 1.2);
  const burst = m.snapshot("d").splashes.find((t) => t.kind === "burst");
  assert.equal(burst.range, CONFIG.splashHearing);
  assert.equal(m.snapshot("d").shots, undefined, "no gunshots at all");
});

test("kid-friendly words come with Splash only", () => {
  assert.equal(soften("Intruder visually identified"), "Infiltrator spotted");
  assert.equal(soften("Flashbang thrown."), "Glitter popper thrown.");
  assert.equal(
    soften("Blinded — weapon unavailable."),
    "Dazzled — balloons unavailable.",
  );
  assert.equal(soften("YOU HAVE BEEN ELIMINATED"), "YOU HAVE BEEN OUT");
  const m = game();
  m.notify("Flashbang thrown.");
  assert.equal(m.events.at(-1).text, "Glitter popper thrown.");
  for (const rule of ["seen", "soak"])
    assert.equal(new Match("STD", false, rule).kid, false, rule);
});

test("Splash's shop keeps four simple gadgets, the same for both sides", () => {
  const m = game(),
    kinds = (team) =>
      Object.keys(GADGETS).filter((k) => m.canUse({ team }, GADGETS[k]));
  // Both sides carry all four (Splash is played as training).
  const four = ["flashbang", "pulse", "shutter", "smoke"];
  assert.deepEqual(kinds("attacker").sort(), four);
  assert.deepEqual(kinds("defender").sort(), four);
  m.action("a", { type: "buy", gadget: "cloak" });
  assert.ok(!m.players.a.inventory.cloak, "no cloak");
  // A solo sentinel bot has no camera or tripwire to place.
  const solo = new Match("BOT", true, "splash", false, "compound");
  solo.addPlayer("a", "attacker");
  solo.addPlayer("bot", "defender", true);
  solo.activate();
  advance(solo, 4);
  assert.deepEqual(
    solo.gadgets.map((g) => g.kind),
    [],
  );
});

test("every balloon is a random bright colour", () => {
  const m = game(),
    a = m.players.a,
    colours = new Set([a.balloonColor]);
  a.yaw = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const next = a.balloonColor;
    m.attack(a);
    assert.equal(m.projectiles.at(-1).color, next, "throws the one in hand");
    colours.add(a.balloonColor);
    advance(m, 0.75);
  }
  assert.ok(colours.size > 3);
  assert.match([...colours][0], /^hsl\(\d+, 90%, \d+%\)$/);
});

test("a bot lobs at where you stand: standing gets you wet, moving dodges", () => {
  const hitsAfter = (input) => {
    const m = new Match("BOT", true, "splash", false, "compound");
    m.addPlayer("a", "attacker");
    m.addPlayer("bot", "defender", true);
    m.phase = "active";
    m.time = 240;
    m.debug.stationary = true;
    Object.assign(m.players.bot, { x: 0, z: 8, yaw: Math.PI, pitch: 0 });
    Object.assign(m.players.a, { x: -3, z: 18, yaw: -Math.PI / 2, input });
    advance(m, 3);
    return m.players.a.hits || 0;
  };
  assert.ok(hitsAfter({}) >= 1, "standing still");
  assert.equal(hitsAfter({ forward: 1 }), 0, "walking across");
});

test("a splashed bot runs away for a moment, then carries on", () => {
  const m = new Match("FLEE", true, "splash", false, "compound");
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  const a = m.players.a,
    bot = m.players.bot;
  Object.assign(bot, { x: 0, z: 12, y: 0, yaw: 0, pitch: 0 });
  Object.assign(a, { x: 0, z: 18, y: 0, yaw: 0, pitch: 0 });
  m.landHit(a, bot);
  assert.equal(
    m.snapshot("a").players.find((p) => p.id === "bot").fleeing,
    true,
  );
  const before = Math.hypot(bot.x - a.x, bot.z - a.z);
  advance(m, 1.5);
  assert.ok(Math.hypot(bot.x - a.x, bot.z - a.z) > before + 2, "got away");
  advance(m, CONFIG.splashFlee);
  assert.equal(
    m.snapshot("a").players.find((p) => p.id === "bot").fleeing,
    false,
  );
});

test("Splash: everyone glows through walls to the other side every few seconds", () => {
  const m = game();
  m.activeTime = 0;
  advance(m, CONFIG.splashGlowEvery - 0.5);
  assert.deepEqual(m.snapshot("a").revealed, []);
  advance(m, 1);
  assert.deepEqual(m.snapshot("a").revealed, ["d"]);
  assert.deepEqual(m.snapshot("d").revealed, ["a"]);
  advance(m, CONFIG.splashGlowSeconds);
  assert.deepEqual(m.snapshot("a").revealed, []);
  // Other rules don't glow.
  const s = game("seen");
  s.activeTime = 0;
  advance(s, CONFIG.splashGlowEvery + 0.5);
  assert.deepEqual(s.snapshot("a").revealed, []);
});

test("splash: the robot's difficulty can change mid-match", () => {
  const m = game();
  m.action("a", { type: "botLevel", level: "easy" });
  assert.equal(m.botLevel, "easy");
  assert.equal(m.snapshot("a").botLevel, "easy");
  m.action("a", { type: "botLevel", level: "silly" });
  assert.equal(m.botLevel, "easy");
  const soak = game("soak");
  soak.action("a", { type: "botLevel", level: "hard" });
  assert.equal(soak.botLevel, "normal");
});
