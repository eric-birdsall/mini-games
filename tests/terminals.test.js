import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS, useMap } from "../shared/maps.js";
import { WALLS } from "../shared/map.js";
import { CONFIG, OBJECTIVES, SPAWNS } from "../shared/config.js";
import { decoyPath } from "../shared/decoy.js";
// Pier 9 has three data terminals; extracting two of them wins.
function match(training = false) {
  const m = new Match("TERM", false, "seen", training, "docks");
  m.addPlayer("a", "attacker");
  m.addPlayer("d", "defender");
  m.phase = "active";
  m.time = 240;
  // Out of each other's way: the sentinel far off in its spawn corridor.
  Object.assign(m.players.d, { x: 0, z: -35.5, yaw: 0 });
  return m;
}
function advance(m, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) {
    m.players.a.input = { ...input };
    m.tick(1 / 30);
  }
}
// Stand on a terminal's south side, in capture range.
const at = (m, id) => {
  const t = OBJECTIVES.find((o) => o.id === id);
  Object.assign(m.players.a, { x: t.x, z: t.z + 1.4, y: 0, yaw: 0 });
  return t;
};
const pathLength = (a, b) => {
  const route = decoyPath(a, b);
  if (!route) return Infinity;
  let total = 0,
    from = a;
  for (const p of route) {
    total += Math.hypot(p.x - from.x, p.z - from.z);
    from = p;
  }
  return total;
};

test("Pier 9 has three solid terminals, each a fair walk from each spawn", () => {
  useMap("docks");
  assert.deepEqual(
    OBJECTIVES.map((o) => o.id),
    ["A", "B", "C"],
  );
  for (const t of OBJECTIVES) {
    assert.ok(t.terminal);
    assert.ok(
      WALLS.some((w) => w.kind === "terminal" && w.x === t.x && w.z === t.z),
      `${t.name} has a console to bump into`,
    );
    const front = { x: t.x, z: t.z + 1.2 },
      fromStaging = pathLength(SPAWNS.attacker, front),
      fromSentinels = pathLength(SPAWNS.defender, front);
    assert.ok(fromStaging > 60 && fromStaging < 85, `${t.name} from staging`);
    assert.ok(
      fromSentinels < fromStaging,
      `${t.name}: sentinels get there first`,
    );
  }
  // Far enough apart that covering them all means choosing.
  const fronts = OBJECTIVES.map((t) => ({ x: t.x, z: t.z + 1.2 }));
  for (const [i, j] of [
    [0, 1],
    [1, 2],
  ])
    assert.ok(pathLength(fronts[i], fronts[j]) > 12);
  assert.ok(pathLength(fronts[0], fronts[2]) > 30);
  // The older maps have three terminals now, too.
  for (const id of ["compound", "lanes", "quad", "monolith"]) {
    useMap(id);
    assert.deepEqual(
      OBJECTIVES.map((o) => o.id),
      ["A", "B", "C"],
      id,
    );
  }
  useMap("compound");
});

test("extracting any two of the three terminals wins", () => {
  for (const pair of [
    ["A", "B"],
    ["B", "C"],
    ["C", "A"],
  ]) {
    const m = match();
    const first = at(m, pair[0]);
    advance(m, CONFIG.terminalSeconds - 0.5, { interact: true });
    assert.ok(!m.extracted.length, "not yet");
    advance(m, 0.6, { interact: true });
    assert.deepEqual(m.extracted, [pair[0]]);
    assert.ok(!m.result, "one isn't enough");
    // Both sides are told, and both see it's spent.
    assert.ok(m.events.some((e) => /1 more terminal/.test(e.text)));
    assert.ok(
      m.events.some(
        (e) =>
          e.team === "defender" &&
          new RegExp(`${first.name} lost`).test(e.text),
      ),
    );
    assert.equal(
      m.snapshot("d").objectives.find((o) => o.id === pair[0]).done,
      true,
    );
    assert.equal(m.snapshot("d").needed, 2);
    const second = at(m, pair[1]);
    advance(m, CONFIG.terminalSeconds + 0.1, { interact: true });
    assert.equal(m.result?.winner, "attacker");
    assert.match(m.result.reason, new RegExp(first.name));
    assert.match(m.result.reason, new RegExp(second.name));
  }
});

