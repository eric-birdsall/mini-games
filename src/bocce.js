import {
  AIM_LIMIT,
  COURT,
  COURSE,
  TOP_SPEED,
  WIN_SCORE,
  bocceEnd,
  bocceStanding,
  nextBocceTeam,
  restingSpeed,
  rollBocce,
  stepBocce,
  throwPallino,
  terrainHeight,
} from "../shared/bocce.js";
import { createBocceCourse } from "./bocceCourt.js";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import "./bocce.css";

const TITLE = "Bocce Ball";
const HOW_TO =
  "Throw the white pallino to set the target. The winner of each end throws it next. The grid dots flow downhill. Roll as close as you can to the white pallino. The side farther away rolls next while it has balls left. After four balls each, score one point for each ball closer than the opponent’s best. First to seven wins.";
const STEP = 1 / 120;
const teams = ["Gold", "Teal"];
const aimKeys = new Map([
  ["a", -1],
  ["ArrowLeft", -1],
  ["d", 1],
  ["ArrowRight", 1],
]);
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

export function installBocce(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "bocce";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb bocce-thumb" aria-hidden="true"><i></i><i></i><i></i></span><strong>${TITLE}</strong><small>Roll close to the pallino or knock your rival away. First to seven wins.</small>`;
  entry.onclick = () => openBocce(getLevel());
  games.append(entry);
}

