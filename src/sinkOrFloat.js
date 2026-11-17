import preview from "./assets/modes/sink-or-float.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createSinkScene } from "./sinkOrFloatScene.js";
import {
  HOP_TIME,
  POND_ROUNDS,
  SINK_TIME,
  createRun,
  hopTarget,
  land,
  respawn,
  roundStars,
  summary,
} from "../shared/sinkOrFloat.js";
import "./sinkOrFloat.css";

const TITLE = "Sink or Float";
const WIN_TIME = 1.6;
const HOW_TO =
  "Hop across the pond on the stepping stones. Some stones float, but the others sink as soon as you land on them and drop you in the water. Every stone looks the same, so remember which ones sank: they stay gone, and stones that held you get a patch of moss. Hop with WASD or the arrow keys (Space hops forward), tap a stone next to you, or use the arrow buttons. On Xbox, use the left stick or D-pad, and A hops forward. Cross three ponds with as few splashes as you can.";
const KEYS = {
  KeyW: "up",
  ArrowUp: "up",
  Space: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};
const SPLASH_LINES = [
  "Sploosh!",
  "Sinker!",
  "Down it goes!",
  "Glub glub!",
  "Swim back!",
  "Belly flop!",
];
const FLOAT_LINES = ["Floater!", "Solid!", "It holds!"];

export function installSinkOrFloat(getAvatar, audio) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "sinkorfloat";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A critter hopping across a pond on stepping stones while one stone sinks with a splash" draggable="false"></span><strong>${TITLE}</strong><small>Hop the stepping stones across the pond. Floaters hold you. Sinkers dunk you!</small>`;
  games.append(entry);
  entry.onclick = () => open(getAvatar(), audio);
}

