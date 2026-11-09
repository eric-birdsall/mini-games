// Hot Potato: one smiling spud, forgiving tosses, and a confetti sneeze.
// Each player stays on their half; first to two rounds wins.
import { CONFIG, SPAWNS } from "../shared/config.js";
import { WALLS, overlapsFootprint } from "../shared/map.js";
import { eyeHeight } from "../shared/movement.js";
import { PARTY, courtSide } from "../shared/party.js";
import { potatoPath, pathPosition } from "../shared/throwing.js";

const HP = PARTY.hotpotato;
const flip = (team) => (team === "attacker" ? "defender" : "attacker");

// A new round's state: no grenades out until preparation lays them down.
export const potatoRound = () => ({ grenades: [], fuse: 0, beep: null });

// Preparation is the 3-2-1: grenades on the line, the live one and its
// fuse picked, players held at their back walls.
export function potatoPrepare(m, prepEnd) {
  const party = m.party,
    live = Math.floor(Math.random() * HP.grenades);
  party.grenades = Array.from({ length: HP.grenades }, (_, i) => ({
    id: m.nextId++,
    x: (i - (HP.grenades - 1) / 2) * HP.spacing,
    y: 0,
    z: 0,
    live: i === live,
    holder: null,
    flight: null,
    grace: {},
  }));
  party.fuse = HP.fuseMin + Math.random() * (HP.fuseMax - HP.fuseMin);
  party.beep = null;
  party.boom = null;
  m.time = Math.min(m.time, prepEnd);
  m.notify(`Round ${party.half}. Pass the potato before it sneezes confetti!`);
}
// The rush is on. The round clock is the fuse, which nobody is shown, so
// the match clock just runs long.
export function potatoActivate(m) {
  m.time = 600;
  m.notify("Go! Walk over the potato, then toss it across!");
}

// Where a grenade comes to rest when dropped at (x, z) from height y: on the
// highest top beneath it, else the floor.
function restY(x, z, y) {
  let top = 0;
  for (const w of WALLS)
    if (
      !w.hidden &&
      w.h <= y + 0.05 &&
      w.h > top &&
      overlapsFootprint(w, x, z, 0.05)
    )
      top = w.h;
  return top;
}
// In hand: held out in front, a little below the eye.
function hand(p) {
  return {
    x: p.x - Math.sin(p.yaw) * 0.35,
    y: p.y + eyeHeight(p) - 0.45,
    z: p.z - Math.cos(p.yaw) * 0.35,
  };
}
const held = (m, p) => m.party.grenades.find((g) => g.holder === p.id);
function setHands(p, g) {
  p.inventory = g ? { potato: 1 } : {};
  p.equipped = g ? "potato" : null;
  p.slots = g ? ["potato"] : [];
}
// Fire with a grenade in hand: throw it along your aim.
export function potatoThrow(m, p) {
  const g = held(m, p);
  if (!g || m.phase !== "active" || p.immobile > 0 || !p.alive) return;
  const path = potatoPath(p, HP.throwRange);
  g.holder = null;
  g.flight = {
    points: path.points,
    landing: path.landing,
    time: path.time,
    elapsed: 0,
    team: p.team,
  };
  g.grace[p.id] = (m.activeTime || 0) + HP.regrab;
  Object.assign(g, pathPosition(path.points, 0));
  setHands(p, null);
  p.attackFlash = 0.15;
  // A soft whoosh, heard close by (the client plays it like a balloon's).
  m.splashes.push({
    id: m.nextId++,
    kind: "throw",
    x: p.x,
    y: p.y + 1.4,
    z: p.z,
    team: p.team,
    range: CONFIG.throwHearing,
    remaining: 0.6,
  });
}

// A potato hitting a player drops nearby without interrupting movement.
function hitPlayer(m, g, from) {
  for (const q of Object.values(m.players)) {
    if (!q.alive || q.team === g.flight.team) continue;
    for (let i = 1; i <= 4; i++) {
      const f = i / 4,
        at = {
          x: from.x + (g.x - from.x) * f,
          y: from.y + (g.y - from.y) * f,
          z: from.z + (g.z - from.z) * f,
        };
      if (
        Math.hypot(q.x - at.x, q.z - at.z) < CONFIG.playerRadius + 0.1 &&
        at.y > q.y - 0.1 &&
        at.y < q.y + eyeHeight(q) + 0.25
      ) {
        g.flight = null;
        Object.assign(g, { x: at.x, z: at.z, y: restY(at.x, at.z, at.y) });
        m.notify("Boop! The potato bounced down. Keep playing!");
        return true;
      }
    }
  }
  return false;
}

