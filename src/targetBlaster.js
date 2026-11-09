import preview from "./assets/modes/target-blaster.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createTargetBlasterScene } from "./targetBlasterScene.js";
import {
  PUMP_INTERVAL,
  RESPAWN_TIME,
  TARGETS,
  WAVES_PER_ROUND,
  blasterLevel,
  blasterSummary,
  bullseyeRing,
  canFire,
  fire,
  hitPoints,
  pump,
  shotsLeft,
  wavePlan,
  waveName,
  waveStartPressure,
} from "../shared/targetBlaster.js";
import "./targetBlaster.css";

const INTRO_TIME = 1.8;
const OUTRO_TIME = 2;
const PUMP_TIME = 0.2;
const AIM_SPEED = 1.3;
const HOW_TO =
  "Aim with the mouse, a tap, or the arrow keys / WASD, and fire with a click, tap, Space or Enter. Every shot uses a tenth of the pressure meter. Pump with R, E, right-click, or the Pump button (hold it to keep pumping). Knock down cans and bottles, and hit sliding bullseyes near the middle for more points. Each wave ends when its timer runs out, and the tank refills between waves.";

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
  const noise = (volume, length, type, frequency, start = 0) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.5;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(audio.currentTime + start);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    spray: () => noise(0.22, 0.22, "bandpass", 2600),
    pump: () => {
      noise(0.16, 0.06, "lowpass", 900);
      noise(0.12, 0.06, "lowpass", 1400, 0.1);
      tone(180, 0, 0.12, "triangle", 0.05, 240);
    },
    dry: () => {
      noise(0.06, 0.08, "highpass", 3000);
      tone(260, 0.04, 0.12, "sine", 0.05, 160);
    },
    can: () => {
      tone(1250, 0, 0.25, "square", 0.035, 980);
      tone(1870, 0.01, 0.2, "triangle", 0.05);
      noise(0.1, 0.08, "highpass", 2500);
    },
    bottle: () => {
      tone(2100, 0, 0.18, "sine", 0.07);
      tone(2650, 0.06, 0.2, "sine", 0.06);
    },
    board: (points) => {
      noise(0.2, 0.12, "lowpass", 600);
      tone(160, 0, 0.15, "sine", 0.12, 90);
      if (points >= 50)
        [784, 988, 1175].forEach((f, i) =>
          tone(f, 0.08 + i * 0.08, 0.2, "triangle", 0.08),
        );
    },
    splat: () => noise(0.08, 0.12, "lowpass", 1500),
    tick: () => tone(1000, 0, 0.06, "square", 0.03),
    horn: () => {
      tone(523, 0, 0.18, "triangle", 0.08);
      tone(784, 0.16, 0.3, "triangle", 0.08);
    },
    buzzer: () => {
      tone(392, 0, 0.25, "triangle", 0.08, 330);
      tone(523, 0.22, 0.4, "triangle", 0.08);
    },
  };
}

export function installTargetBlaster(getLevel) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "targetblaster";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A water blaster aimed at a backyard target range" draggable="false"></span><strong>Target Blaster</strong><small>Soak cans, bottles and sliding bullseyes with a water blaster. Pump between shots to keep the pressure up. Three timed waves.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel());
}

