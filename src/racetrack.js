import preview from "./assets/modes/racetrack-builder.jpg";
import { bindDialogEscape } from "./pauseActions.js";
import { createRacetrackScene } from "./racetrackScene.js";
import {
  BLOCK_REASONS,
  EXAMPLE_TRACKS,
  PIECES,
  PIECE_TYPES,
  PUSH_MAX,
  PUSH_MIN,
  buildPath,
  canAdd,
  carPose,
  cleanTrack,
  createRun,
  layout,
  pushRun,
  stepRun,
  wouldClose,
} from "../shared/racetrack.js";
import "./racetrack.css";

const DRAFT_KEY = "racetrack-builder-draft";
const SAVES_KEY = "racetrack-builder-tracks";
const MAX_SAVES = 30;

const HOW_TO =
  "Click a square on the board to pick a starting spot (Rotate turns it). Then add pieces one at a time from the open end, shown by the arrow. Come back round into the start, heading the same way, to close the circuit. Press Test track, choose how hard to push, and watch the car go. Too slow and it stalls on climbs or falls out of loops; too fast and it flies off curves.";

// Little line drawings of each piece for the palette.
const ICON_PATHS = {
  straight: "M16 28V4m-5 5 5-5 5 5",
  left: "M22 28v-6a8 8 0 0 0-8-8H4m5-5-5 5 5 5",
  right: "M10 28v-6a8 8 0 0 1 8-8h10m-5-5 5 5-5 5",
  climb: "M3 26h6l14-14h6m-5-4 5 4-5 4",
  descent: "M3 12h6l14 14h6m-5-4 5 4-5 4",
  upLeft: "M22 28v-6a8 8 0 0 0-8-8H4m5-5-5 5 5 5M27 12V4m-3 3 3-3 3 3",
  upRight: "M10 28v-6a8 8 0 0 1 8-8h10m-5-5 5 5-5 5M5 12V4M2 7l3-3 3 3",
  downLeft: "M22 28v-6a8 8 0 0 0-8-8H4m5-5-5 5 5 5M27 4v8m-3-3 3 3 3-3",
  downRight: "M10 28v-6a8 8 0 0 1 8-8h10m-5-5 5 5-5 5M5 4v8M2 9l3 3 3-3",
  loop: "M2 27h12a9 9 0 1 0-3-3M18 27h12",
  booster: "M18 3 8 18h7l-2 11 11-16h-7z",
};
const icon = (type) =>
  `<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[type]}"/></svg>`;

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
  const noise = (volume, length, cutoff) => {
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
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  // A soft whirr that rises with the car's speed.
  let hum = null;
  const whirr = (speed) => {
    if (audio?.state !== "running") return;
    if (!hum) {
      const osc = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      osc.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.value = 600;
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(audio.destination);
      osc.start();
      hum = { osc, gain };
    }
    const at = audio.currentTime;
    hum.osc.frequency.setTargetAtTime(50 + speed * 22, at, 0.05);
    hum.gain.gain.setTargetAtTime(Math.min(0.05, speed * 0.006), at, 0.08);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    whirr,
    click: () => tone(660, 0, 0.08, "triangle", 0.08, 880),
    undo: () => tone(500, 0, 0.1, "triangle", 0.07, 300),
    nope: () => tone(300, 0, 0.14, "sine", 0.06, 260),
    closed: () =>
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, i * 0.09, 0.22, "triangle", 0.08),
      ),
    push: () => noise(0.12, 0.25, 900),
    boost: () => tone(300, 0, 0.35, "sawtooth", 0.04, 1200),
    lap: () =>
      [784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.18, "triangle", 0.07)),
    crash: () => {
      noise(0.3, 0.5, 1800);
      tone(200, 0, 0.3, "square", 0.04, 70);
    },
    thud: () => noise(0.25, 0.2, 500),
    stall: () => tone(420, 0, 0.5, "sine", 0.06, 200),
  };
}

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function installRacetrack() {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "racetrack";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A toy car on a track built from interlocking pieces" draggable="false"></span><strong>Racetrack Builder</strong><small>Build a toy-car track with loops and boosters, then give the car a push and see if it makes it round.</small>`;
  games.append(entry);
  entry.onclick = () => open();
}

