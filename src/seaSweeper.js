import preview from "./assets/modes/sea-sweeper.svg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createSeaSweeperScene } from "./seaSweeperScene.js";
import {
  BIN,
  BUCKET,
  DROP_RADIUS,
  SHELL_KINDS,
  TIDES,
  TOTAL_TRASH,
  WAVE,
  itemName,
  newGame,
  shellCount,
  stars,
  step as stepGame,
  tideTime,
} from "../shared/seaSweeper.js";
import { avatarChoice } from "../shared/avatars.js";
import "./seaSweeper.css";

const HOW_TO = `Each tide washes up trash and seashells. Walk up to something to pick it up, then carry it away: trash goes in the green bin, shells go in the pink bucket. You can carry one thing at a time. Each tide has a timer; when it runs out, the next wave washes away whatever is left on the sand. Clear the beach early and the next tide comes in straight away. ${TIDES} tides in all. Your score is the trash you clean up; shells are a bonus collection, and the golden shell is rare! Walk with WASD, the arrow keys or a controller's stick, or drag anywhere on a touch screen.`;

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
  // A wave: filtered noise that swells and fades.
  const wave = () => {
    if (audio?.state !== "running") return;
    const length = 2.4;
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
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, audio.currentTime);
    filter.frequency.linearRampToValueAtTime(1600, audio.currentTime + 1);
    filter.frequency.linearRampToValueAtTime(300, audio.currentTime + length);
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.linearRampToValueAtTime(0.16, audio.currentTime + 1);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    wave,
    pickup: () => tone(440, 0, 0.12, "triangle", 0.1, 660),
    bin: () => {
      tone(180, 0, 0.12, "square", 0.05, 120);
      [523, 659, 784].forEach((f, i) =>
        tone(f, 0.08 + i * 0.07, 0.14, "triangle", 0.08),
      );
    },
    bucket: () =>
      [880, 1175].forEach((f, i) => tone(f, i * 0.06, 0.2, "sine", 0.08)),
    golden: () =>
      [1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, i * 0.07, 0.3, "triangle", 0.08),
      ),
    cleared: () =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.09, 0.24, "triangle", 0.09),
      ),
    timeup: () =>
      [440, 392].forEach((f, i) => tone(f, i * 0.16, 0.24, "triangle", 0.07)),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
  };
}

