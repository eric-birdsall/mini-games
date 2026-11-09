import preview from "./assets/modes/river-crossing.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createRiverCrossingScene } from "./riverCrossingScene.js";
import {
  CROSSINGS_PER_ROUND,
  HOP_TIME,
  crossingName,
  crossingPlan,
  drift,
  hopTarget,
  isSafeRow,
  land,
  riverLevel,
  riverSummary,
  stillOnBranch,
} from "../shared/riverCrossing.js";
import "./riverCrossing.css";

const SPLASH_TIME = 1.1;
const WIN_TIME = 1.8;
const HOW_TO =
  "Hop with the arrow keys or WASD, by tapping where you want to go, or with the arrow buttons. Hop onto drifting branches when they float by and ride them, but hop off before they carry you out of the river. Rocks never move, so they're safe spots to wait on. The ring shows where a forward hop lands: green means safe right now. Fall in and you start again from the last rock or bank you stood on.";

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
  const noise = (volume, length, cutoff) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      audio.sampleRate * length,
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    hop: () => tone(420, 0, 0.14, "triangle", 0.07, 760),
    wood: () => tone(180, 0, 0.1, "triangle", 0.12, 120),
    rock: () => {
      tone(900, 0, 0.05, "square", 0.03);
      noise(0.08, 0.06, 2500);
    },
    grass: () => noise(0.06, 0.08, 900),
    splash: () => {
      noise(0.35, 0.55, 1400);
      tone(520, 0, 0.3, "sine", 0.08, 160);
    },
    crossed: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.09, 0.24, "triangle", 0.09),
      ),
    over: () =>
      [392, 330, 262].forEach((f, i) =>
        tone(f, i * 0.16, 0.3, "triangle", 0.08),
      ),
  };
}

