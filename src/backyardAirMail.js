import loopAndGlidePreview from "./assets/modes/loop-and-glide.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import {
  newFlight,
  nextTargetLayout,
  releaseGlider,
  stepFlight,
  targets,
} from "./backyardAirMailFlight.js";
import { createAirMailScene } from "./backyardAirMailScene.js";
import "./backyardAirMail.css";

const title = "Loop & Glide";
const instructions =
  "The car launches automatically. Land on a picnic target to score. The targets move after each launch, and three misses end the game.";
const keyGuide = `
  <span class="airmail-key-guide">
    <span><kbd>A</kbd> Steer left</span>
    <span><kbd>D</kbd> Steer right</span>
    <span><kbd>W</kbd> Dive to go farther</span>
    <span><kbd>S</kbd> Flare to land closer</span>
    <span><kbd>Space</kbd> Drop straight down</span>
    <span><kbd>Esc</kbd> Pause</span>
  </span>`;
const steering = {
  a: "left",
  d: "right",
  w: "dive",
  s: "flare",
};

export function installBackyardAirMail(getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "backyardairmail";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${loopAndGlidePreview}" alt="A toy car gliding toward a picnic basket in a fenced backyard" draggable="false"></span><strong>${title}</strong><small>Race through the loop and glide onto a picnic target.</small>`;
  games.append(entry);
  entry.onclick = () => openGame(getAvatar());
}

function openGame(avatar) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "airmail";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `
    <main class="airmail-yard">
      <canvas tabindex="-1" width="900" height="480" aria-label="A toy stunt track overlooking a gingham picnic table with three targets"></canvas>
      <section data-panel>
        <div class="airmail-card"><h2 data-heading></h2><p data-details></p><div data-key-guide>${keyGuide}</div><button class="primary" data-play></button></div>
      </section>
    </main>
    <footer>
      <span data-score></span>
      <span data-status role="status"></span>
    </footer>
    ${pauseScreen(title, `${instructions}${keyGuide}`)}`;
  document.body.append(dialog);
  // Controller: steer while playing; navigate buttons otherwise (padBridge).
  dialog.padPlaying = () => mode === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  const scene = createAirMailScene(canvas, avatar);
  const resize = new ResizeObserver(() => draw());
  const keys = new Set();
  const maxMisses = 3;
  let launch = 1;
  let score = 0;
  let misses = 0;
  let layout = targets;
  let car = newFlight(layout);
  let flightView = 0;
  let touchdown = 0;
  let mode = "ready";
  let frame = 0;
  let previous = 0;
  let accumulator = 0;
  const dt = 1 / 120;
  const exit = () => dialog.close();
  const results = gameResults(dialog, title, restart, exit);

  function draw() {
    scene.draw(car, flightView, touchdown);
    get("score").textContent =
      `Launch ${launch} · ${score} pts · ${misses}/${maxMisses} misses`;
    const status = {
      track: "Automatic launch · Get ready to steer",
      air: "A / D Steer · W Dive for range · S Flare · Space Drop",
      drop: "Glider released · Dropping straight down",
      done: car.points
        ? `${car.surface.name} · +${car.points} pts`
        : car.surface
          ? "On the table · 0 pts"
          : "Off the table",
    }[car.phase];
    if (get("status").textContent !== status)
      get("status").textContent = status;
  }

  function panel(heading, detail, action) {
    get("heading").textContent = heading;
    get("details").textContent = detail;
    get("play").textContent = action;
    get("key-guide").hidden = mode !== "ready";
    get("panel").hidden = false;
    get("play").focus();
  }

  function finish() {
    score += car.points;
    if (!car.points) misses++;
    mode = "between";
    if (misses === maxMisses) {
      mode = "results";
      results.show(`${score} points`, "Three missed launches.", [
        [launch, "Launches"],
        [launch - misses, "Targets landed"],
        [misses, "Misses"],
      ]);
    } else {
      panel(
        car.points
          ? "Target landed!"
          : car.surface
            ? "On the table · 0 pts"
            : "Off the table",
        car.points
          ? `${car.surface.name} earned ${car.points} points.`
          : `${maxMisses - misses} of ${maxMisses} misses left.`,
        `Start launch ${launch + 1}`,
      );
    }
  }

  function tick(now) {
    const elapsed = Math.min((now - previous) / 1000, 0.05);
    accumulator += elapsed;
    previous = now;
    const held = (action) =>
      Object.keys(steering).some(
        (key) => steering[key] === action && keys.has(key),
      );
    // The chase camera faces +Z, so positive world X is screen left.
    const steer = Number(held("left")) - Number(held("right"));
    const pitch = Number(held("dive")) - Number(held("flare"));
    while (accumulator >= dt && car.phase !== "done") {
      if (car.phase !== "track")
        flightView = Math.min(1, flightView + dt / 0.65);
      stepFlight(car, dt, steer, pitch);
      accumulator -= dt;
    }
    if (car.phase === "done") {
      touchdown += elapsed;
      if (!car.points || touchdown >= 0.8) finish();
    }
    draw();
    if (mode === "playing") frame = requestAnimationFrame(tick);
  }

  function run() {
    mode = "playing";
    previous = performance.now();
    accumulator = 0;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (mode === "between") {
      launch++;
      layout = nextTargetLayout(layout);
    }
    scene.setTargets(layout);
    car = newFlight(layout);
    flightView = 0;
    touchdown = 0;
    keys.clear();
    get("panel").hidden = true;
    run();
    canvas.focus();
  }

  function restart() {
    results.hide();
    setPauseScreen(dialog, false);
    launch = 1;
    score = 0;
    misses = 0;
    layout = targets;
    mode = "ready";
    start();
  }

  function pause() {
    if (mode !== "playing") return;
    mode = "paused";
    cancelAnimationFrame(frame);
    keys.clear();
    setPauseScreen(dialog, true);
  }

  function resume() {
    setPauseScreen(dialog, false, canvas);
    run();
  }

  get("play").onclick = start;
  get("pause-home").onclick = exit;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = restart;
  bindDialogEscape(dialog, () => {
    if (mode === "playing") pause();
    else if (mode === "paused") resume();
    else exit();
  });
  dialog.addEventListener("keydown", (event) => {
    if (mode !== "playing") return;
    if (event.code === "Space" && ["air", "drop"].includes(car.phase)) {
      event.preventDefault();
      if (!event.repeat) releaseGlider(car);
      return;
    }
    const key = event.key.toLowerCase();
    if (steering[key]) {
      event.preventDefault();
      keys.add(key);
    }
  });
  dialog.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("blur", pause);
    resize.disconnect();
    scene.dispose();
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });
  dialog.showModal();
  resize.observe(canvas);
  panel("Loop & Glide", instructions, "Start launch 1");
  draw();
}