function open() {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "racetrack";
  dialog.setAttribute("aria-label", "Racetrack Builder");
  dialog.innerHTML = `
    <header>
      <strong>Racetrack Builder</strong>
      <span class="rt-mode" data-mode></span>
      <div><button data-tracks>Saved tracks</button><button data-help aria-expanded="false">How to play</button><button data-exit>Back to games</button></div>
    </header>
    <div class="rt-field">
      <canvas aria-label="The track-building board, seen from above"></canvas>
      <div class="rt-pop" data-pop hidden aria-hidden="true"></div>
      <p class="rt-help" data-help-text hidden>${HOW_TO}</p>
      <section class="rt-tracks" data-tracks-panel hidden aria-label="Saved tracks">
        <div class="rt-tracks-card">
          <h2>Saved tracks</h2>
          <form data-save-form><input data-save-name maxlength="40" placeholder="Name this track" aria-label="Track name"><button data-save>Save</button></form>
          <ul data-save-list></ul>
          <h3>Examples</h3>
          <ul data-example-list></ul>
          <button data-tracks-close>Close</button>
        </div>
      </section>
    </div>
    <footer>
      <span class="rt-message" data-message role="status"></span>
      <div class="rt-build" data-build>
        <div class="rt-palette" role="group" aria-label="Track pieces">
          ${PIECE_TYPES.map(
            (type) =>
              `<button data-piece="${type}" title="${PIECES[type].label} (${PIECES[type].key.toUpperCase()})">${icon(type)}<span>${PIECES[type].label}</span></button>`,
          ).join("")}
        </div>
        <div class="rt-tools">
          <button data-undo title="Remove the last piece (Backspace)">↶ Undo</button>
          <button data-rotate title="Turn the start (R)">⟳ Rotate start</button>
          <button data-middle>Start in the middle</button>
          <button data-clear>Clear</button>
          <button class="rt-go" data-test title="Test the track (T)">Test track ▶</button>
        </div>
      </div>
      <div class="rt-test" data-test-bar hidden>
        <div class="rt-hud" aria-live="off"><span data-speed></span><span data-laps></span><span data-top></span></div>
        <label class="rt-push">Push <input type="range" data-push-strength min="${PUSH_MIN}" max="${PUSH_MAX}" step="0.5" value="7"><output data-push-value></output></label>
        <button class="rt-go" data-push title="Push the car (Space)">Push! 👉</button>
        <button data-reset>Reset car</button>
        <button data-follow aria-pressed="false">Follow car</button>
        <button data-back>◀ Back to builder</button>
      </div>
    </footer>`;
  document.body.append(dialog);
  // The controller moves between buttons; the board is mouse/touch only.
  dialog.padPlaying = () => false;
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const sfx = sounds();
  const scene = createRacetrackScene(canvas);

  const draft = readJSON(DRAFT_KEY, null);
  let track = cleanTrack(draft || { start: null, pieces: [] });
  let startDir = track.start?.d ?? 0;
  let laid = layout(track);
  let preview = null; // piece type being pointed at in the palette
  let lastPiece = "straight";
  let hover = null; // board cell under the pointer while picking a start
  let mode = "build"; // build | test
  let run = null;
  let path = null;
  let follow = false;
  let roll = 0;
  let spinPause = 0;
  let frame;
  let previous = performance.now();
  let popTimer;

  function say(text) {
    get("message").textContent = text;
  }

  function pop(text) {
    const el = get("pop");
    el.textContent = text;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(popTimer);
    popTimer = setTimeout(() => (el.hidden = true), 1300);
  }

  function changed() {
    laid = layout(track);
    writeJSON(DRAFT_KEY, track);
    refreshBuild();
    // A button that just disabled itself drops focus; keep keys working.
    if (
      !dialog.contains(document.activeElement) ||
      document.activeElement?.disabled
    )
      canvas.focus({ preventScroll: true });
  }

  function ghostSamples(type) {
    if (!laid.open || laid.closed) return null;
    const pieces = [...laid.pieces, { type, ...laid.open }];
    const ghost = buildPath({ pieces, closed: false });
    return ghost.samples.filter((s) => s.piece === pieces.length - 1);
  }

  function refreshBuild() {
    if (mode !== "build") return;
    const started = !!track.start;
    for (const button of dialog.querySelectorAll("[data-piece]")) {
      const reason = canAdd(laid, button.dataset.piece);
      button.disabled = reason === "closed";
      button.classList.toggle("rt-blocked", !!reason);
      button.setAttribute("aria-disabled", String(!!reason));
    }
    get("undo").disabled = !started;
    get("clear").disabled = !started;
    get("rotate").disabled = started && track.pieces.length > 0;
    get("middle").hidden = started;
    get("test").disabled = track.pieces.length < 1;
    path = started ? buildPath(laid) : null;
    scene.setTrack(path);
    const type = preview || lastPiece;
    if (started && !laid.closed) {
      scene.setGhost(ghostSamples(type), !canAdd(laid, type));
      scene.setMarker(laid.open, false);
    } else {
      scene.setGhost(null);
      scene.setMarker(
        !started && hover ? { ...hover, h: 0, d: startDir } : null,
        true,
      );
    }
    get("mode").textContent = !started
      ? "Pick a starting spot"
      : laid.closed
        ? "Circuit closed ✓"
        : `${track.pieces.length} piece${track.pieces.length === 1 ? "" : "s"} · open end at level ${laid.open.h}`;
  }

  function placeStart(cell) {
    track = { start: { x: cell.x, z: cell.z, d: startDir }, pieces: [] };
    sfx.click();
    changed();
    say(
      "Now add pieces from the arrow. Bring the track back round to the start to close it.",
    );
  }

  function addPiece(type) {
    if (mode !== "build") return;
    sfx.resume();
    if (!track.start) {
      sfx.nope();
      return say(BLOCK_REASONS.nostart);
    }
    const reason = canAdd(laid, type);
    if (reason) {
      sfx.nope();
      return say(BLOCK_REASONS[reason]);
    }
    const closing = wouldClose(laid, track.start, type);
    track = { ...track, pieces: [...track.pieces, type] };
    lastPiece = type;
    changed();
    if (closing) {
      sfx.closed();
      pop("Circuit closed!");
      say("The circuit is closed! Press Test track to try it out.");
    } else {
      sfx.click();
      say("");
    }
  }

  function undo() {
    if (mode !== "build" || !track.start) return;
    sfx.undo();
    if (track.pieces.length)
      track = { ...track, pieces: track.pieces.slice(0, -1) };
    else track = { start: null, pieces: [] };
    changed();
    say(track.start ? "" : "Pick a new starting spot.");
  }

  function rotate() {
    if (mode !== "build") return;
    if (track.start && track.pieces.length) return;
    startDir = (startDir + 1) % 4;
    if (track.start)
      track = { start: { ...track.start, d: startDir }, pieces: [] };
    sfx.click();
    changed();
  }

  // ------------------------------------------------------------- testing

  function hud() {
    if (!run) return;
    get("speed").textContent =
      `Speed ${Math.abs(run.free ? Math.hypot(...run.free.vel) : run.v).toFixed(1)} m/s`;
    get("laps").textContent =
      `Laps ${run.laps}${run.lapTimes.length ? ` · best ${Math.min(...run.lapTimes).toFixed(1)} s` : ""}`;
    get("top").textContent = `Top ${run.top.toFixed(1)} m/s`;
    const waiting =
      run.mode === "waiting" || (run.mode === "rest" && !run.free);
    get("push").disabled = !waiting;
  }

  function startTest() {
    if (mode !== "build" || track.pieces.length < 1) return;
    sfx.resume();
    mode = "test";
    path = buildPath(laid);
    run = createRun(path, 0);
    get("build").hidden = true;
    get("test-bar").hidden = false;
    scene.setGhost(null);
    scene.setMarker(null);
    scene.frame(path.samples.map((s) => s.p));
    get("mode").textContent = laid.closed
      ? "Test run"
      : "Test run · track not closed";
    say(
      laid.closed
        ? "Pick how hard to push, then press Push!"
        : "The track isn't closed, so the car will run off the end. Push it anyway!",
    );
    hud();
    get("push").focus({ preventScroll: true });
  }

  function push() {
    if (mode !== "test" || !run) return;
    if (!(run.mode === "waiting" || (run.mode === "rest" && !run.free))) return;
    sfx.resume();
    sfx.push();
    pushRun(run, Number(get("push-strength").value));
    say("");
    hud();
  }

  function resetCar() {
    if (mode !== "test") return;
    run = createRun(path, 0);
    say("Back on the start. Push when you're ready!");
    hud();
  }

  function backToBuilder() {
    if (mode !== "test") return;
    mode = "build";
    run = null;
    sfx.whirr(0);
    scene.setCar(null);
    scene.follow(null);
    get("build").hidden = false;
    get("test-bar").hidden = true;
    scene.frame([]);
    say("");
    refreshBuild();
    get("test").focus({ preventScroll: true });
  }

  function handleEvents() {
    while (run.events.length) {
      const event = run.events.shift();
      switch (event.kind) {
        case "lap":
          sfx.lap();
          pop(`Lap ${run.laps}!`);
          break;
        case "boost":
          sfx.boost();
          break;
        case "thud":
          sfx.thud();
          break;
        case "stall":
        case "loopShort":
          sfx.stall();
          say(event.text);
          break;
        case "loopFall":
        case "curve":
        case "end":
          sfx.crash();
          pop(event.kind === "curve" ? "Whoa!" : "Oops!");
          say(`${event.text} Reset the car, or go back and change the track.`);
          break;
        case "crashed":
          say("The car tumbled to a stop. Press Reset car to try again.");
          break;
        case "stopped":
          say(
            run.laps
              ? `The car rolled to a stop after ${run.laps} lap${run.laps === 1 ? "" : "s"}. Push again, or add a booster!`
              : "The car rolled to a stop. Push again, or push harder!",
          );
          break;
      }
    }
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    let spin = 0;
    if (mode === "test" && run) {
      stepRun(run, dt);
      handleEvents();
      const pose = carPose(run);
      const speed = run.free ? Math.hypot(...run.free.vel) : Math.abs(run.v);
      roll += (run.free ? 0 : run.v) * dt * 18;
      scene.setCar(pose, roll);
      scene.follow(follow ? pose.p : null);
      sfx.whirr(run.free && run.free.landed ? 0 : speed);
      hud();
      spinPause = Math.max(0, spinPause - dt);
      spin = follow || spinPause ? 0 : 4;
    }
    scene.draw(dt, spin);
    if (!get("pop").hidden && mode === "test") {
      get("pop").style.left = "50%";
      get("pop").style.top = "30%";
    }
    frame = requestAnimationFrame(loop);
  }

  // --------------------------------------------------------- saved tracks

  function saves() {
    const list = readJSON(SAVES_KEY, []);
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.name === "string")
      : [];
  }

  function loadTrack(saved) {
    track = cleanTrack(saved);
    startDir = track.start?.d ?? 0;
    if (mode === "test") backToBuilder();
    changed();
    closeTracks();
    say(`Loaded "${saved.name}".`);
  }

  function listTracks() {
    const list = get("save-list");
    list.replaceChildren();
    const mine = saves();
    if (!mine.length) {
      const li = document.createElement("li");
      li.className = "rt-empty";
      li.textContent = "No saved tracks yet.";
      list.append(li);
    }
    mine.forEach((saved, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = `${saved.name} · ${saved.pieces?.length ?? 0} pieces`;
      const load = document.createElement("button");
      load.textContent = "Load";
      load.onclick = () => loadTrack(saved);
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.onclick = () => {
        if (!confirm(`Delete "${saved.name}"?`)) return;
        const next = saves();
        next.splice(i, 1);
        writeJSON(SAVES_KEY, next);
        listTracks();
      };
      li.append(name, load, remove);
      list.append(li);
    });
    const examples = get("example-list");
    examples.replaceChildren(
      ...EXAMPLE_TRACKS.map((example) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = example.name;
        const load = document.createElement("button");
        load.textContent = "Load";
        load.onclick = () => loadTrack(example);
        li.append(name, load);
        return li;
      }),
    );
    get("save").disabled = !track.start;
  }

  function openTracks() {
    listTracks();
    get("tracks-panel").hidden = false;
    get("save-name").focus({ preventScroll: true });
  }

  function closeTracks() {
    get("tracks-panel").hidden = true;
  }

  get("save-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!track.start) return;
    const name = get("save-name").value.trim() || `Track ${saves().length + 1}`;
    const list = saves().filter((t) => t.name !== name);
    list.unshift({ name, ...cleanTrack(track), saved: Date.now() });
    writeJSON(SAVES_KEY, list.slice(0, MAX_SAVES));
    get("save-name").value = "";
    listTracks();
    say(`Saved "${name}".`);
  });

  // ---------------------------------------------------------------- input

  for (const button of dialog.querySelectorAll("[data-piece]")) {
    const type = button.dataset.piece;
    button.onclick = () => addPiece(type);
    const show = () => {
      preview = type;
      refreshBuild();
    };
    const hide = () => {
      if (preview !== type) return;
      preview = null;
      refreshBuild();
    };
    button.addEventListener("pointerenter", show);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("focus", show);
    button.addEventListener("blur", hide);
  }
  get("undo").onclick = undo;
  get("rotate").onclick = rotate;
  get("middle").onclick = () => placeStart({ x: 5, z: 7 });
  get("clear").onclick = () => {
    if (track.pieces.length > 3 && !confirm("Clear the whole track?")) return;
    track = { start: null, pieces: [] };
    changed();
    say("Pick a starting spot.");
  };
  get("test").onclick = startTest;
  get("push").onclick = push;
  get("reset").onclick = resetCar;
  get("back").onclick = backToBuilder;
  get("follow").onclick = () => {
    follow = !follow;
    get("follow").setAttribute("aria-pressed", String(follow));
    get("follow").textContent = follow ? "Whole course" : "Follow car";
  };
  const strength = get("push-strength");
  const showStrength = () => (get("push-value").textContent = strength.value);
  strength.addEventListener("input", showStrength);
  showStrength();
  get("tracks").onclick = openTracks;
  get("tracks-close").onclick = closeTracks;
  get("help").onclick = () => {
    const help = get("help-text");
    help.hidden = !help.hidden;
    get("help").setAttribute("aria-expanded", String(!help.hidden));
  };
  get("exit").onclick = () => dialog.close();

  bindDialogEscape(dialog, () => {
    if (!get("tracks-panel").hidden) closeTracks();
    else if (!get("help-text").hidden) get("help").click();
    else if (mode === "test") backToBuilder();
    else dialog.close();
  });

  const pieceKeys = Object.fromEntries(
    PIECE_TYPES.map((type) => [PIECES[type].key, type]),
  );
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.target.closest?.("input, form") || !get("tracks-panel").hidden)
      return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (mode === "build") {
      if (pieceKeys[key]) {
        event.preventDefault();
        addPiece(pieceKeys[key]);
      } else if (key === "Backspace" || key === "Delete") {
        event.preventDefault();
        undo();
      } else if (key === "r") rotate();
      else if (key === "t") startTest();
    } else if (key === " " && !event.target.closest?.("button")) {
      event.preventDefault();
      push();
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  // Board: drag to look around, wheel or pinch to zoom, click to pick a start.
  const pointers = new Map();
  let dragged = false;
  let pinch = 0;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged = pointers.size > 1;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) {
      if (mode === "build" && !track.start && event.pointerType === "mouse") {
        const cell = scene.pick(event.clientX, event.clientY);
        if (cell?.x !== hover?.x || cell?.z !== hover?.z) {
          hover = cell;
          refreshBuild();
        }
      }
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) scene.zoom(pinch / span);
      pinch = span;
      return;
    }
    if (!dragged && Math.hypot(dx, dy) < 1 && !event.buttons) return;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      last.moved = (last.moved || 0) + Math.abs(dx) + Math.abs(dy);
      if (last.moved > 6) dragged = true;
    }
    if (dragged) {
      scene.orbit(dx, dy);
      spinPause = 6;
    }
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size) return;
    pinch = 0;
    if (dragged || event.type === "pointercancel") return;
    if (mode === "build" && !track.start) {
      const cell = scene.pick(event.clientX, event.clientY);
      if (cell) {
        sfx.resume();
        hover = null;
        placeStart(cell);
      }
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => {
    if (!hover) return;
    hover = null;
    refreshBuild();
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      scene.zoom(Math.exp(event.deltaY * 0.0012));
      spinPause = 6;
    },
    { passive: false },
  );

  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(popTimer);
    writeJSON(DRAFT_KEY, track);
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  dialog.showModal();
  changed();
  say(
    track.start
      ? "Welcome back! Your last track is here. Keep building, or press Test track."
      : "Click a square on the board to pick where the track starts.",
  );
  frame = requestAnimationFrame(loop);
  (
    dialog.querySelector("[data-piece]:not(.rt-blocked)") || get("middle")
  ).focus({
    preventScroll: true,
  });
}
