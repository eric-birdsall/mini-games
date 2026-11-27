import preview from "./assets/modes/fire-and-ice.jpg";
import { GameTimers } from "./gameTimers.js";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { nearest } from "./padBridge.js";
import { headshot } from "./headshots.js";
import { AVATARS } from "../shared/avatars.js";
import {
  ACTIONS,
  WIN_SCORE,
  canThrow,
  computerMove,
  newDuel,
  otherElement,
  playRound,
} from "../shared/fireIce.js";
import "./fireIce.css";

// Fire & Ice: a one-tap secret-pick duel against the computer. Your picked
// character faces a random other one; they stand still and the balls and
// shields do the work. The rules are in shared/fireIce.js.

const TITLE = "Fire & Ice";
const HOW_TO =
  "Pick fire or ice to start; the computer gets the other. Each round, tap Attack to throw your ball, Reload, or Shield. The computer picks at the same time. An attack hits someone who is reloading, and a shield blocks it. Two attacks meet in a puff of steam. You start loaded, and after an attack you must reload before attacking again. Fire and ice work the same. First to five stars wins. Keys: 1–3 pick a move, arrows move between buttons, Esc pauses. Controller: stick or D-pad to move, A to pick, B to pause.";

// Where on a critter streams start and shields are held: `aim` is the
// height (fraction of the box, from the top) and `reach` how far the body
// sticks out sideways from the middle (fraction of the box width). These
// fit the drawn critter's arm; portraits measure their own (bodyEdge).
const AIM = 0.6;
const REACH = 0.36;
const critter = (side) => `
<svg viewBox="0 0 200 300" aria-hidden="true">
  <g class="fi-legs">
    <rect x="66" y="232" width="26" height="54" rx="12"/>
    <rect x="108" y="232" width="26" height="54" rx="12"/>
    <ellipse cx="79" cy="288" rx="22" ry="10" class="fi-foot"/>
    <ellipse cx="121" cy="288" rx="22" ry="10" class="fi-foot"/>
  </g>
  <g class="fi-body">
    <ellipse cx="100" cy="192" rx="60" ry="52"/>
    <ellipse cx="100" cy="200" rx="36" ry="32" class="fi-belly"/>
    <ellipse cx="42" cy="186" rx="14" ry="26" class="fi-arm" transform="rotate(18 42 186)"/>
    <ellipse cx="158" cy="186" rx="14" ry="26" class="fi-arm" transform="rotate(-18 158 186)"/>
  </g>
  <g class="fi-head">
    <circle cx="100" cy="98" r="52"/>
    <path d="M52 66 L100 ${side ? 2 : 4} L148 66 Z" class="fi-hat"/>
    <path d="M100 26 l5 10 11 2 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -2 Z" class="fi-hat-star"/>
    <rect x="46" y="60" width="108" height="12" rx="6" class="fi-hat-band"/>
    <circle cx="86" cy="100" r="11" class="fi-eye"/>
    <circle cx="122" cy="100" r="11" class="fi-eye"/>
    <circle cx="90" cy="99" r="5" class="fi-pupil"/>
    <circle cx="126" cy="99" r="5" class="fi-pupil"/>
    <circle cx="72" cy="120" r="8" class="fi-cheek"/>
    <circle cx="136" cy="120" r="8" class="fi-cheek"/>
    <path d="M94 124 Q104 134 114 124" class="fi-mouth"/>
  </g>
</svg>`;

