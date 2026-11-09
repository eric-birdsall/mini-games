import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InputManager,
  axis,
  keyLabel,
  keyboardCode,
  DEFAULTS,
  BUTTONS,
} from "../src/input.js";
const pad = (buttons = [], axes = [0, 0, 0, 0]) => ({
  index: 0,
  id: "Test Xbox",
  mapping: "standard",
  connected: true,
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({
    pressed: buttons.includes(i),
    value: buttons.includes(i) ? 1 : 0,
  })),
});
test("Xbox defaults, deadzone and analog input", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  i.updateGamepad(pad([0, 7], [0.01, -1, 0.5, 0]));
  assert.deepEqual(actions, [
    ["jump", true],
    ["use", true],
  ]);
  assert.equal(i.move.side, 0);
  assert.equal(i.move.forward, 1);
  assert.ok(i.look.x > 0);
  assert.equal(i.device, "controller");
  assert.equal(axis(0.1, 0.18), 0);
  assert.equal(axis(-1, 0.18), -1);
});
test("gamepad edges do not repeat and release held actions", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  i.updateGamepad(pad([2]));
  i.updateGamepad(pad([2]));
  i.updateGamepad(pad());
  assert.deepEqual(actions, [
    ["interact", true],
    ["interact", false],
  ]);
});
test("device prompts follow real activity; drift cannot steal keyboard prompts", () => {
  const i = new InputManager(() => {});
  i.updateGamepad(pad([0]));
  assert.equal(i.label("jump"), "A");
  i.key("KeyW", true);
  i.updateGamepad(pad([0], [0.02, 0, 0, 0]));
  assert.equal(i.device, "keyboard");
  assert.equal(i.label("interact"), "E");
  i.updateGamepad(pad([0, 2]));
  assert.equal(i.device, "controller");
  assert.equal(i.label("interact"), "X");
});
test("rebindings swap conflicts and affect input and labels", () => {
  const i = new InputManager(() => {});
  i.bind("keyboard", "interact", "KeyC");
  assert.equal(i.config.keyboard.stance, "KeyE");
  i.key("KeyC", true);
  assert.equal(i.held("interact"), true);
  i.bind("controller", "jump", 2);
  assert.equal(i.config.controller.interact, 0);
  i.deviceUsed("controller");
  assert.equal(i.label("jump"), "X");
});
test("disconnect clears analog and held buttons and returns keyboard prompts", () => {
  const i = new InputManager(() => {});
  i.updateGamepad(pad([2], [0, -1, 1, 0]));
  i.disconnect();
  assert.equal(i.held("interact"), false);
  assert.equal(i.look.x, 0);
  assert.equal(i.movement().forward, 0);
  assert.equal(i.device, "keyboard");
});
test("stick swapping and keyboard movement work", () => {
  const i = new InputManager(() => {});
  i.config.swapSticks = true;
  i.updateGamepad(pad([], [0, 0, 1, -1]));
  assert.equal(i.move.side, 1);
  assert.equal(i.move.forward, 1);
  assert.equal(i.look.x, 0);
  i.disconnect();
  i.key("KeyW", true);
  assert.equal(i.movement().forward, 1);
});
test("Command K is the configurable developer shortcut", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  assert.equal(DEFAULTS.keyboard.developer, "Meta+KeyK");
  i.key("Meta+KeyK", true);
  assert.deepEqual(actions, [["developer", true]]);
  assert.equal(i.held("lookDown"), false);
  assert.equal(keyLabel("Meta+KeyK"), "⌘K");
});
test("controller remap capture consumes button without gameplay action", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  let saved = false;
  i.capture = {
    group: "controller",
    action: "use",
    done: () => (saved = true),
  };
  i.updateGamepad(pad([3]));
  assert.equal(saved, true);
  assert.equal(i.config.controller.use, 3);
  assert.equal(actions.length, 0);
  i.updateGamepad(pad([3]));
  assert.equal(actions.length, 0);
});
test("View opens the developer panel; control settings start unbound on controller", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  assert.equal(BUTTONS[DEFAULTS.controller.developer], "View");
  i.updateGamepad(pad([8]));
  assert.deepEqual(actions, [["developer", true]]);
  i.device = "controller";
  assert.equal(i.label("settings"), "—");
  assert.equal(i.label("developer"), "View");
});
test("saved maps from before View opened the developer panel are migrated", () => {
  const saved = { controller: { ...DEFAULTS.controller, settings: 8 } };
  delete saved.controller.developer;
  globalThis.localStorage = {
    getItem: () => JSON.stringify(saved),
    setItem() {},
  };
  try {
    const actions = [],
      i = new InputManager((...a) => actions.push(a));
    assert.equal(i.config.controller.settings, -1);
    i.updateGamepad(pad([8]));
    assert.deepEqual(actions, [["developer", true]]);
  } finally {
    delete globalThis.localStorage;
  }
});
test("controllers without a standard mapping are still used", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  i.updateGamepad({ ...pad([0]), mapping: "" });
  assert.deepEqual(actions, [["jump", true]]);
  assert.match(i.padName, /non-standard/);
});
test("a button held through a clear does not fire again", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  i.updateGamepad(pad([0]));
  assert.deepEqual(actions, [["jump", true]]);
  i.clear(); // e.g. the A press opened an editor, which pauses input
  i.updateGamepad(pad([0]));
  i.updateGamepad(pad([0]));
  assert.deepEqual(actions, [["jump", true]], "held A is not a new press");
  i.updateGamepad(pad([]));
  i.updateGamepad(pad([0]));
  assert.deepEqual(actions.at(-1), ["jump", true], "a real second press works");
  assert.equal(actions.length, 2);
});
test("controller invert settings are separate and persist", () => {
  assert.equal(DEFAULTS.padInvertY, false);
  assert.equal(DEFAULTS.padInvertX, false);
  const load = (saved) => {
    globalThis.localStorage = {
      getItem: () => JSON.stringify(saved),
      setItem() {},
    };
    try {
      return new InputManager(() => {}).config;
    } finally {
      delete globalThis.localStorage;
    }
  };
  assert.deepEqual(
    (({ invertY, padInvertY, padInvertX }) => ({
      invertY,
      padInvertY,
      padInvertX,
    }))(load({ invertY: false, padInvertY: true, padInvertX: true })),
    { invertY: false, padInvertY: true, padInvertX: true },
  );
  assert.equal(
    load({ invertY: true }).padInvertY,
    true,
    "older saves that inverted everything keep the stick inverted",
  );
  assert.equal(load({ invertY: true, padInvertY: false }).padInvertY, false);
});
test("Tab cycles to the next gadget, including for saved maps that used Q", () => {
  assert.equal(DEFAULTS.keyboard.next, "Tab");
  globalThis.localStorage = {
    getItem: () =>
      JSON.stringify({ keyboard: { ...DEFAULTS.keyboard, next: "KeyQ" } }),
    setItem() {},
  };
  try {
    const actions = [],
      i = new InputManager((...a) => actions.push(a));
    i.key("Tab", true);
    assert.deepEqual(actions, [["next", true]]);
  } finally {
    delete globalThis.localStorage;
  }
});