test("an extracted terminal can't be worked again", () => {
  const m = match();
  at(m, "B");
  advance(m, CONFIG.terminalSeconds + 0.1, { interact: true });
  advance(m, CONFIG.terminalSeconds + 0.1, { interact: true });
  assert.deepEqual(m.extracted, ["B"]);
  assert.equal(m.players.a.capture, 0);
  assert.ok(!m.result);
});

test("training: extracting two terminals resets them all", () => {
  const m = match(true);
  at(m, "A");
  advance(m, CONFIG.terminalSeconds + 0.1, { interact: true });
  assert.deepEqual(m.extracted, ["A"]);
  at(m, "C");
  advance(m, CONFIG.terminalSeconds + 0.1, { interact: true });
  assert.ok(!m.result);
  assert.deepEqual(m.extracted, []);
  assert.ok(!m.progress.A, "A is back to empty");
});

test("terminal progress stays when you let go", () => {
  const m = match();
  at(m, "A");
  advance(m, 3, { interact: true });
  advance(m, 2);
  assert.ok(Math.abs(m.progress.A - 3) < 0.1, "A keeps its 3 s");
  assert.equal(m.players.a.capture, 0, "not working it now");
  // Work C a little: A is unaffected.
  at(m, "C");
  advance(m, 1, { interact: true });
  assert.ok(Math.abs(m.progress.A - 3) < 0.1);
  // Back to A: only the remaining 5 s are needed.
  at(m, "A");
  advance(m, CONFIG.terminalSeconds - 3 + 0.1, { interact: true });
  assert.deepEqual(m.extracted, ["A"]);
  useMap("compound");
});

test("the sentinels hear which terminal is being worked, a moment later", () => {
  const m = match();
  const said = (team) =>
    m.events.filter(
      (e) => /activity detected/.test(e.text) && (e.team === team || !e.team),
    );
  at(m, "C");
  advance(m, 1, { interact: true });
  assert.equal(said("defender").length, 0, "not instantly");
  advance(m, 1, { interact: true });
  assert.equal(said("defender").length, 1);
  assert.match(said("defender")[0].text, /Terminal C/);
  assert.equal(
    m.events.filter((e) => /activity/.test(e.text) && e.team === "attacker")
      .length,
    0,
    "the infiltrator isn't told",
  );
  // Stepping off and straight back on doesn't repeat it right away.
  advance(m, 0.5);
  advance(m, 2, { interact: true });
  assert.equal(said("defender").length, 1);
  // A different terminal is a new alert.
  at(m, "A");
  advance(m, 2, { interact: true });
  assert.equal(said("defender").length, 2);
});

test("only the infiltrator is told how far along each terminal is", () => {
  const m = match();
  at(m, "A");
  advance(m, 2, { interact: true });
  const mine = m.snapshot("a").objectives.find((o) => o.id === "A"),
    theirs = m.snapshot("d").objectives.find((o) => o.id === "A");
  assert.ok(mine.progress > 1.9);
  assert.equal(theirs.progress, undefined);
  assert.equal(theirs.name, "Terminal A");
});

test("the infiltrator bot extracts two terminals from any start, on every route", () => {
  useMap("docks");
  MAPS.docks.botRoutes.forEach((route, r) =>
    [0, 1, 2].forEach((goal) => {
      const m = new Match("ROUTE", true, "seen", false, "docks");
      m.addPlayer("d", "defender");
      m.addPlayer("bot", "attacker", true);
      m.debug.botRoute = r;
      m.debug.botGoal = goal;
      m.activate();
      m.players.d.alive = false;
      for (let i = 0; i < 150 * 30 && !m.result; i++) m.tick(1 / 30);
      assert.equal(
        m.result?.winner,
        "attacker",
        `${route.name} → ${OBJECTIVES[goal].name}`,
      );
      assert.equal(m.extracted[0], OBJECTIVES[goal].id, "its first choice");
      assert.equal(m.extracted.length, 2);
    }),
  );
  useMap("compound");
});

