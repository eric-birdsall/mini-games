import { createPatrolBall } from "./animalPatrolBall.js";
import forest from "./assets/modes/animal-patrol-forest.svg";
import { patrolPortrait } from "./animalPatrolModels.js";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import {
  BALLS,
  BREAKOUT,
  CAPTURE,
  FLIGHT,
  LAUNCH,
  SCENES,
  coverAt,
  createPatrol,
  stepPatrol,
  throwBall,
} from "../shared/animalPatrol.js";
import "./animalPatrol.css";

const TITLE = "Animal Patrol";
const HOW_TO =
  "Click or tap a critter to throw a capture ball, or swipe from the ball to the critter and release. With keyboard or Xbox, aim with WASD, the arrows, or the left stick, then throw with Space, A, or RT. Choose a ball with the buttons, keys 1–4, or cycle with R or Xbox X / LT. Special balls carry across scenes and are spent on every throw. Catch every critter to advance. If one hides behind a rock or tree, wait for it to come out.";
const messages = {
  ready: "Catch every critter!",
  flying: "Ball in the air…",
  miss: "It got away! Try another throw.",
  capturing: "Hold steady…",
  caught: "Critter caught!",
  escaped: "It broke free! Try another throw.",
  blocked: "That hit cover. Wait for the critter to come out.",
};
const aimKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
]);

export function installAnimalPatrol() {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "animalpatrol";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb ap-thumb"><img src="${forest}" alt="" draggable="false"></span><strong>${TITLE}</strong><small>Catch Pokémon in six scenes. Wait for them to come out from behind cover.</small>`;
  games.append(entry);
  patrolPortrait(SCENES[0].critters[0][0]).then((url) => {
    if (url) entry.querySelector(".map-thumb").append(critterImage(url, ""));
  });
  entry.onclick = open;
}

function critterImage(url, name) {
  const image = new Image();
  image.src = url;
  image.alt = name;
  image.draggable = false;
  return image;
}

