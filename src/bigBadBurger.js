import preview from "./assets/modes/big-bad-burger.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createBigBadBurgerScene } from "./bigBadBurgerScene.js";
import {
  burgerLevel,
  createStack,
  drop,
  lean,
  milestone,
  nextKind,
  slideSpeed,
  slideX,
  stackTop,
} from "../shared/bigBadBurger.js";
import "./bigBadBurger.css";

const TITLE = "Big Bad Burger";
const HOW_TO =
  "Build the tallest burger in town! The next ingredient slides back and forth above the burger. Press Space (or tap / click anywhere) to drop it. Land it right on top for a Perfect drop. If the stack leans too far one way it topples over, so drop the next pieces back the other way to balance it. It speeds up as it grows. On a controller, press A to drop.";
const HOVER = 1.05; // how high above the stack the ingredient slides
const DROP_SPEED = 2; // starting fall speed
const FALL = 16; // falling acceleration (a bit snappier than real gravity)
const NEXT_DELAY = 0.25; // pause after a landing before the next slides in
const END_DELAY = 2.8; // let the burger finish falling before the results
const EMOJI = {
  patty: "🥩",
  cheese: "🧀",
  tomato: "🍅",
  lettuce: "🥬",
  onion: "🧅",
  pickles: "🥒",
  bacon: "🥓",
  bun: "🍞",
};
const LABEL = {
  patty: "Patty",
  cheese: "Cheese",
  tomato: "Tomato",
  lettuce: "Lettuce",
  onion: "Onion",
  pickles: "Pickles",
  bacon: "Bacon",
};

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
  const noise = (volume, length, from, to = from, start = 0) => {
    if (audio?.state !== "running") return;
    const at = audio.currentTime + start;
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
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  };
  // Squishy, heavy, crunchy: each ingredient lands with its own sound.
  const LAND = {
    patty: [110, 0.2, 500],
    cheese: [300, 0.08, 1400],
    tomato: [220, 0.12, 900],
    lettuce: [500, 0.1, 2600],
    onion: [380, 0.09, 1800],
    pickles: [420, 0.08, 2000],
    bacon: [260, 0.1, 1600],
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    drop: () => tone(520, 0, 0.12, "sine", 0.05, 300),
    land: (kind) => {
      const [f, len, n] = LAND[kind] ?? LAND.patty;
      tone(f, 0, len + 0.05, "triangle", 0.12, f * 0.6);
      noise(0.12, len, n, n * 0.5);
    },
    perfect: (streak) => {
      const scale = [523, 587, 659, 698, 784, 880, 988, 1047];
      const f = scale[Math.min(scale.length - 1, streak - 1)];
      tone(f, 0.04, 0.22, "triangle", 0.09);
      tone(f * 1.5, 0.11, 0.26, "triangle", 0.07);
    },
    wobbly: () => tone(300, 0, 0.35, "sine", 0.05, 360),
    cheer: () =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.09, 0.22, "square", 0.04),
      ),
    crash: () => {
      tone(180, 0, 0.7, "sawtooth", 0.06, 60);
      noise(0.25, 0.5, 900, 200, 0.15);
      noise(0.2, 0.4, 600, 150, 0.55);
    },
  };
}

export function installBigBadBurger(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "bigbadburger";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A tall, wobbly burger stacked on a plate on a diner counter under a neon sign" draggable="false"></span><strong>${TITLE}</strong><small>Drop patties, cheese and more as they slide by. Stack it sky-high before it topples!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel());
}

