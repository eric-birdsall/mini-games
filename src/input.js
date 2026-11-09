export const ACTIONS = {
  forward: "Move forward",
  back: "Move backward",
  left: "Strafe left",
  right: "Strafe right",
  lookUp: "Look up",
  lookDown: "Look down",
  lookLeft: "Look left",
  lookRight: "Look right",
  jump: "Jump / hold to clamber",
  sprint: "Sprint (hold)",
  stance: "Crouch / hold prone",
  prone: "Toggle prone",
  interact: "Interact (hold)",
  use: "Use gadget",
  useAlt: "Use gadget (alternate)",
  cancelThrow: "Cancel throw",
  focus: "Aim down sights (hold)",
  next: "Next gadget",
  previous: "Previous gadget",
  ping: "Ping a spot",
  camera: "Camera / next feed",
  exitCamera: "Exit camera",
  slot1: "Gadget 1",
  slot2: "Gadget 2",
  slot3: "Gadget 3",
  slot4: "Gadget 4",
  slot5: "Gadget 5",
  pause: "Pause / release",
  settings: "Control settings",
  developer: "Developer panel",
};
export const DEFAULTS = {
  keyboard: {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    lookUp: "KeyI",
    lookDown: "KeyK",
    lookLeft: "KeyJ",
    lookRight: "KeyL",
    jump: "Space",
    sprint: "ShiftLeft",
    stance: "KeyC",
    prone: "KeyZ",
    interact: "KeyE",
    use: "Mouse0",
    useAlt: "KeyF",
    cancelThrow: "KeyQ",
    focus: "Mouse2",
    next: "Tab",
    previous: "Shift+Tab",
    ping: "KeyG",
    camera: "KeyB",
    exitCamera: "KeyV",
    slot1: "Digit1",
    slot2: "Digit2",
    slot3: "Digit3",
    slot4: "Digit4",
    slot5: "Digit5",
    pause: "Escape",
    // The ?-key (its code is "Slash"); with or without Shift it opens Controls.
    settings: "Slash",
    developer: "Meta+KeyK",
  },
  controller: {
    jump: 0,
    stance: 1,
    interact: 2,
    camera: 3,
    previous: 4,
    next: 5,
    focus: 6,
    use: 7,
    developer: 8,
    // While aiming a throw, the stance button cancels it on a controller.
    cancelThrow: -1,
    // -1 is unbound. Control settings are reachable from the pause menu.
    settings: -1,
    // Every pad button is taken; bind Ping in Controls if you want it.
    ping: -1,
    pause: 9,
    sprint: 10,
    prone: 11,
    slot1: 12,
    slot2: 15,
    slot3: 13,
    slot4: 14,
  },
  deadzone: 0.18,
  lookSensitivity: 2.2,
  mouseSensitivity: 0.002,
  invertY: false, // mouse and look keys
  padInvertY: false,
  padInvertX: false,
  swapSticks: false,
};
export const BUTTONS = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LS click",
  "RS click",
  "D-pad ↑",
  "D-pad ↓",
  "D-pad ←",
  "D-pad →",
];
export const keyLabel = (c) =>
  c === "Slash"
    ? "?"
    : c
        ?.replace("Meta+", "⌘")
        .replace("Key", "")
        .replace("Digit", "")
        .replace("Left", "")
        .replace("Right", "")
        .replace("Mouse0", "LMB")
        .replace("Mouse1", "MMB")
        .replace("Mouse2", "RMB") || "Unbound";
export const keyboardCode = (e) =>
  (e.metaKey && !e.code.startsWith("Meta") ? "Meta+" : "") +
  (e.shiftKey && e.code === "Tab" ? "Shift+" : "") +
  e.code;
