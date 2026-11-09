import preview from "./assets/modes/pond-fishing.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import {
  CAST_TIME,
  LOST_TIME,
  REEL_LIFT,
  REEL_PULL,
  castDistance,
  clampTarget,
  createPondFishingScene,
} from "./pondFishingScene.js";
import {
  CASTS_PER_ROUND,
  CATCHES,
  fishingSummary,
  judgeReel,
  planBite,
  rollCatch,
} from "../shared/pondFishing.js";
import "./pondFishing.css";

const SHOW_TIME = 2.4;
const HOW_TO =
  "Aim at the water with the mouse, a tap, or the arrow keys, then cast with a click, tap, Space or Enter. Watch the bobber: little nibbles are fake-outs. When it dunks under and the ! appears, reel in fast. Longer casts find bigger fish.";

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
  const splash = (volume = 0.25, length = 0.35) => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      audio.sampleRate * length,
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = "lowpass";
    filter.frequency.value = 1300;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    whoosh: () => tone(500, 0, 0.25, "triangle", 0.05, 1400),
    plop: () => {
      splash(0.22, 0.3);
      tone(420, 0, 0.12, "sine", 0.1, 180);
    },
    nibble: () => tone(700, 0, 0.06, "sine", 0.06, 520),
    bite: () => {
      splash(0.3, 0.25);
      tone(880, 0, 0.12, "square", 0.05);
      tone(1175, 0.12, 0.18, "square", 0.05);
    },
    reel: () => {
      for (let i = 0; i < 8; i++)
        tone(1500 + (i % 2) * 200, i * 0.09, 0.03, "square", 0.025);
    },
    fish: () =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.09, 0.22, "triangle", 0.09),
      ),
    junk: () => {
      tone(330, 0, 0.18, "triangle", 0.09, 260);
      tone(392, 0.16, 0.25, "triangle", 0.09, 300);
    },
    gone: () => tone(600, 0, 0.35, "sine", 0.07, 300),
  };
}

