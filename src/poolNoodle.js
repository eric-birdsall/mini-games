import preview from "./assets/modes/pool-noodle-chop.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPoolNoodleScene, stationX } from "./poolNoodleScene.js";
import {
  MISS,
  PERFECT,
  ROUNDS,
  STATIONS,
  TOO_HIGH,
  botSwing,
  cutAt,
  lastChance,
  roundPlan,
  scoreCut,
  winners,
} from "../shared/poolNoodle.js";
import {
  AVATARS,
  CHARACTERS,
  COLORS,
  avatarChoice,
} from "../shared/avatars.js";
import "./poolNoodle.css";

const HOW_TO = `A rack above your station drops a pool noodle with a stripe around it. Swing your foam sword as the stripe passes the blade's path (the coloured sweep at your station). Cutting right through the stripe scores ${PERFECT}. Cutting below it scores less the further away you are. Cutting above the stripe costs ${-TOO_HIGH}, and missing the noodle costs ${-MISS}. You get one swing per noodle. Highest total after ${ROUNDS} rounds wins. Press Space (or tap the screen) to swing.`;
// Seconds after the last noodle passes the blade before the next round.
const ROUND_PAUSE = 1.9;

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
  const noise = (volume, length, cutoff, type = "bandpass", sweep) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const f = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * f) ** 2;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, audio.currentTime);
    if (sweep)
      filter.frequency.exponentialRampToValueAtTime(
        sweep,
        audio.currentTime + length,
      );
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    rattle: () => {
      for (let i = 0; i < 4; i++)
        setTimeout(() => noise(0.05, 0.04, 2400), i * 90);
    },
    clack: () => {
      tone(900, 0, 0.05, "square", 0.04);
      noise(0.08, 0.06, 1800);
    },
    whoosh: (volume = 0.12) => noise(volume, 0.2, 600, "bandpass", 2600),
    // A soft foam fwump; perfect cuts ring too.
    chop: (points) => {
      noise(0.2, 0.09, 420, "lowpass");
      tone(180, 0, 0.1, "sine", 0.12, 90);
      if (points >= PERFECT)
        [784, 988, 1175, 1568].forEach((f, i) =>
          tone(f, 0.05 + i * 0.07, 0.22, "triangle", 0.08),
        );
      else if (points >= 15)
        [659, 880].forEach((f, i) =>
          tone(f, 0.05 + i * 0.07, 0.18, "triangle", 0.07),
        );
    },
    high: () =>
      [392, 330].forEach((f, i) =>
        tone(f, 0.08 + i * 0.12, 0.18, "triangle", 0.07),
      ),
    miss: () => {
      tone(220, 0.05, 0.3, "triangle", 0.06, 140);
    },
    thump: () => noise(0.06, 0.08, 260, "lowpass"),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
    done: () =>
      [523, 440, 392, 523].forEach((f, i) =>
        tone(f, i * 0.14, 0.24, "triangle", 0.07),
      ),
  };
}

