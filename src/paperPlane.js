import preview from "./assets/modes/paper-plane-pitch.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPaperPlaneScene } from "./paperPlaneScene.js";
import {
  MAX_YAW,
  PLANES_PER_ROUND,
  createPlane,
  nextSetup,
  planeLevel,
  simulate,
  stepPlane,
  swipeThrow,
} from "../shared/paperPlane.js";
import "./paperPlane.css";

const TITLE = "Paper Plane Pitch";
const HOW_TO = `Fold-and-fly! Swipe up from the paper plane to throw it: the direction you swipe aims it and a longer swipe throws harder. Or aim with A / D (← / →), set the power with W / S (↑ / ↓) and throw with Space. Land it in the laundry basket. Watch the windsock and the wind sign: the breeze pushes the plane sideways, so aim into it. You have ${PLANES_PER_ROUND} planes, and the basket moves after every throw. On a controller, the stick aims and sets power and A throws.`;
const AIM_SPEED = 0.6; // radians per second while A / D is held
const POWER_SPEED = 0.45; // power per second while W / S is held
const NEXT_DELAY = 1.1; // seconds after a plane lands before the next is ready

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const tone = (freq, start, length, type = "sine", volume = 0.1, slide) => {
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
  const noise = (volume, length, from, to = from) => {
    if (audio?.state !== "running") return;
    const at = audio.currentTime;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = "bandpass";
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + length * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    throw: (power) => noise(0.18, 0.5 + power * 0.3, 1800, 600),
    // A papery rustle into the wicker, then a happy chime.
    in: (streak) => {
      noise(0.12, 0.18, 900);
      const base = [523, 587, 659, 784][Math.min(3, streak - 1)] ?? 523;
      [1, 1.25, 1.5].forEach((m, i) =>
        tone(base * m, 0.12 + i * 0.08, 0.25, "triangle", 0.08),
      );
    },
    rim: () => tone(240, 0, 0.12, "triangle", 0.08, 200),
    land: () => noise(0.06, 0.14, 700),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
  };
}

export function installPaperPlane(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "paperplane";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A paper airplane gliding toward a laundry basket on a backyard lawn" draggable="false"></span><strong>${TITLE}</strong><small>Swipe to fly a paper plane off the porch into the laundry basket. Mind the breeze!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel());
}

