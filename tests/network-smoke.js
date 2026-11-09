import WebSocket from "ws";
import assert from "node:assert/strict";
const endpoint = process.env.TEST_SERVER || "ws://localhost:3000";
const sockets = [];
async function client() {
  const ws = new WebSocket(endpoint);
  sockets.push(ws);
  ws.messages = [];
  ws.on("message", (d) => ws.messages.push(JSON.parse(d)));
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  return ws;
}
function send(ws, m) {
  ws.send(JSON.stringify(m));
}
async function until(ws, predicate) {
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    const m = ws.messages.find(predicate);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Timed out awaiting authoritative state");
}
try {
  const a = await client();
  send(a, {
    type: "join",
    create: true,
    rule: "removed",
    solo: false,
    team: "attacker",
  });
  const joined = await until(a, (m) => m.type === "joined");
  const d = await client();
  send(d, { type: "join", code: joined.code, team: "defender" });
  await until(d, (m) => m.type === "joined");
  send(a, { type: "buy", gadget: "smoke" });
  await until(a, (m) => m.type === "state" && m.me.inventory.smoke === 1);
  const ds = await until(
    d,
    (m) => m.type === "state" && m.players.length === 2,
  );
  assert.equal(ds.rule, "removed");
  assert.equal(
    ds.players.find((p) => p.team === "attacker").inventory,
    undefined,
  );
  send(a, { type: "ready" });
  send(d, { type: "ready" });
  await until(a, (m) => m.type === "state" && m.phase === "prep");
  await until(d, (m) => m.type === "state" && m.phase === "prep");
  send(a, { type: "input", input: { forward: 1, yaw: 0, pitch: 0 } });
  send(d, { type: "input", input: { forward: 1, yaw: Math.PI, pitch: 0 } });
  const moved = await until(
    d,
    (m) => m.type === "state" && m.phase === "prep" && m.me.z > -17.5,
  );
  assert.ok(moved.me.z > -17.5);
  const staged = await until(
    a,
    (m) => m.type === "state" && m.phase === "prep" && m.time < 44.8,
  );
  assert.equal(staged.me.z, 23);
  send(d, { type: "debug", key: "all" });
  send(a, { type: "restart" });
  const reset = await until(
    d,
    (m) => m.type === "state" && m.phase === "purchase" && m.time === 0,
  );
  assert.deepEqual(reset.me.inventory, {});
  console.log(
    "PASS: two clients, private purchases, synchronized phases, authoritative movement, staging restriction, host reset.",
  );
} finally {
  for (const ws of sockets) ws.close();
}
