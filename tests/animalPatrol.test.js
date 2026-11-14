import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE,
  BREAKOUT,
  CLEARING,
  FLIGHT,
  SCENES,
  createPatrol,
  stepPatrol,
  throwBall,
} from "../shared/animalPatrol.js";

const reach = { x: 0.045, y: 0.05 };
const calm = () => 0.6;
const advance = (patrol, seconds, random = calm) => {
  for (let i = 0; i < Math.round(seconds * 100); i++)
    stepPatrol(patrol, 0.01, random);
};

test("a miss allows a retry; a hit absorbs the fox and ends the round", () => {
  const patrol = createPatrol();
  assert.ok(throwBall(patrol, 0.1, 0.2, reach, calm));
  assert.equal(
    throwBall(patrol, patrol.critters[0].x, patrol.critters[0].y, reach, calm),
    false,
  );
  advance(patrol, FLIGHT + 0.01);
  assert.equal(patrol.status, "miss");

  assert.ok(
    throwBall(patrol, patrol.critters[0].x, patrol.critters[0].y, reach, calm),
  );
  advance(patrol, FLIGHT + 0.01);
  assert.equal(patrol.status, "capturing");
  assert.equal(
    throwBall(patrol, patrol.critters[0].x, patrol.critters[0].y, reach, calm),
    false,
  );
  advance(patrol, CAPTURE + 0.01);
  assert.equal(patrol.status, "complete");
  assert.equal(patrol.throws, 2);
});

test("the fox can dodge a throw aimed at its starting position", () => {
  const patrol = createPatrol();
  assert.ok(
    throwBall(
      patrol,
      patrol.critters[0].x,
      patrol.critters[0].y,
      reach,
      () => 0,
    ),
  );
  advance(patrol, FLIGHT + 0.01);
  assert.equal(patrol.status, "miss");
  assert.ok(patrol.critters[0].x > 0.55);
});

test("the fox pauses between runs and stays within the clearing", () => {
  const patrol = createPatrol();
  const original = { ...patrol.critters[0] };
  advance(patrol, 2.4);
  assert.deepEqual(patrol.critters[0], original);
  advance(patrol, 0.8, () => 0.9);
  assert.notEqual(patrol.critters[0].x, original.x);
  const afterRun = { ...patrol.critters[0] };
  advance(patrol, 2.3, () => 0.9);
  assert.deepEqual(patrol.critters[0], afterRun);
  advance(patrol, 20);
  assert.ok(patrol.critters[0].x <= CLEARING.right);
  assert.ok(patrol.critters[0].y <= CLEARING.bottom);
});

test("cover blocks a throw and every critter must be caught to clear a scene", () => {
  const patrol = createPatrol(SCENES[1]);
  const [rock] = patrol.cover;
  const [first, second] = patrol.critters;
  const original = { x: first.x, y: first.y };
  Object.assign(first, { x: rock.x, y: rock.y });
  throwBall(patrol, rock.x, rock.y, reach, calm);
  advance(patrol, FLIGHT + 0.01);
  assert.equal(patrol.status, "blocked");
  assert.equal(patrol.caught, 0);

  Object.assign(first, original);
  for (const [critter, expected] of [
    [first, "caught"],
    [second, "complete"],
  ]) {
    assert.ok(throwBall(patrol, critter.x, critter.y, reach, calm));
    advance(patrol, FLIGHT + 0.01);
    advance(patrol, CAPTURE + 0.01);
    assert.equal(patrol.status, expected);
    assert.equal(critter.caught, true);
  }
});

test("a hit can break free after shaking, then a Master Ball catches it", () => {
  const patrol = createPatrol();
  const [fox] = patrol.critters;
  assert.ok(throwBall(patrol, fox.x, fox.y, reach, calm));
  advance(patrol, FLIGHT + 0.01, () => 0.99);
  assert.equal(patrol.status, "capturing");
  advance(patrol, CAPTURE + 0.01);
  assert.equal(patrol.status, "escaped");
  assert.equal(patrol.caught, 0);
  advance(patrol, BREAKOUT);
  patrol.selected = "master";
  assert.ok(throwBall(patrol, fox.x, fox.y, reach, calm));
  assert.equal(patrol.supply.master, 0);
  assert.equal(patrol.selected, "poke");
  advance(patrol, FLIGHT + CAPTURE + 0.02, () => 0.999);
  assert.equal(patrol.status, "complete");
});

test("special balls are spent on misses and the remaining supply carries forward", () => {
  const patrol = createPatrol();
  patrol.selected = "great";
  assert.ok(throwBall(patrol, 0.01, 0.02, reach, calm));
  assert.equal(throwBall(patrol, 0.01, 0.02, reach, calm), false);
  assert.equal(patrol.supply.great, 2);
  advance(patrol, FLIGHT + 0.01);
  assert.equal(patrol.status, "miss");
  const next = createPatrol(SCENES[1], patrol.supply);
  assert.equal(next.supply.great, 2);
  next.selected = "great";
  next.supply.great = 0;
  assert.equal(throwBall(next, 0.01, 0.02, reach, calm), false);
  assert.equal(next.throws, 0);
  assert.equal(patrol.supply.great, 2);
});
