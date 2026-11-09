import preview from "./assets/modes/perch-hop.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPerchHopScene } from "./perchHopScene.js";
import {
  READY_TIME,
  STEP,
  newRun,
  stageFor,
  stepRun,
} from "../shared/perchHop.js";
import { COLORS, avatarChoice } from "../shared/avatars.js";
import "./perchHop.css";

const HOW_TO =
  "Land on all ten perches around the backyard as fast as you can. Each one has a little white flag; land on it and the flag goes up in your colour. Run with A / D or ← / →, jump with Space, W or ↑, and jump again in the air for a double jump. Hold jump longer to go higher. Jump up through ledges from below, and press S or ↓ on one to drop through. Trampolines bounce you high. Watch out for the pond! On a touch screen, use the arrow buttons and the big jump button.";
// Seconds between the last perch (or a splash) and the results.
const RESULTS_AFTER = 1.4;

const time = (s) => s.toFixed(2);

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
  const noise = (volume, length, cutoff, type = "bandpass", sweep) => {
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
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, audio.currentTime);
    if (sweep)
      filter.frequency.exponentialRampToValueAtTime(
        sweep,
        audio.currentTime + length,
      );
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    jump: () => tone(330, 0, 0.14, "triangle", 0.07, 620),
    double: () => tone(520, 0, 0.16, "triangle", 0.07, 1040),
    land: () => noise(0.08, 0.05, 500, "lowpass"),
    bounce: () => tone(180, 0, 0.3, "sine", 0.14, 720),
    // The pitch climbs a step with every perch.
    perch: (n) => {
      const f = 523 * 2 ** ((n * 2) / 12);
      tone(f, 0, 0.12, "triangle", 0.09);
      tone(f * 1.5, 0.08, 0.2, "triangle", 0.08);
    },
    splash: () => {
      noise(0.3, 0.5, 1800, "bandpass", 300);
      tone(420, 0, 0.3, "sine", 0.05, 140);
    },
    ready: () => tone(440, 0, 0.18, "triangle", 0.08),
    go: () => tone(880, 0, 0.32, "triangle", 0.1),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.28, "triangle", 0.09),
      ),
    done: () =>
      [523, 440, 392].forEach((f, i) =>
        tone(f, 0.2 + i * 0.15, 0.24, "triangle", 0.07),
      ),
  };
}