test("Shift+Tab cycles backwards without also cycling forwards", () => {
  const actions = [],
    i = new InputManager((...a) => actions.push(a));
  const code = keyboardCode({ code: "Tab", shiftKey: true, metaKey: false });
  assert.equal(code, "Shift+Tab");
  i.key(code, true);
  assert.deepEqual(actions, [["previous", true]]);
  assert.equal(keyboardCode({ code: "Tab", shiftKey: false }), "Tab");
  assert.equal(keyboardCode({ code: "KeyW", shiftKey: true }), "KeyW");
});
test("saved default R bindings migrate to Shift+Tab without changing other custom bindings", () => {
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ keyboard: { previous: "KeyR" } }),
    setItem() {},
  };
  try {
    assert.equal(
      new InputManager(() => {}).config.keyboard.previous,
      "Shift+Tab",
    );
  } finally {
    delete globalThis.localStorage;
  }
});
test("? opens control settings, shown as ?, and saved F2 maps move to it", () => {
  assert.equal(DEFAULTS.keyboard.settings, "Slash");
  assert.equal(keyLabel("Slash"), "?");
  assert.equal(keyLabel("Backslash"), "Backslash");
  globalThis.localStorage = {
    getItem: () =>
      JSON.stringify({ keyboard: { ...DEFAULTS.keyboard, settings: "F2" } }),
    setItem() {},
  };
  try {
    const actions = [],
      i = new InputManager((...a) => actions.push(a));
    i.key("Slash", true);
    assert.deepEqual(actions, [["settings", true]]);
  } finally {
    delete globalThis.localStorage;
  }
});

test("Q cancels a throw by default and isn't bound to anything else", async () => {
  const { DEFAULTS, ACTIONS } = await import("../src/input.js");
  assert.equal(DEFAULTS.keyboard.cancelThrow, "KeyQ");
  assert.ok(ACTIONS.cancelThrow, "listed in Controls");
  const others = Object.entries(DEFAULTS.keyboard).filter(
    ([action, key]) => key === "KeyQ" && action !== "cancelThrow",
  );
  assert.deepEqual(others, []);
});
