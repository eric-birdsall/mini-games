import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WIN_SCORE,
  computerMove,
  isLegal,
  legalActions,
  newDuel,
  otherElement,
  playRound,
  resolve,
} from "../shared/fireIce.js";

test("the computer gets the other element", () => {
  assert.equal(otherElement("fire"), "ice");
  assert.equal(otherElement("ice"), "fire");
});

test("an attack hits someone who is reloading", () => {
  const r = resolve("ball", "reload");
  assert.equal(r.outcome, "hit");
  assert.deepEqual(r.points, [1, 0]);
  assert.deepEqual(resolve("reload", "ball").points, [0, 1]);
});

test("a shield blocks an attack", () => {
  const r = resolve("shield", "ball");
  assert.equal(r.outcome, "blocked");
  assert.equal(r.by, 1);
  assert.deepEqual(r.points, [0, 0]);
});

test("two attacks make steam; shields and reloads alone do nothing", () => {
  assert.equal(resolve("ball", "ball").outcome, "steam");
  for (const [a, b] of [
    ["shield", "shield"],
    ["shield", "reload"],
    ["reload", "reload"],
  ])
    assert.deepEqual(resolve(a, b), { outcome: "calm", points: [0, 0] });
});

test("you can attack once, then must reload", () => {
  const duel = newDuel();
  assert.deepEqual(legalActions(duel, 0), ["ball", "reload", "shield"]);
  playRound(duel, "ball", "shield");
  assert.deepEqual(duel.loaded, [false, true]);
  assert.equal(isLegal(duel, 0, "ball"), false);
  assert.throws(() => playRound(duel, "ball", "shield"));
  // A shield doesn't reload.
  playRound(duel, "shield", "shield");
  assert.equal(duel.loaded[0], false);
  playRound(duel, "reload", "shield");
  assert.equal(isLegal(duel, 0, "ball"), true);
});

test("the computer only picks legal actions", () => {
  const duel = newDuel();
  duel.loaded[1] = false;
  for (let i = 0; i < 30; i++)
    assert.notEqual(
      computerMove(duel, 1, () => i / 30),
      "ball",
    );
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
    playRound(duel, "ball", "reload");
  }
  assert.equal(duel.winner, 0);
  assert.throws(() => playRound(duel, "reload", "reload"));
});
