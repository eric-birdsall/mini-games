import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import {
  createMemory,
  pressMemory,
  advanceMemory,
  MEMORY_ROUNDS,
  MEMORY_LEVELS,
} from "../shared/memory.js";
import "./memory.css";

export function installMemory(getDifficulty = () => "normal") {
  const list = document.querySelector('.choice-row[aria-label="Game"]');
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "memory";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    "<strong>Firefly Recall</strong><small>Solo memory challenge: watch the fireflies, then repeat their growing route. Seven rounds. Chances and playback speed follow your difficulty.</small>";
  list.append(entry);
  let panel;
  entry.onclick = () => {
    if (panel) return;
    document.exitPointerLock?.();
    const level = getDifficulty();
    const settings = MEMORY_LEVELS[level] || MEMORY_LEVELS.normal;
    // Four fireflies in a diamond, coloured like the Xbox face buttons.
    const flies = [
      { name: "Yellow", color: "#ffd83d", pad: "Y", arrow: "↑", x: 0, y: -1 },
      { name: "Blue", color: "#3ea6ff", pad: "X", arrow: "←", x: -1, y: 0 },
      { name: "Red", color: "#ff4f4a", pad: "B", arrow: "→", x: 1, y: 0 },
      { name: "Green", color: "#5fe25a", pad: "A", arrow: "↓", x: 0, y: 1 },
    ];
    const KEY_TO_FLY = {
      ArrowUp: 0,
      w: 0,
      1: 0,
      ArrowLeft: 1,
      a: 1,
      2: 1,
      ArrowRight: 2,
      d: 2,
      3: 2,
      ArrowDown: 3,
      s: 3,
      4: 3,
    };
    const bestKey =
      level === "normal" ? "firefly-best-7" : `firefly-best-7-${level}`;
    const previousFocus = document.activeElement;
    panel = document.createElement("dialog");
    panel.id = "memory-game";
    panel.setAttribute("aria-labelledby", "memory-title");
    panel.innerHTML = `<div class="memory-top"><h1 id="memory-title">Firefly Recall</h1><div class="memory-stats"><div><small>ROUND</small><strong data-round>1 / ${MEMORY_ROUNDS}</strong></div><div><small>CHANCES</small><strong data-lives>${"♥ ".repeat(settings.lives).trim()}</strong></div><div><small>BEST</small><strong data-best>0 / ${MEMORY_ROUNDS}</strong></div></div><div class="memory-rounds" aria-label="Round progress">${Array.from({ length: MEMORY_ROUNDS }, (_, i) => `<span>${i + 1}</span>`).join("")}</div><div class="memory-actions"><button data-start hidden>START OVER</button><button data-pause hidden>PAUSE</button><button data-close aria-label="Close Firefly Recall">BACK TO GAMES ↗</button></div></div><div class="memory-layout"><section class="memory-garden"><div class="memory-status" role="status" aria-live="polite"><strong data-status>Meet your fireflies.</strong><span data-detail>Remember the colors in order.</span></div><div class="memory-grid" role="group" aria-label="Backyard campfire with four colored fireflies in a diamond"><div class="memory-moon" aria-hidden="true"></div><div class="memory-fence" aria-hidden="true"></div><div class="memory-tent" aria-hidden="true"><span></span></div><div class="memory-fire" aria-hidden="true"><i></i><i></i><i></i><span></span></div>${flies
      .map(
        (f, i) =>
          `<button class="memory-tile" data-tile="${i}" style="--fly-color:${f.color};--dx:${f.x};--dy:${f.y};--delay:-${i * 1.3}s" aria-label="${f.name} firefly, ${f.arrow} key or ${f.pad} button" disabled><span class="memory-fly" aria-hidden="true"><i></i></span><small aria-hidden="true"><b>${f.pad}</b>${f.arrow}</small></button>`,
      )
      .join("")}</div></section></div><div class="memory-intro-overlay" data-instructions><section class="memory-instructions" aria-labelledby="memory-how"><span class="memory-kicker">A LITTLE LIGHT. A LONGER MEMORY.</span><h2 id="memory-how">How to play</h2><p>Watch the colored fireflies flash around the campfire, then repeat the pattern in the same order.</p><p>Click or tap each firefly, or use the <strong>arrow keys</strong> — on a controller, <strong>Y X B A</strong> match the colors. Each round adds one flash. A mistake costs one chance and replays the pattern.</p><p>Clear all <strong>${MEMORY_ROUNDS} rounds</strong>. Take your time — there’s no time limit.</p><button class="memory-start" data-begin>LET’S PLAY →</button></section></div>${pauseScreen("Firefly Recall", "Watch the fireflies flash, then select them in order. Click or tap a firefly, or use its arrow key (Y X B A on a controller).")}`;
    document.body.append(panel);
    // Let the game picker finish closing before opening this modal.
    queueMicrotask(() => panel?.showModal());
    const q = (s) => panel.querySelector(s);
    const tiles = [...panel.querySelectorAll("[data-tile]")];
    // Controller: during a run Y X B A (and the D-pad) pick fireflies
    // directly; Menu pauses.
    panel.padPlaying = () =>
      !!state && !paused && !["lost", "won"].includes(state.phase);
    panel.padFaces = panel.padPlaying;
    let state,
      practice = false,
      paused = false,
      timer,
      generation = 0,
      best = 0;
    try {
      best = Math.min(
        MEMORY_ROUNDS,
        Math.max(0, Number(localStorage.getItem(bestKey)) || 0),
      );
    } catch {}
    q("[data-best]").textContent = `${best} / ${MEMORY_ROUNDS}`;
    const status = (title, detail) => {
      q("[data-status]").textContent = title;
      q("[data-detail]").textContent = detail;
    };
    const stop = () => {
      generation++;
      clearTimeout(timer);
      tiles.forEach((t) => t.classList.remove("lit", "wrong"));
    };
    const later = (fn, ms) => {
      const id = generation;
      timer = setTimeout(() => {
        if (id === generation) fn();
      }, ms);
    };
    const render = () => {
      q("[data-round]").textContent = practice
        ? "PRACTICE"
        : `${Math.min(state.sequence.length, MEMORY_ROUNDS)} / ${MEMORY_ROUNDS}`;
      q("[data-lives]").textContent = practice
        ? "∞"
        : "♥ ".repeat(state.lives).trim() || "—";
      tiles.forEach((t) => (t.disabled = state.phase !== "recall" || paused));
      panel.querySelectorAll(".memory-rounds span").forEach((dot, i) => {
        dot.classList.toggle("filled", !practice && i < state.cleared);
        dot.classList.toggle(
          "current",
          !practice && i === state.cleared && state.phase !== "won",
        );
        if (!practice && i === state.cleared && state.phase !== "won")
          dot.setAttribute("aria-current", "step");
        else dot.removeAttribute("aria-current");
      });
    };
    const watch = () => {
      stop();
      state.cursor = 0;
      state.phase = "watch";
      render();
      status(
        "Watch the lights…",
        `${state.sequence.length} ${state.sequence.length === 1 ? "firefly" : "fireflies"} to remember. Your turn comes next.`,
      );
      let index = 0;
      const flash = () => {
        const tile = tiles[state.sequence[index]];
        tile.classList.add("lit");
        later(
          () => {
            tile.classList.remove("lit");
            index++;
            if (index < state.sequence.length) later(flash, settings.gap);
            else
              later(() => {
                state.phase = "recall";
                render();
                status("Your turn.", "Repeat the route in the same order.");
              }, 350);
          },
          Math.max(settings.minimum, settings.flash - state.cleared * 25),
        );
      };
      later(flash, 700);
    };
    const start = (isPractice) => {
      results.hide();
      q("[data-instructions]").hidden = true;
      q("[data-start]").hidden = false;
      practice = isPractice;
      paused = false;
      state = createMemory(Math.random, level);
      if (practice) state.sequence = [0, 1, settings.flies - 1];
      q("[data-start]").textContent = "START OVER →";
      q("[data-pause]").hidden = false;
      setPauseScreen(panel, false, q("[data-pause]"));
      watch();
    };
    const press = (index) => {
      if (
        !state ||
        paused ||
        state.phase !== "recall" ||
        index < 0 ||
        index >= tiles.length
      )
        return;
      const result = pressMemory(state, index);
      stop();
      tiles[index].classList.add(
        result === "retry" || result === "lost" ? "wrong" : "lit",
      );
      if (practice && result === "retry") state.lives = settings.lives;
      if (!practice && state.cleared > best) {
        best = state.cleared;
        q("[data-best]").textContent = `${best} / ${MEMORY_ROUNDS}`;
        try {
          localStorage.setItem(bestKey, String(best));
        } catch {}
      }
      render();
      if (result === "correct") {
        status(
          "Keep going…",
          `${state.cursor} of ${state.sequence.length} remembered.`,
        );
        later(() => tiles[index].classList.remove("lit"), 180);
      } else if (result === "retry") {
        status(
          "A little mix-up.",
          practice
            ? "No pressure. Watch the same route again."
            : "One chance used. Watch the same route and try again.",
        );
        later(watch, 1500);
      } else if (result === "lost" || result === "won" || practice) {
        q("[data-pause]").hidden = true;
        results.show(
          practice
            ? "You’ve got it!"
            : result === "won"
              ? "A brilliant memory!"
              : "Nice run!",
          practice
            ? "Ready for the real pattern?"
            : "You remembered the fireflies’ route.",
          [
            [`${state.cleared} / ${MEMORY_ROUNDS}`, "ROUNDS CLEARED"],
            [`${best} / ${MEMORY_ROUNDS}`, "BEST"],
          ],
        );
      } else {
        status("Beautifully remembered!", "One more flash joins the pattern…");
        later(() => {
          advanceMemory(state);
          watch();
        }, 1100);
      }
    };
    tiles.forEach((tile, i) => (tile.onclick = () => press(i)));
    q("[data-start]").onclick = () => start(false);
    q("[data-begin]").onclick = () => start(false);
    const pause = () => {
      if (
        !state ||
        ["lost", "won"].includes(state.phase) ||
        q("[data-pause]").hidden
      )
        return;
      paused = !paused;
      setPauseScreen(panel, paused, q("[data-pause]"));
      q("[data-start]").hidden = paused;
      stop();
      if (paused) {
        render();
        status("Take a breath.", "Resume to watch this route again.");
      } else {
        if (state.phase === "complete") advanceMemory(state);
        watch();
      }
    };
    q("[data-pause]").onclick = pause;
    q("[data-pause-resume]").onclick = pause;
    const visibility = () => {
      if (document.hidden && !paused) pause();
    };
    document.addEventListener("visibilitychange", visibility);
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const fly = KEY_TO_FLY[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fly !== undefined && !e.repeat && panel.padPlaying()) {
        e.preventDefault();
        press(fly);
      }
    });
    const close = () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
      panel.close();
      panel.remove();
      panel = null;
      previousFocus?.focus();
    };
    const results = gameResults(
      panel,
      "Firefly Recall",
      () => start(false),
      close,
    );
    q("[data-close]").onclick = close;
    q("[data-pause-home]").onclick = close;
    q("[data-pause-restart]").onclick = () => start(practice);
    bindDialogEscape(panel, () => {
      if (state && !q("[data-pause]").hidden) pause();
      else close();
    });
  };
}
