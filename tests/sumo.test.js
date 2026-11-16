import assert from "node:assert/strict";
import test from "node:test";
import {
  createSumo,
  stepSumo,
  sumoStick,
  SUMO,
  SUMO_STATE as S,
} from "../shared/sumo.js";

const advance = (match, count, inputs) => {
  for (let i = 0; i < count; i++) stepSumo(match, inputs);
};
const press = (key, extra) => ({ ...extra, pressed: { [key]: true } });
const matchUp = (gap = 1.3) => {
  const match = createSumo(["a", "b", "c", "d"]);
  advance(match, match.start);
  const [a, b, c, d] = match.players;
  Object.assign(a, { x: -gap / 2, z: 0, facing: 0 });
  Object.assign(b, { x: gap / 2, z: 0, facing: Math.PI });
  Object.assign(c, { x: 0, z: -5, facing: Math.PI / 2 });
  Object.assign(d, { x: 0, z: 5, facing: -Math.PI / 2 });
  return { match, a, b, c, d };
};

test("participants spawn equidistant and stay still until the countdown ends", () => {
  const match = createSumo(["north", "east", "south", "west"]);
  const before = structuredClone(match.players);
  for (const p of before)
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - SUMO.ring.spawn) < 1e-8);
  advance(match, match.start, Array(4).fill(press("dash", { x: 1 })));
  assert.deepEqual(match.players, before);
  stepSumo(match, [{ x: 1 }, { z: 1 }, { x: -1 }, { z: -1 }]);
  assert.deepEqual(
    match.players.map((p) => [Math.round(p.vx / 0.3), Math.round(p.vz / 0.3)]),
    [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ],
  );
  assert.equal(sumoStick(0.1, 0).x, 0);
  assert.ok(Math.hypot(...Object.values(sumoStick(1, 1))) <= 1.0000000001);
});

test("movement accelerates, separates bodies and transfers momentum", () => {
  const { match, a, b } = matchUp(1.11);
  stepSumo(match, [{ x: 1 }]);
  assert.ok(a.vx > 0 && a.vx < SUMO.move.speed);
  advance(match, 10, [{ x: 1 }]);
  assert.ok(b.vx > 0);
  assert.ok(b.x - a.x >= 2 * SUMO.body.radius - 1e-9);
  const prior = a.vx;
  stepSumo(match);
  assert.ok(a.vx < prior);
});

test("a dash winds up, strikes once and consumes its own cooldown", () => {
  const { match, a, b } = matchUp(1.4);
  stepSumo(match, [press("dash")]);
  assert.equal(a.state, S.WINDUP);
  advance(match, 10);
  assert.equal(a.state, S.RECOVER);
  assert.equal(b.hits, 1);
  assert.ok(b.vx > 7);
  advance(match, 24, [press("dash")]);
  assert.equal(a.state, S.FREE);
  assert.equal(b.hits, 1);
  assert.ok(a.ready.dash > match.clock);
});

test("brace rebounds a dash, expires and requires a new press", () => {
  const { match, a, b } = matchUp(1.5);
  stepSumo(match, [press("dash"), press("brace", { brace: true })]);
  advance(match, 11, [{}, { brace: true }]);
  assert.equal(b.state, S.BRACE);
  assert.equal(b.hits, 0);
  assert.ok(a.vx < 0);
  advance(match, 140, [{}, { brace: true }]);
  assert.equal(b.state, S.FREE);
});

test("simultaneous dashes send both players backward", () => {
  const { match, a, b } = matchUp(2.1);
  stepSumo(match, [press("dash"), press("dash")]);
  advance(match, 9);
  assert.equal(a.hits, 1);
  assert.equal(b.hits, 1);
  assert.ok(a.vx < 0 && b.vx > 0);
  assert.ok(Math.abs(a.vx + b.vx) < 1e-8);
});

