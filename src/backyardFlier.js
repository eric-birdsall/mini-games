import preview from "./assets/modes/backyard-flier.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createBackyardFlierScene } from "./backyardFlierScene.js";
import {
  GROUND,
  HELI_HALF_H,
  START_Y,
  flap,
  makeCourse,
  newFlight,
  stepFlight,
} from "../shared/backyardFlier.js";
import { COLORS, avatarChoice } from "../shared/avatars.js";
import "./backyardFlier.css";

const HOW_TO =
  "Fly your toy helicopter through the backyard. It sinks on its own; every tap gives it a little lift. Time your taps to slip through the gaps between the tree branches above and the shrubs below. Touching a branch, a shrub or the grass ends the flight. Each gap you clear scores one. Press Space, ↑ or W (or tap the screen) to rise.";
const STEP = 1 / 120;
// Seconds between a crash and the results.
const RESULTS_AFTER = 1.3;

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
    // A quick whup-whup of the rotor.
    flap: () => {
      noise(0.12, 0.08, 380, "lowpass");
      noise(0.07, 0.07, 520, "lowpass");
      tone(150, 0, 0.09, "triangle", 0.05, 230);
    },
    point: () => {
      tone(988, 0, 0.09, "triangle", 0.08);
      tone(1319, 0.07, 0.16, "triangle", 0.08);
    },
    bonk: () => {
      noise(0.25, 0.14, 700, "lowpass");
      tone(260, 0, 0.25, "square", 0.05, 90);
    },
    thud: () => noise(0.2, 0.12, 220, "lowpass"),
    best: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
    done: () =>
      [523, 440, 392].forEach((f, i) =>
        tone(f, 0.2 + i * 0.15, 0.24, "triangle", 0.07),
      ),
  };
}

