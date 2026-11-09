import {
  sprinklersPrepare,
  sprinklersActivate,
  sprinklersTick,
  sprinklersClamp,
  sprinklersView,
  sprinklersOver,
} from "./sprinklers.js";
// Party minigames on the server (see shared/party.js): Bug Sweep,
// Gauntlet and Lights Out. Each is two halves; between them every player swaps sides.
// The Match calls in here wherever a party game plays differently.
import { CONFIG, GADGETS, OBJECTIVES } from "../shared/config.js";
import { MAPS } from "../shared/maps.js";
import { PARTY, PARTY_PREP_END, partyScore } from "../shared/party.js";
import { baseOf, isPlaced, isPortable } from "../shared/variants.js";
import { distance } from "../shared/map.js";
import {
  potatoRound,
  potatoPrepare,
  potatoActivate,
  potatoTick,
  potatoThrow,
  potatoClamp,
  potatoView,
} from "./hotPotato.js";
import {
  breakoutPrepare,
  breakoutActivate,
  breakoutTick,
  breakoutClamp,
  breakoutView,
  breakoutScore,
} from "./breakout.js";
import {
  ensureBreakoutMap,
  breakoutMapId,
  newSeed,
} from "../shared/breakout.js";
import {
  bouldersPrepare,
  bouldersActivate,
  bouldersTick,
  bouldersClamp,
  bouldersView,
  bouldersOver,
} from "./boulders.js";
import { ensureBouldersMap, bouldersMapId } from "../shared/boulders.js";
import {
  livewirePrepare,
  livewireActivate,
  livewireTick,
  livewireClamp,
  livewireView,
  livewireOver,
} from "./livewire.js";

const KIND_OF = new Map(Object.entries(GADGETS).map(([k, g]) => [g, k]));
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const flip = (team) => (team === "attacker" ? "defender" : "attacker");

// A fresh party game: first half, no scores yet, and (Gauntlet) the one
// terminal both runs go for.
export function newParty(m, kind) {
  // Breakout: a fresh course for each run.
  if (kind === "breakout") {
    m.map = breakoutMapId(newSeed());
    m.mapDef = null;
    ensureBreakoutMap(m.map);
  }
  // Boulder Dash: a fresh channel for each race.
  if (kind === "boulders") {
    m.map = bouldersMapId(newSeed());
    m.mapDef = null;
    ensureBouldersMap(m.map);
  }
  m.useLevel();
  return {
    kind,
    half: 1,
    // Each player's result, by id: the half they searched or ran.
    scores: {},
    // Which side each player started on, to put them back for a rematch.
    first: Object.fromEntries(
      Object.values(m.players).map((p) => [p.id, p.team]),
    ),
    site:
      kind === "gauntlet" || kind === "lightsout"
        ? OBJECTIVES[Math.floor(Math.random() * OBJECTIVES.length)].id
        : null,
    found: 0,
    total: 0,
    caught: 0,
    progress: 0,
    ...(kind === "hotpotato" ? potatoRound() : {}),
  };
}
// Turn a new match into a party game. Always Soak rules (only the sweeper
// and the Lights Out guard carry water balloons), never training: solo
// means against the bot.
export function setParty(m, kind, solo) {
  if (!PARTY[kind]) return;
  m.rule = "soak";
  m.training = false;
  m.kid = kind === "livewire";
  m.solo = solo;
  m.noBot = false;
  m.debug = {};
  m.objectiveMode = kind;
  // Hot Potato has a court of its own.
  if (PARTY[kind].map) {
    m.map = PARTY[kind].map;
    m.mapDef = null;
  }
  m.party = newParty(m, kind);
  for (const p of Object.values(m.players)) partyKit(m, p);
}
// What each side may carry and use.
function allowedKinds(m, p) {
  const def = PARTY[m.party.kind],
    hider = p.team === "defender";
  if (m.party.kind === "sweep")
    return Object.keys(hider ? def.hideKit : def.seekKit);
  if (m.party.kind === "lightsout")
    return Object.keys(hider ? def.guardKit : def.runKit);
  // Hot Potato: nothing to equip but what you pick up. Breakout, Boulder
  // Dash and Livewire: nothing.
  if (
    ["hotpotato", "breakout", "boulders", "livewire", "sprinklers"].includes(
      m.party.kind,
    )
  )
    return [];
  return hider ? def.shop : Object.keys(def.runKit);
}
export function partyCanUse(m, p, g) {
  return !!g && !g.modeWeapon && allowedKinds(m, p).includes(KIND_OF.get(g));
}
// Only the Gauntlet's builder shops; everyone else is handed their kit.
export const partyShops = (m, p) =>
  m.party.kind === "gauntlet" && p.team === "defender";
