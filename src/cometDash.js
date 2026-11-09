import preview from "./assets/modes/comet-dash.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createCometDashScene } from "./cometDashScene.js";
import {
  CHAIN_TIME,
  createCourse,
  createRunner,
  dashLevel,
  extend,
  respawnPoint,
  smashPoints,
  sparklePoints,
  step,
  trim,
} from "../shared/cometDash.js";
import "./cometDash.css";

const TITLE = "Comet Dash";
const HOW_TO =
  "Your runner races across floating sky islands on their own. Jump with Space, W or ↑ (hold it to jump higher, press again in the air for a second jump). Dash with D, R, X, → or Shift to fly straight ahead and smash the glowing crystals. Running into a crystal or the side of an island, or falling into the sky, costs a star. Grab sparkles in a row for more points. On a controller: A jumps, X dashes. On a touch screen, tap the left half to jump and the right half to dash.";
const RESPAWN_DELAY = 1.3;
const JUMP_KEYS = new Set([" ", "w", "arrowup", "z", "k"]);
const DASH_KEYS = new Set(["d", "r", "x", "arrowright", "shift", "l"]);

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const out = audio?.createGain();
  if (out) {
    out.gain.value = 0.9;
    out.connect(audio.destination);
  }
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
    osc.connect(gain).connect(out);
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
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
  };

  // A bright little loop: C – G – Am – F, arpeggiated, with a bass note.
  const CHORDS = [
    [261.6, 329.6, 392, 523.3],
    [196, 246.9, 293.7, 392],
    [220, 261.6, 329.6, 440],
    [174.6, 220, 261.6, 349.2],
  ];
  const BEAT = 60 / 140 / 2; // eighth notes at 140 bpm
  let music = false,
    timer = 0,
    nextAt = 0,
    note = 0;
  function schedule() {
    if (!music || audio?.state !== "running") return;
    while (nextAt < audio.currentTime + 0.15) {
      const chord = CHORDS[Math.floor(note / 8) % 4];
      const i = [0, 1, 2, 3, 2, 1, 2, 3][note % 8];
      const at = nextAt - audio.currentTime;
      if (at >= 0) {
        tone(chord[i] * 2, at, BEAT * 0.9, "triangle", 0.025);
        if (note % 4 === 0) tone(chord[0] / 2, at, BEAT * 3.5, "square", 0.018);
        if (note % 8 === 4) noise(0.03, 0.06, 6000, 4000, at);
      }
      nextAt += BEAT;
      note++;
    }
  }

  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    music(on) {
      if (on === music || !audio) return;
      music = on;
      clearInterval(timer);
      if (on) {
        nextAt = audio.currentTime + 0.05;
        timer = setInterval(schedule, 40);
      }
    },
    jump: () => tone(380, 0, 0.16, "sine", 0.08, 760),
    airJump: () => {
      tone(560, 0, 0.14, "sine", 0.07, 1100);
      tone(840, 0.05, 0.12, "triangle", 0.04, 1400);
    },
    dash: () => {
      noise(0.16, 0.35, 900, 3800);
      tone(220, 0, 0.3, "sawtooth", 0.03, 660);
    },
    land: () => noise(0.05, 0.06, 500, 300),
    sparkle: (chain) => {
      const scale = [784, 880, 988, 1047, 1175, 1319, 1480, 1568, 1760, 1976];
      const f = scale[Math.min(scale.length - 1, chain - 1)];
      tone(f, 0, 0.18, "triangle", 0.06);
      tone(f * 2, 0.03, 0.12, "sine", 0.025);
    },
    smash: (chain) => {
      noise(0.28, 0.35, 5000, 1800);
      noise(0.15, 0.25, 9000, 6000, 0.04);
      const f = 520 * 2 ** (Math.min(5, chain) / 12);
      [1, 1.25, 1.5, 2].forEach((m, i) =>
        tone(f * m, i * 0.04, 0.3, "triangle", 0.05),
      );
    },
    knock: () => {
      noise(0.15, 0.2, 3000, 1500);
      tone(300, 0, 0.2, "triangle", 0.06, 200);
    },
    crash: () => {
      tone(200, 0, 0.6, "sawtooth", 0.07, 50);
      noise(0.25, 0.5, 1200, 200);
    },
    respawn: () =>
      [523, 659, 784].forEach((f, i) =>
        tone(f, i * 0.08, 0.2, "triangle", 0.05),
      ),
    over: () =>
      [523, 440, 349, 262].forEach((f, i) =>
        tone(f, i * 0.16, 0.35, "triangle", 0.06),
      ),
  };
}

