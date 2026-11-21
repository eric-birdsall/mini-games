import preview from "./assets/modes/look-and-find.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { nearest } from "./padBridge.js";
import { createFoodFinderScene } from "./foodFinderScene.js";
import {
  THEMES,
  objectById,
  LEVELS,
  makeRound,
  rng,
} from "../shared/lookAndFind.js";
const HINT_AFTER_MISSES = 3;
const PRAISE = [
  "Great spotting!",
  "You found it!",
  "Wonderful looking!",
  "Well done!",
];
const line = (text) => ({ text });
const askLine = (id) => line(`Can you find the ${objectById(id).name}?`);
const praiseLine = (index, id) =>
  line(`${PRAISE[index]} You found the ${objectById(id).name}!`);
const otherLine = (id, target) =>
  line(
    `That's the ${objectById(id).name}. Can you find the ${objectById(target).name}?`,
  );
const doneLine = (count) =>
  line(`You found all ${count} hidden things! Great job!`);
import "./foodFinder.css";

const HOW_TO =
  "Explore the picture and find the hidden things. Choose One at a time for a big picture clue, or Picture checklist to find things in any order. Tap a clue to hear it. Arrows or WASD move the blue ring; Space or controller A picks. R repeats the clue, H asks for a hint. The whole picture fits on the screen. There is no time limit or penalty.";
const NEXT_AFTER = 1.1;
// Seconds without a find before a gentle automatic hint.
const IDLE_HINT = 14;

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
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    found: () =>
      [784, 988, 1175, 1568].forEach((f, i) =>
        tone(f, i * 0.08, 0.22, "triangle", 0.09),
      ),
    // Soft, curious: "hmm, not that one". Never a buzz.
    other: () => tone(520, 0, 0.18, "sine", 0.07, 660),
    done: () =>
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
        tone(f, i * 0.11, 0.3, "triangle", 0.09),
      ),
  };
}

// Browser speech reads every new object name; picture clues also work silently.
function speaker() {
  const synth = window.speechSynthesis;
  let voice;
  const chooseVoice = () => {
    const voices = synth?.getVoices() || [];
    const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
    voice =
      english.find((v) => /samantha|natural|aria|jenny|female/i.test(v.name)) ||
      english.find((v) => v.localService) ||
      english[0];
  };
  chooseVoice();
  synth?.addEventListener?.("voiceschanged", chooseVoice);

  const hush = () => synth?.cancel();

  return {
    say({ text }) {
      hush();
      if (!synth) return;
      const line = new SpeechSynthesisUtterance(text);
      if (voice) line.voice = voice;
      line.rate = 0.9;
      line.pitch = 1.1;
      synth.speak(line);
    },
    hush,
    stop() {
      hush();
      synth?.removeEventListener?.("voiceschanged", chooseVoice);
    },
  };
}

export function installFoodFinder(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "foodfinder";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Look &amp; Find gameplay: a woodland picture full of animals, toys and everyday things, with a picture clue asking for the hedgehog" draggable="false"></span><strong>Look &amp; Find</strong><small>Explore playful pictures. Find animals, toys, and hidden surprises.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel());
}

