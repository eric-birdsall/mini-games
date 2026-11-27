import preview from "./assets/modes/kite-day.svg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { TwoPlayerPads } from "./twoPlayerPads.js";
import { createKiteDayScene } from "./kiteDayScene.js";
import {
  GOLD_POINTS,
  HEARTS,
  ROUND_TIME,
  anchorsFor,
  gustWarning,
  kiteLevel,
  newGame,
  stepGame,
} from "../shared/kiteDay.js";
import { AVATARS, COLORS, avatarChoice } from "../shared/avatars.js";
import "./kiteDay.css";

const HOW_TO =
  "Fly your kite through the floating ribbons. Hold to reel in: the kite climbs over your head and steadies. Let go to let string out: it drifts farther and lower, and wobbles more. Steer left and right. Watch the windsock and the blowing leaves: a gust is coming! Stay clear of the oak, the power line, the hedges and the crow. Gold ribbons are high and far out and worth three. Keys: A / D or ← / → steer, hold Space (or W / ↑) to reel, R for a quick tug. Controller: stick steers, hold A to reel, X tugs. Touch: ◀ ▶ steer, hold Reel. Two players: player one A / D and Space, player two ← / → and ↑.";
const STEP = 1 / 120;
const RESULTS_AFTER = 1.2;
const DOUBLE_TAP = 0.3;

const bumpLine = {
  oak: "Rustle! Into the oak tree.",
  wire: "Zing! Caught on the power line.",
  hedge: "Crunch! Down in the hedge.",
  crow: "Caw! The crow bumped your kite.",
};

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
    // The reel's ratchet.
    click: () => tone(2400, 0, 0.018, "square", 0.025),
    tug: () => tone(330, 0, 0.12, "triangle", 0.08, 520),
    whoosh: () => noise(0.18, 0.9, 500, "bandpass", 1800),
    ribbon: () => {
      tone(784, 0, 0.1, "triangle", 0.09);
      tone(1175, 0.07, 0.18, "triangle", 0.09);
    },
    gold: () =>
      [784, 988, 1175, 1568].forEach((f, i) =>
        tone(f, i * 0.07, 0.2, "triangle", 0.09),
      ),
    bump: () => {
      noise(0.22, 0.18, 800, "lowpass");
      tone(300, 0, 0.3, "triangle", 0.06, 110);
    },
    caw: () => {
      tone(620, 0, 0.16, "sawtooth", 0.05, 380);
      tone(600, 0.22, 0.16, "sawtooth", 0.05, 360);
    },
    twang: () => tone(196, 0, 0.35, "sawtooth", 0.04, 150),
    best: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
    done: () =>
      [784, 659, 523].forEach((f, i) =>
        tone(f, 0.2 + i * 0.15, 0.24, "triangle", 0.07),
      ),
  };
}