// Pictures for the moves.
const BALL = {
  fire: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 C62 24 78 22 76 44 C88 40 86 58 82 66 A34 34 0 1 1 18 62 C14 50 20 40 28 38 C26 26 40 22 50 8 Z" fill="url(#fi-fb)"/><circle cx="50" cy="62" r="18" fill="#fff6a8" opacity=".8"/></svg>`,
  ice: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="52" r="36" fill="url(#fi-ib)"/><g stroke="#ffffff" stroke-width="5" stroke-linecap="round"><path d="M50 30v44M31 41l38 22M31 63l38-22"/></g><circle cx="38" cy="38" r="6" fill="#fff" opacity=".9"/></svg>`,
};
// A flame tongue standing on (x, y), h tall and 2w wide.
const tongue = (x, y, h, w) =>
  `M${x - w} ${y}C${x - w} ${y - h * 0.45} ${x - w * 0.15} ${y - h * 0.55} ${x} ${y - h}C${x + w * 0.25} ${y - h * 0.5} ${x + w} ${y - h * 0.45} ${x + w} ${y}Q${x} ${y + w * 0.6} ${x - w} ${y}Z`;
// The classic heater-shield outline: a peak in the middle of the top,
// a corner each side, and sides sweeping down to a point. INSET is the
// same outline shrunk a little, for the wood inside the iron rim.
const SHAPE =
  "M14 32Q34 31 50 18Q66 31 86 32C86 62 72 82 50 97C28 82 14 62 14 32Z";
const INSET = 'transform="translate(50 57) scale(.86) translate(-50 -57)"';
// Points along the top edge of the wooden shield, where it burns.
const RIM = [
  [18, 32],
  [33, 28],
  [50, 19],
  [67, 28],
  [82, 32],
];
const flames = (heights, width, cls) =>
  `<g class="fi-flames ${cls}">${RIM.map(
    ([x, y], i) =>
      `<g class="fi-flame"><path d="${tongue(x, y, heights[i], width)}" fill="url(#fi-fl)"/><path d="${tongue(x, y + 1, heights[i] * 0.55, width * 0.55)}" fill="#fff3a0"/></g>`,
  ).join("")}</g>`;
const RIVETS = [
  [19, 35],
  [33, 31.5],
  [50, 23],
  [67, 31.5],
  [81, 35],
  [21, 52],
  [79, 52],
  [31, 74],
  [69, 74],
  [50, 91],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2"/>`)
  .join("");
const SHIELD = {
  // A wooden heater shield with an iron rim, burning along the top.
  fire: `<svg viewBox="0 0 100 100" aria-hidden="true" class="fi-wood">${flames([16, 22, 27, 22, 16], 8, "fi-back")}<path d="${SHAPE}" fill="#5a2f14"/><path d="${SHAPE}" ${INSET} fill="url(#fi-wd)"/><g clip-path="url(#fi-wclip)" fill="none" stroke="#6e3a18" stroke-linecap="round"><path d="M29 10v90M43 10v90M57 10v90M71 10v90" stroke-width="2.4"/><path d="M36 40q3 6 0 12M50 70q3 6 0 12M64 42q-3 6 0 12M22 50q3 5 0 10M78 52q-3 5 0 10M36 70q3 4 0 8" stroke-width="1.6" opacity=".7"/><ellipse cx="50" cy="26" rx="34" ry="14" fill="#2a1408" stroke="none" opacity=".45"/></g><path d="${SHAPE}" fill="none" stroke="#9aa3ad" stroke-width="4.5" stroke-linejoin="round"/><g fill="#e3e8ee">${RIVETS}</g><circle cx="50" cy="55" r="9" fill="#cfd6de" stroke="#6d7682" stroke-width="3"/><circle cx="47" cy="52" r="2.8" fill="#fff" opacity=".8"/>${flames([9, 12, 14, 12, 9], 5.5, "fi-front")}</svg>`,
  // A thick heater shield carved from ice, with snow along the top.
  ice: `<svg viewBox="0 0 100 100" aria-hidden="true" class="fi-block"><path d="${SHAPE}" fill="url(#fi-iblk)"/><path d="${SHAPE}" ${INSET} fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2"/><g clip-path="url(#fi-iclip)"><path class="fi-glint" d="M8 100 L18 100 L34 10 L24 10 Z" fill="#fff" opacity=".55"/><g fill="#fff"><path d="M18 36 L32 34 L20 62 Z" opacity=".75"/><path d="M37 34 L43 33 L24 78 L21 72 Z" opacity=".45"/></g></g><path d="M62 40 L55 52 L63 59 L57 74 M55 52 L46 57 M63 59 L70 63" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/><g fill="#fff" opacity=".6"><circle cx="60" cy="82" r="2.6"/><circle cx="54" cy="88" r="1.6"/><circle cx="38" cy="80" r="2"/><circle cx="44" cy="66" r="1.4"/></g><path d="M11 33Q34 32 50 16Q66 32 89 33L87 37Q81 34 76 38Q70 33 64 36Q58 30 54 31Q50 26 46 31Q42 30 36 36Q30 33 24 38Q19 34 13 37Z" fill="#fff"/><g fill="#fff" opacity=".9"><path d="M24 37 L27 46 L30 36Z"/><path d="M62 35 L64 42 L67 35Z"/><path d="M78 36 L80 44 L83 35Z"/></g></svg>`,
};
// Shields in the yard are turned in 3D to face the opponent. These plain
// silhouettes stack behind the face to give them thickness: wood with an
// iron edge, or solid ice.
const EDGE = {
  fire: `<svg viewBox="0 0 100 100" class="fi-edge"><path d="${SHAPE}" fill="#4a2510" stroke="#6d7682" stroke-width="3" stroke-linejoin="round"/></svg>`,
  ice: `<svg viewBox="0 0 100 100" class="fi-edge"><path d="${SHAPE}" fill="#5fb3e6"/></svg>`,
};
const turned = (element) =>
  `<div class="fi-turn">${EDGE[element].repeat(5)}${SHIELD[element]}</div>`;
const DEFS = `<svg class="fi-defs" width="0" height="0" aria-hidden="true"><defs><radialGradient id="fi-fb" cx="40%" cy="40%"><stop offset="0" stop-color="#fff6a8"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#e8401c"/></radialGradient><radialGradient id="fi-ib" cx="38%" cy="36%"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9fe2ff"/><stop offset="1" stop-color="#2f86d6"/></radialGradient><linearGradient id="fi-fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e5391b"/><stop offset=".5" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ffd23a"/></linearGradient><radialGradient id="fi-wd" cx="45%" cy="55%"><stop offset="0" stop-color="#d39552"/><stop offset=".7" stop-color="#b06e35"/><stop offset="1" stop-color="#874c22"/></radialGradient><clipPath id="fi-wclip"><path d="${SHAPE}" ${INSET}/></clipPath><linearGradient id="fi-iblk" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#e6f9ff"/><stop offset=".55" stop-color="#8fd3f6"/><stop offset="1" stop-color="#3f93dc"/></linearGradient><clipPath id="fi-iclip"><path d="${SHAPE}"/></clipPath></defs></svg>`;
const RELOAD = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="#f3eeff"/><g fill="none" stroke="#6b55d6" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M76 50a26 26 0 1 1-8-19"/><path d="M72 18v15h-15"/></g><circle cx="40" cy="52" r="9" fill="url(#fi-fb)"/><circle cx="60" cy="52" r="9" fill="url(#fi-ib)"/></svg>`;
const picture = (action, element) =>
  action === "reload" ? RELOAD : (action === "ball" ? BALL : SHIELD)[element];
// Classes a round's show puts on the critters, cleared after it.
const FX_CLASSES = [
  "fi-ouch",
  "fi-cheer",
  "fi-blast",
  "fi-frozen",
  "fi-singed",
];
const LABEL = { ball: "Attack", reload: "Reload", shield: "Shield" };
const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`;
const RECHARGE = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>`;

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const live = () => audio?.state === "running";
  const tone = (freq, start, length, type = "sine", volume = 0.1, slide) => {
    if (!live()) return;
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
  const noise = (
    volume,
    length,
    from,
    to = from,
    start = 0,
    type = "bandpass",
  ) => {
    if (!live()) return;
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
    filter.type = type;
    filter.Q.value = 1;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  };
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    tap: () => tone(660, 0, 0.08, "sine", 0.06, 880),
    shield: (element) =>
      element === "fire"
        ? noise(0.12, 0.35, 600, 1800)
        : [1200, 1600, 2000].forEach((f, i) =>
            tone(f, i * 0.04, 0.12, "triangle", 0.05),
          ),
    reload: () =>
      [440, 660, 880].forEach((f, i) =>
        tone(f, i * 0.07, 0.12, "triangle", 0.06),
      ),
    // A roaring flamethrower, or the hiss of a frost blast.
    blast: (element) => {
      if (element === "fire") {
        noise(0.2, 1, 220, 700, 0, "lowpass");
        noise(0.07, 0.9, 1400, 500);
      } else {
        noise(0.1, 1, 5500, 2600, 0, "highpass");
        [2349, 2794, 3136].forEach((f, i) =>
          tone(f, 0.1 + i * 0.12, 0.25, "triangle", 0.025),
        );
      }
    },
    sizzle: () => noise(0.18, 0.45, 2500, 900, 0, "highpass"),
    crack: () => {
      noise(0.2, 0.12, 4000, 2000);
      tone(1800, 0, 0.1, "square", 0.03, 900);
    },
    steam: () => noise(0.16, 1, 5000, 1800, 0, "highpass"),
    bonk: () => tone(320, 0, 0.3, "triangle", 0.14, 140),
    star: () =>
      [784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, "triangle", 0.07)),
    cheer: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.1, 0.25, "square", 0.04),
      ),
    friendly: () =>
      [523, 494, 523, 659].forEach((f, i) =>
        tone(f, i * 0.14, 0.22, "triangle", 0.06),
      ),
  };
}

