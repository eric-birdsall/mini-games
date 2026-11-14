import {
  BATONS,
  PITCH,
  activeLine,
  collision,
  flight,
  newMatch,
  nextTurn,
  position,
  settle,
  solveShot,
  targets,
  throwLine,
} from "../shared/kubb.js";
import { gameResults } from "./gameResults.js";
import { createKubbScene } from "./kubbScene.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import "./kubb.css";

const TITLE = "Kubb";
const HOW_TO =
  "Knock down the rival’s field kubbs before their baseline kubbs. Knocked blocks are automatically placed upright on the other side for the next turn. If the rival leaves a field kubb standing on your side, you can throw from that kubb’s line. Clear every rival kubb, then take down the king to win. Hitting the king early loses the match. Aim with WASD, the arrow keys, either Xbox stick, or drag the field. Hold Space, Xbox A / RT, or the Throw button, then release.";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const aimKey = {
  w: [0, 1],
  i: [0, 1],
  ArrowUp: [0, 1],
  s: [0, -1],
  k: [0, -1],
  ArrowDown: [0, -1],
  a: [-1, 0],
  j: [-1, 0],
  ArrowLeft: [-1, 0],
  d: [1, 0],
  l: [1, 0],
  ArrowRight: [1, 0],
};

export function installKubb(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "kubb";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    '<span class="map-thumb kubb-thumb" aria-hidden="true"><i></i><i></i><i></i></span><strong>Kubb · Viking Chess</strong><small>Throw batons in first person. Clear the field before taking the king.</small>';
  entry.onclick = () => openKubb(getLevel());
  games.append(entry);
}

