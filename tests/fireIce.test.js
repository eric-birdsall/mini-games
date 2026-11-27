import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WIN_SCORE,
  computerMove,
  ACTIONS,
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

// How often the computer picks each action, over an even spread of rolls.
function picks(duel, smarts) {
  const counts = Object.fromEntries(ACTIONS.map((a) => [a, 0]));
  for (let i = 0; i < 1000; i++)
    counts[computerMove(duel, 1, () => (i + 0.5) / 1000, smarts)]++;
  return counts;
}

test("the computer leans toward sensible moves", () => {
  const duel = newDuel();
  // You can't attack: it attacks more than it shields.
  duel.loaded = [false, true];
  let c = picks(duel);
  assert.ok(c.ball > c.shield, JSON.stringify(c));
  // Neither can attack: it reloads more than it shields.
  duel.loaded = [false, false];
  c = picks(duel);
  assert.ok(c.reload > c.shield, JSON.stringify(c));
  assert.equal(c.ball, 0);
  // Both loaded: reloading wastes a turn, so it's the rarest pick.
  duel.loaded = [true, true];
  c = picks(duel);
  assert.ok(c.reload < c.ball && c.reload < c.shield, JSON.stringify(c));
});

test("the computer still mixes it up", () => {
  const duel = newDuel();
  for (const loaded of [
    [true, true],
    [false, true],
  ]) {
    duel.loaded = loaded;
    const c = picks(duel);
    for (const a of ACTIONS)
      if (a !== "ball" || loaded[1]) assert.ok(c[a] > 100, JSON.stringify(c));
  }
  // With no smarts it's an even random pick.
  duel.loaded = [true, true];
  for (const n of Object.values(picks(duel, 0)))
    assert.ok(Math.abs(n - 333) <= 1, String(n));
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