export function installCometDash(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "cometdash";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A character dashing with a rainbow comet tail across floating islands in a purple dusk sky, towards a glowing crystal" draggable="false"></span><strong>${TITLE}</strong><small>Race across floating sky islands. Jump the gaps and dash through crystals with a rainbow tail!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = dashLevel(level);
  const bestKey = `comet-dash-best-${level}`;
  const musicKey = "comet-dash-music";
  let best = 0;
  let musicOn = true;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
    musicOn = localStorage.getItem(musicKey) !== "off";
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "comet-dash";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="cd-field">
      <canvas aria-label="A runner racing across floating islands in a dusk sky"></canvas>
      <div class="cd-hud" aria-live="off">
        <span data-score></span><span data-distance></span><span data-stars></span><span data-chain></span>
      </div>
      <div class="cd-pops" data-pops aria-hidden="true"></div>
      <div class="cd-banner" data-banner hidden></div>
      <div class="cd-touch" data-touch hidden>
        <button type="button" tabindex="-1" data-touch-jump aria-label="Jump">⤒<small>JUMP</small></button>
        <button type="button" tabindex="-1" data-touch-dash aria-label="Dash">➤<small>DASH</small></button>
      </div>
      <section class="cd-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="cd-keys">Jump: Space / W / ↑ (hold for higher, again in the air) · Dash: D / → / Shift<br>Controller: A jumps, X dashes · Touch: tap left to jump, right to dash</small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-music aria-pressed="true"></button>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".cd-panel");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let course = createCourse(level);
  let runner = createRunner(0, 0);
  let stars = settings.stars;
  let points = 0;
  let smashes = 0;
  let smashChain = 0;
  let sparkles = 0;
  let chain = 0;
  let chainTimer = 0;
  let down = null; // { at } while waiting to start again after a lost star
  let pressedJump = false;
  let pressedDash = false;
  let jumpHeld = new Set();
  let frame;
  let previous = 0;
  let messageTimer;
  let bannerTimer;

  const score = () => Math.floor(Math.max(0, runner.x)) + points;

  function hud() {
    get("score").textContent = `★ ${score().toLocaleString()}`;
    get("score").setAttribute("aria-label", `Score ${score()}`);
    get("distance").textContent = `${Math.floor(Math.max(0, runner.x))} m`;
    get("stars").textContent =
      "✦".repeat(stars) + "✧".repeat(settings.stars - stars);
    get("stars").setAttribute("aria-label", `${stars} stars left`);
    get("chain").textContent = chain > 1 ? `✨ ×${Math.min(10, chain)}` : "";
  }

  function say(text, hold = 2200) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function banner(text, hold = 1100) {
    const el = get("banner");
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), hold);
  }

  function pop(text, x, y, kind = "") {
    const at = scene.screen(x, y);
    const el = document.createElement("span");
    el.className = `cd-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function music() {
    get("music").textContent = musicOn ? "♪ Music on" : "♪ Music off";
    get("music").setAttribute("aria-pressed", String(musicOn));
    sfx.music(musicOn && state === "playing");
  }

  function lose(event) {
    stars--;
    chain = smashChain = 0;
    sfx.crash();
    scene.poof(runner.x, runner.y);
    const why =
      event.type === "fall"
        ? "Into the clouds!"
        : event.what === "crystal"
          ? "Crystal crash! Dash to smash them."
          : "Bonk! Jump up onto the islands.";
    if (stars > 0) {
      banner(stars === 1 ? "Last star!" : `${stars} stars left`, 1300);
      say(why, 2400);
      down = { at: RESPAWN_DELAY };
    } else {
      say(why, 0);
      down = { at: RESPAWN_DELAY, over: true };
    }
    hud();
  }

  function respawn() {
    const at = respawnPoint(course, runner.x);
    runner = createRunner(at.x, at.y);
    runner.safe = 1.6;
    scene.snapCamera(at.y);
    sfx.respawn();
    down = null;
    pressedJump = pressedDash = false;
  }

  function play(dt) {
    if (down) {
      down.at -= dt;
      if (down.at <= 0) {
        if (down.over) return finish();
        respawn();
      }
      return;
    }
    extend(course, runner.x + 140);
    trim(course, runner.x - 40);
    const input = {
      jump: pressedJump,
      dash: pressedDash,
      jumpHeld: jumpHeld.size > 0,
    };
    pressedJump = pressedDash = false;
    chainTimer -= dt;
    if (chainTimer <= 0) chain = 0;
    for (const e of step(runner, course, input, dt)) {
      if (e.type === "jump") sfx.jump();
      else if (e.type === "airJump") sfx.airJump();
      else if (e.type === "dash") sfx.dash();
      else if (e.type === "land") {
        if (e.fall > 8) {
          sfx.land();
          scene.land(runner.x, runner.y);
        }
      } else if (e.type === "sparkle") {
        chain++;
        chainTimer = CHAIN_TIME;
        sparkles++;
        const p = sparklePoints(chain);
        points += p;
        sfx.sparkle(chain);
        scene.sparkle(e.sparkle);
        if (chain === 5 || chain === 10)
          pop(`Sparkle ×${chain}!`, e.sparkle.x, e.sparkle.y + 1, "small");
      } else if (e.type === "smash") {
        smashChain++;
        smashes++;
        const p = smashPoints(smashChain);
        points += p;
        sfx.smash(smashChain);
        scene.smash(e.crystal);
        pop(
          smashChain > 1 ? `Smash ×${smashChain}! +${p}` : `Smash! +${p}`,
          e.crystal.x,
          e.crystal.y + 3,
          "big",
        );
        if (smashes === 1) say("Crystal smashed! Keep it up.", 1800);
      } else if (e.type === "knock") {
        smashChain = 0;
        chain = 0;
        sfx.knock();
        scene.knock(e.crystal);
        say("Bonk! Dash into crystals to smash them for points.", 2600);
      } else if (e.type === "crash" || e.type === "fall") lose(e);
    }
    if (runner.x > 60 && runner.x - dt * runner.speed <= 60 && !smashes)
      say(
        touchy
          ? "Tap the right side to dash!"
          : "Dash (D or →) to smash crystals!",
        2600,
      );
    for (const m of [500, 1000, 2000, 3000, 5000])
      if (runner.x >= m && runner.x - dt * runner.speed < m) {
        banner(`${m.toLocaleString()} m!`, 1200);
        sfx.respawn();
      }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") play(dt);
    scene.draw(state === "paused" ? 0 : dt, {
      runner,
      course,
      hidden: !!down,
      blink: runner.safe > 0,
      dashing: runner.dash > 0,
    });
    hud();
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    down = null;
    sfx.music(false);
    sfx.over();
    get("pause").hidden = true;
    get("touch").hidden = true;
    const total = score();
    const previousBest = best;
    if (total > best) {
      best = total;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const distance = Math.floor(Math.max(0, runner.x));
    results.show(
      `You ran ${distance.toLocaleString()} m!`,
      total > previousBest && previousBest > 0
        ? "That's a new best! What a streak across the sky."
        : total === previousBest && total
          ? "That ties your best!"
          : previousBest
            ? `Your best: ${previousBest.toLocaleString()}. Smash crystals in a row for big points!`
            : "Smash crystals and grab sparkles in a row for big points.",
      [
        [total.toLocaleString(), "SCORE"],
        [smashes, "CRYSTALS SMASHED"],
        [sparkles, "SPARKLES"],
        [best.toLocaleString(), "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      course = createCourse(level);
      runner = createRunner(0, 0);
      stars = settings.stars;
      points = smashes = smashChain = sparkles = chain = 0;
      chainTimer = 0;
      down = null;
      scene.reset();
      get("pops").replaceChildren();
      say(
        touchy
          ? "Tap the left side to jump!"
          : "Press Space to jump. Hold it to jump higher!",
        3200,
      );
    }
    pressedJump = pressedDash = false;
    jumpHeld.clear();
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    get("touch").hidden = !touchy;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    music();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    jumpHeld.clear();
    sfx.music(false);
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
  get("music").onclick = () => {
    musicOn = !musicOn;
    try {
      localStorage.setItem(musicKey, musicOn ? "on" : "off");
    } catch {}
    music();
    canvas.focus({ preventScroll: true });
  };
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else dialog.close();
  });

  const keyName = (event) =>
    event.key === "Shift" ? "shift" : (event.key || "").toLowerCase();
  function jumpDown(id) {
    if (!jumpHeld.has(id)) pressedJump = true;
    jumpHeld.add(id);
  }
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const k = keyName(event);
    if (JUMP_KEYS.has(k)) {
      event.preventDefault();
      if (!event.repeat) jumpDown(`key:${k}`);
    } else if (DASH_KEYS.has(k)) {
      event.preventDefault();
      if (!event.repeat) pressedDash = true;
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    jumpHeld.delete(`key:${keyName(event)}`);
  });

  // Touch and mouse: left half jumps (hold for higher), right half dashes.
  function pointer(event, side) {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (side === "jump") jumpDown(`ptr:${event.pointerId}`);
    else pressedDash = true;
  }
  const lift = (event) => jumpHeld.delete(`ptr:${event.pointerId}`);
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer(
      event,
      event.clientX - rect.left < rect.width / 2 ? "jump" : "dash",
    );
  });
  get("touch-jump").addEventListener("pointerdown", (e) => pointer(e, "jump"));
  get("touch-dash").addEventListener("pointerdown", (e) => pointer(e, "dash"));
  for (const type of ["pointerup", "pointercancel"])
    dialog.addEventListener(type, lift);

  const touchy = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    clearTimeout(bannerTimer);
    window.removeEventListener("blur", pause);
    sfx.music(false);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createCometDashScene(canvas, avatar);
  dialog.showModal();
  extend(course, 140);
  music();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Race across the sky!";
  get("details").textContent =
    `You run by yourself. Jump the gaps between the floating islands and dash through the glowing crystals. You have ${settings.stars} stars: lose them all and the run is over.${best ? ` Your best: ${best.toLocaleString()}.` : ""}`;
  get("play").focus();
}
