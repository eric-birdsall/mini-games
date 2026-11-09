import WebSocket from "ws";
import assert from "node:assert/strict";
import { DEFAULT_DECOY_PROGRAM } from "../shared/decoy.js";
const sockets = [];
async function client() {
  const ws = new WebSocket(process.env.TEST_SERVER || "ws://localhost:3000");
  sockets.push(ws);
  ws.latest = null;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "state") ws.latest = m;
    if (m.type === "joined") ws.joined = m;
  });
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  return ws;
}
const send = (ws, msg) => ws.send(JSON.stringify(msg));
async function waitFor(predicate, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Timed out waiting for decoy network state");
}
try {
  const a = await client();
  send(a, { type: "join", create: true, team: "attacker", rule: "removed" });
  await waitFor(() => a.joined);
  const d = await client();
  send(d, { type: "join", code: a.joined.code, team: "defender" });
  await waitFor(() => d.joined);
  send(a, { type: "decoyProgram", program: DEFAULT_DECOY_PROGRAM });
  send(a, { type: "buy", gadget: "actorDecoy" });
  send(a, { type: "ready" });
  send(d, { type: "ready" });
  await waitFor(() => a.latest?.phase === "prep");
  console.log("Both clients ready. Waiting for normal 45-second preparation.");
  await waitFor(
    () => a.latest?.phase === "active" && d.latest?.phase === "active",
    50000,
  );
  send(a, { type: "input", input: { yaw: 0, pitch: -0.3 } });
  send(a, { type: "use" });
  await waitFor(
    () => a.latest?.decoys.length === 1 && d.latest?.decoys.length === 1,
  );
  assert.equal(a.latest.me.inventory.actorDecoy, 0);
  assert.ok(a.latest.decoys[0].mark);
  assert.equal(d.latest.decoys[0].mark, undefined);
  assert.equal(d.latest.decoys[0].program, undefined);
  await waitFor(
    () => a.latest.decoys[0]?.step === 3 && d.latest.decoys[0]?.prone,
    10000,
  );
  assert.equal(a.latest.phase, "active");
  assert.equal(d.latest.phase, "active");
  assert.equal(a.latest.decoys[0].id, d.latest.decoys[0].id);
  console.log(
    "PASS: two real clients synchronized triggered decoy, private program/mark, crouch-move-prone sequence and completed stance.",
  );
} finally {
  for (const ws of sockets) ws.close();
}
