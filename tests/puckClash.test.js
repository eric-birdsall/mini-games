import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD,
  BUMPER_RADIUS,
  placeClashBumper,
  enforceClashLanding,
  scoreClash,
  DIAMOND_TIP,
  MAX_ANGLE,
  STEP,
  countClashPucks,
  launchClashPuck,
  clashLaunchPosition,
  stepClash,
} from "../shared/puckClash.js";

test("straight simultaneous shots rebound from opposite tips of the diamond", () => {
  const shot = { aim: 0, power: 0.9 };
  const blue = launchClashPuck(0, shot);
  const orange = launchClashPuck(1, shot);
  let collided = false;
  for (let tick = 0; tick < 350; tick++) {
    stepClash([blue, orange], STEP);
    assert.ok(Math.abs(blue.z + orange.z) < 1e-9);
    assert.ok(blue.z >= DIAMOND_TIP + BOARD.radius - 1e-9);
    if (blue.vz > 0 && orange.vz < 0) {
      collided = true;
      break;
    }
  }
  assert.ok(collided);
});

test("both end walls bounce pucks while both side edges eliminate them", () => {
  for (const sign of [-1, 1]) {
    const base = { team: 0, x: 0, z: 0, vx: 0, vz: 0, fall: null };
    const end = {
      ...base,
      z: sign * (BOARD.halfLength - BOARD.radius),
      vz: sign * 4,
    };
    const side = { ...base, x: sign * BOARD.halfWidth, z: 1.65, vx: sign * 4 };
    const pucks = [end, side];
    stepClash(pucks, STEP);
    assert.equal(end.z, sign * (BOARD.halfLength - BOARD.radius));
    assert.ok(end.vz * sign < 0);
    assert.equal(side.fall, 0);
    assert.deepEqual(countClashPucks(pucks), [1, 0]);
  }
});

test("a glancing shot can knock a rival puck over an open side", () => {
  const attacker = { team: 0, x: 1.35, z: 1.35, vx: 4, vz: 1.35, fall: null };
  const rival = { team: 1, x: 1.61, z: 1.58, vx: 0, vz: 1.35, fall: null };
  const pucks = [attacker, rival];
  for (let tick = 0; tick < 500 && stepClash(pucks, STEP); tick++) {
    if (rival.fall !== null) break;
  }
  assert.notEqual(rival.fall, null);
  assert.equal(attacker.fall, null);
  assert.deepEqual(countClashPucks(pucks), [1, 0]);
});

test("bumpers can be placed continuously on the owner's half clear of obstacles", () => {
  for (const team of [0, 1]) {
    const facing = team === 0 ? 1 : -1;
    const point = { x: 0.713, z: 1.847 * facing };
    assert.deepEqual(placeClashBumper(team, point), { team, ...point });
    assert.equal(placeClashBumper(1 - team, point), null);
    assert.equal(
      placeClashBumper(team, { x: BOARD.halfWidth, z: point.z }),
      null,
    );
    assert.equal(
      placeClashBumper(team, { x: 0, z: BUMPER_RADIUS * facing }),
      null,
    );
    assert.equal(
      placeClashBumper(team, { x: 0, z: BOARD.launch * facing }),
      null,
    );
    assert.ok(
      placeClashBumper(team, { x: 1.13, z: (BOARD.launch + 0.32) * facing }),
    );
  }
});

test("only newly thrown pucks that finish short are removed for one opposing point", () => {
  const old = { team: 0, z: 0.4, fall: null };
  const blue = { team: 0, z: 0, fall: null };
  const orange = { team: 1, z: 0.4, fall: null };
  const off = { team: 1, z: -0.2, fall: 0.7 };
  assert.deepEqual(enforceClashLanding([blue, orange]), [blue]);
  assert.deepEqual(enforceClashLanding([blue, orange, off]), []);
  assert.deepEqual(scoreClash([old, blue, orange, off]), [1, 1]);
  assert.equal(old.fall, null);
  assert.equal(orange.fall, null);
});

