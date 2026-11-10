import preview from "./assets/modes/shoo-away.jpg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createShooAwayScene } from "./shooAwayScene.js";
import { avatarChoice } from "../shared/avatars.js";
import {
  PITCH,
  SNACKS,
  SNACK_NAMES,
  REACH,
  STOLEN_TO_LOSE,
  angleOf,
  clampPitch,
  kindOf,
  createPicnic,
  inReach,
  shoo,
  shooable,
  turnBetween,
  update,
} from "../shared/shooAway.js";
import "./shooAway.css";

const TITLE = "Shoo Away";
const HOW_TO =
  "You're sitting on a picnic blanket and the squirrels want your snacks, and so do the odd sly fox (foxes are rarer, but quicker)! They sneak in from every side, but they freeze whenever you're looking at them, so they only creep closer while your back is turned. Your arm only reaches as far as the white ring on the grass: once one is inside it (it gets a yellow ring), tap or click it to shoo it away. Shoo one that's running off with a snack and it drops it. Drag the lawn to look around (or use A / D or ← / → to turn and W / S or ↑ / ↓ to look up and down); Space or Enter shoos the closest one near the middle of the screen. The arrows at the edges and the little map in the corner show critters you can't see (foxes are the orange dots), and you can tap the map to turn that way. If they take 3 snacks, the picnic's over. On a controller, the left stick turns and looks up and down (so does the right stick) and A shoos.";
const TURN_SPEED = 2.6; // radians a second with the keys
const LOOK_SPEED = 1.5; // up and down
const EMOJI = {
  sandwich: "🥪",
  watermelon: "🍉",
  cupcake: "🧁",
  apple: "🍎",
  "cookie-chocolate": "🍪",
  strawberry: "🍓",
};
const SQUIRREL_HEIGHT = 0.64;

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const out = (pan = 0) => {
    if (!audio.createStereoPanner) return audio.destination;
    const p = audio.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(audio.destination);
    return p;
  };
  const tone = (freq, start, length, type, volume, slide, pan) => {
    if (audio?.state !== "running") return;
    const at = audio.currentTime + start;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(gain).connect(out(pan));
    osc.start(at);
    osc.stop(at + length + 0.02);
  };
  const noise = (volume, length, from, to, start = 0, pan = 0) => {
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
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + length * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(out(pan));
    source.start(at);
  };
  // Squirrel chatter: a few quick high chirps.
  const chitter = (pan, volume = 0.05) => {
    for (let i = 0; i < 4; i++)
      tone(
        1900 + Math.random() * 500,
        i * 0.06,
        0.05,
        "square",
        volume,
        2600,
        pan,
      );
  };
  // Fox: a short, lower yip that drops in pitch.
  const yip = (pan, volume = 0.07) => {
    tone(820, 0, 0.12, "sawtooth", volume, 520, pan);
    tone(760, 0.15, 0.1, "sawtooth", volume * 0.8, 480, pan);
  };
  const call = (kind, pan, volume) =>
    kind === "fox" ? yip(pan, volume) : chitter(pan, volume);
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    // Rustling in the grass, from the side it's on.
    rustle: (pan) => noise(0.12, 0.45, 3000, 1500, 0, pan),
    swish: () => noise(0.22, 0.18, 900, 2600),
    shoo: (pan, kind) => {
      noise(0.25, 0.14, 1200, 400, 0, pan);
      tone(1400, 0.05, 0.16, "triangle", 0.09, 2400, pan);
      call(kind, pan, 0.04);
    },
    grab: (pan, kind) => call(kind, pan, 0.07),
    saved: () =>
      [660, 880, 1100].forEach((f, i) =>
        tone(f, i * 0.07, 0.16, "triangle", 0.08),
      ),
    stolen: () => {
      tone(440, 0, 0.25, "triangle", 0.1, 330);
      tone(330, 0.22, 0.4, "triangle", 0.1, 220);
    },
    over: () =>
      [523, 440, 349, 262].forEach((f, i) =>
        tone(f, i * 0.18, 0.3, "triangle", 0.09),
      ),
  };
}

export function installShooAway(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "shooaway";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A fox and a squirrel sneaking toward a red gingham picnic blanket" draggable="false"></span><strong>${TITLE}</strong><small>Squirrels (and a few speedy foxes) sneak in from every side to steal your picnic. Look all around and shoo them off before they take three snacks!</small>`;
  games.append(entry);
  entry.onclick = () => open(getLevel(), avatarChoice(getAvatar?.()));
}