test("grab cancels brace and throws in the locked direction without a fresh counter", () => {
  const { match, a, b } = matchUp();
  stepSumo(match, [{}, press("brace", { brace: true })]);
  advance(match, 7, [{}, { brace: true }]);
  assert.equal(b.state, S.BRACE);
  stepSumo(match, [press("grab"), { brace: true, grab: true }]);
  assert.equal(a.state, S.HOLD);
  assert.equal(b.state, S.CAUGHT);
  advance(match, 21, [{ z: 1 }, { grab: true }]);
  assert.ok(match.events.includes("throw"));
  assert.equal(b.partner, null);
  assert.ok(b.vx > 9 && Math.abs(b.vz) < 1e-8);
});

test("a fresh grab counter works independently of the victim's offensive cooldown", () => {
  const { match, a, b } = matchUp();
  b.ready.grab = match.clock + 200;
  const ready = b.ready.grab;
  stepSumo(match, [press("grab"), press("grab")]);
  assert.equal(b.state, S.CAUGHT);
  stepSumo(match);
  stepSumo(match, [{}, press("grab")]);
  assert.ok(match.events.includes("counter"));
  assert.equal(b.ready.grab, ready);
  assert.equal(a.partner, null);
  assert.ok(a.vx < 0 && b.vx > 0);
});

test("opposing grabs clash and protected dodges cause a grab whiff", () => {
  const clash = matchUp();
  stepSumo(clash.match, [press("grab"), press("grab")]);
  assert.deepEqual(clash.match.events, ["clash"]);
  assert.ok(clash.a.vx < 0 && clash.b.vx > 0);
  assert.equal(clash.a.partner, null);
  assert.ok(
    clash.a.ready.grab > clash.match.clock &&
      clash.b.ready.grab > clash.match.clock,
  );

  const dodge = matchUp();
  stepSumo(dodge.match, [press("grab"), press("dodge", { x: -1 })]);
  assert.equal(dodge.a.state, S.RECOVER);
  assert.equal(dodge.b.state, S.DODGE);
  assert.ok(dodge.b.x - dodge.a.x >= 2 * SUMO.body.radius - 1e-9);
  assert.equal(dodge.b.hits, 0);
});

test("a third-party dash interrupts a grab and frees the defender", () => {
  const { match, a, b, c } = matchUp();
  Object.assign(c, { x: a.x, z: -2.25, facing: Math.PI / 2 });
  stepSumo(match, [{}, {}, press("dash")]);
  advance(match, 5);
  stepSumo(match, [press("grab")]);
  assert.equal(b.state, S.CAUGHT);
  advance(match, 8);
  assert.equal(a.state, S.HIT);
  assert.equal(a.partner, null);
  assert.equal(b.partner, null);
  assert.equal(b.hits, 0);
});

test("the edge uses body centers, abilities can self-eliminate, and ties share points", () => {
  const { match, a, b, c, d } = matchUp();
  const r = SUMO.ring.radius;
  Object.assign(a, { x: r, facing: 0 });
  Object.assign(b, { x: -r, facing: Math.PI });
  stepSumo(match);
  assert.equal(a.state, S.FREE);
  stepSumo(match, [press("dodge"), press("dash")]);
  assert.equal(a.state, S.OUT);
  advance(match, 6);
  assert.equal(b.state, S.OUT);
  Object.assign(c, { z: r + 0.001 });
  Object.assign(d, { z: -r - 0.001 });
  stepSumo(match, [press("dash"), press("grab")]);
  assert.equal(match.phase, "finished");
  assert.deepEqual(match.placements, [
    { id: "c", place: 1, points: 100 },
    { id: "d", place: 1, points: 100 },
    { id: "b", place: 3, points: 30 },
    { id: "a", place: 4, points: 0 },
  ]);
  stepSumo(match);
  assert.deepEqual(match.events, []);
  assert.equal(createSumo(["a", "b", "c", "d"]).players[0].ready.dash, 0);
});

test("one surviving participant wins and receives the top score", () => {
  const { match, a, b, c } = matchUp();
  for (const p of [a, b, c]) p.x = SUMO.ring.radius + 1;
  stepSumo(match);
  assert.deepEqual(match.placements[0], { id: "d", place: 1, points: 100 });
  assert.deepEqual(
    match.placements.slice(1).map((p) => p.place),
    [2, 2, 2],
  );
});