export function installFireIce(getAvatar = () => ({})) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "fireice";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Two critters in the snow: one sprays a stream of fire, the other holds up an ice shield" draggable="false"></span><strong>${TITLE}</strong><small>Pick fire or ice, then attack, reload or shield. The computer picks at the same time. First to five stars wins!</small>`;
  games.append(entry);
  entry.onclick = () => open(getAvatar().character);
}

// A still, full-body picture of a character. Until it loads (or if the
// model can't), the drawn critter stands in.
function portrait(box, id) {
  headshot(id, true, undefined, 384).then((url) => {
    if (!url || !box.isConnected) return;
    const img = document.createElement("img");
    img.className = "fi-portrait";
    img.alt = "";
    img.src = url;
    box.querySelector("svg").replaceWith(img);
    img.decode().then(
      () => bodyEdge(box, img),
      () => {},
    );
  });
}

// Portraits have big heads over smaller bodies, so find the body's side
// edge (where the arms are) from the picture's opaque pixels. Characters
// face right in their portraits; the computer's is mirrored, so its facing
// side is the picture's right too.
const BODY = [0.6, 0.85]; // rows of the picture that are the body
function bodyEdge(box, img) {
  const n = 96;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  let data;
  try {
    data = g.getImageData(0, 0, n, n).data;
  } catch {
    return;
  }
  let edge = -1;
  for (let y = Math.floor(n * BODY[0]); y < n * BODY[1]; y++)
    for (let x = n - 1; x > edge; x--)
      if (data[(y * n + x) * 4 + 3] > 60) {
        edge = x;
        break;
      }
  if (edge < n / 2) return;
  box.dataset.reach = String((edge + 1) / n - 0.5);
  box.dataset.aim = String((BODY[0] + BODY[1]) / 2 - 0.04);
}

