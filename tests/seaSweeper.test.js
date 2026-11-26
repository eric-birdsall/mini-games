import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BIN,
  BUCKET,
  DRY_LINE,
  PICK_RADIUS,
  SHORE,
  TIDES,
  TOTAL_TRASH,
  TRASH_PER_TIDE,
  SHELLS_PER_TIDE,
  WAVE,
  newGame,
  stars,
  step,
  tideItems,
  tideTime,
} from "../shared/seaSweeper.js";

const still = { x: 0, z: 0 };
// Runs the game until the first tide's things are on the sand.
function landed(level = "normal", seed = 5) {
  const game = newGame(level, seed);
  let t = 0;
  while (game.phase !== "open" && t < 10) {
    step(game, still, 0.05);
    t += 0.05;
  }
  return game;
}

test("each tide brings its trash and shells, spread out on the wet sand", () => {
  for (let tide = 0; tide < TIDES; tide++) {
    const items = tideItems(tide, 42);
    const trash = items.filter((i) => i.type === "trash");
    assert.equal(trash.length, TRASH_PER_TIDE[tide]);
    assert.equal(items.length - trash.length, SHELLS_PER_TIDE[tide]);
    for (const item of items) {
      assert.ok(item.z > SHORE && item.z < DRY_LINE);
      assert.ok(Math.hypot(item.x - BIN.x, item.z - BIN.z) > 1.5);
      assert.ok(Math.hypot(item.x - BUCKET.x, item.z - BUCKET.z) > 1.5);
    }
  }
  assert.equal(TOTAL_TRASH, 30);
});

test("the first wave lands the first tide and starts its clock", () => {
  const game = landed("easy");
  assert.equal(game.tide, 0);
  assert.equal(game.items.length, TRASH_PER_TIDE[0] + SHELLS_PER_TIDE[0]);
  assert.ok(game.clock <= tideTime("easy"));
});

test("walking up to something picks it up, and only one at a time", () => {
  const game = landed();
  const [first, second] = game.items;
  game.player.x = first.x;
  game.player.z = first.z;
  step(game, still, 0.01);
  assert.equal(game.carrying, first);
  game.player.x = second.x;
  game.player.z = second.z;
  step(game, still, 0.01);
  assert.equal(game.carrying, first);
  assert.ok(game.items.includes(second));
});

test("trash only goes in the bin and shells only in the bucket", () => {
  const game = landed();
  const trash = game.items.find((i) => i.type === "trash");
  const shell = game.items.find((i) => i.type === "shell");
  game.items = game.items.filter((i) => i !== trash);
  game.carrying = trash;
  Object.assign(game.player, BUCKET);
  step(game, still, 0.01);
  assert.equal(game.carrying, trash, "the bucket doesn't take trash");
  Object.assign(game.player, BIN);
  const events = step(game, still, 0.01);
  assert.equal(game.trash, 1);
  assert.ok(events.some((e) => e.type === "bin"));

  game.items = game.items.filter((i) => i !== shell);
  game.carrying = shell;
  step(game, still, 0.01);
  assert.equal(game.carrying, shell, "the bin doesn't take shells");
  Object.assign(game.player, BUCKET);
  step(game, still, 0.01);
  assert.equal(game.shells[shell.kind], 1);
});

test("clearing the beach brings the next tide in early", () => {
  const game = landed();
  game.items = [];
  const events = step(game, still, 0.01);
  assert.ok(events.some((e) => e.type === "cleared"));
  assert.equal(game.phase, "wave");
});

test("the beach isn't clear until the last thing is dropped off", () => {
  const game = landed();
  const trash = game.items.find((i) => i.type === "trash");
  game.items = [];
  game.carrying = trash;
  Object.assign(game.player, { x: 0, z: 4.5 });
  assert.ok(!step(game, still, 0.01).some((e) => e.type === "cleared"));
  assert.equal(game.phase, "open");
  Object.assign(game.player, BIN);
  const events = step(game, still, 0.01);
  assert.ok(events.some((e) => e.type === "bin"));
  assert.ok(events.some((e) => e.type === "cleared"));
  assert.equal(game.phase, "wave");
});

test("when time runs out the wave washes away what's left", () => {
  const game = landed();
  const left = game.items.filter((i) => i.type === "trash").length;
  game.clock = 0.01;
  // Stand clear of everything so nothing is picked up.
  Object.assign(game.player, { x: 0, z: 4.5 });
  const ends = step(game, still, 0.05);
  assert.ok(ends.some((e) => e.type === "timeup"));
  let washed = false;
  for (let t = 0; t < WAVE; t += 0.05)
    washed ||= step(game, still, 0.05).some((e) => e.type === "washed");
  assert.ok(washed);
  assert.equal(game.washed, left);
  assert.equal(game.tide, 1);
});

