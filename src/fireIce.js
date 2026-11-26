import preview from "./assets/modes/fire-and-ice.svg";
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

// Where on a critter balls fly and shields sit (fraction of its height).
const AIM = 0.6;
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
const SHIELD = {
  fire: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 L88 20 C88 56 74 80 50 94 C26 80 12 56 12 20 Z" fill="url(#fi-fs)" stroke="#fff3c0" stroke-width="5"/><path d="M50 26 C58 38 66 40 64 56 C64 66 58 72 50 72 C42 72 36 66 36 56 C36 48 42 46 44 38 C48 44 50 40 50 26 Z" fill="#fff3c0"/></svg>`,
  ice: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 L88 20 C88 56 74 80 50 94 C26 80 12 56 12 20 Z" fill="url(#fi-is)" stroke="#ffffff" stroke-width="5"/><g stroke="#ffffff" stroke-width="5" stroke-linecap="round"><path d="M50 30v40M33 40l34 20M33 60l34-20"/></g></svg>`,
};
const DEFS = `<svg class="fi-defs" width="0" height="0" aria-hidden="true"><defs><radialGradient id="fi-fb" cx="40%" cy="40%"><stop offset="0" stop-color="#fff6a8"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#e8401c"/></radialGradient><radialGradient id="fi-ib" cx="38%" cy="36%"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9fe2ff"/><stop offset="1" stop-color="#2f86d6"/></radialGradient><linearGradient id="fi-fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23a"/><stop offset="1" stop-color="#e5391b"/></linearGradient><linearGradient id="fi-is" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fbff"/><stop offset="1" stop-color="#3a9be8"/></linearGradient></defs></svg>`;
const RELOAD = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="#f3eeff"/><g fill="none" stroke="#6b55d6" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M76 50a26 26 0 1 1-8-19"/><path d="M72 18v15h-15"/></g><circle cx="40" cy="52" r="9" fill="url(#fi-fb)"/><circle cx="60" cy="52" r="9" fill="url(#fi-ib)"/></svg>`;
const picture = (action, element) =>
  action === "reload" ? RELOAD : (action === "ball" ? BALL : SHIELD)[element];
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
    whoosh: () => noise(0.14, 0.45, 400, 2400),
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
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Two little wizard critters in the snow: one throws a fire ball, the other holds up an ice shield" draggable="false"></span><strong>${TITLE}</strong><small>Pick fire or ice, then attack, reload or shield. The computer picks at the same time. First to five stars wins!</small>`;
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
  });
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
    const r = critters[side].getBoundingClientRect();
    const facing = side === 0 ? 1 : -1;
    const y = r.top - host.top + r.height * AIM;
    const mid = r.left - host.left + r.width / 2;
    const x =
      where === "hand"
        ? mid + facing * r.width * 0.42
        : where === "shield"
          ? mid + facing * r.width * 0.55
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

  const fly = (el, from, to, ms, arc = 0.12) =>
    el.animate(
      [
        { transform: "translate(0,0) rotate(0turn)" },
        {
          transform: `translate(${(to.x - from.x) / 2}px, ${(to.y - from.y) / 2 - from.size * arc}px) rotate(.5turn)`,
        },
        {
          transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) rotate(1turn)`,
        },
      ],
      { duration: ms, easing: "ease-in", fill: "forwards" },
    );

  function burst(at, element, big = 1) {
    const el = sprite("", `fi-burst fi-${element}`, at, 0.4 * big);
    el.addEventListener("animationend", () => el.remove());
    if (element === "fire") sfx.sizzle();
    else sfx.crack();
  }
  function puff(at) {
    const el = sprite("☁️", "fi-steam", at, 0.9);
    el.addEventListener("animationend", () => el.remove());
    sfx.steam();
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
      const el = sprite(
        SHIELD[m.element],
        `fi-shield fi-${m.element} fi-side-${side}`,
        spot(side, "shield"),
        0.4,
      );
      shields[side] = el;
      sfx.shield(m.element);
    });
    const FLY = 650;
    later(() => {
      if (result.outcome === "calm") {
        shields.forEach((s) => s?.classList.add("fi-shimmer"));
        later(finishRound, 900);
        return;
      }
      sfx.whoosh();
      if (result.outcome === "steam") {
        const balls = moves.map((m, side) => {
          const from = spot(side, "hand");
          const el = sprite(BALL[m.element], "fi-ball", from, 0.2);
          const host = stage.getBoundingClientRect();
          const meet = {
            x: host.width / 2,
            y: (spot(0).y + spot(1).y) / 2,
            size: from.size,
          };
          fly(el, from, meet, FLY * 0.8);
          return [el, meet];
        });
        later(() => {
          balls.forEach(([el]) => el.remove());
          puff(balls[0][1]);
          later(finishRound, 1100);
        }, FLY * 0.8);
        return;
      }
      const by = result.by;
      const ball = moves[by];
      const from = spot(by, "hand");
      const el = sprite(BALL[ball.element], "fi-ball", from, 0.2);
      if (result.outcome === "hit") {
        const to = spot(1 - by, "middle");
        fly(el, from, to, FLY);
        later(() => {
          el.remove();
          burst(to, ball.element);
          ouch(1 - by);
          later(() => award(by), 350);
          later(finishRound, 1300);
        }, FLY);
        return;
      }
      // Blocked: the ball stops at the shield.
      const at = spot(1 - by, "shield");
      fly(el, from, at, FLY * 0.85);
      later(() => {
        shields[1 - by]?.classList.add("fi-flash");
        el.remove();
        burst(at, ball.element, 0.8);
        later(finishRound, 1000);
      }, FLY * 0.85);
    }, 380);
  }

  function finishRound() {
    fx.replaceChildren();
    critters.forEach((c) => c.classList.remove("fi-ouch", "fi-cheer"));
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
    critters.forEach((c) =>
      c.classList.remove("fi-dance", "fi-ouch", "fi-cheer"),
    );
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
    critters.forEach((c) =>
      c.classList.remove("fi-dance", "fi-ouch", "fi-cheer"),
    );
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