test("a glancing shot banks off a placed bumper and otherwise goes straight", () => {
  const bumper = placeClashBumper(0, { x: 0, z: 1.35 });
  const glancing = {
    team: 0,
    x: 0.29,
    z: bumper.z + 0.7,
    vx: 0,
    vz: -4,
    fall: null,
  };
  const open = { ...glancing };
  for (let tick = 0; tick < 50; tick++) {
    stepClash([glancing], STEP, [bumper]);
    stepClash([open], STEP);
  }
  assert.ok(glancing.vx > 0.5);
  assert.equal(open.vx, 0);
  assert.ok(open.z < bumper.z);
});

test("a glancing shot banks off the diamond while a wider shot goes around", () => {
  const glancing = { ...launchClashPuck(0, { aim: 0, power: 1 }), x: 0.29 };
  const wide = { ...glancing, x: 0.85 };
  let banked = false;
  for (let tick = 0; tick < 140; tick++) {
    stepClash([glancing], STEP);
    stepClash([wide], STEP);
    banked ||= glancing.vx > 1;
  }
  assert.ok(banked);
  assert.equal(wide.x, 0.85);
  assert.ok(wide.z < 0);
});

test("either player can launch nearly sideways while still crossing the line forward", () => {
  for (const team of [0, 1]) {
    const forward = team === 0 ? -1 : 1;
    for (const side of [-1, 1]) {
      const puck = launchClashPuck(team, { aim: side * MAX_ANGLE, power: 0.7 });
      const line = puck.z;
      assert.ok(puck.vx * side * -forward > 5);
      assert.ok(puck.vz * forward > 0 && Math.abs(puck.vz) < 0.02);
      const backwards = launchClashPuck(team, {
        aim: side * Math.PI,
        power: 0.7,
      });
      assert.equal(backwards.vz, puck.vz);
      stepClash([puck], STEP);
      assert.ok((puck.z - line) * forward > 0);
    }
  }
});

test("a puck that hits a rival can stay on its own half", () => {
  const shoot = (targetTeam) => {
    const shot = { team: 0, x: 0.85, z: 3.1, vx: 0, vz: -2, fall: null };
    const target = {
      team: targetTeam,
      x: 0.85,
      z: 2.5,
      vx: 0,
      vz: 0,
      fall: null,
    };
    for (let tick = 0; tick < 150 && stepClash([shot, target], STEP); tick++);
    assert.ok(shot.z > 0);
    return shot;
  };
  const rivalHit = shoot(1);
  const ownHit = shoot(0);
  assert.deepEqual(enforceClashLanding([rivalHit, ownHit]), [ownHit]);
  assert.equal(rivalHit.fall, null);
  rivalHit.fall = 0.7;
  assert.deepEqual(scoreClash([rivalHit]), [0, 1]);
});

test("side rails rebound pucks behind both launch lines and leave midfield open", () => {
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const puck = {
        team: 0,
        x: side * 1.25,
        z: end * 4.55,
        vx: side * 3,
        vz: 0,
        fall: null,
      };
      const open = { ...puck, z: end * 3.9 };
      for (let tick = 0; tick < 120; tick++) stepClash([puck, open], STEP);
      assert.equal(puck.fall, null);
      assert.ok(Math.abs(puck.x) < 1.25);
      assert.notEqual(open.fall, null);
    }
  }
});

test("the next puck launches beside parked pieces instead of overlapping them", () => {
  for (const team of [0, 1]) {
    const z = BOARD.launch * (team === 0 ? 1 : -1);
    const resting = { x: 0, z, team: 1 - team, fall: null };
    const origin = clashLaunchPosition(team, [resting], []);
    assert.equal(origin.z, z);
    assert.ok(Math.abs(origin.x) >= 2 * BOARD.radius);
    const puck = launchClashPuck(team, { aim: 0, power: 0.7 }, origin);
    assert.equal(puck.x, origin.x);
    assert.equal(puck.z, origin.z);
    assert.deepEqual(
      clashLaunchPosition(team, [{ ...resting, fall: 0.7 }], []),
      { x: 0, z },
    );
  }
});
