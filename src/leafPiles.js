import preview from "./assets/modes/leaf-piles.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createLeafPilesScene } from "./leafPilesScene.js";
import {
  BLOWER,
  CORNERS,
  CORNER_RADIUS,
  GOLD_VALUE,
  PLAYERS,
  ROUNDS,
  ROUND_TIME,
  SEAT_NAMES,
  SEAT_ORDER,
  STEP,
  WINS_NEEDED,
  joinSeat,
  leaveSeat,
  matchState,
  newRound,
  piles,
  playerNumber,
  sameSeat,
  stickWalk,
  step as stepRound,
  winners,
} from "../shared/leafPiles.js";
import { PAD, padState } from "./padBridge.js";
import {
  AVATARS,
  CHARACTERS,
  COLORS,
  avatarChoice,
} from "../shared/avatars.js";
import { menuPlayers } from "./avatarPicker.js";
import "./leafPiles.css";

const HOW_TO = `Four of you share one yard, one corner each. Leaves keep falling from the trees all around. Walk with WASD or the arrow keys and press Space to swing your rake: the leaves in front of you slide off the way you're facing, so stand behind them and face your corner. Whatever is lying in your corner when the time runs out is your pile. A golden leaf is worth ${GOLD_VALUE}. Piles aren't safe, so rake leaves out of other corners too! Grab the leaf blower when it turns up: hold Space to blow for ${BLOWER.time} seconds. Most leaves wins the round; first to ${WINS_NEEDED} rounds wins.`;
const COUNTDOWN = 2.6;
const ROUND_PAUSE = 3.2;

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
  const noise = (volume, length, cutoff, type = "bandpass", q = 1) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const f = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * f) ** 0.6;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    // A swish of the rake, crunchier when it catches leaves.
    rake: (leaves) => {
      noise(0.07, 0.18, 1800, "bandpass", 0.8);
      if (leaves)
        noise(Math.min(0.2, 0.06 + leaves * 0.015), 0.26, 4200, "highpass");
    },
    blow: () => noise(0.05, 0.12, 900, "lowpass"),
    pile: () => tone(660, 0, 0.08, "triangle", 0.05),
    lost: () => tone(300, 0, 0.12, "triangle", 0.05, 220),
    gold: () =>
      [988, 1319, 1760].forEach((f, i) =>
        tone(f, i * 0.06, 0.18, "sine", 0.07),
      ),
    pickup: () =>
      [392, 523, 659, 784].forEach((f, i) =>
        tone(f, i * 0.07, 0.16, "square", 0.04),
      ),
    blowerHere: () => tone(523, 0, 0.3, "triangle", 0.06, 784),
    bump: () => tone(180, 0, 0.09, "sine", 0.08, 120),
    tick: () => tone(880, 0, 0.06, "square", 0.03),
    go: () => {
      tone(523, 0, 0.12, "triangle", 0.08);
      tone(784, 0.12, 0.24, "triangle", 0.09);
    },
    count: () => tone(440, 0, 0.14, "triangle", 0.07),
    whistle: () => tone(1500, 0, 0.45, "sine", 0.08, 1700),
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

