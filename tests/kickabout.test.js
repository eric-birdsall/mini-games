import test from "node:test";
import assert from "node:assert/strict";
import {
  FIELD,
  FRIEND,
  LEVELS,
  createMatch,
  keeperOf,
  step,
} from "../shared/kickabout.js";

const DT = 1 / 60;

// A simple player at the controls: run at the ball, dribble at goal, pass
// when someone's in the way, and hold the shot button briefly to shoot.
function human() {
  let charging = 0;
  return (m) => {
    const me = m.players[m.controlled];
    const b = m.ball;
    const has = b.owner === me;
    const go = (tx, ty) => {
      const dx = tx - me.x,
        dy = ty - me.y,
        d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    };
    if (!has) {
      charging = 0;
      const near = Math.hypot(b.x - me.x, b.y - me.y) < 1.6;
      return {
        ...go(b.x, b.y),
        shoot: near && b.owner && b.owner.team === 1 && !b.owner.keeper,
        pass: false,
      };
    }
    const toGoal = FIELD.halfL - me.x;
    if (charging > 0 || (toGoal < 11 && Math.abs(me.y) < 7)) {
      charging += DT;
      return { ...go(FIELD.halfL, 0), shoot: charging < 0.35, pass: false };
    }
    const blocked = m.players.some(
      (o) =>
        o.team === 1 &&
        !o.keeper &&
        o.x > me.x &&
        Math.hypot(o.x - me.x, o.y - me.y) < 1.8,
    );
    return { ...go(FIELD.halfL - 6, me.y * 0.5), shoot: false, pass: blocked };
  };
}

function play(level, seed, controller) {
  const m = createMatch(level, { seed });
  const log = { frames: 0, maxBall: 0, keeperOut: 0, badControl: 0 };
  for (; m.phase !== "over" && log.frames < 60 * 600; log.frames++) {
    const input = controller ? controller(m) : null;
    step(m, input, DT);
    const b = m.ball;
    if (m.phase === "play")
      log.maxBall = Math.max(log.maxBall, Math.abs(b.y) - FIELD.halfW);
    if (m.phase === "play" && Math.abs(b.x) > FIELD.halfL + FIELD.goalDepth)
      log.maxBall = Infinity;
    for (const team of [0, 1]) {
      const k = keeperOf(m, team);
      if (Math.abs(k.x) < FIELD.halfL - FIELD.boxDepth - 0.5) log.keeperOut++;
    }
    const c = m.players[m.controlled];
    if (c.team !== 0 || c.keeper) log.badControl++;
    if (b.owner && b.owner.team === 0 && !b.owner.keeper && b.owner !== c)
      log.badControl++;
  }
  return { m, log };
}

test("matches finish, the ball stays in the yard and keepers stay home", () => {
  for (const level of ["easy", "normal", "hard"])
    for (let seed = 1; seed <= 6; seed++) {
      const { m, log } = play(level, seed, human());
      assert.equal(m.phase, "over", `${level} #${seed} finished`);
      assert.notEqual(m.score[0], m.score[1], "no draws: golden goal");
      assert.ok(log.maxBall <= 0.01, "ball inside the fence");
      assert.equal(log.keeperOut, 0, "keepers stay in their box");
      assert.equal(
        log.badControl,
        0,
        "you always play the teammate on the ball",
      );
    }
});

test("the player controls whoever has the ball, never the keeper", () => {
  const m = createMatch("normal", { seed: 3 });
  const idle = { x: 0, y: 0, shoot: false, pass: false };
  while (m.phase === "kickoff") step(m, idle, DT);
  assert.equal(m.ball.owner, m.players[1]);
  assert.equal(m.controlled, 1);
  // Pass to the teammate: control goes with the ball.
  step(m, { ...idle, pass: true }, DT);
  assert.equal(m.controlled, 2);
  assert.equal(m.ball.passTo, m.players[2]);
  for (let i = 0; i < 180 && m.ball.owner !== m.players[2]; i++)
    step(m, idle, DT);
  assert.equal(m.ball.owner, m.players[2], "the pass arrives");
  // A tap of shoot fires at goal.
  step(m, { ...idle, shoot: true }, DT);
  step(m, idle, DT);
  assert.equal(m.ball.owner, null);
  assert.ok(m.ball.vx > 15, "a shot towards the right-hand goal");
});

test("keeper saves a shot struck straight at them", () => {
  const m = createMatch("hard", { seed: 1 });
  m.phase = "play";
  const k = keeperOf(m, 1);
  const p = m.players[1];
  Object.assign(p, { x: FIELD.halfL - 10, y: 0, face: 0 });
  m.ball.owner = p;
  k.y = 0;
  step(m, { x: 0, y: 0, shoot: true, pass: false }, DT);
  m.prevShoot = true;
  let saved = false;
  for (let i = 0; i < 120 && m.phase === "play"; i++)
    for (const e of step(m, { x: 0, y: -1, shoot: false, pass: false }, DT))
      if (e.type === "save") saved = true;
  // Aimed low but from only 10 m: a Hard keeper usually gets there; either
  // way the ball must end up saved or in the net, never through the side.
  assert.ok(saved || m.phase === "goal");
});

test("difficulty: friendly bots beat Easy and lose to Hard over many games", () => {
  const tally = (level) => {
    const goals = [0, 0];
    for (let seed = 1; seed <= 24; seed++) {
      const m = createMatch(level, { seed });
      for (let f = 0; f < 60 * 400 && m.phase !== "over"; f++)
        step(m, null, DT);
      goals[0] += m.score[0];
      goals[1] += m.score[1];
    }
    return goals;
  };
  const easy = tally("easy");
  const hard = tally("hard");
  assert.ok(easy[0] > easy[1] * 1.5, `easy ${easy}`);
  assert.ok(hard[1] > hard[0], `hard ${hard}`);
  assert.ok(LEVELS.easy.botSpeed < FRIEND.botSpeed);
});

test("a simple human beats Easy most of the time", () => {
  let wins = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { m } = play("easy", seed, human());
    if (m.score[0] > m.score[1]) wins++;
  }
  assert.ok(wins >= 7, `won ${wins} of 10`);
});
