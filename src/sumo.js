import preview from "./assets/modes/sumo.jpg";
import {
  AVATARS,
  CHARACTERS,
  COLORS,
  avatarChoice,
} from "../shared/avatars.js";
import {
  createSumo,
  stepSumo,
  sumoStick,
  SUMO,
  SUMO_ACTIONS,
  SUMO_STATE as S,
} from "../shared/sumo.js";
import { menuPlayers } from "./avatarPicker.js";
import { gameResults } from "./gameResults.js";
import { PAD, padState } from "./padBridge.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createSumoScene } from "./sumoScene.js";
import "./sumo.css";

const title = "Sumo Wrestling";
const help =
  "Push opponents over the ring edge. Stick or WASD to move. Xbox: A Dash, B Grab / Counter, hold X to Brace, Y Dodge. Keyboard: Space Dash, E Grab / Counter, hold Q to Brace, R Dodge. Press Grab again when the counter prompt appears.";
const keys = {
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",
  Space: "dash",
  KeyE: "grab",
  KeyQ: "brace",
  KeyR: "dodge",
};
const buttons = { dash: "a", grab: "b", brace: "x", dodge: "y" };
const glyphs = {
  keys: { move: "WASD", dash: "Space", grab: "E", brace: "Q", dodge: "R" },
  pad: { move: "LS", dash: "A", grab: "B", brace: "X", dodge: "Y" },
  touch: { move: "", dash: "", grab: "", brace: "", dodge: "" },
};
const labels = { dash: "Dash", grab: "Grab", brace: "Brace", dodge: "Dodge" };
const using = {
  dash: [S.WINDUP, S.DASH],
  grab: [S.HOLD],
  brace: [S.PLANT, S.BRACE],
  dodge: [S.DODGE],
};
const diagonal = Math.SQRT1_2;
const world = (x, down) => ({
  x: (x + down) * diagonal,
  z: (down - x) * diagonal,
});
const pads = () =>
  new Map(
    Array.from(navigator.getGamepads?.() || [])
      .filter((pad) => pad?.connected)
      .map((pad) => [pad.index, pad]),
  );

