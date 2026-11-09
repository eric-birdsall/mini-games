import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { distance } from "../shared/map.js";
import { CONFIG, OBJECTIVES } from "../shared/config.js";
// Plant & defend on Pier 9: plant an uplink at A or C, then the sentinel
// has to pull it before it transmits.
function match({ mode = "plant", training = false } = {}) {
  const m = new Match("PLNT", false, "seen", training, "docks");
  m.objectiveMode = mode;
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  // Out of each other's sight: the sentinel back in its spawn corridor.
  Object.assign(m.players.d, { x: 0, z: -35.5, yaw: 0 });
  return m;
}
// Run the match, holding `a` for the infiltrator and `d` for the sentinel.
function advance(m, seconds, a = {}, d = {}) {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    m.players.a.input = { ...a };
    m.players.d.input = { ...d };
    m.tick(1 / 30);
  }
}
const hold = { interact: true };
// Stand on a terminal's south side, in reach.
function at(m, who, id) {
  m.useLevel();
  const t = OBJECTIVES.find((o) => o.id === id);
  Object.assign(m.players[who], { x: t.x, z: t.z + 1.4, y: 0, yaw: 0 });
  return t;
}
function planted(m, id = "A") {
  at(m, "a", id);
  advance(m, CONFIG.plantSeconds + 0.1, hold);
  assert.equal(m.uplink?.site, id);
}

test("plant mode trims Pier 9 to A and C; extract keeps all three", () => {
  const m = match();
  m.useLevel();
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "C"],
  );
  assert.equal(m.snapshot("a").objectiveMode, "plant");
  const e = match({ mode: "extract" });
  e.useLevel();
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "B", "C"],
  );
  useMap("compound");
});

test("the plant completes at 3 s and alerts the sentinel at once", () => {
  const m = match();
  at(m, "a", "C");
  advance(m, CONFIG.plantSeconds - 0.2, hold);
  assert.equal(m.uplink, null, "not yet");
  assert.ok(
    !m.events.some((e) => e.team === "defender" && /Uplink/.test(e.text)),
    "nothing is sent while planting",
  );
  advance(m, 0.3, hold);
  assert.equal(m.uplink.site, "C");
  assert.ok(m.uplink.remaining > CONFIG.uplinkSeconds - 0.2);
  assert.ok(
    m.events.some(
      (e) => e.team === "defender" && /planted at Terminal C/.test(e.text),
    ),
  );
  assert.equal(m.botFocus.site, "C");
  // Both teams see it.
  assert.equal(m.snapshot("d").uplink.site, "C");
  // Only once a round: the other terminal can't take a second one.
  at(m, "a", "A");
  advance(m, CONFIG.plantSeconds + 0.5, hold);
  assert.equal(m.uplink.site, "C");
});

test("the plant resets on release", () => {
  const m = match();
  at(m, "a", "A");
  advance(m, 2, hold);
  advance(m, 0.2);
  advance(m, 2, hold);
  assert.equal(m.uplink, null);
});

test("only the sentinel can defuse, and it resets on release", () => {
  const m = match();
  planted(m, "A");
  // The infiltrator can't pull its own uplink.
  advance(m, CONFIG.defuseSeconds + 0.5, hold);
  assert.ok(m.uplink && !m.result);
  at(m, "d", "A");
  Object.assign(m.players.a, { x: 0, z: 34 });
  advance(m, CONFIG.defuseSeconds - 1, {}, hold);
  assert.ok(m.uplink.defuse > CONFIG.defuseSeconds - 1.2);
  advance(m, 0.2);
  assert.equal(m.uplink.defuse, 0, "let go: back to zero");
  advance(m, CONFIG.defuseSeconds - 1, {}, hold);
  assert.ok(!m.result, "the earlier hold doesn't count");
});

test("a defuse wins it for the sentinels", () => {
  const m = match();
  planted(m, "A");
  Object.assign(m.players.a, { x: 0, z: 34 });
  at(m, "d", "A");
  advance(m, CONFIG.defuseSeconds + 0.1, {}, hold);
  assert.equal(m.result?.winner, "defender");
  assert.equal(m.result.reason, "Uplink pulled");
});

test("the uplink countdown replaces the round clock and wins at zero", () => {
  const m = match();
  m.time = 10;
  planted(m, "A");
  const clock = m.time;
  advance(m, 20);
  assert.equal(m.time, clock, "the round clock stops once planted");
  assert.ok(!m.result, "the uplink outlasts the round clock");
  advance(m, CONFIG.uplinkSeconds - 20 + 0.2);
  assert.equal(m.result?.winner, "attacker");
  assert.equal(m.result.reason, "Uplink complete");
});