function open(level) {
  document.exitPointerLock?.();
  const settings = blasterLevel(level);
  const bestKey = `target-blaster-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "target-blaster";
  dialog.setAttribute("aria-label", "Target Blaster");
  dialog.innerHTML = `
    <header><strong>Target Blaster</strong><div><button data-exit>Back to games</button></div></header>
    <div class="blaster-field">
      <canvas aria-label="A backyard with cans, bottles and sliding bullseye targets, seen over a water blaster"></canvas>
      <div class="blaster-crosshair" data-crosshair hidden aria-hidden="true"></div>
      <div class="blaster-popups" data-popups aria-hidden="true"></div>
      <div class="blaster-banner" data-banner hidden role="status"><strong data-banner-title></strong><small data-banner-detail></small></div>
      <div class="blaster-meter" data-meter hidden role="meter" aria-label="Pressure" aria-valuemin="0" aria-valuemax="100">
        <span>Pressure</span>
        <div class="blaster-gauge"><i data-meter-fill></i><b></b></div>
        <small data-meter-shots></small>
      </div>
      <section class="blaster-panel">
        <h2 data-heading></h2><p data-details></p><button data-play></button>
      </section>
    </div>
    <footer>
      <div class="blaster-hud"><span data-wave></span><span data-time></span><span data-score></span></div>
      <span data-message role="status"></span>
      <button class="blaster-pump" data-pump hidden>Pump</button>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Target Blaster", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  // Keyboard play needs focus inside the dialog, so the canvas holds it.
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".blaster-panel");
  const sfx = sounds();
  const keys = new Set();

  let state = "ready"; // ready | playing | paused | finished
  let phase = "intro"; // intro | play | outro
  let phaseTime = 0;
  let wave = 1;
  let waveTime = 0;
  let pressure = waveStartPressure();
  let aim = { x: 0, y: -0.05 };
  let pumpWait = 0;
  let pumpHeld = false;
  let shots = 0;
  let hits = [];
  let waveScore = 0;
  let flights = [];
  let respawns = [];
  let lastTick = 0;
  let previous = 0;
  let frame;

  // Controller: aim, fire and pump while a wave runs; buttons otherwise.
  dialog.padPlaying = () => state === "playing";

  function say(text) {
    get("message").textContent = text;
  }

  function hud() {
    const summary = blasterSummary(hits, shots);
    const left = Math.max(0, Math.ceil(settings.time - waveTime));
    get("wave").textContent = `Wave ${wave}/${WAVES_PER_ROUND}`;
    get("time").textContent =
      `Time 0:${String(phase === "intro" ? settings.time : left).padStart(2, "0")}`;
    get("time").classList.toggle("low", phase === "play" && left <= 5);
    get("score").textContent = `Score ${summary.score}`;
  }

  function meter() {
    const meterEl = get("meter");
    const fill = get("meter-fill");
    const n = shotsLeft(pressure);
    fill.style.setProperty("--level", String(pressure));
    meterEl.classList.toggle("empty", !canFire(pressure));
    meterEl.classList.toggle("low", n > 0 && n <= 2);
    meterEl.setAttribute("aria-valuenow", String(Math.round(pressure * 100)));
    get("meter-shots").textContent = canFire(pressure)
      ? `${n} shot${n === 1 ? "" : "s"}`
      : "Pump!";
    get("pump").classList.toggle("hot", !canFire(pressure));
  }

  function placeCrosshair() {
    const crosshair = get("crosshair");
    crosshair.style.left = `${((aim.x + 1) / 2) * canvas.clientWidth}px`;
    crosshair.style.top = `${((1 - aim.y) / 2) * canvas.clientHeight}px`;
  }

  function banner(title, detail) {
    get("banner-title").textContent = title;
    get("banner-detail").textContent = detail;
    get("banner").hidden = false;
    // Restart the pop-in animation.
    get("banner").style.animation = "none";
    void get("banner").offsetWidth;
    get("banner").style.animation = "";
  }

  function popup(point, text, kind) {
    const at = scene.toScreen(point);
    const el = document.createElement("span");
    el.className = `blaster-popup ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("popups").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function startWave() {
    phase = "intro";
    phaseTime = 0;
    waveTime = 0;
    waveScore = 0;
    lastTick = 0;
    pressure = waveStartPressure();
    flights = [];
    respawns = [];
    scene.setWave(wavePlan(wave, level));
    banner(`Wave ${wave}`, waveName(wave));
    sfx.horn();
    say(
      wave === 1
        ? "Aim and fire! Pump when the meter runs low."
        : "Tank refilled!",
    );
    meter();
    hud();
  }

  function shoot() {
    if (state !== "playing" || phase === "outro") return;
    if (phase === "intro") return;
    const result = fire(pressure);
    if (!result.fired) {
      sfx.dry();
      scene.dribble();
      say("Out of pressure! Pump to fire again.");
      get("meter").classList.remove("shake");
      void get("meter").offsetWidth;
      get("meter").classList.add("shake");
      return;
    }
    pressure = result.pressure;
    shots++;
    sfx.spray();
    const travel = scene.spray(aim);
    flights.push({ aim: { ...aim }, landsIn: travel });
    if (!canFire(pressure)) say("Empty! Pump to build pressure.");
    else if (get("message").textContent.startsWith("Out")) say("");
    meter();
  }

  function doPump() {
    if (state !== "playing" || pressure >= 1) return;
    pressure = pump(pressure, settings.pump);
    pumpWait = PUMP_INTERVAL;
    sfx.pump();
    scene.pumped();
    if (get("message").textContent.match(/^(Out|Empty)/)) say("");
    meter();
  }

  function land(flight) {
    const result = scene.trace(flight.aim);
    if (result.id === null) {
      scene.splash(result.point, 0.7);
      sfx.splat();
      return;
    }
    const target = wavePlan(wave, level)[result.id];
    const offset = Math.min(1, result.offset);
    const points = hitPoints(target.kind, offset);
    hits.push({ kind: target.kind, points });
    waveScore += points;
    scene.knock(result.id, result.point);
    respawns.push({ id: result.id, in: RESPAWN_TIME });
    if (target.kind === "can") sfx.can();
    else if (target.kind === "bottle") sfx.bottle();
    else sfx.board(points);
    const label =
      target.kind === "bullseye"
        ? bullseyeRing(offset).label
        : TARGETS[target.kind].name;
    popup(
      result.point,
      `+${points} ${label}`,
      points >= 50 ? "top" : target.kind,
    );
    hud();
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    get("pump").hidden = true;
    get("meter").hidden = true;
    get("crosshair").hidden = true;
    get("banner").hidden = true;
    keys.clear();
    pumpHeld = false;
    const summary = blasterSummary(hits, shots);
    const record = summary.score > best;
    if (record) {
      best = summary.score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const parts = [];
    if (summary.cans)
      parts.push(`${summary.cans} can${summary.cans === 1 ? "" : "s"}`);
    if (summary.bottles)
      parts.push(
        `${summary.bottles} bottle${summary.bottles === 1 ? "" : "s"}`,
      );
    if (summary.bullseyes)
      parts.push(
        `${summary.bullseyes} bullseye${summary.bullseyes === 1 ? "" : "s"}`,
      );
    results.show(
      summary.accuracy >= 70 && summary.hits >= 10
        ? "Sharpshooter!"
        : summary.hits
          ? "Soaked 'em!"
          : "Keep practising!",
      `${parts.length ? `You soaked ${parts.join(", ")}.` : "No targets soaked this time."}${summary.centres ? ` ${summary.centres} right in the middle!` : ""}${record ? " New best!" : ""}`,
      [
        [summary.score, "SCORE"],
        [summary.hits, "TARGETS HIT"],
        [`${summary.accuracy}%`, "ACCURACY"],
        [best, "BEST SCORE"],
      ],
    );
  }

  function step(dt) {
    phaseTime += dt;
    // Aim with the keyboard (or controller stick).
    const dx = Number(keys.has("right")) - Number(keys.has("left"));
    const dy = Number(keys.has("up")) - Number(keys.has("down"));
    if (dx || dy) {
      aim.x = Math.max(-0.97, Math.min(0.97, aim.x + dx * AIM_SPEED * dt));
      aim.y = Math.max(-0.9, Math.min(0.9, aim.y + dy * AIM_SPEED * dt));
    }
    pumpWait -= dt;
    if (pumpHeld && pumpWait <= 0) doPump();

    if (phase === "intro") {
      if (phaseTime >= INTRO_TIME) {
        phase = "play";
        phaseTime = 0;
        get("banner").hidden = true;
      }
      hud();
      return;
    }

    for (const flight of flights) flight.landsIn -= dt;
    for (const flight of flights.filter((f) => f.landsIn <= 0)) land(flight);
    flights = flights.filter((f) => f.landsIn > 0);

    if (phase === "play") {
      waveTime += dt;
      for (const spawn of respawns) spawn.in -= dt;
      for (const spawn of respawns.filter((s) => s.in <= 0))
        scene.revive(spawn.id);
      respawns = respawns.filter((s) => s.in > 0);
      const left = Math.ceil(settings.time - waveTime);
      if (left <= 3 && left > 0 && left !== lastTick) {
        lastTick = left;
        sfx.tick();
      }
      if (waveTime >= settings.time) {
        waveTime = settings.time;
        phase = "outro";
        phaseTime = 0;
        sfx.buzzer();
        banner(
          wave < WAVES_PER_ROUND ? `Wave ${wave} done!` : "Time's up!",
          `+${waveScore} points`,
        );
        say("");
      }
      hud();
    } else if (
      phase === "outro" &&
      phaseTime >= OUTRO_TIME &&
      !flights.length
    ) {
      if (wave < WAVES_PER_ROUND) {
        wave++;
        startWave();
      } else finish();
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    scene.draw(dt, { aim, pressure, waveTime, pumpTime: PUMP_TIME });
    if (state === "playing") placeCrosshair();
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function start(reset) {
    results.hide();
    sfx.resume();
    const resumed = state === "paused" && !reset;
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    get("pump").hidden = false;
    get("meter").hidden = false;
    get("crosshair").hidden = false;
    setPauseScreen(dialog, false, canvas);
    if (!resumed) {
      wave = 1;
      shots = 0;
      hits = [];
      aim = { x: 0, y: -0.05 };
      keys.clear();
      pumpHeld = false;
      get("popups").replaceChildren();
      startWave();
    }
    canvas.focus({ preventScroll: true });
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    keys.clear();
    pumpHeld = false;
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Target Blaster",
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

  // Pump button: tap for one stroke, hold to keep pumping.
  const pumpButton = get("pump");
  pumpButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pumpButton.setPointerCapture?.(event.pointerId);
    pumpHeld = true;
    if (pumpWait <= 0) doPump();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    pumpButton.addEventListener(type, () => {
      pumpHeld = false;
      canvas.focus({ preventScroll: true });
    });
  // Keyboard activation of the focused button (pointer handles clicks).
  pumpButton.addEventListener("click", (event) => {
    if (event.detail === 0) doPump();
  });

  const aimKeys = {
    ArrowLeft: "left",
    a: "left",
    ArrowRight: "right",
    d: "right",
    ArrowUp: "up",
    w: "up",
    ArrowDown: "down",
    s: "down",
  };
  const pumpKeys = new Set(["r", "e", "Shift"]);
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === " " || key === "Enter") {
      if (event.target.closest?.("button")) return;
      event.preventDefault();
      if (!event.repeat) shoot();
      return;
    }
    if (pumpKeys.has(key)) {
      event.preventDefault();
      if (!pumpHeld && pumpWait <= 0) doPump();
      pumpHeld = true;
      return;
    }
    if (aimKeys[key]) {
      event.preventDefault();
      keys.add(aimKeys[key]);
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (pumpKeys.has(key)) pumpHeld = false;
    keys.delete(aimKeys[key]);
  });

  const aimFrom = (event) => {
    const bounds = canvas.getBoundingClientRect();
    aim = {
      x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    };
  };
  canvas.addEventListener("pointermove", (event) => {
    if (state !== "playing" || event.pointerType === "touch") return;
    aimFrom(event);
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (event.button === 2) {
      doPump();
      return;
    }
    if (event.button !== 0) return;
    aimFrom(event);
    shoot();
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createTargetBlasterScene(canvas);
  scene.setWave(wavePlan(1, level));
  dialog.showModal();
  meter();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Target Blaster";
  get("details").textContent =
    `Three ${settings.time}-second waves. Soak cans, bottles and sliding bullseyes. Every shot uses a tenth of the pressure meter, so pump between shots (R, right-click, or the Pump button) and pump again when it runs dry.${best ? ` Your best: ${best}.` : ""}`;
  get("play").textContent = "Start blasting";
  get("play").focus();
}
