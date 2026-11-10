import { gameResults } from "./gameResults.js";
import roofCatchPreview from "./assets/modes/roof-catch.jpg";
import { bindDialogEscape, pauseScreen, setPauseScreen } from "./pauseActions.js";
import { createRoofCatchScene } from "./roofCatchScene.js";
import "./roofCatch.css";

const missLimit = 3;
const groundTime = 0.24;
const kinds = ["apple", "apple", "pebble", "apple", "pear", "apple", "mud"];
const fallTime = 0.7;
const laneX = (lane) => 100 + lane * 120;
const items = {
  apple: { points: 10 },
  pear: { points: 30 },
  pebble: { message: "Pebble! Streak broken." },
  mud: { message: "Mud! Basket spilled." },
};

function makeDrop(index, catchAt) {
  const progress = Math.min(index / 32, 1);
  const rollTime = 2.7 - 1.85 * progress;
  const slot = index % kinds.length;
  return {
    slot,
    catchAt,
    start: catchAt - rollTime - fallTime,
    rollTime,
    lane: (2 + index * 3 + Math.floor(index / 5)) % 5,
    kind: kinds[slot],
  };
}

export function installRoofCatch(getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "roofcatch";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${roofCatchPreview}" alt="Roof Catch gameplay showing an apple on the tin roof and a raccoon holding a basket" draggable="false"></span><strong>Roof Catch</strong><small>Catch fruit rolling off a tin roof. Dodge pebbles and mud before you miss three fruit.</small>`;
  games.append(entry);
  entry.onclick = () => {
    document.exitPointerLock?.();
    const dialog = document.createElement("dialog");
    dialog.className = "roof-catch";
    dialog.setAttribute("aria-label", "Roof Catch");
    dialog.innerHTML = `
      <header><strong>Roof Catch</strong><div><button data-exit>Back to games</button></div></header>
      <div class="roof-catch-field">
        <canvas width="680" height="440" aria-label="Five-lane roof and basket"></canvas>
        <section class="roof-catch-panel">
          <h2 data-heading></h2><p data-details></p><button data-play></button>
        </section>
      </div>
      <footer><div class="roof-catch-hud"><span data-score></span><span data-streak></span><span data-misses></span></div><span>← / → or A / D · Drag to steer</span><span data-message role="status"></span><button data-pause hidden>Pause / Esc</button></footer>
      ${pauseScreen("Roof Catch", "Use A / D, the arrow keys, or drag to steer. Catch the fruit and dodge pebbles and mud.")}`;
    document.body.append(dialog);
    // Controller: steer while playing; navigate buttons otherwise (padBridge).
    dialog.padPlaying = () => state === "playing";

    const canvas = dialog.querySelector("canvas");

    const get = (key) => dialog.querySelector(`[data-${key}]`);
    const panel = dialog.querySelector("section");
    const keys = new Set();
    let drops = [],
      fruit = [],
      stains = [],
      nextIndex = 0,
      nextCatch = 3.9,
      time = 0,
      score = 0,
      streak = 0,
      x = 340;
    let state = "ready",
      previous = 0,
      frame,
      target,
      audio;

    function showPanel(heading, details, button) {
      get("heading").textContent = heading;
      get("details").textContent = details;
      get("play").textContent = button;
      panel.hidden = false;
      dialog.querySelector("header").hidden = false;
      get("pause").hidden = true;
      get("play").focus();
    }

    function draw(movement = 0, dt = 0) {
      scene.draw(x, drops, stains, time, movement, dt);
      get("score").textContent = `Score ${score}`;
      get("streak").textContent = `Streak ${streak}`;
      get("misses").textContent = `Misses ${stains.length}/${missLimit}`;
    }

    function play(now) {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      time += dt;
      const nextDrop = makeDrop(nextIndex, nextCatch);
      if (time >= nextDrop.start) {
        drops.push(nextDrop);
        nextIndex++;
        // At full speed, crossing the entire roof takes 480 / 420 seconds.
        nextCatch += 3 - 1.45 * Math.min(nextIndex / 32, 1);
      }
      const direction = Number(keys.has("right")) - Number(keys.has("left"));
      const movement =
        target === undefined
          ? direction * 420 * dt
          : Math.max(-420 * dt, Math.min(420 * dt, target - x));
      x = Math.max(laneX(0), Math.min(laneX(4), x + movement));

      for (const drop of drops) {
        const age = time - drop.start;
        if (drop.kind === "pebble" && !drop.rattled && age >= 0) {
          drop.rattled = true;
          if (audio?.state === "running") {
            for (let i = 0; i < 4; i++) {
              const start = audio.currentTime + i * 0.07;
              const oscillator = audio.createOscillator();
              const gain = audio.createGain();
              oscillator.type = "triangle";
              oscillator.frequency.value = 220 + i * 90;
              gain.gain.setValueAtTime(0.08, start);
              gain.gain.exponentialRampToValueAtTime(0.001, start + 0.035);
              oscillator.connect(gain).connect(audio.destination);
              oscillator.start(start);
              oscillator.stop(start + 0.04);
            }
          }
        }
        if (drop.missAt !== undefined && time >= drop.missAt && !drop.landed) {
          drop.landed = true;
          stains.push(drop);
          get("message").textContent = "Fruit missed!";
        }
        if (drop.resolved || time < drop.catchAt) continue;
        drop.resolved = true;
        if (Math.abs(x - laneX(drop.lane)) > 36) {
          if (items[drop.kind].points) {
            drop.missAt = drop.catchAt + groundTime;
            drop.landingOffset = 0.35 + stains.length * 0.68;
          }
          continue;
        }
        drop.caught = true;
        if (drop.kind === "pear") {
          drop.caughtAt = time;
          drop.caughtX = x;
        }
        const item = items[drop.kind];
        if (item.points) {
          fruit.push(item.points);
          score += item.points;
          streak++;
          const bonus = streak % 5 === 0 ? 25 : 0;
          score += bonus;
          get("message").textContent = bonus
            ? `+${item.points} fruit · +25 streak bonus`
            : `+${item.points}`;
        } else {
          streak = 0;
          if (drop.kind === "mud") {
            const lost = fruit.splice(Math.max(0, fruit.length - 3));
            score -= lost.reduce((total, points) => total + points, 0);
          }
          get("message").textContent = item.message;
        }
      }
      drops = drops.filter((drop) => time < drop.catchAt + 0.55);
      draw(movement, dt);
      if (stains.length < missLimit) frame = requestAnimationFrame(play);
      else {
        state = "finished";
        results.show("Harvest complete", `You missed ${missLimit} fruit.`, [
          [score, "FINAL SCORE"],
          [fruit.length, "FRUIT IN YOUR BASKET"],
        ]);
      }
    }

    function pause() {
      if (state !== "playing") return;
      state = "paused";
      cancelAnimationFrame(frame);
      keys.clear();
      target = undefined;
      setPauseScreen(dialog, true);
    }

    get("play").onclick = () => {
      start(state !== "paused");
    };
    function start(reset) {
      results.hide();
      if (reset) {
        drops = [];
        stains = [];
        nextIndex = 0;
        nextCatch = 3.9;
        fruit = [];
        time = score = streak = 0;
        x = 340;
        keys.clear();
        target = undefined;
        get("message").textContent = "";
      }
      if (window.AudioContext) {
        audio ??= new AudioContext();
        audio.resume().catch(() => {});
      }
      state = "playing";
      panel.hidden = true;
      dialog.querySelector("header").hidden = true;
      get("pause").hidden = false;
      setPauseScreen(dialog, false, get("pause"));
      previous = performance.now();
      frame = requestAnimationFrame(play);
    }
    const results = gameResults(
      dialog,
      "Roof Catch",
      () => start(true),
      () => dialog.close(),
    );
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
    const steering = {
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
    };
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const direction =
        steering[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!direction || state !== "playing") return;
      event.preventDefault();
      target = undefined;
      keys.add(direction);
    });
    dialog.addEventListener("keyup", (event) => {
      event.stopPropagation();
      keys.delete(
        steering[event.key.length === 1 ? event.key.toLowerCase() : event.key],
      );
    });
    function aim(event) {
      target = Math.max(laneX(0), Math.min(laneX(4), scene.aim(event.clientX)));
    }
    canvas.addEventListener("pointerdown", (event) => {
      if (state !== "playing") return;
      canvas.setPointerCapture(event.pointerId);
      aim(event);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (state === "playing" && canvas.hasPointerCapture(event.pointerId))
        aim(event);
    });
    const resize = () => draw();
    window.addEventListener("blur", pause);
    window.addEventListener("resize", resize);
    dialog.addEventListener("close", () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", pause);
      window.removeEventListener("resize", resize);
      scene.dispose();
      audio?.close().catch(() => {});
      dialog.remove();
      document.querySelector("#deploy")?.focus();
    });

    const scene = createRoofCatchScene(
      canvas,
      getAvatar(),
      kinds,
      laneX,
      fallTime,
      missLimit,
    );
    dialog.showModal();
    draw();
    showPanel(
      "Catch the harvest",
      "Apples +10 · Golden pears +30 · Five clean catches +25. Pebbles break streaks and mud spills up to three fruit. The round ends when three fruit hit the ground.",
      "Start round",
    );
  };
}
