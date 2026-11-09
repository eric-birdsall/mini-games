import preview from "./assets/modes/kickabout.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createKickaboutScene } from "./kickaboutScene.js";
import { AVATARS, COLORS, avatarChoice } from "../shared/avatars.js";
import {
  MATCH_TIME,
  createMatch,
  shotPower,
  step,
} from "../shared/kickabout.js";
import "./kickabout.css";

const TITLE = "Kickabout";
const HOW_TO =
  "3 against 3 in the backyard. Each side has a goalkeeper, who plays by themselves, and two players. You play whichever of your two has the ball: run with WASD or the arrow keys, hold Space to power up a shot and let go to shoot (hold ↑ or ↓ to aim high or low on the screen), and press R or E to pass to your teammate. When the other team has it, you play the one nearest the ball: run into them to win it, press Space to lunge for it, or R to switch. Most goals in 3 minutes wins; a tie goes to golden goal. On a controller: left stick runs, A shoots or lunges, X passes or switches. On a touch screen, drag on the left side to run and use the buttons on the right.";
const COLOR_NAMES = {
  sunshine: "orange",
  sky: "blue",
  rose: "pink",
  mint: "green",
  violet: "purple",
};
const SHOOT_KEYS = new Set([" ", "z", "enter"]);
const PASS_KEYS = new Set(["r", "e", "x", "shift"]);
const MOVE_KEYS = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const out = audio?.createGain();
  if (out) {
    out.gain.value = 0.9;
    out.connect(audio.destination);
  }
  const ok = () => audio?.state === "running";
  const tone = (freq, start, length, type = "sine", volume = 0.1, slide) => {
    if (!ok()) return;
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
  const noise = (volume, length, from, to = from, start = 0, attack = 0) => {
    if (!ok()) return;
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
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    if (attack) {
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + attack);
    } else gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    kick: (power) => {
      const big = Math.min(1, power / 28);
      tone(140, 0, 0.12, "sine", 0.12 + big * 0.1, 60);
      noise(0.08 + big * 0.1, 0.08, 1800, 700);
    },
    touch: () => tone(220, 0, 0.06, "sine", 0.05, 160),
    whistle: (long) => {
      for (const [at, len] of long
        ? [
            [0, 0.25],
            [0.32, 0.6],
          ]
        : [[0, 0.35]]) {
        tone(2800, at, len, "sine", 0.05, 2700);
        tone(2950, at, len, "square", 0.012, 2850);
      }
    },
    cheer: () => {
      noise(0.16, 2.2, 900, 1400, 0, 0.25);
      noise(0.08, 2, 2400, 3200, 0.1, 0.3);
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 0.05 + i * 0.09, 0.3, "triangle", 0.05),
      );
    },
    groan: () => {
      noise(0.1, 1.1, 500, 300, 0, 0.15);
      tone(330, 0, 0.5, "triangle", 0.05, 220);
    },
    save: () => {
      noise(0.14, 0.12, 1200, 600);
      tone(440, 0.03, 0.15, "triangle", 0.05, 520);
    },
    steal: () => {
      tone(520, 0, 0.08, "triangle", 0.06);
      tone(780, 0.06, 0.1, "triangle", 0.05);
    },
    lunge: () => noise(0.06, 0.18, 1400, 500),
    bounce: () => noise(0.06, 0.07, 700, 400),
    post: () => {
      tone(1200, 0, 0.5, "triangle", 0.06, 1150);
      tone(1800, 0, 0.3, "sine", 0.03);
    },
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.12, 0.35, "triangle", 0.06),
      ),
    lose: () =>
      [523, 440, 349, 262].forEach((f, i) =>
        tone(f, i * 0.16, 0.35, "triangle", 0.06),
      ),
  };
}

