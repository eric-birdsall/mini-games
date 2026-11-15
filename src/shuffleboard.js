import {
  MAX_AIM,
  PUCKS_PER_PLAYER,
  TABLE,
  WIN_SCORE,
  ZONES,
  launchPuck,
  powerForDistance,
  scoreEnd,
  stepPucks,
} from "../shared/shuffleboard.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { setupRecordControls } from "./shuffleboardRecords.js";
import { SHUFFLEBOARD_ROOMS } from "./shuffleboardRooms.js";
import { createShuffleboardStudy } from "./shuffleboardStudy.js";
import "./shuffleboard.css";

const TITLE = "Shuffleboard";
const HOW_TO =
  "Aim left or right with A and D, or drag across the table. Press Space or tap the table to start the power meter, then press or tap again to throw. The shaded part of the meter reaches the scoring zones on a clear table. Alternate four shots each. After all eight shots, only pucks farther down the table than the other side’s best puck score. A puck must clear a line completely to enter the next zone. A puck hanging over the far edge scores four. First to 15 wins.";
const colors = ["#db5944", "#40b8b3"];
const STEP = 1 / 120;
const AIM_SPEED = 11;
const clampAim = (angle) => Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
const powerMin = powerForDistance(ZONES[0] + TABLE.radius - TABLE.launch);
const powerMax = powerForDistance(TABLE.length - TABLE.launch);

export function installShuffleboard(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "shuffleboard";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    '<span class="map-thumb shuffle-thumb" aria-hidden="true"><i></i><i></i></span><strong>Shuffleboard</strong><small>Slide pucks down a polished table. Play the CPU or a friend.</small>';
  entry.onclick = () => openShuffleboard(getLevel());
  games.append(entry);
}

