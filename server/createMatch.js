import { avatarChoice } from "../shared/avatars.js";
import { Match } from "./simulation.js";
import { ENABLED_MAPS, MAPS } from "../shared/maps.js";
import { validateCustomMap, registerCustomMap } from "../shared/customMap.js";
import { BOT_LEVELS } from "./bot.js";
import { isParty, skipsBackpack } from "../shared/party.js";

export function createMatch(code, msg) {
  // A map from the map builder: checked, then made playable.
  let custom = null;
  if (msg.custom) {
    const { def, error } = validateCustomMap(msg.custom);
    if (error) return { error };
    custom = { def, id: registerCustomMap(def) };
  }
  const room = new Match(
    code,
    !!msg.solo,
    msg.rule,
    !!msg.training,
    // A URL quick start (dev testing) may open any built map.
    custom
      ? custom.id
      : ENABLED_MAPS.includes(msg.map) || (msg.quickStart && MAPS[msg.map])
        ? msg.map
        : ENABLED_MAPS[0],
  );
  // The menu supports competitive and hosted Splash as well as Practice.
  if (msg.rule === "splash" && !msg.training) {
    room.training = false;
    room.solo = !!msg.solo;
  }
  room.mapDef = custom?.def || null;
  // Free Roam: a training range with nobody else in it.
  room.noBot = room.training && !!msg.noBot;
  // Supported party games may be played solo or hosted.
  if (isParty(msg.objective)) {
    room.setParty(msg.objective, !!msg.solo);
    // Breakout is one run, yours: no bot to race or watch.
    if (msg.objective === "breakout" && msg.solo) room.noBot = true;
    if (msg.training && skipsBackpack(msg.objective)) {
      // Practice keeps the actual game, with one player.
      room.solo = true;
      room.noBot = true;
    } else if (msg.training && msg.noBot) {
      // Keep the dedicated (including generated) map in an untimed gadget range.
      room.party = null;
      room.training = true;
      room.solo = true;
      room.noBot = true;
      room.objectiveMode = "extract";
    }
  }
  if (BOT_LEVELS[msg.botLevel]) room.botLevel = msg.botLevel;
  return { room };
}

export function initializePlayer(room, id, team, msg) {
  room.players[id].avatar = avatarChoice(msg.avatar);
  if (msg.create && msg.builderStart)
    room.setBuilderStart(id, msg.builderStart);
  if (room.solo && !room.noBot)
    room.addPlayer("bot", team === "attacker" ? "defender" : "attacker", true);
  // These games have no equipment phase. Hosts wait for a friend already
  // readied; solo and Practice go straight to the countdown.
  if (skipsBackpack(room.party?.kind)) room.action(id, { type: "ready" });
}
