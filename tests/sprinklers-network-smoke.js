import WebSocket from "ws";
import assert from "node:assert/strict";
import { MAPS } from "../shared/maps.js";
import { SPRINKLER_SITES } from "../shared/sprinklers.js";

const ws = new WebSocket(process.env.TEST_SERVER || "ws://127.0.0.1:3000");
const send = (message) => ws.send(JSON.stringify(message));
let spawn = false,
  heads = false,
  boundary = false,
  latest;
const timer = setTimeout(() => {
  ws.close();
  assert.ok(
    spawn && heads && boundary,
    `spawn=${spawn}, sprinklers=${heads}, boundary=${boundary}; last=${JSON.stringify(latest)}`,
  );
  console.log(
    "PASS: live server spawns inside yard, emits sprinkler heads inside fences, and blocks boundary movement.",
  );
}, 6500);
ws.on("open", () =>
  send({
    type: "join",
    create: true,
    solo: true,
    training: true,
    noBot: true,
    objective: "sprinklers",
    team: "attacker",
  }),
);
ws.on("error", (error) => {
  clearTimeout(timer);
  throw error;
});
ws.on("message", (raw) => {
  const state = JSON.parse(raw);
  if (state.type !== "state") return;
  assert.equal(state.map, "yard");
  const p = state.me;
  latest = { phase: state.phase, x: p.x, z: p.z };
  assert.ok(
    Math.abs(p.x) <= MAPS.yard.size.x && Math.abs(p.z) <= MAPS.yard.size.z,
    `Player outside current yard: ${JSON.stringify(latest)}`,
  );
  if (!spawn) {
    assert.equal(p.x, MAPS.yard.spawns.attacker.x);
    assert.equal(p.z, MAPS.yard.spawns.attacker.z);
    spawn = true;
    send({ type: "debug", key: "skip" });
  }
  send({
    type: "input",
    input: { side: 1, forward: 0, yaw: 0, pitch: 0, sprint: true },
  });
  if (p.x >= MAPS.yard.size.x - 0.6) boundary = true;
  for (const h of state.party?.sprinklers?.heads || []) {
    assert.ok(
      SPRINKLER_SITES.some(
        (site) =>
          Math.abs(site.x - h.x) < 0.001 && Math.abs(site.z - h.z) < 0.001,
      ),
      `Live sprinkler is outside the fixed grid: ${JSON.stringify(h)}`,
    );
    assert.ok(Math.abs(h.x) < MAPS.yard.size.x);
    assert.ok(Math.abs(h.z) < MAPS.yard.size.z);
    heads = true;
  }
});