export function installPerchHop(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "perchhop";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A critter jumping between flagged perches in a backyard" draggable="false"></span><strong>Perch Hop</strong><small>Run, jump and double-jump onto all ten perches around the yard as fast as you can!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const stage = stageFor(level);
  const bestKey = `perch-hop-best-${level}`;
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(bestKey));
    if (Number.isFinite(saved) && saved > 0) best = saved;
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "perch-hop";
  dialog.setAttribute("aria-label", "Perch Hop");
  dialog.innerHTML = `
    <header><strong>Perch Hop</strong><div><button data-exit>Back to games</button></div></header>
    <div class="hop-field">
      <canvas aria-label="A side view of a backyard with perches to land on"></canvas>
      <div class="hop-top" data-top hidden>
        <strong class="hop-clock" data-clock>0.00</strong>
        <div class="hop-flags" data-flags aria-live="polite"></div>
      </div>
      <strong class="hop-call" data-call aria-live="assertive" hidden></strong>
      <div class="hop-pad" data-pad hidden>
        <div class="hop-move">
          <button type="button" data-hold="left" aria-label="Run left">◀</button>
          <button type="button" data-hold="down" aria-label="Drop down">▼</button>
          <button type="button" data-hold="right" aria-label="Run right">▶</button>
        </div>
        <button type="button" class="hop-jump" data-hold="jump" aria-label="Jump">Jump</button>
      </div>
      <section class="hop-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="hop-modes"><button class="primary" data-play>Play</button></div>
        <small class="hop-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <div class="hop-hud"><span data-best></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Perch Hop", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".hop-panel");
  const sfx = sounds();

  // ready: start panel. countdown: "Ready… GO!". playing. over: last perch
  // or a splash, before the results. paused. finished: results showing.
  let state = "ready";
  let pausedFrom = null;
  let run = newRun(stage);
  let countdown = 0;
  let overTime = 0;
  let accumulator = 0;
  let previous = 0;
  let frame;
  let messageTimer;
  const held = { left: false, right: false, down: false, jump: false };
  const touch = { left: false, right: false, down: false, jump: false };
  let jumpPressed = false;
  let downPressed = false;
  dialog.padPlaying = () => state === "countdown" || state === "playing";

  const flags = get("flags");
  flags.replaceChildren(
    ...Array.from({ length: run.total }, () => {
      const f = document.createElement("span");
      return f;
    }),
  );

  function hud() {
    get("best").textContent = best
      ? `Best ${time(best)} s`
      : "No best time yet";
    get("clock").textContent = time(run.t);
    [...flags.children].forEach((f, i) =>
      f.classList.toggle("up", i < run.count),
    );
    flags.setAttribute("aria-label", `${run.total - run.count} perches to go`);
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function call(text) {
    const el = get("call");
    el.textContent = text;
    el.hidden = !text;
    el.classList.remove("pop");
    void el.offsetWidth;
    if (text) el.classList.add("pop");
  }

  const input = () => {
    const left = held.left || touch.left;
    const right = held.right || touch.right;
    return {
      x: (right ? 1 : 0) - (left ? 1 : 0),
      jump: held.jump || touch.jump,
      down: held.down || touch.down,
      jumpPressed,
      downPressed,
    };
  };

  function events() {
    for (const e of run.events) {
      if (e === "jump") sfx.jump();
      else if (e === "double") {
        sfx.double();
        scene.flip();
      } else if (e === "land") sfx.land();
      else if (e === "bounce") {
        sfx.bounce();
        scene.bounce(run.spring);
      } else if (e === "perch") {
        sfx.perch(run.count);
        scene.perch(run.on, run);
        hud();
      } else if (e === "splash") {
        sfx.splash();
        scene.splash(run.x);
        if (stage.respawn) say("Splash! Back to the deck — keep going!", 2200);
      }
    }
  }

  function step(dt) {
    if (state === "countdown") {
      const before = countdown;
      countdown += dt;
      if (before < READY_TIME && countdown >= READY_TIME) {
        call("GO!");
        sfx.go();
        state = "playing";
        setTimeout(() => state === "playing" && call(""), 600);
      }
    }
    if (state === "playing") {
      accumulator += dt;
      while (accumulator >= STEP && state === "playing") {
        accumulator -= STEP;
        stepRun(run, stage, input());
        jumpPressed = downPressed = false;
        events();
        if (run.done) {
          state = "over";
          overTime = 0;
          call("Done!");
          sfx.win();
          scene.cheer(run);
        } else if (run.splashed) {
          state = "over";
          overTime = 0;
          call("Splash!");
        }
      }
      get("clock").textContent = time(run.t);
    } else if (state === "over") {
      overTime += dt;
      if (overTime >= RESULTS_AFTER) finish();
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    step(dt);
    scene.draw(state === "paused" ? 0 : dt, run, state === "paused");
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    get("pad").hidden = true;
    call("");
    if (run.done) {
      const record = !best || run.t < best;
      if (record) {
        best = run.t;
        try {
          localStorage.setItem(bestKey, String(best));
        } catch {}
      }
      hud();
      const splashes =
        run.splashes === 1
          ? " One splash along the way."
          : run.splashes
            ? ` ${run.splashes} splashes along the way.`
            : "";
      results.show(
        record ? "New best time!" : "All ten perches!",
        record
          ? `You landed on every perch in ${time(run.t)} seconds, your fastest yet!${splashes}`
          : `You landed on every perch in ${time(run.t)} seconds. Your best is ${time(best)}.${splashes}`,
        [
          [time(run.t), "SECONDS"],
          [best ? time(best) : "—", "BEST"],
        ],
      );
    } else {
      sfx.done();
      hud();
      const left = run.total - run.count;
      results.show(
        "Splash! Into the pond.",
        run.count
          ? `You landed on ${run.count} of the ${run.total} perches before the splash. ${left === 1 ? "Just one to go!" : `${left} to go next time!`}`
          : "Hop from the deck onto the perches with the white flags. A double jump gets you across the water!",
        [
          [`${run.count}/${run.total}`, "PERCHES"],
          [best ? time(best) : "—", "BEST"],
        ],
      );
    }
  }

  function start(reset) {
    results.hide();
    if (reset) {
      run = newRun(stage);
      accumulator = 0;
      countdown = 0;
      state = "countdown";
      call("Ready…");
      sfx.resume();
      setTimeout(() => sfx.ready(), 60);
      say("");
    } else {
      state = pausedFrom || "playing";
    }
    pausedFrom = null;
    for (const k of Object.keys(touch)) touch[k] = held[k] = false;
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("top").hidden = false;
    get("pause").hidden = false;
    get("pad").hidden = !usesTouch;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    hud();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing" && state !== "countdown") return;
    pausedFrom = state;
    state = "paused";
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Perch Hop",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => start(true);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing" || state === "countdown") pause();
    else if (state === "ready" || state === "finished") dialog.close();
  });

  const keyMap = {
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right",
    s: "down",
    arrowdown: "down",
    " ": "jump",
    w: "jump",
    arrowup: "jump",
    k: "jump",
  };
  function press(name, down) {
    if (down && !held[name] && !touch[name]) {
      if (name === "jump") jumpPressed = true;
      if (name === "down") downPressed = true;
    }
  }
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state === "ready" || state === "finished" || state === "paused") return;
    const name = keyMap[event.key.toLowerCase()];
    if (!name) return;
    event.preventDefault();
    if (event.repeat) return;
    if (state === "playing") press(name, true);
    held[name] = true;
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const name = keyMap[event.key.toLowerCase()];
    if (name) held[name] = false;
  });

  // Touch buttons: hold to run, tap to jump. Slide a finger between the
  // arrows without lifting it.
  let usesTouch = matchMedia("(pointer: coarse)").matches;
  const pad = get("pad");
  const fingers = new Map();
  function refreshTouch() {
    for (const k of Object.keys(touch)) touch[k] = false;
    for (const name of fingers.values()) if (name) touch[name] = true;
    for (const b of pad.querySelectorAll("[data-hold]"))
      b.classList.toggle("held", touch[b.dataset.hold]);
  }
  function fingerAt(event) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    return el?.closest?.("[data-hold]")?.dataset.hold || null;
  }
  pad.addEventListener("pointerdown", (event) => {
    const name = event.target.closest("[data-hold]")?.dataset.hold;
    if (!name) return;
    event.preventDefault();
    pad.setPointerCapture?.(event.pointerId);
    if (state === "playing" && !touch[name]) press(name, true);
    fingers.set(event.pointerId, name);
    refreshTouch();
  });
  pad.addEventListener("pointermove", (event) => {
    if (!fingers.has(event.pointerId)) return;
    const name = fingerAt(event);
    // Only the arrows slide; the jump button stays put.
    const was = fingers.get(event.pointerId);
    if (was === "jump" || name === "jump" || name === was) return;
    if (name && state === "playing" && !touch[name]) press(name, true);
    fingers.set(event.pointerId, name);
    refreshTouch();
  });
  const lift = (event) => {
    if (!fingers.delete(event.pointerId)) return;
    refreshTouch();
  };
  pad.addEventListener("pointerup", lift);
  pad.addEventListener("pointercancel", lift);
  pad.addEventListener("contextmenu", (event) => event.preventDefault());
  // A first touch anywhere shows the buttons.
  dialog.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || usesTouch) return;
    usesTouch = true;
    if (state === "playing" || state === "countdown") get("pad").hidden = false;
  });

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

  const scene = createPerchHopScene(canvas, stage, {
    avatar,
    color: COLORS[avatar.color],
  });
  scene.reserve = () => {
    if (pad.hidden) return 0;
    const field = canvas.getBoundingClientRect();
    return Math.max(0, field.bottom - pad.getBoundingClientRect().top + 6);
  };
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = stage.name;
  get("details").textContent =
    `Land on all ten perches as fast as you can! Each one has a white flag that goes up in your colour when you land on it. Jump again in the air for a double jump, and watch out for the pond${stage.respawn ? " (a splash just puts you back on the deck)" : ""}.${best ? ` Your best: ${time(best)} s.` : ""}`;
  get("keys").textContent =
    "A / D or ← / → to run · Space, W or ↑ to jump (twice for a double jump) · S or ↓ to drop through a ledge";
  get("play").focus();
}
