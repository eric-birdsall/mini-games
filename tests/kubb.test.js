import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BATONS,
  LENGTH,
  activeLine,
  collision,
  flight,
  newMatch,
  nextTurn,
  position,
  settle,
  solveShot,
  targets,
} from "../shared/kubb.js";

function fireAt(match, target, pitch = 0.16) {
  const { aim, power } = solveShot(match, target, pitch);
  const shot = flight(match, aim, pitch, power);
  for (let t = 0; t < 3; t += 1 / 180) {
    const point = position(shot, t);
    const hit = collision(match, point);
    if (hit || point.y <= 0.055) return hit;
  }
}

test("a legal volley can clear five baseline kubbs and win with the final baton", () => {
  const match = newMatch();
  for (const target of targets(match)) {
    const hit = fireAt(match, target);
    assert.equal(hit, target);
    settle(match, hit);
    assert.equal(match.winner, null);
  }
  const king = match.pieces[10];
  assert.equal(targets(match)[0], king);
  assert.equal(fireAt(match, king), king);
  settle(match, king);
  assert.equal(match.left, 0);
  assert.equal(match.winner, 0);
});

test("an early king hit awards the match to the other side", () => {
  const match = newMatch();
  const king = match.pieces[10];
  assert.equal(fireAt(match, king), king);
  settle(match, king);
  assert.equal(match.winner, 1);
});

test("knocked blocks become field targets and standing field blocks advance the next throwing line", () => {
  const match = newMatch();
  const base = targets(match)[0];
  settle(match, base);
  assert.deepEqual(nextTurn(match), [base]);
  assert.equal(match.left, BATONS);
  assert.equal(match.side, 1);
  assert.ok(base.z > 0 && base.z < LENGTH / 2);
  assert.deepEqual(targets(match), [base]);
  const other = match.pieces[0];
  settle(match, other);
  assert.equal(other.standing, true);
  nextTurn(match);
  assert.equal(activeLine(match), base.z);
});

test("the rival shoots from the opposite end and can hit a field target", () => {
  const match = newMatch();
  settle(match, targets(match)[0]);
  nextTurn(match);
  const [target] = targets(match);
  assert.equal(fireAt(match, target), target);
});