export function installLeafPiles(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "leafpiles";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Four critters raking leaves into the corners of a yard" draggable="false"></span><strong>Leaf Piles</strong><small>Rake falling leaves into your corner, and out of everyone else's. Biggest pile wins the round!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

// The yard's four critters: yours first, then the characters P2–P4 picked
// on the menu with their own controllers (in their corners), and different
// ones, each in a different colour, for the rest.
function yardCast(mine, guests = []) {
  const corners = Array(PLAYERS).fill(null);
  corners[SEAT_ORDER[0]] = mine;
  guests.forEach((g, slot) => {
    if (g) corners[SEAT_ORDER[slot + 1]] = g;
  });
  const picked = corners.filter(Boolean);
  const characters = AVATARS.filter(
    (c) => c !== "frog" && !picked.some((p) => p.character === c),
  );
  const colors = Object.keys(COLORS).filter(
    (c) => !picked.some((p) => p.color === c),
  );
  const step = 3;
  return corners.map(
    (who, i) =>
      who || {
        character: characters[(i * step) % characters.length],
        color: colors.length ? colors[i % colors.length] : mine.color,
      },
  );
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `leaf-piles-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  // Controllers that joined on the menu sit down in their corners.
  const guests = menuPlayers();
  const cast = yardCast(
    avatar,
    guests.map((g) => g && { character: g.character, color: g.color }),
  ).map((a) => ({
    avatar: a,
    color: COLORS[a.color],
    critter: CHARACTERS[a.character].name,
  }));

  const dialog = document.createElement("dialog");
  dialog.className = "leaf-piles";
  dialog.setAttribute("aria-label", "Leaf Piles");
  dialog.innerHTML = `
    <header><strong>Leaf Piles</strong><div><button data-exit>Back to games</button></div></header>
    <div class="leaf-field">
      <canvas aria-label="A backyard seen from above, with a player in each corner and autumn leaves falling"></canvas>
      <div class="leaf-tags" aria-hidden="true">${cast.map((_, i) => `<span class="leaf-tag" data-tag="${i}"></span><strong class="leaf-score" data-score="${i}"></strong>`).join("")}</div>
      <div class="leaf-banner" data-banner aria-live="polite"></div>
      <section class="leaf-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="leaf-modes">
          <button class="primary" data-play>Play</button>
          <button data-two>2 players</button>
          <button data-four>4 players</button>
        </div>
        <small class="leaf-keys" data-keys></small>
      </section>
      <section class="leaf-panel leaf-lobby" data-lobby tabindex="-1" hidden>
        <h2>Who's raking?</h2>
        <p>Press <b>A</b> on each controller to join. Press <b>☰ Menu</b> to start.</p>
        <div class="leaf-seats">${SEAT_ORDER.map(
          (corner, n) =>
            `<div class="leaf-seat" data-seat="${corner}" style="--who:${cast[corner].color}"><b>P${n + 1}</b><span data-seat-who></span><small>${SEAT_NAMES[n]} · ${cast[corner].critter}</small></div>`,
        ).join("")}</div>
        <div class="leaf-modes">
          <button class="primary" data-start>Start</button>
          <button data-lobby-back>Back</button>
        </div>
        <small class="leaf-keys">B leaves your seat. Empty corners are computer neighbours. No controller? Space joins on WASD, Enter joins on the arrow keys.</small>
      </section>
      <div class="leaf-touch" data-touch hidden>
        <div class="leaf-stick" data-stick><span></span></div>
        <button class="leaf-rake" data-rake aria-label="Rake">🍂</button>
      </div>
    </div>
    <footer>
      <div class="leaf-hud"><span data-clock></span><span data-round></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Leaf Piles", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick walks (W A S D) and A rakes (Space), via padBridge.
  dialog.padPlaying = () => state === "playing" || state === "countdown";
  // Four players: the game reads every controller itself (see pollPads).
  dialog.padSeats = () =>
    state === "lobby" ||
    (mode === "four" && ["countdown", "playing", "between"].includes(state));
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".leaf-panel");
  const tags = [...dialog.querySelectorAll("[data-tag]")];
  const scores = [...dialog.querySelectorAll("[data-score]")];
  const sfx = sounds();

  // ready | lobby | countdown | playing | between | paused | finished
  let state = "ready";
  let resumeTo = "playing";
  let mode = "computer"; // computer | two | four
  // Four players: who sits in each corner (see SEAT_ORDER in the rules).
  let seats = [null, null, null, null];
  guests.forEach((g, slot) => {
    if (g) seats[SEAT_ORDER[slot + 1]] = { pad: g.pad };
  });
  const padWas = new Map(); // gamepad index -> last frame's padState
  const padLost = new Set(); // seated controllers that have gone missing
  let round = null;
  let results = [];
  let wait = 0; // countdown / between-rounds timer
  let previous = 0;
  let spare = 0;
  let frame;
  let messageTimer;
  let lastPiles = [0, 0, 0, 0];
  let lastTick = 0;
  let blowClock = 0;
  const keys = new Set();
  const touch = { id: null, x0: 0, y0: 0, x: 0, z: 0, rake: false };

  const humans = () =>
    mode === "four"
      ? SEAT_ORDER.filter((c) => seats[c])
      : mode === "two"
        ? [0, 3]
        : [0];
  const names = () =>
    cast.map((c, i) => {
      const h = humans().indexOf(i);
      if (h < 0) return c.critter;
      if (mode === "four") return `Player ${playerNumber(i)}`;
      return mode === "two" ? `Player ${h + 1}` : "You";
    });

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }
  function banner(text, kind = "") {
    const el = get("banner");
    el.textContent = text;
    el.className = `leaf-banner ${kind}`;
    el.hidden = !text;
  }

  function hud() {
    const left = round ? Math.max(0, ROUND_TIME - round.t) : ROUND_TIME;
    const clock = get("clock");
    clock.textContent = `⏱ ${Math.ceil(left)}`;
    clock.classList.toggle("hurry", state === "playing" && left <= 10);
    const shown = state === "between" ? results.length : results.length + 1;
    get("round").textContent = `Round ${Math.min(shown, ROUNDS)} of ${ROUNDS}`;
  }

  // The connected controllers, by gamepad index.
  function connectedPads() {
    const out = new Map();
    for (const pad of navigator.getGamepads?.() || [])
      if (pad?.connected) out.set(pad.index, pad);
    return out;
  }

  // Four players: one controller's walk and rake.
  function padWalk(pad) {
    const s = padState(pad);
    const dpad = (neg, pos) =>
      (pad.buttons[pos]?.pressed ? 1 : 0) - (pad.buttons[neg]?.pressed ? 1 : 0);
    const walk = stickWalk(pad.axes[0] || 0, pad.axes[1] || 0);
    return {
      x: walk.x + dpad(PAD.LEFT, PAD.RIGHT),
      z: walk.z + dpad(PAD.UP, PAD.DOWN),
      rake: s.action,
    };
  }

  // Four players: read every controller each frame. In the lobby A joins,
  // B leaves (or goes back, if you weren't seated) and Menu starts; in play
  // the seated controllers steer and B or Menu pauses.
  function pollPads() {
    if (!dialog.padSeats() || !document.hasFocus() || document.hidden) {
      padWas.clear();
      return;
    }
    const pads = connectedPads();
    for (const index of padWas.keys())
      if (!pads.has(index)) padWas.delete(index);
    for (const [index, pad] of pads) {
      const now = padState(pad);
      const was = padWas.get(index);
      padWas.set(index, now);
      // A controller first seen holding a button (the A that opened the
      // lobby) counts as a fresh press only in the lobby.
      const pressed = (k) => now[k] && (was ? !was[k] : state === "lobby");
      const who = { pad: index };
      const seated = seats.some((s) => sameSeat(s, who));
      if (state === "lobby") {
        if (pressed("a")) seatChange(joinSeat(seats, who));
        else if (pressed("b")) {
          if (seated) seatChange(leaveSeat(seats, who));
          else closeLobby();
          return;
        } else if (pressed("menu")) {
          startFour();
          return;
        }
      } else if (seated && (pressed("b") || pressed("menu"))) {
        pause();
        return;
      }
    }
    // Seated controllers that were unplugged (or came back).
    seats.forEach((s, corner) => {
      if (s?.pad === undefined) return;
      const here = pads.has(s.pad);
      if (!here && !padLost.has(corner)) {
        padLost.add(corner);
        say(
          `Player ${playerNumber(corner)}'s controller isn't connected.`,
          4000,
        );
      } else if (here && padLost.delete(corner))
        say(`Player ${playerNumber(corner)} is back!`);
    });
    if (state === "lobby") showSeats();
  }

  // What each human is holding this frame.
  function inputs() {
    const held = (...k) => k.some((key) => keys.has(key));
    const axis = (neg, pos) => (held(...pos) ? 1 : 0) - (held(...neg) ? 1 : 0);
    if (mode === "four") {
      const pads = connectedPads();
      return seats.map((s) => {
        if (s?.pad !== undefined)
          return pads.has(s.pad) ? padWalk(pads.get(s.pad)) : undefined;
        if (s?.keys === "wasd")
          return {
            x: axis(["a"], ["d"]),
            z: axis(["w"], ["s"]),
            rake: held(" ", "e", "f"),
          };
        if (s?.keys === "arrows")
          return {
            x: axis(["ArrowLeft"], ["ArrowRight"]),
            z: axis(["ArrowUp"], ["ArrowDown"]),
            rake: held("Enter", "/", ".", "Shift"),
          };
        return undefined;
      });
    }
    const two = mode === "two";
    const p1 = {
      x: axis(["a"], ["d"]) + (two ? 0 : axis(["ArrowLeft"], ["ArrowRight"])),
      z: axis(["w"], ["s"]) + (two ? 0 : axis(["ArrowUp"], ["ArrowDown"])),
      rake: held(" ", "e", "f") || (!two && held("Enter")) || touch.rake,
    };
    if (touch.id !== null) {
      p1.x += touch.x;
      p1.z += touch.z;
    }
    const list = [p1];
    if (two)
      list[3] = {
        x: axis(["ArrowLeft"], ["ArrowRight"]),
        z: axis(["ArrowUp"], ["ArrowDown"]),
        rake: held("Enter", "/", ".", "Shift"),
      };
    return list;
  }

  function react(events) {
    const people = humans();
    for (const e of events) {
      const mine = people.includes(e.who);
      if (e.type === "rake" && mine) sfx.rake(e.leaves);
      else if (e.type === "pickup") {
        sfx.pickup();
        say(
          mine
            ? `Leaf blower! Hold the rake button to blow for ${BLOWER.time} seconds.`
            : `${names()[e.who]} grabbed the leaf blower!`,
          3000,
        );
      } else if (e.type === "blower") {
        sfx.blowerHere();
        say("A leaf blower! Grab it!", 2200);
      } else if (e.type === "bump" && (mine || people.includes(e.other)))
        sfx.bump();
    }
    // Your pile changing.
    const now = piles(round.leaves);
    for (const i of people) {
      const diff = now[i].points - lastPiles[i];
      if (diff >= GOLD_VALUE) sfx.gold();
      else if (diff > 0) sfx.pile();
      else if (diff < 0) sfx.lost();
    }
    lastPiles = now.map((p) => p.points);
    if (round.players.some((p, i) => people.includes(i) && p.blowing)) {
      blowClock -= STEP;
      if (blowClock <= 0) {
        blowClock = 0.1;
        sfx.blow();
      }
    }
  }

  function tick(dt) {
    if (state === "countdown") {
      const before = Math.ceil(wait);
      wait -= dt;
      if (Math.ceil(wait) !== before && wait > 0) {
        banner(String(Math.ceil(wait)), "count");
        sfx.count();
      }
      if (wait <= 0) {
        state = "playing";
        banner("Rake!", "go");
        sfx.go();
        setTimeout(() => state === "playing" && banner(""), 700);
      }
      return;
    }
    if (state === "between") {
      wait -= dt;
      if (wait <= 0) nextRound();
      return;
    }
    if (state !== "playing") return;
    spare += dt;
    while (spare >= STEP) {
      spare -= STEP;
      stepRound(round, inputs(), STEP);
      react(round.events);
    }
    const left = ROUND_TIME - round.t;
    if (left <= 10 && Math.ceil(left) !== lastTick && left > 0) {
      lastTick = Math.ceil(left);
      sfx.tick();
    }
    if (round.t >= ROUND_TIME) endRound();
  }

  function endRound() {
    const points = piles(round.leaves).map((p) => p.points);
    results.push(points);
    sfx.whistle();
    const top = winners(points);
    const who = names();
    const people = humans();
    const mine = top.some((i) => people.includes(i));
    if (mode === "computer" && points[0] > best) {
      best = points[0];
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const title =
      top.length > 1
        ? `${top.map((i) => who[i]).join(" and ")} tie the round!`
        : mode === "computer" && top[0] === 0
          ? "You win the round!"
          : `${who[top[0]]} win${who[top[0]] === "You" ? "" : "s"} the round!`;
    banner(title, mine ? "win" : "");
    if (mine) sfx.win();
    const match = matchState(results);
    state = "between";
    wait = match.over ? ROUND_PAUSE * 0.8 : ROUND_PAUSE;
    get("pause").hidden = true;
  }

  function nextRound() {
    const match = matchState(results);
    if (match.over) return finish(match);
    startRound();
  }

  function startRound() {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const people = humans();
    round = newRound(
      seed,
      cast.map((_, i) => ({ bot: !people.includes(i) })),
      level,
    );
    // Lay the first leaves on the grass before the countdown.
    stepRound(round, [], 0);
    lastPiles = [0, 0, 0, 0];
    lastTick = 0;
    spare = 0;
    wait = COUNTDOWN;
    state = "countdown";
    banner(`Round ${results.length + 1}`, "count");
    get("pause").hidden = false;
    hud();
  }

  function finish(match) {
    state = "finished";
    banner("");
    get("pause").hidden = true;
    keys.clear();
    const who = names();
    const people = humans();
    const won = match.champs.some((i) => people.includes(i));
    if (won) sfx.win();
    else sfx.done();
    const champ = match.champs;
    const title =
      champ.length > 1
        ? `${champ.map((i) => who[i]).join(" and ")} share the win!`
        : mode === "computer" && champ[0] === 0
          ? "You win Leaf Piles!"
          : `${who[champ[0]]} win${who[champ[0]] === "You" ? "" : "s"}!`;
    const roundsLine = results
      .map(
        (r, k) =>
          `Round ${k + 1}: ${people.map((i) => `${who[i]} ${r[i]}`).join(", ")}`,
      )
      .join(" · ");
    const detail =
      mode === "computer"
        ? `${roundsLine}.${best ? ` Your biggest pile: ${best}.` : ""}`
        : `${roundsLine}.`;
    resultsScreen.show(
      title,
      detail,
      cast.map((_, i) => [
        `${match.wins[i]}★ ${match.points[i]}`,
        who[i].toUpperCase(),
      ]),
    );
  }

  function begin(reset) {
    resultsScreen.hide();
    if (reset) {
      results = [];
      round = null;
      startRound();
      say(
        mode === "two"
          ? "Player 1: WASD + Space · Player 2: arrows + Enter"
          : mode === "four"
            ? "Everyone: rake the leaves into your own corner!"
            : "Walk behind the leaves, face your corner and rake!",
        3500,
      );
    } else state = resumeTo;
    keys.clear();
    touch.id = null;
    touch.rake = false;
    padWas.clear();
    sfx.resume();
    panel.hidden = true;
    lobby.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("touch").hidden =
      mode === "four" || !matchMedia("(pointer: coarse)").matches;
    if (state !== "between") get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (!["playing", "countdown", "between"].includes(state)) return;
    resumeTo = state;
    state = "paused";
    keys.clear();
    touch.id = null;
    touch.rake = false;
    setPauseScreen(dialog, true);
  }

  function draw(dt) {
    if (!round) {
      // Before the first game: an empty yard with everyone in place.
      round = newRound(
        1,
        cast.map(() => ({ bot: true })),
        level,
      );
      stepRound(round, [], 0);
    }
    scene.draw(dt, round);
    const who = names();
    const people = humans();
    const pile = piles(round.leaves);
    const match = matchState(results);
    round.players.forEach((p, i) => {
      const head = scene.toScreen(p.x, 1.9, p.z);
      const tag = tags[i];
      tag.textContent = who[i] + (p.blower > 0 ? " 💨" : "");
      tag.style.left = `${head.x}px`;
      tag.style.top = `${head.y}px`;
      tag.style.setProperty("--who", cast[i].color);
      tag.classList.toggle("human", people.includes(i));
      const c = CORNERS[i];
      const spot = scene.toScreen(
        c.x - Math.sign(c.x) * CORNER_RADIUS * 0.42,
        0,
        c.z - Math.sign(c.z) * CORNER_RADIUS * 0.42,
      );
      const score = scores[i];
      const value = String(pile[i].points);
      if (score.firstChild?.textContent !== value) {
        score.replaceChildren(value);
        score.classList.remove("bump");
        void score.offsetWidth;
        score.classList.add("bump");
      }
      score.dataset.wins = "★".repeat(match.wins[i]);
      score.style.left = `${spot.x}px`;
      score.style.top = `${spot.y}px`;
      score.style.setProperty("--who", cast[i].color);
    });
    hud();
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    pollPads();
    tick(dt);
    const frozen = state === "paused";
    draw(frozen ? 0 : dt);
    if (!frozen) frame = requestAnimationFrame(loop);
  }

  const resultsScreen = gameResults(
    dialog,
    "Leaf Piles",
    () => begin(true),
    () => dialog.close(),
  );
  get("play").onclick = () => {
    mode = "computer";
    begin(true);
  };
  get("two").onclick = () => {
    mode = "two";
    begin(true);
  };

  // Four players: the seat picker.
  const lobby = get("lobby");
  const seatCards = [...dialog.querySelectorAll("[data-seat]")];
  function showSeats() {
    const pads = connectedPads();
    seatCards.forEach((card) => {
      const s = seats[Number(card.dataset.seat)];
      card.classList.toggle("taken", !!s);
      const text = !s
        ? "Press A to join"
        : s.keys === "wasd"
          ? "⌨️ WASD + Space"
          : s.keys === "arrows"
            ? "⌨️ Arrows + Enter"
            : pads.has(s.pad)
              ? `🎮 Controller ${s.pad + 1}`
              : "🎮 Not connected";
      const el = card.querySelector("[data-seat-who]");
      if (el.textContent !== text) el.textContent = text;
    });
    get("start").textContent = seats.some(Boolean)
      ? `Start with ${seats.filter(Boolean).length} player${seats.filter(Boolean).length > 1 ? "s" : ""}`
      : "Start";
  }
  function seatChange(next) {
    if (next === seats) return;
    const joined = next.filter(Boolean).length > seats.filter(Boolean).length;
    seats = next;
    padLost.clear();
    if (joined) sfx.pickup();
    else sfx.lost();
    showSeats();
  }
  function openLobby() {
    state = "lobby";
    // Keep the players from last time, minus controllers that have gone.
    const pads = connectedPads();
    seats = seats.map((s) =>
      s?.pad !== undefined && !pads.has(s.pad) ? null : s,
    );
    padWas.clear();
    sfx.resume();
    panel.hidden = true;
    lobby.hidden = false;
    showSeats();
    lobby.focus({ preventScroll: true });
  }
  function closeLobby() {
    state = "ready";
    lobby.hidden = true;
    panel.hidden = false;
    get("four").focus({ preventScroll: true });
  }
  function startFour() {
    // Nobody joined: whoever pressed Start plays on the keyboard.
    if (!seats.some(Boolean)) seats = joinSeat(seats, { keys: "wasd" });
    mode = "four";
    begin(true);
  }
  get("four").onclick = openLobby;
  get("start").onclick = startFour;
  get("lobby-back").onclick = closeLobby;
  get("pause-resume").onclick = () => begin(false);
  get("pause-restart").onclick = () => begin(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  bindDialogEscape(dialog, () => {
    if (state === "lobby") closeLobby();
    else if (state === "paused") begin(false);
    else if (["playing", "countdown", "between"].includes(state)) pause();
    else dialog.close();
  });

  const GAME_KEYS = new Set([
    "w",
    "a",
    "s",
    "d",
    "e",
    "f",
    " ",
    "Enter",
    "/",
    ".",
    "Shift",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);
  const keyOf = (event) =>
    event.key.length === 1 ? event.key.toLowerCase() : event.key;
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    // Lobby: Space sits a player on WASD, Enter one on the arrow keys
    // (unless you've moved onto a button, where they press it).
    if (state === "lobby" && event.target.tagName !== "BUTTON") {
      const half =
        event.key === " " ? "wasd" : event.key === "Enter" ? "arrows" : null;
      if (half && !event.repeat) {
        event.preventDefault();
        const who = { keys: half };
        seatChange(
          seats.some((s) => sameSeat(s, who))
            ? leaveSeat(seats, who)
            : joinSeat(seats, who),
        );
      }
      return;
    }
    if (!["playing", "countdown", "between"].includes(state)) return;
    const key = keyOf(event);
    if (!GAME_KEYS.has(key)) return;
    event.preventDefault();
    keys.add(key);
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    keys.delete(keyOf(event));
  });

  // Touch: drag anywhere on the yard for a floating stick; the leaf button
  // bottom right rakes.
  const stick = get("stick");
  const knob = stick.querySelector("span");
  const stickRange = 46;
  canvas.addEventListener("pointerdown", (event) => {
    if (state === "paused" || state === "finished" || state === "ready") return;
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    touch.id = event.pointerId;
    touch.x0 = event.clientX;
    touch.y0 = event.clientY;
    touch.x = touch.z = 0;
    const bounds = dialog.getBoundingClientRect();
    stick.style.left = `${event.clientX - bounds.left}px`;
    stick.style.top = `${event.clientY - bounds.top}px`;
    stick.classList.add("on");
    knob.style.transform = "";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touch.id) return;
    let dx = event.clientX - touch.x0;
    let dy = event.clientY - touch.y0;
    const d = Math.hypot(dx, dy);
    if (d > stickRange) {
      dx *= stickRange / d;
      dy *= stickRange / d;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const live = d < 8 ? 0 : 1;
    touch.x = (dx / stickRange) * live;
    touch.z = (dy / stickRange) * live;
  });
  const lift = (event) => {
    if (event.pointerId !== touch.id) return;
    touch.id = null;
    touch.x = touch.z = 0;
    stick.classList.remove("on");
  };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  const rakeButton = get("rake");
  rakeButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.rake = true;
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"])
    rakeButton.addEventListener(type, () => (touch.rake = false));

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

  const scene = createLeafPilesScene(canvas, cast);
  dialog.showModal();
  banner("");
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  const rivals = cast.slice(1).map((c) => c.critter);
  get("heading").textContent = "Rake up a pile!";
  get("details").textContent =
    `Leaves are falling all over the yard. Swing your rake to slide them into your corner (front left), and raid the other corners too: only what's in your corner when time runs out counts. Golden leaves are worth ${GOLD_VALUE}. ${ROUNDS} rounds of ${ROUND_TIME} seconds, first to ${WINS_NEEDED} wins. Your neighbours are ${rivals.slice(0, -1).join(", ")} and ${rivals.at(-1)}.${best ? ` Your biggest pile: ${best}.` : ""}`;
  get("keys").textContent =
    "Walk: WASD or arrows · Rake: Space or Enter · 2 players: WASD + Space, and arrows + Enter (front right) · 4 players: one controller each";
  get("play").focus();
}