export function installSumo(getAvatar, getMainPad, audio) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "sumo";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="Four critters pushing and shoving on a round sumo ring beside a waterfall" draggable="false"></span><strong>${title}</strong><small>Dash, grab and brace in a four-critter ring-out. Last one inside wins.</small>`;
  games.append(entry);
  entry.onclick = () => openSumo(getAvatar(), getMainPad, audio);
}

const makeSeats = (avatar) => {
  const guests = menuPlayers();
  const selected = [
    avatarChoice(avatar),
    ...guests.map((g) => g && avatarChoice(g)),
  ];
  const characters = AVATARS.filter(
    (id) => !selected.some((p) => p?.character === id),
  );
  const colors = Object.keys(COLORS).filter(
    (id) => !selected.some((p) => p?.color === id),
  );
  return Array.from({ length: SUMO.players }, (_, i) => ({
    id: i + 1,
    avatar: selected[i] || {
      character: characters[i * 3],
      color: colors.shift(),
    },
    preferredPad: i ? guests[i - 1]?.pad : undefined,
    pad: undefined,
    counter: i === 0 ? "GRAB" : "B",
  }));
};

/** Simple local opponent policy. Only the simulation decides whether an action connects. */
const computer = (match, p) => {
  const { clock, players } = match;
  if (p.state === S.CAUGHT)
    return {
      pressed: {
        grab:
          p.until - clock === 8 + p.index && (p.until + p.index * 7) % 5 < 2,
      },
    };
  const foe = players
    .filter((q) => q !== p && q.state !== S.OUT)
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    )[0];
  if (!foe) return {};
  const dx = foe.x - p.x,
    dz = foe.z - p.z;
  const distance = Math.hypot(dx, dz) || 1;
  const radius = Math.hypot(p.x, p.z);
  const inward = Math.max(0, (radius - 4.5) / 1.25);
  const orbit = distance < 2.6 ? (p.index % 2 ? 0.45 : -0.45) : 0;
  const x =
    dx / distance - (inward * p.x) / (radius || 1) + (orbit * dz) / distance;
  const z =
    dz / distance - (inward * p.z) / (radius || 1) - (orbit * dx) / distance;
  const scale = 1 / Math.max(1, Math.hypot(x, z));
  const aimed =
    (dx * Math.cos(p.facing) + dz * Math.sin(p.facing)) / distance > 0.92;
  const brace =
    foe.state === S.DASH || foe.state === S.WINDUP || p.state === S.BRACE;
  const free = p.state === S.FREE;
  return {
    x: x * scale,
    z: z * scale,
    brace,
    pressed: {
      brace: free && brace && distance < 2.6,
      dodge: free && radius > 5.5 && x * p.x + z * p.z < -1,
      grab:
        free &&
        aimed &&
        distance < SUMO.grab.range &&
        (clock + p.index * 13) % 38 < 10,
      dash:
        free &&
        aimed &&
        distance > 1.35 &&
        distance < 3.7 &&
        radius < 5.1 &&
        (clock + p.index * 19) % 56 < 10,
    },
  };
};

const sound = {
  dash: [185, 0.13],
  grab: [400, 0.09],
  counter: [760, 0.16],
  throw: [220, 0.16],
  dodge: [510, 0.08],
  clash: [120, 0.17],
  rebound: [150, 0.18],
  impact: [95, 0.16],
  out: [67, 0.28],
};

function openSumo(avatar, getMainPad, audio) {
  document.exitPointerLock?.();
  const seats = makeSeats(avatar);
  const dialog = document.createElement("dialog");
  dialog.className = "sumo-game";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `
    <canvas tabindex="-1" aria-label="Circular sumo ring"></canvas>
    <header class="sumo-hud">
      <div class="sumo-roster">${seats
        .map(
          ({ id, avatar: a }) => `
        <div class="sumo-seat" style="--seat:${COLORS[a.color]}" data-seat="${id}">
          <strong>P${id} · ${CHARACTERS[a.character].name}</strong><small></small>
        </div>`,
        )
        .join("")}</div>
      <button data-pause hidden>Pause</button>
    </header>
    <div class="sumo-tags" aria-hidden="true">${seats
      .map(({ avatar: a }) => `<span style="--seat:${COLORS[a.color]}"></span>`)
      .join("")}</div>
    <aside class="sumo-controls" aria-label="Your controls" hidden>
      <div class="sumo-controls-head" style="--seat:${COLORS[seats[0].avatar.color]}">P1 · <span data-controls-device></span></div>
      <div class="sumo-control" data-control="move"><span class="sumo-cap"></span><span class="sumo-control-name">Move</span></div>
      ${SUMO_ACTIONS.map(
        (action) => `
      <div class="sumo-control" data-control="${action}">
        <span class="sumo-cap"></span>
        <span class="sumo-control-name">${labels[action]}${action === "brace" ? " <small>hold</small>" : ""}</span>
        <span class="sumo-control-state"></span>
        <span class="sumo-control-bar"></span>
      </div>`,
      ).join("")}
    </aside>
    <div class="sumo-banner" role="status"></div>
    <section class="sumo-lobby">
      <div>
        <h2>${title}</h2>
        <p class="sumo-help">${help}</p>
        <p class="sumo-help">Each connected controller gets a seat. Open seats are filled by computer opponents.</p>
        <div class="sumo-lobby-actions"><button class="primary" data-start>START SUMO</button><button data-exit>Back to games</button></div>
      </div>
    </section>
    <div class="sumo-touch" hidden>
      <div class="sumo-stick" data-stick aria-label="Move"><span></span></div>
      <div class="sumo-touch-actions">
        <button data-action="dodge">Dodge</button><button data-action="brace">Brace</button>
        <button data-action="grab">Grab</button><button data-action="dash">Dash</button>
      </div>
    </div>
    ${pauseScreen(title, help)}
  `;

  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  const lobby = dialog.querySelector(".sumo-lobby");
  const banner = dialog.querySelector(".sumo-banner");
  const touch = dialog.querySelector(".sumo-touch");
  const tags = dialog.querySelector(".sumo-tags").children;
  const roster = seats.map(({ id }) =>
    dialog.querySelector(`[data-seat="${id}"]`),
  );
  const ids = seats.map(({ id }) => id);
  const controls = dialog.querySelector(".sumo-controls");
  const controlRows = Object.fromEntries(
    [...controls.querySelectorAll("[data-control]")].map((row) => [
      row.dataset.control,
      {
        row,
        cap: row.querySelector(".sumo-cap"),
        state: row.querySelector(".sumo-control-state"),
        last: {},
      },
    ]),
  );
  let device = "";
  let match = createSumo(ids);
  let mode = "lobby",
    finishedFor = 0,
    frame,
    previous,
    accumulator = 0,
    time = 0;
  let count = 0,
    lastSound = -1;
  const held = new Map(),
    touchActions = new Map();
  const localEdges = {};
  const padHistory = new Map(),
    padEdges = new Map();
  let stickPointer = null,
    stick = { x: 0, z: 0 };
  let scene;
  try {
    scene = createSumoScene(canvas, seats);
  } catch (error) {
    console.warn("Could not initialize Sumo Wrestling", error);
  }

  const assignControllers = (connected) => {
    const occupied = new Set(
      seats
        .slice(1)
        .map((seat) => seat.preferredPad)
        .filter((i) => i !== undefined),
    );
    const available = [...connected.keys()].filter((i) => !occupied.has(i));
    const primary = getMainPad();
    seats[0].pad = available.includes(primary) ? primary : available[0];
    const spare = available.filter((i) => i !== seats[0].pad);
    for (const seat of seats.slice(1))
      seat.pad = seat.preferredPad ?? spare.shift();
  };

  const clearInputs = () => {
    held.clear();
    touchActions.clear();
    stickPointer = null;
    stick = { x: 0, z: 0 };
    get("stick").style.removeProperty("--drag");
    for (const key of SUMO_ACTIONS) delete localEdges[key];
    padHistory.clear();
    padEdges.clear();
  };
  const down = (key) =>
    [...held.values(), ...touchActions.values()].includes(key);
  const press = (key) => {
    if (!down(key) && SUMO_ACTIONS.includes(key)) localEdges[key] = true;
  };
  const consume = (edges) => {
    const pressed = { ...edges };
    for (const key of SUMO_ACTIONS) delete edges[key];
    return pressed;
  };
  const resetClock = () => {
    previous = performance.now();
    accumulator = 0;
  };
  const setBanner = (text) => {
    if (banner.textContent !== text) banner.textContent = text;
  };
  const results = gameResults(
    dialog,
    title,
    () => begin(),
    () => dialog.close(),
  );
  const hasControl = () => mode === "match" && match.phase !== "finished";

  const begin = () => {
    if (!scene) return;
    audio.unlock();
    results.hide();
    clearInputs();
    assignControllers(pads());
    setDevice(seats[0].pad === undefined ? "keys" : "pad");
    match = createSumo(ids);
    mode = "match";
    count = 0;
    lastSound = -1;
    finishedFor = 0;
    lobby.hidden = true;
    get("pause").hidden = false;
    touch.hidden = false;
    setPauseScreen(dialog, false, canvas);
    resetClock();
  };

  const pause = () => {
    if (!hasControl()) return;
    mode = "paused";
    clearInputs();
    touch.hidden = true;
    setPauseScreen(dialog, true);
  };

  const resume = () => {
    if (mode !== "paused") return;
    mode = "match";
    touch.hidden = false;
    setPauseScreen(dialog, false, canvas);
    resetClock();
  };

  const poll = (connected) => {
    for (const seat of seats) {
      const pad = connected.get(seat.pad);
      if (!pad) {
        padHistory.delete(seat.pad);
        padEdges.delete(seat.pad);
        continue;
      }
      const now = padState(pad);
      const was = padHistory.get(seat.pad);
      padHistory.set(seat.pad, now);
      if (!was) continue;
      if (seat === seats[0] && Object.keys(now).some((k) => now[k] && !was[k]))
        setDevice("pad");
      if (now.menu && !was.menu) {
        pause();
        return;
      }
      if (match.phase !== "playing") continue;
      const edges = padEdges.get(seat.pad) || {};
      for (const key of SUMO_ACTIONS)
        if (now[buttons[key]] && !was[buttons[key]]) edges[key] = true;
      padEdges.set(seat.pad, edges);
    }
  };

  const playerInput = (connected, p, i) => {
    const seat = seats[i];
    if (i && seat.pad === undefined) return computer(match, p);
    const pad = connected.get(seat.pad);
    const edges = padEdges.get(seat.pad);
    const s = padHistory.get(seat.pad);
    const analog = pad
      ? sumoStick(pad.axes[0] || 0, pad.axes[1] || 0)
      : { x: 0, z: 0 };
    const button = (idx) => Number(!!pad?.buttons[idx]?.pressed);
    const k = (key) => Number(i === 0 && down(key));
    const x =
      analog.x +
      button(PAD.RIGHT) -
      button(PAD.LEFT) +
      k("right") -
      k("left") +
      (i ? 0 : stick.x);
    const z =
      analog.z +
      button(PAD.DOWN) -
      button(PAD.UP) +
      k("down") -
      k("up") +
      (i ? 0 : stick.z);
    const normal = Math.max(1, Math.hypot(x, z));
    return {
      ...world(x / normal, z / normal),
      brace: s?.x || !!k("brace"),
      pressed: {
        ...consume(edges || {}),
        ...(i === 0 ? consume(localEdges) : {}),
      },
    };
  };

  const playSounds = () => {
    if (match.events.includes("start")) audio.countdown(0);
    if (match.events.includes("finish")) audio.sparkle();
    const event = [
      "out",
      "counter",
      "rebound",
      "clash",
      "impact",
      "throw",
      "grab",
      "dash",
      "dodge",
    ].find((key) => match.events.includes(key));
    if (!event || time - lastSound < 0.075) return;
    lastSound = time;
    audio.tone(...sound[event], 0, 0.055);
  };

  const finish = () => {
    mode = "result";
    setBanner("");
    clearInputs();
    const first = match.placements.filter(({ place }) => place === 1);
    const winner = seats.find(({ id }) => id === first[0].id);
    results.show(
      first.length > 1 ? "Too close to call!" : `P${winner.id} wins!`,
      first.length > 1
        ? "The final wrestlers crossed the edge together."
        : `${CHARACTERS[winner.avatar.character].name} stayed in the ring.`,
      match.placements.map(({ id, place, points }) => [
        `#${place} · ${points} pts`,
        `PLAYER ${id}`,
      ]),
    );
  };

  const updateRoster = (connected) => {
    roster.forEach((card, i) => {
      const seat = seats[i],
        p = match.players[i];
      const out = p.state === S.OUT;
      card.classList.toggle("out", out);
      const disconnected = seat.pad !== undefined && !connected.has(seat.pad);
      const cpu = i > 0 && seat.pad === undefined;
      let text =
        seat.pad === undefined
          ? cpu
            ? "Computer"
            : "Keyboard / touch"
          : disconnected
            ? "Controller disconnected"
            : `Controller ${seat.pad + 1}`;
      if (out) text = "Ring out";
      else if (mode === "match" && !cpu && (!disconnected || i === 0))
        text = SUMO_ACTIONS.map((action) =>
          p.ready[action] > match.clock
            ? `${action} ${((p.ready[action] - match.clock) * SUMO.step).toFixed(1)}`
            : action,
        ).join(" · ");
      const status = card.querySelector("small");
      if (status.textContent !== text) status.textContent = text;
    });
  };
  function setDevice(next) {
    if (device === next) return;
    device = next;
    get("controls-device").textContent = {
      pad: "Xbox",
      keys: "Keyboard",
      touch: "Touch",
    }[next];
    controls.dataset.device = next;
    for (const [key, { cap }] of Object.entries(controlRows))
      cap.textContent = glyphs[next][key];
  }

  /** Mirror P1's cooldowns: a darkened row that refills, plus seconds left. */
  const updateControls = () => {
    controls.hidden = mode !== "match";
    if (controls.hidden) return;
    const p = match.players[0];
    controls.classList.toggle("out", p.state === S.OUT);
    for (const action of SUMO_ACTIONS) {
      const { row, state, last } = controlRows[action];
      const left = Math.max(0, p.ready[action] - match.clock) * SUMO.step;
      const counter = action === "grab" && p.state === S.CAUGHT;
      const status = counter
        ? "counter"
        : using[action].includes(p.state)
          ? "active"
          : left > 0
            ? "cooldown"
            : "ready";
      const text = {
        counter: "Counter!",
        active: "Active",
        cooldown: `${left.toFixed(1)}s`,
        ready: "Ready",
      }[status];
      const fraction = (left / SUMO[action].cooldown).toFixed(3);
      if (last.status !== status) row.dataset.status = last.status = status;
      if (last.text !== text) state.textContent = last.text = text;
      if (last.fraction !== fraction)
        row.style.setProperty("--cooldown", (last.fraction = fraction));
    }
  };

  const tick = (now) => {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    const connected = pads();
    if (mode === "lobby") assignControllers(connected);
    if (hasControl()) poll(connected);
    if (mode !== "paused") time += dt;
    if (mode === "match" && match.phase === "finished") {
      finishedFor += dt;
      if (finishedFor >= 1.25) finish();
    } else if (hasControl()) {
      accumulator += dt;
      while (accumulator >= SUMO.step) {
        stepSumo(
          match,
          match.players.map((p, i) => playerInput(connected, p, i)),
        );
        playSounds();
        accumulator -= SUMO.step;
        if (match.phase === "finished") {
          get("pause").hidden = true;
          touch.hidden = true;
          setBanner("");
          break;
        }
      }
      if (match.phase === "countdown") {
        const seconds = Math.ceil((match.start - match.clock) * SUMO.step);
        if (count !== seconds) {
          count = seconds;
          audio.countdown(seconds);
          setBanner(String(seconds));
        }
      } else if (match.phase === "playing")
        setBanner(match.clock - match.start < 40 ? "SUMO!" : "");
    }
    updateRoster(connected);
    updateControls();
    scene?.draw(match, time, mode === "paused" ? 0 : dt, finishedFor, tags);
    frame = requestAnimationFrame(tick);
  };

  dialog.padSeats = hasControl;
  dialog.padPlaying = hasControl;
  get("start").onclick = begin;
  get("exit").onclick = get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("pause-resume").onclick = resume;
  get("pause-restart").onclick = begin;
  bindDialogEscape(dialog, () => {
    if (hasControl()) pause();
    else if (mode === "paused") resume();
    else if (mode !== "match") dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    const key = keys[event.code];
    if (!hasControl() || !key) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    setDevice("keys");
    if (match.phase === "playing") press(key);
    held.set(event.code, key);
  });
  dialog.addEventListener("keyup", (event) => held.delete(event.code));

  const joy = get("stick");
  const moveStick = (event) => {
    const rect = joy.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const z = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    stick = sumoStick(x, z);
    joy.style.setProperty(
      "--drag",
      `translate(${stick.x * 30}px, ${stick.z * 30}px)`,
    );
  };
  touch.addEventListener("pointerdown", (event) => {
    if (!hasControl()) return;
    setDevice("touch");
    const button = event.target.closest("[data-action]");
    if (button) {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (match.phase === "playing") press(button.dataset.action);
      touchActions.set(event.pointerId, button.dataset.action);
    } else if (joy.contains(event.target) && stickPointer === null) {
      event.preventDefault();
      stickPointer = event.pointerId;
      joy.setPointerCapture(event.pointerId);
      moveStick(event);
    }
  });
  joy.addEventListener("pointermove", (event) => {
    if (event.pointerId === stickPointer) moveStick(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    touch.addEventListener(type, (event) => {
      touchActions.delete(event.pointerId);
      if (event.pointerId === stickPointer) {
        stickPointer = null;
        stick = { x: 0, z: 0 };
        joy.style.removeProperty("--drag");
      }
    });

  const resize = () => scene?.resize();
  window.addEventListener("resize", resize);
  window.addEventListener("blur", pause);
  dialog.addEventListener(
    "close",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", pause);
      scene?.dispose();
      dialog.remove();
      document.querySelector("#deploy")?.focus();
    },
    { once: true },
  );

  document.body.append(dialog);
  dialog.showModal();
  if (!scene) {
    lobby.querySelector(".sumo-help").textContent =
      "The 3D ring could not start. WebGL is unavailable.";
    get("start").disabled = true;
    get("exit").focus();
    return;
  }
  get("start").focus();
  resize();
  resetClock();
  frame = requestAnimationFrame(tick);
}