export function installSeaSweeper(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "seasweeper";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A beach with trash, seashells, a bin and a bucket" draggable="false"></span><strong>Sea Sweeper</strong><small>Clean up the trash the tide leaves behind, and collect seashells for your bucket.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `sea-sweeper-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "sea-sweeper";
  dialog.setAttribute("aria-label", "Sea Sweeper");
  dialog.innerHTML = `
    <header><strong>Sea Sweeper</strong><div><button data-exit>Back to games</button></div></header>
    <div class="sweep-field">
      <canvas aria-label="A beach seen from above, with the sea along the top, a trash bin and a shell bucket"></canvas>
      <div class="sweep-labels" aria-hidden="true">
        <span class="sweep-label bin" data-bin-label>Trash</span>
        <span class="sweep-label bucket" data-bucket-label>Shells</span>
      </div>
      <div class="sweep-words" data-words aria-hidden="true"></div>
      <div class="sweep-pops" data-pops aria-hidden="true"></div>
      <div class="sweep-banner" data-banner aria-live="polite"></div>
      <div class="sweep-hud" data-hud hidden>
        <span data-tide></span>
        <span data-clock></span>
        <span class="trash" data-trash></span>
        <span class="shells" data-shells></span>
        <div class="sweep-timebar" data-timebar role="progressbar" aria-label="Time left this tide" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      </div>
      <div class="sweep-touch" aria-hidden="true"><div class="sweep-stick" data-stick><span></span></div></div>
      <section class="sweep-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="sweep-modes"><button class="primary" data-play>Play</button></div>
        <small class="sweep-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Sea Sweeper", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick walks (W A S D) via padBridge.
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".sweep-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let game = newGame(level, 1);
  let previous = 0;
  let frame;
  let messageTimer;
  let bannerTimer;
  let endTimer;
  const keys = new Set();
  const touch = { id: null, x: 0, z: 0, x0: 0, y0: 0 };

  function hud() {
    get("tide").textContent =
      game.tide < 0
        ? "Tide 1 of " + TIDES
        : `Tide ${game.tide + 1} of ${TIDES}`;
    const secs = Math.ceil(
      game.phase === "open" ? game.clock : tideTime(level),
    );
    const clock = get("clock");
    clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const hurry = game.phase === "open" && game.clock < 8;
    clock.classList.toggle("hurry", hurry);
    // The bar a small child can read: full at the start of a tide, shrinking
    // to nothing as the time runs out (green, then yellow, then red). While a
    // wave rolls in it fills back up.
    const left =
      game.phase === "open"
        ? game.clock / tideTime(level)
        : game.phase === "wave"
          ? Math.min(1, game.waveT / WAVE)
          : 0;
    const bar = get("timebar");
    bar.style.setProperty("--left", left.toFixed(4));
    bar.dataset.level = left > 0.5 ? "plenty" : left > 0.25 ? "half" : "low";
    bar.classList.toggle("hurry", hurry);
    bar.setAttribute("aria-valuenow", String(Math.round(left * 100)));
    get("trash").textContent = `Trash ${game.trash}`;
    get("shells").textContent = `Shells ${shellCount(game.shells)}`;
  }

  function say(text, hold = 2600) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function banner(text, kind = "", hold = 1600) {
    const el = get("banner");
    el.textContent = text;
    el.className = `sweep-banner ${kind}`;
    clearTimeout(bannerTimer);
    if (text) bannerTimer = setTimeout(() => (el.textContent = ""), hold);
  }

  function pop(at, text, kind) {
    const spot = scene.toScreen(at.x, 1.8, at.z);
    const el = document.createElement("span");
    el.className = `sweep-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function input() {
    const held = (...k) => k.some((key) => keys.has(key));
    const axis = (neg, pos) => (held(...pos) ? 1 : 0) - (held(...neg) ? 1 : 0);
    let x = axis(["a", "ArrowLeft"], ["d", "ArrowRight"]);
    let z = axis(["w", "ArrowUp"], ["s", "ArrowDown"]);
    if (touch.id !== null) {
      x += touch.x;
      z += touch.z;
    }
    return { x, z };
  }

  function react(events) {
    for (const e of events) {
      if (e.type === "wave") sfx.wave();
      else if (e.type === "land") {
        const last = e.tide === TIDES - 1;
        banner(last ? "Last tide!" : `Tide ${e.tide + 1}`, "tide");
      } else if (e.type === "washed")
        say(`The wave took back ${plural(e.count, "thing")}.`);
      else if (e.type === "pickup") {
        sfx.pickup();
        if (e.item.kind === "golden")
          say("A golden shell! Take it to the bucket.");
      } else if (e.type === "bin") {
        sfx.bin();
        scene.bump("bin");
        pop(BIN, "+1", "trash");
      } else if (e.type === "bucket") {
        if (e.item.kind === "golden") sfx.golden();
        else sfx.bucket();
        scene.bump("bucket");
        pop(BUCKET, "+1", "shell");
      } else if (e.type === "cleared") {
        sfx.cleared();
        banner("Beach clear!", "good");
      } else if (e.type === "timeup") {
        sfx.timeup();
        if (e.tide < TIDES - 1) say("Time's up! Here comes the next wave.");
      } else if (e.type === "done") {
        state = "ending";
        endTimer = setTimeout(finish, 900);
      }
    }
  }

  // The word for every piece of trash and shell, under it on the sand, and
  // over your head for the one you're carrying, so players get used to
  // reading them.
  const wordTags = new Map(); // item → span (ids repeat between games)
  function words() {
    const box = get("words");
    const live = new Set();
    const show = (item, x, y, z, carried) => {
      live.add(item);
      let tag = wordTags.get(item);
      if (!tag) {
        tag = document.createElement("span");
        tag.className = `sweep-word ${item.type}`;
        tag.textContent = itemName(item);
        box.append(tag);
        wordTags.set(item, tag);
      }
      const at = scene.toScreen(x, y, z);
      tag.style.left = `${at.x}px`;
      tag.style.top = `${at.y}px`;
      tag.classList.toggle("carried", carried);
    };
    if (state !== "finished") {
      for (const item of game.items)
        show(item, item.x, 0, item.z + 0.45, false);
      const held = game.carrying;
      if (held) show(held, game.player.x, 2.5, game.player.z, true);
    }
    for (const [item, tag] of wordTags)
      if (!live.has(item)) {
        tag.remove();
        wordTags.delete(item);
      }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") {
      react(stepGame(game, input(), dt));
      hud();
    }
    scene.draw(state === "paused" ? 0 : dt, game);
    words();
    const below = DROP_RADIUS - 0.35;
    const bin = scene.toScreen(BIN.x, 0, BIN.z + below);
    const bucket = scene.toScreen(BUCKET.x, 0, BUCKET.z + below);
    Object.assign(get("bin-label").style, {
      left: `${bin.x}px`,
      top: `${bin.y}px`,
    });
    Object.assign(get("bucket-label").style, {
      left: `${bucket.x}px`,
      top: `${bucket.y}px`,
    });
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    get("hud").hidden = true;
    keys.clear();
    lift();
    const got = stars(game.trash);
    let record = false;
    if (game.trash > best) {
      best = game.trash;
      record = true;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    sfx.win();
    const titles = [
      "Every bit helps!",
      "Nice sweeping!",
      "Great cleanup!",
      "Spotless beach!",
    ];
    const shellTotal = shellCount(game.shells);
    const kinds = SHELL_KINDS.filter((s) => game.shells[s.id]).map(
      (s) => `${game.shells[s.id]} ${s.name.toLowerCase()}`,
    );
    const detail = `You cleaned up ${game.trash} of ${TOTAL_TRASH} pieces of trash${record ? ". New best!" : best ? `. Your best: ${best}.` : "."}${shellTotal ? ` Your bucket: ${kinds.join(", ")}.` : ""}`;
    results.show(titles[got], detail, [
      [`${game.trash}/${TOTAL_TRASH}`, "TRASH CLEANED"],
      [`${got} / 3`, "STARS"],
      [shellTotal, "SHELLS"],
    ]);
  }

  function start(reset) {
    results.hide();
    if (reset) {
      clearTimeout(endTimer);
      game = newGame(level, (Math.random() * 2 ** 32) >>> 0);
      get("pops").replaceChildren();
      say("Walk up to trash or shells to pick them up!", 3500);
    }
    keys.clear();
    lift();
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("hud").hidden = false;
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
    state = "paused";
    keys.clear();
    lift();
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Sea Sweeper",
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
    else if (state !== "ending") dialog.close();
  });

  const GAME_KEYS = new Set([
    "w",
    "a",
    "s",
    "d",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);
  const keyOf = (event) =>
    event.key.length === 1 ? event.key.toLowerCase() : event.key;
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = keyOf(event);
    if (!GAME_KEYS.has(key)) return;
    event.preventDefault();
    keys.add(key);
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    keys.delete(keyOf(event));
  });

  // Touch (or mouse): press anywhere on the beach for a floating stick.
  const stick = get("stick");
  const knob = stick.querySelector("span");
  const stickRange = 46;
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    touch.id = event.pointerId;
    touch.x0 = event.clientX;
    touch.y0 = event.clientY;
    touch.x = touch.z = 0;
    const bounds = dialog.getBoundingClientRect();
    stick.style.left = `${event.clientX - bounds.left}px`;
    stick.style.top = `${event.clientY - bounds.top}px`;
    stick.classList.add("on");
    knob.style.transform = "";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touch.id) return;
    let dx = event.clientX - touch.x0;
    let dy = event.clientY - touch.y0;
    const d = Math.hypot(dx, dy);
    if (d > stickRange) {
      dx *= stickRange / d;
      dy *= stickRange / d;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const live = d < 8 ? 0 : 1;
    touch.x = (dx / stickRange) * live;
    touch.z = (dy / stickRange) * live;
  });
  function lift(event) {
    if (event && event.pointerId !== touch.id) return;
    touch.id = null;
    touch.x = touch.z = 0;
    stick.classList.remove("on");
  }
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    clearTimeout(bannerTimer);
    clearTimeout(endTimer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createSeaSweeperScene(canvas, avatar);
  dialog.showModal();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Sweep the beach!";
  get("details").textContent =
    `The tide keeps washing things up. Walk up to something to pick it up: trash goes in the green bin, seashells in the pink bucket. Each tide lasts ${tideTime(level)} seconds, then the next wave washes away whatever is left. Clear the beach and the next tide comes early. Clean up as much trash as you can in ${TIDES} tides, and look out for the rare golden shell!${best ? ` Your best: ${best} of ${TOTAL_TRASH}.` : ""}`;
  get("keys").textContent =
    "Walk: WASD, arrow keys or controller stick · Touch: drag anywhere on the beach";
  get("play").focus();
}