function open(level) {
  document.exitPointerLock?.();
  const settings = LEVELS[level] || LEVELS.normal;
  let themeId = "woodland";
  let mode = "single";
  let targets = [];
  let foundIds = new Set();

  const dialog = document.createElement("dialog");
  dialog.className = "food-finder";
  dialog.setAttribute("aria-label", "Look & Find");
  dialog.innerHTML = `
    <header><strong>Look &amp; Find</strong><div><button data-exit>Back to games</button></div></header>
    <div class="finder-field">
      <canvas aria-label="An illustrated scene with hidden animals, toys, and everyday objects"></canvas>
      <button class="finder-card" data-card hidden aria-label="Hear it again">
        <span class="finder-find">Find</span>
        <img data-card-img alt="" draggable="false">
        <strong data-card-name></strong>
        <span class="finder-again" aria-hidden="true">🔊</span>
      </button>
      <div class="finder-checklist" data-checklist hidden aria-label="Picture checklist"></div>
      <ol class="finder-basket" data-basket hidden aria-label="Objects found"></ol>
      <section class="finder-panel">
        <h2 data-heading></h2><p data-details></p>
        <fieldset class="finder-options"><legend>Pick a place</legend>${THEMES.map((theme) => `<button data-theme="${theme.id}" aria-pressed="${theme.id === themeId}">${theme.name}</button>`).join("")}</fieldset>
        <fieldset class="finder-options"><legend>How shall we look?</legend><button data-mode="single" aria-pressed="true">One at a time</button><button data-mode="checklist" aria-pressed="false">Picture checklist</button></fieldset>
        <div class="finder-modes"><button class="primary" data-play disabled>Loading…</button></div>
        <small class="finder-keys" data-keys></small><small class="finder-credit">Illustrations: <a href="https://github.com/jdecked/twemoji/tree/v15.1.0" target="_blank" rel="noopener">Twemoji</a> by Twitter and contributors · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-hint hidden>Hint / H</button>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Look & Find", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".finder-panel");
  const card = get("card");
  const sfx = sounds();
  const voice = speaker();

  // ready: start panel. playing: looking. cheering: a find being
  // celebrated. paused. finished: results showing.
  let state = "ready";
  let pausedFrom = null;
  let random = rng(1);
  let sceneObjects = [];
  let target = null;
  let finds = 0;
  let misses = 0;
  let elapsed = 0;
  let sinceFind = 0;
  let cursor = -1;
  let timers = [];
  let previous = 0;
  let frame;
  let messageTimer;
  // Controller: stick / D-pad move the ring, A picks (padBridge).
  dialog.padPlaying = () => state === "playing" || state === "cheering";

  // Speak a line and show its words.
  function say(line) {
    get("message").textContent = line.text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (get("message").textContent = ""), 4000);
    voice.say(line);
  }

  const later = (seconds, fn) => timers.push({ at: elapsed + seconds, fn });

  function basket() {
    const list = get("basket");
    list.replaceChildren(
      ...Array.from({ length: settings.finds }, (_, i) => {
        const item = document.createElement("li");
        if (i < finds) item.classList.add("full");
        return item;
      }),
    );
  }

  function checklist() {
    get("checklist").replaceChildren(
      ...targets.map((id) => {
        const button = document.createElement("button");
        const found = foundIds.has(id);
        button.className = found ? "is-found" : "";
        button.setAttribute(
          "aria-label",
          `${objectById(id).name}${found ? ", found" : ", hear clue"}`,
        );
        button.disabled = found;
        button.innerHTML = `<img src="${scene.thumbnail(id)}" alt="" draggable="false"><span>${objectById(id).name}</span>${found ? '<b aria-hidden="true">✓</b>' : ""}`;
        button.onclick = () => {
          target = id;
          prompt();
          canvas.focus({ preventScroll: true });
        };
        return button;
      }),
    );
  }
  function ask() {
    target = targets.find((id) => !foundIds.has(id));
    misses = 0;
    sinceFind = 0;
    scene.hint(-1);
    get("card-img").src = scene.thumbnail(target);
    get("card-name").textContent = objectById(target).name;
    card.classList.remove("pop");
    void card.offsetWidth;
    card.classList.add("pop");
    state = "playing";
    prompt();
  }
  const prompt = () => say(askLine(target));
  function slotOf(id) {
    for (let i = 0; i < scene.slotCount; i++)
      if (scene.slotFood(i) === id) return i;
    return -1;
  }
  function help() {
    if (state !== "playing") return;
    scene.hint(slotOf(target));
    prompt();
    canvas.focus({ preventScroll: true });
  }
  function choose(slot) {
    if (state !== "playing" || slot < 0) return;
    const id = scene.slotFood(slot);
    if (!id) return;
    if (
      mode === "checklist"
        ? targets.includes(id) && !foundIds.has(id)
        : id === target
    ) {
      state = "cheering";
      finds++;
      foundIds.add(id);
      sfx.found();
      scene.found(slot);
      basket();
      checklist();
      say(praiseLine(Math.floor(random() * PRAISE.length), id));
      later(NEXT_AFTER, finds >= targets.length ? finish : ask);
    } else {
      misses++;
      sfx.other();
      scene.wiggle(slot);
      say(otherLine(id, target));
      if (misses >= HINT_AFTER_MISSES) scene.hint(slotOf(target));
    }
  }

  function moveCursor(dir) {
    if (state !== "playing" && state !== "cheering") return;
    const spots = [];
    for (let i = 0; i < scene.slotCount; i++) {
      const at = scene.screenOf(i);
      spots.push(at || { x: Infinity, y: Infinity });
    }
    let from = cursor >= 0 ? scene.screenOf(cursor) : null;
    if (!from) {
      // Start near the middle of the scene.
      from = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      let closest = -1;
      let distance = Infinity;
      spots.forEach((s, i) => {
        const d = Math.hypot(s.x - from.x, s.y - from.y);
        if (d < distance) {
          distance = d;
          closest = i;
        }
      });
      cursor = closest;
    } else {
      const next = nearest(from, spots, dir);
      if (next >= 0) cursor = next;
    }
    scene.cursor(cursor);
  }

  function step(dt) {
    if (state !== "playing" && state !== "cheering") return;
    elapsed += dt;
    if (state === "playing") {
      sinceFind += dt;
      if (sinceFind >= IDLE_HINT && misses < HINT_AFTER_MISSES) {
        misses = HINT_AFTER_MISSES;
        scene.hint(slotOf(target));
        prompt();
      }
    }
    const due = timers.filter((timer) => timer.at <= elapsed);
    timers = timers.filter((timer) => timer.at > elapsed);
    for (const timer of due) timer.fn();
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    step(dt);
    scene.draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    scene.cursor(-1);
    card.hidden = true;
    get("pause").hidden = true;
    get("hint").hidden = true;
    get("checklist").hidden = true;
    sfx.done();
    voice.say(doneLine(settings.finds));
    results.show(
      "You found them all!",
      `All ${targets.length} hidden things found in ${THEMES.find((t) => t.id === themeId).name}. Wonderful looking!`,
      [
        [String(finds), "FOUND"],
        ["★", "SUPER FINDER"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    card.hidden = false;
    get("basket").hidden = false;
    get("pause").hidden = false;
    get("hint").hidden = false;
    get("checklist").hidden = mode !== "checklist";
    card.hidden = mode === "checklist";
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    if (reset) {
      finds = 0;
      // Measure the clue tray before laying out the picture.
      basket();
      measure();
      random = rng((Math.random() * 2 ** 32) >>> 0);
      elapsed = 0;
      timers = [];
      cursor = -1;
      const round = makeRound(themeId, level, random);
      sceneObjects = round.objects;
      targets = round.targets;
      foundIds = new Set();
      checklist();
      measure();
      scene.layout(sceneObjects.length, random, themeId);
      sceneObjects.forEach((id, slot) => scene.place(slot, id));
      ask();
    } else {
      state = pausedFrom || "playing";
      if (state === "playing") prompt();
    }
    pausedFrom = null;
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  // Keep objects clear of the clue tray and progress dots.
  function measure() {
    const field = canvas.getBoundingClientRect();
    const clue = mode === "checklist" ? get("checklist") : card;
    scene.setInsets(
      Math.max(80, clue.getBoundingClientRect().bottom - field.top + 14),
      canvas.clientWidth <= 700 ? 130 : 110,
    );
  }

  function pause() {
    if (state !== "playing" && state !== "cheering") return;
    pausedFrom = state;
    state = "paused";
    voice.hush();
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Look & Find",
    () => start(true),
    () => dialog.close(),
  );
  dialog.querySelectorAll("[data-theme]").forEach((button) => {
    button.onclick = () => {
      themeId = button.dataset.theme;
      dialog
        .querySelectorAll("[data-theme]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      scene.layout(0, rng(1), themeId);
    };
  });
  dialog.querySelectorAll("[data-mode]").forEach((button) => {
    button.onclick = () => {
      mode = button.dataset.mode;
      dialog
        .querySelectorAll("[data-mode]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    };
  });
  get("hint").onclick = help;
  get("play").onclick = () => start(true);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  card.onclick = () => {
    if (state === "playing") prompt();
    canvas.focus({ preventScroll: true });
  };
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing" || state === "cheering") pause();
    else dialog.close();
  });

  const moves = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing" && state !== "cheering") return;
    if (
      event.target.closest("button") &&
      (event.key === " " || event.key === "Enter")
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "r") {
      event.preventDefault();
      prompt();
      return;
    }
    if (key === "h") {
      event.preventDefault();
      help();
      return;
    }
    if (moves[key]) {
      event.preventDefault();
      moveCursor(moves[key]);
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      if (!event.repeat && cursor >= 0) choose(cursor);
      else if (cursor < 0) moveCursor("up");
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    cursor = -1;
    scene.cursor(-1);
    choose(scene.pick(event.clientX, event.clientY));
  });

  window.addEventListener("blur", pause);
  window.addEventListener("resize", measure);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    window.removeEventListener("blur", pause);
    window.removeEventListener("resize", measure);
    voice.stop();
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createFoodFinderScene(canvas);
  dialog.showModal();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Little things. Big discoveries.";
  get("details").textContent =
    "A big picture full of surprises! Take your time and find the hidden things.";
  get("keys").textContent =
    "Tap to find · Arrows + Space · R to hear a clue · H for a hint";
  scene.ready
    .then(() => {
      if (!dialog.open) return;
      const play = get("play");
      play.disabled = false;
      play.textContent = "Play";
      play.focus();
    })
    .catch(() => {
      get("details").textContent =
        "The pictures could not load. Please close the game and try again.";
      get("play").textContent = "Pictures unavailable";
    });
}