// Hand out each side's kit for the half.
export function partyKit(m, p) {
  const def = PARTY[m.party.kind],
    hider = p.team === "defender",
    kit = [
      "hotpotato",
      "breakout",
      "boulders",
      "livewire",
      "sprinklers",
    ].includes(m.party.kind)
      ? {}
      : m.party.kind === "sweep"
        ? hider
          ? def.hideKit
          : def.seekKit
        : m.party.kind === "lightsout"
          ? hider
            ? def.guardKit
            : def.runKit
          : hider
            ? {}
            : def.runKit;
  p.inventory = { ...kit };
  p.credits = partyShops(m, p) ? CONFIG.credits : 0;
  p.upgrades = {};
  p.hits = 0;
  p.slots = Object.keys(kit);
  p.equipped = p.slots[0] || null;
}
// Preparation: a bot hider or builder puts everything out at once, and the
// wait is cut short.
export function partyPrepare(m) {
  if (m.party.kind === "sprinklers")
    return sprinklersPrepare(m, PARTY_PREP_END);
  if (m.party.kind === "hotpotato") return potatoPrepare(m, PARTY_PREP_END);
  if (m.party.kind === "breakout") return breakoutPrepare(m, PARTY_PREP_END);
  if (m.party.kind === "boulders") return bouldersPrepare(m, PARTY_PREP_END);
  if (m.party.kind === "livewire") return livewirePrepare(m, PARTY_PREP_END);
  // Lights Out has nothing to set up.
  if (m.party.kind === "lightsout")
    return void (m.time = Math.min(m.time, PARTY_PREP_END));
  const bot = m.botPlayer;
  if (bot?.team !== "defender") return;
  const spots = MAPS[m.map].botSpots,
    kit =
      m.party.kind === "sweep" ? PARTY.sweep.hideKit : { smoke: 3, shutter: 2 },
    free = Object.fromEntries(
      Object.entries({
        ...spots,
        shutter: spots.shutter || spots.tripwire || [],
      }).map(([k, v]) => [k, shuffle(v)]),
    );
  for (const [kind, count] of Object.entries(kit))
    for (let i = 0; i < count; i++) {
      const spot = free[baseOf(kind)]?.shift();
      if (spot) m.placeBotGadget({ kind, spot, team: "defender" });
    }
  bot.inventory = {};
  m.time = Math.min(m.time, PARTY_PREP_END);
}
// The search or run starts: how many devices are out there, the clock, and
// where a bot runner heads.
export function partyActivate(m) {
  if (m.party.kind === "sprinklers") return sprinklersActivate(m);
  if (m.party.kind === "hotpotato") return potatoActivate(m);
  if (m.party.kind === "breakout") return breakoutActivate(m);
  if (m.party.kind === "boulders") return bouldersActivate(m);
  if (m.party.kind === "livewire") return livewireActivate(m);
  const party = m.party,
    site = OBJECTIVES.findIndex((o) => o.id === party.site);
  party.found = 0;
  party.caught = 0;
  party.progress = 0;
  party.total = hidden(m).length;
  m.time = halfSeconds(party.kind);
  for (const p of Object.values(m.players))
    if (p.bot && p.team === "attacker" && site >= 0) p.goal = site;
  const name = OBJECTIVES[site]?.name || "the terminal";
  m.notify(
    party.kind === "sweep"
      ? `Bug sweep! ${party.total} device${party.total === 1 ? "" : "s"} hidden. Find them and splash each one.`
      : party.kind === "lightsout"
        ? `Lights out! Reach ${name} and extract. The guard hunts by sound; one hit catches you.`
        : `Gauntlet run! Reach ${name} and extract. Every wire that catches you adds ${PARTY.gauntlet.wirePenalty} s.`,
  );
}
// How long the search or run lasts.
const halfSeconds = (kind) => PARTY[kind].seekSeconds ?? PARTY[kind].runSeconds;
// The hider's devices that count (not smoke, not worn ones).
const hidden = (m) =>
  m.gadgets.filter(
    (g) =>
      g.team === "defender" &&
      !isPortable(g.kind) &&
      ["camera", "sensor", "tripwire", "shutter", "jammer"].includes(
        baseOf(g.kind),
      ),
  );