const fmtTime = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function open(level, avatar) {
  document.exitPointerLock?.();
  // The game's old name, kept so saved bests carry over.
  const bestKey = `whack-a-squirrel-best-${level}`;
  let best = 0;
  try {
    best = Math.max(0, Number(localStorage.getItem(bestKey)) || 0);
  } catch {}

  const dialog = document.createElement("dialog");
  dialog.className = "shoo-away";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <header><strong>${TITLE}</strong><div><button data-exit>Back to games</button></div></header>
    <div class="sa-field">
      <canvas aria-label="A picnic blanket with snacks around you, on a lawn with trees all the way round"></canvas>
      <div class="sa-edge sa-edge-left" data-edge-left aria-hidden="true"><b>◀</b><span></span></div>
      <div class="sa-edge sa-edge-right" data-edge-right aria-hidden="true"><span></span><b>▶</b></div>
      <div class="sa-pops" data-pops aria-hidden="true"></div>
      <canvas class="sa-radar" data-radar width="160" height="160" aria-label="Map of the lawn: tap to turn that way"></canvas>
      <div class="sa-turn" data-turn hidden><button data-turn-left aria-label="Turn left">◀</button><button data-turn-right aria-label="Turn right">▶</button></div>
      <section class="sa-panel">
        <h2 data-heading></h2><p data-details></p>
        <button class="primary" data-play>Play</button>
        <small class="sa-keys">Tap / click a squirrel or fox in the ring to shoo it · Drag (or WASD / arrows) to look around · Space shoos · Controller: sticks + A</small>
      </section>
    </div>
    <footer>
      <div class="sa-hud"><span data-snacks></span><span data-shooed></span><span data-time></span></div>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  dialog.padPlaying = () => state === "playing";
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".sa-panel");
  const radar = get("radar");
  const radarCtx = radar.getContext("2d");
  const sfx = sounds();
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  get("turn").hidden = !touch;

  let state = "ready"; // ready | playing | paused | ending | finished
  let picnic = createPicnic(level);
  let yaw = 0;
  let pitch = PITCH;
  let spin = 0; // current key-turn speed, eased
  let tilt = 0; // current key-look speed, eased
  let aimYaw = null; // turning to a spot tapped on the map
  const held = { left: false, right: false, up: false, down: false };
  let farHint = 0; // times told a squirrel is too far
  let foxSeen = false; // told about foxes yet
  let frame;
  let previous = 0;
  let messageTimer;
  let endAt = 0;

  function say(text, hold = 2400) {
    get("message").textContent = text;
    clearTimeout(messageTimer);
    if (text && hold)
      messageTimer = setTimeout(() => (get("message").textContent = ""), hold);
  }

  function hud() {
    get("snacks").innerHTML = picnic.snacks
      .map(
        (s) =>
          `<i class="${s.state === "gone" ? "gone" : s.state === "carried" ? "carried" : ""}">${EMOJI[s.kind]}</i>`,
      )
      .join("");
    const left = SNACKS.length - picnic.stolen;
    get("snacks").setAttribute(
      "aria-label",
      `${left} snacks left; ${STOLEN_TO_LOSE - picnic.stolen} more stolen and the picnic's over`,
    );
    get("shooed").textContent = `👋 ${picnic.shooed}`;
    get("shooed").setAttribute(
      "aria-label",
      `${picnic.shooed} squirrels and foxes shooed`,
    );
    get("time").textContent = `⏱ ${fmtTime(picnic.t)}`;
  }

  function pop(text, x, y, kind = "") {
    const el = document.createElement("span");
    el.className = `sa-pop ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    get("pops").append(el);
    el.addEventListener("animationend", () => el.remove());
  }

  // Left/right stereo position of something at `angle` on the lawn.
  const panOf = (angle) => -Math.sin(turnBetween(yaw, angle));

  // Your arm swats towards a point on the screen.
  const swat = (x, y) => scene.swat(x, y);

  // In view: watched squirrels freeze.
  const inView = (s) => scene.screenOf(s.x, 0.3, s.z).visible;

  // The squirrel at (or near) a screen point, if any. `near` keeps to the
  // ones in reach.
  function squirrelAt(x, y, reachScale = 1, near = false) {
    let best = null;
    let bestScore = 1;
    for (const s of shooable(picnic)) {
      if (near && !inReach(s)) continue;
      const p = scene.screenOf(s.x, SQUIRREL_HEIGHT * 0.45, s.z);
      if (!p.visible) continue;
      const d = Math.hypot(s.x, s.z);
      const reach =
        Math.max(54, scene.scaleAt(d) * SQUIRREL_HEIGHT * 0.95) * reachScale;
      const score = Math.hypot(p.x - x, p.y - y) / reach;
      if (score < bestScore) {
        bestScore = score;
        best = { s, p };
      }
    }
    return best;
  }

  function shooAt(hit) {
    const { s, p } = hit;
    swat(p.x, p.y);
    if (!inReach(s)) {
      sfx.swish();
      pop("Too far!", p.x, p.y, "far");
      if (farHint++ < 2)
        say(
          "Too far to reach! Look away so it creeps closer, then shoo it once it's inside the white ring.",
          3600,
        );
      return;
    }
    const dropped = shoo(picnic, s.id);
    if (dropped === false) return;
    scene.shoo(s.id);
    sfx.shoo(panOf(angleOf(s.x, s.z)), s.kind);
    if (dropped) {
      sfx.saved();
      pop(`Saved the ${SNACK_NAMES[dropped.kind]}!`, p.x, p.y, "big");
    } else
      pop(
        picnic.shooed % 10 === 0 ? `${picnic.shooed} shooed!` : "Shoo!",
        p.x,
        p.y,
      );
    if (picnic.shooed === 1)
      say("Shoo! Keep looking around: they come from every side.", 3200);
    hud();
  }

  function tapAt(x, y) {
    if (state !== "playing") return false;
    const hit = squirrelAt(x, y);
    if (hit) shooAt(hit);
    return !!hit;
  }

  function whiff(x, y) {
    swat(x, y);
    sfx.swish();
  }

  // Space: the squirrel nearest the middle of the screen.
  function swatCentre() {
    if (state !== "playing") return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const wide = Math.max(2.5, (w * 0.28) / 60);
    const hit =
      squirrelAt(w / 2, h * 0.6, wide, true) ??
      squirrelAt(w / 2, h * 0.6, wide);
    if (hit) shooAt(hit);
    else whiff(w / 2, h * 0.62);
  }

  // Arrows at the screen edges for squirrels you can't see.
  function edges() {
    const sides = { left: [], right: [] };
    if (state === "playing" || state === "paused")
      for (const s of shooable(picnic)) {
        const rel = turnBetween(yaw, angleOf(s.x, s.z));
        const p = scene.screenOf(s.x, 0.3, s.z);
        if (p.visible) continue;
        const d = Math.hypot(s.x, s.z);
        sides[rel > 0 ? "left" : "right"].push(s.carrying != null ? 0 : d);
      }
    for (const side of ["left", "right"]) {
      const el = get(`edge-${side}`);
      const list = sides[side];
      el.classList.toggle("on", list.length > 0);
      const close = list.length ? Math.min(...list) : 99;
      el.classList.toggle("sa-near", close < 4);
      el.querySelector("span").textContent =
        list.length > 1 ? `×${list.length}` : "";
    }
  }

  // The little map: you in the middle, the way you face pointing up.
  function drawRadar() {
    const g = radarCtx;
    const size = radar.width;
    const c = size / 2;
    const R = c - 6;
    const k = R / 12.5; // metres to pixels
    g.clearRect(0, 0, size, size);
    g.fillStyle = "#4f8f3acc";
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#fff";
    g.stroke();
    // What you can see.
    const half = Math.atan(
      (canvas.clientWidth / canvas.clientHeight) *
        Math.tan((scene.camera.fov * Math.PI) / 360),
    );
    g.fillStyle = "#fff4";
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R, -Math.PI / 2 - half, -Math.PI / 2 + half);
    g.closePath();
    g.fill();
    // How far you can reach.
    g.setLineDash([4, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = "#fffc";
    g.beginPath();
    g.arc(c, c, REACH * k, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // Blanket.
    g.fillStyle = "#e5484d";
    g.fillRect(c - 1.6 * k, c - 1.6 * k, 3.2 * k, 3.2 * k);
    // Turn the lawn so the way you face is up.
    const place = (x, z) => {
      const rel = turnBetween(yaw, angleOf(x, z));
      const d = Math.min(12.5, Math.hypot(x, z)) * k;
      return [c - Math.sin(rel) * d, c - Math.cos(rel) * d];
    };
    for (const snack of picnic.snacks) {
      if (snack.state === "gone") continue;
      const [x, y] = place(snack.x, snack.z);
      g.fillStyle = "#ffe066";
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const s of picnic.squirrels) {
      if (s.state === "gone") continue;
      const [x, y] = place(s.x, s.z);
      g.fillStyle =
        s.state === "shooed"
          ? "#ffffff88"
          : s.carrying != null
            ? "#ff3b30"
            : s.kind === "fox"
              ? "#ff8a1f"
              : "#8a4a14";
      g.beginPath();
      g.arc(x, y, s.carrying != null ? 6.5 : 5.5, 0, Math.PI * 2);
      g.fill();
      if (s.state !== "shooed") {
        g.lineWidth = 1.5;
        g.strokeStyle = "#fff";
        g.stroke();
      }
    }
    // You.
    g.fillStyle = "#1d4ed8";
    g.beginPath();
    g.moveTo(c, c - 7);
    g.lineTo(c - 5, c + 5);
    g.lineTo(c + 5, c + 5);
    g.closePath();
    g.fill();
  }

  function step(dt) {
    // Turning.
    const want = (held.left ? 1 : 0) - (held.right ? 1 : 0);
    spin += (want * TURN_SPEED - spin) * Math.min(1, dt * 10);
    if (want) aimYaw = null;
    yaw += spin * dt;
    const look = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    tilt += (look * LOOK_SPEED - tilt) * Math.min(1, dt * 10);
    pitch = clampPitch(pitch + tilt * dt);
    if (aimYaw != null) {
      const d = turnBetween(yaw, aimYaw);
      const move = Math.sign(d) * Math.min(Math.abs(d), dt * 5.5);
      yaw += move;
      if (Math.abs(d) < 0.01) aimYaw = null;
    }
    if (state !== "playing") return;
    for (const e of update(picnic, dt, yaw, Math.random, inView)) {
      if (e.type === "spawn") {
        const a = angleOf(e.squirrel.x, e.squirrel.z);
        sfx.rustle(panOf(a));
        if (e.squirrel.kind === "fox" && !foxSeen) {
          foxSeen = true;
          say(
            "A fox! Foxes are quicker than squirrels, so keep a close eye on it.",
            3200,
          );
        }
        if (picnic.spawned === 1)
          say(
            "A squirrel! It freezes while you watch it. Look away to let it creep closer, then shoo it inside the ring.",
            0,
          );
      } else if (e.type === "grab") {
        const a = angleOf(e.squirrel.x, e.squirrel.z);
        sfx.grab(panOf(a), e.squirrel.kind);
        const rel = turnBetween(yaw, a);
        const behind = Math.abs(rel) > 0.75;
        const who = `A ${kindOf(e.squirrel).name}'s`;
        say(
          behind
            ? `${who} got the ${SNACK_NAMES[e.snack.kind]}! Turn ${rel > 0 ? "left" : "right"}, quick!`
            : `${who} got the ${SNACK_NAMES[e.snack.kind]}! Shoo it!`,
          2600,
        );
      } else if (e.type === "stolen") {
        sfx.stolen();
        const left = STOLEN_TO_LOSE - picnic.stolen;
        say(
          left > 0
            ? `Oh no, it ran off with the ${SNACK_NAMES[e.snack.kind]}! ${left === 1 ? "One more" : `${left} more`} and the picnic's over.`
            : `Oh no, it ran off with the ${SNACK_NAMES[e.snack.kind]}!`,
          3200,
        );
      } else if (e.type === "over") {
        sfx.over();
        state = "ending";
        endAt = performance.now() + 1600;
        get("pause").hidden = true;
      }
    }
    hud();
  }

  function loop(now) {
    const dt = Math.max(0, Math.min((now - previous) / 1000, 0.05));
    previous = now;
    if (state !== "paused") step(dt);
    scene.draw(state === "paused" ? 0 : dt, { picnic, yaw, pitch, inReach });
    edges();
    drawRadar();
    if (state === "ending" && now >= endAt) finish();
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    get("pause").hidden = true;
    const n = picnic.shooed;
    const previousBest = best;
    if (n > best) {
      best = n;
      try {
        localStorage.setItem(bestKey, String(best));
      } catch {}
    }
    results.show(
      n
        ? `You shooed ${n} critter${n === 1 ? "" : "s"} away!`
        : "The squirrels and foxes had a picnic!",
      n > previousBest && previousBest > 0
        ? "That's a new best! The squirrels and foxes didn't stand a chance."
        : n && n === previousBest
          ? "That ties your best!"
          : previousBest > n
            ? `Your best: ${previousBest}. Keep turning round to spot the sneaky ones!`
            : "Keep looking all around: the map in the corner shows the ones behind you.",
      [
        [n, "SHOOED"],
        [fmtTime(picnic.t), "PICNIC TIME"],
        [best, "BEST"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    if (reset) {
      picnic = createPicnic(level);
      yaw = 0;
      pitch = PITCH;
      tilt = 0;
      spin = 0;
      aimYaw = null;
      foxSeen = false;
      scene.reset();
      get("pops").replaceChildren();
      say("Keep watch! Squirrels are coming for your snacks.", 2600);
    }
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
    held.left = held.right = held.up = held.down = false;
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

  // Left stick / D-pad arrive as WASD, the right stick as IJKL.
  const KEY_TURN = {
    a: "left",
    arrowleft: "left",
    q: "left",
    j: "left",
    d: "right",
    arrowright: "right",
    e: "right",
    l: "right",
    w: "up",
    arrowup: "up",
    i: "up",
    s: "down",
    arrowdown: "down",
    k: "down",
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (state !== "playing") return;
    const key = event.key.toLowerCase?.() ?? "";
    if (KEY_TURN[key]) {
      held[KEY_TURN[key]] = true;
      event.preventDefault();
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      if (!event.repeat) swatCentre();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const side = KEY_TURN[event.key.toLowerCase?.() ?? ""];
    if (side) held[side] = false;
  });

  // Tap a squirrel to shoo it; drag the lawn to turn.
  let drag = null;
  const local = (event) => {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = local(event);
    if (tapAt(p.x, p.y)) return;
    drag = { id: event.pointerId, x: p.x, y: p.y, moved: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId || state !== "playing") return;
    const p = local(event);
    const across =
      2 *
      Math.atan(
        (canvas.clientWidth / canvas.clientHeight) *
          Math.tan((scene.camera.fov * Math.PI) / 360),
      );
    yaw += ((p.x - drag.x) / canvas.clientWidth) * across;
    // Drag the lawn down to look up, and up to look down.
    const tall = (scene.camera.fov * Math.PI) / 180;
    pitch = clampPitch(pitch + ((p.y - drag.y) / canvas.clientHeight) * tall);
    aimYaw = null;
    drag.moved += Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y);
    drag.x = p.x;
    drag.y = p.y;
  });
  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const p = local(event);
    if (drag.moved < 10 && state === "playing") {
      // A tap that just missed: try again where it let go, else a whiff.
      if (!tapAt(p.x, p.y)) whiff(p.x, p.y);
    }
    drag = null;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", (event) => {
    if (drag?.id === event.pointerId) drag = null;
  });

  // Tap the map to turn that way.
  radar.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    event.preventDefault();
    const r = radar.getBoundingClientRect();
    const x = event.clientX - r.left - r.width / 2;
    const y = event.clientY - r.top - r.height / 2;
    if (Math.hypot(x, y) < 6) return;
    aimYaw = yaw + Math.atan2(-x, -y);
  });
  // Tap an edge arrow to turn that way too.
  get("edge-left").addEventListener("pointerdown", () => {
    if (state === "playing") aimYaw = yaw + Math.PI / 2;
  });
  get("edge-right").addEventListener("pointerdown", () => {
    if (state === "playing") aimYaw = yaw - Math.PI / 2;
  });
  for (const side of ["left", "right"]) {
    const button = get(`turn-${side}`);
    const on = (event) => {
      event.preventDefault();
      held[side] = true;
    };
    const off = () => (held[side] = false);
    button.addEventListener("pointerdown", on);
    button.addEventListener("pointerup", off);
    button.addEventListener("pointercancel", off);
    button.addEventListener("pointerleave", off);
  }

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

  const scene = createShooAwayScene(canvas, avatar);
  // Dev only: poke at the game from the console.
  if (import.meta.env?.DEV)
    dialog.debug = {
      scene,
      picnic: () => picnic,
      yaw: () => yaw,
      pitch: () => pitch,
      step,
      loop,
    };
  dialog.showModal();
  hud();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("heading").textContent = "Guard the picnic!";
  get("details").textContent =
    `Squirrels and the odd speedy fox are sneaking in from every side to steal your snacks. Look all around and shoo them away with your hand. If they take ${STOLEN_TO_LOSE} snacks, the picnic's over!${best ? ` Your best: ${best} shooed.` : ""}`;
  get("play").focus();
}