export function installPondFishing(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "pondfishing";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A fishing bobber in a backyard pond" draggable="false"></span><strong>Pond Fishing</strong><small>Cast into the pond and reel in when the bobber dunks. Little fish, big fish, old boots and trash. Ten casts.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

function open(level, avatar) {
  document.exitPointerLock?.();
  const bestKey = `pond-fishing-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "pond-fishing";
  dialog.setAttribute("aria-label", "Pond Fishing");
  dialog.innerHTML = `
    <header><strong>Pond Fishing</strong><div><button data-exit>Back to games</button></div></header>
    <div class="pond-field">
      <canvas aria-label="A pond seen from the end of a wooden dock"></canvas>
      <div class="pond-bite" data-bite hidden aria-hidden="true">!</div>
      <div class="pond-catch" data-catch hidden role="status"><span data-catch-icon></span><strong data-catch-name></strong><small data-catch-points></small></div>
      <section class="pond-panel">
        <h2 data-heading></h2><p data-details></p><button data-play></button>
      </section>
    </div>
    <footer>
      <div class="pond-hud"><span data-casts></span><span data-score></span><span data-fish></span></div>
      <span data-message role="status"></span>
      <button class="pond-action" data-action hidden></button>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Pond Fishing", HOW_TO)}`;
  document.body.append(dialog);
  // Controller: aim, cast and reel while playing; navigate buttons otherwise.
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  // Keyboard play (Space to cast/reel, arrows to aim) needs focus inside the
  // dialog, and the Cast button hides mid-cast, so the canvas holds focus.
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".pond-panel");
  const sfx = sounds();
  const keys = new Set();

  let state = "ready"; // ready | playing | paused | finished
  let phase = "ready";
  let phaseTime = 0;
  let target = { x: 0.6, z: -6 };
  let landing = { ...target };
  let plan, kind, distance;
  let nibbleIndex = 0;
  let nibbleAt;
  let castsLeft = CASTS_PER_ROUND;
  let caught = [];
  let previous = 0;
  let frame;

  function setPhase(next) {
    phase = next;
    phaseTime = 0;
    nibbleAt = undefined;
    const action = get("action");
    action.hidden =
      state !== "playing" || !["ready", "wait", "bite"].includes(next);
    action.textContent = next === "ready" ? "Cast" : "Reel in!";
    action.classList.toggle("hot", next === "bite");
    get("bite").hidden = next !== "bite";
    if (next !== "show") get("catch").hidden = true;
    if (
      state === "playing" &&
      (action.hidden || !dialog.contains(document.activeElement))
    )
      canvas.focus({ preventScroll: true });
  }

  function hud() {
    const summary = fishingSummary(caught);
    get("casts").textContent = `Casts ${castsLeft}/${CASTS_PER_ROUND}`;
    get("score").textContent = `Score ${summary.score}`;
    get("fish").textContent = `Fish ${summary.fish}`;
  }

  function say(text) {
    get("message").textContent = text;
  }

  function cast() {
    if (phase !== "ready" || state !== "playing") return;
    landing = { ...target };
    distance = castDistance(landing.z);
    kind = rollCatch(distance);
    plan = planBite(level);
    nibbleIndex = 0;
    castsLeft--;
    sfx.whoosh();
    say(distance > 0.66 ? "A long cast!" : "");
    setPhase("cast");
    hud();
  }

  function reel() {
    if (state !== "playing") return;
    if (phase === "ready") return cast();
    if (phase !== "wait" && phase !== "bite") return;
    const result = judgeReel(plan, phaseTime);
    if (result === "early") {
      // Too soon just scares the fish for a moment; the cast isn't lost.
      say("Not yet! Wait for the !");
      plan.biteAt = Math.max(plan.biteAt, phaseTime) + 1.2;
      plan.nibbles = plan.nibbles.filter((t) => t > phaseTime);
      nibbleIndex = 0;
      sfx.nibble();
      return;
    }
    if (result === "late") return;
    sfx.reel();
    say("Reeling in…");
    setPhase("reel");
  }

  function finishCast() {
    if (castsLeft > 0) {
      say(castsLeft === 1 ? "Last cast!" : "");
      setPhase("ready");
      return;
    }
    state = "finished";
    setPhase("ready");
    get("action").hidden = true;
    get("pause").hidden = true;
    const summary = fishingSummary(caught);
    const record = summary.score > best;
    if (record) {
      best = summary.score;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    results.show(
      summary.fish >= 6
        ? "What a haul!"
        : summary.fish
          ? "Nice fishing!"
          : "The pond is cleaner!",
      `${summary.best ? `Best catch: ${CATCHES[summary.best].name}.` : "No fish this time."} ${summary.junk ? `You pulled ${summary.junk} piece${summary.junk === 1 ? "" : "s"} of junk out of the pond.` : ""}${record ? " New best!" : ""}`,
      [
        [summary.score, "SCORE"],
        [summary.fish, "FISH CAUGHT"],
        [summary.junk, "JUNK CLEANED UP"],
        [best, "BEST SCORE"],
      ],
    );
  }

  function step(dt) {
    phaseTime += dt;
    if (phase === "ready") {
      const dx = Number(keys.has("right")) - Number(keys.has("left"));
      const dz = Number(keys.has("down")) - Number(keys.has("up"));
      if (dx || dz)
        target = clampTarget(target.x + dx * 6 * dt, target.z + dz * 6 * dt);
    } else if (phase === "cast" && phaseTime >= CAST_TIME) {
      sfx.plop();
      setPhase("wait");
    } else if (phase === "wait") {
      if (
        nibbleIndex < plan.nibbles.length &&
        phaseTime >= plan.nibbles[nibbleIndex]
      ) {
        nibbleAt = plan.nibbles[nibbleIndex++];
        sfx.nibble();
      }
      if (phaseTime >= plan.biteAt) {
        const at = phaseTime;
        phase = "bite";
        setPhase("bite");
        phaseTime = at;
        sfx.bite();
        say("");
      }
    } else if (phase === "bite" && judgeReel(plan, phaseTime) === "late") {
      sfx.gone();
      say("It got away! Reel in when you see the !");
      setPhase("lost");
    } else if (phase === "reel" && phaseTime >= REEL_PULL + REEL_LIFT) {
      caught.push(kind);
      const item = CATCHES[kind];
      if (item.fish) sfx.fish();
      else sfx.junk();
      get("catch-icon").textContent = item.icon;
      get("catch-name").textContent =
        `${item.junk ? "Oops! " : ""}${item.name}`;
      get("catch-points").textContent = item.junk
        ? `+${item.points} for cleaning up`
        : `+${item.points}`;
      get("catch").className = `pond-catch ${kind}`;
      get("catch").hidden = false;
      say("");
      setPhase("show");
      hud();
    } else if (phase === "show" && phaseTime >= SHOW_TIME) {
      finishCast();
    } else if (phase === "lost" && phaseTime >= LOST_TIME + 0.3) {
      finishCast();
    }
  }

  function draw(dt = 0) {
    scene.draw(dt, {
      phase,
      t: phaseTime,
      target,
      landing,
      kind,
      fish: kind && CATCHES[kind].fish,
      nibbleAt,
    });
    if (phase === "bite") {
      const at = scene.bobberOnScreen();
      const bite = get("bite");
      bite.style.left = `${at.x}px`;
      bite.style.top = `${at.y}px`;
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (state === "playing") step(dt);
    draw(dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function start(reset) {
    results.hide();
    if (reset) {
      castsLeft = CASTS_PER_ROUND;
      caught = [];
      target = { x: 0.6, z: -6 };
      keys.clear();
      say("Aim at the water and cast!");
    }
    sfx.resume();
    const resumed = state === "paused";
    state = "playing";
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    if (reset || !resumed) setPhase("ready");
    else if (phase === "bite") {
      // A bite never waits through a pause: the fish comes back after it.
      const at = phaseTime;
      setPhase("wait");
      phaseTime = at;
      plan.biteAt = at + 1;
      nibbleIndex = plan.nibbles.length;
    } else {
      const at = phaseTime;
      setPhase(phase);
      phaseTime = at;
    }
    hud();
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    keys.clear();
    get("bite").hidden = true;
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Pond Fishing",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => start(true);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  get("action").onclick = (event) => {
    event.stopPropagation();
    reel();
  };
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (state === "playing") pause();
    else dialog.close();
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
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === " " || key === "Enter") {
      if (event.target.closest?.("button") && event.target !== get("action"))
        return;
      event.preventDefault();
      if (!event.repeat) reel();
      return;
    }
    if (aimKeys[key]) {
      event.preventDefault();
      keys.add(aimKeys[key]);
      // A quick tap nudges the aim; holding the key glides it (see step).
      if (!event.repeat && phase === "ready") {
        const dir = aimKeys[key];
        const dx = dir === "right" ? 1 : dir === "left" ? -1 : 0;
        const dz = dir === "down" ? 1 : dir === "up" ? -1 : 0;
        target = clampTarget(target.x + dx * 0.4, target.z + dz * 0.4);
      }
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(aimKeys[key]);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (
      state !== "playing" ||
      phase !== "ready" ||
      event.pointerType === "touch"
    )
      return;
    const spot = scene.pick(event.clientX, event.clientY);
    if (spot) target = spot;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (phase === "ready") {
      const spot = scene.pick(event.clientX, event.clientY);
      if (spot) target = spot;
      cast();
    } else reel();
  });

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("blur", pause);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createPondFishingScene(canvas, avatar);
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Gone fishing";
  get("details").textContent =
    `Ten casts. Aim at the water and cast. When the bobber dunks and the ! pops up, reel in quick. Longer casts find bigger fish, but you might hook an old boot or some trash too.${best ? ` Your best: ${best}.` : ""}`;
  get("play").textContent = "Start fishing";
  get("play").focus();
}