test("what you're carrying stays in your hands through a wave", () => {
  const game = landed();
  const [item] = game.items;
  game.player.x = item.x;
  game.player.z = item.z;
  step(game, still, 0.01);
  game.clock = 0;
  for (let t = 0; t < WAVE + 0.1; t += 0.05) step(game, still, 0.05);
  assert.equal(game.carrying, item);
});

test("a whole game sweeping everything up cleans all the trash", () => {
  const game = newGame("normal", 9);
  let done = false;
  for (let n = 0; n < 200000 && !done; n++) {
    const p = game.player;
    let goal;
    if (game.carrying) goal = game.carrying.type === "trash" ? BIN : BUCKET;
    else if (game.items.length)
      goal = game.items.reduce((a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z)
          ? a
          : b,
      );
    const dx = goal ? goal.x - p.x : 0;
    const dz = goal ? goal.z - p.z : 0;
    const d = Math.hypot(dx, dz);
    const events = step(
      game,
      d > PICK_RADIUS / 3 ? { x: dx / d, z: dz / d } : still,
      1 / 60,
    );
    done = events.some((e) => e.type === "done");
  }
  assert.ok(done);
  assert.equal(game.trash, TOTAL_TRASH);
  assert.equal(stars(game.trash), 3);
});

test("stars", () => {
  assert.equal(stars(30), 3);
  assert.equal(stars(21), 2);
  assert.equal(stars(12), 1);
  assert.equal(stars(5), 0);
});

test("all 30 pieces can be cleaned on every difficulty across 40 beaches", () => {
  for (const level of ["easy", "normal", "hard"]) {
    for (let seed = 1; seed <= 40; seed++) {
      const game = newGame(level, seed);
      let doneEvents = 0;
      for (let frame = 0; frame < 30000 && game.phase !== "done"; frame++) {
        const p = game.player;
        // Shells are optional: prioritize the trash on the shortest clocks.
        const candidates = game.items.filter((item) => item.type === "trash");
        const goal = game.carrying
          ? game.carrying.type === "trash"
            ? BIN
            : BUCKET
          : candidates.reduce(
              (a, b) =>
                !a ||
                Math.hypot(b.x - p.x, b.z - p.z) <
                  Math.hypot(a.x - p.x, a.z - p.z)
                  ? b
                  : a,
              null,
            );
        const dx = goal ? goal.x - p.x : 0;
        const dz = goal ? goal.z - p.z : 0;
        const d = Math.hypot(dx, dz);
        const events = step(
          game,
          d > PICK_RADIUS / 3 ? { x: dx / d, z: dz / d } : still,
          1 / 30,
        );
        doneEvents += events.filter((e) => e.type === "done").length;
      }
      assert.equal(game.phase, "done", `${level}, seed ${seed}`);
      assert.equal(game.trash, TOTAL_TRASH, `${level}, seed ${seed}`);
      assert.equal(game.washed, 0);
      assert.equal(doneEvents, 1);
      assert.deepEqual(step(game, { x: 1, z: 1 }, 1), []);
    }
  }
});

test("ignoring the beach ends after five tides and accounts for all trash", () => {
  for (const level of ["easy", "normal", "hard"]) {
    const game = newGame(level, 18);
    let lands = 0,
      ends = 0;
    for (let n = 0; n < 10000 && game.phase !== "done"; n++) {
      const events = step(game, still, 0.05);
      lands += events.filter((e) => e.type === "land").length;
      ends += events.filter((e) => e.type === "done").length;
    }
    assert.equal(lands, TIDES);
    assert.equal(ends, 1);
    assert.equal(game.trashSeen, TOTAL_TRASH);
    assert.equal(game.washed, TOTAL_TRASH);
    assert.equal(game.trash, 0);
  }
});

test("the final clock ends once even while carrying, and finished games cannot score", () => {
  const game = landed();
  game.tide = TIDES - 1;
  game.carrying = game.items.find((item) => item.type === "trash");
  game.items = game.items.filter((item) => item !== game.carrying);
  game.clock = 0.01;
  Object.assign(game.player, { x: 0, z: 4.5 });
  assert.equal(
    step(game, still, 0.05).filter((e) => e.type === "done").length,
    1,
  );
  assert.equal(game.phase, "done");
  Object.assign(game.player, BIN);
  assert.deepEqual(step(game, still, 1), []);
  assert.equal(game.trash, 0);
});
