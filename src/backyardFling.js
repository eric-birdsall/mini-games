import preview from "./assets/modes/backyard-fling.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createBackyardFlingScene } from "./backyardFlingScene.js";
import {
  STAGES,
  STAGES_PER_ROUND,
  blocksIn,
  clearRun,
  createYard,
  flingLevel,
  landingSpot,
  newRun,
  settled,
  stepRun,
  structuresLeft,
} from "../shared/backyardFling.js";
import { avatarChoice } from "../shared/avatars.js";
import "./backyardFling.css";

const TITLE = "Backyard Fling";
const HOW_TO = `Your critter's car zooms down the stunt track and round the loop by itself. Then the track opens out into a wide ramp: steer left and right with A / D or ← / → (or the ◀ ▶ buttons, or hold a finger on that side of the screen) and go faster or slower with W / S or ↑ / ↓. Off the end of the ramp the car flies, lands on the big picnic table and rolls on into the towers of wooden blocks. Knock every block tower down to clear the yard! The glowing ring shows where you'll land. There are ${STAGES_PER_ROUND} yards; when you run out of cars the next yard comes anyway. On a controller, the stick steers.`;
const READY = 0.9; // pause before each car sets off
const CLEAR_PAUSE = 2; // after the last structure, before the next yard
const STAGE_PAUSE = 1.6; // out of cars, before the next yard

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
  const noise = (volume, length, cutoff, type = "bandpass") => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  let lastBump = 0;
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    go: () => tone(330, 0, 0.5, "sawtooth", 0.035, 660),
    ramp: () => tone(440, 0, 0.18, "triangle", 0.06, 620),
    launch: () => {
      tone(300, 0, 0.35, "triangle", 0.08, 900);
      noise(0.1, 0.35, 1400, "highpass");
    },
    // Wooden blocks clack together and clunk on the table and grass.
    bump: (kinds, strength) => {
      const now = performance.now();
      if (now - lastBump < 45) return;
      lastBump = now;
      const v = Math.min(0.14, 0.03 + strength * 0.012);
      if (kinds.includes("ground")) noise(v * 1.4, 0.1, 300);
      else if (kinds[1] === "block")
        tone(620 + Math.random() * 260, 0, 0.07, "square", v * 0.35);
      else {
        tone(180 + Math.random() * 60, 0, 0.1, "triangle", v);
        noise(v, 0.06, 900);
      }
    },
    block: () => tone(880 + Math.random() * 220, 0, 0.12, "triangle", 0.05),
    topple: () => {
      tone(784, 0, 0.2, "triangle", 0.08);
      tone(1175, 0.08, 0.26, "triangle", 0.07);
    },
    clear: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.09, 0.24, "triangle", 0.09),
      ),
    win: () =>
      [392, 523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.12, 0.3, "triangle", 0.09),
      ),
  };
}

