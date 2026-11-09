import { test } from "node:test";
import assert from "node:assert/strict";
import {
  padState,
  nearest,
  anyHeld,
  PAD,
  PadBridge,
} from "../src/padBridge.js";

const pad = (buttons = [], axes = [0, 0, 0, 0]) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});

test("D-pad and left stick both steer; right stick looks", () => {
  assert.equal(padState(pad([PAD.LEFT])).left, true);
  assert.equal(padState(pad([], [0.9, 0, 0, 0])).right, true);
  assert.equal(padState(pad([], [0, -0.9, 0, 0])).up, true);
  const look = padState(pad([], [0, 0, -0.8, 0.8]));
  assert.equal(look.lookLeft, true);
  assert.equal(look.lookDown, true);
  assert.equal(look.left, false);
});

test("stick drift below the threshold does nothing", () => {
  assert.equal(anyHeld(padState(pad([], [0.3, -0.3, 0.2, 0.1]))), false);
});

test("A and RT both trigger the action; B and Menu are separate", () => {
  assert.equal(padState(pad([PAD.A])).action, true);
  assert.equal(padState(pad([PAD.RT])).action, true);
  assert.equal(padState(pad([PAD.RT])).a, false);
  assert.equal(padState(pad([PAD.B])).b, true);
  assert.equal(padState(pad([PAD.MENU])).menu, true);
});

test("focus moves to the nearest button in the pushed direction", () => {
  const from = { x: 100, y: 100 };
  const rects = [
    { x: 100, y: 40 }, // above
    { x: 220, y: 100 }, // right, far
    { x: 160, y: 120 }, // right, a little lower
    { x: 40, y: 100 }, // left
  ];
  assert.equal(nearest(from, rects, "up"), 0);
  assert.equal(nearest(from, rects, "right"), 2);
  assert.equal(nearest(from, rects, "left"), 3);
  assert.equal(nearest(from, [{ x: 100, y: 40 }], "down"), -1);
});

test("X and LT both pump (R) for Target Blaster", () => {
  assert.equal(padState(pad([PAD.X])).pump, true);
  assert.equal(padState(pad([PAD.LT])).pump, true);
  assert.equal(padState(pad([PAD.A])).pump, false);
});

test("a game reading every controller itself keeps the bridge out", () => {
  const bridge = new PadBridge();
  let sent = 0;
  const root = {
    padSeats: () => true,
    padPlaying: () => true,
    ownerDocument: { activeElement: null },
    querySelector: () => ({ dispatchEvent: () => sent++ }),
    querySelectorAll: () => [],
    dispatchEvent: () => sent++,
  };
  for (let i = 0; i < 3; i++)
    bridge.update(root, pad([PAD.A, PAD.B, PAD.LEFT]), 1 / 60);
  assert.equal(sent, 0);
  assert.equal(bridge.previous, null);
});

test("with padFaces, Y X B A press ↑ ← → ↓ and B doesn't pause", () => {
  const bridge = new PadBridge();
  const sent = [];
  const target = {
    dispatchEvent: (e) => sent.push(`${e.type}:${e.key}`),
    contains: () => false,
  };
  const root = {
    ...target,
    padFaces: () => true,
    padPlaying: () => true,
    ownerDocument: { activeElement: null },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.KeyboardEvent ??= class {
    constructor(type, init) {
      Object.assign(this, init, { type });
    }
  };
  bridge.update(root, pad(), 1 / 60);
  for (const [button, key] of [
    [PAD.Y, "ArrowUp"],
    [PAD.X, "ArrowLeft"],
    [PAD.B, "ArrowRight"],
    [PAD.A, "ArrowDown"],
  ]) {
    sent.length = 0;
    bridge.update(root, pad([button]), 1 / 60);
    assert.deepEqual(sent, [`keydown:${key}`]);
    bridge.update(root, pad(), 1 / 60);
  }
});