// Every tick of the round: hold each side to its half, fly the grenades,
// pick up what's in reach, and count down the fuse.
export function potatoTick(m, dt) {
  const party = m.party;
  if (m.phase !== "active") return;
  const now = m.activeTime || 0;
  for (const g of party.grenades) {
    if (!g.flight) continue;
    const from = { x: g.x, y: g.y, z: g.z };
    g.flight.elapsed += dt;
    Object.assign(g, pathPosition(g.flight.points, g.flight.elapsed));
    if (hitPlayer(m, g, from)) continue;
    if (g.flight.elapsed >= g.flight.time) {
      Object.assign(g, g.flight.landing);
      g.flight = null;
    }
  }
  // Walk over one to pick it up: hands free, not frozen, not one you just
  // threw. Your reach crosses the line a little, so a grenade lying on it is
  // anyone's.
  for (const p of Object.values(m.players)) {
    if (!p.alive) continue;
    const mine = held(m, p);
    if (mine) {
      Object.assign(mine, hand(p));
      continue;
    }
    if (p.immobile > 0) continue;
    const g = party.grenades
      .filter(
        (g) =>
          !g.holder &&
          !g.flight &&
          !(g.grace[p.id] > now) &&
          Math.hypot(g.x - p.x, g.z - p.z) < HP.reach &&
          g.y > p.y - 0.5 &&
          g.y < p.y + 1.6,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )[0];
    if (g) {
      g.holder = p.id;
      Object.assign(g, hand(p));
      setHands(p, g);
    }
  }
  const left = party.fuse - now;
  const live = party.grenades.find((g) => g.live);
  party.beep = live && left <= HP.tickSeconds ? live.id : null;
  if (live && left <= 0) explode(m, live);
}

// The potato sneezes confetti; whoever has
// it on their half (or in hand) loses the round.
function explode(m, g) {
  const party = m.party,
    holder = g.holder && m.players[g.holder],
    // Still lying on the centre line, untouched: it's on whoever stands
    // nearer it.
    nearest = Object.values(m.players).sort(
      (a, b) =>
        Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z),
    )[0],
    onLine = !holder && Math.abs(g.z) < 0.05,
    loser = holder
      ? holder.team
      : onLine && nearest
        ? nearest.team
        : courtSide(g.z),
    winner = Object.values(m.players).find((p) => p.team === flip(loser)),
    lost = Object.values(m.players).find((p) => p.team === loser);
  party.boom = { x: g.x, y: g.y, z: g.z };
  if (winner) {
    party.scores[winner.id] ??= { wins: 0 };
    party.scores[winner.id].wins++;
  }
  if (lost) party.scores[lost.id] ??= { wins: 0 };
  const wins = winner ? party.scores[winner.id].wins : 0,
    final = wins >= HP.toWin,
    // The client says it from your side ("in your hand", "on their half").
    inHand = !!holder,
    reason = inHand
      ? "The potato sneezed confetti in hand"
      : onLine
        ? "The potato sneezed confetti on the centre line, nearer the " +
          (loser === "attacker" ? "south" : "north")
        : `The potato sneezed confetti on the ${loser === "attacker" ? "south" : "north"} half`;
  m.phase = "results";
  m.result = {
    party: party.kind,
    half: party.half,
    final,
    reason,
    // The round's winner; after the last round, the game's.
    winnerId: winner?.id ?? null,
    winner: winner?.team ?? null,
    loser: lost?.id ?? null,
    inHand,
    onLine,
    remaining: 0,
    ...m.stats,
  };
  m.notify(`Achoo! Too toasty! ${reason}.`);
}

// Each side keeps to its half; during the 3-2-1 everyone waits at their
// back wall.
export function potatoClamp(m, p) {
  if (m.phase === "prep") {
    const s = SPAWNS[p.team];
    if (s) Object.assign(p, { x: s.x, z: s.z });
    return;
  }
  if (m.phase !== "active") return;
  const gap = HP.lineGap;
  if (p.team === "attacker") p.z = Math.max(p.z, gap);
  else p.z = Math.min(p.z, -gap);
}

// What the players are told: where each grenade is (not which is live,
// until it starts to beep), and how long the beeping one has left.
export function potatoView(m) {
  const party = m.party,
    now = m.activeTime || 0;
  return {
    grenades: party.grenades.map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      z: g.z,
      holder: g.holder,
      flying: !!g.flight,
    })),
    wins: Object.fromEntries(
      Object.keys(m.players).map((id) => [id, party.scores[id]?.wins || 0]),
    ),
    beep: party.beep,
    beepLeft: party.beep ? Math.max(0, party.fuse - now) : null,
    boom: m.phase === "results" ? party.boom : null,
  };
}
