import WebSocket from "ws";
import assert from "node:assert/strict";
import { PLAT_H } from "../shared/livewire.js";
const sockets = [];
async function join(options) {
  const ws = new WebSocket(process.env.TEST_SERVER || "ws://localhost:3000");
  sockets.push(ws);
  const messages = [];
  ws.on("message", (data) => messages.push(JSON.parse(data)));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(
    JSON.stringify({
      type: "join",
      create: true,
      team: "attacker",
      ...options,
    }),
  );
  const wait = async (predicate) => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const error = messages.find((m) => m.type === "error");
      assert.equal(error, undefined, error?.text);
      const value = messages.find(predicate);
      if (value) return value;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("Timed out waiting for match state");
  };
  const joined = await wait((m) => m.type === "joined");
  const state = await wait((m) => m.type === "state");
  return { ws, wait, state, code: joined.code };
}
try {
  for (const objective of ["plant", "sweep", "gauntlet", "lightsout"]) {
    const { state, ws } = await join({ objective, solo: true, rule: "splash" });
    assert.ok(!state.party, `${objective} must not create a party game`);
    assert.equal(state.objectiveMode, "extract", objective);
    ws.close();
  }
  for (const objective of [
    "hotpotato",
    "breakout",
    "boulders",
    "livewire",
  ]) {
    const { state, ws, wait } = await join({
      rule: "soak",
      objective,
      training: true,
      noBot: true,
    });
    assert.equal(
      state.training,
      !["hotpotato", "breakout", "boulders", "livewire"].includes(objective),
      objective,
    );
    if (["hotpotato", "breakout", "boulders", "livewire"].includes(objective)) {
      assert.equal(state.party.kind, objective);
      assert.notEqual(state.phase, "purchase");
    }
    if (objective === "livewire") {
      assert.equal(state.party.kind, "livewire");
      assert.equal(state.kid, true);
      ws.send(JSON.stringify({ type: "ready" }));
      const active = await wait(
        (m) => m.type === "state" && m.phase === "active",
      );
      assert.ok(active.party.run.wires.length || active.party.run.t < 2);
    }
    assert.equal(state.noBot, true, objective);
    assert.equal(state.players.length, 1, objective);
    if (objective === "breakout") assert.match(state.map, /breakout/);
    if (objective === "boulders") assert.match(state.map, /boulders/);
    ws.close();
  }
  // Training works even when a client sends no explicit noBot flag, and
  // the join itself skips equipment setup. Exercise real movement and jump.
  const practice = await join({ objective: "livewire", training: true });
  assert.equal(practice.state.party.kind, "livewire");
  assert.equal(practice.state.noBot, true);
  assert.equal(practice.state.players.length, 1);
  assert.notEqual(practice.state.phase, "purchase");
  const active = await practice.wait(
    (m) => m.type === "state" && m.phase === "active",
  );
  const startX = active.me.x;
  practice.ws.send(
    JSON.stringify({ type: "input", input: { side: 1, yaw: 0 } }),
  );
  await practice.wait((m) => m.type === "state" && m.me.x > startX + 0.3);
  practice.ws.send(JSON.stringify({ type: "input", input: { jump: true } }));
  const airborne = await practice.wait(
    (m) => m.type === "state" && m.me.y > PLAT_H + 0.2,
  );
  practice.ws.send(JSON.stringify({ type: "input", input: {} }));
  await practice.wait(
    (m) =>
      m.type === "state" &&
      m.party.run?.t > airborne.party.run.t &&
      m.me.grounded &&
      m.me.y === PLAT_H,
  );
  practice.ws.close();
  // A friend joins directly into the countdown after the host waits, ready.
  const noodleHost = await join({ objective: "livewire" });
  assert.equal(noodleHost.state.me.ready, true);
  const noodleFriend = await join({ create: false, code: noodleHost.code });
  await noodleHost.wait((m) => m.type === "state" && m.phase === "prep");
  assert.equal(noodleFriend.state.phase, "prep");
  noodleHost.ws.close();
  noodleFriend.ws.close();
  const ai = await join({ rule: "splash", solo: true });
  assert.equal(ai.state.training, false);
  assert.equal(ai.state.solo, true);
  assert.equal(ai.state.noBot, false);
  const host = await join({ rule: "splash" });
  assert.equal(host.state.training, false);
  const friend = await join({ create: false, code: host.code });
  assert.equal(
    friend.state.me.team,
    "defender",
    "join fills the other side automatically",
  );
  console.log(
    "PASS: Equipment-free Practice modes keep their rules and skip backpacks; Lily Hop moves and jumps; friends auto-start.",
  );
} finally {
  for (const ws of sockets) ws.close();
}