export function installPoolNoodle(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "poolnoodle";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Players with foam swords at pool noodle racks" draggable="false"></span><strong>Pool Noodle Chop</strong><small>Swing your foam sword as the stripe on the falling noodle passes. Closest cuts score up to 20!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

// The yard's four critters: yours first, then three different ones, each in
// a different colour.
function yardCast(mine) {
  const characters = [
    mine.character,
    ...AVATARS.filter((c) => c !== mine.character && c !== "frog"),
  ];
  const colors = [
    mine.color,
    ...Object.keys(COLORS).filter((c) => c !== mine.color),
  ];
  const step = 3;
  return Array.from({ length: STATIONS }, (_, i) => ({
    character: i
      ? characters[1 + ((i * step) % (characters.length - 1))]
      : mine.character,
    color: colors[i % colors.length],
  }));
}

// Negative numbers with a proper minus sign.
const minus = (n) => (n < 0 ? `−${-n}` : String(n));
const cm = (metres) => Math.max(1, Math.round(Math.abs(metres) * 100));

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `pool-noodle-best-${level}`;
  let best = null;
  try {
    const saved = localStorage.getItem(bestKey);
    if (saved !== null && saved !== "") best = Number(saved);
    if (!Number.isFinite(best)) best = null;
  } catch {}

  const cast = yardCast(avatar).map((a) => ({
    avatar: a,
    color: COLORS[a.color],
    critter: CHARACTERS[a.character].name,
  }));

  const dialog = document.createElement("dialog");
  dialog.className = "pool-noodle";
  dialog.setAttribute("aria-label", "Pool Noodle Chop");
  dialog.innerHTML = `
    <header><strong>Pool Noodle Chop</strong><div><button data-exit>Back to games</button></div></header>
    <div class="noodle-field">
      <canvas aria-label="Four chopping stations in a backyard, each with a pool noodle hanging from a rack and a critter holding a foam sword"></canvas>
      <div class="noodle-tags" aria-hidden="true">${cast.map((_, i) => `<span class="noodle-tag" data-tag="${i}"></span><strong class="noodle-station-score" data-station-score="${i}"></strong>`).join("")}</div>
      <div class="noodle-pops" data-pops aria-hidden="true"></div>
      <section class="noodle-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="noodle-modes">
          <button class="primary" data-play>Play</button>
          <button data-two>2 players</button>
        </div>
        <small class="noodle-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <div class="noodle-hud"><span data-round></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Pool Noodle Chop", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: A (Space) swings for player 1 (padBridge).
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".noodle-panel");
  const tags = [...dialog.querySelectorAll("[data-tag]")];
  const stationScores = [...dialog.querySelectorAll("[data-station-score]")];
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let mode = "computer"; // computer | two
  let plan = [];
  let roundIndex = 0;
  let round = null;
  let seed = 1;
  let t = 0;
  let nextAt = Infinity;
  let rattled = false;
  let clacked = false;
  let stations = [];
  let previous = 0;
  let frame;
  let messageTimer;

  const humanStations = () => (mode === "two" ? [0, STATIONS - 1] : [0]);

  function makeStations() {
    const humans = humanStations();
    stations = cast.map((c, i) => {
      const human = humans.indexOf(i);
      return {
        ...c,
        human: human >= 0 ? human : null,
        name:
          human < 0
            ? c.critter
            : mode === "two"
              ? `Player ${human + 1}`
              : "You",
        total: 0,
        cuts: [],
        swingAt: null,
        botAt: null,
        done: false,
      };
    });
  }

  function hud() {
    get("round").textContent =
      `Round ${Math.min(roundIndex + 1, ROUNDS)} of ${ROUNDS}`;
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function pop(i, text, kind) {
    const at = scene.cutScreen(i);
    const el = document.createElement("span");
    el.className = `noodle-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function startRound(index) {
    roundIndex = index;
    round = plan[index];
    t = 0;
    nextAt = Infinity;
    rattled = clacked = false;
    stations.forEach((s, i) => {
      s.swingAt = null;
      s.done = false;
      s.botAt =
        s.human === null
          ? Math.max(round.release + 0.2, botSwing(round, level, seed, i))
          : null;
    });
    scene.setRound(round, index + Math.floor(seed % 5));
    get("pops").replaceChildren();
    hud();
    say(
      index === ROUNDS - 1
        ? "Last noodle! Watch the stripe…"
        : `Round ${index + 1}: watch the stripe…`,
      1500,
    );
  }

  function describe(s, result) {
    const human = s.human !== null;
    const who = mode === "two" ? `${s.name}: ` : "";
    if (result.kind === "perfect")
      return `${who}Perfect cut right through the stripe! +${PERFECT}`;
    if (result.kind === "low")
      return `${who}${cm(result.off + round.width / 2)} cm below the stripe: +${result.points}`;
    if (result.kind === "high")
      return `${who}Just above the stripe, a bit late: ${minus(result.points)}`;
    return human && s.swingAt !== null && s.swingAt < round.release + 0.6
      ? `${who}Too early, the noodle wasn't there yet: ${minus(result.points)}`
      : `${who}Missed the noodle: ${minus(result.points)}`;
  }

  function resolve(s, i, height) {
    if (s.done) return;
    s.done = true;
    const result = scoreCut(round, height);
    s.total += result.points;
    s.cuts.push(result.points);
    const human = s.human !== null;
    if (height !== null) {
      scene.chop(i, height, t);
      if (human) sfx.chop(result.points);
      else sfx.thump();
    } else {
      scene.drop(i, t);
    }
    if (human && result.kind === "high") sfx.high();
    if (human && result.kind === "miss") sfx.miss();
    const label =
      result.kind === "perfect"
        ? `Perfect! +${PERFECT}`
        : result.kind === "low"
          ? `+${result.points}`
          : result.kind === "high"
            ? `Too high ${minus(result.points)}`
            : `Miss ${minus(result.points)}`;
    pop(i, label, `${result.kind}${human ? "" : " small"}`);
    if (human) say(describe(s, result), 2600);
  }

  function swing(i) {
    const s = stations[i];
    if (!s || s.swingAt !== null || s.done) return;
    if (t < round.release) {
      if (s.human !== null)
        say(
          mode === "two"
            ? `${s.name}: wait for the noodle to drop!`
            : "Wait for the noodle to drop!",
          1400,
        );
      return;
    }
    s.swingAt = t;
    scene.swing(i, t);
    sfx.whoosh(s.human !== null ? 0.14 : 0.04);
    resolve(s, i, cutAt(round, t));
  }

  function step(dt) {
    t += dt;
    if (!rattled && t >= round.release - 0.45) {
      rattled = true;
      sfx.rattle();
    }
    if (!clacked && t >= round.release) {
      clacked = true;
      sfx.clack();
    }
    stations.forEach((s, i) => {
      if (s.botAt !== null && s.swingAt === null && t >= s.botAt) swing(i);
    });
    const gone = lastChance(round);
    if (t > gone)
      stations.forEach((s, i) => {
        if (!s.done) resolve(s, i, null);
      });
    if (nextAt === Infinity && stations.every((s) => s.done))
      nextAt = Math.max(t, gone) + ROUND_PAUSE;
    if (t >= nextAt) {
      if (roundIndex + 1 < ROUNDS) startRound(roundIndex + 1);
      else finish();
    }
  }

  function draw(dt = 0) {
    scene.draw(dt, { t });
    stations.forEach((s, i) => {
      const head = scene.toScreen(stationX(i) - 0.62, 2.35, -0.2);
      const feet = scene.toScreen(stationX(i), 0, 1.3);
      const tag = tags[i];
      tag.textContent = s.name;
      tag.style.left = `${head.x}px`;
      tag.style.top = `${head.y}px`;
      tag.style.setProperty("--who", s.color);
      tag.classList.toggle("human", s.human !== null);
      const score = stationScores[i];
      score.textContent = minus(s.total);
      score.style.left = `${feet.x}px`;
      score.style.top = `${feet.y}px`;
      score.style.setProperty("--who", s.color);
    });
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    const won = winners(stations.map((s) => s.total));
    const me = stations[0];
    let record = false;
    const hadBest = best !== null;
    if (mode === "computer" && (best === null || me.total > best)) {
      best = me.total;
      record = true;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const humanWon = won.some((i) => stations[i].human !== null);
    if (humanWon) sfx.win();
    else sfx.done();
    const names = won.map((i) => stations[i].name);
    const title =
      mode === "computer" && won.includes(0)
        ? won.length > 1
          ? "You tied for first!"
          : "Champion chopper!"
        : won.length > 1
          ? `${names.join(" and ")} tie!`
          : `${names[0]} win${names[0] === "You" ? "" : "s"}!`;
    const cuts = (s) => s.cuts.map(minus).join(", ");
    const humans = stations.filter((s) => s.human !== null);
    const detail =
      mode === "two"
        ? humans.map((s) => `${s.name}'s cuts: ${cuts(s)}.`).join(" ")
        : `Your cuts: ${cuts(me)}.${record && hadBest ? " New best!" : best !== null && !record ? ` Your best: ${minus(best)}.` : ""}`;
    results.show(
      title,
      detail,
      stations.map((s) => [minus(s.total), s.name.toUpperCase()]),
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      seed = (Math.random() * 2 ** 32) >>> 0;
      plan = roundPlan(level, seed);
      makeStations();
      startRound(0);
      say(
        mode === "two"
          ? "Player 1: A or Space · Player 2: L or Enter"
          : "Press Space or tap to swing as the stripe passes!",
        3000,
      );
    }
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
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
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Pool Noodle Chop",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => {
    mode = "computer";
    start(true);
  };
  get("two").onclick = () => {
    mode = "two";
    start(true);
  };
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

  // Keys: Space / A (and anything else in one-player) swings; with two
  // players A / Space is player 1 and L / Enter is player 2.
  const swingKeys = [" ", "a", "l", "Enter", "ArrowDown", "ArrowUp", "s", "k"];
  function who(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!swingKeys.includes(key)) return null;
    const human =
      mode === "two" &&
      ["l", "Enter", "ArrowDown", "ArrowUp", "k"].includes(key)
        ? 1
        : 0;
    return stations.findIndex((s) => s.human === human);
  }
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const i = who(event);
    if (i === null || i < 0) return;
    event.preventDefault();
    if (!event.repeat) swing(i);
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  // Tap to swing; with two players each gets their own half of the screen.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const bounds = canvas.getBoundingClientRect();
    const right = event.clientX - bounds.left > bounds.width / 2;
    const human = mode === "two" && right ? 1 : 0;
    swing(stations.findIndex((s) => s.human === human));
  });

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  makeStations();
  const scene = createPoolNoodleScene(canvas, cast);
  plan = roundPlan(level, seed);
  round = plan[0];
  scene.setRound(round, 0);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  const rivals = cast.slice(1).map((c) => c.critter);
  get("heading").textContent = "Chop the noodle!";
  get("details").textContent =
    `A rack drops a pool noodle with a stripe around it. Swing your foam sword as the stripe passes the blade. Right through the stripe scores ${PERFECT}; below it scores less the further off you are. Above the stripe costs ${-TOO_HIGH} and missing costs ${-MISS}. Most points after ${ROUNDS} rounds wins! You're up against ${rivals.slice(0, -1).join(", ")} and ${rivals.at(-1)}.${best !== null ? ` Your best: ${minus(best)}.` : ""}`;
  get("keys").textContent =
    "Space or tap to swing · 2 players: A / Space and L / Enter, or tap your half of the screen";
  get("play").focus();
}