export function installBackyardFling(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "backyardfling";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A toy car rolling off a wide stunt ramp toward a picnic table" draggable="false"></span><strong>${TITLE}</strong><small>Loop the loop, steer down the wide ramp and fly your critter's car into towers of wooden blocks!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = flingLevel(level);
  const bestKey = `backyard-fling-blocks-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}
  const totalBlocks = STAGES.slice(0, STAGES_PER_ROUND).reduce(
    (sum, _, i) => sum + blocksIn(i),
    0,
  );

  const dialog = document.createElement("dialog");
  dialog.className = "backyard-fling";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="fling-field">
      <canvas aria-label="A toy stunt track with a loop and a wide ramp, and a picnic table beyond with towers of wooden blocks on it"></canvas>
      <div class="fling-pops" data-pops aria-hidden="true"></div>
      <div class="fling-banner" data-banner aria-hidden="true"></div>
      <div class="fling-pad" data-touch hidden>
        <button type="button" data-steer="1" aria-label="Steer left">◀</button>
        <button type="button" data-steer="-1" aria-label="Steer right">▶</button>
      </div>
      <section class="fling-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="fling-keys">A / D or ← / → to steer on the ramp · W / S faster or slower · Controller: stick</small>
      </section>
    </div>
    <footer>
      <div class="fling-hud"><span data-stage></span><span data-cars></span><span data-blocks></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick steers (the pad bridge sends W A S D).
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".fling-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let flow = "wait"; // wait | run | between
  let stage = 0;
  let yard = null;
  let run = newRun();
  let cars = settings.cars;
  let score = 0;
  let cleared = 0;
  let wait = 0;
  let frame;
  let previous = 0;
  let messageTimer;
  let lastPhase = "";
  const keys = { left: false, right: false, up: false, down: false };
  const held = { left: false, right: false }; // touch buttons and screen
  let pointerSteer = 0;

  function hud() {
    get("stage").textContent = `🏡 ${stage + 1} / ${STAGES_PER_ROUND}`;
    get("stage").setAttribute(
      "aria-label",
      `Yard ${stage + 1} of ${STAGES_PER_ROUND}`,
    );
    get("cars").textContent = `🏎️ ${cars}`;
    get("cars").setAttribute(
      "aria-label",
      `${cars} car${cars === 1 ? "" : "s"} left`,
    );
    get("blocks").textContent = `🧱 ${score}`;
    get("blocks").setAttribute("aria-label", `${score} blocks knocked down`);
  }

  function say(text, hold = 2600) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function banner(text) {
    const el = get("banner");
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function pop(x, y, z, text) {
    const at = scene.toScreen(x, y, z);
    const el = document.createElement("span");
    el.className = "fling-pop";
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function loadStage(index) {
    stage = index;
    yard = createYard(stage);
    scene.build(yard.pieces);
    cars = settings.cars;
    nextCar();
    banner(STAGES[stage].name);
  }

  // The next car waits at the top of the track for a moment.
  function nextCar() {
    run = newRun();
    flow = "wait";
    wait = READY;
    hud();
  }

  function afterRun() {
    clearRun(yard, run);
    if (structuresLeft(yard) === 0) {
      cleared++;
      flow = "between";
      wait = CLEAR_PAUSE;
      sfx.clear();
      scene.cheer(2);
      banner("Yard cleared!");
      return;
    }
    if (cars > 0) {
      const left = structuresLeft(yard);
      say(left === 1 ? "One tower left!" : `${left} towers left!`, 2000);
      nextCar();
      return;
    }
    flow = "between";
    wait = STAGE_PAUSE;
    banner("Great driving!");
  }

  function nextStage() {
    if (stage + 1 < STAGES_PER_ROUND) {
      loadStage(stage + 1);
      say("New yard!", 1600);
    } else finish();
  }

  function input() {
    // The camera looks down +z, so +x (steer > 0) is screen left.
    const left = keys.left || held.left || pointerSteer > 0;
    const right = keys.right || held.right || pointerSteer < 0;
    return {
      steer: Number(left) - Number(right),
      throttle: Number(keys.up) - Number(keys.down),
    };
  }

  function step(dt) {
    if (flow === "wait") {
      wait -= dt;
      if (wait <= 0) {
        flow = "run";
        cars--;
        sfx.go();
        say("Get ready to steer!", 2200);
        hud();
      }
      return;
    }
    if (flow === "between") {
      stepRun(yard, run, dt);
      wait -= dt;
      if (wait <= 0) nextStage();
      return;
    }
    const { downs, toppled, impacts, launched } = stepRun(
      yard,
      run,
      dt,
      input(),
    );
    if (run.phase !== lastPhase) {
      if (run.phase === "drive") {
        sfx.ramp();
        say(touch ? "Steer with ◀ ▶!" : "Steer! A / D or ← / →", 2600);
      }
      lastPhase = run.phase;
    }
    if (launched) {
      sfx.launch();
      say("");
    }
    for (const bump of impacts) sfx.bump(bump.kinds, bump.strength);
    for (const piece of downs) {
      score++;
      const p = piece.body.position;
      pop(p.x, p.y + 0.6, p.z, "+1");
      scene.bump(piece);
      sfx.block();
      hud();
    }
    for (const structure of toppled) {
      const top = structure.blocks.reduce((a, b) =>
        b.start.y > a.start.y ? b : a,
      );
      pop(top.start.x, top.start.y + 0.8, top.start.z, "Crash! 💥");
      sfx.topple();
    }
    if (settled(yard, run)) afterRun();
  }

  function draw(dt = 0) {
    const showMarker =
      settings.marker && run.phase === "drive" && flow === "run";
    scene.draw(dt, { run, landing: showMarker ? landingSpot(run) : null });
    get("touch").hidden = !(touch && state === "playing");
    dialog.classList.toggle("steering", run.phase === "drive");
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
    if (score > best) {
      record = best > 0;
      best = score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    sfx.win();
    results.show(
      `You knocked down ${score} of ${totalBlocks} blocks!`,
      record ? "That's your best driving yet!" : `Your best: ${best} blocks.`,
      [
        [score, "BLOCKS"],
        [`${cleared} / ${STAGES_PER_ROUND}`, "YARDS CLEARED"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      score = 0;
      cleared = 0;
      lastPhase = "";
      get("pops").replaceChildren();
      loadStage(0);
      say("Here we go!", 1600);
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
    held.left = held.right = false;
    pointerSteer = 0;
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

  const direction = (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return {
      a: "left",
      ArrowLeft: "left",
      d: "right",
      ArrowRight: "right",
      w: "up",
      ArrowUp: "up",
      s: "down",
      ArrowDown: "down",
    }[key];
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const dir = direction(event);
    if (dir) {
      event.preventDefault();
      keys[dir] = true;
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const dir = direction(event);
    if (dir) keys[dir] = false;
  });

  // Hold a finger (or the mouse) on the left or right of the screen to
  // steer that way.
  let steerPointer = null;
  const steerFrom = (event) => {
    const bounds = canvas.getBoundingClientRect();
    const across = (event.clientX - bounds.left) / bounds.width - 0.5;
    pointerSteer = Math.abs(across) < 0.06 ? 0 : across < 0 ? 1 : -1;
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    steerPointer = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    steerFrom(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === steerPointer) steerFrom(event);
  });
  for (const end of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(end, (event) => {
      if (event.pointerId !== steerPointer) return;
      steerPointer = null;
      pointerSteer = 0;
    });

  // On-screen ◀ ▶ buttons, shown on touch screens.
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  for (const button of dialog.querySelectorAll("[data-steer]")) {
    const side = button.dataset.steer === "1" ? "left" : "right";
    const hold = (on) => (event) => {
      event.preventDefault();
      if (on && state !== "playing") return;
      held[side] = on;
      if (on) button.setPointerCapture?.(event.pointerId);
    };
    button.addEventListener("pointerdown", hold(true));
    for (const end of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(end, hold(false));
  }

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

  const scene = createBackyardFlingScene(canvas, avatar);
  yard = createYard(0);
  scene.build(yard.pieces);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Loop, steer and fling!";
  get("details").textContent =
    `Your critter's car zooms round the loop, then the track turns into a wide ramp. Steer left and right to aim, fly off the end, and roll across the picnic table to knock the towers of wooden blocks down! You get ${settings.cars} cars for each of the ${STAGES_PER_ROUND} yards.${best ? ` Your best: ${best} blocks.` : ""}`;
  get("play").focus();
}