export function installKiteDay(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "kiteday";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A kite flying over a backyard porch through a ribbon ring" draggable="false"></span><strong>Kite Day</strong><small>Reel in and let out to fly your kite through the ribbons on a windy day!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

// Player two gets a different critter and colour from player one.
function friendFor(mine) {
  const character =
    AVATARS.find((c) => c !== mine.character && c !== "frog") || mine.character;
  const color =
    Object.keys(COLORS).find((c) => c !== mine.color && c !== "sunshine") ||
    "sky";
  return { character, color };
}

const clock = (s) => {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = kiteLevel(level);
  const bestKey = `kite-day-best-${level}`;
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(bestKey));
    if (Number.isFinite(saved) && saved > 0) best = saved;
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "kite-day";
  dialog.setAttribute("aria-label", "Kite Day");
  const touchCluster = (who) => `
    <div class="kite-pad" data-pad="${who}">
      <button type="button" data-steer="-1" aria-label="Steer left">◀</button>
      <button type="button" class="kite-reel" data-reel aria-label="Hold to reel in">Reel</button>
      <button type="button" data-steer="1" aria-label="Steer right">▶</button>
    </div>`;
  dialog.innerHTML = `
    <header><strong>Kite Day</strong><div><button data-exit>Back to games</button></div></header>
    <div class="kite-field">
      <canvas aria-label="A kite on a string over a backyard porch, with ribbons to fly through"></canvas>
      <div class="kite-hud" data-hud hidden>
        <div class="kite-scores" data-scores></div>
        <div class="kite-time" data-time>2:00</div>
        <div class="kite-hearts" data-hearts aria-label="Hearts"></div>
      </div>
      <div class="kite-gust" data-gust hidden aria-hidden="true"><span data-gust-arrow>➜</span> Gust!</div>
      <div class="kite-hint" data-hint hidden>
        <span><b>Hold</b> to reel in · climb</span>
        <span><b>Let go</b> to let out · farther</span>
      </div>
      <div class="kite-pads" data-pads hidden>${touchCluster(0)}${touchCluster(1)}</div>
      <section class="kite-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="kite-modes">
          <button class="primary" data-play>Play</button>
          <button data-duel>2 players</button>
        </div>
        <small class="kite-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Kite Day", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".kite-panel");
  const sfx = sounds();
  const touchy = window.matchMedia?.("(pointer: coarse)").matches;

  // ready: start panel. playing. paused. ending: the last bump or the
  // final second before the results. finished: results showing.
  let state = "ready";
  let players = 1;
  let game = newGame(level, 1, 1);
  let accumulator = 0;
  let previous = 0;
  let frame;
  let messageTimer;
  let endTime = 0;
  let clickTimer = 0;
  let warned = null;
  let lastScores = [];
  const keys = new Set();
  const tugs = [false, false];
  const touch = [
    { steer: new Map(), reel: new Set(), lastTap: -1 },
    { steer: new Map(), reel: new Set(), lastTap: -1 },
  ];
  const pads = new TwoPlayerPads();
  let padInputs = [];

  // Solo: the bridge turns the controller into keys. Duel: read both.
  dialog.padPlaying = () => state === "playing";
  dialog.padSeats = () => state === "playing" && players === 2;

  const flyersFor = (n) => {
    const anchors = anchorsFor(n);
    return anchors.map((anchor, i) => ({
      anchor,
      avatar: i ? friendFor(avatar) : avatar,
    }));
  };
  let scene = createKiteDayScene(canvas, flyersFor(1));

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function hud() {
    const scores = get("scores");
    const kites = game.kites;
    if (scores.childElementCount !== kites.length) {
      scores.replaceChildren(
        ...kites.map((_, i) => {
          const el = document.createElement("strong");
          el.className = `kite-score p${i + 1}`;
          return el;
        }),
      );
      lastScores = [];
    }
    kites.forEach((k, i) => {
      const el = scores.children[i];
      const text = players === 2 ? `P${i + 1} ${k.score}` : String(k.score);
      if (el.textContent !== text) {
        el.textContent = text;
        if (lastScores[i] !== undefined && lastScores[i] !== k.score) {
          el.classList.remove("bump");
          void el.offsetWidth;
          el.classList.add("bump");
        }
        lastScores[i] = k.score;
      }
    });
    get("time").textContent = clock(game.timeLeft);
    get("time").classList.toggle("low", game.timeLeft <= 10);
    const hearts = get("hearts");
    hearts.hidden = !(settings.hearts && players === 1);
    const h = game.kites[0].hearts;
    const text = "♥".repeat(h) + "♡".repeat(HEARTS - h);
    if (hearts.textContent !== text) hearts.textContent = text;
  }

  const held = (...names) => names.some((n) => keys.has(n));
  function inputs() {
    const pad = (i) => (players === 2 ? padInputs[i] : null);
    const touchSteer = (i) =>
      [...touch[i].steer.values()].reduce((a, b) => a + b, 0);
    const list = [];
    if (players === 1) {
      list.push({
        steer:
          (held("d", "arrowright", "l") ? 1 : 0) -
          (held("a", "arrowleft", "j") ? 1 : 0) +
          touchSteer(0) +
          touchSteer(1),
        reel:
          held(" ", "w", "arrowup", "enter", "k") ||
          touch[0].reel.size + touch[1].reel.size > 0,
        tug: tugs[0],
      });
    } else {
      const p1 = pad(0);
      const p2 = pad(1);
      list.push({
        steer:
          (held("d") || p1?.right ? 1 : 0) -
          (held("a") || p1?.left ? 1 : 0) +
          touchSteer(0),
        reel: held(" ", "w") || !!p1?.hold || touch[0].reel.size > 0,
        tug: tugs[0] || !!p1?.tug,
      });
      list.push({
        steer:
          (held("arrowright") || p2?.right ? 1 : 0) -
          (held("arrowleft") || p2?.left ? 1 : 0) +
          touchSteer(1),
        reel: held("arrowup", "enter") || !!p2?.hold || touch[1].reel.size > 0,
        tug: tugs[1] || !!p2?.tug,
      });
    }
    return list;
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === "ribbon") {
        scene.ribbon(e.ribbon);
        if (e.ribbon.gold) {
          sfx.gold();
          say(
            players === 2
              ? `Gold ribbon for player ${e.kite + 1}! +${GOLD_POINTS}`
              : `Gold ribbon! +${GOLD_POINTS}`,
            1600,
          );
        } else sfx.ribbon();
      } else if (e.type === "bump") {
        const k = game.kites[e.kite];
        scene.bump(e.what, k.x, k.y);
        sfx.bump();
        const who = players === 2 ? `Player ${e.kite + 1}: ` : "";
        say(`${who}${bumpLine[e.what]} The dog fetched it back!`, 2600);
        dialog.classList.remove("flash");
        void dialog.offsetWidth;
        dialog.classList.add("flash");
      } else if (e.type === "crow") {
        sfx.caw();
        say("Caw! Here comes a crow!", 1800);
      } else if (e.type === "tangle") {
        sfx.twang();
        say("Tangled! Reel in to come apart.", 2000);
      } else if (e.type === "over") {
        state = "ending";
        endTime = 0;
        get("pause").hidden = true;
        get("gust").hidden = true;
        if (e.why === "time") say("Time's up! Reel them in.", 1800);
      }
    }
  }

  function step(dt) {
    if (state === "playing") {
      accumulator += dt;
      while (accumulator >= STEP && state === "playing") {
        accumulator -= STEP;
        const input = inputs();
        tugs[0] = tugs[1] = false;
        const events = stepGame(game, input, STEP);
        for (const [i, inp] of input.entries())
          if (inp.tug && game.kites[i].tug > 0.59) sfx.tug();
        handle(events);
      }
      // Ratchet clicks while anyone reels.
      clickTimer -= dt;
      const reeling = inputs().some(
        (inp, i) =>
          inp.reel && game.kites[i].len > 3.01 && !game.kites[i].tumble,
      );
      if (reeling && clickTimer <= 0) {
        clickTimer = 0.07;
        sfx.click();
      }
      // Gust warning.
      const w = gustWarning(game.wind);
      const gust = get("gust");
      if (
        w &&
        warned !== game.wind.gusts.find((g) => g.at + g.length > game.wind.t)
      ) {
        warned = game.wind.gusts.find((g) => g.at + g.length > game.wind.t);
        sfx.whoosh();
      }
      gust.hidden = !w;
      if (w) {
        gust.classList.toggle("left", w.dir < 0);
        gust.classList.toggle("now", w.in === 0);
      }
      hud();
    } else if (state === "ending") {
      endTime += dt;
      // Let a tumbling kite land.
      for (const k of game.kites) {
        if (k.tumble > 0) {
          k.tumble = Math.max(0, k.tumble - dt);
          k.y = Math.max(0.4, k.y - dt * 6);
        }
      }
      if (endTime >= RESULTS_AFTER) finish();
    }
  }

  function draw(dt = 0) {
    scene.draw(dt, game);
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing" && players === 2) {
      const read = pads.read(navigator.getGamepads?.());
      if (read.some((p) => p.pause)) pause();
      padInputs = read;
    }
    step(dt);
    draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("hud").hidden = true;
    get("pads").hidden = true;
    clearTouch();
    if (players === 2) {
      const [a, b] = game.kites;
      const title =
        a.score === b.score
          ? "It's a tie!"
          : `Player ${a.score > b.score ? 1 : 2} wins!`;
      const detail =
        a.score === b.score
          ? `Both kites flew through ${a.score} points of ribbons. Fly again to break the tie!`
          : `${Math.max(a.score, b.score)} points to ${Math.min(a.score, b.score)}. What a windy day!`;
      sfx.best();
      results.show(title, detail, [
        [String(a.score), "PLAYER 1"],
        [String(b.score), "PLAYER 2"],
      ]);
      return;
    }
    const k = game.kites[0];
    const score = k.score;
    const record = score > best;
    if (record) {
      best = score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
      sfx.best();
    } else sfx.done();
    const outOfHearts = settings.hearts && k.hearts <= 0;
    const title = record
      ? "New best flight!"
      : outOfHearts
        ? "The kite needs a rest!"
        : score === 0
          ? "What a breeze!"
          : `${score} ribbon points!`;
    const detail = record
      ? `You scored ${score}${k.golds ? `, with ${k.golds} gold ribbon${k.golds === 1 ? "" : "s"}` : ""}. Your best ever!`
      : outOfHearts
        ? `Three bumps and the kite's done for today. You scored ${score}. Your best is ${best}.`
        : score === 0
          ? "Let go to let string out and reach a ribbon, then hold to climb back up."
          : `Your best is ${best}. Gold ribbons are worth ${GOLD_POINTS}: let the string right out to reach them.`;
    results.show(title, detail, [
      [String(score), "POINTS"],
      [String(k.golds), "GOLD"],
      [String(best), "BEST"],
    ]);
  }

  function clearTouch() {
    for (const t of touch) {
      t.steer.clear();
      t.reel.clear();
    }
    dialog
      .querySelectorAll(".kite-pad .down")
      .forEach((b) => b.classList.remove("down"));
  }

  function start(reset, n = players) {
    results.hide();
    if (reset) {
      if (n !== players || !scene) {
        scene?.dispose();
        scene = createKiteDayScene(canvas, flyersFor(n));
      }
      players = n;
      game = newGame(level, players, (Math.random() * 2 ** 32) >>> 0);
      accumulator = 0;
      warned = null;
      state = "playing";
      say("");
      dialog.classList.toggle("duel", players === 2);
      const hint = get("hint");
      hint.hidden = false;
      clearTimeout(hint.timer);
      hint.timer = setTimeout(() => (hint.hidden = true), 4200);
    } else {
      state = "playing";
    }
    keys.clear();
    clearTouch();
    pads.reset();
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("hud").hidden = false;
    get("pads").hidden = !touchy;
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
    keys.clear();
    clearTouch();
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Kite Day",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => start(true, 1);
  get("duel").onclick = () => start(true, 2);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else if (state === "ready" || state === "finished") dialog.close();
  });

  const gameKeys = new Set([
    "a",
    "d",
    "w",
    "j",
    "l",
    "k",
    " ",
    "r",
    "arrowleft",
    "arrowright",
    "arrowup",
    "arrowdown",
    "enter",
  ]);
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = event.key.toLowerCase();
    if (!gameKeys.has(key)) return;
    event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    get("hint").hidden = true;
    if (key === "r") tugs[0] = true;
    if (key === "arrowdown") tugs[players === 2 ? 1 : 0] = true;
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    keys.delete(event.key.toLowerCase());
  });

  // Touch buttons: ◀ ▶ steer while held, Reel reels while held, and a
  // quick double-tap on Reel is a tug.
  dialog.querySelectorAll(".kite-pad").forEach((padEl) => {
    const who = Number(padEl.dataset.pad);
    const seat = () => (players === 2 ? who : 0);
    padEl.querySelectorAll("button").forEach((b) => {
      b.addEventListener("pointerdown", (event) => {
        if (state !== "playing") return;
        event.preventDefault();
        b.setPointerCapture?.(event.pointerId);
        b.classList.add("down");
        get("hint").hidden = true;
        const t = touch[seat()];
        if (b.dataset.steer)
          t.steer.set(event.pointerId, Number(b.dataset.steer));
        else {
          t.reel.add(event.pointerId);
          if (game.t - t.lastTap < DOUBLE_TAP) tugs[seat()] = true;
          t.lastTap = game.t;
        }
      });
      const up = (event) => {
        b.classList.remove("down");
        for (const t of touch) {
          t.steer.delete(event.pointerId);
          t.reel.delete(event.pointerId);
        }
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
      b.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  });
  // Without the buttons (a mouse), holding the mouse on the sky reels.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture?.(event.pointerId);
    get("hint").hidden = true;
    touch[0].reel.add(event.pointerId);
  });
  const canvasUp = (event) => touch[0].reel.delete(event.pointerId);
  canvas.addEventListener("pointerup", canvasUp);
  canvas.addEventListener("pointercancel", canvasUp);

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    clearTimeout(get("hint").timer);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  dialog.showModal();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "It's a windy day!";
  get("details").textContent =
    `Fly your kite through the floating ribbons. Hold to reel in and climb; let go to let string out and drift farther. Watch the windsock for gusts, and stay clear of the oak and the power line. Gold ribbons are worth ${GOLD_POINTS}!${settings.hearts ? "" : " No hearts to lose on Breezy."}${best ? ` Your best: ${best}.` : ""}`;
  get("keys").textContent =
    `${settings.name} · ${clock(ROUND_TIME)} · A / D steer · hold Space to reel · R tug`;
  get("play").focus();
}
