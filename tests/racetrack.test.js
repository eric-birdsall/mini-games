import test from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_TRACKS,
  GRID,
  LOOP_RADIUS,
  PIECE_TYPES,
  buildPath,
  canAdd,
  cleanTrack,
  createRun,
  footprint,
  layout,
  sampleAt,
  stepRun,
  trackForces,
  wouldClose,
} from "../shared/racetrack.js";

const oval = EXAMPLE_TRACKS[0];

function simulate(track, push, seconds = 20) {
  const path = buildPath(layout(track));
  const run = createRun(path, push);
  for (let i = 0; i < seconds * 60; i++) stepRun(run, 1 / 60);
  return { run, kinds: run.events.map((e) => e.kind) };
}

test("pieces enter one cell and leave into the next", () => {
  const at = { x: 5, z: 5, h: 0, d: 0 };
  assert.deepEqual(footprint("straight", at).next, { x: 5, z: 4, h: 0, d: 0 });
  assert.deepEqual(footprint("right", at).next, { x: 6, z: 5, h: 0, d: 1 });
  assert.deepEqual(footprint("left", at).next, { x: 4, z: 5, h: 0, d: 3 });
  assert.deepEqual(footprint("climb", at).next, { x: 5, z: 4, h: 1, d: 0 });
  assert.deepEqual(footprint("upLeft", at).next, { x: 4, z: 5, h: 1, d: 3 });
  // A loop stands two levels tall in its one cell.
  assert.deepEqual(footprint("loop", at).cells, [
    [5, 5, 0],
    [5, 5, 1],
  ]);
  assert.deepEqual(footprint("loop", at).next, { x: 5, z: 4, h: 0, d: 0 });
});

test("a track closes when it comes back into the start the same way", () => {
  const laid = layout(oval);
  assert.equal(laid.closed, true);
  assert.equal(laid.pieces.length, oval.pieces.length + 1);
  assert.equal(canAdd(laid, "straight"), "closed");
  const almost = layout({ ...oval, pieces: oval.pieces.slice(0, -1) });
  assert.equal(almost.closed, false);
  assert.equal(wouldClose(almost, oval.start, "right"), true);
  assert.equal(wouldClose(almost, oval.start, "straight"), false);
});

test("pieces can't leave the board, cross track, or dig into the floor", () => {
  const edge = layout({ start: { x: 0, z: 0, d: 0 }, pieces: [] });
  assert.equal(canAdd(edge, "straight"), "edge");
  const flat = layout({ start: { x: 5, z: 5, d: 0 }, pieces: [] });
  assert.equal(canAdd(flat, "descent"), "low");
  assert.equal(canAdd(flat, "downLeft"), "low");
  // Four rights make a tight square that runs back into the start piece.
  const square = layout({
    start: { x: 5, z: 5, d: 0 },
    pieces: ["right", "right", "right"],
  });
  assert.equal(canAdd(square, "straight"), "blocked");
  // ...but passing over it two levels up is fine.
  const bridge = layout({
    start: { x: 5, z: 5, d: 1 },
    pieces: ["climb", "upLeft", "upLeft", "left"],
  });
  assert.equal(bridge.open.h, 3);
  assert.equal(canAdd(bridge, "straight"), null);
  assert.equal(
    canAdd(layout({ start: null, pieces: [] }), "straight"),
    "nostart",
  );
});

test("bad saves keep only the pieces that fit", () => {
  const cleaned = cleanTrack({
    start: { x: 5, z: 5, d: 0 },
    pieces: ["straight", "descent", "straight"],
  });
  assert.deepEqual(cleaned.pieces, ["straight"]);
  assert.deepEqual(cleanTrack({ start: { x: GRID, z: 0, d: 0 }, pieces: [] }), {
    start: null,
    pieces: [],
  });
});

test("every piece type and every example lays out", () => {
  for (const type of PIECE_TYPES) {
    const start = { x: 5, z: 6, d: 0 };
    const pieces =
      type.startsWith("down") || type === "descent" ? ["climb", type] : [type];
    const laid = layout({ start, pieces });
    assert.equal(laid.pieces.length, pieces.length + 1, type);
    const path = buildPath(laid);
    assert.ok(path.length > 2, type);
  }
  for (const example of EXAMPLE_TRACKS) {
    const laid = layout(example);
    assert.equal(laid.pieces.length, example.pieces.length + 1, example.name);
    assert.equal(laid.closed, true, example.name);
  }
});

test("the path is smooth and the loop is upside down at the top", () => {
  const path = buildPath(layout(EXAMPLE_TRACKS[1]));
  const { samples } = path;
  for (let i = 1; i < samples.length; i++) {
    const gap = Math.hypot(
      samples[i].p[0] - samples[i - 1].p[0],
      samples[i].p[1] - samples[i - 1].p[1],
      samples[i].p[2] - samples[i - 1].p[2],
    );
    assert.ok(gap < 0.08, `gap ${gap} at ${i}`);
  }
  const top = samples.reduce((a, b) => (b.p[1] > a.p[1] ? b : a));
  assert.ok(top.ring);
  assert.ok(Math.abs(top.p[1] - 2 * LOOP_RADIUS) < 0.05);
  assert.ok(top.u[1] < -0.95);
  // Upside down at the top: too slow and the track can't hold the car.
  assert.ok(trackForces(top, 1).N < 0);
  assert.ok(trackForces(top, 4).N > 0);
  // Distances wrap round a closed track.
  const a = sampleAt(path, path.length + 1).p;
  const b = sampleAt(path, 1).p;
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6);
});

test("a gentle push rolls round and stops; a hard one flies off a curve", () => {
  const gentle = simulate(oval, 5, 40);
  assert.ok(gentle.run.laps >= 1);
  assert.equal(gentle.run.mode, "rest");
  assert.ok(gentle.kinds.includes("stopped"));
  const hard = simulate(oval, 11, 6);
  assert.ok(hard.kinds.includes("curve"));
  assert.equal(hard.run.laps, 0);
  assert.ok(hard.run.free);
});

test("too slow falls out of the loop; a booster keeps it going round", () => {
  const noBooster = {
    ...EXAMPLE_TRACKS[1],
    pieces: EXAMPLE_TRACKS[1].pieces.map((p) =>
      p === "booster" ? "straight" : p,
    ),
  };
  assert.ok(simulate(noBooster, 6, 5).kinds.includes("loopFall"));
  const boosted = simulate(EXAMPLE_TRACKS[1], 3, 20);
  assert.ok(boosted.run.laps >= 4);
  assert.equal(boosted.run.mode, "track");
});

test("a weak push stalls on a climb and rolls back", () => {
  const hill = {
    start: { x: 5, z: 8, d: 0 },
    pieces: [
      "climb",
      "climb",
      "right",
      "right",
      "descent",
      "descent",
      "straight",
      "right",
      "right",
    ],
  };
  const { kinds, run } = simulate(hill, 4, 20);
  assert.ok(kinds.includes("stall"));
  assert.equal(run.laps, 0);
  assert.ok(!run.free);
});

test("an open track sends the car off the end", () => {
  const open = {
    start: { x: 5, z: 8, d: 0 },
    pieces: ["straight", "straight"],
  };
  const { kinds, run } = simulate(open, 6, 4);
  assert.ok(kinds.includes("end"));
  assert.ok(run.free);
});