// Every tick in preparation or the round.
export function partyTick(m, dt) {
  if (m.party.kind === "sprinklers") return sprinklersTick(m, dt);
  const party = m.party;
  if (m.phase === "prep") {
    // The hider or builder has placed everything: on with it.
    const placers = Object.values(m.players).filter(
      (p) => p.team === "defender" && !p.bot,
    );
    if (
      placers.length &&
      placers.every(
        (p) =>
          m.gadgets.some((g) => g.owner === p.id) &&
          !Object.entries(p.inventory).some(([k, n]) => n > 0 && isPlaced(k)),
      ) &&
      m.time > PARTY_PREP_END
    ) {
      m.time = PARTY_PREP_END;
      m.notify("Everything's placed. Starting now.");
    }
    return;
  }
  if (m.phase !== "active") return;
  if (party.kind === "hotpotato") return potatoTick(m, dt);
  if (party.kind === "breakout") return breakoutTick(m, dt);
  if (party.kind === "boulders") return bouldersTick(m, dt);
  if (party.kind === "livewire") return livewireTick(m, dt);
  if (party.kind === "sweep") {
    const devices = hidden(m),
      found = devices.filter((g) => !g.active).length;
    if (found > party.found) {
      party.found = found;
      if (found < party.total)
        m.notify(`Bug found! ${found} of ${party.total}.`);
    }
    if (found >= party.total) partyHalfOver(m, "Every device found");
  }
}
// A wire caught the runner (Gauntlet: a time penalty).
export function partyCaught(m) {
  if (m.party.kind !== "gauntlet") return;
  m.party.caught++;
  m.notify(`Caught! +${PARTY.gauntlet.wirePenalty} s.`);
}
// Lights Out: the guard hit the intruder. One hit is enough.
export function partyHit(m, p, q) {
  if (m.party.kind !== "lightsout" || q.team !== "attacker") return;
  m.party.caught = 1;
  m.notify("Caught in the dark!");
  partyHalfOver(m, "Caught in the dark");
}
// Gauntlet and Lights Out: hold at the one terminal to extract. Progress stays when you
// let go. Only the runner can.
export function partyCapture(m, p, input, dt) {
  const party = m.party,
    site = OBJECTIVES.find((o) => o.id === party.site);
  const here =
    (party.kind === "gauntlet" || party.kind === "lightsout") &&
    p.team === "attacker" &&
    site &&
    distance(p, site) < CONFIG.captureRadius;
  if (!(input.interact && here && p.y < 0.5 && !p.immobile)) {
    p.capture = 0;
    p.site = null;
    return;
  }
  p.site = site.id;
  const need = site.terminal ? CONFIG.terminalSeconds : CONFIG.captureSeconds;
  party.progress += dt;
  p.capture = party.progress;
  m.progress[site.id] = party.progress;
  if (party.progress >= need) {
    p.capture = 0;
    p.site = null;
    partyHalfOver(m, `Extracted from ${site.name}`, true);
  }
}
// The half is over: time ran out, every device was found, or the run is
// done. Record the searcher's or runner's result; after the second half,
// the better one wins.
export function partyHalfOver(m, reason, finished = false) {
  if (m.party.kind === "sprinklers") return sprinklersOver(m, reason);
  if (m.phase === "results") return;
  // Hot Potato's rounds end only when the live grenade goes off.
  if (m.party.kind === "hotpotato") return;
  // Boulder Dash is one race, both climbing at once.
  if (m.party.kind === "boulders") return bouldersOver(m, reason);
  // So is Livewire: one run, both on the platform.
  if (m.party.kind === "livewire") return livewireOver(m, reason);
  const party = m.party,
    runner = Object.values(m.players).find((p) => p.team === "attacker");
  const time = Math.min(m.activeTime || 0, halfSeconds(party.kind));
  if (runner)
    party.scores[runner.id] =
      party.kind === "breakout"
        ? breakoutScore(m, finished, time)
        : party.kind === "sweep"
          ? { found: party.found, total: party.total, time }
          : party.kind === "lightsout"
            ? {
                finished,
                time,
                caught: !!party.caught,
                progress: party.progress,
                need: OBJECTIVES.find((o) => o.id === party.site)?.terminal
                  ? CONFIG.terminalSeconds
                  : CONFIG.captureSeconds,
              }
            : { finished, time, caught: party.caught };
  m.phase = "results";
  let winner = null;
  if (party.half === 2) {
    const ranked = Object.values(m.players)
      .map((p) => ({
        p,
        rank: partyScore(party.kind, party.scores[p.id]).rank,
      }))
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length > 1 && ranked[0].rank < ranked[1].rank)
      winner = ranked[0].p.id;
  }
  m.result = {
    party: party.kind,
    half: party.half,
    // Breakout is one run: no second half.
    final: party.half === 2 || m.noBot || party.kind === "breakout",
    reason,
    winnerId: winner,
    // Keeps the usual result screen's side check working: the winner's side.
    winner: winner ? m.players[winner].team : null,
    remaining: Math.ceil(m.time),
    ...m.stats,
  };
  m.notify(
    party.kind === "breakout"
      ? `${reason}. You ran ${Math.round(party.scores[runner?.id]?.distance || 0)} m!`
      : party.half === 1
      ? `${reason}. Half-time: swap sides.`
      : winner
        ? `${reason}. ${m.players[winner].bot ? "The bot wins" : "Winner decided"}.`
        : `${reason}. It's a tie!`,
  );
}
// Next: the second half (everyone swaps sides), or after the second half a
// new game, everyone back on the side they started on.
export function partyNext(m) {
  if (m.party.kind === "hotpotato") return potatoNext(m);
  const party = m.party,
    // Boulder Dash has no halves: a new race, on a new channel.
    again =
      m.noBot ||
      ["boulders", "livewire", "sprinklers", "breakout"].includes(party.kind),
    swap = !again && party.half === 1 && m.phase === "results";
  for (const p of Object.values(m.players))
    if (swap) p.team = flip(p.team);
    else if (party.first[p.id]) p.team = party.first[p.id];
  if (swap) party.half = 2;
  else m.party = newParty(m, party.kind);
  for (const p of Object.values(m.players))
    Object.assign(p, { brain: null, path: null, waypoint: 0, goal: undefined });
  m.reset();
}
// Hot Potato: the next round goes straight to the 3-2-1 (no kit to pick);
// after the last, a new game from the briefing screen.
function potatoNext(m) {
  const party = m.party,
    more = m.phase === "results" && !m.result?.final;
  if (more) party.half++;
  else m.party = newParty(m, party.kind);
  Object.assign(m.party, potatoRound());
  for (const p of Object.values(m.players))
    Object.assign(p, { brain: null, path: null, waypoint: 0, goal: undefined });
  m.reset();
  if (more) m.prepare();
}
export { potatoThrow as partyThrow };
// After each move: Hot Potato keeps each side to its half; Breakout holds
// everyone to the run's rules.
export function partyClamp(m, p, old, dt) {
  if (m.party.kind === "sprinklers") return sprinklersClamp(m, p);
  if (m.party.kind === "hotpotato") return potatoClamp(m, p);
  if (m.party.kind === "breakout") return breakoutClamp(m, p, old, dt);
  if (m.party.kind === "boulders") return bouldersClamp(m, p, old, dt);
  if (m.party.kind === "livewire") return livewireClamp(m, p, old, dt);
}
// What a player is told about the game: the half, both results so far and
// how the current search or run is going.
export function partyView(m, me) {
  const party = m.party;
  return {
    kind: party.kind,
    name: PARTY[party.kind].name,
    half: party.half,
    site: party.site,
    found: party.found,
    total: party.total,
    caught: party.caught,
    progress: party.progress,
    elapsed: m.phase === "active" ? m.activeTime || 0 : 0,
    ...(party.kind === "hotpotato" ? potatoView(m) : {}),
    ...(party.kind === "breakout" ? breakoutView(m) : {}),
    ...(party.kind === "boulders" ? bouldersView(m) : {}),
    ...(party.kind === "livewire" ? livewireView(m) : {}),
    ...(party.kind === "sprinklers" ? sprinklersView(m) : {}),
    scores: Object.values(m.players).map((p) => {
      const s = partyScore(party.kind, party.scores[p.id]);
      return {
        id: p.id,
        you: p.id === me?.id,
        bot: !!p.bot,
        played: !!party.scores[p.id],
        text: s.text,
      };
    }),
  };
}
