import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOWER,
  CORNERS,
  GOLD_VALUE,
  LEAF_LEVELS,
  PLAYERS,
  RAKE,
  ROUND_TIME,
  SEAT_ORDER,
  STEP,
  YARD,
  cornerOf,
  joinSeat,
  leaveSeat,
  playerNumber,
  stickWalk,
  facingOf,
  leafPlan,
  matchState,
  newRound,
  piles,
  startSpot,
  step,
  winners,
} from "../shared/leafPiles.js";

const people = (bots = [false, false, false, false]) =>
  bots.map((bot) => ({ bot }));
const play = (round, seconds, input = []) => {
  const end = round.t + seconds;
  while (round.t < end - 1e-9) step(round, input, STEP);
  return round;
};
const groundLeaf = (round, x, z, kind = "leaf") => {
  const leaf = {
    id: round.leaves.length,
    kind,
    at: 0,
    from: null,
    x,
    z,
    state: "ground",
    vx: 0,
    vz: 0,
    hop: 0,
  };
  round.leaves.push(leaf);
  return leaf;
};
// A round with nothing falling, so tests control every leaf.
const emptyRound = (bots) => {
  const round = newRound(7, people(bots));
  round.plan = [];
  round.blowerAt = Infinity;
  return round;
};

test("the corners are the four corners of the yard", () => {
  assert.equal(CORNERS.length, PLAYERS);
  CORNERS.forEach((c, i) => {
    assert.equal(Math.abs(c.x), YARD);
    assert.equal(Math.abs(c.z), YARD);
    assert.equal(cornerOf(c.x * 0.9, c.z * 0.9), i);
  });
  assert.equal(cornerOf(0, 0), -1);
});

test("everyone starts outside their corner, facing the middle", () => {
  for (let i = 0; i < PLAYERS; i++) {
    const s = startSpot(i);
    assert.equal(cornerOf(s.x, s.z), -1);
    assert.ok(Math.abs(s.facing - facingOf(-s.x, -s.z)) < 1e-9);
  }
});

test("leaf plans are seeded, in time order and never land in a corner", () => {
  const a = leafPlan(42);
  assert.deepEqual(a, leafPlan(42));
  assert.notDeepEqual(a, leafPlan(43));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].at >= a[i - 1].at);
  for (const leaf of a) {
    assert.equal(cornerOf(leaf.x, leaf.z), -1);
    assert.ok(Math.abs(leaf.x) < YARD && Math.abs(leaf.z) < YARD);
    assert.ok(leaf.at < ROUND_TIME);
  }
  assert.ok(a.some((l) => l.kind === "gold"));
  assert.ok(a.filter((l) => !l.from).length > 10, "some start on the grass");
});

test("a rake swing slides leaves in front the way you face", () => {
  const round = emptyRound();
  const p = round.players[0];
  p.x = 0;
  p.z = 0;
  p.facing = facingOf(1, 0); // facing +x
  const ahead = groundLeaf(round, 0.8, 0);
  const behind = groundLeaf(round, -0.8, 0);
  play(round, 2, [{ x: 0, z: 0, rake: true }]);
  assert.ok(ahead.x > 0.8 + RAKE.slide * 0.6, `slid to ${ahead.x}`);
  assert.ok(Math.abs(ahead.z) < 1);
  assert.equal(behind.x, -0.8);
});

test("raking a leaf into your corner scores it, and anyone can rake it out", () => {
  const round = emptyRound();
  const me = round.players[0]; // front-left corner (-x, +z)
  me.x = -3.2;
  me.z = 3.2;
  me.facing = facingOf(-1, 1);
  groundLeaf(round, -3.8, 3.8, "gold");
  groundLeaf(round, -3.6, 3.6);
  play(round, 2, [{ x: 0, z: 0, rake: true }]);
  assert.equal(piles(round.leaves)[0].points, GOLD_VALUE + 1);
  // A rival walks in behind the pile and rakes it back out.
  const rival = round.players[1];
  me.x = 3;
  me.z = -3;
  rival.x = -YARD + 0.5;
  rival.z = YARD - 0.5;
  rival.facing = facingOf(1, -1);
  play(round, 4, [
    { x: 0, z: 0, rake: false },
    { x: 0, z: 0, rake: true },
  ]);
  assert.ok(piles(round.leaves)[0].points < GOLD_VALUE + 1);
});

