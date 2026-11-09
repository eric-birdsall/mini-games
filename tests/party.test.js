import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../server/simulation.js";
import { MAPS } from "../shared/maps.js";
import { CONFIG, OBJECTIVES } from "../shared/config.js";
import { PARTY, PARTY_PREP_END, partyScore } from "../shared/party.js";
// Supported party minigames.
function match(kind, { bot = false } = {}) {
  const m = new Match("PRTY", bot, "splash", true, "docks");
  m.setParty(kind, bot);
  m.addPlayer("a", "attacker");
  if (bot) m.addPlayer("bot", "defender", true);
  else m.addPlayer("d", "defender");
  return m;
}
function run(m, seconds, inputs = {}) {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    for (const [id, input] of Object.entries(inputs))
      if (m.players[id]) m.players[id].input = { ...input };
    m.tick(1 / 30);
    if (m.phase === "results") return;
  }
}
const bothReady = (m) => {
  for (const p of Object.values(m.players))
    if (!p.bot) m.action(p.id, { type: "ready" });
};

// --- Hot Potato ----------------------------------------------------------
// A two-player court game, ready and past the 3-2-1.
function potato({ bot = false } = {}) {
  const m = match("hotpotato", { bot });
  bothReady(m);
  run(m, PARTY_PREP_END + 0.1);
  return m;
}
const HP = PARTY.hotpotato;
const live = (m) => m.party.grenades.find((g) => g.live);

test("removed modes cannot be started as party games", () => {
  for (const kind of ["plant", "sweep", "gauntlet", "lightsout"]) {
    assert.equal(PARTY[kind], undefined);
    const m = new Match("GONE", false, "splash", true, "docks");
    m.setParty(kind, false);
    assert.ok(!m.party);
    assert.equal(m.objectiveMode, "extract");
  }
});

test("Hot Potato: its own court, one potato on the line", () => {
  const m = match("hotpotato");
  assert.equal(m.map, "court");
  assert.deepEqual(m.players.a.inventory, {});
  bothReady(m);
  assert.equal(m.phase, "prep");
  assert.ok(m.time <= PARTY_PREP_END);
  assert.equal(m.party.grenades.length, 1);
  assert.ok(m.party.grenades.every((g) => g.z === 0 && !g.holder));
  assert.equal(m.party.grenades.filter((g) => g.live).length, 1);
  assert.ok(m.party.fuse >= HP.fuseMin && m.party.fuse <= HP.fuseMax);
  // Held at the back wall through the countdown.
  const z = m.players.a.z;
  run(m, 1, { a: { forward: 1 } });
  assert.equal(m.players.a.z, z);
  // Nobody is told which one is live.
  const view = m.snapshot("a").party;
  assert.ok(view.grenades.every((g) => !("live" in g)));
  assert.equal(view.beep, null);
  run(m, PARTY_PREP_END);
  assert.equal(m.phase, "active");
});

test("Hot Potato: each side keeps to its half", () => {
  const m = potato();
  // Infiltrator (south) runs north, sentinel (north) runs south.
  run(m, 6, {
    a: { forward: 1, sprint: true },
    d: { forward: 1, sprint: true },
  });
  assert.ok(m.players.a.z >= HP.lineGap - 1e-9);
  assert.ok(m.players.d.z <= -HP.lineGap + 1e-9);
});

test("Hot Potato: walk over one to pick it up, fire to throw it onto their half", () => {
  const m = potato(),
    a = m.players.a,
    g = m.party.grenades[0];
  Object.assign(a, { x: g.x, z: 0.4, yaw: 0, pitch: 0.4 });
  run(m, 0.1);
  assert.equal(g.holder, "a");
  assert.equal(a.equipped, "potato");
  // Only one at a time.
  assert.equal(m.party.grenades.filter((h) => h.holder === "a").length, 1);
  m.attack(a);
  assert.equal(g.holder, null);
  assert.deepEqual(a.inventory, {});
  run(m, 3);
  assert.ok(!g.flight);
  assert.ok(g.z < -2, `landed on their half (z ${g.z})`);
});

