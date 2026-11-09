// Dev quick start from URL parameters, e.g.
//   ?type=training&team=inf&map=pier9&tripwire=3
// starts a Training Range game on Pier 9 as an Infiltrator carrying three
// tripwires, straight into the arena.
//   type: training (range) | freeroam (roam) | solo (field) | multi (private)
//   team: inf / infiltrator / attacker | sen / sentinel / defender
//   map:  a map id or name, any case or spacing ("pier9", "docks", "The Quad")
//   rule: seen | soak | splash (removed remains a legacy dev alias; the
//         old shoot now means soak)
//   bot:  easy | normal | hard, the solo opponent's difficulty
//   objective: extract | hotpotato | breakout | boulders | livewire
//   any gadget id or short code (tripwire, TRP, smoke, cameraDecoy…) = count
// Returns null when there's no `type`, so the normal menu shows.
import { MAPS } from "../shared/maps.js";
import { GADGETS, ruleOf } from "../shared/config.js";

const MODES = {
  training: "training",
  range: "training",
  train: "training",
  solo: "solo",
  field: "solo",
  multi: "multi",
  private: "multi",
  freeroam: "freeroam",
  roam: "freeroam",
  free: "freeroam",
};
const TEAMS = {
  inf: "attacker",
  infiltrator: "attacker",
  attacker: "attacker",
  att: "attacker",
  sen: "defender",
  sentinel: "defender",
  defender: "defender",
  def: "defender",
};
const squash = (s) =>
  String(s)
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");

export function parseLaunch(search) {
  const params = new URLSearchParams(search);
  if (!params.has("type")) return null;
  const launch = {
    mode: MODES[squash(params.get("type"))],
    team: "attacker",
    rule: "seen",
    botLevel: "normal",
    map: null,
    objective: "extract",
    kit: {},
    unknown: [],
  };
  if (!launch.mode) launch.unknown.push(`type=${params.get("type")}`);
  for (const [key, value] of params) {
    const k = squash(key);
    if (k === "type") continue;
    if (k === "team") {
      launch.team = TEAMS[squash(value)];
      if (!launch.team) launch.unknown.push(`team=${value}`);
    } else if (k === "rule") {
      launch.rule = ruleOf(squash(value));
    } else if (k === "bot") {
      launch.botLevel = ["easy", "normal", "hard"].includes(squash(value))
        ? squash(value)
        : "normal";
      if (launch.botLevel !== squash(value))
        launch.unknown.push(`bot=${value}`);
    } else if (k === "objective") {
      const want = squash(value);
      launch.objective = [
        "extract",
        "hotpotato",
        "breakout",
        "boulders",
        "livewire",
        "sprinklers",
      ].includes(want)
        ? want
        : "extract";
      if (launch.objective !== want) launch.unknown.push(`objective=${value}`);
    } else if (k === "map") {
      launch.map =
        Object.keys(MAPS).find(
          (id) =>
            squash(id) === squash(value) ||
            squash(MAPS[id].name) === squash(value),
        ) || null;
      if (!launch.map) launch.unknown.push(`map=${value}`);
    } else {
      const gadget = Object.keys(GADGETS).find(
        (id) => squash(id) === k || squash(GADGETS[id].short) === k,
      );
      const count = Math.round(Number(value));
      if (gadget && count >= 0) launch.kit[gadget] = count;
      else launch.unknown.push(`${key}=${value}`);
    }
  }
  return launch.mode && launch.team ? launch : { ...launch, mode: null };
}
