import {
  SHOTS,
  BOARD,
  BUMPER_RADIUS,
  placeClashBumper,
  STEP,
  MAX_ANGLE,
  launchClashPuck,
  clashLaunchPosition,
  clashLaunchSpot,
  LAUNCH_LIMIT,
  stepClash,
  enforceClashLanding,
  scoreClash,
  clashMatchWinner,
  chooseClashShot,
} from "../shared/puckClash.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import {
  drawPuckClash,
  setupBoardPosition,
  launchLinePointer,
} from "./puckClashScene.js";
import "./puckClash.css";

const title = "Puck Clash";
const instructions = `Place a bumper on your half before round one. Both players shoot together. Each new puck must settle on the opponent’s half or hit a rival puck. Side rails protect the area behind each launch line. A short puck or one that falls off is worth one point to the other player. Most points after ${SHOTS} rounds wins. If tied, keep the board and play sudden death until someone leads.`;
const inputHelp =
  "Tap or drag the launch line, use the Launch spot slider, or move with J / L. Aim with ← →, set power with ↑ ↓ and use Q / E for curl. Space locks your shot. On Xbox, use the right stick for launch position, left stick or D-pad for aim and power, X for curl, and A or RT to lock.";
const teamNames = ["Blue", "Orange"];
const freshShot = () => ({ aim: 0, power: 0.7, curl: 0 });
const knockoutDuration = 0.95;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const directions = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  KeyJ: "launchLeft",
  KeyL: "launchRight",
  ArrowDown: "down",
};

export function installPuckClash(audio) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "puckclash";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    '<span class="map-thumb"><img alt="" draggable="false"></span><strong>Puck Clash</strong><small>Fire together. Knock rival pucks off the open sides.</small>';
  const preview = document.createElement("canvas");
  preview.width = 480;
  preview.height = 296;
  drawPuckClash(
    preview,
    480,
    296,
    0,
    [
      { team: 0, x: -0.65, z: 1.2, fall: null },
      { team: 1, x: 0.46, z: -0.8, fall: null },
    ],
    { aim: 0.04, power: 0.56 },
  );
  entry.querySelector("img").src = preview.toDataURL();
  entry.onclick = () => openPuckClash(audio);
  games.append(entry);
}

