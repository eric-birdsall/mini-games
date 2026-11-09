import preview from "./assets/modes/pop-patrol.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPopPatrolScene } from "./popPatrolScene.js";
import {
  BUBBLES,
  TARGETING,
  TARGET_NAMES,
  TOWERS,
  TOWER_KINDS,
  YARD,
  canPlace,
  createGame,
  levelSettings,
  nextUpgrade,
  place,
  sell,
  sellValue,
  startWave,
  step,
  towerAt,
  towerStats,
  upgrade,
  waveSpawns,
} from "../shared/popPatrol.js";
import "./popPatrol.css";

const TITLE = "Pop Patrol";
const HOW_TO =
  "The neighbour's bubble machine is blowing bubbles through the fence, and they float along the path to your back door. Pick a defender from the bottom (or press 1–5) and click the lawn to place it. Each pop strips a layer: pink → yellow → green → blue → clear. Rainbow bubbles burst into pinks, and Big Soapy into rainbows. Click a defender to upgrade it, change who it aims at, or sell it. Start each wave with ▶ (or N), and speed things up with ⏩ (F). Keyboard: arrows / WASD move the yard cursor, Space places or picks. Controller: the stick moves the cursor, A opens the shop or picks a defender, X starts the wave (or speeds it up), B backs out.";
const CURSOR_SPEED = 11; // m/s for keys and the stick
const MOVE_KEYS = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const out = audio?.createGain();
  if (out) {
    out.gain.value = 0.8;
    out.connect(audio.destination);
  }
  let lastPop = 0;
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
  const noise = (volume, length, from, to = from, start = 0, q = 1.2) => {
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
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
  };

  // A lazy summer loop: F – C – Dm – Bb, plucked, with a soft bass.
  const CHORDS = [
    [349.2, 440, 523.3],
    [261.6, 329.6, 392],
    [293.7, 349.2, 440],
    [233.1, 293.7, 349.2],
  ];
  const BEAT = 60 / 112 / 2;
  let music = false,
    timer = 0,
    nextAt = 0,
    note = 0;
  function schedule() {
    if (!music || audio?.state !== "running") return;
    while (nextAt < audio.currentTime + 0.15) {
      const chord = CHORDS[Math.floor(note / 8) % 4];
      const i = [0, 1, 2, 1, 2, 1, 0, 2][note % 8];
      const at = nextAt - audio.currentTime;
      if (at >= 0) {
        if (note % 8 !== 7)
          tone(chord[i] * 2, at, BEAT * 1.4, "triangle", 0.02);
        if (note % 4 === 0) tone(chord[0] / 2, at, BEAT * 3.6, "sine", 0.05);
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
    pop(tier, burst) {
      // Many pops at once would be a roar: at most one every 25 ms.
      if (!audio || audio.currentTime - lastPop < 0.025) return;
      lastPop = audio.currentTime;
      const f = 900 + tier * 140 + Math.random() * 200;
      tone(f, 0, 0.07, "sine", 0.07, f * 0.45);
      noise(0.05, 0.04, 3500, 2000);
      if (burst) {
        noise(0.2, 0.3, 2500, 500);
        tone(300, 0, 0.3, "triangle", 0.08, 120);
      }
    },
    thunk: () => noise(0.06, 0.08, 700, 300),
    spray: () => noise(0.08, 0.3, 5000, 2500, 0, 0.6),
    fling: () => tone(220, 0, 0.18, "triangle", 0.05, 440),
    splash: () => {
      noise(0.14, 0.35, 1800, 300);
      noise(0.05, 0.2, 6000, 3000, 0.03);
    },
    squirt: () => noise(0.025, 0.06, 4500, 4000),
    gust: () => noise(0.08, 0.5, 400, 900, 0, 0.5),
    leak: () => {
      tone(180, 0, 0.25, "square", 0.05, 120);
      noise(0.1, 0.15, 900, 400);
    },
    place: () => {
      noise(0.14, 0.12, 400, 150);
      tone(523, 0.05, 0.12, "triangle", 0.06);
      tone(784, 0.12, 0.16, "triangle", 0.05);
    },
    upgrade: () =>
      [659, 784, 988, 1319].forEach((f, i) =>
        tone(f, i * 0.06, 0.18, "triangle", 0.05),
      ),
    sell: () =>
      [988, 784].forEach((f, i) => tone(f, i * 0.07, 0.14, "square", 0.03)),
    nope: () => tone(260, 0, 0.14, "triangle", 0.05, 220),
    click: () => tone(700, 0, 0.05, "sine", 0.04),
    wave: () =>
      [392, 523, 659].forEach((f, i) =>
        tone(f, i * 0.09, 0.2, "triangle", 0.06),
      ),
    waveEnd: () =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.08, 0.25, "triangle", 0.05),
      ),
    won: () =>
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.12, 0.35, "triangle", 0.06),
      ),
    lost: () =>
      [523, 440, 349, 262].forEach((f, i) =>
        tone(f, i * 0.16, 0.35, "triangle", 0.06),
      ),
  };
}

