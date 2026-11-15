import {
  BAD_DRAW as C,
  DRAW_PHASE as PHASE,
  createDrift,
  drawStick,
  roundResult,
} from "../shared/badDraw.js";
import { createWordPicker } from "../shared/badDrawWords.js";
import { createDrawingCanvas } from "./badDrawCanvas.js";
import { gameResults } from "./gameResults.js";
import { PAD } from "./padBridge.js";
import { bindDialogEscape } from "./pauseActions.js";
import preview from "./assets/modes/bad-draw.svg";
import "./badDraw.css";

const TITLE = "Bad Draw";
const RULES =
  "Draw the secret word while your team guesses out loud. No speaking, letters or spelling.";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const center = () => ({ x: C.width / 2, y: C.height / 2 });

/** Register a local round in the collection menu. The host supplies the
 * current drawer/team and may consume each completed round's result. */
export function installBadDraw({
  getDrawer,
  getPadIndex,
  onResult,
  audio,
  random = Math.random,
} = {}) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const pickWord = createWordPicker({ random });
  const entry = document.createElement("button");
  entry.type = "button";
  entry.className = "choice";
  entry.dataset.game = "baddraw";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="" draggable="false"></span><strong>${TITLE}</strong><small>Sketch a secret word for your team while the ink wanders off course.</small>`;
  entry.onclick = () =>
    openBadDraw({ getDrawer, getPadIndex, onResult, audio, random, pickWord });
  games.append(entry);
}

function openBadDraw({
  getDrawer,
  getPadIndex,
  onResult,
  audio,
  random,
  pickWord,
}) {
  document.exitPointerLock?.();
  const returnFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "bad-draw";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <section class="bad-draw-intro">
      <div class="bad-draw-card">
        <p class="bad-draw-label">BACKYARD ART CLUB · ${TITLE}</p>
        <h2 data-heading></h2>
        <p data-description></p>
        <strong class="bad-draw-word" data-word hidden></strong>
        <div class="bad-draw-actions">
          <button type="button" data-peek hidden>Hold to reveal <kbd>RT / Space</kbd></button>
          <button type="button" class="primary bad-draw-primary" data-next>Continue <kbd>A</kbd></button>
          <button type="button" data-leave>Back to games <kbd>B</kbd></button>
        </div>
      </div>
    </section>
    <section class="bad-draw-play" hidden>
      <header>
        <div><p class="bad-draw-label">BACKYARD ART CLUB</p><h2>${TITLE}</h2></div>
        <div class="bad-draw-clock"><span>TIME LEFT</span><strong data-time role="timer"></strong></div>
        <button type="button" data-exit>Exit <kbd>Menu</kbd></button>
      </header>
      <div class="bad-draw-table">
        <div class="bad-draw-sheet">
          <canvas aria-label="Drawing paper"></canvas>
          <span class="bad-draw-cursor" aria-hidden="true" hidden></span>
        </div>
      </div>
      <footer>
        <p>Hold to draw <kbd>Stick + RT</kbd></p>
        <div class="bad-draw-actions">
          <button type="button" data-undo>Undo · <span></span> <kbd>X</kbd></button>
          <button type="button" data-clear>Clear · <span></span> <kbd>Y</kbd></button>
          <button type="button" class="bad-draw-primary" data-correct>Correct! <kbd>A</kbd></button>
        </div>
      </footer>
    </section>`;

  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const intro = dialog.querySelector(".bad-draw-intro");
  const play = dialog.querySelector(".bad-draw-play");
  const canvas = play.querySelector("canvas");
  const cursor = play.querySelector(".bad-draw-cursor");
  const ink = createDrawingCanvas(canvas);
  const listeners = new AbortController();
  const listen = (target, name, handler) =>
    target.addEventListener(name, handler, { signal: listeners.signal });
  const resize = new ResizeObserver(() => ink.resize());
  let phase, drawer, word, deadline, frame, undoLeft, clearLeft, lastSecond;
  let owner,
    pointerId,
    revealId,
    revealKey = false,
    revealPad = false;
  let intended, previousFrame, padIndex, previousPad;
  let closed = false;

  const results = gameResults(dialog, TITLE, ready, exit);
  const resultCard = dialog.querySelector(".result-card");
  const snapshot = document.createElement("img");
  snapshot.className = "bad-draw-snapshot";
  snapshot.alt = "Final drawing";
  resultCard.insertBefore(snapshot, resultCard.querySelector(".result-stats"));

  // Reveal and drawing need raw trigger state and analog stick movement.
  // The normal menu bridge takes over again on the shared results screen.
  dialog.padSeats = () => phase === PHASE.REVEAL || phase === PHASE.PLAYING;
  bindDialogEscape(dialog, exit);

  function sound(frequency, duration = 0.12, delay = 0) {
    audio?.tone(frequency, duration, delay, 0.027);
  }

  function exit() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    stopDrawing();
    hideWord();
    listeners.abort();
    resize.disconnect();
    dialog.close();
    dialog.remove();
    returnFocus?.focus({ preventScroll: true });
  }

  function ready() {
    results.hide();
    resultCard.querySelector("h2").textContent = "";
    snapshot.removeAttribute("src");
    drawer = getDrawer?.() || {
      id: "local",
      name: "Player 1",
      team: "Your team",
    };
    phase = PHASE.READY;
    word = undefined;
    play.hidden = true;
    intro.hidden = false;
    get("heading").textContent = `${drawer.name} draws.`;
    get("description").textContent = RULES;
    get("peek").hidden = true;
    get("next").disabled = false;
    get("next").firstChild.nodeValue = "Continue ";
    get("next").focus({ preventScroll: true });
  }

  function showWord() {
    const visible =
      phase === PHASE.REVEAL &&
      (revealId !== undefined || revealKey || revealPad);
    const secret = get("word");
    if (secret.hidden === visible) {
      secret.textContent = visible ? word : "";
      secret.hidden = !visible;
    }
    get("next").disabled = visible;
  }

  function hideWord() {
    const id = revealId;
    revealId = undefined;
    if (id !== undefined && get("peek").hasPointerCapture(id))
      get("peek").releasePointerCapture(id);
    revealKey = revealPad = false;
    showWord();
  }

  function reveal() {
    word = pickWord(drawer.id);
    phase = PHASE.REVEAL;
    previousPad = undefined;
    get("heading").textContent = "Everyone else, look away!";
    get("description").textContent =
      `${drawer.name}, hold to peek. Let go before you start the clock.`;
    get("peek").hidden = false;
    get("next").firstChild.nodeValue = "Start drawing ";
  }

  function go() {
    if (phase === PHASE.READY) {
      audio?.unlock();
      reveal();
    } else if (
      phase === PHASE.REVEAL &&
      !get("next").disabled &&
      !previousPad?.rt
    ) {
      // The controller's first sample in play is a baseline, not a press.
      phase = PHASE.PLAYING;
      previousPad = undefined;
      hideWord();
      const now = performance.now();
      previousFrame = now;
      deadline = now + C.duration;
      lastSecond = undefined;
      undoLeft = C.undo;
      clearLeft = C.clear;
      intended = center();
      intro.hidden = true;
      play.hidden = false;
      ink.resize();
      ink.reset(createDrift(Math.floor(random() * 0x100000000)), now);
      cursor.hidden = true;
      updateTools();
      updateClock(now);
      get("correct").focus({ preventScroll: true });
      sound(380);
      sound(560, 0.16, 0.08);
    }
  }

  function finish(correct, now = performance.now()) {
    if (phase !== PHASE.PLAYING) return;
    const result = roundResult(correct, deadline, now);
    phase = PHASE.RESULTS;
    stopDrawing();
    play.hidden = true;
    snapshot.src = canvas.toDataURL();
    sound(result.success ? 540 : 230, 0.18);
    if (result.success) sound(760, 0.2, 0.11);
    results.show(word, result.success ? "They got it!" : "Time’s up!", [
      [result.score, `${drawer.team || "Your team"} · Points`],
      [`${(result.remaining / 1000).toFixed(1)}s`, "Time left"],
    ]);
    onResult?.({ ...result, drawerId: drawer.id, team: drawer.team });
  }

  function updateClock(now) {
    const second = Math.max(0, Math.ceil((deadline - now) / 1000));
    if (second === lastSecond) return;
    lastSecond = second;
    get("time").textContent =
      `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
    get("time").parentElement.classList.toggle(
      "urgent",
      second <= C.urgentSeconds,
    );
    if (second > 0 && second <= C.urgentSeconds) sound(310, 0.07);
  }

  function updateTools() {
    for (const [action, left] of [
      ["undo", undoLeft],
      ["clear", clearLeft],
    ]) {
      get(action).querySelector("span").textContent = left;
      get(action).disabled = !left || !ink.hasInk;
    }
  }

  function stopDrawing() {
    const id = pointerId;
    pointerId = owner = undefined;
    if (id !== undefined && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id);
    ink.end();
  }

  function tool(action) {
    if (phase !== PHASE.PLAYING) return;
    if (performance.now() >= deadline) return finish(false);
    if (!ink.hasInk || (action === "undo" ? !undoLeft : !clearLeft)) return;
    stopDrawing();
    if (action === "undo") undoLeft--;
    else clearLeft--;
    ink[action]();
    updateTools();
    sound(action === "undo" ? 360 : 280, 0.08);
  }

  function moveCursor(x, y) {
    intended = { x, y };
    cursor.hidden = false;
    cursor.style.left = `${(100 * x) / C.width}%`;
    cursor.style.top = `${(100 * y) / C.height}%`;
  }

  function pointerPoint(event, rect) {
    return {
      x: clamp(
        ((event.clientX - rect.left) * C.width) / rect.width,
        -C.amplitude,
        C.width + C.amplitude,
      ),
      y: clamp(
        ((event.clientY - rect.top) * C.height) / rect.height,
        -C.amplitude,
        C.height + C.amplitude,
      ),
    };
  }

  listen(canvas, "pointerdown", (event) => {
    if (phase !== PHASE.PLAYING || owner || event.button !== 0) return;
    const now = performance.now();
    if (now >= deadline) return finish(false, now);
    event.preventDefault();
    const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
    moveCursor(x, y);
    owner = "pointer";
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    ink.begin(x, y, now);
    updateTools();
  });

  listen(canvas, "pointermove", (event) => {
    if (
      phase !== PHASE.PLAYING ||
      owner === "pad" ||
      (owner === "pointer" && event.pointerId !== pointerId)
    )
      return;
    const now = performance.now();
    if (now >= deadline) return finish(false, now);
    const rect = canvas.getBoundingClientRect();
    if (owner === "pointer") {
      for (const sample of event.getCoalescedEvents?.() || []) {
        const p = pointerPoint(sample, rect);
        ink.advance(p.x, p.y, Math.min(now, sample.timeStamp || now));
      }
    }
    const { x, y } = pointerPoint(event, rect);
    moveCursor(x, y);
    if (owner === "pointer") ink.advance(x, y, now);
  });

  listen(canvas, "pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    const now = performance.now();
    if (now >= deadline) return finish(false, now);
    const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
    ink.advance(x, y, now);
    stopDrawing();
    if (event.pointerType !== "mouse" || !canvas.matches(":hover"))
      cursor.hidden = true;
  });
  for (const name of ["pointercancel", "lostpointercapture"]) {
    listen(canvas, name, (event) => {
      if (event.pointerId !== pointerId) return;
      stopDrawing();
      cursor.hidden = true;
    });
  }

  listen(canvas, "pointerleave", () => {
    if (owner !== "pad") cursor.hidden = true;
  });

  listen(get("peek"), "pointerdown", (event) => {
    if (phase !== PHASE.REVEAL || revealId !== undefined || event.button !== 0)
      return;
    event.preventDefault();
    revealId = event.pointerId;
    get("peek").setPointerCapture(revealId);
    showWord();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(get("peek"), name, (event) => {
      if (event.pointerId !== revealId) return;
      revealId = undefined;
      showWord();
    });
  }
  listen(window, "keydown", (event) => {
    if (phase !== PHASE.REVEAL || event.code !== "Space") return;
    event.preventDefault();
    if (event.repeat) return;
    revealKey = true;
    showWord();
  });
  listen(window, "keyup", (event) => {
    if (phase !== PHASE.REVEAL || event.code !== "Space") return;
    event.preventDefault();
    revealKey = false;
    showWord();
    if (!get("next").disabled) get("next").focus({ preventScroll: true });
  });

  function suspendInput() {
    stopDrawing();
    hideWord();
    cursor.hidden = true;
    previousPad = undefined;
  }
  listen(window, "blur", suspendInput);
  listen(document, "visibilitychange", () => {
    if (document.hidden) suspendInput();
  });

  function readPad(now, dt) {
    const pads = navigator.getGamepads?.() || [];
    const preferred = pads[getPadIndex?.()];
    const pad = pads[padIndex]?.connected
      ? pads[padIndex]
      : preferred?.connected
        ? preferred
        : Array.from(pads).find((candidate) => candidate?.connected);
    if (pad?.index !== padIndex || !pad) {
      padIndex = pad?.index;
      previousPad = undefined;
      if (owner === "pad") {
        stopDrawing();
        cursor.hidden = true;
      }
      if (revealPad) {
        revealPad = false;
        showWord();
      }
    }
    if (!pad) return;
    const held = (i) =>
      Boolean(pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5);
    const buttons = {
      rt: held(PAD.RT),
      a: held(PAD.A),
      b: held(PAD.B),
      x: held(PAD.X),
      y: held(PAD.Y),
      menu: held(PAD.MENU),
    };
    const was = previousPad;
    previousPad = buttons;
    if (!was) return;
    const pressed = (key) => buttons[key] && !was[key];

    if (phase === PHASE.REVEAL) {
      if (pressed("b")) return exit();
      // If A and the reveal release land in the same frame, require a new A.
      const wasRevealed = get("next").disabled || was.rt;
      if (pressed("rt")) revealPad = true;
      if (!buttons.rt) revealPad = false;
      showWord();
      if (pressed("a") && !wasRevealed) go();
      return;
    }

    if (pressed("menu")) return exit();
    if (pressed("a")) return finish(true, now);
    if (pressed("y")) return tool("clear");
    if (pressed("x")) return tool("undo");
    if (owner === "pointer") return;
    if (!buttons.rt && owner === "pad") stopDrawing();
    const stick = drawStick(pad.axes[0] || 0, pad.axes[1] || 0);
    if (stick.x || stick.y || pressed("rt")) {
      moveCursor(
        clamp(intended.x + stick.x * dt * C.cursorSpeed, 0, C.width),
        clamp(intended.y + stick.y * dt * C.cursorSpeed, 0, C.height),
      );
    }
    if (pressed("rt")) {
      owner = "pad";
      ink.begin(intended.x, intended.y, now);
      updateTools();
    }
  }

  function tick(now) {
    if (closed) return;
    if (phase === PHASE.PLAYING && now >= deadline) finish(false, now);
    if (phase === PHASE.PLAYING) updateClock(now);
    if (dialog.padSeats() && document.hasFocus() && !document.hidden) {
      readPad(now, clamp(now - previousFrame, 0, C.maxSampleGap) / 1000);
    }
    if (owner) ink.advance(intended.x, intended.y, now);
    previousFrame = now;
    if (!closed) frame = requestAnimationFrame(tick);
  }

  get("next").onclick = go;
  get("leave").onclick = get("exit").onclick = exit;
  get("correct").onclick = () => finish(true);
  get("undo").onclick = () => tool("undo");
  get("clear").onclick = () => tool("clear");
  dialog.addEventListener("close", exit, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  resize.observe(canvas);
  ready();
  frame = requestAnimationFrame(tick);
}
