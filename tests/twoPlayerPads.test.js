import test from "node:test";
import assert from "node:assert/strict";
import { TwoPlayerPads } from "../src/twoPlayerPads.js";
import { PAD } from "../src/padBridge.js";
const pad = (index, held = [], x = 0) => ({
  index,
  connected: true,
  axes: [x, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: held.includes(i),
  })),
});
test("each controller steers its own seat and disconnecting never moves player two", () => {
  const pads = new TwoPlayerPads();
  let inputs = pads.read([pad(2, [], -1), pad(5, [], 1)]);
  assert.equal(inputs[0].left, true);
  assert.equal(inputs[1].right, true);
  inputs = pads.read([null, pad(5, [], -1)]);
  assert.equal(inputs[0].left, false);
  assert.equal(inputs[1].left, true);
  inputs = pads.read([pad(2, [], 1), pad(5)]);
  assert.equal(inputs[0].right, true);
});
test("held buttons at start, resume, or reconnect do not swing or pause", () => {
  const pads = new TwoPlayerPads();
  const held = pad(0, [PAD.A, PAD.MENU]);
  assert.equal(pads.read([held])[0].action, false);
  assert.equal(pads.read([held])[0].pause, false);
  pads.read([pad(0)]);
  let input = pads.read([held])[0];
  assert.equal(input.action, true);
  assert.equal(input.pause, true);
  assert.equal(pads.read([held])[0].action, false);
  pads.reset();
  assert.equal(pads.read([held])[0].pause, false);
  pads.read([]);
  assert.equal(pads.read([held])[0].action, false);
});
test("A and RT share one swing edge; either player can pause with B", () => {
  const pads = new TwoPlayerPads();
  pads.read([pad(0), pad(1)]);
  const inputs = pads.read([pad(0, [PAD.RT]), pad(1, [PAD.B])]);
  assert.equal(inputs[0].action, true);
  assert.equal(inputs[1].pause, true);
  assert.equal(pads.read([pad(0, [PAD.RT, PAD.A]), pad(1)])[0].action, false);
});
