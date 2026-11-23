import preview from "./assets/modes/fire-and-ice.svg";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { nearest } from "./padBridge.js";
import {
  WIN_SCORE,
  canThrow,
  computerMove,
  newDuel,
  playRound,
} from "../shared/fireIce.js";
import "./fireIce.css";

// Fire & Ice: a two-tap secret-pick duel against the computer. Pictures
// only: no words or voice during play, so a child who can't read can play.
// The rules are in shared/fireIce.js.

const TITLE = "Fire & Ice";
const HOW_TO =
  "Each round, tap a Fire Ball or Ice Ball to throw, or a Fire Shield or Ice Shield to block, then tap the head, body or legs. The computer picks at the same time. A ball that misses the shield's height is a hit. A shield at the right height blocks it, and if it's the opposite element (ice stops fire, fire stops ice) the ball bounces back for a point. Two balls make steam. After a throw you need a shield turn to recharge. First to five stars wins. Keys: 1–4 pick a move, 1–3 pick head, body or legs, arrows move between buttons, Esc goes back or pauses. Controller: stick or D-pad to move, A to pick, B to go back.";

// Each zone's band on the critter (fractions of its height, top to bottom)
// and where a ball aims inside it.
const ZONE = {
  head: { top: 0, bottom: 0.48, aim: 0.33 },
  body: { top: 0.48, bottom: 0.8, aim: 0.65 },
  legs: { top: 0.8, bottom: 1, aim: 0.9 },
};
const ZONE_ORDER = ["head", "body", "legs"];
const MOVE_ORDER = [
  { action: "ball", element: "fire" },
  { action: "ball", element: "ice" },
  { action: "shield", element: "fire" },
  { action: "shield", element: "ice" },
];

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
const picture = (move) =>
  (move.action === "ball" ? BALL : SHIELD)[move.element];
const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>`;
const PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>`;
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
    whoosh: () => noise(0.14, 0.45, 400, 2400),
    sizzle: () => noise(0.18, 0.45, 2500, 900, 0, "highpass"),
    crack: () => {
      noise(0.2, 0.12, 4000, 2000);
      tone(1800, 0, 0.1, "square", 0.03, 900);
    },
    steam: () => noise(0.16, 1, 5000, 1800, 0, "highpass"),
    bonk: () => tone(320, 0, 0.3, "triangle", 0.14, 140),
    boing: () => tone(260, 0, 0.35, "sine", 0.1, 700),
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

export function installFireIce() {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "fireice";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Two little wizard critters in the snow: one throws a fire ball, the other holds up an ice shield" draggable="false"></span><strong>${TITLE}</strong><small>Throw fire balls and ice balls, or block with a fire or ice shield. Pick head, body or legs. The computer picks at the same time. First to five stars wins!</small>`;
  games.append(entry);
  entry.onclick = () => open();
}