function drawTable(ctx, pucks, guide) {
  const { length, width, radius, launch } = TABLE;
  ctx.clearRect(0, 0, length + 32, width + 32);
  ctx.save();
  ctx.translate(16, 16);
  ctx.fillStyle = "#352019";
  ctx.fillRect(-16, -16, length + 32, width + 32);
  const varnish = ctx.createLinearGradient(0, 0, 0, width);
  varnish.addColorStop(0, "#b77341");
  varnish.addColorStop(0.43, "#f2cc8d");
  varnish.addColorStop(0.63, "#eac184");
  varnish.addColorStop(1, "#bc7e4f");
  ctx.fillStyle = varnish;
  ctx.fillRect(0, 0, length, width);
  for (let y = 5; y < width; y += 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(length * 0.28, y - 4, length * 0.67, y + 5, length, y);
    ctx.strokeStyle = y % 3 ? "#71361125" : "#fff5c75e";
    ctx.stroke();
  }
  ctx.strokeStyle = "#512b21";
  ctx.fillStyle = "#512b21";
  ctx.lineWidth = 2;
  ctx.font = "bold 27px Georgia";
  ctx.textAlign = "center";
  ZONES.forEach((line, index) => {
    const next = ZONES[index + 1] ?? length;
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, width);
    ctx.stroke();
    ctx.fillText(index + 1, (line + next) / 2, 32);
    ctx.fillText(index + 1, (line + next) / 2, width - 14);
  });
  if (guide) {
    const y = width / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, length, width);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(launch, y);
    ctx.lineTo(
      length,
      y + Math.tan((guide.aim * Math.PI) / 180) * (length - launch),
    );
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = "#3b2724";
    ctx.stroke();
    ctx.restore();
  }
  const visible = pucks.filter((puck) => !puck.out);
  if (guide) visible.unshift({ x: launch, y: width / 2, team: guide.team });
  for (const { x, y, team } of visible) {
    ctx.save();
    ctx.shadowColor = "#3823169e";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#433b38";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.arc(x, y - 2, radius - 2, 0, Math.PI * 2);
    ctx.fillStyle = colors[team];
    ctx.fill();
    ctx.strokeStyle = "#ffffff70";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawScoringMap(ctx, pucks, aim) {
  const { length, width, launch, radius } = TABLE;
  const { width: w, height: h } = ctx.canvas;
  const margin = 10;
  const firstLine = ZONES[0] - 18;
  const mapX = (y) => margin + (y / width) * (w - margin * 2);
  const mapY = (x) =>
    margin + ((length - x) / (length - firstLine)) * (h - margin * 2);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#291b19";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#dbad78";
  ctx.fillRect(margin, margin, w - margin * 2, h - margin * 2);

  ctx.strokeStyle = "#734632";
  ctx.fillStyle = "#613827";
  ctx.lineWidth = 2;
  ctx.font = "bold 16px Georgia";
  for (const [i, line] of ZONES.entries()) {
    const y = mapY(line);
    const next = ZONES[i + 1] ?? length;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(w - margin, y);
    ctx.stroke();
    ctx.fillText(String(i + 1), margin + 8, (y + mapY(next)) / 2 + 6);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, w - margin * 2, h - margin * 2);
  ctx.clip();
  const slope = Math.tan((aim * Math.PI) / 180);
  const lineAt = (x) => mapX(width / 2 + (x - launch) * slope);
  ctx.beginPath();
  ctx.moveTo(lineAt(firstLine), mapY(firstLine));
  ctx.lineTo(lineAt(length), mapY(length));
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "#fff7df";
  ctx.stroke();
  ctx.restore();

  for (const puck of pucks) {
    if (puck.out || puck.x < firstLine) continue;
    ctx.beginPath();
    ctx.arc(
      mapX(puck.y),
      mapY(puck.x),
      (radius / width) * (w - margin * 2),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = colors[puck.team];
    ctx.fill();
    ctx.strokeStyle = "#fff1db";
    ctx.stroke();
  }
}

function cpuShot(pucks, level) {
  const spread = { easy: 85, normal: 45, hard: 21 }[level] ?? 45;
  const rival = pucks
    .filter((puck) => !puck.out && puck.team === 0 && puck.x > ZONES[0])
    .sort((a, b) => b.x - a.x)[0];
  const attack = rival && Math.random() < 0.5;
  const target = attack ? rival.x + 125 : 902;
  const offset = attack
    ? rival.y - TABLE.width / 2
    : (Math.random() - 0.5) * 112;
  const aim =
    (Math.atan2(offset, (attack ? rival.x : target) - TABLE.launch) * 180) /
    Math.PI;
  const travel = target - TABLE.launch + (Math.random() * 2 - 1) * spread;
  return launchPuck(
    1,
    aim + ((Math.random() - 0.5) * spread) / 45,
    Math.min(1, powerForDistance(travel)),
  );
}

function openShuffleboard(level) {
  if (document.getElementById("shuffleboard")) return;
  document.exitPointerLock?.();
  const page = document.createElement("main");
  page.id = "shuffleboard";
  page.className = "shuffleboard";
  page.setAttribute("aria-label", TITLE);
  page.tabIndex = -1;
  page.innerHTML = `
    <div class="shuffle-layout">
      <canvas width="${TABLE.length + 32}" height="${TABLE.width + 32}" aria-label="First-person shuffleboard table"></canvas>
      <div class="shuffle-hud" hidden>
        <div class="shuffle-score">
          <div data-team="0"><span data-name></span><strong>0</strong><small></small></div>
          <button type="button" data-score-pause title="Pause game" aria-label="Pause game"><span data-end></span></button>
          <div data-team="1"><span data-name></span><strong>0</strong><small></small></div>
        </div>
        <p data-status role="status"></p>
      </div>
      <form class="shuffle-setup" aria-labelledby="shuffle-setup-title">
        <h3 id="shuffle-setup-title">Set up your match</h3>
        <label data-room-picker>Room <select data-room>${Object.entries(
          SHUFFLEBOARD_ROOMS,
        )
          .map(([id, name]) => `<option value="${id}">${name}</option>`)
          .join("")}</select></label>
        <label>Players <select data-mode>
          <option value="cpu">1P · vs. computer</option>
          <option value="local">2P · local versus</option>
        </select></label>
        <button type="submit" data-begin>Start game</button>
        <button type="button" data-exit>← Games</button>
      </form>
      <div class="shuffle-minimap" data-minimap hidden>
        <span>Scoring zones</span>
        <canvas width="122" height="177" aria-label="Top-down scoring zone with aim line and pucks"></canvas>
      </div>
      <div class="shuffle-power" hidden>
        <span>Power</span>
        <div class="shuffle-meter"><meter aria-label="Shot power" min="0" max="1" value="0"></meter><b aria-hidden="true"></b><i aria-hidden="true"></i></div>
      </div>
      <button type="button" class="shuffle-record-trigger" data-record-player aria-label="Record player" aria-controls="shuffle-record-panel" aria-expanded="false" hidden>♫ Records</button>
      <section id="shuffle-record-panel" class="shuffle-record-panel" data-record-panel aria-labelledby="shuffle-record-title" hidden>
        <h3 id="shuffle-record-title">Record player</h3>
        <button type="button" data-record-close aria-label="Close record list">×</button>
        <p data-record-status role="status"></p>
        <div data-record-songs></div>
        <button type="button" data-record-stop>Stop playback</button>
        <audio preload="none"></audio>
      </section>
      <div class="shuffle-shot" hidden>
        <button type="button" data-action>Tap to throw</button>
        <span data-shortcuts>A / D aim · Space throw</span>
      </div>
    </div>
    ${pauseScreen(TITLE, HOW_TO, { showEyebrow: false })}`;
  const previousTitle = document.title;
  document.title = "Shuffleboard — MINI GAMES";
  document.body.append(page);
  const q = (selector) => page.querySelector(selector);
  const aimKeys = new Set();
  const records = setupRecordControls(page);
  const touchControls = matchMedia("(pointer: coarse)").matches;
  const setup = q(".shuffle-setup");
  const pauseButton = q("[data-score-pause]");
  const action = q("[data-action]");
  const mode = q("[data-mode]");
  const meter = q("meter");
  const meterFill = q(".shuffle-meter b");
  const shortcuts = q("[data-shortcuts]");
  const room = q("[data-room]");
  const minimap = q("[data-minimap]");
  const mapContext = minimap.querySelector("canvas").getContext("2d");
  let canvas = q("canvas");
  let study;
  let ctx;
  try {
    study = createShuffleboardStudy(canvas);
    canvas.classList.add("shuffle-study");
    try {
      const savedRoom = localStorage.getItem("minigames.shuffleboard.room");
      if (Object.hasOwn(SHUFFLEBOARD_ROOMS, savedRoom)) room.value = savedRoom;
    } catch {
      // Room selection still works when storage is unavailable.
    }
    const applyRoom = () => {
      study.setRoom(room.value);
      canvas.setAttribute(
        "aria-label",
        `Shuffleboard table in the ${SHUFFLEBOARD_ROOMS[room.value]}`,
      );
    };
    room.onchange = () => {
      applyRoom();
      try {
        localStorage.setItem("minigames.shuffleboard.room", room.value);
      } catch {
        // Keep the selected room for this match.
      }
    };
    applyRoom();
  } catch {
    // A canvas that has reserved a WebGL context cannot switch to 2D.
    const fallback = canvas.cloneNode();
    fallback.setAttribute(
      "aria-label",
      "Overhead view of the shuffleboard table",
    );
    canvas.replaceWith(fallback);
    canvas = fallback;
    ctx = canvas.getContext("2d");
    q("[data-room-picker]").hidden = true;
  }
  const band = q(".shuffle-meter i");
  band.style.bottom = `${powerMin * 100}%`;
  band.style.height = `${(powerMax - powerMin) * 100}%`;
  let pucks = [];
  let phase = "setup";
  let scores, shots, end, turn, power, elapsed;
  let activePuck;
  let aimAngle = 0;
  let gesture;
  let paused = false;
  let frame;
  let previous;
  let accumulator = 0;
  const names = () =>
    mode.value === "cpu" ? ["You", "Computer"] : ["Player 1", "Player 2"];

  function update() {
    const labels = names();
    scores.forEach((score, team) => {
      const card = q(`[data-team="${team}"]`);
      card.querySelector("[data-name]").textContent = labels[team];
      card.querySelector("strong").textContent = score;
      card.querySelector("small").textContent =
        `${PUCKS_PER_PLAYER - shots[team]} left`;
      card.classList.toggle(
        "active",
        team === turn && phase !== "end" && phase !== "won",
      );
    });
    q("[data-end]").textContent = `End ${end} · First to ${WIN_SCORE}`;
    const messages = {
      aim: `${labels[turn]} · Aim your shot.`,
      power: `${labels[turn]} · Stop the meter to shoot.`,
      cpu: "Computer is lining up a shot.",
      moving: `${labels[turn]} · Pucks in motion.`,
      review: "Scoring area",
    };
    if (messages[phase]) q("[data-status]").textContent = messages[phase];
    minimap.hidden = phase !== "aim";
    action.hidden = ["moving", "review", "cpu"].includes(phase);
    action.disabled = action.hidden;
    if (action.hidden && document.activeElement === document.body) {
      page.focus({ preventScroll: true });
    }
    shortcuts.hidden = phase !== "aim" && phase !== "power";
    shortcuts.textContent = touchControls
      ? "Drag to aim"
      : phase === "power"
        ? "Space to release"
        : "A / D aim · Space start";
    if (touchControls && phase === "power") shortcuts.hidden = true;
    action.textContent =
      {
        aim: "Tap to throw",
        power: "Tap to release",
        end: "Next end",
        won: "Play again",
      }[phase] ?? "";
  }

  function startTurn() {
    activePuck = undefined;
    phase = turn === 1 && mode.value === "cpu" ? "cpu" : "aim";
    aimAngle = 0;
    elapsed = power = 0;
    update();
  }

  function startEnd() {
    end++;
    pucks = [];
    shots = [0, 0];
    turn = (end - 1) % 2;
    startTurn();
  }

  function restart() {
    scores = [0, 0];
    end = 0;
    startEnd();
  }

  function shoot(puck) {
    activePuck = puck;
    pucks.push(puck);
    shots[turn]++;
    phase = "moving";
    accumulator = 0;
    update();
  }

  function finishShot() {
    if (shots[0] + shots[1] < PUCKS_PER_PLAYER * 2) {
      turn = 1 - turn;
      startTurn();
      if (phase === "aim") action.focus({ preventScroll: true });
      return;
    }
    const { team, points } = scoreEnd(pucks);
    if (points) scores[team] += points;
    const winner = scores.findIndex((score) => score >= WIN_SCORE);
    phase = winner < 0 ? "end" : "won";
    q("[data-status]").textContent =
      winner >= 0
        ? `${names()[winner]} wins ${scores[winner]}–${scores[1 - winner]}!`
        : points
          ? `${names()[team]} scores ${points}.`
          : "No points this end.";
    update();
    action.focus({ preventScroll: true });
  }

  function tick(now) {
    const delta =
      previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!paused && phase !== "setup" && !records.open) {
      elapsed += delta;
      if (phase === "power") {
        power = 1 - Math.abs(((elapsed / 2.2) % 2) - 1);
      } else if (phase === "cpu" && elapsed >= 0.8) {
        shoot(cpuShot(pucks, level));
      } else if (phase === "moving") {
        accumulator += delta;
        while (accumulator >= STEP && phase === "moving") {
          accumulator -= STEP;
          if (!stepPucks(pucks, STEP)) {
            phase = "review";
            elapsed = 0;
            update();
          }
        }
      } else if (phase === "review" && elapsed >= 1.55) {
        finishShot();
      }
      if (phase === "aim") {
        const direction =
          Number(aimKeys.has("KeyD")) - Number(aimKeys.has("KeyA"));
        aimAngle = clampAim(aimAngle + direction * AIM_SPEED * delta);
        if (mapContext) drawScoringMap(mapContext, pucks, aimAngle);
      }
      meter.value = power;
      meterFill.style.height = `${power * 100}%`;
    }
    if (!paused) {
      const guide =
        phase === "aim" || phase === "power"
          ? { aim: aimAngle, team: turn }
          : null;
      if (study) {
        const distance =
          phase === "power"
            ? ((power / powerMax) ** 2 * (TABLE.length - TABLE.launch)) / 100
            : 0;
        const overhead = ["review", "end", "won"].includes(phase);
        study.render(
          now,
          delta,
          pucks,
          guide,
          distance,
          activePuck,
          overhead,
          records.rotation,
        );
        if (phase !== "setup") records.position(study.recordPosition());
      } else if (ctx) {
        drawTable(ctx, pucks, guide);
        if (phase !== "setup") records.position({ x: 0.13, y: 0.34 });
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function activateShot() {
    if (paused || records.open) return;
    if (phase === "aim") {
      phase = "power";
      elapsed = 0;
      update();
    } else if (phase === "power") {
      shoot(launchPuck(turn, aimAngle, power));
    } else if (phase === "end") {
      startEnd();
    } else if (phase === "won") {
      restart();
    }
  }

  action.onclick = activateShot;

  function onKeyDown(event) {
    if (
      paused ||
      phase === "setup" ||
      records.open ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    if (event.code === "Space") {
      if (event.target.closest?.("button:not([data-action]), select, summary"))
        return;
      event.preventDefault();
      if (!event.repeat) activateShot();
      return;
    }
    const direction = event.code;
    if (phase !== "aim" || (direction !== "KeyA" && direction !== "KeyD"))
      return;
    event.preventDefault();
    if (!aimKeys.has(direction)) {
      aimAngle = clampAim(aimAngle + (direction === "KeyA" ? -0.25 : 0.25));
      aimKeys.add(direction);
    }
  }

  const events = new AbortController();
  const listener = { signal: events.signal };
  document.addEventListener("keydown", onKeyDown, listener);
  document.addEventListener(
    "keyup",
    (event) => aimKeys.delete(event.code),
    listener,
  );
  window.addEventListener("blur", () => aimKeys.clear(), listener);

  canvas.onpointerdown = (event) => {
    if (
      paused ||
      phase === "setup" ||
      !event.isPrimary ||
      event.button !== 0 ||
      (phase !== "aim" &&
        phase !== "power" &&
        !study?.recordAt(event.clientX, event.clientY))
    )
      return;
    page.focus({ preventScroll: true });
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      angle: aimAngle,
      dragged: false,
    };
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = (event) => {
    if (event.pointerId !== gesture?.id) {
      if (phase !== "setup" && event.pointerType === "mouse") {
        canvas.style.cursor = study?.recordAt(event.clientX, event.clientY)
          ? "pointer"
          : "";
      }
      return;
    }
    const dx = event.clientX - gesture.x;
    gesture.dragged ||= Math.abs(dx) >= 6;
    if (gesture.dragged && phase === "aim") {
      aimAngle = clampAim(gesture.angle + dx / 7);
    }
  };
  canvas.onpointerup = (event) => {
    if (event.pointerId !== gesture?.id) return;
    if (!gesture.dragged) {
      if (study?.recordAt(event.clientX, event.clientY)) {
        aimKeys.clear();
        records.show();
      } else if (records.open) {
        records.close();
      } else {
        activateShot();
      }
    }
    gesture = undefined;
  };
  canvas.onlostpointercapture = () => {
    gesture = undefined;
  };

  const pause = () => {
    paused = !paused;
    aimKeys.clear();
    gesture = undefined;
    setPauseScreen(page, paused, action.hidden ? page : action);
  };
  setup.onsubmit = (event) => {
    event.preventDefault();
    if (phase !== "setup") return;
    setup.hidden = true;
    q(".shuffle-hud").hidden = false;
    q(".shuffle-power").hidden = false;
    q(".shuffle-shot").hidden = false;
    restart();
    action.focus({ preventScroll: true });
  };
  pauseButton.onclick = () => {
    if (records.open) records.close();
    pause();
  };
  q("[data-pause-resume]").onclick = pause;
  q("[data-pause-restart]").onclick = () => {
    restart();
    pause();
  };
  const exit = () => {
    cancelAnimationFrame(frame);
    events.abort();
    records.dispose();
    study?.dispose();
    page.remove();
    document.title = previousTitle;
    document.getElementById("deploy")?.focus({ preventScroll: true });
  };
  q("[data-exit]").onclick = exit;
  q("[data-pause-home]").onclick = exit;
  bindDialogEscape(page, () => {
    if (phase === "setup") return;
    if (records.open) records.close();
    else pause();
  });
  (study ? room : mode).focus({ preventScroll: true });
  frame = requestAnimationFrame(tick);
}
