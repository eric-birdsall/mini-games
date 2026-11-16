import {
  createTrailRun,
  stepTrail,
  TRAIL_LEVELS,
  TRAIL_STEP,
} from "../shared/lanternTrail.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { drawLanternTrail, trailSceneScale } from "./lanternTrailScene.js";
import "./lanternTrail.css";

const title = "Lantern Trail";
const instructions =
  "Run with A / D or the arrow keys. Jump with Space, W or ↑. On Xbox, use the stick or D-pad and A. Hold Jump for more height.";
const controls = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
};

export function installLanternTrail() {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "lanterntrail";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    '<span class="map-thumb"><img alt="" draggable="false"></span><strong>Lantern Trail</strong><small>Run, jump and stomp your way through three short woodland levels.</small>';
  const preview = document.createElement("canvas");
  preview.width = 760;
  preview.height = 464;
  const previewRun = createTrailRun(TRAIL_LEVELS[1]);
  Object.assign(previewRun.player, { x: 560, y: 200, grounded: false });
  drawLanternTrail(preview, previewRun, 1, 410);
  entry.querySelector("img").src = preview.toDataURL();
  games.append(entry);
  entry.onclick = openTrail;
}

function openTrail() {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "lantern-trail";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `
    <canvas tabindex="-1" aria-label="Lantern Trail side-scrolling course"></canvas>
    <header class="trail-hud">
      <div><strong data-level></strong><span data-sparks></span></div>
      <button data-pause aria-label="Pause game" hidden>Ⅱ <span>Pause</span></button>
    </header>
    <div class="trail-notice" role="status"></div>
    <section class="trail-overlay">
      <div class="trail-card">
        <p class="trail-level-label" data-label></p>
        <h2 data-heading></h2>
        <p data-details></p>
        <p class="trail-instructions" data-instructions></p>
        <div class="trail-actions">
          <button data-play></button>
          <button data-exit>Back to games</button>
        </div>
      </div>
    </section>
    <div class="trail-touch" hidden>
      <div>
        <button data-hold="left" aria-label="Move left">←</button>
        <button data-hold="right" aria-label="Move right">→</button>
      </div>
      <button data-hold="jump" aria-label="Jump">↑ <span>Jump</span></button>
    </div>
    ${pauseScreen(title, instructions)}
  `;

  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  const overlay = dialog.querySelector(".trail-overlay");
  const touch = dialog.querySelector(".trail-touch");
  const notice = dialog.querySelector(".trail-notice");
  const keys = new Set();
  const pointers = new Map();
  let index = 0;
  let run = createTrailRun(TRAIL_LEVELS[index]);
  let state = "ready";
  let allSparks = 0;
  let allFalls = 0;
  let camera = 0;
  let viewWidth = 0;
  let frame;
  let previous = 0;
  let accumulator = 0;
  let jumpPressed = false;
  let noticeUntil = 0;

  function held(action) {
    return (
      [...keys].some((key) => controls[key] === action) ||
      [...pointers.values()].includes(action)
    );
  }

  function clearInput() {
    keys.clear();
    pointers.clear();
    jumpPressed = false;
  }

  function draw() {
    drawLanternTrail(canvas, run, index, camera);
    const sparks = `✦ ${run.coins.size} / ${run.level.coins.length}`;
    if (get("sparks").textContent !== sparks)
      get("sparks").textContent = sparks;
  }

  function follow(snap = false) {
    const target = Math.max(
      0,
      Math.min(
        run.level.width - viewWidth,
        run.player.x + run.player.w / 2 - viewWidth * 0.39,
      ),
    );
    camera = snap ? target : camera + (target - camera) * 0.14;
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    viewWidth = canvas.width / trailSceneScale(canvas);
    follow(true);
    draw();
  }

  function announce(message) {
    notice.textContent = message;
    noticeUntil = run.time + 1.6;
  }

  function showCard(label, heading, details, button, help = "") {
    overlay.hidden = false;
    get("pause").hidden = true;
    touch.hidden = true;
    get("label").textContent = label;
    get("heading").textContent = heading;
    get("details").textContent = details;
    get("instructions").textContent = help;
    get("instructions").hidden = !help;
    get("play").textContent = button;
    get("play").focus({ preventScroll: true });
  }

  function tick(now) {
    accumulator += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    while (accumulator >= TRAIL_STEP) {
      const hadCheckpoint = run.checkpoint;
      const result = stepTrail(run, {
        direction: Number(held("right")) - Number(held("left")),
        pressed: jumpPressed,
        held: held("jump"),
      });
      jumpPressed = false;
      accumulator -= TRAIL_STEP;
      if (result === "clear") {
        finishLevel();
        draw();
        return;
      }
      if (result === "retry") {
        follow(true);
        announce(
          run.checkpoint ? "Back at the trail marker" : "Try that jump again",
        );
      } else if (!hadCheckpoint && run.checkpoint) announce("Checkpoint lit");
    }
    if (notice.textContent && run.time >= noticeUntil) notice.textContent = "";
    follow();
    draw();
    frame = requestAnimationFrame(tick);
  }

  function resume() {
    state = "playing";
    overlay.hidden = true;
    get("pause").hidden = false;
    touch.hidden = false;
    setPauseScreen(dialog, false, canvas);
    accumulator = 0;
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function startLevel(next) {
    index = next;
    run = createTrailRun(TRAIL_LEVELS[index]);
    get("level").textContent =
      `${index + 1} / ${TRAIL_LEVELS.length} · ${run.level.name}`;
    clearInput();
    follow(true);
    announce(run.level.hint);
    noticeUntil = 3.5;
    draw();
    resume();
  }

  function finishLevel() {
    clearInput();
    notice.textContent = "";
    allSparks += run.coins.size;
    allFalls += run.falls;
    if (index + 1 === TRAIL_LEVELS.length) {
      state = "won";
      const total = TRAIL_LEVELS.reduce(
        (sum, level) => sum + level.coins.length,
        0,
      );
      showCard(
        "All three lanterns lit",
        "Trail complete!",
        `You found ${allSparks} of ${total} sparks and took ${allFalls} ${allFalls === 1 ? "retry" : "retries"}.`,
        "Play again",
      );
    } else {
      state = "cleared";
      showCard(
        `Level ${index + 1} cleared`,
        run.level.name,
        `${run.coins.size} of ${run.level.coins.length} sparks found. Next stop · ${TRAIL_LEVELS[index + 1].name}.`,
        "Next level",
      );
    }
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    cancelAnimationFrame(frame);
    clearInput();
    setPauseScreen(dialog, true);
  }

  dialog.padPlaying = () => state === "playing";
  get("play").onclick = () => {
    if (state === "cleared") startLevel(index + 1);
    else {
      allSparks = 0;
      allFalls = 0;
      startLevel(0);
    }
  };
  get("pause").onclick = pause;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = () => startLevel(index);
  get("exit").onclick = get("pause-home").onclick = () => dialog.close();
  bindDialogEscape(dialog, () => {
    if (state === "playing") pause();
    else if (state === "paused") resume();
    else dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    const action = controls[event.code];
    if (!action || state !== "playing") return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "jump" && !held("jump") && !event.repeat) jumpPressed = true;
    keys.add(event.code);
  });
  dialog.addEventListener("keyup", (event) => keys.delete(event.code));

  touch.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-hold]");
    if (state !== "playing" || !button) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    const action = button.dataset.hold;
    if (action === "jump" && !held("jump")) jumpPressed = true;
    pointers.set(event.pointerId, action);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    touch.addEventListener(type, (event) => pointers.delete(event.pointerId));
  }

  window.addEventListener("resize", resize);
  window.addEventListener("blur", pause);
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", pause);
      dialog.remove();
      document.querySelector("#deploy")?.focus();
    },
    { once: true },
  );

  document.body.append(dialog);
  dialog.showModal();
  get("level").textContent = `1 / ${TRAIL_LEVELS.length} · ${run.level.name}`;
  resize();
  showCard(
    "Three woodland levels",
    title,
    "Light the lantern at the end of each trail. Pick up sparks and bounce on beetles along the way.",
    "Start trail",
    instructions,
  );
}
