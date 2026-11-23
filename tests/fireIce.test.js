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

const m = (action, element, zone) => ({ action, element, zone });

test("a ball at a different height from the shield hits", () => {
  const r = resolve(m("ball", "fire", "head"), m("shield", "ice", "legs"));
  assert.equal(r.outcome, "hit");
  assert.deepEqual(r.points, [1, 0]);
});

test("a same-element shield at the right height blocks", () => {
  const r = resolve(m("shield", "fire", "body"), m("ball", "fire", "body"));
  assert.equal(r.outcome, "blocked");
  assert.equal(r.by, 1);
  assert.deepEqual(r.points, [0, 0]);
});

test("an opposite-element shield at the right height bounces it back", () => {
  const ice = resolve(m("ball", "fire", "legs"), m("shield", "ice", "legs"));
  assert.equal(ice.outcome, "bounce");
  assert.deepEqual(ice.points, [0, 1]);
  const fire = resolve(m("shield", "fire", "head"), m("ball", "ice", "head"));
  assert.equal(fire.outcome, "bounce");
  assert.deepEqual(fire.points, [1, 0]);
});

test("two balls make steam and two shields do nothing", () => {
  assert.equal(
    resolve(m("ball", "fire", "head"), m("ball", "ice", "head")).outcome,
    "steam",
  );
  assert.equal(
    resolve(m("shield", "fire", "head"), m("shield", "ice", "legs")).outcome,
    "calm",
  );
});

test("after a throw that side must raise a shield next round", () => {
  const duel = newDuel();
  playRound(duel, m("ball", "fire", "head"), m("shield", "ice", "legs"));
  assert.deepEqual(duel.recharging, [true, false]);
  assert.equal(isLegal(duel, 0, m("ball", "ice", "body")), false);
  assert.equal(isLegal(duel, 0, m("shield", "ice", "body")), true);
  assert.ok(legalMoves(duel, 0).every((move) => move.action === "shield"));
  assert.equal(legalMoves(duel, 1).length, 12);
  assert.throws(() =>
    playRound(duel, m("ball", "ice", "body"), m("shield", "ice", "legs")),
  );
  playRound(duel, m("shield", "ice", "body"), m("shield", "ice", "legs"));
  assert.deepEqual(duel.recharging, [false, false]);
});

test("the computer only picks legal moves", () => {
  const duel = newDuel();
  duel.recharging[1] = true;
  for (let i = 0; i < 50; i++) {
    const move = computerMove(duel, 1, () => i / 50);
    assert.equal(move.action, "shield");
  }
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
    duel.recharging = [false, false];
    playRound(duel, m("ball", "fire", "head"), m("shield", "fire", "legs"));
  }
  assert.equal(duel.winner, 0);
  assert.throws(() =>
    playRound(duel, m("shield", "fire", "head"), m("shield", "fire", "legs")),
  );
});
