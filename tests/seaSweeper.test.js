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
