import { createShadowShopModels } from "./shadowShopModels.js";
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

const rounds = [
  {
    name: "Hedgehog",
    objects: [
      {
        name: "Garden rake",
        x: 92,
        y: 99,
        depth: 9,
        outline: [
          [-60, 20],
          [-58, -12],
          [-46, -1],
          [-44, -31],
          [-28, -12],
          [-19, -44],
          [-4, -19],
          [9, -46],
          [20, -17],
          [35, -34],
          [42, -8],
          [49, 19],
          [37, 33],
          [-47, 33],
        ],
      },
      {
        name: "Tea scoop",
        x: 127,
        y: 111,
        depth: 13,
        outline: [
          [-26, 19],
          [-19, -17],
          [0, -17],
          [14, -6],
          [33, 3],
          [34, 12],
          [21, 20],
          [9, 20],
          [4, 31],
          [-23, 31],
        ],
      },
    ],
    solution: [0, 0],
    start: [60, 75],
  },
  {
    name: "Rocket",
    objects: [
      {
        name: "Ice scraper",
        x: 96,
        y: 86,
        depth: 9,
        outline: [
          [0, -51],
          [13, -34],
          [22, -9],
          [21, 37],
          [10, 44],
          [-10, 44],
          [-21, 37],
          [-22, -9],
          [-13, -34],
        ],
      },
      {
        name: "Coat hook",
        x: 96,
        y: 123,
        depth: 16,
        outline: [
          [-14, -23],
          [14, -23],
          [39, 4],
          [41, 25],
          [14, 14],
          [0, 37],
          [-14, 14],
          [-41, 25],
          [-39, 4],
        ],
      },
    ],
    solution: [15, 15],
    start: [90, 75],
  },
  {
    name: "Moth",
    objects: [
      {
        name: "Ribbon bow",
        x: 96,
        y: 96,
        depth: 10,
        outline: [
          [0, -8],
          [23, -31],
          [62, -43],
          [68, -22],
          [57, 1],
          [41, 9],
          [46, 24],
          [29, 39],
          [12, 31],
          [0, 14],
          [-12, 31],
          [-29, 39],
          [-46, 24],
          [-41, 9],
          [-57, 1],
          [-68, -22],
          [-62, -43],
          [-23, -31],
        ],
      },
      {
        name: "Salad tongs",
        x: 96,
        y: 88,
        depth: 8,
        outline: [
          [0, -18],
          [13, -47],
          [20, -47],
          [10, -18],
          [8, -5],
          [10, 22],
          [0, 52],
          [-10, 22],
          [-8, -5],
          [-10, -18],
          [-20, -47],
          [-13, -47],
        ],
      },
    ],
    solution: [0, 30],
    start: [75, 90],
  },
];

// Project the front, back and sides of each solid onto a screen lit by
// parallel rays. Both objects cast onto the same mask.
function drawShadow(ctx, round, angles, color) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = color;

  function fill(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  round.objects.forEach(({ x, y, depth, outline }, i) => {
    const angle = (angles[i] * Math.PI) / 180;
    const shift = (depth * Math.sin(angle)) / 2;
    const face = outline.map(([px, py]) => [x + px * Math.cos(angle), y + py]);
    const front = face.map(([px, py]) => [px - shift, py]);
    const back = face.map(([px, py]) => [px + shift, py]);
    fill(front);
    fill(back);
    front.forEach((point, j) => {
      const next = (j + 1) % front.length;
      fill([point, front[next], back[next], back[j]]);
    });
  });
}

function drawObject(ctx, { outline, depth }, degrees, index) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const angle = (degrees * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const project = ([x, y], z) => [
    96 + x * cos + z * sin,
    96 + y + (z * cos - x * sin) * 0.32,
  ];
  const front = outline.map((point) => project(point, -depth / 2));
  const back = outline.map((point) => project(point, depth / 2));
  const fill = (points, color) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  };
  const colors = index
    ? ["#674033", "#a56842", "#f0ae65"]
    : ["#274b4a", "#438678", "#a9ce9d"];
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#221823";
  ctx.lineWidth = 1.5;
  const [far, near] = cos < 0 ? [front, back] : [back, front];
  fill(far, colors[0]);
  far.forEach((point, i) => {
    const next = (i + 1) % far.length;
    fill([point, far[next], near[next], near[i]], colors[1]);
  });
  const finish = ctx.createLinearGradient(50, 55, 145, 150);
  finish.addColorStop(0, colors[2]);
  finish.addColorStop(1, colors[1]);
  fill(near, finish);
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
  drawShadow(ctx, rounds[0], rounds[0].solution, "#29162b");
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
  let models;
  try {
    models = createShadowShopModels(get("models"));
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
    if (models) models.update(index, angles);
    else
      round.objects.forEach((object, i) =>
        drawObject(pieceContexts[i], object, angles[i], i),
      );
    drawShadow(shadow, round, angles, "#29162b");
    const score = match(referenceMask, mask(shadow));
    get("match").textContent = `${score}% match`;
    if (score < PASS || drag || solved) return;

    solved = true;
    dialog.classList.add("is-solved");
    const upcoming = rounds[index + 1];
    get("status").textContent = upcoming
      ? "Silhouette solved!"
      : "All three silhouettes solved!";
    get("upcoming").hidden = !upcoming;
    if (upcoming) {
      get("upcoming-name").textContent = `Up next · ${upcoming.name}`;
      get("preview").setAttribute("aria-label", `${upcoming.name} silhouette`);
      drawShadow(preview, upcoming, upcoming.solution, "#29162b");
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
    drawShadow(reference, round, round.solution, "#29162b");
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