function openKubb(level) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "kubb";
  dialog.setAttribute("aria-label", "Kubb · Viking Chess");
  dialog.innerHTML = `
    <div class="kubb-play">
      <canvas aria-label="First-person Kubb field"></canvas>
      <header class="kubb-top">
        <div><p>THE WOODLAND PITCH</p><h2>KUBB <span>VIKING CHESS</span></h2></div>
        <button type="button" data-pause aria-label="Pause">Ⅱ</button>
      </header>
      <div class="kubb-score">
        <div><b>YOU</b><strong data-blue></strong></div>
        <small data-round></small>
        <div><b>RIVAL</b><strong data-orange></strong></div>
      </div>
      <div class="kubb-reticle" aria-hidden="true">+</div>
      <div class="kubb-bottom">
        <div class="kubb-instructions">
          <strong data-objective></strong>
          <small data-status role="status">Aim for an amber kubb.</small>
        </div>
        <div class="kubb-throw">
          <div data-batons aria-label="Batons remaining"></div>
          <label>POWER <meter min="0" max="1" value=".3"></meter></label>
          <button type="button" data-throw>HOLD TO THROW</button>
        </div>
        <small class="kubb-hint">WASD / drag to aim · Space / A to throw</small>
      </div>
    </div>${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  const q = (selector) => dialog.querySelector(selector);
  const canvas = q("canvas"),
    throwButton = q("[data-throw]");
  let scene;
  try {
    scene = createKubbScene(canvas);
  } catch {
    dialog.innerHTML =
      '<div class="kubb-error"><p>Kubb needs WebGL to draw the field.</p><button type="button">Back to games</button></div>';
    q("button").onclick = () => dialog.close();
    bindDialogEscape(dialog, () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    return;
  }
  let match, aim, pitch, charge, shot, elapsed, impact, clock, mode;
  let shotLine;
  let owner = null,
    drag = null,
    paused = false,
    previous = 0,
    frame;
  const keys = new Set();
  const results = gameResults(dialog, TITLE, restart, () => dialog.close());
  const ready = () => !paused && mode === "ready" && match.side === 0;
  dialog.padPlaying = () => !paused && mode !== "finished";

  function update(message) {
    if (message) q("[data-status]").textContent = message;
    q("[data-blue]").textContent = match.pieces.filter(
      (p) => p.side === 0 && p.standing,
    ).length;
    q("[data-orange]").textContent = match.pieces.filter(
      (p) => p.side === 1 && p.standing,
    ).length;
    q("[data-round]").textContent = `ROUND ${match.round} · STANDING KUBBS`;
    const kind = targets(match)[0].kind;
    q("[data-objective]").textContent = match.side
      ? "RIVAL’S TURN"
      : kind === "field"
        ? "CLEAR THE FIELD KUBBS"
        : kind === "base"
          ? "CLEAR THE BASELINE"
          : "TAKE THE KING";
    q("[data-batons]").innerHTML = Array.from(
      { length: BATONS },
      (_, i) =>
        `<i class="${i < match.left ? "is-ready" : ""}" aria-hidden="true"></i>`,
    ).join("");
    q("[data-batons]").setAttribute(
      "aria-label",
      `${match.left} batons remaining`,
    );
    throwButton.disabled = !ready();
    throwButton.textContent = match.side
      ? "RIVAL THROWING"
      : mode === "ready"
        ? "HOLD TO THROW"
        : "BATON AWAY";
  }

  function resetAim() {
    aim = 0;
    pitch = PITCH;
    charge = displayPower();
  }

  function displayPower() {
    const z = targets(match)[0].z;
    return solveShot(match, { x: 0, z, kind: targets(match)[0].kind }, pitch)
      .power;
  }

  function restart() {
    results.hide();
    match = newMatch();
    shot = impact = null;
    mode = "ready";
    owner = drag = null;
    keys.clear();
    paused = false;
    resetAim();
    setPauseScreen(dialog, false, throwButton);
    update("Aim for an amber kubb. Follow the dotted throw arc.");
    throwButton.focus({ preventScroll: true });
  }

  function launch(power, angle = aim, elevation = pitch) {
    shotLine = activeLine(match);
    shot = flight(match, angle, elevation, power);
    mode = "flight";
    elapsed = 0;
    impact = null;
    update(match.side ? "Watch the rival’s throw." : "Baton away!");
  }

  function rivalThrow() {
    const legal = targets(match);
    const target = legal.reduce((best, p) =>
      Math.abs(p.x) < Math.abs(best.x) ? p : best,
    );
    const distance = Math.hypot(target.x, target.z - throwLine(match));
    const elevation = clamp((distance - 4) * 0.1, -0.53, PITCH);
    const solution = solveShot(match, target, elevation);
    const spread =
      level === "hard" || Number(level) > 1
        ? 0.65
        : level === "easy"
          ? 1.35
          : 1;
    launch(
      clamp(solution.power + (Math.random() - 0.5) * 0.055 * spread, 0, 1),
      solution.aim + (Math.random() - 0.5) * (0.42 / distance) * spread,
      elevation + (Math.random() - 0.5) * 0.032 * spread,
    );
  }

  function start(input) {
    if (!ready() || owner !== null) return;
    owner = input;
    charge = displayPower();
  }

  function release(input, cancelled = false) {
    if (owner !== input) return;
    owner = null;
    if (!cancelled && ready()) launch(charge);
  }

  function togglePause() {
    if (mode === "finished") {
      dialog.close();
      return;
    }
    paused = !paused;
    owner = drag = null;
    keys.clear();
    setPauseScreen(dialog, paused, ready() ? throwButton : q("[data-pause]"));
    if (!paused) update();
  }

  bindDialogEscape(dialog, togglePause);
  q("[data-pause]").onclick = q("[data-pause-resume]").onclick = togglePause;
  q("[data-pause-home]").onclick = () => dialog.close();
  q("[data-pause-restart]").onclick = restart;
  dialog.addEventListener("keydown", (e) => {
    if (!ready()) return;
    if (e.code === "Space" || e.key === " ") {
      if (e.target.closest("button") && e.target !== throwButton) return;
      e.preventDefault();
      if (!e.repeat) start("space");
    } else if (aimKey[e.key]) {
      e.preventDefault();
      keys.add(e.key);
    }
  });
  dialog.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.key === " ") {
      if (owner === "space") e.preventDefault();
      release("space");
    }
    keys.delete(e.key);
  });
  const blur = () => {
    owner = drag = null;
    keys.clear();
  };
  window.addEventListener("blur", blur);
  canvas.onpointerdown = (e) => {
    if (!ready() || drag || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    throwButton.focus({ preventScroll: true });
  };
  canvas.onpointermove = (e) => {
    if (!ready() || drag?.id !== e.pointerId) return;
    aim = clamp(aim + (e.clientX - drag.x) * 0.004, -1.25, 1.25);
    pitch = clamp(pitch - (e.clientY - drag.y) * 0.004, -0.65, 0.62);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  canvas.onlostpointercapture = () => {
    drag = null;
  };
  throwButton.onpointerdown = (e) => {
    if (e.button !== 0) return;
    throwButton.setPointerCapture(e.pointerId);
    start(e.pointerId);
  };
  throwButton.onpointerup = (e) => release(e.pointerId);
  throwButton.onlostpointercapture = (e) => release(e.pointerId, true);
  throwButton.onclick = (e) => {
    if (!e.detail && ready() && owner === null) launch(displayPower());
  };

  function step(now) {
    frame = requestAnimationFrame(step);
    const dt = Math.min(0.05, (now - (previous || now)) / 1000);
    previous = now;
    if (paused) return;
    if (ready()) {
      let x = 0,
        y = 0;
      for (const key of keys) {
        x += aimKey[key][0];
        y += aimKey[key][1];
      }
      aim = clamp(aim + Math.sign(x) * dt * 0.69, -1.25, 1.25);
      pitch = clamp(pitch + Math.sign(y) * dt * 0.58, -0.65, 0.62);
      charge =
        owner === null ? displayPower() : Math.min(1, charge + dt * 0.48);
    }
    if (mode === "flight") {
      const end = elapsed + dt;
      while (elapsed < end) {
        elapsed = Math.min(end, elapsed + 1 / 180);
        const p = position(shot, elapsed);
        impact = collision(match, p);
        if (impact || p.y <= 0.055) {
          const message = settle(match, impact);
          mode = "settling";
          clock = match.winner === null ? 0.66 : 1.25;
          update(message);
          break;
        }
      }
    } else if (mode === "settling" && (clock -= dt) <= 0) {
      impact = shot = null;
      if (match.winner !== null) {
        mode = "finished";
        results.show(
          match.winner === 0 ? "You rule the pitch." : "The rival wins.",
          q("[data-status]").textContent,
          [
            [match.hits[0], "Your kubbs hit"],
            [match.round, "Rounds"],
          ],
        );
      } else {
        const moved = match.left === 0 ? nextTurn(match) : null;
        if (moved) resetAim();
        mode = match.side === 0 ? "ready" : "rival";
        clock = 0.8;
        update(
          moved
            ? moved.length
              ? `${moved.length} knocked kubb${moved.length === 1 ? "" : "s"} set up in the field.`
              : "Sides switch. Six fresh batons."
            : null,
        );
        if (ready()) throwButton.focus({ preventScroll: true });
      }
    } else if (mode === "rival" && (clock -= dt) <= 0) rivalThrow();

    q("meter").value = charge;
    const effectiveLine = shot ? shotLine : activeLine(match);
    const preview = ready() ? flight(match, aim, pitch, charge) : null;
    scene.draw({
      match,
      side: match.side,
      line: effectiveLine,
      aim: match.side ? 0 : aim,
      pitch: match.side ? PITCH : pitch,
      shot,
      elapsed,
      preview,
      charge,
      impact,
      dt,
    });
  }

  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", blur);
      scene.dispose();
      dialog.remove();
    },
    { once: true },
  );
  dialog.showModal();
  restart();
  frame = requestAnimationFrame(step);
}
