import {
  createShadowShopGeometry,
  createShadowShopModels,
  shadowShopRounds as rounds,
} from "./shadowShopModels.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import "./shadowShop.css";

const SIZE = 192;
const TURN = 15;
const PASS = 94;
const INSTRUCTIONS =
  "Drag either object left or right to turn it. Use the nearby buttons or A / D and J / L for smaller turns. Match the reference silhouette to advance.";

// Fill a single union of projected mesh triangles. Giving every triangle
// the same winding keeps overlapping surfaces solid while preserving holes.
function drawShadow(ctx, geometry, round, angles, color) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = color;
  ctx.beginPath();
  round.objects.forEach((object, i) => {
    const scale = 69 * (object.scale ?? 1);
    const x = SIZE / 2 + object.x * 69;
    const y = SIZE / 2 - object.y * 69;
    geometry.project(object, angles[i], (a, b, c) => {
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-9) return;
      if (area < 0) [b, c] = [c, b];
      ctx.moveTo(x + a.x * scale, y - a.y * scale);
      ctx.lineTo(x + b.x * scale, y - b.y * scale);
      ctx.lineTo(x + c.x * scale, y - c.y * scale);
      ctx.closePath();
    });
  });
  ctx.fill();
}

function drawObject(ctx, geometry, object, angle) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const faces = [];
  geometry.project(object, angle, (a, b, c, color) => {
    const ux = b.x - a.x,
      uy = b.y - a.y,
      uz = b.z - a.z;
    const vx = c.x - a.x,
      vy = c.y - a.y,
      vz = c.z - a.z;
    const nz = ux * vy - uy * vx;
    if (nz <= 1e-9) return;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const light = Math.max(
      0,
      (-0.4 * nx + 0.48 * ny + 0.78 * nz) / Math.hypot(nx, ny, nz),
    );
    faces.push({ a, b, c, color, light, depth: (a.z + b.z + c.z) / 3 });
  });
  faces.sort((a, b) => a.depth - b.depth);
  // Keep this projection centered and scaled like the WebGL view.
  const centerY = SIZE * 0.45;
  const scale = SIZE * 0.43;
  ctx.lineWidth = 0.7;
  for (const { a, b, c, color, light } of faces) {
    const shade = color
      .clone()
      .multiplyScalar(0.45 + 0.55 * light)
      .getStyle();
    ctx.fillStyle = ctx.strokeStyle = shade;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 + a.x * scale, centerY - a.y * scale);
    ctx.lineTo(SIZE / 2 + b.x * scale, centerY - b.y * scale);
    ctx.lineTo(SIZE / 2 + c.x * scale, centerY - c.y * scale);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
}

function mask(ctx) {
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

function match(reference, current) {
  let overlap = 0;
  let combined = 0;
  for (let i = 3; i < reference.length; i += 4) {
    overlap += Math.min(reference[i], current[i]);
    combined += Math.max(reference[i], current[i]);
  }
  return Math.round((100 * overlap) / combined);
}

function thumbnail() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const geometry = createShadowShopGeometry();
  drawShadow(ctx, geometry, rounds[0], rounds[0].solution, "#29162b");
  geometry.dispose();
  ctx.globalCompositeOperation = "destination-over";
  const lamp = ctx.createRadialGradient(96, 78, 5, 96, 96, 124);
  lamp.addColorStop(0, "#fff1bd");
  lamp.addColorStop(1, "#cd7b52");
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return canvas.toDataURL();
}