function open(level) {
  document.exitPointerLock?.();
  const settings = burgerLevel(level);
  const bestKey = `big-bad-burger-best-${level}`;
  let best = 0;
  let bestY = 0;
  try {
    [best, bestY] = (localStorage.getItem(bestKey) || "0,0")
      .split(",")
      .map((n) => Math.max(0, Number(n) || 0));
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "big-bad-burger";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="bb-field">
      <canvas aria-label="A burger on a plate on a diner counter, with the next ingredient sliding back and forth above it"></canvas>
      <div class="bb-next" data-next hidden><small>NEXT</small><span data-next-icon></span></div>
      <div class="bb-pops" data-pops aria-hidden="true"></div>
      <section class="bb-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="bb-keys">Space, Enter, click or tap to drop · Controller: A</small>
      </section>
    </div>
    <footer>
      <div class="bb-hud"><span data-height></span><span data-streak></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".bb-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let phase = "slide"; // slide | falling | wait | toppling | done
  let stack = createStack();
  let kind = nextKind("");
  let upNext = nextKind(kind);
  let travel = 0;
  let item = null; // { x, y, vy }
  let perfects = 0;
  let streak = 0;
  let bestStreak = 0;
  let wasWobbly = false;
  let waitUntil = 0;
  let t = 0;
  let frame;
  let previous = 0;
  let messageTimer;
  let leanNow = { amount: 0, side: 0 };

  const height = () => stack.length - 1;

  function hud() {
    const n = height();
    get("height").textContent = `🍔 ${n}`;
    get("height").setAttribute(
      "aria-label",
      `${n} layer${n === 1 ? "" : "s"} tall`,
    );
    get("height").classList.toggle(
      "bb-wobbly",
      leanNow.amount > 0.7 && state === "playing",
    );
    get("streak").textContent = streak > 1 ? `✨ ${streak} perfect` : "";
    get("next-icon").textContent = EMOJI[upNext];
    get("next").setAttribute("aria-label", `Next: ${LABEL[upNext]}`);
  }

  function say(text, hold = 2200) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function pop(text, big) {
    const at = scene.topScreen();
    const el = document.createElement("span");
    el.className = `bb-pop${big ? " big" : ""}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // A new ingredient starts at one edge, alternating sides.
  function serve() {
    const r = settings.range;
    travel = height() % 2 ? r : -r;
    item = { x: slideX(level, travel), y: stackTop(stack) + HOVER, vy: 0 };
    scene.setHeld(kind);
    phase = "slide";
    hud();
  }

  function dropIt() {
    if (state !== "playing" || phase !== "slide") return;
    phase = "falling";
    item.vy = -DROP_SPEED;
    sfx.drop();
  }

  function land() {
    const placed = kind;
    const result = drop(stack, placed, item.x, level);
    if (result.fell?.missed) {
      stack.pop();
      scene.tumble(item);
      item = null;
      sfx.crash();
      say("Whoops! It slid right off the burger!", 0);
      return gameOver();
    }
    scene.setHeld("");
    scene.landed(result.perfect);
    item = null;
    sfx.land(placed);
    if (result.fell) {
      scene.topple(result.fell);
      stack.length = result.fell.index; // only what's still standing counts
      sfx.crash();
      say("Timber! The burger toppled over!", 0);
      return gameOver();
    }
    const n = height();
    if (result.perfect) {
      perfects++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      sfx.perfect(streak);
      pop(streak > 1 ? `Perfect ×${streak}!` : "Perfect!", streak > 2);
    } else {
      streak = 0;
      pop("+1");
    }
    leanNow = lean(stack, settings.grip);
    const cheer = milestone(n);
    if (cheer) {
      sfx.cheer();
      say(cheer, 2400);
      pop(cheer, true);
    } else if (leanNow.amount > 0.7 && !wasWobbly) {
      sfx.wobbly();
      say(
        `Whoa, it's wobbly! Drop the next one a bit to the ${leanNow.side > 0 ? "left" : "right"}.`,
        2600,
      );
    } else if (n === 1 && !result.perfect)
      say("Nice! Try to land the next one right on top.", 2200);
    wasWobbly = leanNow.amount > 0.7;
    kind = upNext;
    upNext = nextKind(kind);
    phase = "wait";
    waitUntil = t + NEXT_DELAY;
    hud();
  }

  function gameOver() {
    scene.finish(); // the camera pulls back to show the whole burger
    phase = "toppling";
    waitUntil = t + END_DELAY;
    leanNow = { amount: 0, side: 0 };
    get("next").hidden = true;
    hud();
  }

  function step(dt) {
    t += dt;
    if (phase === "slide") {
      travel += slideSpeed(level, height() + 1) * dt;
      item.x = slideX(level, travel);
      item.y = stackTop(stack) + HOVER;
    } else if (phase === "falling") {
      item.vy -= FALL * dt;
      item.y += item.vy * dt;
      if (item.y <= stackTop(stack)) {
        item.y = stackTop(stack);
        land();
      }
    } else if (phase === "wait" && t >= waitUntil) serve();
    else if (phase === "toppling" && t >= waitUntil) {
      phase = "done";
      finish();
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    scene.draw(state === "paused" ? 0 : dt, { item, lean: leanNow });
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    scene.finish();
    const n = height();
    const tall = stackTop(stack);
    const previousBest = best;
    if (n > best) {
      best = n;
      bestY = tall;
      try {
        localStorage.setItem(bestKey, `${best},${bestY.toFixed(3)}`);
      } catch {}
    }
    scene.setBest(bestY);
    results.show(
      n
        ? `Your burger was ${n} layer${n === 1 ? "" : "s"} tall!`
        : "Oops, nothing stacked!",
      n > previousBest && previousBest > 0
        ? "That's a new best! What a big bad burger."
        : n && n === previousBest
          ? "That ties your best!"
          : n < previousBest
            ? `Your best: ${previousBest} layers. Keep it balanced to beat it!`
            : "Drop each piece right on top of the last one to keep it steady.",
      [
        [n, "LAYERS"],
        [perfects, "PERFECT DROPS"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      t = 0;
      stack = createStack();
      kind = nextKind("");
      upNext = nextKind(kind);
      perfects = streak = bestStreak = 0;
      wasWobbly = false;
      leanNow = { amount: 0, side: 0 };
      scene.reset(stack);
      scene.setBest(bestY);
      get("pops").replaceChildren();
      get("next").hidden = false;
      serve();
      say(
        touch
          ? "Tap to drop it on the bun!"
          : "Press Space (or click) to drop it on the bun!",
        0,
      );
    }
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

  function pause() {
    if (state !== "playing") return;
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

  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    if (
      event.key === " " ||
      event.key === "Enter" ||
      event.key === "ArrowDown" ||
      event.key.toLowerCase?.() === "s"
    ) {
      event.preventDefault();
      if (!event.repeat) {
        if (
          get("message").textContent.startsWith("Press") ||
          get("message").textContent.startsWith("Tap")
        )
          say("");
        dropIt();
      }
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (
      get("message").textContent.startsWith("Press") ||
      get("message").textContent.startsWith("Tap")
    )
      say("");
    dropIt();
  });

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

  const scene = createBigBadBurgerScene(canvas);
  scene.reset(stack);
  scene.setBest(bestY);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Stack it sky-high!";
  get("details").textContent =
    `Patties, cheese, tomatoes and more slide back and forth above the burger. Drop each one right on top. If it leans too far, the whole thing topples!${best ? ` Your best: ${best} layers.` : ""}`;
  get("play").focus();
}
