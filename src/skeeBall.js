import preview from "./assets/modes/skee-ball.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createSkeeBallScene } from "./skeeBallScene.js";
import {
  AIM_LIMIT,
  BALL_RADIUS,
  boardPoint,
  meterPower,
  newBall,
  predictLanding,
  skeeLevel,
  stepBall,
} from "../shared/skeeBall.js";
import { avatarChoice } from "../shared/avatars.js";
import "./skeeBall.css";

const TITLE = "Skee Ball";
const AIM_SPEED = 0.07; // radians a second while aiming
const NEXT_BALL = 1; // pause after a ball drops, before the next one
const HOW_TO = `Roll the ball up the arcade lane, over the hump and into the rings. The middle ring scores 50, the rings around it 40, 30, 20 and 10, and the two little pockets in the top corners score 100. Aim with A / D or ← / → (or the ◀ ▶ buttons), then hold Space (or the Roll button) and let go when the power meter is where you want it. You can also swipe up the lane with a finger or the mouse: swipe faster to roll harder. Too soft and the ball rolls back to you to try again. Nine balls a game. On a controller, the stick aims and A rolls.`;

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
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
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  };
  const noise = (volume, length, cutoff, type = "lowpass", start = 0) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 0.6;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(audio.currentTime + start);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    roll: (power) => noise(0.12 + power * 0.1, 0.9, 260),
    hump: () => tone(160, 0, 0.12, "triangle", 0.12, 90),
    rail: () => tone(420, 0, 0.06, "square", 0.03),
    land: () => noise(0.18, 0.12, 700, "bandpass"),
    back: () => tone(392, 0, 0.35, "triangle", 0.06, 262),
    score: (points) => {
      if (!points) return tone(220, 0, 0.25, "triangle", 0.06, 180);
      const steps = Math.min(6, Math.round(points / 10));
      for (let i = 0; i < steps; i++)
        tone(523 * 2 ** (i / 6), i * 0.06, 0.14, "square", 0.04);
      if (points === 100)
        [784, 988, 1175, 1568].forEach((f, i) =>
          tone(f, 0.4 + i * 0.09, 0.22, "triangle", 0.08),
        );
    },
    win: () =>
      [392, 523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.12, 0.3, "triangle", 0.09),
      ),
  };
}

