import { CONFIG } from "./config.js";

// Party minigames: short two-half games where both players play both sides.
// The first half's Sentinel hides or builds and its Infiltrator searches or
// runs; then everyone swaps sides and the better result wins.
//
// Hot Potato: no sides to swap. Each player keeps to their half of a small
// court; one cartoon potato waits on the centre line and sneezes confetti
// after a surprise interval. Whoever has it on their side (or in hand) when
// it does loses the round. Best of three.
//
// Breakout: one run down a long, straight, three-lane hallway (built from a
// seed). Auto run keeps you sprinting; hurdles block one or two lanes. Low
// ones you jump, tall ones you switch lanes around. Running into one ends the
// run: go as far as you can. No halves, nobody chasing.
//
// Boulder Dash: both players race up the same steep channel at once while
// enormous boulders roll down it. Full-width ones leave nowhere to stand
// but the recesses cut into the side walls; half-width ones (orange) can be
// sidestepped. A hit flattens you and puts you back in the last recess you
// passed. First to the top wins; otherwise the higher climb.
//
// Beach Ball Dodge (kind "livewire"): both players stand on a pool float
// while bots on the pool deck throw beach balls straight across it, up and
// down or side to side. Step out of the ball's path; one that hits you
// shoves you on: near the edge, into the pool. One run, getting harder every
// wave; the first to fall in loses.
export const PARTY = {
  sprinklers: {
    name: "Sprinkler Dodge",
    map: "yard",
    runSeconds: 180,
    moveSpeed: 5.5,
    soakSeconds: 2,
    waveSeconds: 15,
    radius: 3.2,
    warnSeconds: 1.6,
    spraySeconds: 2.8,
    retractSeconds: 0.6,
    gap: 5.5,
  },
  hotpotato: {
    name: "Hot Potato",
    // Played on its own court, whatever map was picked.
    map: "court",
    // First to win this many rounds (best of three).
    toWin: 2,
    // One potato on the centre line (legacy network field name).
    grenades: 1,
    spacing: 2.5,
    // The live one's fuse (s), picked at random each round and never shown.
    fuseMin: 20,
    fuseMax: 35,
    // For its last tickSeconds it beeps and blinks.
    tickSeconds: 5,
    // Every throw flies this far on flat ground at the ideal angle.
    throwRange: 15,
    // Walk within reach (m) to pick one up, hands free; a throw can't be
    // caught by its thrower for regrab seconds.
    reach: 1.25,
    regrab: 0.4,
    // Potato bumps never stun players.
    stunSeconds: 0,
    // Nobody may come closer than this to the centre line.
    lineGap: 0.35,
  },
  breakout: {
    name: "Breakout",
    // One run, as far as you can go. The hallway is long enough that the
    // clock and the end wall are only backstops.
    runSeconds: 900,
    // The course: this long from the start line to the end of the hall (m),
    // one straight hallway three lanes wide.
    length: 3000,
    // Start at a normal sprint, then add this much speed each second.
    rampDelay: 4,
    acceleration: 0.455,
    // Keep lane changes at the same speed as the runner accelerates.
    laneSpeed: 9,
    // Hurdles across one or two of the three lanes (never all three): the
    // first this far past the start line, then one every hurdleGap[0] to
    // hurdleGap[1] m, closing to hurdleGapEnd by the far end.
    firstHurdle: 12,
    hurdleGap: [9, 15],
    hurdleGapEnd: [6.5, 10],
    // The chance a hurdle is a tall one (too high to jump: go around it),
    // rising from tall[0] to tall[1] along the hall. The first few are
    // always low.
    tall: [0.25, 0.5],
    lowFirst: 3,
    // The bot's chance of fumbling each hurdle (and so tripping and losing
    // the run), by level.
    botMiss: { easy: 0.08, normal: 0.04, hard: 0.015 },
  },
  boulders: {
    name: "Boulder Dash",
    // One race. Nobody at the top by then: the higher climb wins.
    raceSeconds: 90,
    // The channel rises this much per metre (about 14°), and going up it
    // you're no faster than climbTop m/s; the flat uses moveSpeed.
    slope: 0.25,
    climbTop: CONFIG.walkSpeed,
    moveSpeed: CONFIG.walkSpeed,
    // Recesses alternate walls, the gaps between them widening from gapMin
    // to gapMax m up the channel.
    recesses: 12,
    gapMin: 8,
    gapMax: 12,
    // Boulders: released at the top at speed m/s, gaining accel m/s² up to
    // top. Radii (m) of a full-width one and a half-width one.
    speed: 8,
    accel: 0.6,
    top: 12,
    fullRadius: 1.7,
    halfRadius: 0.9,
    // The rhythm: the first one this long after the go, then mostly
    // singles (single s apart), sometimes a close pair (pair s), sometimes
    // a lull. Over rampUp s the gaps shrink by up to `tighten` and the
    // half-width share grows across halfShare.
    firstAt: 2,
    single: [4.2, 6.2],
    pair: 1.3,
    pairChance: 0.2,
    lull: [7.5, 9.5],
    lullChance: 0.15,
    halfShare: [0.5, 0.7],
    tighten: 0.15,
    rampUp: 75,
    // Flattened: held this long in the recess you're put back in.
    flatSeconds: 1.5,
    // The bot's chance, each time it decides to wait, of going anyway, and
    // how long it hesitates once the way is clear (s).
    botMiss: { easy: 0.3, normal: 0.15, hard: 0.05 },
    botPause: { easy: 1.8, normal: 0.8, hard: 0.2 },
  },
  livewire: {
    name: "Beach Ball Dodge",
    // Played in its own arena, whatever map was picked.
    map: "crucible",
    // The float is this wide (m, square), with this much pool water between
    // its edge and each side of the pool (the pool stays 13 m across).
    platform: 5,
    moat: 4,
    // A beach ball's radius (m) and the height of its middle over the
    // float's top as it flies (straight, no arc). It hits you if its path
    // passes within ballRadius + hitPad of your middle.
    ballRadius: 0.4,
    ballHeight: 0.45,
    hitPad: 0.3,
    // The first throw this long after the go; each bot holds its ball up
    // for warnSeconds (its path marked on the float) before it throws.
    firstAt: 2,
    warnSeconds: 1.1,
    // A new wave every waveSeconds. Each sets how fast balls fly (m/s), the
    // time between one group of throws and the next (s), which way they may
    // fly ("z": up and down the screen; "x": side to side) and the patterns
    // that can come. Past the last one, each wave adds speedStep and takes
    // gapStep off, down to minGap.
    waveSeconds: 15,
    waves: [
      { speed: 4, gap: 3.5, axes: ["z"], patterns: ["single"] },
      { speed: 4.5, gap: 3.2, axes: ["z", "x"], patterns: ["single"] },
      { speed: 5, gap: 3, axes: ["z", "x"], patterns: ["single", "double"] },
      {
        speed: 5.5,
        gap: 3,
        axes: ["z", "x"],
        patterns: ["single", "double", "cross"],
      },
      {
        speed: 6,
        gap: 2.8,
        axes: ["z", "x"],
        patterns: ["single", "double", "cross", "triple"],
      },
    ],
    speedStep: 0.4,
    gapStep: 0.2,
    minGap: 1.6,
    // Two balls thrown side by side fly at least doubleSpread m apart, so
    // there's always somewhere to stand. Never more than maxLive balls over
    // the float at once.
    doubleSpread: 2,
    maxLive: 3,
    // Most throws aim at a player (wherever they stand when the bot lifts
    // the ball), the rest at a random spot on the float.
    aimChance: 0.75,
    // A hit catches you within catchReach m of the ball's middle along its
    // path.
    catchReach: 0.35,
    // Hit: shoved on in the ball's direction over shoveSeconds, shove m by a
    // first-wave ball and shoveGrowth m further for each m/s faster, unable
    // to move for stunSeconds, and balls pass through you for graceSeconds.
    shove: 1.1,
    shoveGrowth: 0.35,
    shoveSeconds: 0.25,
    stunSeconds: 0.5,
    graceSeconds: 1.2,
    // The bot's chance of not noticing each ball, by level, and how much
    // more each wave from botMissFrom on; how long it takes to react to a
    // new one.
    botMiss: { easy: 0.4, normal: 0.3, hard: 0.04 },
    botMissStep: 0.04,
    botMissFrom: 3,
    botReact: { easy: 0.6, normal: 0.35, hard: 0.15 },
  },

};
// Hot Potato: whose half a point is on. The centre line (z = 0) splits the
// court; the infiltrator's half is the south (z > 0).
export const courtSide = (z) => (z >= 0 ? "attacker" : "defender");
// Lights Out: how lit the guard's view is, 0 (dark) to 1, at `elapsed`
// seconds into the run. It snaps on and fades out.
export function lightsPulse(elapsed) {
  const { pulseEvery, pulseSeconds } = PARTY.lightsout,
    t = (elapsed % pulseEvery) - (pulseEvery - pulseSeconds);
  if (!(elapsed > 0) || t < 0) return 0;
  return Math.max(0, Math.min(1, t / 0.08, (pulseSeconds - t) / 0.45));
}
// Seconds until the next pulse starts.
export function nextPulse(elapsed) {
  const { pulseEvery, pulseSeconds } = PARTY.lightsout,
    at = Math.max(0, elapsed) % pulseEvery;
  return (pulseEvery - pulseSeconds - at + pulseEvery) % pulseEvery;
}
export const isParty = (kind) => !!PARTY[kind];
// Once the hider or builder has nothing left to place, preparation winds
// down to this many seconds.
export const PARTY_PREP_END = 3;
// One half's result, as a sortable score (lower is better) and a line of
// text.
export function partyScore(kind, half) {
  if (!half) return { rank: Infinity, text: "—" };
  if (kind === "sweep") {
    const left = half.total - half.found;
    return {
      // Most found first, then the quicker sweep.
      rank: left * 1000 + half.time,
      text: !half.total
        ? "Nothing was hidden"
        : `${half.found} of ${half.total} found${half.found === half.total && half.total ? ` in ${clock(half.time)}` : ""}`,
    };
  }
  if (kind === "hotpotato") {
    const wins = half.wins || 0;
    return {
      // Most rounds won first.
      rank: -wins,
      text: `${wins} round${wins === 1 ? "" : "s"} won`,
    };
  }
  if (kind === "breakout") {
    const far = Math.max(0, Math.round(half.distance || 0));
    return {
      // Further is better; going the whole way, sooner.
      rank: half.finished ? half.time : 100000 - far,
      text: half.finished
        ? `Ran the whole hall in ${clock(half.time)}`
        : `Ran ${far} m`,
    };
  }
  if (kind === "boulders") {
    const far = Math.max(0, Math.floor(half.best || 0)),
      hits = half.hits || 0;
    return {
      // Any finish beats any climb that didn't: finishes by time, the rest
      // by how high they got, then fewer hits.
      rank: half.finished
        ? half.time + hits / 1000
        : 100000 - Math.round((half.best || 0) * 10) + hits / 1000,
      text: half.finished ? `Top in ${clock(half.time)}` : `Reached ${far} m`,
    };
  }
  if (kind === "sprinklers")
    return {
      rank: half.wet ? -half.time : -100000,
      text: half.wet ? `Soaked at ${clock(half.time)}` : "Stayed dry",
    };
  if (kind === "livewire") {
    const trips = half.trips || 0;
    return {
      // Whoever stayed on longer; falling together, fewer hits.
      rank: (half.fell ? -half.time : -100000) + trips / 1000,
      // (Hits only settle a fall together; the HUD keeps count.)
      text: half.fell ? `Splashed at ${clock(half.time)}` : "Stayed dry",
    };
  }
  if (kind === "lightsout") {
    const share = Math.min(1, (half.progress || 0) / (half.need || 1));
    return {
      // An extraction beats any run that didn't finish; those rank by how
      // much data came off.
      rank: half.finished ? half.time : 100000 + (1 - share) * 1000,
      text: half.finished
        ? `Extracted in ${clock(half.time)}`
        : `${half.caught ? "Caught" : "Out of time"} · ${Math.floor(share * 100)}% extracted`,
    };
  }
  const total = half.time + half.caught * PARTY.gauntlet.wirePenalty;
  return {
    // A finished run beats any run that didn't finish.
    rank: (half.finished ? 0 : 100000) + total,
    text: half.finished
      ? `${clock(total)}${half.caught ? ` (${clock(half.time)} + ${half.caught} wire${half.caught > 1 ? "s" : ""})` : ""}`
      : `Didn't finish${half.caught ? ` · ${half.caught} wire${half.caught > 1 ? "s" : ""}` : ""}`,
  };
}
export const clock = (sec) => {
  const s = Math.max(0, Math.round(sec * 10) / 10),
    m = Math.floor(s / 60),
    r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
};

// Games with built-in equipment and no backpack selection.
export const skipsBackpack = (kind) =>
  ["hotpotato", "breakout", "boulders", "livewire", "sprinklers"].includes(
    kind,
  );