test("people's swings near their corner aim straight at it", () => {
  const round = emptyRound();
  const me = round.players[0];
  me.x = -3;
  me.z = 3;
  const home = facingOf(CORNERS[0].x - me.x, CORNERS[0].z - me.z);
  me.facing = home + 0.3;
  const leaf = groundLeaf(round, -3.4, 3.4);
  play(round, 2, [{ x: 0, z: 0, rake: true }]);
  assert.equal(cornerOf(leaf.x, leaf.z), 0);
  // Without the help that swing would have gone well wide.
  assert.ok(Math.abs(leaf.x - leaf.z * -1) < 1.2);
});

test("leaves stay inside the fence and players can't overlap", () => {
  const round = emptyRound();
  const leaf = groundLeaf(round, YARD - 0.5, 0);
  leaf.vx = 40;
  const [a, b] = round.players;
  a.x = b.x = 0;
  a.z = 0;
  b.z = 0.1;
  play(round, 1);
  assert.ok(leaf.x <= YARD);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.8);
  for (const p of round.players)
    assert.ok(Math.abs(p.x) < YARD && Math.abs(p.z) < YARD);
});

test("the leaf blower turns up, gets picked up and blows hard", () => {
  const round = newRound(3, people());
  play(round, BLOWER.first + 0.1);
  assert.ok(round.blower, "a blower is waiting");
  const me = round.players[0];
  me.x = round.blower.x;
  me.z = round.blower.z;
  step(round, [], STEP);
  assert.equal(round.blower, null);
  assert.ok(me.blower > BLOWER.time - 0.1);
  me.facing = facingOf(1, 0);
  round.leaves = [];
  const leaf = groundLeaf(round, me.x + 2.2, me.z);
  const from = leaf.x;
  play(round, 0.5, [{ x: 0, z: 0, rake: true }]);
  assert.ok(leaf.x > from + 1, "blown away");
  play(round, BLOWER.time);
  assert.equal(me.blower, 0);
});

test("nothing moves after the whistle", () => {
  const round = newRound(5, people());
  play(round, ROUND_TIME);
  const before = JSON.stringify(round.players.map((p) => [p.x, p.z]));
  play(round, 1, [{ x: 1, z: 0, rake: true }]);
  assert.equal(JSON.stringify(round.players.map((p) => [p.x, p.z])), before);
});

test("computer neighbours rake leaves home, better on harder levels", () => {
  const average = (level) => {
    let total = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const round = newRound(
        seed * 101,
        people([false, true, false, false]),
        level,
      );
      play(round, ROUND_TIME);
      total += piles(round.leaves)[1].points;
    }
    return total / 6;
  };
  const easy = average("easy");
  const hard = average("hard");
  assert.ok(easy > 20, `easy averages ${easy}`);
  assert.ok(hard > easy, `hard ${hard} beats easy ${easy}`);
  assert.deepEqual(Object.keys(LEAF_LEVELS), ["easy", "normal", "hard"]);
});

test("four computer neighbours finish a round without trouble", () => {
  const round = newRound(9, people([true, true, true, true]), "hard");
  play(round, ROUND_TIME);
  const pile = piles(round.leaves);
  assert.ok(pile.every((p) => Number.isFinite(p.points)));
  assert.ok(pile.reduce((a, p) => a + p.points, 0) > 20);
  for (const leaf of round.leaves)
    assert.ok(Number.isFinite(leaf.x) && Number.isFinite(leaf.z));
});

