import * as T from "three";
import {
  AVATARS as ALL_AVATARS,
  CHARACTERS,
  COLORS,
  avatarChoice,
} from "../shared/avatars.js";
import { animateAvatar, createAvatar, disposeAvatar } from "./avatars.js";
import { DANCE_SECONDS, danceAvatar } from "./dances.js";
import { headshot } from "./headshots.js";
import { padState } from "./padBridge.js";

// Step 3 is a grid of every character's portrait in three rows, with a
// coloured chip for each player on the one they picked. P1 is the keyboard,
// mouse, touch and first controller (the menu's own selection). Any other
// controller joins as P2–P4 with A, moves its chip with the stick or D-pad,
// changes colour with X and leaves with B.
// The picker lists the characters alphabetically by name.
const AVATARS = [...ALL_AVATARS].sort((a, b) =>
  CHARACTERS[a].name.localeCompare(CHARACTERS[b].name),
);
const COLUMNS = Math.ceil(AVATARS.length / 3);
export const PLAYER_COLORS = ["#ff5f5f", "#4aa8ff", "#ffd23f", "#4cd07f"];
// P2–P4: { pad, character, color } or null.
const guests = [null, null, null];
/** The extra controller players picked on the menu, by slot (P2, P3, P4). */
export const menuPlayers = () => guests.map((g) => g && { ...g });

