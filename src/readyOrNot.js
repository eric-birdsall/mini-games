import {
  createRound,
  distance,
  interact,
  nearbySpot,
  remaining,
  stepRound,
  tagTarget,
} from "../shared/readyOrNot.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createReadyOrNotScene } from "./readyOrNotScene.js";
import "./readyOrNot.css";

const name = "Ready or Not";
const instructions =
  "Press Space at a hiding spot to disappear. Try a closet, a bush, or the space under a bed or couch. Stay untagged until time runs out. As seeker, check hiding places and get close to tag all three critters.";

export function installReadyOrNot(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "readyornot";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<strong>${name}</strong><small>Classic hide-and-seek in a house with a front yard and backyard. Duck behind the couch, climb a tree, or search for three hidden critters.</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), getAvatar());
}

const controls = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  c: "crouch",
  r: "crouch",
  shift: "sprint",
};

function open(level, avatar) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "ready-or-not";
  dialog.setAttribute("aria-label", name);
  dialog.innerHTML = `
    <header><strong>${name}</strong><button data-exit>Back to games</button></header>
    <main class="ron-field">
      <canvas aria-label="Cutaway view of the house and yards" tabindex="-1"></canvas>
      <div class="ron-hud" data-hud hidden><span data-phase></span><strong data-clock></strong><span data-left></span></div>
      <section class="ron-panel" data-panel>
        <h2 data-heading>Pick a role</h2>
        <p data-description>Search the house and both yards for three hidden critters. Or find a hiding place before the seeker comes looking.</p>
        <div><button class="primary" data-hide>Be the hider</button><button data-seek>Be the seeker</button></div>
      </section>
      <div class="ron-touch" data-touch hidden>
        <div class="ron-dpad" aria-label="Movement">
          <button data-move="up" aria-label="Move up">↑</button>
          <button data-move="left" aria-label="Move left">←</button>
          <button data-move="down" aria-label="Move down">↓</button>
          <button data-move="right" aria-label="Move right">→</button>
        </div>
        <button data-move="crouch" data-touch-crouch>Crouch</button>
      </div>
      <div class="ron-action" data-actions hidden>
        <span data-message role="status"></span>
        <button data-action hidden></button>
      </div>
    </main>
    <footer><span data-help></span><button data-pause hidden>Pause / Esc</button></footer>
    ${pauseScreen(name, instructions)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  let round;
  let paused = false;
  let frame;
  let previous = performance.now();
  let audio;
  let nextFootstep = 0;
  let revealUntil = 0;
  const keys = new Set();
  const touches = new Map();
  let scene;
  try {
    scene = createReadyOrNotScene(canvas, avatar);
  } catch (error) {
    console.warn("Ready or Not could not initialize 3D", error);
    get("heading").textContent = "3D view unavailable";
    get("description").textContent =
      "This game needs WebGL. Try opening it in a browser with hardware acceleration.";
    get("hide").hidden = get("seek").hidden = true;
  }

  function start(role) {
    if (!scene) return;
    if (!audio && window.AudioContext) audio = new AudioContext();
    audio?.resume().catch(() => {});
    round = createRound(role, level);
    scene.setRound(round);
    paused = false;
    keys.clear();
    touches.clear();
    nextFootstep = 0;
    revealUntil = 0;
    setPauseScreen(dialog, false, canvas);
    get("panel").hidden = true;
    get("hud").hidden =
      get("pause").hidden =
      get("actions").hidden =
      get("touch").hidden =
        false;
    get("touch-crouch").hidden = role === "seek";
    get("help").textContent =
      role === "hide"
        ? "Move with WASD or arrows · C to crouch · Shift to sprint · Space to hide or leave"
        : "Move with WASD or arrows · Shift to sprint · Space to check or tag";
    canvas.focus();
  }

  function setPaused(value) {
    if (!round || round.phase === "done") return;
    paused = value;
    keys.clear();
    touches.clear();
    setPauseScreen(dialog, paused, canvas);
  }

  function results() {
    get("panel").hidden = false;
    get("pause").hidden = get("touch").hidden = get("actions").hidden = true;
    get("heading").textContent =
      round.role === "hide"
        ? round.won
          ? "You stayed hidden!"
          : "You got tagged!"
        : round.won
          ? "You found everyone!"
          : "Time’s up!";
    const left = remaining(round);
    get("description").textContent =
      round.role === "seek"
        ? `You found ${3 - left} of 3 critters.`
        : `${left} of 3 hiders stayed untagged.`;
    get(round.role).focus();
  }

  function footsteps(dt) {
    nextFootstep -= dt;
    if (round.role !== "hide" || round.phase !== "seek" || nextFootstep > 0)
      return;
    const seeker = round.seeker;
    const gap = distance(round.player, seeker);
    if (seeker.speed < 0.2 || gap > 7) return;
    nextFootstep = 0.27;
    if (audio?.state !== "running") return;
    const time = audio.currentTime;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(95, time);
    tone.frequency.exponentialRampToValueAtTime(44, time + 0.085);
    gain.gain.setValueAtTime(0.18 * (1 - gap / 7) + 0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.095);
    const pan = audio.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (seeker.x - round.player.x) / 6));
    tone.connect(gain).connect(pan).connect(audio.destination);
    tone.start();
    tone.stop(time + 0.1);
  }

  const pressed = (key) => keys.has(key) || [...touches.values()].includes(key);
  function loop(now) {
    const dt = Math.min(0.04, (now - previous) / 1000);
    previous = now;
    if (round && !paused && round.phase !== "done") {
      stepRound(round, dt, {
        x: Number(pressed("right")) - Number(pressed("left")),
        z: Number(pressed("down")) - Number(pressed("up")),
        crouch: pressed("crouch"),
        sprint: pressed("sprint"),
      });
      if (round.phase === "done") results();
      else footsteps(dt);
    }
    if (round) {
      const counting = round.phase === "hide";
      const spot = nearbySpot(round);
      const hidden = round.player.hidden;
      const tag = round.role === "seek" && tagTarget(round);
      const action = hidden
        ? "Come out"
        : tag
          ? "Tag"
          : spot
            ? round.role === "seek"
              ? `Check ${spot.name.toLowerCase()}`
              : spot.kind === "tree"
                ? "Climb the tree"
                : `Hide · ${spot.name}`
            : "";
      const seconds = Math.ceil(round.time);
      get("clock").textContent = Number.isFinite(seconds)
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : "No time limit";
      get("phase").textContent =
        round.phase === "done"
          ? "Round over"
          : counting
            ? "Find a hiding spot!"
            : round.role === "hide"
              ? "Stay hidden"
              : "Find the hiders";
      get("left").textContent = `${remaining(round)} still hiding`;
      get("action").hidden = !action || round.phase === "done";
      get("action").textContent = action;
      const message =
        round.messageTime > 0
          ? round.message
          : hidden
            ? `Hidden · ${hidden.name}`
            : round.role === "hide" &&
                round.phase === "seek" &&
                distance(round.seeker, round.player) < 5
              ? "Footsteps nearby"
              : "";
      if (get("message").textContent !== message)
        get("message").textContent = message;
      scene.render(
        round,
        !hidden && action && round.phase !== "done" ? spot : null,
        dt,
      );
      if (revealUntil && now >= revealUntil) {
        revealUntil = 0;
        results();
      }
    } else scene?.render(null, null, dt);
    frame = requestAnimationFrame(loop);
  }

  function useAction() {
    if (round && !paused) interact(round);
    if (round?.phase === "done" && get("panel").hidden && !revealUntil)
      revealUntil = performance.now() + 900;
  }

  get("hide").onclick = () => start("hide");
  get("seek").onclick = () => start("seek");
  get("exit").onclick = get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = () => setPaused(true);
  get("pause-resume").onclick = () => setPaused(false);
  get("pause-restart").onclick = () => start(round.role);
  get("action").onclick = useAction;
  dialog.padPlaying = () => !!round && !paused && round.phase !== "done";
  bindDialogEscape(dialog, () => {
    if (!round || round.phase === "done") dialog.close();
    else setPaused(!paused);
  });
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (
      !dialog.padPlaying() ||
      (event.target.matches("button") && event.key === " ")
    )
      return;
    const key = event.key.toLowerCase();
    if (controls[key]) {
      keys.add(controls[key]);
      event.preventDefault();
    } else if (key === " " || key === "e") {
      if (!event.repeat) useAction();
      event.preventDefault();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    keys.delete(controls[event.key.toLowerCase()]);
  });
  for (const button of dialog.querySelectorAll("[data-move]")) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, button.dataset.move);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, (event) => touches.delete(event.pointerId));
    }
  }
  const onBlur = () => setPaused(true);
  window.addEventListener("blur", onBlur);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("blur", onBlur);
    audio?.close().catch(() => {});
    scene?.dispose();
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });
  dialog.showModal();
  if (scene) {
    get("hide").focus();
    frame = requestAnimationFrame(loop);
  }
}