export function installRiverCrossing(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "rivercrossing";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A player crossing a river on floating logs and rocks" draggable="false"></span><strong>River Crossing</strong><small>Hop across the river on drifting branches and rocks. Don't fall in! Three crossings.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = riverLevel(level);
  const bestKey = `river-crossing-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "river-crossing";
  dialog.setAttribute("aria-label", "River Crossing");
  dialog.innerHTML = `
    <header><strong>River Crossing</strong><div><button data-exit>Back to games</button></div></header>
    <div class="river-field">
      <canvas aria-label="A river with drifting branches and rocks, seen from the near bank"></canvas>
      <div class="river-pop" data-pop hidden aria-hidden="true"></div>
      <div class="river-banner" data-banner hidden role="status"><strong data-banner-title></strong><small data-banner-detail></small></div>
      <section class="river-panel">
        <h2 data-heading></h2><p data-details></p><button data-play></button>
      </section>
    </div>
    <footer>
      <div class="river-hud"><span data-crossing></span><span data-lives></span><span data-score></span></div>
      <span data-message role="status"></span>
      <div class="river-pad" data-pad hidden>
        <button data-hop="up" aria-label="Hop forward">▲</button>
        <button data-hop="left" aria-label="Hop left">◀</button>
        <button data-hop="down" aria-label="Hop back">▼</button>
        <button data-hop="right" aria-label="Hop right">▶</button>
      </div>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("River Crossing", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick hops while playing; navigates buttons otherwise.
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".river-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let crossing = 1;
  let rows = crossingPlan(1, level);
  let t = 0; // river time: branches move with it
  let player = { row: 0, x: 4 };
  let checkpoint = { ...player };
  let hop = null; // { from, to, time }
  let queued = null;
  let splash = null; // seconds since falling in
  let won = null; // seconds since reaching the far bank
  let lives = settings.lives;
  let splashes = 0;
  let crossings = [];
  let current;
  let previous = 0;
  let frame;
  let popTimer;

  function hud() {
    const summary = riverSummary([...crossings, current], splashes, 0);
    get("crossing").textContent = `Crossing ${crossing}/${CROSSINGS_PER_ROUND}`;
    get("lives").textContent =
      "❤️".repeat(lives) + "🤍".repeat(Math.max(0, settings.lives - lives));
    get("lives").setAttribute("aria-label", `${lives} hearts left`);
    get("score").textContent = `Score ${summary.score}`;
  }

  function say(text) {
    get("message").textContent = text;
  }

  function pop(text) {
    const el = get("pop");
    el.textContent = text;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(popTimer);
    popTimer = setTimeout(() => (el.hidden = true), 900);
  }

  function banner(title, detail) {
    get("banner-title").textContent = title;
    get("banner-detail").textContent = detail;
    get("banner").hidden = false;
  }

  function beginCrossing(n) {
    crossing = n;
    rows = crossingPlan(n, level);
    // Start partway into the loop so branches are already spread out.
    t = 3 + n * 1.7;
    player = { row: 0, x: 4 };
    checkpoint = { ...player };
    hop = queued = splash = won = null;
    current = { done: false, furthest: 0, rows: rows.length - 1, time: 0 };
    scene.setCrossing(rows);
    scene.snapCamera(0);
    banner(`Crossing ${n}`, crossingName(n));
    setTimeout(() => {
      if (crossing === n && won === null) get("banner").hidden = true;
    }, 1600);
    say(
      n === 1
        ? "Hop onto a branch when one floats by!"
        : n === CROSSINGS_PER_ROUND
          ? "Last one: the water's rushing!"
          : "",
    );
    hud();
  }

  function tryHop(dir) {
    if (state !== "playing" || splash !== null || won !== null) return;
    if (hop) {
      queued = dir;
      return;
    }
    const [dx, dRow] = {
      up: [0, 1],
      down: [0, -1],
      left: [-1, 0],
      right: [1, 0],
    }[dir];
    const to = hopTarget(rows, player, dx, dRow);
    if (to.row === player.row && to.x === player.x) return;
    hop = { from: { ...player }, to, time: 0 };
    sfx.hop();
  }

  function fallIn(text) {
    splash = 0;
    splashes++;
    lives--;
    hop = queued = null;
    sfx.splash();
    say(text);
    pop("Splash!");
    hud();
  }

  function landHop() {
    const { to } = hop;
    hop = null;
    const result = land(rows, to.row, to.x, t);
    if (!result.safe) {
      player = { ...to };
      fallIn(
        rows[to.row].kind === "rocks"
          ? "Missed the rock! Line up before you hop."
          : "Into the water! Wait for a branch to float by.",
      );
      return;
    }
    player = { row: to.row, x: result.x };
    const kind = rows[to.row].kind;
    if (kind === "branches") sfx.wood();
    else if (kind === "rocks") sfx.rock();
    else sfx.grass();
    if (isSafeRow(rows[to.row])) checkpoint = { ...player };
    if (to.row > current.furthest) {
      current.furthest = to.row;
      hud();
    }
    if (to.row === rows.length - 1) {
      reachFarBank();
      return;
    }
    say("");
    if (queued) {
      const next = queued;
      queued = null;
      tryHop(next);
    }
  }

  function reachFarBank() {
    won = 0;
    current.done = true;
    crossings.push(current);
    sfx.crossed();
    banner(
      "Made it across!",
      crossing < CROSSINGS_PER_ROUND
        ? `${Math.round(current.time)} seconds`
        : "You crossed the whole river!",
    );
    say("");
    hud();
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    get("pad").hidden = true;
    get("banner").hidden = true;
    if (!current.done) crossings.push(current);
    const summary = riverSummary(crossings, splashes, lives);
    const record = summary.score > best;
    if (record) {
      best = summary.score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    if (summary.crossed < CROSSINGS_PER_ROUND) sfx.over();
    results.show(
      summary.crossed === CROSSINGS_PER_ROUND
        ? splashes === 0
          ? "Not a drop on you!"
          : "All the way across!"
        : summary.crossed
          ? "Soggy but brave!"
          : "Splish splash!",
      `${summary.crossed} of ${CROSSINGS_PER_ROUND} crossings made${summary.crossed ? ` in ${summary.time} seconds` : ""}. ${splashes ? `You fell in ${splashes} time${splashes === 1 ? "" : "s"}.` : "You never fell in!"}${record ? " New best!" : ""}`,
      [
        [summary.score, "SCORE"],
        [summary.crossed, "CROSSINGS"],
        [splashes, "SPLASHES"],
        [best, "BEST SCORE"],
      ],
    );
  }

  // The ring that shows where a forward hop would land, and if it's safe.
  function hint() {
    if (hop || splash !== null || won !== null || state !== "playing")
      return null;
    const to = hopTarget(rows, player, 0, 1);
    if (to.row === player.row) return null;
    const result = land(rows, to.row, to.x, t + HOP_TIME);
    return { row: to.row, x: result.safe ? result.x : to.x, safe: result.safe };
  }

  function step(dt) {
    t += dt;
    if (won !== null) {
      won += dt;
      if (won >= WIN_TIME) {
        if (crossing < CROSSINGS_PER_ROUND) beginCrossing(crossing + 1);
        else finish();
      }
      return;
    }
    current.time += dt;
    if (splash !== null) {
      splash += dt;
      if (splash >= SPLASH_TIME) {
        splash = null;
        if (lives <= 0) return finish();
        player = { ...checkpoint };
        say("Try again! Rocks and banks are safe spots.");
      }
      return;
    }
    if (hop) {
      hop.time += dt;
      if (hop.time >= HOP_TIME) landHop();
      return;
    }
    const row = rows[player.row];
    if (row.kind === "branches") {
      const next = drift(row, player.x, dt);
      if (next === null) return fallIn("The branch floated away with you!");
      player.x = next;
      if (!stillOnBranch(row, player.x, t)) fallIn("Slipped off the branch!");
    }
  }

  function draw(dt = 0) {
    scene.draw(dt, {
      t,
      player,
      hop: hop && { ...hop, f: Math.min(1, hop.time / HOP_TIME) },
      splash,
      won,
      hint: hint(),
    });
    if (!get("pop").hidden) {
      const at = scene.playerOnScreen();
      get("pop").style.left = `${at.x}px`;
      get("pop").style.top = `${at.y}px`;
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function start(reset) {
    results.hide();
    if (reset) {
      lives = settings.lives;
      splashes = 0;
      crossings = [];
      beginCrossing(1);
    }
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    get("pad").hidden = false;
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
    queued = null;
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "River Crossing",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => start(true);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  for (const button of dialog.querySelectorAll("[data-hop]")) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      tryHop(button.dataset.hop);
    });
    // Keyboard activation of a focused arrow button (Enter / Space).
    button.addEventListener("click", (event) => {
      if (event.detail === 0) tryHop(button.dataset.hop);
    });
  }
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else dialog.close();
  });

  const hopKeys = {
    ArrowUp: "up",
    w: "up",
    " ": "up",
    ArrowDown: "down",
    s: "down",
    ArrowLeft: "left",
    a: "left",
    ArrowRight: "right",
    d: "right",
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const dir = hopKeys[key];
    if (!dir) return;
    if (key === " " && event.target.closest?.("button")) return;
    event.preventDefault();
    if (!event.repeat) tryHop(dir);
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  // Tap or click: hop toward that spot (forward, back, left or right).
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const spot = scene.pick(event.clientX, event.clientY);
    if (!spot) return tryHop("up");
    const dRow = spot.row - player.row;
    const dx = spot.x - player.x;
    if (Math.abs(dRow) < 0.45 && Math.abs(dx) < 0.45) return;
    // Rows are a little deeper than columns are wide; favour forward hops.
    if (Math.abs(dRow) * 1.2 >= Math.abs(dx)) tryHop(dRow > 0 ? "up" : "down");
    else tryHop(dx > 0 ? "right" : "left");
  });

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(popTimer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createRiverCrossingScene(canvas, avatar);
  scene.setCrossing(rows);
  current = { done: false, furthest: 0, rows: rows.length - 1, time: 0 };
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Cross the river";
  get("details").textContent =
    `Three crossings. Hop onto drifting branches and ride them, rest on rocks, and reach the far bank without falling in. You have ${settings.lives} hearts.${best ? ` Your best: ${best}.` : ""}`;
  get("play").textContent = "Start hopping";
  get("play").focus();
}
