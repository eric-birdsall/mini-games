import { test } from "node:test";
import assert from "node:assert/strict";
import { CameraClocks } from "../src/cameraClock.js";

test("jammed REC clock advances six seconds and holds through the seventh", () => {
  const clocks = new CameraClocks();
  const start = 100000;
  assert.equal(clocks.sample("a", true, start, 0), start);
  for (let second = 1; second <= 6; second++)
    assert.equal(
      clocks.sample("a", true, start + second * 1000, second * 1000),
      start + second * 1000,
    );
  assert.equal(clocks.sample("a", true, 106500, 6500), 106000);
  assert.equal(clocks.sample("a", true, 107000, 7000), 106000);
  assert.equal(clocks.sample("a", true, 108000, 8000), 107000);
});
test("seven-second cycles repeat without catching up or depending on frame rate", () => {
  const clocks = new CameraClocks();
  clocks.sample(1, true, 0, 0);
  assert.equal(clocks.sample(1, true, 13999, 13999), 12000);
  assert.equal(clocks.sample(1, true, 21000, 21000), 18000);
  assert.equal(clocks.sample(1, true, 22000, 22000), 19000);
});
test("clean feeds use live time; ending and restarting a jam resets its cycle", () => {
  const clocks = new CameraClocks();
  assert.equal(clocks.sample(1, false, 1000, 0), 1000);
  clocks.sample(1, true, 2000, 1000);
  assert.equal(clocks.sample(1, true, 8500, 7500), 8000);
  assert.equal(clocks.sample(1, false, 9000, 8000), 9000);
  assert.equal(clocks.sample(1, true, 10000, 9000), 10000);
  assert.equal(clocks.sample(1, true, 11000, 10000), 11000);
});
test("switching feeds preserves each feeds own cycle", () => {
  const clocks = new CameraClocks();
  clocks.sample("a", true, 10000, 0);
  clocks.sample("b", true, 13000, 3000);
  assert.equal(clocks.sample("a", true, 16500, 6500), 16000);
  assert.equal(clocks.sample("b", true, 16500, 6500), 16500);
});