export function installKickabout(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "kickabout";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Two teams of critters playing soccer on a striped backyard lawn with a goal at each end" draggable="false"></span><strong>${TITLE}</strong><small>3 v 3 backyard soccer. Dribble, pass and shoot past the keeper!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

// The player's team wears their colour; the other side a contrasting one.
function lineups(avatar) {
  const you = avatarChoice(avatar);
  const others = AVATARS.filter((c) => c !== you.character).sort(
    () => Math.random() - 0.5,
  );
  const theirColor = ["sky", "violet", "mint"].includes(you.color)
    ? "sunshine"
    : "sky";
  const team = (color, characters) => ({
    color,
    players: characters.map((character) => ({ character, color })),
  });
  return [
    team(you.color, [others[0], you.character, others[1]]),
    team(theirColor, others.slice(2, 5)),
  ];
}

const clockText = (t) =>
  `${Math.floor(Math.ceil(t) / 60)}:${String(Math.ceil(t) % 60).padStart(2, "0")}`;

function open(level, avatar) {
  document.exitPointerLock?.();
  const winsKey = `kickabout-wins-${level}`;
  let wins = 0;
  try {
    wins = Math.max(0, Number(localStorage.getItem(winsKey)) || 0);
  } catch {}
  const teams = lineups(avatar);

  const dialog = document.createElement("dialog");
  dialog.className = "kickabout";
  dialog.setAttribute("aria-label", TITLE);
  dialog.style.setProperty("--ka-you", COLORS[teams[0].color]);
  dialog.style.setProperty("--ka-them", COLORS[teams[1].color]);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="ka-field">
      <canvas aria-label="A backyard soccer pitch"></canvas>
      <div class="ka-hud" aria-live="off">
        <div class="ka-score">
          <span class="ka-team you">YOU</span><b data-score-you>0</b><span class="ka-dash">–</span><b data-score-them>0</b><span class="ka-team them">THEM</span>
        </div>
        <span class="ka-clock" data-clock></span>
      </div>
      <div class="ka-power" data-power hidden><span></span></div>
      <div class="ka-banner" data-banner hidden></div>
      <div class="ka-stick" data-stick hidden><span></span></div>
      <div class="ka-touch" data-touch hidden>
        <button type="button" tabindex="-1" data-touch-pass><span>⇄</span><small data-pass-label>PASS</small></button>
        <button type="button" tabindex="-1" data-touch-shoot><span>⚽</span><small data-shoot-label>SHOOT</small></button>
      </div>
      <section class="ka-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Kick off</button>
        <small class="ka-keys">Run: WASD / arrows · Shoot: hold and let go of Space · Pass: R or E<br>Defending: run into them, Space lunges, R switches player<br>Controller: stick runs, A shoots, X passes · Touch: drag on the left, buttons on the right</small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  dialog.padPlaying = () => state === "playing";
  dialog.kickabout = { match: () => match, state: () => state }; // for testing
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".ka-panel");
  const sfx = sounds();
  const touchy = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  let state = "ready"; // ready | playing | paused | finished
  let match = createMatch(level);
  let frame;
  let previous = 0;
  let messageTimer;
  let bannerTimer;
  let hinted = new Set();
  const held = new Set(); // movement keys
  const buttons = { shoot: new Set(), pass: new Set() };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };

  function input() {
    let x = stick.x,
      y = stick.y;
    for (const k of held) {
      x += MOVE_KEYS[k][0];
      y += MOVE_KEYS[k][1];
    }
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      shoot: buttons.shoot.size > 0,
      pass: buttons.pass.size > 0,
    };
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }
  function hint(key, text) {
    if (hinted.has(key)) return;
    hinted.add(key);
    say(text, 3600);
  }

  function banner(text, kind = "", hold = 1400) {
    const el = get("banner");
    el.textContent = text;
    el.className = `ka-banner ${kind}`;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), hold);
  }

  function hud() {
    get("score-you").textContent = match.score[0];
    get("score-them").textContent = match.score[1];
    get("clock").textContent = match.golden
      ? "GOLDEN GOAL"
      : clockText(match.clock);
    get("clock").classList.toggle("golden", match.golden);
    const me = match.players[match.controlled];
    const has = match.ball.owner === me;
    get("shoot-label").textContent = has ? "SHOOT" : "TACKLE";
    get("pass-label").textContent = has ? "PASS" : "SWITCH";
    const power = shotPower(match);
    const bar = get("power");
    bar.hidden = !(power > 0 && has && state === "playing");
    if (!bar.hidden) {
      const at = scene.screen(me.x, me.y, 3.2);
      bar.style.left = `${at.x}px`;
      bar.style.top = `${at.y}px`;
      bar.firstElementChild.style.width = `${power * 100}%`;
      bar.classList.toggle("full", power >= 1);
    }
  }

  function react(events) {
    for (const e of events) {
      const ours = e.p?.team === 0;
      switch (e.type) {
        case "whistle":
          sfx.whistle(false);
          banner("Go!", "go", 800);
          if (match.kickoffTeam === 0)
            hint(
              "start",
              touchy
                ? "Drag on the left to run with the ball!"
                : "Run with WASD or the arrows. Hold Space and let go to shoot!",
            );
          break;
        case "kick":
          sfx.kick(e.power);
          scene.kick(match.ball, e.power);
          if (e.kind === "pass" && ours && e.p.keeper)
            hint("keeper", "Your keeper threw it to you. Go!");
          break;
        case "trap":
          sfx.touch();
          if (e.intercepted && ours && !e.p.keeper) say("Got it!", 1200);
          break;
        case "steal":
          sfx.steal();
          scene.steal(e.p);
          if (ours) say("Nice tackle!", 1400);
          else if (e.from.team === 0 && !e.from.keeper)
            hint(
              "lost",
              touchy
                ? "They took it! Chase them, or tap TACKLE to lunge."
                : "They took it! Run into them, or press Space to lunge.",
            );
          break;
        case "save":
          sfx.save();
          scene.save(e.p);
          if (e.shot)
            say(
              e.p.team === 0
                ? "What a save by your keeper!"
                : "Saved! Aim away from the keeper.",
              1800,
            );
          break;
        case "dive":
          scene.dive(e.p, e.dir || 1);
          break;
        case "lunge":
          sfx.lunge();
          break;
        case "switch":
          sfx.touch();
          break;
        case "bounce":
          if (e.post) sfx.post();
          else if (e.hard) sfx.bounce();
          break;
        case "goal": {
          const yours = e.team === 0;
          (yours ? sfx.cheer : sfx.groan)();
          scene.goal(e.team, match.ball);
          banner(
            yours ? "GOAL!" : "They scored!",
            yours ? "goal" : "them",
            2200,
          );
          if (match.golden) break;
          say(
            yours
              ? `${match.score[0]}–${match.score[1]}! They kick off next.`
              : `${match.score[0]}–${match.score[1]}. Your kick-off!`,
            2400,
          );
          break;
        }
        case "golden":
          sfx.whistle(true);
          banner("Golden goal!", "go", 1800);
          say("It's a tie! Next goal wins.", 3000);
          break;
        case "kickoff":
          scene.snap(match);
          banner(
            match.kickoffTeam === 0 ? "Your kick-off" : "Their kick-off",
            "",
            1300,
          );
          break;
        case "over":
          finish();
          break;
      }
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") {
      // Fixed steps keep the bots the same at any frame rate.
      let left = dt;
      while (left > 1e-6 && state === "playing") {
        const h = Math.min(left, 1 / 60);
        react(step(match, input(), h));
        left -= h;
      }
    }
    scene.draw(state === "paused" ? 0 : dt, match, {
      showYou: state !== "ready",
    });
    hud();
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    get("touch").hidden = true;
    get("stick").hidden = true;
    const [you, them] = match.score;
    const won = you > them;
    if (won) {
      wins++;
      try {
        localStorage.setItem(winsKey, String(wins));
      } catch {}
    }
    sfx.whistle(true);
    setTimeout(() => (won ? sfx.win : sfx.lose)(), 700);
    const s = match.stats;
    results.show(
      won ? `You win ${you}–${them}!` : `They win ${them}–${you}`,
      won
        ? match.golden
          ? "Golden goal! What a finish."
          : "Champions of the backyard!"
        : "So close! Pass to get round defenders, and shoot away from the keeper.",
      [
        [`${you}–${them}`, "SCORE"],
        [s.shots[0], "SHOTS"],
        [s.steals[0], "BALLS WON"],
        [s.saves[0], "KEEPER SAVES"],
        [wins, "WINS"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      match = createMatch(level);
      scene.snap(match);
      hinted = new Set();
      banner("Your kick-off", "", 1300);
    }
    held.clear();
    buttons.shoot.clear();
    buttons.pass.clear();
    stick.id = null;
    stick.x = stick.y = 0;
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    get("touch").hidden = !touchy;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    held.clear();
    buttons.shoot.clear();
    buttons.pass.clear();
    stick.id = null;
    stick.x = stick.y = 0;
    get("stick").hidden = true;
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
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else dialog.close();
  });

  const keyName = (event) => (event.key || "").toLowerCase();
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const k = keyName(event);
    if (MOVE_KEYS[k]) {
      event.preventDefault();
      held.add(k);
    } else if (SHOOT_KEYS.has(k)) {
      event.preventDefault();
      buttons.shoot.add(`key:${k}`);
    } else if (PASS_KEYS.has(k)) {
      event.preventDefault();
      buttons.pass.add(`key:${k}`);
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const k = keyName(event);
    held.delete(k);
    buttons.shoot.delete(`key:${k}`);
    buttons.pass.delete(`key:${k}`);
    // Shift changes some keys' names while it's held.
    if (k === "shift") buttons.pass.delete("key:shift");
  });

  // Touch: a floating stick wherever the left thumb lands, and two buttons.
  const STICK_R = 56;
  function moveStick(event) {
    let dx = event.clientX - stick.ox,
      dy = event.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx *= STICK_R / d;
      dy *= STICK_R / d;
    }
    stick.x = dx / STICK_R;
    stick.y = -dy / STICK_R;
    if (Math.hypot(stick.x, stick.y) < 0.18) stick.x = stick.y = 0;
    get("stick").firstElementChild.style.transform =
      `translate(${dx}px, ${dy}px)`;
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * 0.55) {
      if (stick.id !== null) return;
      stick.id = event.pointerId;
      stick.ox = event.clientX;
      stick.oy = event.clientY;
      stick.x = stick.y = 0;
      const el = get("stick");
      el.style.left = `${event.clientX - rect.left}px`;
      el.style.top = `${event.clientY - rect.top}px`;
      el.firstElementChild.style.transform = "";
      el.hidden = false;
      canvas.setPointerCapture?.(event.pointerId);
    } else {
      // A tap on the right side of the pitch shoots / lunges.
      buttons.shoot.add(`ptr:${event.pointerId}`);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === stick.id) moveStick(event);
  });
  function lift(event) {
    if (event.pointerId === stick.id) {
      stick.id = null;
      stick.x = stick.y = 0;
      get("stick").hidden = true;
    }
    buttons.shoot.delete(`ptr:${event.pointerId}`);
    buttons.pass.delete(`ptr:${event.pointerId}`);
  }
  for (const type of ["pointerup", "pointercancel"])
    dialog.addEventListener(type, lift);
  for (const [name, set] of [
    ["touch-shoot", buttons.shoot],
    ["touch-pass", buttons.pass],
  ])
    get(name).addEventListener("pointerdown", (event) => {
      if (state !== "playing") return;
      event.preventDefault();
      set.add(`ptr:${event.pointerId}`);
    });

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    clearTimeout(bannerTimer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createKickaboutScene(canvas, teams);
  dialog.showModal();
  scene.snap(match);
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  const levelName =
    { easy: "Easy", normal: "Medium", hard: "Hard" }[level] ?? "Medium";
  get("heading").textContent = "3 v 3 in the backyard!";
  get("details").textContent =
    `You're in ${COLOR_NAMES[teams[0].color]}, they're in ${COLOR_NAMES[teams[1].color]}. Your keeper plays by themselves; you play whichever teammate has the ball. Score the most goals in ${MATCH_TIME / 60} minutes!${wins ? ` Wins on ${levelName}: ${wins}.` : ""}`;
  get("play").focus();
}