function open(level) {
  document.exitPointerLock?.();
  const settings = planeLevel(level);
  const bestKey = `paper-plane-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "paper-plane";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="pp-field">
      <canvas aria-label="A back porch overlooking a lawn with a laundry basket, a windsock and a clothesline"></canvas>
      <div class="pp-wind" data-wind aria-live="polite"><small>WIND</small><span data-wind-arrow>→</span><b data-wind-speed>0.0</b></div>
      <div class="pp-power" data-power-meter hidden><i data-power-fill></i></div>
      <div class="pp-pops" data-pops aria-hidden="true"></div>
      <section class="pp-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="pp-keys">Swipe up to throw · or A / D aim, W / S power, Space throws · Controller: stick and A</small>
      </section>
    </div>
    <footer>
      <div class="pp-hud"><span data-left></span><span data-score></span><span data-streak></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".pp-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let phase = "aim"; // aim | flying | wait | done
  let setup = nextSetup(level);
  let plane = null;
  let yaw = 0;
  let power = 0.5;
  let left = PLANES_PER_ROUND;
  let made = 0;
  let streak = 0;
  let bestStreak = 0;
  let waitUntil = 0;
  let t = 0;
  let frame;
  let previous = 0;
  let messageTimer;
  let drag = null; // { x, y, dx, dy } while swiping
  let keyAimed = false; // show the guide once the keys have moved the aim
  const keys = { left: false, right: false, up: false, down: false };
  let guide = null;
  let guideFor = "";

  function hud() {
    get("left").textContent = `✈️ ${left}`;
    get("left").setAttribute(
      "aria-label",
      `${left} plane${left === 1 ? "" : "s"} left`,
    );
    get("score").textContent = `🧺 ${made}`;
    get("score").setAttribute("aria-label", `${made} in the basket`);
    get("streak").textContent = streak > 1 ? `🔥 ${streak} in a row` : "";
  }

  function showWind() {
    const w = setup.wind;
    get("wind-arrow").textContent = w === 0 ? "•" : w > 0 ? "→" : "←";
    get("wind-speed").textContent = Math.abs(w).toFixed(1);
    get("wind").setAttribute(
      "aria-label",
      w === 0
        ? "No wind"
        : `Wind ${Math.abs(w).toFixed(1)} blowing ${w > 0 ? "right" : "left"}`,
    );
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function pop(text, big) {
    const at = scene.basketTop();
    const el = document.createElement("span");
    el.className = `pp-pop${big ? " big" : ""}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function throwPlane(aim, strength) {
    if (state !== "playing" || phase !== "aim") return;
    yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, aim));
    power = strength;
    plane = createPlane(yaw, power);
    phase = "flying";
    left--;
    keyAimed = false;
    sfx.throw(power);
    say("");
    hud();
  }

  function landed(result) {
    if (result === "in") {
      made++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      scene.bump();
      sfx.in(streak);
      pop(streak > 2 ? `+1 🔥${streak}` : "+1", streak > 2);
      say(
        streak > 2
          ? `${streak} in a row!`
          : ["Swoosh! Right in!", "In the basket!", "Nice landing!"][made % 3],
        1600,
      );
    } else {
      streak = 0;
      if (result === "rim") sfx.rim();
      else sfx.land();
      const drift =
        setup.wind &&
        Math.sign(plane.x - setup.basket.x) === Math.sign(setup.wind)
          ? ` The breeze pushed it ${setup.wind > 0 ? "right" : "left"}.`
          : "";
      say(
        {
          rim: "Ooh, it bumped the rim! So close.",
          short: "Just short. Throw a little harder.",
          long: "Too far! Try a softer throw.",
          wide: `A little to the side.${drift || " Aim at the basket."}`,
        }[result],
        2200,
      );
    }
    scene.rest(plane, result === "in");
    plane = null;
    hud();
    phase = "wait";
    waitUntil = t + NEXT_DELAY;
  }

  function step(dt) {
    t += dt;
    if (phase === "aim") {
      const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const push = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
      if (turn || push) keyAimed = true;
      yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw + turn * AIM_SPEED * dt));
      power = Math.max(0, Math.min(1, power + push * POWER_SPEED * dt));
    } else if (phase === "flying") {
      const was = plane.bounced;
      const result = stepPlane(plane, setup, dt);
      if (plane.bounced && !was) {
        scene.bump();
        sfx.rim();
      }
      if (result) landed(result);
    } else if (phase === "wait" && t >= waitUntil) {
      if (left > 0) {
        setup = nextSetup(level);
        scene.setSetup(setup);
        showWind();
        yaw = 0;
        phase = "aim";
      } else {
        phase = "done";
        finish();
      }
    }
  }

  // The aim shown before a throw: from the swipe while dragging, otherwise
  // the keyboard / controller aim.
  function currentAim() {
    if (drag) {
      const s = swipeThrow(drag.dx, drag.dy, canvas.clientHeight);
      return s ? { ...s, show: true } : { yaw: 0, power: 0, show: false };
    }
    return { yaw, power, show: keyAimed };
  }

  function draw(dt) {
    const held = phase === "aim" && state !== "finished" ? currentAim() : null;
    guide = null;
    if (held?.show && settings.guide) {
      const key = `${held.yaw.toFixed(3)}:${held.power.toFixed(3)}`;
      if (key !== guideFor || !guide) {
        guideFor = key;
        const path = simulate(held.yaw, held.power, setup).points;
        guide = path.slice(0, Math.ceil(path.length * settings.guide));
      }
    }
    scene.draw(dt, { plane, held, guide });
    const meter = get("power-meter");
    meter.hidden = !held?.show;
    if (held?.show)
      get("power-fill").style.height = `${Math.round(held.power * 100)}%`;
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    let record = false;
    if (made > best) {
      record = best > 0;
      best = made;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    sfx.win();
    results.show(
      made === PLANES_PER_ROUND
        ? "Every single plane landed!"
        : `${made} of ${PLANES_PER_ROUND} in the basket!`,
      record
        ? "That's a new best!"
        : made
          ? `Your best: ${best} of ${PLANES_PER_ROUND}.`
          : "The breeze is tricky! Aim into the wind and try again.",
      [
        [made, "IN THE BASKET"],
        [bestStreak, "BEST STREAK"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      t = 0;
      plane = null;
      phase = "aim";
      left = PLANES_PER_ROUND;
      made = streak = bestStreak = 0;
      yaw = 0;
      power = 0.5;
      setup = nextSetup(level);
      scene.clear();
      scene.setSetup(setup);
      showWind();
      get("pops").replaceChildren();
      say(
        touch
          ? "Swipe up from the plane to throw it!"
          : "Swipe up with the mouse, or aim with A / D, W / S and press Space!",
        0,
      );
    }
    release();
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    hud();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function release() {
    keys.left = keys.right = keys.up = keys.down = false;
    drag = null;
  }

  function pause() {
    if (state !== "playing") return;
    release();
    state = "paused";
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    TITLE,
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
    else if (state === "playing") pause();
    else dialog.close();
  });

  const KEYS = {
    a: "left",
    ArrowLeft: "left",
    d: "right",
    ArrowRight: "right",
    w: "up",
    ArrowUp: "up",
    s: "down",
    ArrowDown: "down",
  };
  const keyName = (event) =>
    KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const k = keyName(event);
    if (k) {
      event.preventDefault();
      keys[k] = true;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) throwPlane(yaw, power);
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const k = keyName(event);
    if (k) keys[k] = false;
  });

  // Swipe (touch or mouse) anywhere on the lawn: drag up and let go.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || phase !== "aim") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture?.(event.pointerId);
    drag = {
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
      id: event.pointerId,
    };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const s = swipeThrow(drag.dx, drag.dy, canvas.clientHeight);
    drag = null;
    if (s) throwPlane(s.yaw, s.power);
    else if (state === "playing" && phase === "aim")
      say("Drag up from the plane and let go to throw!", 1800);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => (drag = null));

  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
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

  const scene = createPaperPlaneScene(canvas);
  scene.setSetup(setup);
  showWind();
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Fly it in the basket!";
  get("details").textContent =
    `Swipe up to throw your paper plane off the porch and into the laundry basket. Watch the windsock: the breeze pushes the plane sideways, so aim into it. You have ${PLANES_PER_ROUND} planes.${best ? ` Your best: ${best} of ${PLANES_PER_ROUND}.` : ""}`;
  get("play").focus();
}
