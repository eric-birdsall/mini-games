import preview from "./assets/modes/acorn-drop.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createAcornDropScene } from "./acornDropScene.js";
import {
  ACORNS_PER_ROUND,
  POTS,
  POT_VALUES,
  HOME_X,
  RETURN_SPEED,
  canDrop,
  createAcorn,
  dropLevel,
  pegLayout,
  stepAcorn,
  walk,
  walkToward,
} from "../shared/acornDrop.js";
import { avatarChoice } from "../shared/avatars.js";
import "./acornDrop.css";

const HOW_TO = `Your critter starts on the little ledge beside the fence with an acorn. Walk it along the top of the fence with A / D or ← / → (or the ◀ ▶ buttons, or tap the fence where you want to go), then press Space or Enter (or the Drop button) to let go. The acorn bounces down through the pegs into a flower pot, and the pot grows the number of flowers written on it, from one to five; the middle pot grows five! After each drop your critter walks back to the ledge for the next acorn. You have ${ACORNS_PER_ROUND} acorns. On a controller, the stick walks and A drops.`;
// How long an acorn sits in its pot before the next one is ready.
const SETTLE = 0.9;
// Pause after the last acorn before the results.
const END_PAUSE = 1.6;

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
  const SCALE = [523, 587, 659, 784, 880, 1047];
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    // A wooden tock, a little higher further down the board.
    peg: (height) => {
      const f = 700 + (8 - Math.min(8, height)) * 70 + Math.random() * 40;
      tone(f, 0, 0.06, "triangle", 0.06);
      noise(0.025, 0.04, 2400);
    },
    drop: () => tone(330, 0, 0.18, "sine", 0.08, 520),
    // Plop into the pot, then one rising note per flower.
    pot: (value) => {
      noise(0.12, 0.12, 380);
      for (let i = 0; i < value; i++)
        tone(SCALE[i], 0.12 + i * 0.09, 0.22, "triangle", 0.08);
      if (value === 5) tone(SCALE[5], 0.6, 0.4, "sine", 0.07);
    },
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.26, "triangle", 0.09),
      ),
  };
}

