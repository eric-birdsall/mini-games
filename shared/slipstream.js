export const COURSE_LENGTH = 420;
export const TRACK_HALF = 5.6;
const LANES = [-3.6, 0, 3.6];
// Mud keeps this much clear ground between itself and a slide's end.
const MUD_SLIDE_GAP = 2;
export function course() {
  const slides = [];
  for (let i = 0; i < 8; i++) {
    slides.push({
      id: `slide${i}`,
      kind: "slide",
      x: LANES[i % 3],
      z: 30 + i * 49,
      width: 2.8,
      length: 32,
    });
  }
  const onSlide = (x, z, length) =>
    slides.some(
      (s) =>
        s.x === x &&
        Math.abs(s.z - z) < s.length / 2 + length / 2 + MUD_SLIDE_GAP,
    );
  const items = [];
  for (let i = 0; i < 23; i++) {
    const z = 24 + i * 16;
    const length = 5;
    // Start in the mud pile's usual lane and slide over to a free one so
    // no mud ever sits on a slip 'n slide.
    const start = (i + 1) % 3;
    const lane = [0, 1, 2]
      .map((k) => LANES[(start + k) % 3])
      .find((x) => !onSlide(x, z, length));
    if (lane === undefined) continue;
    items.push({
      id: `hazard${i}`,
      kind: "mud",
      x: lane,
      z,
      width: 3.2,
      length,
    });
  }
  return [...items, ...slides];
}
export function racer(name, x = 0) {
  return {
    name,
    x,
    z: 0,
    speed: 10,
    chain: 0,
    boost: 0,
    mud: false,
    mudEntries: 0,
    finish: null,
    lastSlide: null,
    // Belly dive: `dive` counts down through the hop (DIVE_AIR) and the
    // belly slide after it; `diveBoost` is the small landing kick. A dive
    // that lands on grass is a belly flop: `flop` counts down while the
    // racer skids to a stop and gets back up.
    dive: 0,
    diveBoost: 0,
    flop: 0,
    landedInMud: false,
    landedOnGrass: false,
  };
}
export const DIVE_AIR = 0.42;
export const DIVE_SLIDE = 0.7;
export const DIVE_TOTAL = DIVE_AIR + DIVE_SLIDE;
const DIVE_KICK = 1.6;
const DIVE_KICK_TIME = 1.1;
// A belly flop on grass: lie still, then spend FLOP_STAND getting up.
export const FLOP_TIME = 1;
export const FLOP_STAND = 0.5;
// Lying flat: diving, or still face down after a belly flop.
export const isProne = (r) => r.dive > 0 || r.flop > FLOP_STAND;
// Height of the dive's hop at a given point in it (0 once on the belly).
export function diveHeight(r) {
  const t = DIVE_TOTAL - r.dive;
  if (r.dive <= 0 || t >= DIVE_AIR) return 0;
  const u = t / DIVE_AIR;
  return 4 * 0.7 * u * (1 - u);
}
export function stepRacer(r, input, dt, elapsed, items) {
  if (r.finish !== null) return;
  r.boost = Math.max(0, r.boost - dt);
  if (!r.boost) r.chain = 0;
  const wasAirborne = r.dive > DIVE_SLIDE;
  r.flop = Math.max(0, r.flop - dt);
  const flopped = r.flop > 0;
  if (input.dive && r.dive <= 0 && !flopped && !r.mud) {
    r.dive = DIVE_TOTAL;
    r.landedInMud = false;
    r.landedOnGrass = false;
  }
  r.dive = Math.max(0, r.dive - dt);
  r.diveBoost = Math.max(0, r.diveBoost - dt);
  const airborne = r.dive > DIVE_SLIDE;
  r.x = Math.max(
    -TRACK_HALF,
    Math.min(TRACK_HALF, r.x + (flopped ? 0 : input.steer || 0) * 8 * dt),
  );
  const slide = items.find(
    (o) =>
      o.kind === "slide" &&
      Math.abs(o.x - r.x) < o.width / 2 &&
      Math.abs(o.z - r.z) < o.length / 2,
  );
  if (slide && r.lastSlide !== slide.id) {
    r.chain = Math.min(5, r.chain + 1);
    r.lastSlide = slide.id;
  }
  if (slide) r.boost = 2.4;
  const inMud =
    !airborne &&
    items.some(
      (o) =>
        o.kind === "mud" &&
        Math.abs(o.x - r.x) < o.width / 2 + 0.35 &&
        Math.abs(o.z - r.z) < o.length / 2,
    );
  if (inMud && !r.mud) r.mudEntries++;
  r.mud = inMud;
  if (inMud) {
    r.boost = 0;
    r.chain = 0;
    r.diveBoost = 0;
  }
  // Touchdown: a tiny kick forward on a slip 'n slide; mud slows as usual;
  // a belly flop on grass stops the racer until they get back up.
  if (wasAirborne && !airborne) {
    r.landedInMud = inMud;
    if (slide && !inMud) r.diveBoost = DIVE_KICK_TIME;
    else if (!slide && !inMud) {
      r.landedOnGrass = true;
      r.dive = 0;
      r.flop = FLOP_TIME;
      r.boost = 0;
      r.chain = 0;
    }
  }
  const target =
    r.flop > 0
      ? 0
      : (r.mud
          ? 4
          : 10 +
            (r.boost > 0 ? 3 + r.chain * 1.7 : 0) +
            (r.diveBoost > 0 ? DIVE_KICK : 0)) * (input.pace ?? 1);
  r.speed += (target - r.speed) * Math.min(1, dt * (r.flop > 0 ? 16 : 9));
  const oldZ = r.z;
  r.z = Math.min(COURSE_LENGTH, r.z + r.speed * dt);
  if (r.z >= COURSE_LENGTH)
    r.finish =
      elapsed + dt * ((COURSE_LENGTH - oldZ) / Math.max(0.001, r.speed * dt));
}
export const SLIPSTREAM_LEVELS = {
  easy: { pace: 0.85, lookahead: 12, avoid: 6, steer: 0.55, diveLead: 1.5 },
  normal: { pace: 1, lookahead: 20, avoid: 12, steer: 0.9, diveLead: 3 },
  hard: { pace: 1.12, lookahead: 30, avoid: 18, steer: 1.3, diveLead: 4.4 },
};
// How often rivals slip up at each difficulty (1 = normal).
const MISTAKES = { easy: 1.6, normal: 1, hard: 0.45 };
// Each rival gets its own quirks so races aren't ties: a touch faster or
// slower, sharper or lazier steering, and a sloppiness that sets how often
// it slips up — missing a mudpile, spotting a slide too late, diving too
// early into a belly flop, or drifting off its line.
export function rivalStyle(rand = Math.random) {
  const spread = (size) => 1 + (rand() * 2 - 1) * size;
  return {
    pace: spread(0.06),
    steer: spread(0.3),
    avoid: spread(0.25),
    diveLead: (rand() * 2 - 1) * 0.6,
    sloppy: 0.5 + rand(),
    drift: 0.6 + rand() * 1.2,
    phase: rand() * Math.PI * 2,
    rand,
    plan: {},
  };
}
const MISTAKE_ODDS = { mud: 0.3, late: 0.3, flop: 0.14 };
function mistakes(style, o, level) {
  if (!(o.id in style.plan)) {
    const odds = style.sloppy * (MISTAKES[level] ?? 1);
    const roll = style.rand();
    style.plan[o.id] =
      o.kind === "mud"
        ? { unseen: roll < MISTAKE_ODDS.mud * odds }
        : {
            late: roll < MISTAKE_ODDS.late * odds,
            flop:
              roll >= MISTAKE_ODDS.late * odds &&
              roll < (MISTAKE_ODDS.late + MISTAKE_ODDS.flop) * odds,
          };
  }
  return style.plan[o.id];
}
export function botInput(r, items, index, level = "normal") {
  const base = SLIPSTREAM_LEVELS[level] || SLIPSTREAM_LEVELS.normal;
  const style = r.style;
  const settings = style
    ? {
        ...base,
        pace: base.pace * style.pace,
        steer: base.steer * style.steer,
        avoid: base.avoid * style.avoid,
        diveLead: Math.max(1.3, base.diveLead + style.diveLead),
      }
    : base;
  const plan = (o) => (style ? mistakes(style, o, level) : {});
  const ahead = items.filter(
    (o) =>
      o.z + o.length / 2 > r.z && o.z - o.length / 2 < r.z + settings.lookahead,
  );
  // A rival dodging a mudpile keeps clear until it's past or well to the
  // side, instead of wobbling back onto the pile's edge.
  const clearOf = (o, x, margin) => Math.abs(o.x - x) >= o.width / 2 + margin;
  const obstacle =
    ahead.find(
      (o) =>
        o.id === r.dodging && o.z + o.length / 2 > r.z && !clearOf(o, r.x, 1.4),
    ) ||
    ahead.find(
      (o) =>
        o.kind === "mud" &&
        !plan(o).unseen &&
        o.z - r.z < settings.avoid &&
        !clearOf(o, r.x, 0.9),
    );
  r.dodging = obstacle?.id;
  // A slide spotted late only draws the rival over once it's nearly there.
  const slide = ahead.find(
    (o) =>
      o.kind === "slide" &&
      (!plan(o).late || o.z - o.length / 2 - r.z < 2),
  );
  const drift = style
    ? Math.sin(r.z * 0.09 + style.phase) * style.drift
    : 0;
  // Dodge toward the slide when its lane is clear of the mud.
  const target = obstacle
    ? slide && clearOf(obstacle, slide.x, 1.4)
      ? slide.x
      : obstacle.x >= 0
        ? -3.6
        : 3.6
    : (slide ? slide.x : (index - 1) * 2) + drift;
  const lead = slide && slide.z - slide.length / 2 - r.z;
  // A bad dive goes far too early and lands on the grass.
  const diveLead =
    slide && plan(slide).flop ? settings.diveLead + 6 : settings.diveLead;
  const dive =
    slide &&
    (!obstacle || clearOf(obstacle, r.x, 0.9)) &&
    lead > diveLead - 1.2 &&
    lead < diveLead &&
    Math.abs(slide.x - r.x) < 0.8;
  return {
    dive,
    pace: settings.pace,
    steer: Math.max(-1, Math.min(1, (target - r.x) * settings.steer)),
  };
}