test("Hot Potato: a direct hit never stuns the other player", () => {
  const m = potato(),
    a = m.players.a,
    d = m.players.d,
    g = m.party.grenades[0];
  Object.assign(d, { x: 0, z: -3 });
  g.flight = {
    team: "attacker",
    elapsed: 0,
    time: 1,
    points: Array.from({ length: 61 }, () => ({ x: 0, y: 1, z: -3 })),
    landing: { x: 0, y: 0, z: -3 },
  };
  run(m, 0.02);
  assert.equal(d.immobile, 0);
  assert.equal(g.flight, null, "potato bounces down on contact");
  assert.equal(m.phase, "active");
});

test("Hot Potato: whoever has the live one on their half loses the round; best of three", () => {
  const m = potato();
  // Put the live one on the north half: the south (a) wins the round.
  Object.assign(live(m), { x: 4, z: -8, y: 0 });
  Object.assign(m.players.d, { x: -6, z: -1 });
  m.party.fuse = m.activeTime + HP.tickSeconds - 0.5;
  run(m, 0.1);
  // The live one now beeps, and only then is it named.
  assert.equal(m.snapshot("a").party.beep, live(m).id);
  run(m, HP.tickSeconds);
  assert.equal(m.phase, "results");
  assert.equal(m.result.winnerId, "a");
  assert.equal(m.result.final, false);
  assert.equal(m.party.scores.a.wins, 1);
  assert.equal(m.smokes.length, 0, "the sneeze never creates smoke");
  assert.ok(
    m.snapshot("a").party.boom,
    "the client receives the confetti location",
  );
  // Round 2 goes straight to the 3-2-1, sides unchanged.
  m.action("a", { type: "restart" });
  assert.equal(m.phase, "prep");
  assert.equal(m.party.half, 2);
  assert.equal(m.players.a.team, "attacker");
  run(m, PARTY_PREP_END + 0.1);
  // In hand counts too: a holds it and loses.
  const g = live(m);
  Object.assign(m.players.a, { x: g.x, z: 0.4 });
  run(m, 0.1);
  assert.equal(g.holder, "a");
  m.party.fuse = m.activeTime + 0.05;
  run(m, 0.5);
  assert.equal(m.result.winnerId, "d");
  assert.equal(m.result.inHand, true);
  m.action("a", { type: "restart" });
  run(m, PARTY_PREP_END + 0.1);
  Object.assign(live(m), { x: 0, z: 9, y: 0 });
  m.party.fuse = m.activeTime + 0.05;
  run(m, 0.5);
  assert.equal(m.result.winnerId, "d");
  assert.equal(m.result.final, true);
  assert.equal(m.party.scores.d.wins, HP.toWin);
  assert.equal(partyScore("hotpotato", m.party.scores.d).text, "2 rounds won");
  // Play again: a new game from the briefing.
  m.action("a", { type: "restart" });
  assert.equal(m.phase, "purchase");
  assert.equal(m.party.half, 1);
  assert.deepEqual(m.party.scores, {});
});

test("Hot Potato: the bot clears its half", () => {
  for (const level of ["easy", "normal", "hard"]) {
    const m = new Match("PRTY", true, "soak", false, "docks");
    m.setParty("hotpotato", true);
    m.botLevel = level;
    m.addPlayer("a", "attacker");
    m.addPlayer("bot", "defender", true);
    m.action("a", { type: "ready" });
    run(m, PARTY_PREP_END + 0.1);
    m.party.fuse = 1000;
    run(m, 15);
    const theirs = m.party.grenades.filter(
      (g) => g.z < 0 || g.holder === "bot",
    );
    assert.ok(
      theirs.length <= 1,
      `${level}: ${theirs.length} left on its half`,
    );
  }
});