function openPuckClash(audio) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "puck-clash";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `
    <canvas tabindex="-1" aria-label="First-person view down the shuffleboard"></canvas>
    <header class="clash-hud" hidden>
      <div class="clash-score">
        <span data-score-blue></span><strong data-round></strong><span data-score-orange></span>
      </div>
      <button type="button" data-pause aria-label="Pause game">Ⅱ</button>
    </header>
    <div class="clash-status" role="status" hidden></div>
    <section class="clash-bumper-setup" aria-label="Bumper placement" hidden>
      <button type="button" data-confirm-bumper>Lock bumper</button>
    </section>
    <section class="clash-controls" hidden>
      <label class="clash-launch-control">Launch spot <input type="range" min="-100" max="100" value="0" data-launch><output data-launch-label>Center</output></label>
      <div class="clash-aim">
        <button type="button" data-aim="-1" aria-label="Aim left">←</button>
        <button type="button" data-aim="1" aria-label="Aim right">→</button>
      </div>
      <label>Power <input type="range" min="0" max="100" value="70" data-power><output data-percent></output></label>
      <label>Curl <input type="range" min="-2" max="2" value="0" data-curl><output data-curl-label>Straight</output></label>
      <button type="button" data-lock>Lock shot</button>
    </section>
    <section class="clash-overlay">
      <div class="clash-card">
        <h2></h2><p></p>
        <div class="clash-actions">
          <button type="button" data-primary></button>
          <button type="button" data-friend>Play a friend</button>
          <button type="button" data-exit>Back to games</button>
        </div>
      </div>
    </section>
    ${pauseScreen(title, `${instructions} ${inputHelp}`)}
  `;
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  const hud = dialog.querySelector(".clash-hud");
  const status = dialog.querySelector(".clash-status");
  const setup = dialog.querySelector(".clash-bumper-setup");
  const confirmBumper = get("confirm-bumper");
  const curlControl = get("curl");
  const launchControl = get("launch");
  const lock = get("lock");
  const controls = dialog.querySelector(".clash-controls");
  const overlay = dialog.querySelector(".clash-overlay");
  const held = new Map();
  let state = "menu";
  let mode = "cpu";
  let paused = false;
  let pucks = [];
  let bumpers = [];
  let placement;
  let roundNotice = "";
  let round = 1;
  let team = 0;
  let shot = freshShot();
  let committed = [];
  let accumulator = 0;
  let lastTime = 0;
  let frame;
  let drag = null;
  let launchBlocked = false;
  let overhead = 0;
  let knockouts = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function panel(heading, copy, action, onClick) {
    overlay.hidden = false;
    overlay.querySelector("h2").textContent = heading;
    overlay.querySelector("p").textContent = copy;
    get("friend").hidden = state !== "menu";
    get("exit").hidden = state === "handoff";
    const primary = get("primary");
    primary.textContent = action;
    primary.onclick = onClick;
    primary.focus({ preventScroll: true });
  }

  function updateHud() {
    const [blue, orange] = scoreClash(pucks);
    get("score-blue").textContent = `Blue ${blue} pts`;
    get("score-orange").textContent = `Orange ${orange} pts`;
    get("round").textContent =
      state === "setup"
        ? "Bumper placement"
        : round > SHOTS
          ? `Sudden death ${round - SHOTS}`
          : `Round ${round} / ${SHOTS}`;
    setup.hidden = state !== "setup";
    get("power").value = Math.round(shot.power * 100);
    get("percent").textContent = `${get("power").value}%`;
    const curlLabel = ["Left 2", "Left 1", "Straight", "Right 1", "Right 2"][
      shot.curl * 2 + 2
    ];
    curlControl.value = shot.curl * 2;
    curlControl.setAttribute("aria-valuetext", curlLabel);
    get("curl-label").textContent = curlLabel;
    if (state === "aim") {
      const worldX = (team === 0 ? 1 : -1) * shot.origin.x;
      const value = Math.round((worldX / LAUNCH_LIMIT) * 100);
      const label =
        value === 0
          ? "Center"
          : `${Math.abs(value)}% ${value < 0 ? "left" : "right"}`;
      launchControl.disabled = Math.abs(shot.origin.z) !== BOARD.launch;
      launchControl.value = value;
      launchControl.setAttribute(
        "aria-valuetext",
        launchBlocked ? `${label}, occupied` : label,
      );
      get("launch-label").textContent = launchControl.disabled
        ? "Line full"
        : label;
      lock.disabled = launchBlocked;
    }
    controls.hidden = state !== "aim";
    hud.hidden = state === "menu" || state === "handoff";
    status.hidden = !["setup", "aim", "slide"].includes(state);
    const message =
      state === "setup"
        ? `${teamNames[team]} · ${confirmBumper.disabled ? "Bumper must fit on your half, clear of walls, the puck and diamond" : "Tap, drag or use the arrows / stick to position your bumper"}`
        : state === "aim"
          ? `${teamNames[team]} · ${launchBlocked ? "Choose an open launch spot" : "Aim your shot"}${roundNotice ? ` · ${roundNotice}` : ""}`
          : knockouts.length
            ? `${teamNames[knockouts.at(-1).team]} +1 · ${knockouts.at(-1).source ? "Knockout" : "Puck off the board"}`
            : "Both pucks launched";
    if (status.textContent !== message) status.textContent = message;
  }

  function aimFor(player) {
    state = "aim";
    if (team !== player) overhead = 0;
    team = player;
    shot = {
      ...freshShot(),
      origin: clashLaunchPosition(team, pucks, bumpers),
    };
    launchBlocked = false;
    overlay.hidden = true;
    updateHud();
    canvas.focus({ preventScroll: true });
  }

  function start(selectedMode) {
    audio?.unlock();
    mode = selectedMode;
    pucks = [];
    round = 1;
    bumpers = [];
    overhead = 0;
    knockouts = [];
    committed = [];
    roundNotice = "";
    if (mode === "cpu") {
      bumpers.push(
        placeClashBumper(1, {
          x: (Math.random() - 0.5) * 2.3,
          z: -0.8 - Math.random() * 2.9,
        }),
      );
    }
    setupFor(0);
  }

  function moveBumper(position) {
    placement = { ...position, valid: !!placeClashBumper(team, position) };
    confirmBumper.disabled = !placement.valid;
    updateHud();
  }

  function setupFor(player) {
    state = "setup";
    team = player;
    overlay.hidden = true;
    moveBumper({ x: 0, z: team === 0 ? 2.1 : -2.1 });
    canvas.focus({ preventScroll: true });
  }

  function lockBumper() {
    if (state !== "setup" || paused || !placement.valid) return;
    bumpers.push(placeClashBumper(team, placement));
    clearHeld();
    if (mode === "friend" && team === 0) {
      state = "handoff";
      updateHud();
      panel(
        "Pass to Orange",
        "Orange positions a bumper on their half.",
        "Ready",
        () => setupFor(1),
      );
      return;
    }
    beginRound();
  }

  function beginRound() {
    committed = [];
    if (mode === "cpu") committed[1] = chooseClashShot(pucks, bumpers);
    aimFor(0);
  }

  function lockShot() {
    if (state !== "aim" || paused || launchBlocked) return;
    committed[team] = shot;
    held.clear();
    drag = null;
    if (mode === "friend" && team === 0) {
      state = "handoff";
      updateHud();
      panel(
        "Pass to Orange",
        "Blue’s shot is locked. Orange aims from the opposite end.",
        "Ready",
        () => aimFor(1),
      );
      return;
    }
    for (const puck of pucks) delete puck.lastRivalHit;
    pucks.push(
      launchClashPuck(0, committed[0], committed[0].origin),
      launchClashPuck(1, committed[1], committed[1].origin),
    );
    state = "slide";
    accumulator = 0;
    updateHud();
    canvas.focus({ preventScroll: true });
  }

  function resolveRound() {
    const short = enforceClashLanding(pucks.slice(-2));
    roundNotice =
      short.length === 2
        ? "Both shots fell short"
        : short.length === 1
          ? `${teamNames[short[0].team]} fell short`
          : "";
    const points = scoreClash(pucks);
    const winner = clashMatchWinner(round, points);
    if (winner === null) {
      round++;
      if (round === SHOTS + 1) {
        roundNotice = [
          roundNotice,
          "Tied after regulation. Take the lead to win",
        ]
          .filter(Boolean)
          .join(" · ");
      }
      beginRound();
      return;
    }
    const [blue, orange] = points;
    state = "result";
    updateHud();
    panel(
      `${teamNames[winner]} wins`,
      `Blue ${blue} · Orange ${orange} points${roundNotice ? ` · ${roundNotice}` : ""}`,
      "Play again",
      () => start(mode),
    );
  }

  function togglePause() {
    if (state === "menu") {
      dialog.close();
      return;
    }
    paused = !paused;
    held.clear();
    drag = null;
    setPauseScreen(dialog, paused, overlay.hidden ? canvas : get("primary"));
  }

  bindDialogEscape(dialog, togglePause);
  dialog.padPlaying = () =>
    !paused && ["setup", "aim", "slide"].includes(state);
  get("pause").onclick = togglePause;
  get("pause-resume").onclick = togglePause;
  get("pause-home").onclick = get("exit").onclick = () => dialog.close();
  get("pause-restart").onclick = () => {
    togglePause();
    start(mode);
  };
  get("friend").onclick = () => start("friend");
  lock.onclick = lockShot;
  function moveLaunch(screenX) {
    if (state !== "aim" || paused || launchControl.disabled) return;
    const facing = team === 0 ? 1 : -1;
    const x = clamp(screenX, -LAUNCH_LIMIT, LAUNCH_LIMIT) * facing;
    launchBlocked = !clashLaunchSpot(team, x, pucks, bumpers);
    shot.origin = { x, z: BOARD.launch * facing };
    updateHud();
  }
  launchControl.oninput = () =>
    moveLaunch((Number(launchControl.value) * LAUNCH_LIMIT) / 100);
  confirmBumper.onclick = lockBumper;
  get("power").oninput = (event) => {
    shot.power = Number(event.target.value) / 100;
    updateHud();
  };
  function setCurl(value) {
    shot.curl = clamp(value, -1, 1);
    updateHud();
  }
  curlControl.oninput = () => setCurl(Number(curlControl.value) / 2);
  dialog.querySelectorAll("[data-aim]").forEach((button) => {
    button.onclick = () => {
      shot.aim = clamp(
        shot.aim + Number(button.dataset.aim) * 0.045,
        -MAX_ANGLE,
        MAX_ANGLE,
      );
    };
  });
  function moveBumperToPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const position = setupBoardPosition(
      canvas.clientWidth,
      canvas.clientHeight,
      team,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    if (
      position &&
      Math.abs(position.x) <= BOARD.halfWidth &&
      Math.abs(position.z) <= BOARD.halfLength
    ) {
      moveBumper(position);
    }
  }

  function pointerLaunchX(event, requireNearLine) {
    const bounds = canvas.getBoundingClientRect();
    return launchLinePointer(
      canvas.clientWidth,
      canvas.clientHeight,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      requireNearLine,
    );
  }

  canvas.onpointerdown = (event) => {
    if (paused || !["setup", "aim"].includes(state) || event.button !== 0)
      return;
    const launchX =
      state === "aim" && overhead <= 0.01 && !launchControl.disabled
        ? pointerLaunchX(event, true)
        : null;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      aim: shot.aim,
      launch: launchX !== null,
    };
    if (drag.launch) moveLaunch(launchX);
    canvas.setPointerCapture(event.pointerId);
    if (state === "setup") moveBumperToPointer(event);
  };
  canvas.onpointermove = (event) => {
    if (drag?.id !== event.pointerId) return;
    if (state === "setup") {
      moveBumperToPointer(event);
      return;
    }
    if (drag.launch) {
      moveLaunch(pointerLaunchX(event, false));
      return;
    }
    shot.aim = clamp(
      drag.aim +
        ((event.clientX - drag.x) * MAX_ANGLE) /
          Math.min(320, canvas.clientWidth * 0.45),
      -MAX_ANGLE,
      MAX_ANGLE,
    );
  };
  canvas.onlostpointercapture = () => {
    drag = null;
  };
  dialog.addEventListener("keydown", (event) => {
    if (paused || !["setup", "aim"].includes(state)) return;
    if (
      [get("power"), curlControl, launchControl].includes(event.target) &&
      event.isTrusted &&
      event.code.startsWith("Arrow")
    )
      return;
    if (state === "aim" && ["KeyQ", "KeyE", "KeyR"].includes(event.code)) {
      if (!event.repeat) {
        if (event.code === "KeyR")
          setCurl(shot.curl === 1 ? -1 : shot.curl + 0.5);
        else setCurl(shot.curl + (event.code === "KeyE" ? 0.5 : -0.5));
      }
    } else if (directions[event.code]) {
      held.set(event.code, directions[event.code]);
    } else if (
      event.code === "Space" &&
      (!event.isTrusted || event.target.tagName !== "BUTTON")
    ) {
      if (!event.repeat) {
        if (state === "setup") lockBumper();
        else lockShot();
      }
    } else return;
    event.preventDefault();
  });
  dialog.addEventListener("keyup", (event) => held.delete(event.code));
  window.addEventListener("blur", clearHeld);
  function clearHeld() {
    held.clear();
    drag = null;
  }

  function highlightKnockouts() {
    for (const puck of pucks) {
      if (puck.fall !== 0) continue;
      const scorer = 1 - puck.team;
      knockouts.push({
        x: Math.sign(puck.x) * BOARD.halfWidth,
        z: puck.z,
        source: pucks[puck.lastRivalHit],
        team: scorer,
        age: 0,
      });
      audio?.tone(740, 0.065, 0, 0.08);
      audio?.tone(210, 0.13, 0.015, 0.09);
    }
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused && held.size && (state === "aim" || state === "setup")) {
      const active = new Set(held.values());
      const axis = (positive, negative) =>
        Number(active.has(positive)) - Number(active.has(negative));
      if (state === "setup") {
        const facing = team === 0 ? 1 : -1;
        const limit = BOARD.halfWidth - BUMPER_RADIUS;
        moveBumper({
          x: clamp(
            placement.x + axis("right", "left") * facing * dt * 2.4,
            -limit,
            limit,
          ),
          z:
            clamp(
              placement.z * facing + axis("down", "up") * dt * 2.4,
              BUMPER_RADIUS,
              BOARD.halfLength - BUMPER_RADIUS,
            ) * facing,
        });
      } else {
        shot.aim = clamp(
          shot.aim + axis("right", "left") * dt * 0.65,
          -MAX_ANGLE,
          MAX_ANGLE,
        );
        shot.power = clamp(shot.power + axis("up", "down") * dt * 0.7, 0, 1);
        const slide = axis("launchRight", "launchLeft");
        if (slide && !launchControl.disabled) {
          const facing = team === 0 ? 1 : -1;
          moveLaunch(shot.origin.x * facing + slide * dt * 2);
        } else updateHud();
      }
    }
    if (!paused && state === "slide") {
      for (const event of knockouts) event.age += dt;
      knockouts = knockouts.filter((event) => event.age < knockoutDuration);
      accumulator += dt;
      while (accumulator >= STEP && state === "slide") {
        accumulator -= STEP;
        const moving = stepClash(pucks, STEP, bumpers);
        highlightKnockouts();
        if (!moving && !knockouts.length) resolveRound();
      }
      updateHud();
    }
    if (!paused) {
      const watching = state === "slide" || state === "result";
      overhead = reducedMotion.matches
        ? Number(watching)
        : clamp(overhead + ((watching ? 1 : -1) * dt) / 0.45, 0, 1);
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    if (width && height) {
      if (
        canvas.width !== Math.round(width * scale) ||
        canvas.height !== Math.round(height * scale)
      ) {
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
      }
      drawPuckClash(
        canvas,
        width,
        height,
        team,
        pucks,
        state === "aim" && !paused && overhead <= 0.01
          ? { ...shot, blocked: launchBlocked }
          : null,
        state === "setup" ? [] : bumpers,
        state === "setup" ? placement : null,
        overhead * overhead * (3 - 2 * overhead),
        knockouts,
      );
    }
    frame = requestAnimationFrame(animate);
  }

  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", clearHeld);
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  panel(title, `${instructions} ${inputHelp}`, "Play CPU", () => start("cpu"));
  lastTime = performance.now();
  frame = requestAnimationFrame(animate);
}
