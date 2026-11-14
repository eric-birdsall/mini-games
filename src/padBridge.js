// Xbox controller support for the standalone games (Slipstream, Firefly
// Recall, Toy Box Rescue, Roof Catch, Loop & Glide, Pond Fishing,
// Target Blaster, River Crossing, Racetrack Builder, Backyard Apple Catch,
// Pool Noodle Chop, Backyard Flier, Pipe Crane, Perch Hop, Acorn Drop,
// Backyard Fling, Perfect Pizza, Leaf Piles, Paper Plane Pitch, Big Bad
// Burger, Shoo Away, Comet Dash, Pop Patrol, Kickabout, Skee Ball, Bocce Ball, Kubb).
//
// Those games run in their own overlay and already understand the keyboard,
// so while one is open the controller is translated into the keys they use:
//
//   During play:  left stick / D-pad → W A S D (steer, aim, dive/flare)
//                 right stick       → I J K L (look, Slipstream)
//                 A / RT            → Space (drop, cast, reel, release, fire)
//                 X / LT            → R (pump, Target Blaster; turn, Pipe Crane)
//                 B / Menu          → Escape (pause)
//   On a screen with buttons (start, pause, results): left stick / D-pad moves focus to the nearest button in that
//   direction, A presses it, Menu presses the main button, B is Escape.
//
// A game marks its root element with `padPlaying = () => boolean`, true
// while steering input should go to the game rather than to its buttons.
// `padFaces = () => boolean` is true while Y X B A should press the arrow
// keys ↑ ← → ↓ instead (Firefly Recall's diamond); Menu still pauses.
// `padSeats = () => boolean` is true while the game reads every controller
// itself (Leaf Piles' four-player mode); the bridge then stays out of it.

export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LT: 6,
  RT: 7,
  MENU: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};
const STICK = 0.5;

export const KEYS = {
  up: ["w", "KeyW"],
  down: ["s", "KeyS"],
  left: ["a", "KeyA"],
  right: ["d", "KeyD"],
  lookUp: ["i", "KeyI"],
  lookDown: ["k", "KeyK"],
  lookLeft: ["j", "KeyJ"],
  lookRight: ["l", "KeyL"],
  action: [" ", "Space"],
  pump: ["r", "KeyR"],
  // Face buttons as a diamond of arrows (games with `padFaces()`).
  faceUp: ["ArrowUp", "ArrowUp"],
  faceLeft: ["ArrowLeft", "ArrowLeft"],
  faceRight: ["ArrowRight", "ArrowRight"],
  faceDown: ["ArrowDown", "ArrowDown"],
};
const FACES = { faceUp: "y", faceLeft: "x", faceRight: "b", faceDown: "a" };

// Which logical directions and buttons a pad is holding right now.
export function padState(pad) {
  const b = (i) => !!(pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5);
  const ax = (i) => pad.axes[i] || 0;
  return {
    up: b(PAD.UP) || ax(1) < -STICK,
    down: b(PAD.DOWN) || ax(1) > STICK,
    left: b(PAD.LEFT) || ax(0) < -STICK,
    right: b(PAD.RIGHT) || ax(0) > STICK,
    lookUp: ax(3) < -STICK,
    lookDown: ax(3) > STICK,
    lookLeft: ax(2) < -STICK,
    lookRight: ax(2) > STICK,
    action: b(PAD.A) || b(PAD.RT),
    pump: b(PAD.X) || b(PAD.LT),
    a: b(PAD.A),
    b: b(PAD.B),
    x: b(PAD.X),
    y: b(PAD.Y),
    menu: b(PAD.MENU),
  };
}

export const anyHeld = (s) => Object.values(s).some(Boolean);

// The open standalone game, if any.
export function activeGame(doc = document) {
  return (
    doc.querySelector("dialog[open][data-game-keyboard]") ||
    doc.querySelector("#slipstream")
  );
}

// Pick the closest candidate whose centre lies in `dir` from `from`.
export function nearest(from, rects, dir) {
  const [dx, dy] = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  }[dir];
  let best = -1,
    score = Infinity;
  rects.forEach((r, i) => {
    const x = r.x - from.x,
      y = r.y - from.y,
      along = x * dx + y * dy,
      across = Math.abs(x * dy - y * dx);
    if (along <= 1) return;
    const s = along + across * 2;
    if (s < score) {
      score = s;
      best = i;
    }
  });
  return best;
}

const PREFERRED = [
  "[data-pause-resume]",
  ".game-results .primary",
  "[data-begin]",
  "[data-play]",
  ".primary",
];

const LEAVE =
  "[data-close], [data-exit], [data-pause-home], [data-result-home]";

