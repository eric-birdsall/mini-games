import preview from "./assets/modes/backyard-apple-catch.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createAppleCatchScene, laneX } from "./appleCatchScene.js";
import {
  APPLES_PER_ROUND,
  LANES,
  MIDDLE,
  PINECONE_COST,
  appleLevel,
  applesLeft,
  applyCatch,
  basketSpot,
  botSpot,
  dropPlan,
  winners,
} from "../shared/appleCatch.js";
import {
  AVATARS,
  CHARACTERS,
  COLORS,
  avatarChoice,
} from "../shared/avatars.js";
import "./appleCatch.css";

const HOW_TO = `You stand under your own apple tree. Your basket is in the middle, or hold left or right to move it to that side. A branch shakes just before something falls, and sometimes two or three things fall at once. Every apple you catch adds one. A pinecone costs ${PINECONE_COST} apples, so keep your basket out from under it! ${APPLES_PER_ROUND} apples fall, and the highest total wins. Hold A / D or ← / →, or press and hold the left or right side of the screen.`;
// Seconds after the last drop lands before the results show.
const END_PAUSE = 1.4;

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
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    rustle: () => noise(0.04, 0.22, 3200),
    // Each apple in a streak plucks a little higher.
    apple: (streak) => {
      const f = 520 * 2 ** (Math.min(streak, 12) / 12);
      tone(f, 0, 0.12, "triangle", 0.1);
      tone(f * 1.5, 0.05, 0.14, "sine", 0.05);
    },
    pinecone: () => {
      tone(150, 0, 0.18, "square", 0.05, 90);
      noise(0.18, 0.18, 700);
      [440, 370, 294].forEach((f, i) =>
        tone(f, 0.12 + i * 0.1, 0.16, "triangle", 0.07),
      );
    },
    thud: () => noise(0.08, 0.1, 300),
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