export function installPopPatrol(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "poppatrol";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A backyard from above: soap bubbles float along a stepping-stone path past garden gnomes, sprinklers and a frog" draggable="false"></span><strong>${TITLE}</strong><small>Bubbles are floating to your back door! Place backyard defenders to pop them all.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

const money = (n) => `$${Math.floor(n).toLocaleString()}`;

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = levelSettings(level);
  const bestKey = `pop-patrol-best-${level}`;
  const musicKey = "pop-patrol-music";
  let best = 0;
  let musicOn = true;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
    musicOn = localStorage.getItem(musicKey) !== "off";
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "pop-patrol";
  dialog.setAttribute("aria-label", TITLE);
  const shopButtons = TOWER_KINDS.map(
    (kind, i) =>
      `<button type="button" class="pp-buy" data-buy="${kind}" aria-label="${TOWERS[kind].name}, ${money(TOWERS[kind].cost)}"><span class="pp-key">${i + 1}</span><span class="pp-icon" aria-hidden="true">${TOWERS[kind].icon}</span><span class="pp-name">${TOWERS[kind].name}</span><span class="pp-cost">${money(TOWERS[kind].cost)}</span></button>`,
  ).join("");
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="pp-field">
      <canvas aria-label="A backyard with a stepping-stone path; bubbles float along it towards the back door"></canvas>
      <div class="pp-hud">
        <span data-lives></span><span data-cash></span><span data-wave></span>
        <div class="pp-controls">
          <button type="button" class="pp-go" data-go>▶ Start wave</button>
          <button type="button" data-fast aria-pressed="false">⏩ Fast</button>
          <button type="button" data-music aria-pressed="true"></button>
          <button type="button" data-pause>⏸ Pause</button>
        </div>
      </div>
      <div class="pp-pops" data-pops aria-hidden="true"></div>
      <div class="pp-banner" data-banner hidden></div>
      <section class="pp-tower" data-tower hidden aria-label="Defender">
        <div class="pp-tower-head"><span data-t-icon aria-hidden="true"></span><strong data-t-name></strong><button type="button" class="pp-close" data-t-close aria-label="Close">✕</button></div>
        <p data-t-stats></p>
        <button type="button" class="pp-up" data-up="0"></button>
        <button type="button" class="pp-up" data-up="1"></button>
        <div class="pp-tower-row">
          <button type="button" data-t-target></button>
          <button type="button" class="pp-sell" data-t-sell></button>
        </div>
      </section>
      <nav class="pp-shop" data-shop aria-label="Defenders">${shopButtons}</nav>
      <section class="pp-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="pp-keys">Mouse / touch: pick a defender, then tap the lawn · Keys: 1–5 pick, arrows move, Space places, N starts a wave, F fast<br>Controller: stick moves, A opens the shop or picks a defender, X starts the wave, B backs out</small>
      </section>
    </div>
    <footer><span data-message role="status"></span></footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".pp-panel");
  const towerPanel = get("tower");
  const shop = get("shop");
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let mode = "idle"; // idle | placing | shop | selected
  let placing = null; // tower kind
  let selected = null; // tower
  let game = createGame(level);
  let cursor = { x: -7, z: 0 };
  let fast = false;
  let frame;
  let previous = 0;
  let messageTimer;
  let bannerTimer;
  let touchGhost = null; // where a touch showed the ghost, waiting for a second tap
  const held = new Set();
  // A controller's A is still down for a moment after it presses a button
  // that hands control back to the yard; don't let that act again.
  let settled = 0;

  dialog.padPlaying = () =>
    state === "playing" && (mode === "idle" || mode === "placing");
  dialog.padTargets = () => {
    if (state !== "playing") return null;
    if (mode === "shop") return [...shop.querySelectorAll("button")];
    if (mode === "selected") return [...towerPanel.querySelectorAll("button")];
    return null;
  };

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function banner(text, hold = 1400) {
    const el = get("banner");
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), hold);
  }

  function floater(text, x, z, kind = "") {
    const at = scene.screen(x, z, 2);
    const el = document.createElement("span");
    el.className = `pp-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function hud() {
    get("lives").textContent = `❤ ${game.lives}`;
    get("lives").setAttribute("aria-label", `${game.lives} lives`);
    get("lives").classList.toggle("low", game.lives <= settings.lives * 0.25);
    get("cash").textContent = `🪙 ${money(game.cash)}`;
    get("wave").textContent =
      `Wave ${Math.max(1, game.wave)} / ${settings.waves}`;
    const go = get("go");
    go.disabled = game.waveActive || !!game.over;
    go.classList.toggle(
      "ready",
      !game.waveActive && !game.over && state === "playing",
    );
    get("fast").setAttribute("aria-pressed", String(fast));
    get("fast").classList.toggle("on", fast);
    for (const b of shop.querySelectorAll("[data-buy]")) {
      const kind = b.dataset.buy;
      b.classList.toggle("poor", game.cash < TOWERS[kind].cost);
      b.classList.toggle("on", placing === kind && mode === "placing");
    }
    if (mode === "selected" && selected) towerHud();
  }

  function towerHud() {
    const t = selected;
    const def = TOWERS[t.kind];
    const s = towerStats(t);
    get("t-icon").textContent = def.icon;
    get("t-name").textContent = def.name;
    const facts = [`Reach ${s.range.toFixed(1)} m`];
    if (t.kind === "fan") {
      facts.push(`slows to ${Math.round(s.slow * 100)}%`);
      if (s.popRate) facts.push(`pops every ${s.popRate.toFixed(1)} s`);
    } else
      facts.push(
        `${(1 / s.rate).toFixed(1)} shots/s`,
        `pops ${s.damage} layer${s.damage > 1 ? "s" : ""}`,
      );
    facts.push(`${t.pops.toLocaleString()} popped`);
    get("t-stats").textContent = facts.join(" · ");
    for (const b of towerPanel.querySelectorAll("[data-up]")) {
      const path = Number(b.dataset.up);
      const u = nextUpgrade(t, path);
      const pips = "●".repeat(t.levels[path]) + "○".repeat(2 - t.levels[path]);
      b.classList.toggle("path-b", path === 1);
      if (u) {
        b.innerHTML = `<span>${pips} ${u.name}</span><b>${money(u.cost)}</b>`;
        b.classList.toggle("poor", game.cash < u.cost);
        b.disabled = false;
      } else {
        b.innerHTML = `<span>${pips} ${def.paths[path][1].name}</span><b>Done!</b>`;
        b.disabled = true;
      }
    }
    get("t-target").textContent =
      t.kind === "sprinkler" || t.kind === "fan"
        ? "Aims all around"
        : `Aim: ${TARGET_NAMES[t.target]}`;
    get("t-target").disabled = t.kind === "sprinkler" || t.kind === "fan";
    get("t-sell").textContent = `Sell ${money(sellValue(t))}`;
  }

  function setMode(next, focus = true) {
    mode = next;
    settled = performance.now() + 350;
    if (next !== "placing") placing = null;
    if (next !== "selected") selected = null;
    if (next !== "placing") touchGhost = null;
    towerPanel.hidden = next !== "selected";
    shop.classList.toggle("open", next === "shop");
    if (next === "selected") {
      towerHud();
      if (focus)
        towerPanel
          .querySelector("[data-up]:not(:disabled), [data-t-sell]")
          .focus({ preventScroll: true });
    } else if (next === "shop") {
      const items = [...shop.querySelectorAll("button")];
      (items.find((b) => !b.classList.contains("poor")) ?? items[0]).focus({
        preventScroll: true,
      });
      say("Pick a defender to place.", 2000);
    } else if (focus) canvas.focus({ preventScroll: true });
    hud();
  }

  function choose(kind) {
    if (state !== "playing") return;
    if (game.cash < TOWERS[kind].cost) {
      sfx.nope();
      say(
        `${TOWERS[kind].name} costs ${money(TOWERS[kind].cost)}. Pop more bubbles!`,
      );
      if (mode === "shop") return;
      return;
    }
    sfx.click();
    if (mode === "placing" && placing === kind) return setMode("idle");
    setMode("placing");
    placing = kind;
    say(
      `${TOWERS[kind].name}: ${TOWERS[kind].blurb} Pick a spot on the grass.`,
      3200,
    );
    hud();
  }

  function tryPlace(x, z) {
    const t = place(game, placing, x, z);
    if (!t) {
      sfx.nope();
      say(
        game.cash < TOWERS[placing].cost
          ? "Not enough money."
          : "Not there! Pick open grass, off the path.",
      );
      return false;
    }
    sfx.place();
    floater(`-${money(TOWERS[t.kind].cost)}`, x, z, "cost");
    const kind = placing;
    setMode("idle");
    // Shift keeps placing the same kind.
    if (held.has("shift") && game.cash >= TOWERS[kind].cost) {
      setMode("placing");
      placing = kind;
    }
    if (!game.wave && !game.waveActive)
      say("Now start the first wave with ▶ (N, or X on a controller).", 4000);
    hud();
    return true;
  }

  // A: place, pick a defender, or open the shop.
  function act() {
    if (state !== "playing") return;
    if (mode === "placing") return void tryPlace(cursor.x, cursor.z);
    const t = towerAt(game, cursor.x, cursor.z);
    if (t) {
      sfx.click();
      selected = t;
      setMode("selected");
      return;
    }
    setMode("shop");
  }

  function back() {
    if (mode !== "idle") {
      setMode("idle");
      return true;
    }
    return false;
  }

  function goOrFast() {
    if (state !== "playing") return;
    if (!game.waveActive && !game.over) {
      if (startWave(game)) {
        sfx.wave();
        const before = new Set([0]);
        for (let w = 1; w < game.wave; w++)
          for (const s of waveSpawns(w, settings)) before.add(s.tier);
        const fresh = [...new Set(game.spawns.map((s) => s.tier))].find(
          (tier) => !before.has(tier),
        );
        banner(`Wave ${game.wave}!`);
        if (fresh !== undefined)
          say(
            fresh === 5
              ? "Rainbow bubbles! They burst into two pink ones."
              : fresh === 6
                ? "Here comes Big Soapy! It takes lots of pops."
                : `New: ${BUBBLES[fresh].name.toLowerCase()} bubbles, faster and tougher!`,
            3500,
          );
      }
    } else {
      fast = !fast;
      sfx.click();
    }
    hud();
  }

  function music() {
    get("music").textContent = musicOn ? "♪ On" : "♪ Off";
    get("music").setAttribute("aria-pressed", String(musicOn));
    sfx.music(musicOn && state === "playing");
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === "pop") {
        sfx.pop(e.tier, e.burst);
      } else if (e.type === "throw") sfx.thunk();
      else if (e.type === "spray") sfx.spray();
      else if (e.type === "fling") sfx.fling();
      else if (e.type === "splash") sfx.splash();
      else if (e.type === "squirt") sfx.squirt();
      else if (e.type === "gust") sfx.gust();
      else if (e.type === "leak") {
        sfx.leak();
        floater(`-${e.lives} ❤`, 13, -10.5, "leak");
      } else if (e.type === "waveEnd") {
        sfx.waveEnd();
        floater(`+${money(e.bonus)}`, 13, -8, "bonus");
        if (!game.over) {
          banner(`Wave ${e.wave} popped!`);
          say(
            `Wave bonus ${money(e.bonus)}. Upgrade or add defenders, then start the next wave.`,
            3500,
          );
          fast = false;
        }
      } else if (e.type === "won" || e.type === "lost") {
        setTimeout(finish, 1600);
        if (e.type === "won") sfx.won();
        else sfx.lost();
      }
    }
    scene.effects(game, events);
  }

  function play(dt) {
    // Keys and the stick move the yard cursor.
    let mx = 0,
      mz = 0;
    for (const k of held) {
      const m = MOVE_KEYS[k];
      if (m) {
        mx += m[0];
        mz += m[1];
      }
    }
    if ((mx || mz) && (mode === "idle" || mode === "placing")) {
      const len = Math.hypot(mx, mz);
      cursor.x = Math.max(
        YARD.minX - 2,
        Math.min(YARD.maxX + 2, cursor.x + (mx / len) * CURSOR_SPEED * dt),
      );
      cursor.z = Math.max(
        YARD.minZ - 1,
        Math.min(YARD.maxZ + 1.5, cursor.z + (mz / len) * CURSOR_SPEED * dt),
      );
    }
    const steps = fast ? 3 : 1;
    for (let i = 0; i < steps && !game.over; i++) handle(step(game, dt));
    if (selected && !game.towers.includes(selected)) setMode("idle");
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") play(dt);
    const ok = mode === "placing" && canPlace(game, cursor.x, cursor.z);
    scene.draw(state === "paused" ? 0 : dt, game, {
      cursor: state === "playing" && mode !== "shop" ? cursor : null,
      ghost: mode === "placing" ? placing : null,
      ok,
      range: placing ? TOWERS[placing].base.range : 0,
      selected: mode === "selected" ? selected : null,
    });
    hud();
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    if (state === "finished") return;
    state = "finished";
    setMode("idle", false);
    sfx.music(false);
    get("pause").hidden = true;
    const won = game.over === "won";
    const score = won
      ? settings.waves * 1000 + game.lives * 10
      : (game.wave - 1) * 1000;
    const previousBest = best;
    if (score > best) {
      best = score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    results.show(
      won ? "The yard is safe!" : `The bubbles got in on wave ${game.wave}`,
      won
        ? `You popped every bubble across ${settings.waves} waves${game.lives === settings.lives ? " without letting a single one through!" : "."}`
        : previousBest > score
          ? "Try building near the bends in the path, where defenders can reach it twice."
          : "Sprinklers and catapults are great for crowds; frogs for big bubbles.",
      [
        [
          won
            ? `${settings.waves}/${settings.waves}`
            : `${game.wave - 1}/${settings.waves}`,
          "WAVES CLEARED",
        ],
        [game.popped.toLocaleString(), "POPS"],
        [game.lives, "LIVES LEFT"],
        [game.towers.length, "DEFENDERS"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      game = createGame(level);
      scene.reset();
      fast = false;
      cursor = { x: -7, z: 0 };
      get("pops").replaceChildren();
      setMode("idle", false);
      say(
        touchy
          ? "Tap a defender at the bottom, then tap the grass to place it."
          : "Pick a defender at the bottom (or press 1), then click the grass near the path.",
        5000,
      );
    }
    held.clear();
    settled = performance.now() + 350;
    sfx.resume();
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
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
    held.clear();
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
  get("go").onclick = () => {
    goOrFast();
    canvas.focus({ preventScroll: true });
  };
  get("fast").onclick = () => {
    fast = !fast;
    sfx.click();
    hud();
    canvas.focus({ preventScroll: true });
  };
  get("music").onclick = () => {
    musicOn = !musicOn;
    try {
      localStorage.setItem(musicKey, musicOn ? "on" : "off");
    } catch {}
    music();
    canvas.focus({ preventScroll: true });
  };
  for (const b of shop.querySelectorAll("[data-buy]")) {
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.onclick = () => {
      choose(b.dataset.buy);
      if (mode === "placing") canvas.focus({ preventScroll: true });
    };
  }
  for (const b of towerPanel.querySelectorAll("[data-up]"))
    b.onclick = () => {
      const t = selected;
      if (!t) return;
      const u = nextUpgrade(t, Number(b.dataset.up));
      if (upgrade(game, t, Number(b.dataset.up))) {
        sfx.upgrade();
        floater(u.name, t.x, t.z, "upgrade");
      } else {
        sfx.nope();
        say(`${u?.name} costs ${money(u?.cost ?? 0)}.`);
      }
      towerHud();
      if (b.disabled)
        towerPanel
          .querySelector("[data-up]:not(:disabled), [data-t-sell]")
          .focus({ preventScroll: true });
    };
  get("t-target").onclick = () => {
    const t = selected;
    if (!t) return;
    t.target = TARGETING[(TARGETING.indexOf(t.target) + 1) % TARGETING.length];
    sfx.click();
    towerHud();
  };
  get("t-sell").onclick = () => {
    const t = selected;
    if (!t) return;
    const value = sell(game, t);
    sfx.sell();
    floater(`+${money(value)}`, t.x, t.z, "bonus");
    setMode("idle");
  };
  get("t-close").onclick = () => setMode("idle");

  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") {
      if (!back()) pause();
    } else if (state === "ready") dialog.close();
  });

  const keyName = (event) =>
    event.key === "Shift" ? "shift" : (event.key || "").toLowerCase();
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const k = keyName(event);
    const onButton = event.target.closest?.("button");
    if (MOVE_KEYS[k] && !onButton) {
      event.preventDefault();
      held.add(k);
      return;
    }
    if (k === "shift") held.add(k);
    if (event.repeat) return;
    if (/^[1-5]$/.test(k)) {
      event.preventDefault();
      choose(TOWER_KINDS[Number(k) - 1]);
    } else if ((k === " " || k === "enter") && !onButton) {
      event.preventDefault();
      if (performance.now() >= settled) act();
    } else if (k === "n" || k === "r") {
      event.preventDefault();
      goOrFast();
    } else if (k === "f") {
      fast = !fast;
      sfx.click();
    } else if ((k === "backspace" || k === "delete") && selected) {
      event.preventDefault();
      get("t-sell").click();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    held.delete(keyName(event));
  });

  // Mouse and touch: hover moves the cursor; click/tap acts where you point.
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || state !== "playing") return;
    const p = scene.pick(event.clientX, event.clientY);
    if (p) cursor = p;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    sfx.resume();
    canvas.focus({ preventScroll: true });
    if (event.button === 2) return void back();
    const p = scene.pick(event.clientX, event.clientY);
    if (!p) return;
    cursor = p;
    if (mode === "placing") {
      // On touch, the first tap shows where it would go; tap again to build.
      if (event.pointerType === "touch") {
        const near =
          touchGhost &&
          Math.hypot(p.x - touchGhost.x, p.z - touchGhost.z) < 1.2;
        if (!near) {
          touchGhost = p;
          say(
            canPlace(game, p.x, p.z)
              ? "Tap again to build here."
              : "Not there! Pick open grass, off the path.",
            2000,
          );
          return;
        }
        cursor = touchGhost;
      }
      tryPlace(cursor.x, cursor.z);
      return;
    }
    const t = towerAt(game, p.x, p.z);
    if (t) {
      sfx.click();
      selected = t;
      setMode("selected", false);
    } else if (mode !== "idle") setMode("idle");
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

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

  // Dev helpers (console): the live game, and the canvas as a JPEG for the
  // menu picture (src/assets/modes/pop-patrol.jpg).
  dialog.game = () => game;
  dialog.snapshot = () => canvas.toDataURL("image/jpeg", 0.86);

  const scene = createPopPatrolScene(canvas, avatar);
  dialog.showModal();
  music();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Pop the bubbles!";
  get("details").textContent =
    `The neighbour's bubble machine is going wild, and the bubbles are floating to your back door. Place backyard defenders along the path to pop them. Survive ${settings.waves} waves! You have ${settings.lives} lives.${best ? ` Your best: ${best >= settings.waves * 1000 ? "won" : `${Math.floor(best / 1000)} waves`}.` : ""}`;
  get("play").focus();
}