export function installShadowShop() {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "shadowshop";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img class="shadow-shop-thumb" src="${thumbnail()}" alt="" draggable="false"></span><strong>Shadow Shop</strong><small>Turn two odd objects until their combined shadow matches the silhouette.</small>`;
  games.append(entry);
  entry.onclick = open;
}

function open() {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "shadow-shop";
  dialog.setAttribute("aria-labelledby", "shadow-shop-title");
  dialog.innerHTML = `
    <header>
      <h1 id="shadow-shop-title">Shadow Shop</h1>
      <div class="shadow-shop-actions">
        <button type="button" data-pause>Pause</button>
        <button type="button" data-exit>Back to games</button>
      </div>
    </header>
    <main class="shadow-shop-main">
      <div class="shadow-shop-heading">
        <p data-progress></p>
        <h2 data-title></h2>
      </div>
      <div class="shadow-shop-layout">
        <aside class="shadow-shop-reference" aria-label="Reference">
          <figure>
            <figcaption>Reference</figcaption>
            <canvas width="${SIZE}" height="${SIZE}" data-reference role="img"></canvas>
          </figure>
          <p>Reach ${PASS}% to solve.</p>
          <button type="button" data-reset>Reset Angles</button>
        </aside>
        <section class="shadow-shop-bench" aria-label="Lamp and objects">
          <div class="shadow-shop-beam" aria-hidden="true"></div>
          <div class="shadow-shop-bookcase" aria-hidden="true">
            <div><i></i><i></i><i></i><i></i><i></i></div>
            <div><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="shadow-shop-desk" aria-hidden="true"><span></span></div>
          <div class="shadow-shop-lamp" role="img" aria-label="Lit workshop lamp">
            <span class="shadow-shop-lamp-arm"></span>
            <span class="shadow-shop-lamp-shade"></span>
          </div>
          <figure class="shadow-shop-wall">
            <figcaption>Your shadow <output data-match aria-live="off"></output></figcaption>
            <canvas width="${SIZE}" height="${SIZE}" data-shadow role="img" aria-label="Combined shadow cast by both objects"></canvas>
          </figure>
          <canvas class="shadow-shop-models" data-models aria-hidden="true"></canvas>
          <div class="shadow-shop-controls">
            ${[0, 1]
              .map(
                (i) => `
              <div class="shadow-shop-control">
                <div class="shadow-shop-turntable">
                  <button type="button" data-turn="-1" data-object="${i}">↶</button>
                  <div class="shadow-shop-piece" data-piece="${i}" role="img">
                    <canvas width="${SIZE}" height="${SIZE}" aria-hidden="true"></canvas>
                  </div>
                  <button type="button" data-turn="1" data-object="${i}">↷</button>
                </div>
                <span data-name="${i}"></span>
              </div>`,
              )
              .join("")}
          </div>
        </section>
      </div>
      <p class="shadow-shop-hint">Drag an object to turn it, or use A / D and J / L.</p>
      <div class="shadow-shop-celebration" data-celebration hidden>
        <div class="shadow-shop-confetti" data-confetti aria-hidden="true"></div>
        <section class="shadow-shop-success" aria-labelledby="shadow-shop-success-title">
          <h2 id="shadow-shop-success-title" data-status role="status"></h2>
          <figure data-upcoming>
            <canvas width="${SIZE}" height="${SIZE}" data-preview role="img"></canvas>
            <figcaption data-upcoming-name></figcaption>
          </figure>
          <button type="button" class="primary" data-next></button>
        </section>
      </div>
    </main>
    ${pauseScreen("Shadow Shop", INSTRUCTIONS)}
  `;
  document.body.append(dialog);
  const get = (name) => dialog.querySelector(`[data-${name}]`);
  const reference = get("reference").getContext("2d", {
    willReadFrequently: true,
  });
  const shadow = get("shadow").getContext("2d", { willReadFrequently: true });
  const turnButtons = [...dialog.querySelectorAll("[data-turn]")];
  const pieces = [...dialog.querySelectorAll("[data-piece]")];
  const geometry = createShadowShopGeometry();
  let models;
  try {
    models = createShadowShopModels(get("models"), geometry.pieces, pieces);
    dialog.classList.add("has-models");
  } catch {
    get("models").hidden = true;
  }
  const pieceContexts = models
    ? []
    : pieces.map((piece) => piece.querySelector("canvas").getContext("2d"));
  const next = get("next");
  const celebration = get("celebration");
  const confetti = get("confetti");
  const preview = get("preview").getContext("2d");
  const layout = dialog.querySelector(".shadow-shop-layout");
  let index = 0;
  let angles;
  let referenceMask;
  let solved = false;
  let paused = false;
  let resumeFocus;
  let drag = null;

  function render() {
    const round = rounds[index];
    if (models) models.update(round, angles);
    else
      round.objects.forEach((object, i) =>
        drawObject(pieceContexts[i], geometry, object, angles[i]),
      );
    drawShadow(shadow, geometry, round, angles, "#29162b");
    const score = match(referenceMask, mask(shadow));
    get("match").textContent = `${score}% match`;
    if (score < PASS || drag || solved) return;

    solved = true;
    dialog.classList.add("is-solved");
    const upcoming = rounds[index + 1];
    get("status").textContent = upcoming
      ? "Silhouette solved!"
      : `All ${rounds.length} silhouettes solved!`;
    get("upcoming").hidden = !upcoming;
    if (upcoming) {
      get("upcoming-name").textContent = `Up next · ${upcoming.name}`;
      get("preview").setAttribute("aria-label", `${upcoming.name} silhouette`);
      drawShadow(preview, geometry, upcoming, upcoming.solution, "#29162b");
    }
    next.textContent = upcoming ? "Next" : "Play again";
    celebration.hidden = false;
    next.focus();
    layout.inert = true;
    turnButtons.forEach((button) => {
      button.disabled = true;
    });
    get("reset").disabled = true;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ffc779", "#ed8db3", "#79c9ad", "#ae9cea", "#fff1c6"];
    const burst = document.createDocumentFragment();
    for (let i = 0; i < 56; i++) {
      const paper = document.createElement("i");
      const angle = Math.random() * 2 * Math.PI;
      const distance = 10 + Math.random() * 38;
      paper.style.setProperty("--x", `${Math.cos(angle) * distance}vw`);
      paper.style.setProperty(
        "--y",
        `${Math.sin(angle) * distance * 0.7 - 9}vh`,
      );
      paper.style.setProperty("--spin", `${Math.random() * 900 - 450}deg`);
      paper.style.setProperty("--paper", colors[i % colors.length]);
      paper.style.animationDuration = `${950 + Math.random() * 550}ms`;
      paper.addEventListener("animationend", () => paper.remove(), {
        once: true,
      });
      burst.append(paper);
    }
    confetti.replaceChildren(burst);
  }

  function startRound(focus = true) {
    endDrag();
    const round = rounds[index];
    angles = [...round.start];
    solved = false;
    dialog.classList.remove("is-solved");
    round.objects.forEach(({ name }, i) => {
      pieces[i].setAttribute("aria-label", name);
      dialog.querySelector(`[data-name="${i}"]`).textContent = name;
    });
    get("progress").textContent = `Silhouette ${index + 1} of ${rounds.length}`;
    get("title").textContent = round.name;
    get("reference").setAttribute(
      "aria-label",
      `${round.name} reference silhouette`,
    );
    celebration.hidden = true;
    confetti.replaceChildren();
    layout.inert = false;
    get("reset").disabled = false;
    turnButtons.forEach((button) => {
      const object = Number(button.dataset.object);
      const name = round.objects[object].name;
      const direction = Number(button.dataset.turn) < 0 ? "left" : "right";
      button.disabled = false;
      button.setAttribute(
        "aria-label",
        `Turn ${name.toLowerCase()} ${direction}`,
      );
    });
    drawShadow(reference, geometry, round, round.solution, "#29162b");
    referenceMask = mask(reference);
    render();
    if (focus) turnButtons[0].focus();
  }

  function turn(object, direction) {
    if (paused || solved || drag) return;
    angles[object] = (angles[object] + direction * TURN + 360) % 360;
    render();
  }

  function endDrag() {
    if (!drag) return;
    const { piece, pointer } = drag;
    drag = null;
    piece.classList.remove("is-dragging");
    if (piece.hasPointerCapture(pointer)) piece.releasePointerCapture(pointer);
  }

  pieces.forEach((piece, object) => {
    piece.addEventListener("pointerdown", (event) => {
      if (paused || solved || drag || event.button !== 0) return;
      piece.setPointerCapture(event.pointerId);
      piece.classList.add("is-dragging");
      drag = {
        piece,
        pointer: event.pointerId,
        x: event.clientX,
        angle: angles[object],
      };
    });
    piece.addEventListener("pointermove", (event) => {
      if (drag?.pointer !== event.pointerId || drag.piece !== piece) return;
      angles[object] =
        (((drag.angle + (event.clientX - drag.x) * 2) % 360) + 360) % 360;
      render();
    });
    function finish(event) {
      if (drag?.pointer !== event.pointerId || drag.piece !== piece) return;
      endDrag();
      render();
    }
    piece.addEventListener("pointerup", finish);
    piece.addEventListener("pointercancel", finish);
    piece.addEventListener("lostpointercapture", finish);
  });

  function togglePause() {
    endDrag();
    if (!paused) resumeFocus = document.activeElement;
    paused = !paused;
    setPauseScreen(dialog, paused, resumeFocus);
  }

  turnButtons.forEach((button) => {
    button.onclick = () =>
      turn(Number(button.dataset.object), Number(button.dataset.turn));
  });
  next.onclick = () => {
    index = (index + 1) % rounds.length;
    startRound();
  };
  get("reset").onclick = () => startRound(false);
  get("pause").onclick = togglePause;
  get("pause-resume").onclick = togglePause;
  get("pause-restart").onclick = () => {
    index = 0;
    togglePause();
    startRound();
  };
  get("exit").onclick = get("pause-home").onclick = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      models?.dispose();
      geometry.dispose();
      dialog.remove();
    },
    { once: true },
  );
  bindDialogEscape(dialog, togglePause);
  dialog.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (
      paused ||
      solved ||
      !"adjl".includes(key) ||
      key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    turn(
      key === "a" || key === "d" ? 0 : 1,
      key === "a" || key === "j" ? -1 : 1,
    );
  });

  startRound(false);
  dialog.showModal();
  turnButtons[0].focus();
}
