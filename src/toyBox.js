import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createToyBox, grabToy, TOYS } from "../shared/toyBox.js";
import "./toyBox.css";

export function installToyBox(getDifficulty = () => "normal") {
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "toybox";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    "<strong>Toy Box Rescue</strong><small>Steer a carnival claw in two directions. Line up above the requested toy, drop, and rescue all six!</small>";
  document.querySelector('.choice-row[aria-label="Game"]').append(entry);
  let panel;
  entry.onclick = () => {
    if (panel) return;
    document.exitPointerLock?.();
    const previousFocus = document.activeElement;
    panel = document.createElement("dialog");
    panel.id = "toy-box-game";
    panel.setAttribute("aria-labelledby", "toy-box-title");
    panel.innerHTML = `<main class="tb-layout"><section class="tb-machine"><div class="tb-machine-label"><span>★ THE CLAW CLUB ★</span><span data-count>0 / 6 RESCUED</span></div><canvas aria-label="Toy box viewed from above. Use arrow keys or WASD to move the claw, Space to grab." tabindex="0"></canvas><div class="tb-machine-foot"><span>← X AXIS →</span><span>↑ Y AXIS ↓</span><i>● READY TO PLAY</i></div></section><aside class="tb-console"><h1 id="toy-box-title">Toy Box Rescue</h1><span class="tb-eyebrow">YOUR NEXT MISSION</span><div class="tb-target"><span data-icon></span><h2 data-target></h2><p>Bring this little one home.</p></div><div class="tb-status" role="status" aria-live="polite" data-status>Line up the claw over the toy.</div><button class="tb-grab" data-grab>DROP CLAW <kbd>SPACE</kbd></button><div class="tb-pad" aria-label="Claw movement"><button data-dir="up" aria-label="Move claw toward back">↑</button><button data-dir="left" aria-label="Move claw left">←</button><span>✥</span><button data-dir="right" aria-label="Move claw right">→</button><button data-dir="down" aria-label="Move claw toward front">↓</button></div><p class="tb-help">Hold arrow keys or WASD to steer.<br>Tap or drag inside the box to line up.<br>Press Space or Drop Claw to grab.</p><div class="tb-shelf" aria-label="Rescued toys" data-shelf></div><div class="tb-bottom"><span data-attempts>0 DROPS</span><button data-pause>Pause / Esc</button></div></aside></main>${pauseScreen("Toy Box Rescue", "Move with the arrow keys or WASD, or drag to aim. Press Space or Drop Claw to grab the requested toy.")}`;
    document.body.append(panel);
    // Controller: steer the claw while aiming; navigate buttons otherwise.
    panel.padPlaying = () => !paused && phase !== "finished";
    queueMicrotask(() => {
      panel?.showModal();
      panel?.querySelector("canvas").focus();
    });
    const q = (s) => panel.querySelector(s),
      canvas = q("canvas"),
      ctx = canvas.getContext("2d");
    let state,
      x,
      y,
      phase,
      elapsed,
      result,
      raf,
      last = performance.now(),
      dragging = false,
      paused = false;
    const keys = new Set();
    const update = () => {
      const target = state.toys.find((t) => t.id === state.target);
      q("[data-icon]").textContent = target?.icon || "🎉";
      q("[data-target]").textContent = target?.name || "Everyone is home!";
      q("[data-count]").textContent = `${state.rescued.length} / 6 RESCUED`;
      q("[data-attempts]").textContent = `${state.attempts} DROPS`;
      q("[data-shelf]").textContent =
        state.rescued.map((t) => t.icon).join(" ") ||
        "Your rescue shelf awaits…";
      q("[data-grab]").disabled = phase !== "aim" || !target;
      panel
        .querySelectorAll("[data-dir]")
        .forEach((b) => (b.disabled = phase !== "aim" || !target));
    };
    const reset = () => {
      results.hide();
      state = createToyBox(Math.random, getDifficulty());
      x = 0.5;
      y = 0.5;
      phase = "aim";
      elapsed = 0;
      result = null;
      keys.clear();
      q("[data-status]").textContent = "Line up the claw over the toy.";
      update();
    };
    const drop = () => {
      if (phase !== "aim" || !state.toys.length) return;
      keys.clear();
      phase = "drop";
      elapsed = 0;
      q("[data-status]").textContent = "Going down…";
      update();
    };
    q("[data-grab]").onclick = drop;
    const pause = (value) => {
      paused = value;
      keys.clear();
      dragging = false;
      setPauseScreen(panel, paused, canvas);
    };
    q("[data-pause]").onclick = () => pause(true);
    q("[data-pause-resume]").onclick = () => pause(false);
    q("[data-pause-restart]").onclick = () => {
      reset();
      pause(false);
    };
    const directions = {
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
      ArrowUp: "up",
      w: "up",
      ArrowDown: "down",
      s: "down",
    };
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (paused || phase === "finished") return;
      const dir = directions[e.key] || directions[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        keys.add(dir);
      }
      if (e.code === "Space" && !["BUTTON"].includes(e.target.tagName)) {
        e.preventDefault();
        if (!e.repeat) drop();
      }
    });
    panel.addEventListener("keyup", (e) => {
      e.stopPropagation();
      keys.delete(directions[e.key] || directions[e.key.toLowerCase()]);
    });
    const clear = () => {
      keys.clear();
      dragging = false;
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    panel.querySelectorAll("[data-dir]").forEach((button) => {
      button.onpointerdown = (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        keys.add(button.dataset.dir);
      };
      button.onpointerup =
        button.onpointercancel =
        button.onlostpointercapture =
          () => keys.delete(button.dataset.dir);
    });
    const point = (e) => {
      if (phase !== "aim" || !state.toys.length) return;
      const r = canvas.getBoundingClientRect();
      x = Math.max(
        0.06,
        Math.min(0.94, (((e.clientX - r.left) / r.width) * 900 - 80) / 740),
      );
      y = Math.max(
        0.06,
        Math.min(0.94, (((e.clientY - r.top) / r.height) * 700 - 110) / 490),
      );
    };
    canvas.onpointerdown = (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
      point(e);
    };
    canvas.onpointermove = (e) => {
      if (dragging) point(e);
    };
    canvas.onpointerup = canvas.onpointercancel = () => {
      dragging = false;
    };
    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!paused && phase === "aim" && state.toys.length) {
        const dx = Number(keys.has("right")) - Number(keys.has("left")),
          dy = Number(keys.has("down")) - Number(keys.has("up"));
        const scale = Math.hypot(dx, dy) || 1;
        x = Math.max(0.06, Math.min(0.94, x + (dx / scale) * dt * 0.32));
        y = Math.max(0.06, Math.min(0.94, y + (dy / scale) * dt * 0.32));
      } else if (!paused && (phase === "drop" || phase === "lift")) {
        elapsed += dt;
        if (phase === "drop" && elapsed >= 0.85) {
          result = grabToy(state, x, y);
          phase = "lift";
          elapsed = 0;
          q("[data-status]").textContent =
            result.kind === "miss"
              ? "Empty claw! Adjust your aim and try again."
              : result.kind === "wrong"
                ? `That’s the ${result.toy.name.toLowerCase()}! Returning it to the box.`
                : "Got it! Bringing your toy home…";
        }
        if (phase === "lift" && elapsed >= 1.2) {
          phase = "aim";
          if (result.kind === "complete") {
            phase = "finished";
            results.show("Everyone is home!", "You rescued all six toys.", [
              [state.attempts, "DROPS"],
            ]);
          } else if (result.kind === "rescued") {
            q("[data-status]").textContent = "Rescued! Find your next toy.";
          }
          result = null;
          update();
        }
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2),
        width = Math.round(canvas.clientWidth * dpr),
        height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(width / 900, 0, 0, height / 700, 0, 0);
      ctx.fillStyle = "#243c48";
      ctx.fillRect(0, 0, 900, 700);
      const box = (bx, by, bw, bh, color, r = 0) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, r);
        ctx.fill();
      };
      box(43, 77, 814, 573, "#122d35", 30);
      box(60, 90, 780, 550, "#e0b889", 24);
      box(80, 110, 740, 490, "#e9d2ad", 16);
      ctx.save();
      ctx.beginPath();
      ctx.rect(80, 110, 740, 490);
      ctx.clip();
      ctx.strokeStyle = "#c6a47b55";
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(80 + i * 55, 110);
        ctx.lineTo(80 + i * 55, 600);
        ctx.stroke();
      }
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(80, 110 + i * 55);
        ctx.lineTo(820, 110 + i * 55);
        ctx.stroke();
      }
      ctx.restore();
      const toyDraw = (toy, tx, ty, size = 66) => {
        ctx.fillStyle = "#624a3433";
        ctx.beginPath();
        ctx.ellipse(tx, ty + 26, 33, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(toy.icon, tx, ty);
      };
      state.toys.forEach((t) => {
        if (!(phase === "lift" && result?.toy === t))
          toyDraw(t, 80 + t.x * 740, 110 + t.y * 490);
      });
      const cx = 80 + x * 740,
        cy = 110 + y * 490;
      ctx.strokeStyle = "#356b6b66";
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(cx, 110);
      ctx.lineTo(cx, 600);
      ctx.moveTo(80, cy);
      ctx.lineTo(820, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#285e68";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + 6,
        state.radius * 740,
        state.radius * 490,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      box(46, 42, 808, 17, "#819da6", 7);
      box(46, 48, 808, 5, "#c1d1cf", 3);
      const descent =
        phase === "drop"
          ? Math.min(elapsed / 0.85, 1)
          : phase === "lift"
            ? Math.max(0, 1 - elapsed / 1.2)
            : 0;
      const clawY = cy - 65 + descent * 60;
      ctx.strokeStyle = "#a7c4c9";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx, 59);
      ctx.lineTo(cx, clawY - 23);
      ctx.stroke();
      box(cx - 27, 30, 54, 38, "#f2bb62", 9);
      if (phase === "lift" && result?.toy)
        toyDraw(result.toy, cx, clawY + 27, 60);
      const closed = phase === "lift";
      ctx.strokeStyle = "#243c48";
      ctx.lineWidth = 13;
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, clawY - 8);
        ctx.lineTo(cx + side * (closed ? 22 : 36), clawY + 17);
        ctx.lineTo(cx + side * (closed ? 10 : 27), clawY + 39);
        ctx.stroke();
      }
      ctx.strokeStyle = "#d8e8e6";
      ctx.lineWidth = 7;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, clawY - 8);
        ctx.lineTo(cx + side * (closed ? 22 : 36), clawY + 17);
        ctx.lineTo(cx + side * (closed ? 10 : 27), clawY + 39);
        ctx.stroke();
      }
      box(cx - 16, clawY - 22, 32, 24, "#f2bb62", 7);
      ctx.fillStyle = "#8c6246";
      ctx.font = "bold 17px monospace";
      ctx.textAlign = "center";
      ctx.fillText("T O Y S  &  T R E A S U R E S", 450, 622);
      raf = requestAnimationFrame(draw);
    };
    const close = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      panel.close();
      panel.remove();
      panel = null;
      previousFocus?.focus();
    };
    q("[data-pause-home]").onclick = close;
    const results = gameResults(
      panel,
      "Toy Box Rescue",
      () => {
        reset();
        canvas.focus();
      },
      close,
    );
    bindDialogEscape(panel, () => {
      if (phase === "finished") close();
      else pause(!paused);
    });
    reset();
    raf = requestAnimationFrame(draw);
  };
}