export class PadBridge {
  constructor() {
    this.root = null;
    this.previous = null;
    this.held = new Set();
    this.repeat = 0;
  }
  // Controls the player can reach right now: visible, enabled, not inert.
  targets() {
    return [
      ...this.root.querySelectorAll("button, summary, select, input"),
    ].filter(
      (el) =>
        !el.disabled &&
        !el.closest("[inert],[hidden]") &&
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== "hidden",
    );
  }
  preferred(items) {
    for (const s of PREFERRED) {
      const el = items.find((item) => item.matches(s));
      if (el) return el;
    }
    return items[0];
  }
  focused(items) {
    const el = this.root.ownerDocument.activeElement;
    return items.includes(el) ? el : null;
  }
  key(name, down) {
    const [key, code] = KEYS[name];
    if (down === this.held.has(name)) return;
    if (down) this.held.add(name);
    else this.held.delete(name);
    const doc = this.root.ownerDocument,
      active = doc.activeElement,
      target =
        active && this.root.contains(active) && active.tagName !== "BUTTON"
          ? active
          : this.root.querySelector("canvas") || this.root;
    target.dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", {
        key,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  escape() {
    const doc = this.root.ownerDocument,
      active = doc.activeElement,
      target = active && this.root.contains(active) ? active : this.root;
    for (const type of ["keydown", "keyup"])
      target.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
  }
  releaseAll() {
    if (!this.root) return;
    for (const name of [...this.held]) this.key(name, false);
  }
  // Leave the game: let go of every synthetic key.
  detach() {
    this.releaseAll();
    this.root = null;
    this.previous = null;
  }
  // Called every frame while a standalone game is open. Returns true when
  // the controller did something (so the caller can show pad prompts).
  update(root, pad, dt) {
    if (root !== this.root) {
      this.releaseAll();
      this.root = root;
      // Buttons held when the game opened (the A that picked it) are not
      // fresh presses.
      this.previous = null;
      // A dialog focuses its first button, often "Back to games": start on
      // the game's main button instead so A plays rather than leaves.
      if (!root.padPlaying?.()) {
        const items = this.targets(),
          active = root.ownerDocument.activeElement;
        if (items.length && (!items.includes(active) || active.matches(LEAVE)))
          this.preferred(items).focus({ preventScroll: true });
      }
    }
    if (!pad) {
      this.releaseAll();
      this.previous = null;
      return false;
    }
    // A game that reads every controller itself (Leaf Piles with four
    // players) takes them all; start fresh when it hands them back, so the
    // B that paused it doesn't also resume.
    if (root.padSeats?.()) {
      this.releaseAll();
      this.previous = null;
      return false;
    }
    const now = padState(pad);
    if (!this.previous) {
      this.previous = now;
      this.wait = anyHeld(now);
      return false;
    }
    if (this.wait) {
      this.previous = now;
      if (anyHeld(now)) return false;
      this.wait = false;
    }
    const was = this.previous,
      pressed = (k) => now[k] && !was[k];
    this.previous = now;
    const playing = !!root.padPlaying?.();
    if (!playing) this.releaseAll();
    // Firefly Recall: Y X B A are the four fireflies, so B can't pause.
    const faces = playing && !!root.padFaces?.();
    if (pressed("b") && !faces) this.escape();
    if (playing) {
      if (pressed("menu")) this.escape();
      for (const name of Object.keys(KEYS)) {
        const face = FACES[name];
        if (face) this.key(name, faces && now[face]);
        else if (faces && (name === "action" || name === "pump"))
          this.key(name, false);
        else this.key(name, now[name]);
      }
      return anyHeld(now) || anyHeld(was);
    }
    // Menu screens: move focus between buttons, A presses.
    // A game can narrow the choice (Firefly Recall: only the fireflies).
    const only = root.padTargets?.(),
      items = only ? only.filter((el) => !el.disabled) : this.targets();
    if (!items.length) return anyHeld(now);
    const current = this.focused(items);
    if (pressed("menu") && !only) this.preferred(items).click();
    if (pressed("a")) {
      // With a narrowed choice, the first A only shows where you are.
      const el = current || this.preferred(items);
      el.focus({ preventScroll: true });
      if (current || !only) el.click();
    }
    const dir = ["up", "down", "left", "right"].find((d) => now[d]);
    if (!dir) this.repeat = 0;
    else if ((this.repeat -= dt) <= 0) {
      this.repeat = pressed(dir) ? 0.35 : 0.18;
      this.move(items, current, dir);
    }
    return anyHeld(now) || anyHeld(was);
  }
  move(items, current, dir) {
    if (!current) {
      this.preferred(items).focus({ preventScroll: true });
      return;
    }
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const others = items.filter((el) => el !== current);
    const i = nearest(centre(current), others.map(centre), dir);
    if (i >= 0) others[i].focus({ preventScroll: true });
  }
}
