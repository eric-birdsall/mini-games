import preview from "./assets/modes/pipe-crane.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPipeCraneScene } from "./pipeCraneScene.js";
import {
  canPlace,
  isWet,
  lift,
  makeSite,
  newJob,
  openValve,
  place,
  stepJob,
  turn,
  xyOf,
  yardPieces,
} from "../shared/pipeCrane.js";
import { avatarChoice } from "../shared/avatars.js";
import "./pipeCrane.css";

const HOW_TO =
  "The trenches are dug. Use the crane to lay pipe from pipe A to the other pipes before the water reaches the end of your pipe. Tap a stack in the pipe yard to grab a pipe, turn it with ⟳ (or R), then tap a trench to lower it in. Tap a pipe in a trench to turn it, or drag it somewhere else. When the valve opens, water flows through every open end, so make sure they all join up! Keys: arrows or WASD move the hook, Space grabs and drops, R / Q turn, G turns the water on early.";
const NAMES = {
  straight: "Straight",
  corner: "Corner",
  tee: "T",
  cross: "Cross",
};
// Seconds between a spill and the results.
const RESULTS_AFTER = 1.8;
const DRAG_PX = 12;

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const tone = (freq, start, length, type = "sine", volume = 0.12, slide) => {
    if (audio?.state !== "running") return;
    const at = audio.currentTime + start;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  };
  const noise = (
    volume,
    length,
    cutoff,
    type = "bandpass",
    sweep,
    start = 0,
  ) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const f = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * f) ** 2;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const at = audio.currentTime + start;
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, at);
    if (sweep)
      filter.frequency.exponentialRampToValueAtTime(sweep, at + length);
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    grab: () => {
      tone(420, 0, 0.07, "square", 0.04, 620);
      noise(0.08, 0.06, 2400, "highpass");
    },
    clunk: () => {
      noise(0.3, 0.12, 300, "lowpass");
      tone(140, 0, 0.14, "triangle", 0.1, 80);
    },
    turn: () => {
      noise(0.06, 0.04, 3000, "bandpass");
      noise(0.06, 0.04, 3400, "bandpass", undefined, 0.06);
    },
    nope: () => tone(300, 0, 0.12, "sine", 0.06, 240),
    tick: () => tone(1200, 0, 0.04, "square", 0.025),
    valve: () => {
      noise(0.18, 0.7, 500, "bandpass", 1800);
      tone(330, 0, 0.18, "triangle", 0.06);
      tone(494, 0.12, 0.25, "triangle", 0.06);
    },
    gurgle: () => {
      const f = 260 + Math.random() * 140;
      tone(f, 0, 0.12, "sine", 0.06, f * 1.8);
    },
    outlet: () =>
      [659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.08, 0.2, "triangle", 0.08),
      ),
    splash: () => {
      noise(0.35, 0.6, 1200, "bandpass", 300);
      tone(500, 0, 0.4, "sine", 0.05, 160);
    },
    job: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
    done: () =>
      [523, 440, 392].forEach((f, i) =>
        tone(f, 0.2 + i * 0.15, 0.24, "triangle", 0.07),
      ),
  };
}