export function installAvatarPicker(mainPad = () => null) {
  let choice;
  try {
    choice = avatarChoice(JSON.parse(localStorage.getItem("avatar")));
  } catch {
    choice = avatarChoice();
  }
  const rows = [];
  for (let i = 0; i < AVATARS.length; i += COLUMNS)
    rows.push(
      `<div class="headshot-row" style="--columns:${COLUMNS}" data-nav-row data-nav-choice data-nav-grid role="group" aria-label="Your character">${AVATARS.slice(
        i,
        i + COLUMNS,
      )
        .map(
          (id) =>
            `<button type="button" class="headshot" data-character="${id}" aria-label="${CHARACTERS[id].name}" title="${CHARACTERS[id].name}" aria-pressed="false"><img alt=""><span class="chips"></span></button>`,
        )
        .join("")}</div>`,
    );
  const step = document.createElement("div");
  step.className = "menu-step character-step";
  step.innerHTML = `<div class="step-label"><b>03</b> YOUR CHARACTER</div><div class="headshots">${rows.join("")}</div><div class="player-cards" aria-live="polite"></div>`;
  document.querySelector("#home .menu-go").before(step);
  const panel = document.createElement("aside");
  panel.className = "avatar-picker";
  panel.innerHTML = `<div class="avatar-stage" role="img" aria-label="Selected character preview"></div><div class="avatar-carousel" data-nav-row aria-label="Character"><button type="button" data-character-step="-1" aria-label="Previous character">&#8592;</button><h2 class="avatar-name" aria-live="polite"></h2><button type="button" data-character-step="1" aria-label="Next character">&#8594;</button></div><div class="avatar-colors" data-nav-row aria-label="Character color">${Object.entries(
    COLORS,
  )
    .map(
      ([name, color]) =>
        `<button type="button" data-color="${name}" style="--swatch:${color}" aria-label="${name}"></button>`,
    )
    .join("")}</div>`;
  document.querySelector("#home").append(panel);
  const headshotRow = step.querySelector(".headshots");
  const portraits = new Map();
  headshotRow.querySelectorAll("[data-character]").forEach((button) =>
    headshot(button.dataset.character).then((url) => {
      portraits.set(button.dataset.character, url);
      if (url) button.querySelector("img").src = url;
      else
        button.prepend(CHARACTERS[button.dataset.character].name[0]);
      drawPlayers();
    }),
  );
  headshotRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-character]");
    if (!button || button.dataset.character === choice.character) return;
    choice.character = button.dataset.character;
    update();
  });

  // The chips on the portraits and a card per player under the grid.
  const cards = step.querySelector(".player-cards");
  let spare = 0; // connected controllers that could join
  let drawn = "";
  function drawPlayers() {
    const players = [choice, ...guests];
    const key = JSON.stringify([players, spare, [...portraits.keys()]]);
    if (key === drawn) return;
    drawn = key;
    headshotRow.querySelectorAll(".chips").forEach((el) => (el.innerHTML = ""));
    players.forEach((p, i) => {
      if (!p) return;
      headshotRow
        .querySelector(`[data-character="${p.character}"] .chips`)
        ?.insertAdjacentHTML(
          "beforeend",
          `<i class="chip" data-slot="${i}" style="--player:${PLAYER_COLORS[i]}">P${i + 1}</i>`,
        );
    });
    // P2–P4 cards appear once there's a second controller (or a guest).
    const open = guests.filter((g) => !g).length;
    const shown = guests.some(Boolean) || spare > 0;
    cards.hidden = !shown;
    if (!shown) return;
    cards.innerHTML = players
      .map((p, i) => {
        const tag = `<b style="--player:${PLAYER_COLORS[i]}">P${i + 1}</b>`;
        if (!p)
          return `<div class="player-card empty">${tag}<span>${spare > 0 && open ? "🎮 Press A" : "—"}</span></div>`;
        const url = portraits.get(p.character);
        return `<div class="player-card" style="--player:${PLAYER_COLORS[i]};--swatch:${COLORS[p.color]}">${tag}${url ? `<img src="${url}" alt="">` : ""}<span>${CHARACTERS[p.character].name}</span><i class="swatch"></i></div>`;
      })
      .join("");
  }

  // Controllers other than P1's: join, move, recolour, leave.
  const padWas = new Map(); // gamepad index -> last frame's padState
  const held = new Map(); // gamepad index -> { dir, wait }
  function moveGuest(guest, dir) {
    const n = AVATARS.length,
      rowCount = Math.ceil(n / COLUMNS);
    let i = AVATARS.indexOf(guest.character);
    if (dir === "left") i = (i - 1 + n) % n;
    else if (dir === "right") i = (i + 1) % n;
    else {
      // Same column in the row above or below (the last row may be short).
      const col = i % COLUMNS;
      let row = Math.floor(i / COLUMNS) + (dir === "down" ? 1 : -1);
      row = (row + rowCount) % rowCount;
      i = Math.min(row * COLUMNS + col, n - 1);
    }
    guest.character = AVATARS[i];
  }
  function joinGuest(pad) {
    const slot = guests.indexOf(null);
    if (slot < 0) return;
    const players = [choice, ...guests].filter(Boolean);
    const free = (list, key) =>
      list.find((x) => !players.some((p) => p[key] === x)) || list[0];
    // Start each newcomer a few portraits along, on a colour nobody has.
    const start = AVATARS.indexOf(choice.character) + 1 + slot * 3;
    const order = AVATARS.map((_, i) => AVATARS[(start + i) % AVATARS.length]);
    guests[slot] = {
      pad,
      character: free(order, "character"),
      color: free(Object.keys(COLORS), "color"),
    };
  }
  function pollGuests(dt) {
    const home = document.querySelector("#home");
    const pads = [...(navigator.getGamepads?.() || [])].filter(
      (p) => p?.connected,
    );
    const main = mainPad();
    // Unplugged controllers (or the one that became P1's) leave.
    guests.forEach((g, slot) => {
      if (g && (g.pad === main || !pads.some((p) => p.index === g.pad)))
        guests[slot] = null;
    });
    const others = pads.filter((p) => p.index !== main);
    spare = others.filter((p) => !guests.some((g) => g?.pad === p.index))
      .length;
    const listening =
      home.dataset.screen === "character" &&
      !document.querySelector("dialog[open]") &&
      document.hasFocus() &&
      !document.hidden;
    if (!listening) {
      padWas.clear();
      held.clear();
      drawPlayers();
      return;
    }
    for (const pad of others) {
      const now = padState(pad),
        was = padWas.get(pad.index);
      padWas.set(pad.index, now);
      // A controller first seen holding a button doesn't count as a press.
      if (!was) continue;
      const pressed = (k) => now[k] && !was[k];
      const slot = guests.findIndex((g) => g?.pad === pad.index);
      const guest = guests[slot];
      if (!guest) {
        if (pressed("a")) joinGuest(pad.index);
        continue;
      }
      if (pressed("b")) {
        guests[slot] = null;
        continue;
      }
      if (pressed("pump")) {
        const names = Object.keys(COLORS);
        guest.color =
          names[(names.indexOf(guest.color) + 1) % names.length];
      }
      if (pressed("menu")) document.querySelector("#deploy")?.click();
      // Stick or D-pad: one step, then repeat while held.
      const dir = ["up", "down", "left", "right"].find((d) => now[d]);
      const h = held.get(pad.index);
      if (!dir) held.delete(pad.index);
      else if (h?.dir !== dir) {
        held.set(pad.index, { dir, wait: 0.4 });
        moveGuest(guest, dir);
      } else if ((h.wait -= dt) <= 0) {
        h.wait = 0.14;
        moveGuest(guest, dir);
      }
    }
    drawPlayers();
  }

  const stage = panel.querySelector(".avatar-stage");
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  stage.append(renderer.domElement);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(33, 1, 0.1, 30);
  // Fit the entire animated silhouette, including hats, hands and feet:
  // for a dance, everywhere it reaches over a whole loop, so the camera
  // holds still while it dances.
  const previewBounds = new T.Box3();
  const danceBounds = new T.Box3();
  let danceTime = 0;
  let framedFor = null;
  const previewCenter = new T.Vector3();
  const viewDirection = new T.Vector3(0.32, 0.05, -1).normalize();
  const corner = new T.Vector3();
  const viewRotation = new T.Quaternion();
  function measure(bounds) {
    actor.updateMatrixWorld(true);
    return bounds.setFromObject(actor, true);
  }
  function frameCharacter(bounds) {
    bounds.getCenter(previewCenter);
    camera.position.copy(previewCenter).add(viewDirection);
    camera.lookAt(previewCenter);
    viewRotation.copy(camera.quaternion).invert();
    const vertical = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const horizontal = vertical * camera.aspect;
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      corner
        .set(
          i & 1 ? bounds.max.x : bounds.min.x,
          i & 2 ? bounds.max.y : bounds.min.y,
          i & 4 ? bounds.max.z : bounds.min.z,
        )
        .sub(previewCenter)
        .applyQuaternion(viewRotation);
      distance = Math.max(
        distance,
        corner.z + Math.abs(corner.x) / horizontal,
        corner.z + Math.abs(corner.y) / vertical,
      );
    }
    camera.position
      .copy(previewCenter)
      .addScaledVector(viewDirection, distance * 1.1);
    camera.lookAt(previewCenter);
  }
  scene.add(new T.HemisphereLight(0xffffff, 0x607b63, 3));
  const light = new T.DirectionalLight(0xffe9c4, 4);
  light.position.set(-3, 5, -4);
  scene.add(light);
  let actor;

  function update() {
    if (actor) {
      scene.remove(actor);
      disposeAvatar(actor);
    }
    actor = createAvatar("attacker", choice);
    danceTime = 0;
    scene.add(actor);
    panel.querySelector(".avatar-name").textContent =
      CHARACTERS[choice.character].name;
    stage.setAttribute(
      "aria-label",
      `${choice.color} ${choice.character} preview`,
    );
    headshotRow
      .querySelectorAll("[data-character]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          b.dataset.character === choice.character,
        ),
      );
    panel
      .querySelectorAll("[data-color]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", b.dataset.color === choice.color),
      );
    try {
      localStorage.setItem("avatar", JSON.stringify(choice));
    } catch {}
    drawPlayers();
    document.dispatchEvent(new CustomEvent("avatarchange"));
  }
  function cycleCharacter(direction) {
    const index = AVATARS.indexOf(choice.character);
    choice.character =
      AVATARS[(index + direction + AVATARS.length) % AVATARS.length];
    update();
  }
  panel.querySelectorAll("[data-character-step]").forEach((button) => {
    // Share the menu's keyboard and controller left/right navigation.
    button.cycle = cycleCharacter;
  });
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.dataset.character) return;
    if (button.dataset.characterStep) {
      cycleCharacter(Number(button.dataset.characterStep));
      return;
    }
    if (button.dataset.color) choice.color = button.dataset.color;
    update();
  });
  new ResizeObserver(() => {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(stage);
  update();
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (document.querySelector("#home").hidden) {
      padWas.clear();
      return;
    }
    pollGuests(dt);
    // On this screen each character does its own dance instead of walking.
    danceTime += dt;
    if (danceAvatar(actor, choice.character, danceTime)) {
      if (framedFor !== actor) {
        danceBounds.makeEmpty();
        for (let i = 0; i < 32; i++) {
          danceAvatar(actor, choice.character, (i / 32) * DANCE_SECONDS);
          danceBounds.union(measure(previewBounds));
        }
        danceAvatar(actor, choice.character, danceTime);
        framedFor = actor;
      }
      frameCharacter(danceBounds);
    } else {
      // Still loading: the stand-in figure idles.
      animateAvatar(actor, { moveSpeed: 0 }, dt);
      frameCharacter(measure(previewBounds));
    }
    stage.setAttribute(
      "aria-label",
      `${choice.color} ${choice.character} preview: dancing`,
    );
    renderer.render(scene, camera);
  });
  return () => ({ ...choice });
}