function openBocce(level) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "bocce";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <div class="bocce-layout">
      <div class="bocce-court">
        <canvas data-view tabindex="-1" aria-label="First-person bocce course"></canvas>
        <span class="bocce-reticle" aria-hidden="true"></span>
      </div>
      <div class="bocce-panel">
        <div class="bocce-heading">
          <button type="button" data-pause-button aria-label="Pause">Ⅱ</button>
          <h2>Bocce Ball</h2>
          <p data-end></p>
        </div>
        <div class="bocce-scores">
          ${teams.map((team, i) => `<div class="bocce-team" data-team="${i}"><span>${team} · ${i ? "CPU" : "You"}</span><strong>0</strong><small></small></div>`).join("")}
        </div>
        <p class="bocce-status" aria-live="polite"></p>
        <small class="bocce-elevation" data-elevation></small>
        <label class="bocce-power">Roll power <meter min="0" max="1" value="0"></meter></label>
        <div class="bocce-controls">
          <button type="button" data-aim="-1" aria-label="Aim left">←</button>
          <button type="button" data-roll>Hold to roll</button>
          <button type="button" data-aim="1" aria-label="Aim right">→</button>
        </div>
        <button type="button" data-next hidden>Next end →</button>
        <p class="bocce-hint">Aim with ← → or drag the view.<br>Hold Space or A on Xbox, then release.</p>
      </div>
    </div>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  const q = (selector) => dialog.querySelector(selector);
  const canvas = q("[data-view]");
  let course;
  try {
    course = createBocceCourse(canvas);
  } catch {
    q(".bocce-layout").innerHTML =
      '<p>The 3D course requires WebGL. <button type="button">Back to games</button></p>';
    q("button").onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    return;
  }
  const roll = q("[data-roll]");
  const next = q("[data-next]");
  const meter = q("meter");
  const status = q(".bocce-status");
  const elevation = q("[data-elevation]");
  const scores = [0, 0];
  const keys = new Map();
  let end, endNumber, turn, phase, angle, power, charging, clock;
  let pallinoTurn, starter, drag;
  let paused = false;
  let frame = 0;
  let previous = 0;
  let accumulator = 0;

  const results = gameResults(dialog, TITLE, restart, () => dialog.close());
  const canAim = () => !paused && phase === "aim" && turn === 0;
  dialog.padPlaying = () => !paused && ["aim", "moving"].includes(phase);

  function renderStatus(message) {
    status.textContent = message;
    roll.textContent = pallinoTurn ? "Hold to throw" : "Hold to roll";
    for (const [i, score] of scores.entries()) {
      const card = q(`[data-team="${i}"]`);
      card.querySelector("strong").textContent = score;
      card.querySelector("small").textContent = `${end.remaining[i]} left`;
      card.classList.toggle(
        "is-turn",
        ["aim", "moving"].includes(phase) && turn === i,
      );
    }
    for (const control of dialog.querySelectorAll("[data-roll], [data-aim]")) {
      control.disabled = !canAim();
    }
  }

  function startEnd(first) {
    starter = first;
    pallinoTurn = true;
    const section = Math.min(endNumber, COURSE.length - 1);
    end = bocceEnd(section);
    q("[data-end]").textContent =
      `${COURSE[section]} · End ${++endNumber} · First to ${WIN_SCORE}`;
    next.hidden = true;
    beginTurn(first);
    (canAim() ? roll : q("[data-pause-button]")).focus();
  }

  function beginTurn(team) {
    turn = team;
    phase = "aim";
    clock = 0;
    angle = 0;
    power = 0;
    charging = false;
    renderStatus(
      pallinoTurn
        ? turn
          ? "Teal will throw the pallino…"
          : "Throw the white pallino"
        : turn
          ? "Teal is lining up a roll…"
          : "Your roll",
    );
  }

  function restart() {
    results.hide();
    paused = false;
    setPauseScreen(dialog, false);
    scores.fill(0);
    endNumber = 0;
    keys.clear();
    startEnd(0);
  }

  function launch(direction, speed) {
    phase = "moving";
    charging = false;
    keys.clear();
    if (pallinoTurn) throwPallino(end, direction, speed);
    else rollBocce(end, turn, direction, speed);
    renderStatus(
      `${teams[turn]} ${pallinoTurn ? "threw the pallino" : "rolled"}`,
    );
    canvas.focus({ preventScroll: true });
  }

  function cpuRoll() {
    if (pallinoTurn) {
      launch((Math.random() - 0.5) * 0.32, 410 + Math.random() * 69);
      return;
    }
    const [target] = end.balls;
    const error = { easy: 50, normal: 30, hard: 14 }[level] ?? 30;
    const dx = target.x - COURT.startX + (Math.random() - 0.5) * 2 * error;
    const dy = COURT.startY - target.y + (Math.random() - 0.5) * 2 * error;
    launch(Math.atan2(dx, dy), restingSpeed(Math.hypot(dx, dy)));
  }

  function settle() {
    if (pallinoTurn) {
      pallinoTurn = false;
      beginTurn(starter);
      return;
    }
    const upcoming = nextBocceTeam(end, turn);
    if (upcoming >= 0) {
      beginTurn(upcoming);
      return;
    }
    const { team, points } = bocceStanding(end);
    if (points) scores[team] += points;
    if (points && scores[team] >= WIN_SCORE) {
      phase = "result";
      results.show(
        team ? "Teal wins" : "You win!",
        `Finished in ${endNumber} ends.`,
        [
          [scores[0], "Gold"],
          [scores[1], "Teal"],
        ],
      );
      return;
    }
    phase = "between";
    renderStatus(
      points
        ? `${teams[team]} scores ${points} ${points === 1 ? "point" : "points"}`
        : "Tied end",
    );
    next.hidden = false;
    next.onclick = () => startEnd(points ? team : starter);
    next.focus();
  }

  function togglePause() {
    if (phase === "result") {
      dialog.close();
      return;
    }
    paused = !paused;
    charging = false;
    power = 0;
    keys.clear();
    setPauseScreen(
      dialog,
      paused,
      phase === "between" ? next : q("[data-pause-button]"),
    );
  }

  function startCharge() {
    if (!canAim() || charging) return;
    charging = true;
    power = 0;
  }
  const speedFor = (value) =>
    pallinoTurn ? 385 + value * 115 : 140 + value * (TOP_SPEED - 140);
  function release() {
    if (canAim() && charging) launch(angle, speedFor(power));
  }

  bindDialogEscape(dialog, togglePause);
  q("[data-pause-button]").onclick = q("[data-pause-resume]").onclick =
    togglePause;
  q("[data-pause-restart]").onclick = restart;
  q("[data-pause-home]").onclick = () => dialog.close();
  for (const type of ["keydown", "keyup"]) {
    dialog.addEventListener(type, (event) => {
      if (!canAim()) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key !== " " && !aimKeys.has(key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === " ") {
        if (type === "keyup") release();
        else if (!event.repeat) startCharge();
      } else if (type === "keydown") keys.set(key, aimKeys.get(key));
      else keys.delete(key);
    });
  }

  for (const button of dialog.querySelectorAll("[data-roll], [data-aim]")) {
    button.addEventListener("pointerdown", (event) => {
      if (!canAim() || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (button === roll) startCharge();
      else keys.set(button, Number(button.dataset.aim));
    });
    button.addEventListener("pointerup", () => {
      if (button === roll) release();
      keys.delete(button);
    });
    button.addEventListener("lostpointercapture", () => {
      if (button === roll) charging = false;
      keys.delete(button);
    });
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!canAim() || !event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, angle };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || !canAim()) return;
    angle = clamp(drag.angle + (drag.x - event.clientX) * 0.006, AIM_LIMIT);
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = null;
  });

  function clearInput() {
    keys.clear();
    charging = false;
    power = 0;
  }
  window.addEventListener("blur", clearInput);
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", clearInput);
      course.dispose();
      dialog.remove();
    },
    { once: true },
  );

  function animate(time) {
    const dt = Math.min(0.05, (time - (previous || time)) / 1000);
    previous = time;
    if (!paused) {
      if (canAim()) {
        const direction = Math.sign(
          [...keys.values()].reduce((sum, value) => sum + value, 0),
        );
        angle = clamp(angle + direction * dt * 0.8, AIM_LIMIT);
        if (charging) power = Math.min(1, power + dt / 1.35);
      } else if (phase === "aim") {
        clock += dt;
        if (clock > 0.7) cpuRoll();
      } else if (phase === "moving") {
        accumulator += dt;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          if (!stepBocce(end, STEP)) {
            accumulator = 0;
            settle();
            break;
          }
        }
      }
    }
    meter.value = canAim() ? power : 0;
    const target = end.balls[0];
    const rise = target
      ? Math.round(
          terrainHeight(target.x, target.y, end.section) -
            terrainHeight(COURT.startX, COURT.startY, end.section),
        )
      : null;
    const reading =
      rise === null ? "" : `Pallino ${rise > 0 ? "+" : ""}${rise} cm`;
    if (elevation.textContent !== reading) elevation.textContent = reading;
    course.paint(end, angle, canAim(), pallinoTurn, time);
    frame = requestAnimationFrame(animate);
  }

  dialog.showModal();
  restart();
  frame = requestAnimationFrame(animate);
}