export function installPipeCrane(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "pipecrane";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A crane lowering pipe into trenches on a building site" draggable="false"></span><strong>Pipe Crane</strong><small>Lay pipe in the trenches with your crane and join pipe A to the others before the water arrives!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `pipe-crane-best-${level}`;
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(bestKey));
    if (Number.isFinite(saved) && saved > 0) best = saved;
  } catch {}
  const types = yardPieces(level);

  const dialog = document.createElement("dialog");
  dialog.className = "pipe-crane";
  dialog.setAttribute("aria-label", "Pipe Crane");
  dialog.innerHTML = `
    <header><strong>Pipe Crane</strong><div><button data-exit>Back to games</button></div></header>
    <div class="pipe-field">
      <canvas aria-label="A building site with trenches, a pipe yard and a crane"></canvas>
      <div class="pipe-top" data-top hidden>
        <span class="pipe-site" data-site></span>
        <span class="pipe-timer" data-timer><span class="pipe-drop" aria-hidden="true"></span><b data-clock></b></span>
        <span class="pipe-best" data-best></span>
      </div>
      <div class="pipe-tools" data-tools hidden>
        <button class="pipe-turn" data-turn aria-label="Turn the pipe" title="Turn (R)">⟳</button>
        <button class="pipe-valve" data-valve title="Turn the water on now (G)">Water on!</button>
      </div>
      <section class="pipe-panel" data-panel>
        <h2 data-heading></h2><p data-details></p>
        <div class="pipe-modes"><button class="primary" data-play>Play</button></div>
        <small class="pipe-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Pipe Crane", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = get("panel");
  const sfx = sounds();

  // ready: start panel. playing. spilled: water pouring out before the
  // results. between: a job done, waiting for "Next site". paused.
  // finished: results showing.
  let state = "ready";
  let pausedFrom = null;
  let seed = 1;
  let index = 0;
  let done = 0;
  let site = makeSite(level, 0, seed);
  let job = newJob(site);
  // The pipe on the hook, and where it came from ("yard" or a cell).
  let held = null;
  let heldFrom = null;
  // What the hook / cursor is over: { cell } or { slot }.
  let aim = { slot: 0 };
  let dragPoint = null;
  let drag = null;
  let spillTime = 0;
  let valveTurn = 0;
  let lastWhole = -1;
  let toldHurry = false;
  let previous = 0;
  let frame;
  let messageTimer;
  // Controller: stick moves the hook, A grabs / drops, X turns (padBridge).
  dialog.padPlaying = () => state === "playing";

  function say(text, hold = 2600) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function hud() {
    get("site").textContent = `Site ${index + 1}`;
    get("best").textContent = `Best ${best}`;
    const timer = get("timer");
    if (!job.flowing) {
      const s = Math.ceil(job.clock);
      get("clock").textContent = `Water in ${s}`;
      timer.classList.toggle("soon", s <= 5);
      timer.classList.remove("on");
    } else {
      get("clock").textContent = job.hurry ? "Joined up!" : "Water's on!";
      timer.classList.remove("soon");
      timer.classList.add("on");
    }
    get("valve").hidden = job.flowing || state !== "playing";
    get("turn").hidden = state !== "playing";
    get("turn").classList.toggle("holding", !!held);
  }

  function hookTarget() {
    if (dragPoint) return dragPoint;
    if (aim.slot !== undefined) return scene.slotPoint(aim.slot);
    return scene.cellPoint(aim.cell);
  }

  function cursorOk() {
    if (aim.cell === undefined) return true;
    if (held) return canPlace(job, aim.cell);
    return true;
  }

  // --- Actions ------------------------------------------------------------
  function grab(slot) {
    const type = types[slot];
    if (held && heldFrom === "yard" && held.type === type) return;
    held = { type, rot: type === "straight" ? 1 : 0 };
    heldFrom = "yard";
    sfx.grab();
    say(`${NAMES[type]} pipe on the hook.`, 1600);
  }

  function putBack() {
    if (!held) return;
    held = null;
    heldFrom = null;
    sfx.grab();
  }

  function lower(cell) {
    if (!held) return false;
    if (!job.site.trench.has(cell)) {
      sfx.nope();
      say("Pipes go in the trenches.");
      return false;
    }
    if (isWet(job, cell)) {
      sfx.nope();
      say("There's water in that one already!");
      return false;
    }
    place(job, cell, held);
    held = null;
    heldFrom = null;
    scene.dropped(cell);
    sfx.clunk();
    return true;
  }

  function pickUp(cell) {
    const piece = lift(job, cell);
    if (!piece) {
      if (isWet(job, cell)) {
        sfx.nope();
        say("That pipe's full of water now.");
      }
      return false;
    }
    held = piece;
    heldFrom = cell;
    sfx.grab();
    return true;
  }

  function spin(by = 1, cell = aim.cell) {
    if (held) {
      held = { ...held, rot: (held.rot + by + 4) % 4 };
      sfx.turn();
      return;
    }
    if (cell === undefined || !job.pipes.has(cell)) return;
    if (turn(job, cell, by)) sfx.turn();
    else {
      sfx.nope();
      say("That pipe's full of water now.");
    }
  }

  // Space / A: grab, put back, drop or lift, depending on where the hook is.
  function act() {
    if (aim.slot !== undefined) {
      if (held && held.type === types[aim.slot]) putBack();
      else grab(aim.slot);
    } else if (held) lower(aim.cell);
    else if (job.pipes.has(aim.cell)) pickUp(aim.cell);
    else if (job.site.trench.has(aim.cell))
      say("Grab a pipe from the yard first.");
  }

  function valve() {
    if (state !== "playing" || job.flowing) return;
    openValve(job);
    onEvents(["valve", ...(job.spill ? ["spill"] : [])]);
  }

  // Keyboard / controller: move the cursor over the grid and the yard row.
  function move(dx, dy) {
    const { cols, rows } = job.site;
    if (aim.slot !== undefined) {
      if (dy < 0) {
        const p = scene.slotPoint(aim.slot);
        const x = Math.max(
          0,
          Math.min(cols - 1, Math.round(p.x / scene.CELL + (cols - 1) / 2)),
        );
        aim = { cell: (rows - 1) * cols + x };
      } else if (dx)
        aim = { slot: Math.max(0, Math.min(types.length - 1, aim.slot + dx)) };
      return;
    }
    let [x, y] = xyOf(job.site, aim.cell);
    if (dy > 0 && y === rows - 1) {
      // Down into the yard: the nearest stack.
      const px = scene.cellPoint(aim.cell).x;
      let slot = 0;
      types.forEach((_, i) => {
        if (
          Math.abs(scene.slotPoint(i).x - px) <
          Math.abs(scene.slotPoint(slot).x - px)
        )
          slot = i;
      });
      aim = { slot };
      return;
    }
    x = Math.max(0, Math.min(cols - 1, x + dx));
    y = Math.max(0, Math.min(rows - 1, y + dy));
    aim = { cell: y * cols + x };
  }

  // --- The water ------------------------------------------------------------
  function onEvents(events) {
    for (const e of events) {
      if (e === "valve") {
        sfx.valve();
        say("The water's on! Keep laying pipe ahead of it.", 3000);
      } else if (e === "fill") sfx.gurgle();
      else if (e === "outlet") sfx.outlet();
      else if (e === "spill") spilled();
      else if (e === "done") jobDone();
    }
  }

  function spilled() {
    state = "spilled";
    spillTime = 0;
    held = null;
    drag = dragPoint = null;
    scene.spilled(job.spill);
    sfx.splash();
    dialog.classList.remove("flash");
    void dialog.offsetWidth;
    dialog.classList.add("flash");
    say(
      job.spill.closed
        ? "The water went round in a loop!"
        : job.spill.empty || job.spill.edge
          ? "Splash! The water ran out of an open end."
          : "Splash! That pipe didn't line up.",
      3000,
    );
    hud();
  }

  function jobDone() {
    state = "between";
    done++;
    held = null;
    drag = dragPoint = null;
    sfx.job();
    const record = done > best;
    if (record) {
      best = done;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    hud();
    const outlets = job.site.outlets.length === 2 ? "B and C" : "B";
    get("heading").textContent = "Job done!";
    get("details").textContent =
      `The water made it all the way to pipe ${outlets}. ${done === 1 ? "One site" : `${done} sites`} finished${record && done > 1 ? ", a new best" : ""}! The next site's water comes on a little sooner.`;
    get("play").textContent = "Next site →";
    get("keys").textContent = "";
    panel.hidden = false;
    get("tools").hidden = true;
    get("pause").hidden = true;
    get("play").focus({ preventScroll: true });
  }

  function finish() {
    state = "finished";
    get("tools").hidden = true;
    get("pause").hidden = true;
    if (done > 0 && done >= best) sfx.job();
    else sfx.done();
    const title =
      done === 0
        ? "Oops, a big puddle!"
        : done === best
          ? "Best crew yet!"
          : done === 1
            ? "One site finished!"
            : `${done} sites finished!`;
    const detail =
      done === 0
        ? "Lay a pipe in pipe A's trench first, then follow the trench along. Every open end needs to join up before the water gets there."
        : `You joined up ${done === 1 ? "one site" : `${done} sites`} before the water spilled. Your best is ${best}.`;
    results.show(title, detail, [
      [String(done), "SITES"],
      [String(best), "BEST"],
    ]);
  }

  // --- Loop -----------------------------------------------------------------
  function step(dt) {
    if (state === "playing") {
      const before = Math.ceil(job.clock);
      const events = stepJob(job, dt);
      if (!job.flowing && Math.ceil(job.clock) !== before && job.clock <= 5)
        sfx.tick();
      if (job.hurry && !toldHurry) {
        toldHurry = true;
        say("All joined up! Here comes the water.", 2400);
      }
      onEvents(events);
      if (job.flowing) valveTurn = Math.min(1, valveTurn + dt * 1.5);
      const whole = Math.ceil(job.clock);
      if (whole !== lastWhole || job.flowing) {
        lastWhole = whole;
        hud();
      }
    } else if (state === "spilled") {
      spillTime += dt;
      if (spillTime >= RESULTS_AFTER) finish();
    }
  }

  function draw(dt) {
    scene.draw(dt, {
      job,
      hook: hookTarget(),
      held,
      cursor: state === "playing" ? aim : null,
      cursorOk: cursorOk(),
      valve: valveTurn,
    });
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function newSite() {
    site = makeSite(level, index, seed);
    job = newJob(site);
    scene.setSite(site, types);
    held = null;
    heldFrom = null;
    drag = dragPoint = null;
    // Start the hook over pipe A's trench.
    aim = { cell: site.source.cell };
    valveTurn = 0;
    lastWhole = -1;
    toldHurry = false;
  }

  function start(reset) {
    results.hide();
    if (state === "between") {
      index++;
      newSite();
      state = "playing";
      say(
        site.outlets.length === 2
          ? "Two pipes to reach this time: B and C. You'll need a T!"
          : "",
        3600,
      );
    } else if (reset) {
      seed = (Math.random() * 2 ** 32) >>> 0;
      index = 0;
      done = 0;
      newSite();
      state = "playing";
      say("Tap a pipe stack to grab one.", 3000);
    } else {
      state = pausedFrom || "playing";
    }
    pausedFrom = null;
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("top").hidden = false;
    get("tools").hidden = false;
    get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    hud();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing") return;
    pausedFrom = state;
    state = "paused";
    drag = dragPoint = null;
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Pipe Crane",
    () => {
      state = "finished";
      start(true);
    },
    () => dialog.close(),
  );
  get("play").onclick = () => start(state !== "between");
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => {
    state = "finished";
    start(true);
  };
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  get("valve").onclick = () => {
    valve();
    canvas.focus({ preventScroll: true });
  };
  get("turn").onclick = () => {
    spin(1);
    canvas.focus({ preventScroll: true });
  };
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else if (state === "ready" || state === "finished") dialog.close();
  });

  // --- Keyboard ---------------------------------------------------------------
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    if (event.target.closest?.("button")) {
      if (event.key === " " || event.key === "Enter") return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const moves = {
      ArrowUp: [0, -1],
      w: [0, -1],
      ArrowDown: [0, 1],
      s: [0, 1],
      ArrowLeft: [-1, 0],
      a: [-1, 0],
      ArrowRight: [1, 0],
      d: [1, 0],
    };
    if (moves[key]) {
      event.preventDefault();
      dragPoint = null;
      move(...moves[key]);
    } else if (key === " " || key === "Enter") {
      event.preventDefault();
      if (!event.repeat) act();
    } else if (key === "r" || key === "e") {
      event.preventDefault();
      if (!event.repeat) spin(1);
    } else if (key === "q") {
      event.preventDefault();
      if (!event.repeat) spin(-1);
    } else if (key === "g") {
      event.preventDefault();
      valve();
    } else return;
    hud();
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  // --- Pointer: tap or drag ---------------------------------------------------
  const where = (event) => scene.pick(event.clientX, event.clientY);
  function setAim(hit) {
    if (hit?.slot !== undefined) aim = { slot: hit.slot };
    else if (hit?.cell !== undefined) aim = { cell: hit.cell };
  }

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const hit = where(event);
    if (!hit) return;
    if (event.button === 2) {
      setAim(hit);
      spin(1, hit.cell);
      hud();
      return;
    }
    canvas.setPointerCapture?.(event.pointerId);
    setAim(hit);
    drag = {
      x: event.clientX,
      y: event.clientY,
      hit,
      moved: false,
      kind: null,
    };
    if (hit.slot !== undefined) {
      grab(hit.slot);
      drag.kind = "carry";
    } else if (hit.cell !== undefined) {
      if (held) drag.kind = "place";
      else if (job.pipes.has(hit.cell)) drag.kind = "pipe";
      else if (job.site.trench.has(hit.cell))
        say("Grab a pipe from the yard first.");
    }
    hud();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (state !== "playing") return;
    const hit = where(event);
    if (!drag) {
      // A mouse steers the hook just by hovering.
      if (event.pointerType === "mouse" && hit) setAim(hit);
      return;
    }
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_PX
    ) {
      drag.moved = true;
      if (drag.kind === "pipe") {
        if (pickUp(drag.hit.cell)) drag.kind = "carry";
        else drag.kind = null;
      } else if (drag.kind === "place") drag.kind = "carry";
    }
    if (drag.moved && hit) {
      setAim(hit);
      if (drag.kind === "carry") dragPoint = hit.point;
    }
  });
  const release = (event) => {
    if (!drag || state !== "playing") {
      drag = dragPoint = null;
      return;
    }
    const hit = where(event);
    const d = drag;
    drag = dragPoint = null;
    if (d.kind === "carry" && d.moved) {
      if (hit?.cell !== undefined) {
        if (!lower(hit.cell) && heldFrom !== "yard" && heldFrom !== null)
          lower(heldFrom);
      } else if (hit?.slot !== undefined) putBack();
      else if (heldFrom !== "yard" && heldFrom !== null) lower(heldFrom);
      setAim(hit);
    } else if (d.kind === "place" && !d.moved) lower(d.hit.cell);
    else if (d.kind === "pipe" && !d.moved) spin(1, d.hit.cell);
    hud();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", () => {
    if (drag && heldFrom !== "yard" && heldFrom !== null) lower(heldFrom);
    drag = dragPoint = null;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (state !== "playing" || !held) return;
      event.preventDefault();
      spin(event.deltaY > 0 ? 1 : -1);
      hud();
    },
    { passive: false },
  );

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createPipeCraneScene(canvas, { avatar });
  scene.setSite(site, types);
  aim = { cell: site.source.cell };
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Lay the pipe!";
  get("details").textContent =
    `The trenches are dug. Grab pipes from the yard with your crane, turn them to fit and lower them in to join pipe A to the other end. When the valve opens the water flows, so stay ahead of it and leave no open ends!${best ? ` Your best: ${best} sites.` : ""}`;
  get("keys").textContent =
    "Tap a stack to grab · ⟳ or R to turn · tap a trench to lower";
  get("play").focus();
}
