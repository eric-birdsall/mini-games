import { createMatch, initializePlayer } from "../server/createMatch.js";
import { CONFIG } from "../shared/config.js";

const playerId = "local";
const interval = 1000 / CONFIG.tickRate;
const send = (message) => self.postMessage(JSON.stringify(message));
let room;

self.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (room) {
    room.action(playerId, msg);
    return;
  }
  if (msg.type !== "join") return;

  const created = createMatch("LOCAL", msg);
  if (created.error) {
    send({ type: "error", text: created.error });
    return;
  }
  room = created.room;
  const team = room.party?.kind === "breakout" ? "attacker" : msg.team;
  room.addPlayer(playerId, team);
  initializePlayer(room, playerId, team, msg);
  send({ type: "joined", id: playerId, code: room.code, mapDef: room.mapDef });
  setInterval(() => {
    room.tick(1 / CONFIG.tickRate);
    send({ type: "state", ...room.snapshot(playerId) });
  }, interval);
};