export function installSkeeBall(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "skeeball";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="An arcade skee ball lane with colourful target rings and a glowing scoreboard" draggable="false"></span><strong>${TITLE}</strong><small>Roll balls up the arcade lane, over the hump and into the rings. Sink one in a corner pocket for 100!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar()));
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const settings = skeeLevel(level);
  const bestKey = `skee-ball-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "skee-ball";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="skee-field">
      <canvas aria-label="An arcade skee ball lane rising to a hump, with target rings scoring 10 to 50 and two 100 pockets in the top corners"></canvas>
      <div class="skee-pops" data-pops aria-hidden="true"></div>
      <div class="skee-banner" data-banner aria-hidden="true"></div>
      <div class="skee-meter" data-meter aria-hidden="true">
        <span class="skee-meter-label">POWER</span>
        <div class="skee-meter-bar">
          <div class="skee-meter-well">
            <span class="skee-meter-scale"></span>
            <span class="skee-meter-fill" data-fill></span>
            <span class="skee-meter-tick" style="bottom: 25%"></span>
            <span class="skee-meter-tick" style="bottom: 50%"></span>
            <span class="skee-meter-tick" style="bottom: 75%"></span>
          </div>
          <span class="skee-meter-last" data-last hidden></span>
          <span class="skee-meter-pointer" data-pointer hidden><b data-percent></b></span>
        </div>
      </div>
      <div class="skee-pad" data-touch hidden>
        <button type="button" data-aim="1" aria-label="Aim left">◀</button>
        <button type="button" data-roll aria-label="Hold to roll">Hold to roll</button>
        <button type="button" data-aim="-1" aria-label="Aim right">▶</button>
      </div>
      <section class="skee-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="skee-keys">A / D or ← / → aim · hold Space, let go to roll · or swipe up · Controller: stick aims, A rolls</small>
      </section>
    </div>
    <footer>
      <div class="skee-hud"><span data-score></span><span data-balls></span><span data-best></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  // Controller: the stick aims (A / D) and A holds Space to roll.
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".skee-panel");
  const sfx = sounds();
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  let state = "ready"; // ready | playing | paused | finished
  let flow = "aim"; // aim | charge | rolling | between
  let ball = null;
  let ballsLeft = settings.balls;
  let score = 0;
  let hundreds = 0;
  let aim = 0;
  let charge = 0; // seconds the roll button has been held
  let power = 0;
  let wait = 0;
  let frame;
  let previous = 0;
  let messageTimer;
  const keys = { left: false, right: false };
  const held = { left: false, right: false };

  function hud() {
    get("score").textContent = `⭐ ${score}`;
    get("score").setAttribute("aria-label", `Score ${score}`);
    get("balls").textContent = `🎱 ${ballsLeft}`;
    get("balls").setAttribute(
      "aria-label",
      `${ballsLeft} ball${ballsLeft === 1 ? "" : "s"} left`,
    );
    get("best").textContent = best ? `🏆 ${best}` : "";
    get("best").setAttribute("aria-label", `Best ${best}`);
    scene.scoreboard(score, ballsLeft);
  }

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function banner(text) {
    const el = get("banner");
    el.textContent = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  function pop(x, y, z, text, big) {
    const at = scene.toScreen(x, y, z);
    const el = document.createElement("span");
    el.className = `skee-pop${big ? " big" : ""}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // The power meter. mode: "idle" (empty, waiting), "charge" (filling
  // while held: the pointer shows the power you'd roll with now) or
  // "rolled" (the power you just rolled with, in yellow).
  let lastPower = null;
  function meter(value, mode = "idle") {
    const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
    get("fill").style.height = mode === "idle" ? "0%" : `${percent}%`;
    const pointer = get("pointer");
    pointer.hidden = mode === "idle";
    pointer.style.bottom = `${percent}%`;
    get("percent").textContent = `${percent}%`;
    get("meter").classList.toggle("rolled", mode === "rolled");
    const last = get("last");
    last.hidden = lastPower === null || mode === "rolled";
    if (lastPower !== null)
      last.style.bottom = `${Math.round(lastPower * 100)}%`;
  }

  function roll(rollPower) {
    if (state !== "playing" || flow === "rolling" || flow === "between") return;
    power = Math.max(0, Math.min(1, rollPower));
    ball = newBall(aim, power);
    flow = "rolling";
    ballsLeft--;
    charge = 0;
    meter(power, "rolled");
    lastPower = power;
    sfx.roll(power);
    scene.throw();
    say("");
    hud();
  }

  function startCharge() {
    if (state !== "playing" || flow !== "aim") return;
    flow = "charge";
    charge = 0;
  }

  function releaseCharge() {
    if (flow !== "charge") return;
    roll(meterPower(charge, settings.meterPeriod));
  }

  function nextBall() {
    ball = null;
    if (ballsLeft <= 0) return finish();
    // Every ball starts aimed straight up the lane again.
    aim = 0;
    flow = "aim";
    meter(0);
  }

  function step(dt) {
    const steer =
      Number(keys.left || held.left) - Number(keys.right || held.right);
    if (flow === "aim" || flow === "charge")
      aim = Math.max(
        -AIM_LIMIT,
        Math.min(AIM_LIMIT, aim + steer * AIM_SPEED * dt),
      );
    if (flow === "charge") {
      charge += dt;
      meter(meterPower(charge, settings.meterPeriod), "charge");
    }
    if (flow === "between") {
      wait -= dt;
      if (wait <= 0) nextBall();
      return;
    }
    if (flow !== "rolling" || !ball) return;
    const events = stepBall(ball, dt);
    if (events.rail) sfx.rail();
    if (events.launched) sfx.hump();
    if (events.back) {
      sfx.back();
      say("Roll a little harder!", 2200);
    }
    if (events.landed) sfx.land();
    if (ball.phase !== "done") return;
    if (!ball.pocket) {
      // It rolled back down the lane: have another go with the same ball.
      ballsLeft++;
      hud();
      flow = "between";
      wait = 0.2;
      return;
    }
    const points = ball.pocket.points;
    score += points;
    if (points === 100) hundreds++;
    const at = boardPoint(
      ball.pocket.hole.x,
      ball.pocket.hole.u,
      BALL_RADIUS * 3,
    );
    pop(at.x, at.y, at.z, points ? `+${points}` : "0", points >= 50);
    sfx.score(points);
    if (points === 100) {
      banner("100!");
      scene.cheer(2.4);
      say("Corner pocket!", 2000);
    } else if (points === 50) {
      scene.cheer(1.8);
      say("Bullseye!", 2000);
    } else if (points >= 30) say("Nice roll!", 1600);
    else if (!points) say("Just missed the rings", 1800);
    scene.scoreboard(score, ballsLeft, points ? `+${points}!` : "");
    hud();
    flow = "between";
    wait = NEXT_BALL;
  }

  function draw(dt = 0) {
    const aiming = state === "playing" && (flow === "aim" || flow === "charge");
    const guidePower =
      flow === "charge" ? meterPower(charge, settings.meterPeriod) : null;
    const landing =
      settings.guide && aiming && guidePower !== null
        ? predictLanding(aim, guidePower)
        : null;
    scene.draw(dt, {
      ball,
      aim,
      waiting: Math.max(0, ballsLeft - (aiming || state !== "playing" ? 1 : 0)),
      showArrow: aiming || (state !== "playing" && !ball),
      landing,
      windup: guidePower,
    });
    get("touch").hidden = !(touch && state === "playing");
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
    if (score > best) {
      record = best > 0;
      best = score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    const tickets = Math.floor(score / 10);
    sfx.win();
    scene.cheer(3);
    results.show(
      `You scored ${score}!`,
      record
        ? "That's your best game yet!"
        : `You won ${tickets} ticket${tickets === 1 ? "" : "s"}. Your best: ${best}.`,
      [
        [score, "SCORE"],
        [tickets, "TICKETS"],
        [hundreds, "100s"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      score = 0;
      hundreds = 0;
      ballsLeft = settings.balls;
      aim = 0;
      ball = null;
      flow = "aim";
      get("pops").replaceChildren();
      lastPower = null;
      meter(0);
      say(
        touch
          ? "Swipe up the lane to roll!"
          : "Aim with A / D, hold Space and let go to roll!",
        3200,
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

  function release() {
    keys.left = keys.right = false;
    held.left = held.right = false;
    if (flow === "charge") {
      flow = "aim";
      charge = 0;
      meter(0);
    }
  }

  function pause() {
    if (state !== "playing") return;
    release();
    state = "paused";
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

  const direction = (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    return { a: "left", ArrowLeft: "left", d: "right", ArrowRight: "right" }[
      key
    ];
  };
  const isRoll = (event) =>
    event.code === "Space" || event.key === " " || event.key === "Enter";
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const dir = direction(event);
    if (dir) {
      event.preventDefault();
      keys[dir] = true;
    } else if (isRoll(event)) {
      event.preventDefault();
      if (!event.repeat) startCharge();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const dir = direction(event);
    if (dir) keys[dir] = false;
    else if (isRoll(event)) releaseCharge();
  });

  // Swipe up the lane to roll: faster swipes roll harder, and the swipe's
  // slant aims.
  let swipe = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || flow !== "aim") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    swipe = {
      id: event.pointerId,
      points: [[event.clientX, event.clientY, event.timeStamp]],
    };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (swipe?.id !== event.pointerId) return;
    swipe.points.push([event.clientX, event.clientY, event.timeStamp]);
    if (swipe.points.length > 30) swipe.points.shift();
  });
  const endSwipe = (event) => {
    if (swipe?.id !== event.pointerId) return;
    const points = swipe.points;
    swipe = null;
    const [x1, y1, t1] = [event.clientX, event.clientY, event.timeStamp];
    const [x0, y0, t0] = points.find(([, , t]) => t1 - t < 160) || points[0];
    const height = canvas.clientHeight || 1;
    const up = (y0 - y1) / height;
    if (up < 0.06) return;
    const speed = up / Math.max(0.03, (t1 - t0) / 1000); // heights a second
    const [sx, sy] = points[0];
    // Screen right is world −x.
    aim = Math.max(
      -AIM_LIMIT,
      Math.min(AIM_LIMIT, -Math.atan2(x1 - sx, sy - y1) * 0.35),
    );
    roll(Math.min(1, Math.max(0.04, (speed - 0.5) / 3.5)));
  };
  canvas.addEventListener("pointerup", endSwipe);
  canvas.addEventListener("pointercancel", (event) => {
    if (swipe?.id === event.pointerId) swipe = null;
  });

  // On-screen ◀ ▶ and Hold to roll, shown on touch screens.
  for (const button of dialog.querySelectorAll("[data-aim]")) {
    const side = button.dataset.aim === "1" ? "left" : "right";
    const hold = (on) => (event) => {
      event.preventDefault();
      if (on && state !== "playing") return;
      held[side] = on;
      if (on) button.setPointerCapture?.(event.pointerId);
    };
    button.addEventListener("pointerdown", hold(true));
    for (const end of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(end, hold(false));
  }
  const rollButton = get("roll");
  rollButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    rollButton.setPointerCapture?.(event.pointerId);
    startCharge();
  });
  rollButton.addEventListener("pointerup", releaseCharge);
  rollButton.addEventListener("pointercancel", releaseCharge);

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

  const scene = createSkeeBallScene(canvas, avatar);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Roll for the rings!";
  get("details").textContent =
    `Aim up the lane, hold to fill the power meter and let go to roll over the hump. The middle ring is 50, and the two little corner pockets are 100! You have ${settings.balls} balls.${settings.guide ? " A green ring shows where the ball will land." : ""}${best ? ` Your best: ${best}.` : ""}`;
  get("play").focus();
}