export function installAcornDrop(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "acorndrop";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="An acorn bouncing down pegs on a garden fence into flower pots" draggable="false"></span><strong>Acorn Drop</strong><small>Drop acorns down the garden fence. They bounce off the pegs into flower pots and grow one to five flowers each!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const pegs = pegLayout(level);
  const bestKey = `acorn-drop-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "acorn-drop";
  dialog.setAttribute("aria-label", "Acorn Drop");
  dialog.innerHTML = `
    <header><strong>Acorn Drop</strong><div><button data-exit>Back to games</button></div></header>
    <div class="acorn-field">
      <canvas aria-label="A tall garden fence with pegs, flower pots along the bottom and your critter on the top rail"></canvas>
      <div class="acorn-labels" aria-hidden="true">${POT_VALUES.map(
        (value, i) =>
          `<span class="acorn-pot-label" data-pot="${i}"><b>${value}</b><i>${"<em></em>".repeat(value)}</i></span>`,
      ).join("")}</div>
      <div class="acorn-pops" data-pops aria-hidden="true"></div>
      <div class="acorn-pad" data-touch hidden>
        <button type="button" data-move="-1" aria-label="Walk left">◀</button>
        <button type="button" class="drop" data-drop>Drop</button>
        <button type="button" data-move="1" aria-label="Walk right">▶</button>
      </div>
      <section class="acorn-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="acorn-keys">A / D or ← / → to walk · Space or Enter to drop · Controller: stick and A</small>
      </section>
    </div>
    <footer>
      <div class="acorn-hud"><span data-left></span><span data-flowers></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Acorn Drop", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick walks (the pad bridge sends A / D) and A drops
  // (Space).
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".acorn-panel");
  const labels = [...dialog.querySelectorAll("[data-pot]")];
  const sfx = sounds();

  let state = "ready"; // ready | playing | paused | finished
  let phase = "aim"; // aim | falling | done
  let t = 0; // play time
  let acorn = null;
  let inPot = 0;
  let left = ACORNS_PER_ROUND;
  let flowers = 0;
  let landed = [];
  let endAt = Infinity;
  let previous = 0;
  let frame;
  let messageTimer;
  let hits = [];
  // The critter on the rail.
  let critterX = HOME_X;
  let facing = 1;
  let moving = false;
  let returning = false; // heading back to the ledge after a drop
  let target = null; // a tapped spot to walk to
  const keys = { left: false, right: false };
  const buttons = { left: false, right: false };

  function hud() {
    get("left").textContent = `🌰 ${left}`;
    get("left").setAttribute(
      "aria-label",
      `${left} acorn${left === 1 ? "" : "s"} left`,
    );
    get("flowers").textContent = `🌼 ${flowers}`;
    get("flowers").setAttribute("aria-label", `${flowers} flowers`);
  }

  function say(text, hold = 2600) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function pop(pot, value) {
    const at = scene.potTop(pot);
    const el = document.createElement("span");
    el.className = `acorn-pop${value === 5 ? " big" : ""}`;
    el.textContent = `+${value} 🌼`;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function drop() {
    if (state !== "playing" || phase !== "aim" || returning) return;
    if (!canDrop(critterX)) {
      say("Walk out over the fence first!", 2200);
      return;
    }
    acorn = createAcorn(critterX, (Math.random() * 2 ** 32) >>> 0);
    phase = "falling";
    inPot = 0;
    left--;
    // Back to the ledge for the next one.
    returning = true;
    target = null;
    sfx.drop();
    say("");
    hud();
  }

  function moveCritter(dt) {
    const dir =
      (keys.right || buttons.right ? 1 : 0) -
      (keys.left || buttons.left ? 1 : 0);
    const was = critterX;
    if (returning) {
      critterX = walkToward(critterX, HOME_X, RETURN_SPEED, dt);
      if (critterX === HOME_X) {
        returning = false;
        if (phase === "aim") say("Walk out again!", 1800);
      }
    } else if (phase !== "aim") {
      // Wait on the ledge until the next acorn is ready.
      target = null;
    } else if (dir) {
      target = null;
      critterX = walk(critterX, dir, dt, level);
    } else if (target !== null) {
      critterX = walkToward(critterX, target, dropLevel(level).walk, dt);
      if (Math.abs(critterX - target) < 1e-6 || critterX === was) target = null;
    }
    moving = critterX !== was;
    if (moving) facing = Math.sign(critterX - was);
  }

  function land(pot) {
    const value = POT_VALUES[pot];
    landed.push(pot);
    flowers += value;
    scene.bloom(pot, value);
    pop(pot, value);
    sfx.pot(value);
    labels[pot].classList.remove("lit");
    void labels[pot].offsetWidth; // restart the glow
    labels[pot].classList.add("lit");
    if (value >= 4) scene.cheer(value === 5 ? 1.8 : 1.1);
    say(
      value === 5
        ? "The middle pot! Five flowers!"
        : `${["", "One flower", "Two flowers", "Three flowers", "Four flowers"][value]}!`,
      1800,
    );
    hud();
  }

  function step(dt) {
    t += dt;
    moveCritter(dt);
    if (phase !== "falling") {
      if (phase === "done" && t > endAt) finish();
      return;
    }
    const event = stepAcorn(acorn, pegs, level, dt);
    for (const key of acorn.newHits.splice(0))
      if (typeof key === "number") {
        hits.push(key);
        sfx.peg(pegs[key].y);
      }
    if (event === "pot") land(acorn.pot);
    if (acorn.pot !== null) {
      inPot += dt;
      if (inPot > SETTLE) {
        acorn = null;
        if (left > 0) {
          phase = "aim";
          if (!returning) say("Walk out again!", 1800);
        } else {
          phase = "done";
          endAt = t + END_PAUSE - SETTLE;
          scene.cheer(2.5);
        }
      }
    }
  }

  function draw(dt = 0) {
    const holding = phase === "aim" && left > 0 && !returning;
    scene.draw(dt, {
      critter: { x: critterX, facing, walking: moving && state === "playing" },
      holding,
      spare: left - (holding ? 1 : 0),
      acorns: acorn ? [acorn] : [],
      hit: hits,
    });
    hits = [];
    labels.forEach((label, i) => {
      const at = scene.potLabel(i);
      label.style.left = `${at.x}px`;
      label.style.top = `${at.y}px`;
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
    let record = false;
    if (flowers > best) {
      record = best > 0;
      best = flowers;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    sfx.win();
    results.show(
      `Your garden grew ${flowers} flowers!`,
      record
        ? "That's your biggest garden yet!"
        : `Your biggest garden: ${best} flowers.`,
      [
        [flowers, "FLOWERS"],
        [landed.filter((p) => POT_VALUES[p] === 5).length, "MIDDLE POTS"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      t = 0;
      acorn = null;
      phase = "aim";
      left = ACORNS_PER_ROUND;
      flowers = 0;
      landed = [];
      endAt = Infinity;
      critterX = HOME_X;
      facing = 1;
      returning = false;
      target = null;
      scene.clearGarden();
      get("pops").replaceChildren();
      say(
        touch
          ? "Walk out with ◀ ▶, then press Drop!"
          : "Walk out with A / D, then press Space to drop!",
        0,
      );
    }
    release();
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

  // Let go of every held direction (on pause, blur or restart).
  function release() {
    keys.left = keys.right = buttons.left = buttons.right = false;
  }

  function pause() {
    if (state !== "playing") return;
    release();
    state = "paused";
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Acorn Drop",
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

  const direction = (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return { a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" }[
      key
    ];
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const dir = direction(event);
    if (dir) {
      event.preventDefault();
      keys[dir] = true;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) drop();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const dir = direction(event);
    if (dir) keys[dir] = false;
  });

  // Tap or click the fence: the critter walks to that spot.
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (returning) return;
    const x = scene.aimX(event.clientX, event.clientY);
    if (x !== null) target = x;
  });

  // On-screen ◀ Drop ▶ buttons, shown on touch screens.
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  get("touch").hidden = !touch;
  for (const button of dialog.querySelectorAll("[data-move]")) {
    const dir = button.dataset.move === "1" ? "right" : "left";
    const hold = (on) => (event) => {
      event.preventDefault();
      if (on && state !== "playing") return;
      buttons[dir] = on;
      if (on) button.setPointerCapture?.(event.pointerId);
    };
    button.addEventListener("pointerdown", hold(true));
    for (const end of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(end, hold(false));
  }
  get("drop").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    drop();
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

  const scene = createAcornDropScene(canvas, avatar, pegs);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Drop the acorns!";
  get("details").textContent =
    `Walk your critter out along the top of the fence with an acorn, then drop it! It bounces down the pegs into a flower pot, and the pot grows that many flowers. After each drop your critter goes back to its ledge for the next acorn. You have ${ACORNS_PER_ROUND} acorns.${best ? ` Your biggest garden: ${best} flowers.` : ""}`;
  get("play").focus();
}
