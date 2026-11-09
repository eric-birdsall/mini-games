import preview from "./assets/modes/food-finder.jpg";
import voiceURL from "./assets/food/voice.mp3";
import voiceMap from "./assets/food/voice.json";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { nearest } from "./padBridge.js";
import { createFoodFinderScene } from "./foodFinderScene.js";
import {
  HINT_AFTER_MISSES,
  PRAISE,
  askLine,
  doneLine,
  foodById,
  foodLevel,
  pickTarget,
  replacementFood,
  otherLine,
  praiseLine,
  rng,
  startingFoods,
} from "../shared/foodFinder.js";
import "./foodFinder.css";

const HOW_TO =
  "Lots of yummy foods are spread out on a picnic blanket. The card at the top shows the one to find; tap it to hear it again. Tap the matching food on the blanket. If you tap a different food, it'll tell you what it is, so keep looking! Arrow keys or WASD move a blue ring between foods, and Space picks.";
// Seconds from a find to the replacement food dropping in, and to the next
// food to find.
const DROP_AFTER = 0.8;
const NEXT_AFTER = 1.7;
// Seconds without a find before the food starts to hop.
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
    drop: () => tone(330, 0, 0.12, "triangle", 0.06, 500),
    done: () =>
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
        tone(f, i * 0.11, 0.3, "triangle", 0.09),
      ),
  };
}

// Speaks a line ({text, keys}). The recorded voice when its clips are
// loaded (Kokoro, see tools/make_food_voice.py); until then, or if they
// can't load, the browser's own speech reads the text.
function speaker(audio) {
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

  let clips = null;
  let playing = [];
  if (audio)
    fetch(voiceURL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((bytes) => audio.decodeAudioData(bytes))
      .then((buffer) => (clips = buffer))
      .catch(() => {});

  function hush() {
    for (const source of playing)
      try {
        source.stop();
      } catch {}
    playing = [];
    synth?.cancel();
  }

  function playClips(keys) {
    let at = audio.currentTime + 0.05;
    for (const key of keys) {
      const [start, length] = voiceMap[key];
      const source = audio.createBufferSource();
      source.buffer = clips;
      source.connect(audio.destination);
      source.start(at, Math.max(0, start - 0.04), length + 0.1);
      playing.push(source);
      at += length + 0.14;
    }
  }

  return {
    say({ text, keys }) {
      hush();
      if (clips && audio.state === "running" && keys.every((k) => voiceMap[k]))
        return playClips(keys);
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
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Foods spread out on a picnic blanket" draggable="false"></span><strong>Food Finder</strong><small>Lots of yummy foods on a picnic blanket. Can you find the one on the card?</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel());
}

function formatTime(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function open(level) {
  document.exitPointerLock?.();
  const settings = foodLevel(level);
  const bestKey = `food-finder-best-${level}`;
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(bestKey));
    if (Number.isFinite(saved) && saved > 0) best = saved;
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "food-finder";
  dialog.setAttribute("aria-label", "Food Finder");
  dialog.innerHTML = `
    <header><strong>Food Finder</strong><div><button data-exit>Back to games</button></div></header>
    <div class="finder-field">
      <canvas aria-label="Foods spread out on a picnic blanket"></canvas>
      <button class="finder-card" data-card hidden aria-label="Hear it again">
        <span class="finder-find">Find</span>
        <img data-card-img alt="" draggable="false">
        <strong data-card-name></strong>
        <span class="finder-again" aria-hidden="true">🔊</span>
      </button>
      <ol class="finder-basket" data-basket hidden aria-label="Foods found"></ol>
      <section class="finder-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="finder-modes"><button class="primary" data-play disabled>Loading…</button></div>
        <small class="finder-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Food Finder", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".finder-panel");
  const card = get("card");
  const sfx = sounds();
  const voice = speaker(sfx.audio);

  // ready: start panel. playing: looking. cheering: a find being
  // celebrated. paused. finished: results showing.
  let state = "ready";
  let pausedFrom = null;
  let random = rng(1);
  let onBlanket = [];
  let target = null;
  let recent = [];
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

  function ask() {
    target = pickTarget(onBlanket, recent, random);
    recent = [target, ...recent].slice(0, 6);
    misses = 0;
    sinceFind = 0;
    scene.hint(-1);
    get("card-img").src = scene.thumbnail(target);
    get("card-name").textContent = foodById(target).name;
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

  function choose(slot) {
    if (state !== "playing" || slot < 0) return;
    const id = scene.slotFood(slot);
    if (!id) return;
    if (id === target) {
      state = "cheering";
      finds++;
      sfx.found();
      scene.found(slot);
      basket();
      say(praiseLine(Math.floor(random() * PRAISE.length), id));
      if (finds >= settings.finds) {
        later(NEXT_AFTER, finish);
        return;
      }
      later(DROP_AFTER, () => {
        onBlanket = onBlanket.filter((food) => food !== id);
        const next = replacementFood([...onBlanket, id], random);
        if (next) {
          scene.place(slot, next, { drop: true });
          onBlanket.push(next);
          sfx.drop();
        }
      });
      later(NEXT_AFTER, ask);
    } else {
      // Not that one: say what it is, then ask again. No penalty.
      misses++;
      sfx.other();
      scene.wiggle(slot);
      card.classList.remove("nudge");
      void card.offsetWidth;
      card.classList.add("nudge");
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
      // Start near the middle of the blanket.
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
    const record = !best || elapsed < best;
    if (record) {
      best = elapsed;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    sfx.done();
    voice.say(doneLine(settings.finds));
    results.show(
      record ? "Super finder!" : "You found them all!",
      record
        ? `All ${settings.finds} foods found in ${formatTime(elapsed)}, your fastest yet!`
        : `All ${settings.finds} foods found. Your fastest is ${formatTime(best)}.`,
      [
        [String(settings.finds), "FOUND"],
        [formatTime(elapsed), "TIME"],
        [formatTime(best), "BEST"],
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
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    if (reset) {
      finds = 0;
      // Empty basket first: its size sets the room left for foods.
      basket();
      measure();
      random = rng((Math.random() * 2 ** 32) >>> 0);
      elapsed = 0;
      timers = [];
      recent = [];
      cursor = -1;
      onBlanket = startingFoods(settings.count, random);
      scene.layout(onBlanket.length, random);
      onBlanket.forEach((id, slot) => scene.place(slot, id));
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

  // Keep the foods clear of the card and basket, which size with the screen.
  function measure() {
    if (card.hidden) return;
    scene.setInsets(
      card.getBoundingClientRect().bottom + 6,
      canvas.clientHeight - get("basket").getBoundingClientRect().top,
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
    "Food Finder",
    () => start(true),
    () => dialog.close(),
  );
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
    if (event.target === card && (event.key === " " || event.key === "Enter"))
      return;
    const key = event.key.toLowerCase();
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
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    // Tapping hides the keyboard ring; it comes back with the arrows.
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
  get("heading").textContent = "Picnic time!";
  get("details").textContent =
    `${settings.count} yummy foods are spread out on the blanket. Look at the card, then tap the food that matches! Find ${settings.finds} to finish.${best ? ` Your fastest: ${formatTime(best)}.` : ""}`;
  get("keys").textContent = "Tap a food · or arrows / WASD and Space";
  scene.ready.then(() => {
    if (!dialog.open) return;
    const play = get("play");
    play.disabled = false;
    play.textContent = "Play";
    play.focus();
  });
}