function open(avatar, audio) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "sink-float";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <canvas tabindex="-1" aria-label="A pond of stepping stones seen from the near bank"></canvas>
    <header class="sf-hud">
      <div><strong data-round></strong><span data-splashes></span><span data-clock></span></div>
      <button data-pause aria-label="Pause game" hidden>Ⅱ <span>Pause</span></button>
    </header>
    <div class="sf-pop" data-pop aria-hidden="true"></div>
    <section class="sf-overlay">
      <div class="sf-card">
        <p class="sf-label" data-label></p>
        <h2 data-heading></h2>
        <p data-details></p>
        <p class="sf-howto" data-howto></p>
        <div class="sf-actions">
          <button data-play></button>
          <button data-exit>Back to games</button>
        </div>
      </div>
    </section>
    <div class="sf-touch" data-touch hidden>
      <button data-hop="up" aria-label="Hop forward">▲</button>
      <button data-hop="left" aria-label="Hop left">◀</button>
      <button data-hop="down" aria-label="Hop back">▼</button>
      <button data-hop="right" aria-label="Hop right">▶</button>
    </div>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);

  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  const overlay = dialog.querySelector(".sf-overlay");
  const pop = get("pop");
  const scene = createSinkScene(canvas, avatar);

  let state = "ready"; // ready | playing | paused | between | finished
  let index = 0;
  let run = createRun(POND_ROUNDS[0]);
  let results = [];
  let hop = null; // { from, to, t }
  let queued = null;
  let sink = null; // seconds since landing on a sinker
  let sinkId = 0;
  let won = null;
  let frame;
  let previous = performance.now();
  let popTimer = 0;
  scene.build(run);

  const results$ = gameResults(
    dialog,
    TITLE,
    () => {
      results$.hide();
      startGame();
    },
    () => dialog.close(),
  );

  const formatTime = (t) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  function hud() {
    get("round").textContent =
      `Pond ${index + 1} / ${POND_ROUNDS.length} · ${POND_ROUNDS[index].name}`;
    const splashes = `💦 ${run.splashes}`;
    if (get("splashes").textContent !== splashes)
      get("splashes").textContent = splashes;
    const clock = `⏱ ${formatTime(run.time)}`;
    if (get("clock").textContent !== clock) get("clock").textContent = clock;
  }

  function say(text, kind) {
    const spot = scene.playerOnScreen();
    pop.textContent = text;
    pop.className = `sf-pop show ${kind}`;
    pop.style.left = `${spot.x}px`;
    pop.style.top = `${spot.y}px`;
    popTimer = 1.1;
  }

  function showCard(label, heading, details, button, howto = "") {
    overlay.hidden = false;
    get("pause").hidden = true;
    get("touch").hidden = true;
    get("label").textContent = label;
    get("heading").textContent = heading;
    get("details").textContent = details;
    get("howto").textContent = howto;
    get("howto").hidden = !howto;
    get("play").textContent = button;
    get("play").focus({ preventScroll: true });
  }

  function tryHop(dir) {
    if (state !== "playing" || sink != null || won != null) return;
    if (hop) {
      queued = dir;
      return;
    }
    const to = hopTarget(run, dir);
    if (!to) return;
    hop = { from: { ...run.player }, to, t: 0 };
    audio?.tone(380, 0.12, 0, 0.05);
  }

  function arrive() {
    const result = land(run, hop.to);
    hop = null;
    if (result === "sink") {
      queued = null;
      sink = 0;
      sinkId++;
      audio?.tone(150, 0.25, 0, 0.06);
      say(SPLASH_LINES[(run.splashes - 1) % SPLASH_LINES.length], "sink");
    } else if (result === "goal") {
      queued = null;
      won = 0;
      audio?.sparkle();
      say("Made it!", "goal");
    } else {
      if (result === "float") {
        audio?.tone(720, 0.08, 0, 0.05);
        if (Math.random() < 0.35)
          say(
            FLOAT_LINES[Math.floor(Math.random() * FLOAT_LINES.length)],
            "float",
          );
      }
      if (queued) {
        const next = queued;
        queued = null;
        tryHop(next);
      }
    }
  }

  function update(dt) {
    run.time += dt;
    if (hop) {
      hop.t += dt;
      if (hop.t >= HOP_TIME) arrive();
    }
    if (sink != null) {
      const before = sink;
      sink += dt;
      if (before < 0.3 && sink >= 0.3) audio?.splash();
      if (sink >= SINK_TIME) {
        sink = null;
        respawn(run);
      }
    }
    if (won != null) {
      won += dt;
      if (won >= WIN_TIME) finishRound();
    }
  }

  function tick(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") update(dt);
    if (popTimer > 0 && (popTimer -= dt) <= 0) pop.classList.remove("show");
    scene.draw(dt, {
      run,
      hop: hop && {
        from: hop.from,
        to: hop.to,
        f: Math.min(1, hop.t / HOP_TIME),
      },
      sink,
      sinkId,
      won,
    });
    hud();
    frame = requestAnimationFrame(tick);
  }

  function startRound(next) {
    index = next;
    run = createRun(POND_ROUNDS[index]);
    hop = queued = sink = won = null;
    scene.build(run);
    resume();
  }

  function startGame() {
    results = [];
    startRound(0);
  }

  function finishRound() {
    won = null;
    results.push({ splashes: run.splashes, time: run.time });
    const stars =
      "★".repeat(roundStars(run.splashes)) +
      "☆".repeat(3 - roundStars(run.splashes));
    if (index + 1 < POND_ROUNDS.length) {
      state = "between";
      showCard(
        `Pond ${index + 1} crossed · ${stars}`,
        run.splashes
          ? `${run.splashes} ${run.splashes === 1 ? "splash" : "splashes"}`
          : "Bone dry!",
        `Crossed in ${formatTime(run.time)}. Next up · ${POND_ROUNDS[index + 1].name}, with ${POND_ROUNDS[index + 1].rows} rows of stones.`,
        "Next pond",
      );
    } else {
      state = "finished";
      overlay.hidden = true;
      get("pause").hidden = true;
      get("touch").hidden = true;
      const total = summary(results);
      results$.show(
        total.splashes ? "All ponds crossed!" : "Not a single splash!",
        total.splashes
          ? "Every pond crossed. Try again for fewer splashes."
          : "Bone dry across all three ponds.",
        [
          [`${total.stars} / 9`, "Stars"],
          [total.splashes, "Splashes"],
          [formatTime(total.time), "Time"],
        ],
      );
    }
  }

  function resume() {
    state = "playing";
    overlay.hidden = true;
    get("pause").hidden = false;
    get("touch").hidden = false;
    setPauseScreen(dialog, false, canvas);
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    setPauseScreen(dialog, true);
  }

  dialog.padPlaying = () => state === "playing";
  get("play").onclick = () => {
    audio?.unlock?.();
    if (state === "between") startRound(index + 1);
    else startGame();
  };
  get("exit").onclick = get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = () => startRound(index);
  bindDialogEscape(dialog, () => {
    if (state === "playing") pause();
    else if (state === "paused") resume();
    else dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    const dir = KEYS[event.code];
    if (!dir || state !== "playing") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) tryHop(dir);
  });

  get("touch").addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-hop]");
    if (!button) return;
    event.preventDefault();
    tryHop(button.dataset.hop);
  });

  // Tap a stone: hop one step towards it.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    const spot = scene.pick(event.clientX, event.clientY);
    if (!spot) return;
    const from = hop?.to ?? run.player;
    const dr = spot.row - from.row;
    const dl = spot.lane - from.lane;
    if (!dr && !dl) return;
    const dir =
      Math.abs(dr) >= Math.abs(dl)
        ? dr > 0
          ? "up"
          : "down"
        : dl > 0
          ? "right"
          : "left";
    tryHop(dir);
  });

  window.addEventListener("blur", pause);
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", pause);
      scene.dispose();
      dialog.remove();
      document.querySelector("#deploy")?.focus();
    },
    { once: true },
  );

  dialog.showModal();
  hud();
  frame = requestAnimationFrame(tick);
  showCard(
    "Three ponds · stepping stones",
    TITLE,
    "Some stones float. Some sink! Hop across the pond and remember which ones dunked you.",
    "Start hopping",
    HOW_TO,
  );
}