test("the sentinel bot heads for a terminal it hears about", () => {
  const m = new Match("GUARD", true, "seen", false, "docks");
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  const bot = m.players.bot,
    c = OBJECTIVES.find((o) => o.id === "C");
  // The bot starts by Terminal A; the infiltrator starts on C, out of sight.
  Object.assign(bot, { x: -20.5, z: -10, yaw: 0 });
  at(m, "C");
  const start = Math.hypot(bot.x - c.x, bot.z - c.z);
  advance(m, 2, { interact: true });
  m.players.a.alive = false;
  for (let i = 0; i < 4 * 30; i++) m.tick(1 / 30);
  assert.ok(
    Math.hypot(bot.x - c.x, bot.z - c.z) < start - 5,
    "on its way to C",
  );
  useMap("compound");
});

test("the sentinel bot stops guarding a terminal once it's lost", () => {
  const m = new Match("LOST", true, "seen", false, "docks");
  m.addPlayer("a", "attacker");
  m.addPlayer("bot", "defender", true);
  m.phase = "active";
  m.time = 240;
  m.players.a.alive = false;
  m.extracted = ["A"];
  const bot = m.players.bot,
    posted = new Set();
  for (let i = 0; i < 90 * 30; i++) {
    m.tick(1 / 30);
    const post = bot.brain?.task?.post;
    if (post?.site) posted.add(post.site);
  }
  assert.ok(!posted.has("A"), "never posts at A");
  assert.ok(posted.size > 0, "still guards the others");
  // A post it already had at a terminal that's then lost is dropped.
  bot.brain.task = { kind: "patrol", post: { x: 0, z: 0, site: "B" } };
  m.extracted.push("B");
  m.tick(1 / 30);
  assert.notEqual(bot.brain.task?.post?.site, "B");
  useMap("compound");
});

test("training: the sentinel bot patrols the terminals and answers a hack; ⌘K holds it", () => {
  const range = (team) => {
    const m = new Match("RANGE", true, "seen", true, "docks");
    m.addPlayer("a", team);
    m.addPlayer("bot", team === "attacker" ? "defender" : "attacker", true);
    m.phase = "active";
    m.time = 240;
    return m;
  };
  const m = range("attacker"),
    bot = m.players.bot,
    c = OBJECTIVES.find((o) => o.id === "C");
  assert.equal(m.botStill(bot), false, "a sentinel bot moves by default");
  Object.assign(bot, { x: -20.5, z: -10, yaw: 0 });
  at(m, "C");
  const start = Math.hypot(bot.x - c.x, bot.z - c.z);
  advance(m, 2, { interact: true });
  advance(m, 4);
  assert.ok(
    Math.hypot(bot.x - c.x, bot.z - c.z) < start - 5,
    "runs toward the terminal being hacked",
  );
  // The developer toggle holds it still, and toggles back.
  m.action("a", { type: "debug", key: "stationary" });
  assert.equal(m.botStill(bot), true);
  const held = { x: bot.x, z: bot.z };
  advance(m, 2);
  assert.ok(Math.hypot(bot.x - held.x, bot.z - held.z) < 0.01);
  m.action("a", { type: "debug", key: "stationary" });
  assert.equal(m.botStill(bot), false);
  // An infiltrator bot still waits for you by default.
  const s = range("defender");
  assert.equal(s.botStill(s.players.bot), true);
  useMap("compound");
});

test("the older maps: a spawn bunker, a door per lane, three reachable terminals", () => {
  for (const id of ["compound", "lanes", "quad", "monolith"]) {
    useMap(id);
    const room = MAPS[id].spawnRoom;
    assert.ok(room, `${id}: spawn bunker`);
    assert.ok(room.doors.length >= 3, `${id}: a door per lane`);
    for (const e of room.exits)
      for (const t of OBJECTIVES) {
        const front = { x: t.x, z: t.z + 1.2 };
        assert.ok(
          pathLength(e, front) < Infinity,
          `${id}: ${e.name} door → ${t.name}`,
        );
        assert.ok(
          pathLength(SPAWNS.defender, front) < pathLength(e, front),
          `${id}: sentinels reach ${t.name} first`,
        );
      }
  }
  // One connector between neighbouring lanes: The Lanes' north hallway and
  // underpasses are walled, so crossing there is a long way round.
  useMap("lanes");
  assert.ok(pathLength({ x: -14, z: 4 }, { x: -2.5, z: 4 }) < 14);
  assert.ok(pathLength({ x: -14, z: 15 }, { x: -2.5, z: 15 }) > 25);
  useMap("compound");
});