function open(character) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "fire-ice";
  dialog.setAttribute("aria-label", TITLE);
  const stars = (side) =>
    Array.from(
      { length: WIN_SCORE },
      () => `<i class="fi-star">${STAR}</i>`,
    ).join("");
  dialog.innerHTML = `${DEFS}
    <div class="fi-stage">
      <div class="fi-sky" aria-hidden="true"><i class="fi-moon"></i><i class="fi-hill fi-hill-a"></i><i class="fi-hill fi-hill-b"></i></div>
      <div class="fi-ground" aria-hidden="true"></div>
      <div class="fi-critter fi-you" data-critter="0">${critter(0)}<span class="fi-recharge" hidden>${RECHARGE}</span></div>
      <div class="fi-critter fi-cpu" data-critter="1">${critter(1)}<span class="fi-recharge" hidden>${RECHARGE}</span></div>
      <div class="fi-fx" data-fx aria-hidden="true"></div>
    </div>
    <div class="fi-hud">
      <div class="fi-score fi-score-you" data-score="0" aria-label="Your stars">${stars(0)}</div>
      <button type="button" class="fi-round-btn" data-pause aria-label="Pause">${PAUSE}</button>
      <div class="fi-score fi-score-cpu" data-score="1" aria-label="Computer's stars">${stars(1)}</div>
    </div>
    <div class="fi-bar" data-bar hidden>
      ${ACTIONS.map(
        (action, i) =>
          `<button type="button" class="fi-move fi-${action}" data-move="${i}" aria-label="${LABEL[action]} (${i + 1})"><span class="fi-pic"></span><span class="fi-lock">${RECHARGE}</span></button>`,
      ).join("")}
    </div>
    <section class="fi-intro" data-intro aria-labelledby="fi-how">
      <div class="fi-howto">
        <span class="fi-kicker">${TITLE.toUpperCase()}</span>
        <h2 id="fi-how">How to play</h2>
        <p>You and the computer pick a move at the same time. Each round, choose one:</p>
        <ul class="fi-moves-list">
          <li><i class="fi-ico" data-howto="ball">${BALL.fire}</i><span><b>Attack</b> throws your ball. It scores a star if the other side is reloading.</span></li>
          <li><i class="fi-ico" data-howto="shield">${SHIELD.fire}</i><span><b>Shield</b> blocks any attack.</span></li>
          <li><i class="fi-ico">${RELOAD}</i><span><b>Reload</b> gets your next ball ready. After every attack you must reload before you can attack again.</span></li>
        </ul>
        <p>If you both attack, the balls crash into a puff of steam. First to <b>five stars</b> wins!</p>
        <p class="fi-keys">Tap a move, or press 1, 2, 3. Controller: stick to choose, A to pick, B to pause.</p>
        <h3>Choose fire or ice</h3>
        <div class="fi-picks">
          <button type="button" class="fi-play fi-pick-fire" data-begin data-pick="fire" aria-label="Play as fire">${BALL.fire}<span>FIRE</span></button>
          <button type="button" class="fi-play fi-pick-ice" data-pick="ice" aria-label="Play as ice">${BALL.ice}<span>ICE</span></button>
        </div>
      </div>
      <button type="button" class="fi-exit" data-exit aria-label="Back to games">${BACK}</button>
    </section>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const stage = dialog.querySelector(".fi-stage");
  const fx = get("fx");
  const critters = [0, 1].map((i) => get(`critter="${i}"`));
  const moveButtons = [...dialog.querySelectorAll("[data-move]")];
  // Keep controller focus visible when the instructions scroll on short screens.
  get("intro").addEventListener("focusin", (event) => {
    if (event.target.matches("button"))
      event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  // Your character, and a random different one for the computer.
  const yours = AVATARS.includes(character) ? character : AVATARS[0];
  const pool = AVATARS.filter((id) => id !== yours);
  portrait(critters[0], yours);
  portrait(critters[1], pool[Math.floor(Math.random() * pool.length)]);
  const sfx = sounds();
  const timers = new GameTimers();

  // ready | move | resolving | done (celebration) | finished | paused
  let phase = "ready";
  let resumeTo = "move";
  let pausedAnimations = [];
  const resumeAnimations = () => {
    pausedAnimations.forEach((animation) => animation.play());
    pausedAnimations = [];
  };
  let duel = newDuel();
  let elements = ["fire", "ice"]; // [yours, the computer's]

  // The pad bridge moves focus between buttons and A presses them, so the
  // game never takes the stick directly.
  dialog.padPlaying = () => false;

  const later = (fn, ms) => timers.later(fn, ms);
  const clearTimers = () => timers.clear();

  function hud() {
    for (const side of [0, 1]) {
      get(`score="${side}"`)
        .querySelectorAll(".fi-star")
        .forEach((s, i) => s.classList.toggle("on", i < duel.score[side]));
      critters[side].querySelector(".fi-recharge").hidden =
        duel.loaded[side] || duel.winner !== null;
    }
    const ready = canThrow(duel, 0);
    moveButtons.forEach((b, i) => {
      const locked = ACTIONS[i] === "ball" && !ready;
      b.disabled = locked;
      b.classList.toggle("locked", locked);
    });
  }

  function showMoves() {
    phase = "move";
    get("bar").hidden = false;
    hud();
    const first = moveButtons.find((b) => !b.disabled);
    first.focus({ preventScroll: true });
  }

  // Where things happen on screen, in stage pixels.
  function spot(side, where) {
    const host = stage.getBoundingClientRect();
    const c = critters[side];
    const r = c.getBoundingClientRect();
    const facing = side === 0 ? 1 : -1;
    const y = r.top - host.top + r.height * Number(c.dataset.aim || AIM);
    const mid = r.left - host.left + r.width / 2;
    const edge = r.width * Number(c.dataset.reach || REACH);
    // The stream leaves just off the body; the shield's near half overlaps
    // the body, as if held up in front.
    const x =
      where === "hand"
        ? mid + facing * (edge + r.height * 0.02)
        : where === "shield"
          ? mid + facing * (edge + r.height * 0.07)
          : mid;
    return { x, y, size: r.height };
  }

  function sprite(html, cls, at, scale) {
    const el = document.createElement("div");
    el.className = `fi-sprite ${cls}`;
    el.innerHTML = html;
    const size = at.size * scale;
    el.style.width = el.style.height = `${size}px`;
    el.style.left = `${at.x - size / 2}px`;
    el.style.top = `${at.y - size / 2}px`;
    fx.append(el);
    return el;
  }

  // One loose bit of fire, frost, smoke or steam, animated by keyframes and
  // gone when done. They are Web Animations, so pause() catches them too.
  function particle(cls, at, size, frames, timing) {
    const el = document.createElement("i");
    el.className = `fi-bit ${cls}`;
    el.style.width = el.style.height = `${size}px`;
    el.style.left = `${at.x - size / 2}px`;
    el.style.top = `${at.y - size / 2}px`;
    fx.append(el);
    el.animate(frames, { easing: "ease-out", ...timing }).onfinish = () =>
      el.remove();
    return el;
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const move = (x, y, scale, turn = 0) =>
    `translate(${x}px, ${y}px) scale(${scale}) rotate(${turn}turn)`;

  // Colours a flare passes through as it flies: white-hot to smoke for fire,
  // white to deep blue to mist for frost.
  const FLARE = {
    fire: ["#fffbe6", "#ffe066", "#ff9a1f", "#ef4a1a", "#6b4048"],
    ice: ["#ffffff", "#e9fbff", "#a8e6ff", "#4aa8f0", "#e3f6ff"],
  };

  // A flamethrower (or frost-thrower) stream from `from` toward `to`:
  // flares pour out for `emit` ms and each takes about `travel` ms to arrive.
  // end: "pass" flows on through the target, "splash" spreads along a
  // shield's face, "up" billows upward where two streams meet.
  function stream(from, to, element, end = "pass", emit = 720, travel = 430) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / len, dy / len];
    const [px, py] = [-uy, ux];
    const size = from.size;
    const colors = FLARE[element];
    const sink = element === "fire" ? -0.14 : 0.08; // flames rise, frost sinks
    // Flares are stretched along the stream, so it reads as a jet.
    const jet = (x, y, scale, stretch = 1.7) =>
      `translate(${x}px, ${y}px) rotate(${Math.atan2(dy, dx)}rad) scale(${scale * stretch}, ${scale})`;
    const count = Math.round(emit / 11);
    // A glow at the hand while the stream pours.
    particle(
      `fi-nozzle fi-${element}`,
      from,
      size * 0.22,
      [
        { transform: "scale(.3)", opacity: 0 },
        { transform: "scale(1.1)", opacity: 1, offset: 0.12 },
        { transform: "scale(.9)", opacity: 1, offset: 0.5 },
        { transform: "scale(1.05)", opacity: 1, offset: 0.85 },
        { transform: "scale(.2)", opacity: 0 },
      ],
      { duration: emit + 120, easing: "linear" },
    );
    for (let i = 0; i < count; i++) {
      const life = travel * rand(0.85, 1.2);
      const spread = rand(-1, 1) * len * 0.1;
      const drift = size * sink * Math.random();
      const s = size * rand(0.12, 0.2);
      const mid = [dx * 0.5 + px * spread * 0.4, dy * 0.5 + py * spread * 0.4];
      let last;
      if (end === "pass") {
        last = [dx * 1.08 + px * spread, dy * 1.08 + py * spread + drift];
      } else {
        // Hit the face, then fan out along it (or up, for steam).
        const side = end === "up" ? -1 : Math.random() < 0.5 ? -1 : 1;
        const fan = size * rand(0.15, 0.42);
        last = [
          dx - ux * size * rand(0.02, 0.14),
          dy + (end === "up" ? -fan * 1.2 : side * fan),
        ];
        mid[0] = dx * 0.85 + px * spread * 0.3;
        mid[1] = dy * 0.85 + py * spread * 0.3;
      }
      particle(
        `fi-flare fi-${element}`,
        from,
        s,
        [
          { transform: jet(0, 0, 0.35), opacity: 0.95, color: colors[0] },
          { color: colors[1], offset: 0.2 },
          {
            transform: jet(...mid, end === "pass" ? 1 : 1.3),
            color: colors[2],
            offset: end === "pass" ? 0.5 : 0.6,
          },
          { color: colors[3], opacity: 0.85, offset: 0.8 },
          {
            transform: jet(...last, end === "pass" ? 2 : 1.7, 1.2),
            opacity: 0,
            color: colors[4],
          },
        ],
        { duration: life, delay: (i / count) * emit, easing: "linear" },
      );
      // Sparks: embers for fire, glittering snowflakes for frost.
      if (i % 4 === 0) {
        const far = rand(0.8, 1.15);
        particle(
          `fi-spark fi-${element}`,
          from,
          size * rand(0.03, 0.05),
          [
            { transform: move(0, 0, 1), opacity: 1 },
            {
              transform: move(
                last[0] * far + px * spread * 0.6,
                last[1] * far + drift * 2.5 + py * spread * 0.6,
                0.5,
                rand(-1, 1),
              ),
              opacity: 0,
            },
          ],
          { duration: life * 1.2, delay: (i / count) * emit + 20 },
        );
      }
      // Fire leaves curls of smoke rising off the stream.
      if (element === "fire" && i % 6 === 3) {
        const t = rand(0.3, 0.8);
        particle(
          "fi-smoke",
          { x: from.x + dx * t, y: from.y + dy * t },
          size * rand(0.08, 0.12),
          [
            { transform: move(0, 0, 0.4), opacity: 0 },
            { opacity: 0.45, offset: 0.25 },
            {
              transform: move(rand(-0.05, 0.05) * size, -size * 0.35, 2),
              opacity: 0,
            },
          ],
          { duration: 900, delay: (i / count) * emit + life * t },
        );
      }
    }
  }

  // Bits flying out from a hit: embers or ice shards.
  function shards(at, element, count = 10, reach = 0.35) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = at.size * reach * rand(0.6, 1);
      const fall = element === "ice" ? at.size * 0.18 : -at.size * 0.08;
      particle(
        `fi-shard fi-${element}`,
        at,
        at.size * rand(0.04, 0.07),
        [
          { transform: move(0, 0, 1), opacity: 1 },
          {
            transform: move(Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.9, 0.5),
            opacity: 1,
            offset: 0.6,
          },
          {
            transform: move(
              Math.cos(a) * r * 1.2,
              Math.sin(a) * r + fall,
              0.4,
              1,
            ),
            opacity: 0,
          },
        ],
        { duration: rand(550, 800), easing: "cubic-bezier(.2,.7,.4,1)" },
      );
    }
  }

  function burst(at, element, big = 1) {
    const el = sprite("", `fi-burst fi-${element}`, at, 0.4 * big);
    el.addEventListener("animationend", () => el.remove());
    shards(at, element, Math.round(10 * big), 0.35 * big);
    if (element === "fire") sfx.sizzle();
    else sfx.crack();
  }

  // Two streams meet: a billowing cloud of steam.
  function puff(at) {
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2);
      const r = at.size * rand(0, 0.12);
      particle(
        "fi-cloud",
        { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r * 0.6 },
        at.size * rand(0.16, 0.26),
        [
          { transform: move(0, 0, 0.3), opacity: 0 },
          { opacity: 0.95, offset: 0.15 },
          {
            transform: move(
              Math.cos(a) * at.size * 0.22,
              -at.size * rand(0.35, 0.6),
              rand(1.8, 2.6),
            ),
            opacity: 0,
          },
        ],
        { duration: rand(1000, 1400), delay: rand(0, 300) },
      );
    }
    sfx.steam();
  }

  // Fire on the ice block: it slumps, drips and leaves a puddle.
  function melt(shield, at) {
    shield?.classList.add("fi-melting");
    const w = at.size * 0.44;
    const base = { x: at.x, y: at.y + w * 0.46, size: at.size };
    particle(
      "fi-puddle",
      base,
      w * 0.5,
      [
        { transform: "scale(.2, .06)", opacity: 0 },
        { transform: "scale(1.2, .2)", opacity: 0.85, offset: 0.3 },
        { transform: "scale(2.1, .3)", opacity: 0.85 },
      ],
      { duration: 1400, fill: "forwards" },
    );
    for (let i = 0; i < 9; i++) {
      const x = base.x + rand(-0.32, 0.32) * w;
      particle(
        "fi-drip",
        { x, y: base.y - w * rand(0.05, 0.3) },
        w * rand(0.06, 0.09),
        [
          { transform: "translateY(0) scale(.4, .6)", opacity: 0 },
          { transform: "translateY(0) scale(1, 1.2)", opacity: 1, offset: 0.3 },
          {
            transform: `translateY(${w * rand(0.2, 0.32)}px) scale(.8, 1.4)`,
            opacity: 0,
          },
        ],
        { duration: rand(500, 700), delay: 150 + i * 110, easing: "ease-in" },
      );
    }
    sfx.sizzle();
  }
  // Ice on the burning shield: the flames die in a hiss of steam and the
  // wood is left frosty.
  function douse(shield, at) {
    shield?.classList.add("fi-doused");
    const w = at.size * 0.44;
    for (let i = 0; i < 8; i++)
      particle(
        "fi-cloud",
        { x: at.x + rand(-0.3, 0.3) * w, y: at.y - w * rand(0.1, 0.3) },
        w * rand(0.16, 0.24),
        [
          { transform: move(0, 0, 0.3), opacity: 0 },
          { opacity: 0.8, offset: 0.2 },
          {
            transform: move(rand(-0.1, 0.1) * w, -w * rand(0.5, 0.8), 2),
            opacity: 0,
          },
        ],
        { duration: rand(900, 1200), delay: 100 + i * 70 },
      );
    sfx.steam();
  }

  // The thrower leans into it while the stream pours.
  function blast(side, element) {
    const c = critters[side];
    c.classList.remove("fi-blast");
    void c.offsetWidth;
    c.classList.add("fi-blast");
    sfx.blast(element);
  }
  // A hit leaves the target frosted over or a bit singed and smoking.
  function zap(side, element) {
    critters[side].classList.add(element === "ice" ? "fi-frozen" : "fi-singed");
    if (element !== "fire") return;
    const at = spot(side, "middle");
    at.y -= at.size * 0.35;
    for (let i = 0; i < 6; i++)
      particle(
        "fi-smoke",
        { x: at.x + rand(-0.15, 0.15) * at.size, y: at.y },
        at.size * 0.1,
        [
          { transform: move(0, 0, 0.5), opacity: 0 },
          { opacity: 0.5, offset: 0.2 },
          {
            transform: move(rand(-0.1, 0.1) * at.size, -at.size * 0.3, 2.2),
            opacity: 0,
          },
        ],
        { duration: 1100, delay: i * 120 },
      );
  }
  function ouch(side) {
    const c = critters[side];
    c.classList.remove("fi-ouch");
    void c.offsetWidth;
    c.classList.add("fi-ouch");
    sfx.bonk();
  }
  function award(side) {
    const star = get(`score="${side}"`).querySelectorAll(".fi-star")[
      duel.score[side] - 1
    ];
    star?.classList.add("on", "fi-new");
    star?.addEventListener(
      "animationend",
      () => star.classList.remove("fi-new"),
      { once: true },
    );
    sfx.star();
    critters[side].classList.remove("fi-cheer");
    void critters[side].offsetWidth;
    critters[side].classList.add("fi-cheer");
  }

  function pickMove(index) {
    if (phase !== "move") return;
    const mine = ACTIONS[index];
    if (!mine || (mine === "ball" && !canThrow(duel, 0))) return;
    sfx.resume();
    sfx.tap();
    const theirs = computerMove(duel, 1);
    const result = playRound(duel, mine, theirs);
    phase = "resolving";
    get("bar").hidden = true;
    // Keep focus inside the dialog so the controller still has somewhere
    // to start; the pause button is the only control left during the show.
    get("pause").focus({ preventScroll: true });
    // Stars show as they're won during the show.
    for (const side of [0, 1])
      get(`score="${side}"`)
        .querySelectorAll(".fi-star")
        .forEach((s, i) =>
          s.classList.toggle("on", i < duel.score[side] - result.points[side]),
        );
    show(
      [mine, theirs].map((action, side) => ({
        action,
        element: elements[side],
      })),
      result,
    );
  }

  // Play out the round: shields pop up, balls fly, then the outcome.
  function show(moves, result) {
    const shields = [];
    moves.forEach((m, side) => {
      if (m.action === "reload") {
        const at = spot(side, "middle");
        at.y -= at.size * 0.72;
        sprite(RELOAD, "fi-reloading", at, 0.26);
        critters[side].querySelector(".fi-recharge").hidden = true;
        sfx.reload();
      }
      if (m.action !== "shield") return;
      const at = spot(side, "shield");
      const el = sprite(
        turned(m.element),
        `fi-shield fi-${m.element} fi-side-${side}`,
        at,
        0.44,
      );
      el.style.setProperty(
        "--fi-depth",
        `${at.size * 0.44 * (m.element === "ice" ? 0.06 : 0.02)}px`,
      );
      el.style.perspective = `${at.size * 2}px`;
      shields[side] = el;
      // Frost crystals as the block freezes; embers as the wood catches.
      shards(at, m.element, 6, 0.28);
      sfx.shield(m.element);
    });
    // The head of a stream reaches its target partway through its travel.
    const TRAVEL = 430;
    const ARRIVE = TRAVEL * 0.62;
    later(() => {
      if (result.outcome === "calm") {
        shields.forEach((s) => s?.classList.add("fi-shimmer"));
        later(finishRound, 900);
        return;
      }
      if (result.outcome === "steam") {
        const host = stage.getBoundingClientRect();
        const meet = {
          x: host.width / 2,
          y: (spot(0).y + spot(1).y) / 2,
          size: spot(0).size,
        };
        moves.forEach((m, side) => {
          blast(side, m.element);
          stream(spot(side, "hand"), meet, m.element, "up");
        });
        later(() => {
          puff(meet);
          later(finishRound, 1400);
        }, ARRIVE);
        return;
      }
      const by = result.by;
      const element = moves[by].element;
      const from = spot(by, "hand");
      blast(by, element);
      if (result.outcome === "hit") {
        const to = spot(1 - by, "middle");
        stream(from, to, element, "pass");
        later(() => {
          burst(to, element);
          ouch(1 - by);
          zap(1 - by, element);
          later(() => award(by), 350);
          later(finishRound, 1400);
        }, ARRIVE);
        return;
      }
      // Blocked: the stream splashes off the shield's face.
      const at = spot(1 - by, "shield");
      const face = {
        ...at,
        x: at.x + (by === 0 ? -1 : 1) * at.size * 0.12,
      };
      stream(from, face, element, "splash");
      later(() => {
        burst(face, element, 0.6);
        // Fire melts the ice block; ice puts out the burning shield.
        if (element === "fire") melt(shields[1 - by], at);
        else douse(shields[1 - by], at);
        later(finishRound, 1500);
      }, ARRIVE);
    }, 380);
  }

  function finishRound() {
    fx.replaceChildren();
    critters.forEach((c) => c.classList.remove(...FX_CLASSES));
    hud();
    if (duel.winner === null) {
      showMoves();
      return;
    }
    phase = "done";
    get("bar").hidden = true;
    const won = duel.winner === 0;
    critters.forEach((c) => c.classList.add("fi-dance"));
    if (won) sfx.cheer();
    else sfx.friendly();
    later(() => {
      phase = "finished";
      results.show(
        won ? "You win! ⭐" : "So close! ⭐",
        won ? "Five stars! What a duel." : "Want another go?",
        [
          [String(duel.score[0]), "YOUR STARS"],
          [String(duel.score[1]), "COMPUTER'S STARS"],
        ],
      );
    }, 1800);
  }

  // Fire or ice: the buttons and hats take your element; the computer gets
  // the other.
  function setElement(element) {
    elements = [element, otherElement(element)];
    moveButtons.forEach((b, i) => {
      b.classList.remove("fi-fire", "fi-ice");
      b.classList.add(`fi-${element}`);
      b.querySelector(".fi-pic").innerHTML = picture(ACTIONS[i], element);
    });
    critters.forEach((c, side) => {
      c.classList.remove("fi-el-fire", "fi-el-ice");
      c.classList.add(`fi-el-${elements[side]}`);
    });
  }

  // Back to the start card to pick an element.
  function showIntro() {
    resumeAnimations();
    clearTimers();
    results.hide();
    fx.replaceChildren();
    critters.forEach((c) => c.classList.remove("fi-dance", ...FX_CLASSES));
    phase = "ready";
    duel = newDuel();
    hud();
    get("bar").hidden = true;
    setPauseScreen(dialog, false);
    get("intro").hidden = false;
    get("begin").focus({ preventScroll: true });
  }

  function start(element) {
    resumeAnimations();
    if (element) setElement(element);
    clearTimers();
    results.hide();
    fx.replaceChildren();
    critters.forEach((c) => c.classList.remove("fi-dance", ...FX_CLASSES));
    duel = newDuel();
    get("intro").hidden = true;
    sfx.resume();
    setPauseScreen(dialog, false);
    showMoves();
  }

  function pause() {
    if (!["move", "resolving", "done"].includes(phase)) return;
    resumeTo = phase;
    phase = "paused";
    timers.pause();
    pausedAnimations = dialog
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === "running");
    pausedAnimations.forEach((a) => a.pause());
    setPauseScreen(dialog, true);
  }
  function resume() {
    if (phase !== "paused") return;
    phase = resumeTo;
    setPauseScreen(dialog, false);
    resumeAnimations();
    timers.resume();
    if (phase === "move") showMoves();
    else get("pause").focus({ preventScroll: true });
  }

  const close = () => dialog.close();
  const results = gameResults(dialog, TITLE, showIntro, close);
  moveButtons.forEach((b, i) => (b.onclick = () => pickMove(i)));
  dialog.querySelectorAll("[data-pick]").forEach((b) => {
    b.onclick = () => start(b.dataset.pick);
  });
  get("exit").onclick = close;
  get("pause").onclick = pause;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = showIntro;
  get("pause-home").onclick = close;
  bindDialogEscape(dialog, () => {
    if (phase === "paused") resume();
    else if (["move", "resolving", "done"].includes(phase)) pause();
    else close();
  });

  // Arrow keys move between the visible buttons, like the controller.
  const DIRS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const dir = DIRS[event.key];
    if (dir) {
      const items = [...dialog.querySelectorAll("button, summary")].filter(
        (el) =>
          !el.disabled &&
          !el.closest("[inert],[hidden]") &&
          el.getClientRects().length,
      );
      const current = items.includes(document.activeElement)
        ? document.activeElement
        : null;
      event.preventDefault();
      if (!current) return items[0]?.focus({ preventScroll: true });
      const centre = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const others = items.filter((el) => el !== current);
      const i = nearest(centre(current), others.map(centre), dir);
      if (i >= 0) others[i].focus({ preventScroll: true });
      return;
    }
    if (event.repeat) return;
    const n = Number(event.key);
    if (phase === "move" && n >= 1 && n <= ACTIONS.length) {
      event.preventDefault();
      pickMove(n - 1);
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  const blur = () => pause();
  const visibility = () => document.hidden && pause();
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  dialog.addEventListener("close", () => {
    clearTimers();
    window.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", visibility);
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  dialog.showModal();
  hud();
  get("begin").focus({ preventScroll: true });
}
