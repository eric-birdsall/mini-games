import http from "node:http";
import { WebSocketServer } from "ws";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import { createMatch, initializePlayer } from "./createMatch.js";
import { MAPS } from "../shared/maps.js";
import { CONFIG } from "../shared/config.js";
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
// Dev tool (?thumbs): saves the map picker's thumbnails, sent as
// { id: "data:image/png;base64,..." }, to src/assets/maps/<id>.png. Only
// from this machine, and only for built-in maps.
const THUMB_DIR = new URL("../src/assets/maps/", import.meta.url);
function saveThumbs(req, res) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
    req.socket.remoteAddress,
  );
  if (!local) {
    res.writeHead(403).end();
    return;
  }
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 20e6) req.destroy();
  });
  req.on("end", async () => {
    try {
      const shots = JSON.parse(body);
      await mkdir(THUMB_DIR, { recursive: true });
      const saved = [];
      for (const [id, url] of Object.entries(shots)) {
        const png = /^data:image\/png;base64,/.test(url)
          ? Buffer.from(url.split(",")[1], "base64")
          : null;
        if (!MAPS[id] || MAPS[id].custom || !/^[a-z0-9]+$/.test(id) || !png)
          continue;
        await writeFile(new URL(`${id}.png`, THUMB_DIR), png);
        saved.push(id);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ saved }));
    } catch (error) {
      res.writeHead(400).end(String(error.message));
    }
  });
}
const server = http.createServer((req, res) =>
  req.method === "POST" && req.url === "/__thumbs"
    ? saveThumbs(req, res)
    : vite.middlewares(req, res),
);
// Room for a map-builder map in the join message (up to 400 pieces).
const wss = new WebSocketServer({ server, maxPayload: 65536 });
const rooms = new Map();
wss.on("connection", (socket) => {
  const id = randomBytes(6).toString("hex");
  let room = null;
  let count = 0;
  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (++count > 150) return;
      if (msg.type === "join" && !room) {
        let code = String(msg.code || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 6);
        if (msg.create) {
          code = randomBytes(3).toString("hex").toUpperCase();
          const created = createMatch(code, msg);
          if (created.error) {
            socket.send(JSON.stringify({ type: "error", text: created.error }));
            return;
          }
          room = created.room;
          rooms.set(code, room);
        } else room = rooms.get(code);
        if (!room) {
          socket.send(
            JSON.stringify({
              type: "error",
              text: "Room not found. Check the six-character code.",
            }),
          );
          return;
        }
        if (
          (room.solo && !msg.create) ||
          Object.values(room.players).length >= CONFIG.maxPlayers
        ) {
          room = null;
          socket.send(
            JSON.stringify({ type: "error", text: "This room is full." }),
          );
          return;
        }
        // Joining friends fills the available side; hosts receive a random role.
        const preferred =
          (room.noBot || room.solo) && room.party?.kind === "breakout"
            ? "attacker"
            : msg.team === "defender"
              ? "defender"
              : "attacker";
        const count = (side) =>
          Object.values(room.players).filter((p) => p.team === side).length;
        const team =
          count(preferred) < CONFIG.playersPerTeam
            ? preferred
            : preferred === "attacker"
              ? "defender"
              : "attacker";
        if (!room.addPlayer(id, team)) {
          room = null;
          socket.send(
            JSON.stringify({
              type: "error",
              text: "That role is taken. Select the other team.",
            }),
          );
          return;
        }
        initializePlayer(room, id, team, msg);
        // A custom map travels with the join, so every client can build it.
        socket.send(
          JSON.stringify({ type: "joined", id, code, mapDef: room.mapDef }),
        );
        room.notify("Operator connected.");
      } else if (room) room.action(id, msg);
    } catch {
      socket.send(JSON.stringify({ type: "error", text: "Invalid message." }));
    }
  });
  socket.on("close", () => {
    if (room) {
      delete room.players[id];
      room.notify("Opponent disconnected.");
      if (!Object.values(room.players).some((p) => !p.bot))
        rooms.delete(room.code);
      else {
        room.phase = "purchase";
        room.reset();
      }
    }
  });
  socket.rateReset = setInterval(() => (count = 0), 1000);
  socket.on("close", () => clearInterval(socket.rateReset));
  socket.getRoom = () => room;
  socket.playerId = id;
});
setInterval(() => {
  for (const room of rooms.values()) room.tick(1 / CONFIG.tickRate);
  for (const socket of wss.clients) {
    const room = socket.getRoom();
    if (room && socket.readyState === 1)
      socket.send(
        JSON.stringify({ type: "state", ...room.snapshot(socket.playerId) }),
      );
  }
}, 1000 / CONFIG.tickRate);
const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () =>
  console.log(`MINI GAMES ready — http://localhost:${port}`),
);