export function axis(v, deadzone) {
  return Math.abs(v) <= deadzone
    ? 0
    : (Math.sign(v) * (Math.abs(v) - deadzone)) / (1 - deadzone);
}
export class InputManager {
  constructor(onAction, onDevice = () => {}) {
    this.onAction = onAction;
    this.onDevice = onDevice;
    this.device = "keyboard";
    this.keys = new Set();
    this.padHeld = new Set();
    this.previousButtons = [];
    this.previousAxes = [];
    this.padIndex = null;
    this.padName = "No controller detected";
    this.capture = null;
    this.config = structuredClone(DEFAULTS);
    try {
      const data = JSON.parse(localStorage.getItem("minigames.controls.v1"));
      for (const group of ["keyboard", "controller"])
        for (const action of Object.keys(DEFAULTS[group]))
          if (typeof data?.[group]?.[action] === typeof DEFAULTS[group][action])
            this.config[group][action] = data[group][action];
      // Controls moved from F2 to ?; carry saved maps that still had F2.
      if (data?.keyboard?.settings === "F2")
        this.config.keyboard.settings = "Slash";
      // Next gadget moved from Q to Tab; carry saved maps that still had Q.
      if (data?.keyboard?.next === "KeyQ") this.config.keyboard.next = "Tab";
      if (data?.keyboard?.previous === "KeyR")
        this.config.keyboard.previous = "Shift+Tab";
      // View used to open control settings. Saved maps from before View
      // opened the developer panel would otherwise bind it to both.
      if (
        data?.controller &&
        !("developer" in data.controller) &&
        data.controller.settings === DEFAULTS.controller.developer
      )
        this.config.controller.settings = -1;
      for (const [k, min, max] of [
        ["deadzone", 0.05, 0.5],
        ["lookSensitivity", 0.3, 5],
        ["mouseSensitivity", 0.0003, 0.01],
      ])
        if (Number.isFinite(data?.[k]))
          this.config[k] = Math.max(min, Math.min(max, data[k]));
      for (const k of ["invertY", "padInvertY", "padInvertX", "swapSticks"])
        if (typeof data?.[k] === "boolean") this.config[k] = data[k];
      // invertY used to cover the controller too; keep that for saved settings.
      if (data?.invertY === true && !("padInvertY" in data))
        this.config.padInvertY = true;
    } catch {}
    this.move = { forward: 0, side: 0 };
    this.look = { x: 0, y: 0 };
  }
  save() {
    try {
      localStorage.setItem("minigames.controls.v1", JSON.stringify(this.config));
    } catch {}
  }
  deviceUsed(device) {
    if (this.device !== device) {
      this.device = device;
      this.onDevice(device);
    }
  }
  bind(group, action, code) {
    const old = this.config[group][action];
    for (const a of Object.keys(this.config[group]))
      if (a !== action && this.config[group][a] === code)
        this.config[group][a] = old;
    this.config[group][action] = code;
    this.clear();
    this.blockUntilRelease = true;
    this.save();
  }
  key(code, down) {
    this.deviceUsed("keyboard");
    if (this.capture && down) {
      if (code === "Escape") {
        this.capture = null;
        return;
      }
      const { group, action, done } = this.capture;
      if (group === "keyboard") {
        this.capture = null;
        this.bind(group, action, code);
        done();
      }
      return;
    }
    if (down && this.keys.has(code)) return;
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    for (const [action, binding] of Object.entries(this.config.keyboard))
      if (binding === code) this.onAction(action, down);
  }
  held(action) {
    return (
      this.keys.has(this.config.keyboard[action]) || this.padHeld.has(action)
    );
  }
  clear() {
    this.keys.clear();
    this.padHeld.clear();
    this.move = { forward: 0, side: 0 };
    this.look = { x: 0, y: 0 };
    // Buttons still held after a clear (e.g. the A press that opened a menu)
    // must not register as fresh presses on the next poll.
    this.blockUntilRelease = true;
  }
  disconnect() {
    for (const action of this.padHeld) this.onAction(action, false);
    this.padHeld.clear();
    this.previousButtons = [];
    this.previousAxes = [];
    this.padIndex = null;
    this.padName = "No controller detected";
    this.move = { forward: 0, side: 0 };
    this.look = { x: 0, y: 0 };
    if (this.device === "controller") this.deviceUsed("keyboard");
  }
  poll() {
    const pads = navigator.getGamepads?.() || [];
    let pad =
      pads[this.padIndex] ||
      Array.from(pads).find((p) => p?.connected && p.mapping === "standard") ||
      // Some browser/OS/driver combinations report no standard mapping.
      // Use the pad anyway: Xbox-style layouts usually line up, and any
      // mismatched button can be remapped in Controls.
      Array.from(pads).find((p) => p?.connected);
    if (!pad) {
      if (this.padIndex !== null) this.disconnect();
      return;
    }
    this.updateGamepad(pad);
  }
  updateGamepad(pad) {
    if (this.padIndex !== pad.index) {
      this.previousButtons = [];
      this.previousAxes = [];
      this.padHeld.clear();
    }
    this.padIndex = pad.index;
    this.padName =
      pad.mapping === "standard"
        ? pad.id
        : `${pad.id} (non-standard layout: remap buttons if they are wrong)`;
    const buttons = pad.buttons.map((b) => b.pressed || b.value > 0.5),
      axes = pad.axes.map((v) => axis(v, this.config.deadzone));
    const changed =
      buttons.some((v, i) => v !== !!this.previousButtons[i]) ||
      axes.some(
        (v, i) =>
          Math.abs(v - (this.previousAxes[i] || 0)) > 0.08 ||
          (Math.abs(v) > 0.1 && Math.abs(this.previousAxes[i] || 0) <= 0.1),
      );
    if (changed) this.deviceUsed("controller");
    if (this.blockUntilRelease) {
      this.previousButtons = buttons;
      this.previousAxes = axes;
      this.move = { forward: 0, side: 0 };
      this.look = { x: 0, y: 0 };
      if (buttons.some(Boolean)) return;
      this.blockUntilRelease = false;
    }
    if (this.capture?.group === "controller") {
      const index = buttons.findIndex((v, i) => v && !this.previousButtons[i]);
      if (index >= 0) {
        const { action, done } = this.capture;
        this.capture = null;
        this.bind("controller", action, index);
        done();
      }
      this.previousButtons = buttons;
      this.previousAxes = axes;
      return;
    }
    for (const [action, binding] of Object.entries(this.config.controller)) {
      const held = !!buttons[binding],
        was = this.padHeld.has(action);
      if (held) this.padHeld.add(action);
      else this.padHeld.delete(action);
      if (held !== was) this.onAction(action, held);
    }
    this.previousButtons = buttons;
    this.previousAxes = axes;
    const m = this.config.swapSticks ? 2 : 0,
      l = this.config.swapSticks ? 0 : 2;
    this.move = { side: axes[m] || 0, forward: -(axes[m + 1] || 0) };
    this.look = { x: axes[l] || 0, y: axes[l + 1] || 0 };
  }
  movement() {
    return {
      forward: Math.max(
        -1,
        Math.min(
          1,
          this.move.forward + (+this.held("forward") - +this.held("back")),
        ),
      ),
      side: Math.max(
        -1,
        Math.min(
          1,
          this.move.side + (+this.held("right") - +this.held("left")),
        ),
      ),
    };
  }
  label(action) {
    if (this.device === "controller" && action === "slot5") return "LB/RB";
    if (this.device === "controller" && action === "exitCamera")
      return BUTTONS[this.config.controller.stance];
    return this.device === "controller"
      ? BUTTONS[this.config.controller[action]] || "—"
      : keyLabel(this.config.keyboard[action]);
  }
}