test("winners and the best-of-three match", () => {
  assert.deepEqual(winners([3, 9, 9, 1]), [1, 2]);
  let m = matchState([[5, 1, 1, 1]]);
  assert.equal(m.over, false);
  m = matchState([
    [5, 1, 1, 1],
    [6, 2, 2, 2],
  ]);
  assert.equal(m.over, true);
  assert.deepEqual(m.champs, [0]);
  // Three different round winners: most points overall takes it.
  m = matchState([
    [9, 1, 1, 1],
    [1, 8, 1, 1],
    [1, 1, 7, 1],
  ]);
  assert.equal(m.over, true);
  assert.deepEqual(m.wins, [1, 1, 1, 0]);
  assert.deepEqual(m.champs, [0]);
  // A tied round counts as a win for each.
  m = matchState([
    [4, 4, 0, 0],
    [4, 4, 0, 0],
  ]);
  assert.deepEqual(m.champs, [0, 1]);
});

test("neighbours don't gang up and get stuck in one corner", () => {
  // A big pile in your corner and you standing in the middle: one neighbour
  // may raid it, but they shouldn't all crowd in and stay there.
  let crowded = 0;
  let inside = 0;
  let frames = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const round = newRound(
      seed * 53,
      people([false, true, true, true]),
      "hard",
    );
    step(round, [], 0);
    for (let k = 0; k < 25; k++)
      groundLeaf(round, -7 + (k % 5) * 0.4, 7 - Math.floor(k / 5) * 0.4);
    round.players[0].x = round.players[0].z = 0;
    for (let f = 0; f < 60 * 30; f++) {
      step(round, [], STEP);
      const n = round.players
        .slice(1)
        .filter((p) => cornerOf(p.x, p.z) === 0).length;
      inside += n;
      if (n >= 2) crowded++;
      frames++;
    }
  }
  assert.ok(crowded / frames < 0.06, `2+ in your corner ${crowded / frames}`);
  assert.ok(
    inside / frames / 3 < 0.12,
    `time in your corner ${inside / frames / 3}`,
  );
});

test("four-player seats fill player 1 front left, 2 front right, then the back", () => {
  let seats = [null, null, null, null];
  seats = joinSeat(seats, { pad: 2 });
  assert.deepEqual(seats, [{ pad: 2 }, null, null, null]);
  seats = joinSeat(seats, { pad: 0 });
  assert.deepEqual(seats[3], { pad: 0 });
  assert.equal(joinSeat(seats, { pad: 0 }), seats, "already seated");
  seats = joinSeat(seats, { keys: "wasd" });
  seats = joinSeat(seats, { pad: 1 });
  assert.deepEqual(seats, [
    { pad: 2 },
    { keys: "wasd" },
    { pad: 1 },
    { pad: 0 },
  ]);
  assert.equal(joinSeat(seats, { pad: 3 }), seats, "the yard is full");
  assert.deepEqual(SEAT_ORDER.map(playerNumber), [1, 2, 3, 4]);
  // Leaving frees that corner, and the next to join takes the lowest free seat.
  seats = leaveSeat(seats, { pad: 2 });
  assert.equal(seats[0], null);
  seats = joinSeat(seats, { pad: 3 });
  assert.deepEqual(seats[0], { pad: 3 });
});

test("four humans each steer their own critter", () => {
  const round = newRound(5, people(), "normal");
  step(round, [], 0);
  const before = round.players.map((p) => ({ x: p.x, z: p.z }));
  const walks = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  play(
    round,
    0.5,
    walks.map((w) => ({ ...w, rake: false })),
  );
  round.players.forEach((p, i) => {
    const dx = p.x - before[i].x;
    const dz = p.z - before[i].z;
    assert.ok(
      dx * walks[i].x + dz * walks[i].z > 1,
      `player ${i} moved its own way`,
    );
  });
});

test("stick walk ignores drift and reaches full speed at the edge", () => {
  assert.deepEqual(stickWalk(0.1, -0.15), { x: 0, z: 0 });
  const full = stickWalk(1, 0);
  assert.ok(Math.abs(full.x - 1) < 1e-9 && full.z === 0);
  const half = stickWalk(0, 0.6);
  assert.ok(half.z > 0.4 && half.z < 0.6);
});