export function installAppleCatch(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "applecatch";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Players with baskets under apple trees" draggable="false"></span><strong>Backyard Apple Catch</strong><small>Move your basket left, middle or right to catch apples and dodge pinecones. Most apples after 100 wins!</small>`;
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
  // Spread the picks out so the same three don't always turn up.
  const step = 5;
  return Array.from({ length: LANES }, (_, i) => ({
    character: i
      ? characters[1 + ((i * step) % (characters.length - 1))]
      : mine.character,
    color: colors[i % colors.length],
  }));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = appleLevel(level);
  const bestKey = `apple-catch-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const cast = yardCast(avatar).map((a) => ({
    avatar: a,
    color: COLORS[a.color],
    critter: CHARACTERS[a.character].name,
  }));

  const dialog = document.createElement("dialog");
  dialog.className = "apple-catch";
  dialog.setAttribute("aria-label", "Backyard Apple Catch");
  dialog.innerHTML = `
    <header><strong>Backyard Apple Catch</strong><div><button data-exit>Back to games</button></div></header>
    <div class="apple-field">
      <canvas aria-label="Four apple trees in a backyard, a player with a basket under each"></canvas>
      <div class="apple-tags" aria-hidden="true">${cast.map((_, i) => `<span class="apple-tag" data-tag="${i}"></span><strong class="apple-lane-score" data-lane-score="${i}"></strong>`).join("")}</div>
      <div class="apple-pops" data-pops aria-hidden="true"></div>
      <section class="apple-panel">
        <h2 data-heading></h2><p data-details></p>
        <div class="apple-modes">
          <button class="primary" data-play>Play</button>
          <button data-two>2 players</button>
        </div>
        <small class="apple-keys" data-keys></small>
      </section>
    </div>
    <footer>
      <div class="apple-hud"><span data-left></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Backyard Apple Catch", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick holds the basket left / right (padBridge).
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".apple-panel");
  const tags = [...dialog.querySelectorAll("[data-tag]")];
  const laneScores = [...dialog.querySelectorAll("[data-lane-score]")];
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let mode = "computer"; // computer | two
  let drops = [];
  let seed = 1;
  let t = 0;
  let endAt = Infinity;
  let lanes = [];
  let previous = 0;
  let frame;
  let messageTimer;
  const pointers = new Map(); // pointerId → { who, dir }

  // Which lane each human plays in: player 1 on the far left, player 2 on
  // the far right.
  const humanLanes = () => (mode === "two" ? [0, LANES - 1] : [0]);

  function makeLanes() {
    const humans = humanLanes();
    lanes = cast.map((c, i) => {
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
        held: { left: false, right: false },
        spot: MIDDLE,
        total: 0,
        apples: 0,
        pinecones: 0,
        streak: 0,
      };
    });
  }

  function hud() {
    get("left").textContent =
      `🍎 ${drops.length ? applesLeft(drops, t) : APPLES_PER_ROUND} left`;
  }

  function say(text, hold = 2200) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function pop(lane, text, kind) {
    const at = scene.basketScreen(lane);
    const el = document.createElement("span");
    el.className = `apple-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function resolve(drop) {
    drop.caught = lanes.map((lane) => lane.spot === drop.spot);
    lanes.forEach((lane, i) => {
      const human = lane.human !== null;
      if (!drop.caught[i]) {
        if (human && drop.kind === "apple") sfx.thud();
        return;
      }
      const { total, change } = applyCatch(lane.total, drop.kind);
      lane.total = total;
      if (drop.kind === "apple") {
        lane.apples++;
        lane.streak++;
        if (human) sfx.apple(lane.streak);
        pop(i, "+1", human ? "plus" : "plus small");
        return;
      }
      lane.pinecones++;
      lane.streak = 0;
      scene.spill(i, -change);
      pop(i, change ? `−${-change}` : "Oops!", human ? "minus" : "minus small");
      if (!human) return;
      sfx.pinecone();
      say(
        mode === "two"
          ? `${lane.name} caught a pinecone!`
          : change
            ? `Ouch, a pinecone! You lost ${-change} apple${change === -1 ? "" : "s"}.`
            : "A pinecone! Keep your basket away from the brown ones.",
      );
    });
    hud();
  }

  function spots() {
    lanes.forEach((lane, i) => {
      if (lane.human === null) {
        const spot = botSpot(drops, t, settings.accuracy, seed, i);
        if (spot !== null) lane.spot = spot;
        return;
      }
      let left = lane.held.left;
      let right = lane.held.right;
      for (const p of pointers.values())
        if (p.who === lane.human) {
          if (p.dir === "left") left = true;
          if (p.dir === "right") right = true;
        }
      lane.spot = basketSpot(left, right);
    });
  }

  function step(dt) {
    t += dt;
    spots();
    for (const drop of drops) {
      if (!drop.rustled && t >= drop.at - 0.55) {
        drop.rustled = true;
        sfx.rustle();
      }
      if (!drop.caught && t >= drop.land) resolve(drop);
    }
    if (t > endAt) finish();
  }

  function draw(dt = 0) {
    scene.draw(dt, {
      t,
      drops,
      lanes: lanes.map(({ spot, total }) => ({ spot, total })),
    });
    lanes.forEach((lane, i) => {
      const head = scene.toScreen(laneX(i), 2.25, -0.6);
      const feet = scene.toScreen(laneX(i), 0, 1.25);
      const tag = tags[i];
      tag.textContent = lane.name;
      tag.style.left = `${head.x}px`;
      tag.style.top = `${head.y}px`;
      tag.style.setProperty("--who", lane.color);
      tag.classList.toggle("human", lane.human !== null);
      const score = laneScores[i];
      score.textContent = lane.total;
      score.style.left = `${feet.x}px`;
      score.style.top = `${feet.y}px`;
      score.style.setProperty("--who", lane.color);
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
    pointers.clear();
    const won = winners(lanes.map((l) => l.total));
    const me = lanes[0];
    let record = false;
    if (mode === "computer" && me.total > best) {
      best = me.total;
      record = true;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const humanWon = won.some((i) => lanes[i].human !== null);
    if (humanWon) sfx.win();
    else sfx.done();
    const names = won.map((i) => lanes[i].name);
    const title =
      mode === "computer" && won.includes(0)
        ? won.length > 1
          ? "You tied for first!"
          : "You win the harvest!"
        : won.length > 1
          ? `${names.join(" and ")} tie!`
          : `${names[0]} win${names[0] === "You" ? "" : "s"}!`;
    const caught = (l) =>
      `${l.apples} apple${l.apples === 1 ? "" : "s"}${l.pinecones ? ` and ${l.pinecones} pinecone${l.pinecones === 1 ? "" : "s"}` : ""}`;
    const humans = lanes.filter((l) => l.human !== null);
    const detail =
      mode === "two"
        ? humans.map((l) => `${l.name} caught ${caught(l)}.`).join(" ")
        : `You caught ${caught(me)}.${record ? " New best!" : best ? ` Your best: ${best}.` : ""}`;
    results.show(
      title,
      detail,
      lanes.map((l) => [l.total, l.name.toUpperCase()]),
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      seed = (Math.random() * 2 ** 32) >>> 0;
      drops = dropPlan(level, seed);
      endAt = drops.at(-1).land + END_PAUSE;
      t = 0;
      makeLanes();
      get("pops").replaceChildren();
      say(
        mode === "two"
          ? "Player 1: hold A / D · Player 2: hold ← / →"
          : "Hold left or right to move your basket!",
        3000,
      );
    }
    for (const lane of lanes) lane.held.left = lane.held.right = false;
    pointers.clear();
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
    for (const lane of lanes) lane.held.left = lane.held.right = false;
    pointers.clear();
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Backyard Apple Catch",
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

  // Keys: in two-player mode A / D is player 1 and the arrows player 2.
  function held(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const dir = {
      a: "left",
      d: "right",
      ArrowLeft: "left",
      ArrowRight: "right",
    }[key];
    if (!dir) return null;
    const human = mode === "two" && key.startsWith("Arrow") ? 1 : 0;
    const lane = lanes.find((l) => l.human === human);
    return lane && { lane, dir };
  }
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const move = held(event);
    if (!move) return;
    event.preventDefault();
    move.lane.held[move.dir] = true;
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const move = held(event);
    if (move) move.lane.held[move.dir] = false;
  });

  // Press and hold: the left or right part of the screen holds that side;
  // the middle (or letting go) puts the basket back in the middle. With two
  // players each gets their own half of the screen.
  function touch(event) {
    const bounds = canvas.getBoundingClientRect();
    let f = (event.clientX - bounds.left) / bounds.width;
    let who = 0;
    if (mode === "two") {
      who = f < 0.5 ? 0 : 1;
      f = (f - who * 0.5) * 2;
    }
    return { who, dir: f < 0.38 ? "left" : f > 0.62 ? "right" : null };
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, touch(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (state !== "playing" || !pointers.has(event.pointerId)) return;
    // Keep the finger with the player it started on.
    const now = touch(event);
    if (now.who === pointers.get(event.pointerId).who)
      pointers.set(event.pointerId, now);
  });
  const lift = (event) => pointers.delete(event.pointerId);
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

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

  makeLanes();
  const scene = createAppleCatchScene(canvas, cast);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  const rivals = cast.slice(1).map((c) => c.critter);
  get("heading").textContent = "Catch the apples!";
  get("details").textContent =
    `Your basket stays in the middle. Hold left or right to move it to that side. Catch apples (+1) and keep away from pinecones (−${PINECONE_COST}). Sometimes two or three things fall at once! ${APPLES_PER_ROUND} apples fall, and the biggest total wins. Your neighbours are ${rivals.slice(0, -1).join(", ")} and ${rivals.at(-1)}.${best ? ` Your best: ${best}.` : ""}`;
  get("keys").textContent =
    "Hold A / D or ← / →, or hold the left or right side of the screen · 2 players: A / D and ← / →";
  get("play").focus();
}