function open() {
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
      <div class="fi-zones" data-zones hidden></div>
    </div>
    <div class="fi-hud">
      <div class="fi-score fi-score-you" data-score="0" aria-label="Your stars">${stars(0)}</div>
      <button type="button" class="fi-round-btn" data-pause aria-label="Pause">${PAUSE}</button>
      <div class="fi-score fi-score-cpu" data-score="1" aria-label="Computer's stars">${stars(1)}</div>
    </div>
    <div class="fi-bar" data-bar hidden>
      ${MOVE_ORDER.map(
        (m, i) =>
          `<button type="button" class="fi-move fi-${m.action} fi-${m.element}" data-move="${i}" aria-label="${m.element === "fire" ? "Fire" : "Ice"} ${m.action === "ball" ? "Ball" : "Shield"} (${i + 1})">${picture(m)}<span class="fi-lock">${RECHARGE}</span></button>`,
      ).join("")}
    </div>
    <div class="fi-bar fi-bar-back" data-backbar hidden>
      <button type="button" class="fi-round-btn fi-back" data-back aria-label="Pick a different move">${BACK}</button>
    </div>
    <section class="fi-intro" data-intro>
      <h2>${TITLE}</h2>
      <div class="fi-rules" aria-hidden="true">
        <div class="fi-rule"><i class="fi-ico">${BALL.fire}</i><b>➜</b><i class="fi-ico fi-mini">${critter(1)}</i><b>=</b><i class="fi-ico fi-gold">${STAR}</i></div>
        <div class="fi-rule"><i class="fi-ico">${BALL.fire}</i><b>➜</b><i class="fi-ico">${SHIELD.fire}</i><b>=</b><i class="fi-ico fi-poof">✋</i></div>
        <div class="fi-rule"><i class="fi-ico">${BALL.fire}</i><b>➜</b><i class="fi-ico">${SHIELD.ice}</i><b>=</b><i class="fi-ico fi-bounce">${BACK}</i><i class="fi-ico fi-gold">${STAR}</i></div>
        <div class="fi-rule"><i class="fi-ico">${BALL.fire}</i><b>➜</b><b>⬅</b><i class="fi-ico">${BALL.ice}</i><b>=</b><i class="fi-ico fi-poof">☁️</i></div>
      </div>
      <button type="button" class="fi-play" data-begin aria-label="Play">${PLAY}</button>
      <details class="fi-grownups"><summary>For grown-ups</summary><p>${HOW_TO}</p></details>
      <button type="button" class="fi-exit" data-exit aria-label="Back to games">${BACK}</button>
    </section>
    ${pauseScreen(TITLE, HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const stage = dialog.querySelector(".fi-stage");
  const fx = get("fx");
  const zonesEl = get("zones");
  const critters = [0, 1].map((i) => get(`critter="${i}"`));
  const moveButtons = [...dialog.querySelectorAll("[data-move]")];
  const sfx = sounds();
  const timers = new Set();

  // ready | move | zone | resolving | done | paused
  let phase = "ready";
  let resumeTo = "move";
  let duel = newDuel();
  let picked = null; // chosen move while picking its zone
  let generation = 0;

  // The pad bridge moves focus between buttons and A presses them, so the
  // game never takes the stick directly.
  dialog.padPlaying = () => false;

  const later = (fn, ms) => {
    const id = generation;
    const t = setTimeout(() => {
      timers.delete(t);
      if (id === generation && phase !== "paused") fn();
      else if (id === generation) pending.push(fn);
    }, ms);
    timers.add(t);
  };
  // Steps due while paused run on resume.
  let pending = [];
  const clearTimers = () => {
    generation++;
    timers.forEach(clearTimeout);
    timers.clear();
    pending = [];
  };

  function hud() {
    for (const side of [0, 1]) {
      get(`score="${side}"`)
        .querySelectorAll(".fi-star")
        .forEach((s, i) => s.classList.toggle("on", i < duel.score[side]));
      critters[side].querySelector(".fi-recharge").hidden =
        !duel.recharging[side] || duel.winner !== null;
    }
    const ready = canThrow(duel, 0);
    moveButtons.forEach((b, i) => {
      const locked = MOVE_ORDER[i].action === "ball" && !ready;
      b.disabled = locked;
      b.classList.toggle("locked", locked);
    });
  }

  function showMoves() {
    phase = "move";
    picked = null;
    zonesEl.hidden = true;
    zonesEl.replaceChildren();
    get("backbar").hidden = true;
    get("bar").hidden = false;
    critters.forEach((c) => c.classList.remove("fi-target"));
    hud();
    const first = moveButtons.find((b) => !b.disabled);
    first.focus({ preventScroll: true });
  }

  // Three glowing bands over the critter the move is aimed at: the computer
  // for a ball, yourself for a shield.
  function pickMove(index) {
    if (phase !== "move") return;
    const move = MOVE_ORDER[index];
    if (!move || (move.action === "ball" && !canThrow(duel, 0))) return;
    sfx.resume();
    sfx.tap();
    picked = move;
    phase = "zone";
    const target = move.action === "ball" ? 1 : 0;
    critters[target].classList.add("fi-target");
    const box = critters[target].getBoundingClientRect();
    const host = stage.getBoundingClientRect();
    zonesEl.style.left = `${box.left - host.left}px`;
    zonesEl.style.top = `${box.top - host.top}px`;
    zonesEl.style.width = `${box.width}px`;
    zonesEl.style.height = `${box.height}px`;
    zonesEl.replaceChildren(
      ...ZONE_ORDER.map((zone, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `fi-zone fi-zone-${zone} fi-${move.element}`;
        b.dataset.zone = zone;
        b.setAttribute("aria-label", `${zone} (${i + 1})`);
        b.style.top = `${ZONE[zone].top * 100}%`;
        b.style.height = `${(ZONE[zone].bottom - ZONE[zone].top) * 100}%`;
        b.innerHTML = `<span>${picture(move)}</span>`;
        b.onclick = () => pickZone(zone);
        return b;
      }),
    );
    zonesEl.hidden = false;
    get("bar").hidden = true;
    get("backbar").hidden = false;
    zonesEl.querySelector(".fi-zone-body").focus({ preventScroll: true });
  }

  function backToMoves() {
    if (phase !== "zone") return;
    sfx.tap();
    showMoves();
  }

  // Where things happen on screen, in stage pixels.
  function spot(side, zone, where) {
    const host = stage.getBoundingClientRect();
    const r = critters[side].getBoundingClientRect();
    const facing = side === 0 ? 1 : -1;
    const y = r.top - host.top + r.height * ZONE[zone].aim;
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

  function pickZone(zone) {
    if (phase !== "zone") return;
    const mine = { ...picked, zone };
    const theirs = computerMove(duel, 1);
    const result = playRound(duel, mine, theirs);
    phase = "resolving";
    zonesEl.hidden = true;
    zonesEl.replaceChildren();
    get("backbar").hidden = true;
    critters.forEach((c) => c.classList.remove("fi-target"));
    // Keep focus inside the dialog so the controller still has somewhere
    // to start; the pause button is the only control left during the show.
    get("pause").focus({ preventScroll: true });
    hud();
    // Stars and recharge marks update as the show plays.
    get('score="0"')
      .querySelectorAll(".fi-star")
      .forEach((s, i) =>
        s.classList.toggle("on", i < duel.score[0] - result.points[0]),
      );
    get('score="1"')
      .querySelectorAll(".fi-star")
      .forEach((s, i) =>
        s.classList.toggle("on", i < duel.score[1] - result.points[1]),
      );
    show([mine, theirs], result);
  }

  // Play out the round: shields pop up, balls fly, then the outcome.
  function show(moves, result) {
    const shields = [];
    moves.forEach((m, side) => {
      if (m.action !== "shield") return;
      const el = sprite(
        SHIELD[m.element],
        `fi-shield fi-${m.element} fi-side-${side}`,
        spot(side, m.zone, "shield"),
        0.36,
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
          const from = spot(side, m.zone, "hand");
          const el = sprite(BALL[m.element], "fi-ball", from, 0.2);
          const host = stage.getBoundingClientRect();
          const meet = {
            x: host.width / 2,
            y: (spot(0, moves[0].zone).y + spot(1, moves[1].zone).y) / 2,
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
      const shield = moves[1 - by];
      const from = spot(by, ball.zone, "hand");
      const el = sprite(BALL[ball.element], "fi-ball", from, 0.2);
      if (result.outcome === "hit") {
        const to = spot(1 - by, ball.zone, "middle");
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
      // Blocked or bounced: the ball stops at the shield.
      const at = spot(1 - by, shield.zone, "shield");
      fly(el, from, at, FLY * 0.85);
      later(() => {
        shields[1 - by]?.classList.add("fi-flash");
        if (result.outcome === "blocked") {
          el.remove();
          burst(at, ball.element, 0.8);
          later(finishRound, 1000);
          return;
        }
        sfx.boing();
        const back = spot(by, ball.zone, "middle");
        el.getAnimations().forEach((a) => a.cancel());
        el.style.left = `${at.x - from.size * 0.1}px`;
        el.style.top = `${at.y - from.size * 0.1}px`;
        fly(el, at, back, FLY * 0.85, 0.2);
        later(() => {
          el.remove();
          burst(back, ball.element);
          ouch(by);
          later(() => award(1 - by), 350);
          later(finishRound, 1300);
        }, FLY * 0.85);
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

  function start() {
    clearTimers();
    results.hide();
    fx.replaceChildren();
    critters.forEach((c) =>
      c.classList.remove("fi-dance", "fi-ouch", "fi-cheer", "fi-target"),
    );
    duel = newDuel();
    get("intro").hidden = true;
    sfx.resume();
    setPauseScreen(dialog, false);
    showMoves();
  }

  function pause() {
    if (!["move", "zone", "resolving"].includes(phase)) return;
    resumeTo = phase;
    phase = "paused";
    dialog.getAnimations({ subtree: true }).forEach((a) => a.pause());
    setPauseScreen(dialog, true);
  }
  function resume() {
    if (phase !== "paused") return;
    phase = resumeTo;
    setPauseScreen(dialog, false);
    dialog.getAnimations({ subtree: true }).forEach((a) => a.play());
    const due = pending;
    pending = [];
    due.forEach((fn) => fn());
    if (phase === "move") showMoves();
    else if (phase === "zone")
      (zonesEl.querySelector(".fi-zone-body") || get("back")).focus({
        preventScroll: true,
      });
    else get("pause").focus({ preventScroll: true });
  }

  const close = () => dialog.close();
  const results = gameResults(dialog, TITLE, start, close);
  moveButtons.forEach((b, i) => (b.onclick = () => pickMove(i)));
  get("back").onclick = backToMoves;
  get("begin").onclick = start;
  get("exit").onclick = close;
  get("pause").onclick = pause;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = start;
  get("pause-home").onclick = close;
  bindDialogEscape(dialog, () => {
    if (phase === "paused") resume();
    else if (phase === "zone") backToMoves();
    else if (phase === "move" || phase === "resolving") pause();
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
    if (phase === "move" && n >= 1 && n <= 4) {
      event.preventDefault();
      pickMove(n - 1);
    } else if (phase === "zone" && n >= 1 && n <= 3) {
      event.preventDefault();
      pickZone(ZONE_ORDER[n - 1]);
    }
  });
  dialog.addEventListener("keyup", (event) => event.stopPropagation());

  const blur = () => pause();
  const visibility = () => document.hidden && pause();
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  // A resize moves the critters: re-place the zone bands.
  const resize = () => {
    if (phase === "zone" && picked) {
      const move = MOVE_ORDER.findIndex(
        (m) => m.action === picked.action && m.element === picked.element,
      );
      phase = "move";
      pickMove(move);
    }
  };
  window.addEventListener("resize", resize);
  dialog.addEventListener("close", () => {
    clearTimers();
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibility);
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  dialog.showModal();
  hud();
  get("begin").focus({ preventScroll: true });
}
