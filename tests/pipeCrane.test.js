import test from "node:test";
import assert from "node:assert/strict";
import {
  HURRY,
  PIPE_LEVELS,
  joinedUp,
  lift,
  makeSite,
  neighbour,
  newJob,
  openValve,
  openings,
  pieceFor,
  place,
  stepJob,
  turn,
  yardPieces,
} from "../shared/pipeCrane.js";

const DT = 1 / 60;

function run(job, seconds = 600) {
  const events = [];
  for (let t = 0; t < seconds && !job.done && !job.spill; t += DT)
    events.push(...stepJob(job, DT));
  return events;
}

function solve(job) {
  for (const [cell, piece] of job.site.solution) place(job, cell, piece);
}

test("pieces turn clockwise a quarter at a time", () => {
  assert.deepEqual(openings({ type: "straight", rot: 1 }), [1, 3]);
  assert.deepEqual(openings({ type: "corner", rot: 3 }), [3, 0]);
  assert.deepEqual(openings({ type: "tee", rot: 2 }).sort(), [1, 2, 3]);
  assert.deepEqual(pieceFor([3, 1]), { type: "straight", rot: 1 });
  assert.equal(pieceFor([0, 2, 1]).type, "tee");
});

test("every site is replayable, inside the grid and solvable", () => {
  for (const level of Object.keys(PIPE_LEVELS)) {
    for (let index = 0; index < 8; index++) {
      for (let seed = 1; seed < 40; seed++) {
        const site = makeSite(level, index, seed);
        const again = makeSite(level, index, seed);
        assert.deepEqual([...again.trench], [...site.trench]);
        const s = PIPE_LEVELS[level];
        assert.equal(site.outlets.length, index >= s.twoOutletsFrom ? 2 : 1);
        for (const cell of site.trench)
          assert.ok(cell >= 0 && cell < site.cols * site.rows);
        // Pipe A and every outlet point off the edge of the site.
        for (const end of [site.source, ...site.outlets]) {
          assert.ok(site.trench.has(end.cell));
          assert.equal(neighbour(site, end.cell, end.dir), -1);
        }
        // The pieces needed are all in the yard.
        for (const piece of site.solution.values())
          assert.ok(yardPieces(level).includes(piece.type));
        if (site.outlets.length === 2)
          assert.ok([...site.solution.values()].some((p) => p.type === "tee"));
        // There are always more trenches than pipes needed (dead ends).
        assert.ok(site.trench.size > site.solution.size);

        const job = newJob(site);
        solve(job);
        assert.ok(joinedUp(job), `${level} #${index} seed ${seed}`);
        const events = run(job);
        assert.ok(job.done, `${level} #${index} seed ${seed}`);
        assert.equal(job.spill, null);
        assert.equal(
          events.filter((e) => e === "outlet").length,
          site.outlets.length,
        );
      }
    }
  }
});

test("later sites give less time", () => {
  const first = makeSite("normal", 0, 3);
  const fifth = makeSite("normal", 4, 3);
  assert.ok(fifth.countdown < first.countdown);
  assert.ok(fifth.flow < first.flow);
});

test("water waits for the countdown, then spills from an empty trench", () => {
  const site = makeSite("easy", 0, 5);
  const job = newJob(site);
  stepJob(job, site.countdown - 1);
  assert.equal(job.flowing, false);
  const events = stepJob(job, 1.01);
  assert.ok(events.includes("valve"));
  assert.ok(events.includes("spill"));
  assert.equal(job.spill.cell, site.source.cell);
});

test("a pipe that doesn't line up spills", () => {
  const site = makeSite("easy", 0, 9);
  const job = newJob(site);
  solve(job);
  // Turn the second pipe on the line the wrong way.
  const second = neighbour(
    site,
    site.source.cell,
    openings(job.pipes.get(site.source.cell)).find(
      (d) => d !== site.source.dir,
    ),
  );
  const piece = job.pipes.get(second);
  const before = openings(piece).sort().join();
  do turn(job, second);
  while (openings(job.pipes.get(second)).sort().join() === before);
  assert.equal(joinedUp(job), false);
  openValve(job);
  run(job);
  assert.ok(job.spill);
  assert.equal(job.done, false);
});

test("you can build ahead of the water, but not move wet pipes", () => {
  const site = makeSite("normal", 0, 11);
  const job = newJob(site);
  const cells = [...site.solution.keys()];
  // Only the first pipe, then open the valve.
  place(job, cells[0], site.solution.get(cells[0]));
  openValve(job);
  stepJob(job, site.flow * 0.5);
  assert.equal(lift(job, cells[0]), null);
  assert.equal(turn(job, cells[0]), false);
  assert.equal(place(job, cells[0], { type: "cross", rot: 0 }), false);
  // Lay the rest while it flows.
  for (const cell of cells.slice(1)) place(job, cell, site.solution.get(cell));
  run(job);
  assert.ok(job.done);
});

test("pipes only go in trenches; lifting returns the pipe", () => {
  const site = makeSite("normal", 1, 2);
  const job = newJob(site);
  const dirt = [...Array(site.cols * site.rows).keys()].find(
    (c) => !site.trench.has(c),
  );
  assert.equal(place(job, dirt, { type: "straight", rot: 0 }), false);
  const cell = [...site.trench][0];
  assert.ok(place(job, cell, { type: "corner", rot: 5 }));
  assert.equal(job.pipes.get(cell).rot, 1);
  assert.deepEqual(lift(job, cell), { type: "corner", rot: 1 });
  assert.equal(job.pipes.has(cell), false);
});

test("water hurries once everything is joined up", () => {
  const site = makeSite("normal", 0, 4);
  const slow = newJob(site);
  const quick = newJob(site);
  solve(quick);
  const cells = [...site.solution.keys()];
  for (const cell of cells.slice(0, -1))
    place(slow, cell, site.solution.get(cell));
  openValve(slow);
  openValve(quick);
  stepJob(slow, site.flow / HURRY);
  stepJob(quick, site.flow / HURRY);
  assert.ok(quick.hurry);
  assert.equal(slow.hurry, false);
  assert.equal(quick.water.get(site.source.cell).t, 1);
  assert.ok(slow.water.get(site.source.cell).t < 0.5);
});
