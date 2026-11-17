import test from "node:test";
import assert from "node:assert/strict";
import {
  LANES,
  POND_ROUNDS,
  createPond,
  createRun,
  hopTarget,
  land,
  respawn,
  roundStars,
  seeded,
  summary,
} from "../shared/sinkOrFloat.js";

// Breadth-first search over floaters using forward/back/sideways hops.
function crossable(pond) {
  const seen = new Set();
  const queue = [];
  for (let lane = 0; lane < LANES; lane++)
    if (pond.stones[1][lane].floats) queue.push([1, lane]);
  while (queue.length) {
    const [r, l] = queue.shift();
    const key = `${r},${l}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r === pond.rows) return true;
    for (const [dr, dl] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nr = r + dr;
      const nl = l + dl;
      if (nr >= 1 && nr <= pond.rows && nl >= 0 && nl < LANES)
        if (pond.stones[nr][nl].floats) queue.push([nr, nl]);
    }
  }
  return false;
}

test("every pond has a floating path and sinkers in every row", () => {
  for (let seed = 1; seed < 400; seed++) {
    for (const round of POND_ROUNDS) {
      const pond = createPond(round.rows, seeded(seed));
      assert.ok(crossable(pond), `seed ${seed} rows ${round.rows}`);
      for (let r = 1; r <= pond.rows; r++) {
        const sinkers = pond.stones[r].filter((s) => !s.floats).length;
        assert.ok(sinkers >= 2, `row ${r} needs sinkers`);
      }
    }
  }
});

test("landing on a sinker splashes, sinks the stone and blocks it", () => {
  const run = createRun({ rows: 3 }, seeded(7));
  const lane = run.player.lane;
  const stone = run.pond.stones[1][lane];
  stone.floats = false;
  const to = hopTarget(run, "up");
  assert.deepEqual(to, { row: 1, lane });
  assert.equal(land(run, to), "sink");
  assert.equal(run.splashes, 1);
  assert.ok(stone.sunk && stone.known);
  respawn(run);
  assert.deepEqual(run.player, { row: 0, lane });
  assert.equal(hopTarget(run, "up"), null);
});

test("floaters hold, banks bound the board, and the far bank wins", () => {
  const run = createRun({ rows: 2 }, seeded(3));
  for (const row of run.pond.stones.slice(1))
    for (const s of row) s.floats = true;
  assert.equal(hopTarget(run, "down"), null);
  run.player.lane = 0;
  assert.equal(hopTarget(run, "left"), null);
  assert.equal(land(run, hopTarget(run, "up")), "float");
  assert.equal(land(run, hopTarget(run, "right")), "float");
  assert.equal(land(run, hopTarget(run, "up")), "float");
  assert.equal(land(run, hopTarget(run, "up")), "goal");
  assert.ok(run.done);
  assert.equal(hopTarget(run, "down"), null);
});

test("stars and summary", () => {
  assert.equal(roundStars(0), 3);
  assert.equal(roundStars(3), 2);
  assert.equal(roundStars(4), 1);
  assert.deepEqual(
    summary([
      { splashes: 0, time: 10 },
      { splashes: 5, time: 20 },
    ]),
    { splashes: 5, time: 30, stars: 4 },
  );
});
