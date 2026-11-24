import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WIN_SCORE,
  computerMove,
  isLegal,
  legalMoves,
  newDuel,
  playRound,
  resolve,
} from "../shared/fireIce.js";

const ball = (element) => ({ action: "ball", element });
const shield = (element) => ({ action: "shield", element });
const reload = { action: "reload", element: null };

test("a ball hits someone who is reloading", () => {
  const r = resolve(ball("fire"), reload);
  assert.equal(r.outcome, "hit");
  assert.deepEqual(r.points, [1, 0]);
  assert.deepEqual(resolve(reload, ball("ice")).points, [0, 1]);
});

test("a same-element shield blocks", () => {
  const r = resolve(shield("fire"), ball("fire"));
  assert.equal(r.outcome, "blocked");
  assert.equal(r.by, 1);
  assert.deepEqual(r.points, [0, 0]);
});

test("an opposite-element shield bounces the ball back", () => {
  const ice = resolve(ball("fire"), shield("ice"));
  assert.equal(ice.outcome, "bounce");
  assert.deepEqual(ice.points, [0, 1]);
  const fire = resolve(shield("fire"), ball("ice"));
  assert.equal(fire.outcome, "bounce");
  assert.deepEqual(fire.points, [1, 0]);
});

test("two balls make steam; shields and reloads alone do nothing", () => {
  assert.equal(resolve(ball("fire"), ball("ice")).outcome, "steam");
  for (const [a, b] of [
    [shield("fire"), shield("ice")],
    [shield("ice"), reload],
    [reload, reload],
  ])
    assert.deepEqual(resolve(a, b), { outcome: "calm", points: [0, 0] });
});

test("after a throw you must reload before throwing again", () => {
  const duel = newDuel();
  assert.equal(legalMoves(duel, 0).length, 5);
  playRound(duel, ball("fire"), shield("fire"));
  assert.deepEqual(duel.loaded, [false, true]);
  assert.equal(isLegal(duel, 0, ball("ice")), false);
  assert.ok(legalMoves(duel, 0).every((m) => m.action !== "ball"));
  assert.throws(() => playRound(duel, ball("ice"), shield("ice")));
  // A shield doesn't reload.
  playRound(duel, shield("ice"), shield("ice"));
  assert.equal(duel.loaded[0], false);
  playRound(duel, reload, shield("ice"));
  assert.equal(duel.loaded[0], true);
  assert.equal(isLegal(duel, 0, ball("ice")), true);
});

test("the computer only picks legal moves", () => {
  const duel = newDuel();
  duel.loaded[1] = false;
  for (let i = 0; i < 30; i++)
    assert.notEqual(computerMove(duel, 1, () => i / 30).action, "ball");
  assert.ok(
    isLegal(
      duel,
      1,
      computerMove(duel, 1, () => 0.999999),
    ),
  );
});

test("first to the winning score wins", () => {
  const duel = newDuel();
  for (let i = 0; i < WIN_SCORE; i++) {
    duel.loaded[0] = true;
    playRound(duel, ball("fire"), reload);
  }
  assert.equal(duel.winner, 0);
  assert.throws(() => playRound(duel, reload, reload));
});