function open() {
  document.exitPointerLock?.();
  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "animal-patrol";
  dialog.setAttribute("aria-label", TITLE);
  dialog.innerHTML = `
    <div class="ap-field" tabindex="0" aria-label="Aim with arrows and throw with Space." style="--ap-forest: url('${forest}')">
      <div class="ap-actors"></div>
      <div class="ap-ring" hidden></div>
      <div class="ap-ball ap-launcher"></div>
      <div class="ap-ball ap-projectile" hidden></div>
      <div class="ap-reticle" hidden></div>
    </div>
    <header class="ap-hud">
      <div class="ap-ident"><span data-scene-label></span><strong>${TITLE}</strong></div>
      <div class="ap-count"><strong data-caught></strong> CAUGHT · <strong data-throws>0</strong> THROWS</div>
      <button type="button" data-pause aria-label="Pause">Ⅱ</button>
    </header>
    <footer class="ap-guide"><strong data-status role="status"></strong><small class="ap-pointer-hint">Click / tap to throw · Space / A to throw · R / X to switch balls</small><small class="ap-touch-hint">Swipe from the ball to a critter, or tap the critter</small></footer>
    <div class="ap-supply" role="group" aria-label="Capture balls">
      ${BALLS.map(({ id, name }, index) => `<button type="button" data-ball="${id}" aria-pressed="false" title="${index + 1}. ${name}"><span class="ap-ball-icon" aria-hidden="true"></span><strong></strong><span class="ap-ball-name">${name}</span></button>`).join("")}
    </div>
    ${pauseScreen(TITLE, HOW_TO)}`;

  const q = (selector) => dialog.querySelector(selector);
  const field = q(".ap-field");
  const actors = q(".ap-actors");
  const caught = q("[data-caught]");
  const ball = q(".ap-projectile");
  const launcher = q(".ap-launcher");
  let ballModel;
  try {
    ballModel = createPatrolBall();
    dialog.classList.add("ap-model-balls");
  } catch {
    // Keep the CSS ball on browsers without WebGL.
  }
  const reticle = q(".ap-reticle");
  const ring = q(".ap-ring");
  const status = q("[data-status]");
  const throws = q("[data-throws]");
  const held = new Set();
  const picker = q(".ap-supply");
  const ballButtons = [...picker.querySelectorAll("button")];
  ballButtons.forEach((button) => {
    if (ballModel) {
      button
        .querySelector(".ap-ball-icon")
        .append(ballModel.preview(button.dataset.ball));
    }
    button.onclick = () => {
      selectBall(button.dataset.ball);
      field.focus({ preventScroll: true });
    };
  });
  const results = gameResults(dialog, TITLE, restart, close);
  const resultAction = q(".game-results .primary");
  const resultActionLabel = resultAction.firstChild;
  let sceneIndex = 0;
  let critterElements = [];
  let patrol;
  let aim;
  let phase;
  let touch;
  let frame;
  let previousTime;

  function close() {
    ballModel?.dispose();
    cancelAnimationFrame(frame);
    dialog.close();
    dialog.remove();
    previousFocus?.focus({ preventScroll: true });
  }

  function position(element, x, y) {
    element.style.left = `${x * 100}%`;
    element.style.top = `${y * 100}%`;
  }

  function selectBall(id) {
    if (phase !== "playing" || !patrol.supply[id]) return;
    patrol.selected = id;
    renderSupply();
  }

  function renderSupply() {
    launcher.dataset.ball = patrol.selected;
    for (const button of ballButtons) {
      const { ball: id } = button.dataset;
      const stock = patrol.supply[id];
      button.setAttribute("aria-pressed", String(id === patrol.selected));
      button.disabled = !stock;
      button.querySelector("strong").textContent =
        stock === Infinity ? "∞" : stock;
    }
  }

  function render() {
    const { capture, shot, time } = patrol;
    const elapsed = capture ? time - capture.start : 0;
    const t = Math.min(1, elapsed / CAPTURE);
    const breakout = capture?.escapes && elapsed >= CAPTURE;
    const pop = breakout ? Math.min(1, (elapsed - CAPTURE) / BREAKOUT) : 0;
    for (const [index, critter] of patrol.critters.entries()) {
      const element = critterElements[index];
      position(element, critter.x, critter.y);
      element.style.visibility =
        critter.caught || coverAt(patrol, critter.x, critter.y) ? "hidden" : "";
      const active = capture?.critter === critter;
      const size = active
        ? breakout
          ? Math.min(1, pop * 3)
          : Math.max(0, 1 - t * 3.5)
        : 1;
      const bounce =
        active && breakout
          ? Math.sin(pop * Math.PI) * 22
          : critter.move && !capture
            ? Math.abs(Math.sin((time - critter.move.start) * 23)) * 5
            : 0;
      element.style.transform = `translate(-50%, calc(-50% - ${bounce}px)) scale(${size * critter.facing}, ${size})`;
    }
    reticle.hidden = !aim.visible || !!capture;
    position(reticle, aim.x, aim.y);
    // Keep the swipe start above the picker on short landscape screens.
    const launchY = Math.min(
      LAUNCH.y,
      (picker.offsetTop - 24) / field.clientHeight,
    );
    position(launcher, LAUNCH.x, launchY);
    launcher.hidden = !!shot || !!capture;
    ball.hidden = (!shot && !capture) || breakout;
    if (shot || capture) ball.dataset.ball = (shot || capture).type.id;
    ring.hidden = !capture || (!breakout && t > 0.5);

    if (!shot && !capture) {
      ballModel?.draw(
        launcher,
        patrol.selected,
        0.24,
        -0.28 + Math.sin(time * 2) * 0.35,
      );
    } else if (shot) {
      const p = Math.min(1, (time - shot.start) / FLIGHT);
      position(
        ball,
        LAUNCH.x + (shot.x - LAUNCH.x) * p,
        launchY + (shot.y - launchY) * p - 0.18 * Math.sin(Math.PI * p),
      );
      ballModel?.draw(
        ball,
        shot.type.id,
        0.24 + p * Math.PI * 4,
        -0.28 + p * Math.PI * 2,
      );
      ball.style.transform = `translate(-50%, -50%) rotate(${p * 560}deg) scale(${1.2 - p * 0.55})`;
    } else if (capture) {
      position(ball, capture.x, capture.y);
      position(ring, capture.x, capture.y);
      ring.style.transform = `translate(-50%, -50%) scale(${0.25 + (breakout ? pop : t) * 3.5})`;
      ring.style.opacity = 1 - (breakout ? pop : t * 2);
      const rock = t > 0.3 && t < 0.96 ? Math.sin((t - 0.3) * 30) : 0;
      if (!breakout)
        ballModel?.draw(ball, capture.type.id, 0.24 + rock * 0.26, rock * 0.5);
      ball.style.transform = `translate(-50%, -50%) rotate(${rock * 29}deg)`;
    }
    if (status.textContent !== messages[patrol.status])
      status.textContent = messages[patrol.status];
    const progress = `${patrol.caught}/${patrol.critters.length}`;
    if (caught.textContent !== progress) caught.textContent = progress;
    if (throws.textContent !== String(patrol.throws))
      throws.textContent = patrol.throws;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;
    const dx =
      Number(held.has("KeyD") || held.has("ArrowRight")) -
      Number(held.has("KeyA") || held.has("ArrowLeft"));
    const dy =
      Number(held.has("KeyS") || held.has("ArrowDown")) -
      Number(held.has("KeyW") || held.has("ArrowUp"));
    if (dx || dy) {
      const pace =
        (Math.min(field.clientWidth, field.clientHeight) * 0.84 * dt) /
        Math.hypot(dx, dy);
      aim.x = Math.max(
        0.03,
        Math.min(0.97, aim.x + (dx * pace) / field.clientWidth),
      );
      aim.y = Math.max(
        0.05,
        Math.min(0.92, aim.y + (dy * pace) / field.clientHeight),
      );
      aim.visible = true;
    }
    stepPatrol(patrol, dt);
    render();
    if (patrol.status === "complete") {
      phase = "results";
      held.clear();
      const final = sceneIndex === SCENES.length - 1;
      resultActionLabel.textContent = final ? "PLAY AGAIN " : "NEXT SCENE ";
      resultAction.onclick = () => {
        sceneIndex = final ? 0 : sceneIndex + 1;
        resetScene(final ? undefined : patrol.supply);
      };
      results.show(
        final ? "Patrol complete!" : "Scene cleared!",
        final
          ? `You caught every Pokémon across all ${SCENES.length} scenes.`
          : `Up next: ${SCENES[sceneIndex + 1].name}.`,
        [
          [patrol.caught, "Caught"],
          [patrol.throws, "Throws"],
        ],
      );
    } else {
      frame = requestAnimationFrame(tick);
    }
  }

  function resume() {
    phase = "playing";
    setPauseScreen(dialog, false, field);
    previousTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function restart() {
    resetScene(patrol?.supply);
  }

  async function resetScene(supply) {
    touch = null;
    cancelAnimationFrame(frame);
    held.clear();
    results.hide();
    setPauseScreen(dialog, false, field);
    phase = "loading";
    const scene = SCENES[sceneIndex];
    patrol = createPatrol(scene, supply);
    renderSupply();
    field.dataset.scene = scene.theme;
    q("[data-scene-label]").textContent =
      `${sceneIndex + 1}/${SCENES.length} · ${scene.name}`;
    critterElements = patrol.critters.map(({ kind }) => {
      const element = document.createElement("div");
      element.className = "ap-critter";
      element.textContent = kind;
      return element;
    });
    const obstacles = scene.cover.map(({ kind, x, y, width, height }) => {
      const element = document.createElement("div");
      element.className = `ap-cover ap-${kind}`;
      position(element, x, y);
      element.style.width = `${width * 100}%`;
      element.style.height = `${height * 100}%`;
      return element;
    });
    actors.replaceChildren(...critterElements, ...obstacles);
    aim = { x: 0.5, y: 0.55, visible: true };
    render();
    status.textContent = "Getting the scene ready…";
    const sprites = await Promise.all(
      patrol.critters.map(({ kind }) => patrolPortrait(kind)),
    );
    if (!dialog.open) return;
    sprites.forEach((url, index) => {
      if (url)
        critterElements[index].replaceChildren(
          critterImage(url, patrol.critters[index].kind),
        );
    });
    render();
    resume();
  }

  function pause() {
    if (phase !== "playing") return;
    phase = "paused";
    touch = null;
    held.clear();
    cancelAnimationFrame(frame);
    setPauseScreen(dialog, true);
  }

  function shoot() {
    if (phase !== "playing") return;
    // Match the catch tolerance to the on-screen critter across aspect ratios.
    const width = critterElements[0].offsetWidth;
    const thrown = throwBall(patrol, aim.x, aim.y, {
      x: (width * 0.45) / field.clientWidth,
      y: (width * 0.36) / field.clientHeight,
    });
    if (thrown) renderSupply();
    render();
  }

  dialog.padPlaying = () => phase === "playing";
  bindDialogEscape(dialog, () => {
    if (phase === "paused") resume();
    else if (phase === "results" || phase === "loading") close();
    else pause();
  });
  q("[data-pause]").onclick = pause;
  q("[data-pause-resume]").onclick = resume;
  q("[data-pause-restart]").onclick = restart;
  q("[data-pause-home]").onclick = close;

  function pointerAim(event) {
    const rect = field.getBoundingClientRect();
    aim = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      visible: true,
    };
  }
  const swipeDistance = 12;
  const touchDistance = (event, start) =>
    Math.hypot(event.clientX - start.x, event.clientY - start.y);

  field.addEventListener("pointermove", (event) => {
    if (phase !== "playing") return;
    if (event.pointerType !== "touch") {
      pointerAim(event);
    } else if (touch?.id === event.pointerId && touch.fromBall) {
      pointerAim(event);
    }
  });
  field.addEventListener("pointerdown", (event) => {
    if (phase !== "playing" || !event.isPrimary || event.button !== 0) return;
    if (event.pointerType !== "touch") {
      pointerAim(event);
      shoot();
      return;
    }
    if (launcher.hidden) return;
    const ball = launcher.getBoundingClientRect();
    const radius = Math.max(32, ball.width / 2);
    const fromBall =
      touchDistance(event, {
        x: ball.left + ball.width / 2,
        y: ball.top + ball.height / 2,
      }) <= radius;
    touch = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      fromBall,
    };
    field.setPointerCapture(event.pointerId);
  });
  field.addEventListener("pointerup", (event) => {
    if (touch?.id !== event.pointerId) return;
    const start = touch;
    touch = null;
    const moved = touchDistance(event, start) >= swipeDistance;
    if (start.fromBall && !moved) return;
    if (!start.fromBall && moved) return;
    const rect = field.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX >= rect.right ||
      event.clientY < rect.top ||
      event.clientY >= rect.bottom
    )
      return;
    pointerAim(event);
    shoot();
  });
  function cancelTouch(event) {
    if (touch?.id === event.pointerId) touch = null;
  }
  field.addEventListener("pointercancel", cancelTouch);
  field.addEventListener("lostpointercapture", cancelTouch);

  dialog.addEventListener("keydown", (event) => {
    if (phase !== "playing") return;
    const index = /^Digit[1-4]$/.test(event.code)
      ? Number(event.code.at(-1)) - 1
      : -1;
    if (event.code === "KeyR" || index >= 0) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (index >= 0) selectBall(BALLS[index].id);
      else {
        const available = BALLS.filter(({ id }) => patrol.supply[id] > 0);
        const current = available.findIndex(({ id }) => id === patrol.selected);
        selectBall(available[(current + 1) % available.length].id);
      }
      return;
    }
    if (!aimKeys.has(event.code) && event.code !== "Space") return;
    if (event.code === "Space" && event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    if (aimKeys.has(event.code)) held.add(event.code);
    else if (!event.repeat) shoot();
  });
  dialog.addEventListener("keyup", (event) => held.delete(event.code));
  dialog.addEventListener("focusout", () => held.clear());

  document.body.append(dialog);
  dialog.showModal();
  restart();
}