export function installBackyardFlier(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "backyardflier";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A toy helicopter flying between backyard obstacles" draggable="false"></span><strong>Backyard Flier</strong><small>Tap to keep your toy helicopter up and slip through the gaps between branches and shrubs!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

const crashLine = {
  ground: "Bump! Down on the grass.",
  branch: "Bonk! Into the branches.",
  shrub: "Crunch! Into the shrubs.",
};

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `backyard-flier-best-${level}`;
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(bestKey));
    if (Number.isFinite(saved) && saved > 0) best = saved;
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "backyard-flier";
  dialog.setAttribute("aria-label", "Backyard Flier");
  dialog.innerHTML = `
    <header><strong>Backyard Flier</strong><div><button data-exit>Back to games</button></div></header>
    <div class="flier-field">
      <canvas aria-label="A toy helicopter flying through a backyard between tree branches and shrubs"></canvas>
      <strong class="flier-score" data-score aria-live="polite" hidden>0</strong>
      <div class="flier-hint" data-hint hidden><span class="flier-tap" aria-hidden="true"></span>Tap to fly!</div>
      <section class="flier-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="flier-modes"><button class="primary" data-play>Play</button></div>
        <small class="flier-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <div class="flier-hud"><span data-best></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Backyard Flier", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".flier-panel");
  const sfx = sounds();

  // ready: the start panel. hover: waiting for the first tap. playing.
  // crashed: falling / sitting on the grass before the results. paused.
  // finished: results showing.
  let state = "ready";
  let pausedFrom = null;
  let seed = 1;
  let course = makeCourse(level, seed);
  let flight = newFlight();
  let crashTime = 0;
  let accumulator = 0;
  let previous = 0;
  let frame;
  let messageTimer;
  // Controller: A (Space) flaps while hovering or flying (padBridge).
  dialog.padPlaying = () => state === "hover" || state === "playing";

  function hud() {
    get("best").textContent = `Best ${best}`;
    get("score").textContent = String(flight.score);
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function bump() {
    const el = get("score");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function crash() {
    state = "crashed";
    crashTime = 0;
    get("pause").hidden = true;
    scene.crash(flight.crashed, flight.y);
    if (flight.crashed === "ground") sfx.thud();
    else sfx.bonk();
    dialog.classList.remove("flash");
    void dialog.offsetWidth;
    dialog.classList.add("flash");
    say(crashLine[flight.crashed], 2000);
    // Knocked out of the air: drop from wherever it was.
    flight.vy = Math.min(flight.vy, 1.5);
  }

  function tap() {
    if (state === "hover") {
      state = "playing";
      get("hint").hidden = true;
    }
    if (state !== "playing") return;
    flap(flight, course);
    sfx.flap();
  }

  function step(dt) {
    if (state === "playing") {
      accumulator += dt;
      while (accumulator >= STEP && state === "playing") {
        accumulator -= STEP;
        const before = flight.score;
        stepFlight(flight, course, STEP);
        if (flight.score > before) {
          sfx.point();
          bump();
          hud();
        }
        if (flight.crashed) crash();
      }
    } else if (state === "crashed") {
      crashTime += dt;
      // Tumble down to the grass; the yard has stopped scrolling.
      if (flight.y > GROUND + HELI_HALF_H) {
        flight.vy = Math.max(-14, flight.vy - course.level.gravity * dt);
        flight.y = Math.max(GROUND + HELI_HALF_H, flight.y + flight.vy * dt);
        if (flight.y === GROUND + HELI_HALF_H) sfx.thud();
      }
      if (crashTime >= RESULTS_AFTER && flight.y <= GROUND + HELI_HALF_H)
        finish();
    }
  }

  function draw(dt = 0) {
    scene.draw(dt, {
      course,
      distance: flight.distance,
      y: flight.y,
      vy: flight.vy,
      mode:
        state === "ready" || state === "hover"
          ? "hover"
          : state === "playing"
            ? "fly"
            : state === "paused"
              ? "still"
              : "crash",
    });
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    const score = flight.score;
    const record = score > best;
    if (record) {
      best = score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
      sfx.best();
    } else sfx.done();
    hud();
    const title =
      score === 0
        ? "Up, up and… down!"
        : record
          ? "New best flight!"
          : score === 1
            ? "One gap cleared!"
            : `${score} gaps cleared!`;
    const detail = record
      ? score === 1
        ? "You flew through your first gap. Keep tapping to go further!"
        : `You flew through ${score} gaps, further than ever before!`
      : score === 0
        ? "Tap a little at a time to keep the helicopter level, then slip through the first gap."
        : `${crashLine[flight.crashed]} Your best is ${best}.`;
    results.show(title, detail, [
      [String(score), "GAPS"],
      [String(best), "BEST"],
    ]);
  }

  // A fresh flight hovering at the start, waiting for the first tap.
  function start(reset) {
    results.hide();
    if (reset) {
      seed = (Math.random() * 2 ** 32) >>> 0;
      course = makeCourse(level, seed);
      flight = newFlight();
      flight.y = START_Y;
      accumulator = 0;
      state = "hover";
      get("hint").hidden = false;
      say("");
    } else {
      state = pausedFrom || "hover";
    }
    pausedFrom = null;
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("score").hidden = false;
    get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    hud();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing" && state !== "hover") return;
    pausedFrom = state;
    state = "paused";
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Backyard Flier",
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
    else if (state === "playing" || state === "hover") pause();
    else if (state === "ready" || state === "finished") dialog.close();
  });

  const flapKeys = [" ", "ArrowUp", "w", "Enter", "k"];
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing" && state !== "hover") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!flapKeys.includes(key)) return;
    event.preventDefault();
    if (!event.repeat) tap();
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" && state !== "hover") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    tap();
  });
  // Taps on the hint or score count too.
  for (const el of [get("hint"), get("score")])
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      tap();
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

  const scene = createBackyardFlierScene(canvas, {
    avatar,
    color: COLORS[avatar.color],
  });
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Take to the skies!";
  get("details").textContent =
    `Your toy helicopter sinks on its own, and every tap gives it a little lift. Slip through the gaps between the branches above and the shrubs below. Touch anything and the flight's over! Each gap you clear scores one.${best ? ` Your best: ${best}.` : ""}`;
  get("keys").textContent = "Space, ↑, W or tap to rise";
  get("play").focus();
}