test("the round clock running out before a plant: sentinels win", () => {
  const m = match();
  m.time = 1;
  advance(m, 1.1);
  assert.equal(m.result?.winner, "defender");
});

test("the infiltrator's elimination after a plant doesn't end the round", () => {
  const m = match();
  planted(m, "A");
  // Sentinel stares at the infiltrator for the identification time.
  const t = OBJECTIVES.find((o) => o.id === "A");
  Object.assign(m.players.d, { x: t.x, z: t.z + 3, y: 0, yaw: 0, pitch: 0 });
  advance(m, CONFIG.detectionSeconds + 0.5);
  assert.equal(m.players.a.alive, false);
  assert.ok(!m.result, "the uplink is still live");
  at(m, "d", "A");
  advance(m, CONFIG.defuseSeconds + 0.1, {}, hold);
  assert.equal(m.result?.winner, "defender");
});

test("the infiltrator's elimination before a plant: sentinels win", () => {
  const m = match();
  const t = at(m, "a", "A");
  Object.assign(m.players.d, { x: t.x, z: t.z + 3, y: 0, yaw: 0, pitch: 0 });
  advance(m, CONFIG.detectionSeconds + 0.5);
  assert.equal(m.result?.winner, "defender");
});

test("extract mode is unchanged: holds keep progress, alerts are delayed", () => {
  const m = match({ mode: "extract" });
  at(m, "a", "B");
  advance(m, 2, hold);
  advance(m, 1);
  assert.ok(Math.abs(m.progress.B - 2) < 0.1);
  assert.equal(m.uplink, null);
  assert.ok(m.events.some((e) => /activity detected/.test(e.text)));
  useMap("compound");
});

test("the sentinel bot runs to a planted uplink and pulls it", () => {
  for (const site of ["A", "C"]) {
    const m = new Match("PULL", true, "seen", false, "docks");
    m.objectiveMode = "plant";
    m.addPlayer("a", "attacker");
    m.addPlayer("bot", "defender", true);
    m.phase = "active";
    m.time = 240;
    // The bot starts on the far terminal: the worst case, ~41 m.
    m.useLevel();
    const far = OBJECTIVES.find((o) => o.id !== site);
    Object.assign(m.players.bot, { x: far.x, z: far.z + 2, yaw: 0 });
    at(m, "a", site);
    for (let i = 0; i < (CONFIG.plantSeconds + 0.1) * 30; i++) {
      m.players.a.input = hold;
      m.tick(1 / 30);
    }
    assert.equal(m.uplink?.site, site);
    // The infiltrator walks off and is out of the picture.
    m.players.a.alive = false;
    for (let i = 0; i < CONFIG.uplinkSeconds * 30 && !m.result; i++)
      m.tick(1 / 30);
    assert.equal(m.result?.reason, "Uplink pulled", site);
    assert.ok(
      m.uplink.remaining > 10,
      `${site}: pulled with ${m.uplink.remaining.toFixed(1)} s to spare`,
    );
  }
  useMap("compound");
});

test("the infiltrator bot plants on every route, then waits at a lookout", () => {
  // Pier 9 and the older maps' sites (see plantSites).
  for (const id of ["docks", "compound", "lanes", "quad", "monolith"])
    for (const rule of ["seen", "soak"]) botPlants(id, rule);
  useMap("compound");
});
function botPlants(id, rule) {
  useMap(id);
  MAPS[id].botRoutes.forEach((route, r) =>
    [0, 1].forEach((goal) => {
      const m = new Match("PLNT", true, rule, false, id);
      m.objectiveMode = "plant";
      m.addPlayer("d", "defender");
      m.addPlayer("bot", "attacker", true);
      m.debug.botRoute = r;
      m.debug.botGoal = goal;
      m.useLevel();
      const site = OBJECTIVES[goal];
      m.activate();
      m.players.d.alive = false;
      for (let i = 0; i < 150 * 30 && !m.uplink; i++) m.tick(1 / 30);
      const name = `${id} ${rule}: ${route.name} → ${site.name}`;
      assert.equal(m.uplink?.site, site.id, name);
      for (let i = 0; i < 15 * 30; i++) m.tick(1 / 30);
      const bot = m.players.bot,
        d = distance(bot, site);
      assert.ok(d > 3 && d < 13.5, `${name}: ${d.toFixed(1)} m off`);
      assert.ok(bot.crouch, `${name}: holding low`);
    }),
  );
}
