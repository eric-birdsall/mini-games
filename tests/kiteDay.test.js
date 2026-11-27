import test from "node:test";
import assert from "node:assert/strict";
import {
  HEARTS,
  KITE_LEVELS,
  KITE_R,
  MAX_LEN,
  MIN_LEN,
  OAK,
  ROUND_TIME,
  YARD_LEFT,
  YARD_RIGHT,
  YARD_TOP,
  anchorsFor,
  gustWarning,
  hazardAt,
  kitePoint,
  makeRibbon,
  newGame,
  newKite,
  newWind,
  seeded,
  stepGame,
  stepKite,
  stringsCross,
  windAt,
} from "../shared/kiteDay.js";

const DT = 1 / 120;
const steps = (s) => Math.round(s / DT);

// A player who steers toward the nearest ribbon and reels in when the
// string is longer than it needs to be.
function chaser(game, i = 0) {
  const k = game.kites[i];
  let best = null;
  for (const r of game.ribbons)
    if (
      !best ||
      Math.hypot(r.x - k.x, r.y - k.y) < Math.hypot(best.x - k.x, best.y - k.y)
    )
      best = r;
  if (!best) return { reel: k.len > 6 };
  const need = Math.hypot(best.x - k.anchor.x, best.y - k.anchor.y);
  const aim = Math.atan2(best.x - k.anchor.x, best.y - k.anchor.y);
  return {
    steer: Math.max(-1, Math.min(1, (aim - k.a) * 3 - k.w * 0.6)),
    reel:
      k.len > need + 0.2 ||
      (k.lift < 0.5 && Math.abs(k.a) > Math.abs(aim) + 0.2),
  };
}

test("reeling shortens the string and fills lift; letting go pays it out", () => {
  const kite = newKite({ x: 0, y: 1.3 });
  for (let i = 0; i < steps(3); i++)
    stepKite(kite, { reel: true }, 0, "normal", DT);
  assert.equal(kite.len, MIN_LEN);
  assert.equal(kite.lift, 1);
  const highReeled = kite.y;
  for (let i = 0; i < steps(8); i++) stepKite(kite, {}, 0.3, "normal", DT);
  assert.equal(kite.len, MAX_LEN);
  assert.ok(kite.lift < 0.5, "slack string loses lift");
  // Farther out, and leaning well over to the side.
  assert.ok(Math.hypot(kite.x, kite.y - 1.3) > 10);
  assert.ok(Math.abs(kite.a) > 0.5, `sagged over: ${kite.a}`);
  assert.ok(highReeled > 1.3 + MIN_LEN * 0.9, "reeled kite sits overhead");
});

test("steering pushes the kite sideways and wind leans it downwind", () => {
  const right = newKite({ x: 0, y: 1.3 });
  const left = newKite({ x: 0, y: 1.3 });
  for (let i = 0; i < steps(1.5); i++) {
    stepKite(right, { steer: 1, reel: true }, 0, "normal", DT);
    stepKite(left, { steer: -1, reel: true }, 0, "normal", DT);
  }
  assert.ok(right.x > 1 && left.x < -1, `${right.x} ${left.x}`);
  const blown = newKite({ x: 0, y: 1.3 });
  for (let i = 0; i < steps(3); i++)
    stepKite(blown, { reel: true }, 0.9, "normal", DT);
  assert.ok(blown.x > 0.8, `wind to the right leans right: ${blown.x}`);
});

test("the kite never leaves the yard, whatever you do", () => {
  for (const level of Object.keys(KITE_LEVELS)) {
    const game = newGame(level, 1, 7);
    const random = seeded(99);
    let input = {};
    for (let i = 0; i < steps(ROUND_TIME) && !game.over; i++) {
      if (i % 30 === 0)
        input = {
          steer: random() * 2 - 1,
          reel: random() < 0.4,
          tug: random() < 0.05,
        };
      stepGame(game, [input], DT);
      const k = game.kites[0];
      assert.ok(k.x >= YARD_LEFT && k.x <= YARD_RIGHT, `x ${k.x}`);
      assert.ok(k.y <= YARD_TOP && k.y >= 0, `y ${k.y}`);
      assert.ok(k.len >= MIN_LEN - 1e-9 && k.len <= MAX_LEN + 1e-9);
    }
  }
});

test("gusts are warned about before they blow, and Breezy is gentle", () => {
  const wind = newWind("normal", seeded(5));
  const g = wind.gusts[0];
  assert.ok(g, "a gust is planned");
  assert.equal(gustWarning(wind, g.at - KITE_LEVELS.normal.warn - 0.1), null);
  const warn = gustWarning(wind, g.at - 0.5);
  assert.equal(warn.dir, g.dir);
  assert.ok(Math.abs(warn.in - 0.5) < 1e-9);
  const calm = newWind("easy", seeded(5));
  const wild = newWind("hard", seeded(5));
  let calmMax = 0;
  let wildMax = 0;
  for (let t = 0; t < 120; t += 0.05) {
    calmMax = Math.max(calmMax, Math.abs(windAt(calm, t)));
    wildMax = Math.max(wildMax, Math.abs(windAt(wild, t)));
    if (t > calm.next - 20) break;
  }
  assert.ok(calmMax < wildMax, `${calmMax} < ${wildMax}`);
});

test("ribbons are always reachable and clear of the oak, wire and hedges", () => {
  for (const level of Object.keys(KITE_LEVELS))
    for (const players of [1, 2]) {
      const random = seeded(level.length * 31 + players);
      const anchors = anchorsFor(players);
      for (let i = 0; i < 500; i++) {
        const r = makeRibbon(level, random, anchors);
        assert.ok(r, "a ribbon fits");
        const reaches = anchors.map((a) => Math.hypot(r.x - a.x, r.y - a.y));
        assert.ok(
          reaches.some((d) => d >= MIN_LEN && d <= MAX_LEN),
          `reach ${reaches}`,
        );
        const reach = Math.max(...reaches);
        assert.equal(hazardAt(r.x, r.y), null);
        for (const c of OAK)
          assert.ok(Math.hypot(r.x - c.x, r.y - c.y) > c.r + r.r);
        if (r.gold && players === 1)
          assert.ok(reach > 10, "gold ribbons need a long string");
      }
    }
});

test("flying through a ribbon scores it; gold is worth three", () => {
  const game = newGame("normal", 1, 2);
  const k = game.kites[0];
  game.ribbons = [{ x: k.x, y: k.y, r: 0.9, gold: true, until: 99, id: 1 }];
  const events = stepGame(game, [{ reel: true }], DT);
  assert.ok(events.some((e) => e.type === "ribbon"));
  assert.equal(k.score, 3);
  assert.equal(k.golds, 1);
  assert.equal(game.ribbons.length, 3, "a new set floats in");
});

test("a chasing player scores plenty on every level", () => {
  for (const level of Object.keys(KITE_LEVELS)) {
    const game = newGame(level, 1, 11);
    for (let i = 0; i < steps(ROUND_TIME + 1) && !game.over; i++)
      stepGame(game, [chaser(game)], DT);
    assert.ok(game.kites[0].score >= 15, `${level}: ${game.kites[0].score}`);
  }
});

test("bumps cost hearts on Gusty, three ends the game; Breezy has no hearts", () => {
  const game = newGame("normal", 1, 4);
  const k = game.kites[0];
  let over = null;
  for (let n = 0; n < HEARTS && !game.over; n++) {
    // Park the kite in the oak.
    const c = OAK[0];
    for (let i = 0; i < steps(5) && !game.over; i++) {
      if (!k.tumble && !k.safe)
        Object.assign(k, { x: c.x, y: c.y, a: -1, len: 11 });
      if (!k.tumble && !k.safe) {
        const ev = stepGame(game, [{}], 0);
        if (ev.some((e) => e.type === "bump")) break;
      }
      for (const e of stepGame(game, [{}], DT))
        if (e.type === "over") over = e.why;
    }
  }
  for (let i = 0; i < steps(3) && !game.over; i++)
    for (const e of stepGame(game, [{}], DT))
      if (e.type === "over") over = e.why;
  assert.equal(k.hearts, 0);
  assert.equal(over, "hearts");

  const easy = newGame("easy", 1, 4);
  for (let i = 0; i < 6; i++) {
    const e = easy.kites[0];
    Object.assign(e, { x: OAK[0].x, y: OAK[0].y, tumble: 0, safe: 0 });
    stepGame(easy, [{}], 0);
  }
  assert.equal(easy.kites[0].hearts, HEARTS);
  assert.equal(easy.over, false);
});

test("the round ends when the clock runs out", () => {
  const game = newGame("easy", 1, 8);
  let why = null;
  for (let i = 0; i < steps(ROUND_TIME + 1) && !game.over; i++)
    for (const e of stepGame(game, [chaser(game)], DT))
      if (e.type === "over") why = e.why;
  assert.equal(why, "time");
  assert.equal(game.timeLeft, 0);
});

test("crossed strings tangle two kites until they come apart", () => {
  const anchors = anchorsFor(2);
  const a = { anchor: anchors[0], ...kitePoint(anchors[0], 8, 0.6) };
  const b = { anchor: anchors[1], ...kitePoint(anchors[1], 8, -0.6) };
  assert.ok(stringsCross(a, b));
  const c = { anchor: anchors[1], ...kitePoint(anchors[1], 8, 0.4) };
  assert.equal(stringsCross(a, c), false);

  const game = newGame("normal", 2, 3);
  Object.assign(game.kites[0], { a: 0.6, len: 8 });
  Object.assign(game.kites[1], { a: -0.6, len: 8 });
  const events = stepGame(game, [{}, {}], DT);
  assert.ok(events.some((e) => e.type === "tangle"));
  assert.ok(game.kites.every((k) => k.tangled));
  // Player one reels in and steers back to their side.
  let freed = false;
  for (let i = 0; i < steps(4) && !freed; i++)
    freed = stepGame(game, [{ reel: true, steer: -1 }, {}], DT).some(
      (e) => e.type === "untangle",
    );
  assert.ok(freed);
});

test("in a duel nobody loses hearts and the game runs the full clock", () => {
  const game = newGame("hard", 2, 6);
  for (let i = 0; i < steps(ROUND_TIME + 1) && !game.over; i++)
    stepGame(game, [{}, {}], DT);
  assert.equal(game.t >= ROUND_TIME - DT, true);
  assert.ok(game.kites.every((k) => k.hearts === HEARTS));
});

test("crows give warning before they reach the yard", () => {
  const game = newGame("hard", 1, 9);
  let crowAt = null;
  for (let i = 0; i < steps(40) && crowAt === null; i++) {
    const ev = stepGame(game, [{ reel: true }], DT);
    if (ev.some((e) => e.type === "crow")) crowAt = game.t;
  }
  assert.ok(crowAt !== null);
  const crow = game.crows[0];
  const toEdge = crow.dir > 0 ? YARD_LEFT - crow.x : crow.x - YARD_RIGHT;
  assert.ok(toEdge / crow.speed > 1.2, `${toEdge / crow.speed}s of warning`);
  assert.ok(KITE_R > 0);
});
