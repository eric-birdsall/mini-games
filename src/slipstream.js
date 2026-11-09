import { gameResults } from "./gameResults.js";
import { pauseScreen, setPauseScreen } from "./pauseActions.js";
import * as T from "three";
import {
  course,
  racer,
  stepRacer,
  botInput,
  COURSE_LENGTH,
} from "../shared/slipstream.js";
import {
  animateAvatar,
  createAvatar,
  disposeAvatar,
  releaseAvatar,
} from "./avatars.js";
import "./slipstream.css";

export function installSlipstream(
  getDifficulty = () => "normal",
  getAvatar = () => undefined,
) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "slipstream";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML =
    "<strong>Slipstream</strong><small>Auto-sprint. Steer onto slip ’n slides for speed and avoid the mudpiles. Race against three rivals.</small>";
  games.append(entry);
  let overlay;
  entry.onclick = () => {
    if (overlay) return;
    const difficulty = getDifficulty();
    document.exitPointerLock?.();
    overlay = document.createElement("section");
    overlay.id = "slipstream";
    overlay.tabIndex = -1;
    overlay.innerHTML = `<div class="ss-top"><span>MINI GAMES / SLIPSTREAM</span><button data-exit>BACK TO MINI GAMES ↗</button></div><div class="ss-hud" hidden></div>${pauseScreen("Slipstream", "Steer with A / D. Ride the blue slides for speed and dodge the mud. In local play, player two steers with the arrow keys.")}<div class="ss-foot" hidden>A / D STRAFE · I J K L LOOK · BLUE SLIP ’N SLIDES BOOST · BROWN MUD SLOWS · ESC PAUSE</div>`;
    document.body.append(overlay);
    // Controller: steer while racing; navigate buttons otherwise (padBridge).
    overlay.padPlaying = () => running && !paused;
    let mode = "ai",
      running = false,
      paused = false,
      countdown = 3,
      elapsed = 0,
      players = [],
      models = [],
      last = performance.now(),
      raf;
    const looks = [
      { yaw: 0, pitch: 0.36 },
      { yaw: 0, pitch: 0.36 },
    ];
    const keys = new Set(),
      items = course();
    const scene = new T.Scene();
    scene.background = new T.Color("#b9def2");
    scene.fog = new T.Fog("#b9def2", 300, 950);
    // All gameplay coordinates follow the slope, including racers and cameras.
    const hillside = new T.Group();
    hillside.rotation.x = -Math.atan(0.48);
    scene.add(hillside);
    hillside.updateMatrixWorld(true);
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    overlay.prepend(renderer.domElement);
    scene.add(new T.HemisphereLight(0xf5f5e6, 0x647976, 2.5));
    const sun = new T.DirectionalLight(0xffead1, 3);
    sun.position.set(-10, 30, 15);
    scene.add(sun);
    const camera = new T.PerspectiveCamera(65, 1, 0.1, 1400);
    const box = (x, y, z, w, h, d, color, parent = hillside) => {
      const m = new T.Mesh(
        new T.BoxGeometry(w, h, d),
        new T.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
      m.position.set(x, y, -z);
      parent.add(m);
      return m;
    };
    box(0, -1.1, 205, 180, 2, 470, "#80aa50");
    box(0, -0.18, 210, 12, 0.3, 450, "#a4c66c");
    // Low wooden fences frame the run without hiding the valley below.
    for (const side of [-1, 1]) {
      box(side * 6.5, 0.55, 210, 0.16, 0.14, 440, "#ead9ad");
      for (let z = -8; z < 440; z += 12)
        box(side * 6.5, 0.4, z, 0.22, 0.95, 0.22, "#b89060");
    }
    const upright = (x, z) => {
      const group = new T.Group();
      group.position.copy(
        new T.Vector3(x, 0, -z).applyMatrix4(hillside.matrixWorld),
      );
      scene.add(group);
      return group;
    };
    for (let i = 0; i < 36; i++) {
      const side = i % 2 ? -1 : 1;
      const tree = upright(side * (14 + ((i * 7) % 45)), i * 12);
      box(0, 2, 0, 0.65, 4, 0.65, "#89623e", tree);
      const leaves = new T.Mesh(
        new T.ConeGeometry(3 + (i % 3), 8, 8),
        new T.MeshStandardMaterial({ color: i % 2 ? "#47783d" : "#62954c" }),
      );
      leaves.position.y = 6;
      tree.add(leaves);
    }
    // An upright house stays visible from the hilltop and grows as you descend.
    const house = upright(0, 470);
    box(0, -0.3, 0, 100, 0.5, 85, "#83ad57", house);
    box(0, 5, 0, 23, 10, 15, "#f5dfac", house);
    const roof = new T.Mesh(
      new T.CylinderGeometry(15, 15, 19, 3),
      new T.MeshStandardMaterial({ color: "#a3503e", flatShading: true }),
    );
    roof.rotation.z = Math.PI / 2;
    roof.position.y = 12;
    house.add(roof);
    box(7, 14, 0, 2, 6, 2, "#a07156", house);
    box(0, 2.4, -7.6, 3, 4.8, 0.15, "#6e9caa", house);
    for (const x of [-7, 7]) {
      box(x, 5.5, -7.6, 4, 3.5, 0.2, "#8fc9dd", house);
      box(x, 5.5, -7.75, 0.16, 3.5, 0.1, "#fff4d7", house);
      box(x, 5.5, -7.75, 4, 0.16, 0.1, "#fff4d7", house);
    }
    box(0, 0.05, -20, 4, 0.1, 25, "#d7c7a3", house);
    const arrows = [];
    for (const o of items) {
      if (o.kind === "slide") {
        box(o.x, 0.035, o.z, o.width, 0.09, o.length, "#32a9dd");
        for (let j = -o.length / 2 + 2; j < o.length / 2 - 1; j += 2)
          for (const side of [-1, 1]) {
            const a = box(
              o.x + side * 0.38,
              0.1,
              o.z + j,
              0.12,
              0.025,
              1,
              "#67e2cc",
            );
            a.rotation.y = side * 0.65;
            arrows.push({ mesh: a, z: o.z + j });
          }
      } else if (o.kind === "mud") {
        const mud = new T.Mesh(
          new T.SphereGeometry(1, 20, 12),
          new T.MeshStandardMaterial({ color: "#70452c", roughness: 0.95 }),
        );
        mud.position.set(o.x, 0.04, -o.z);
        mud.scale.set(o.width / 2, 0.22, o.length / 2);
        hillside.add(mud);
        for (const offset of [-0.7, 0.5]) {
          const lump = mud.clone();
          lump.position.set(o.x + offset, 0.08, -o.z + offset);
          lump.scale.set(0.6, 0.26, 0.8);
          hillside.add(lump);
        }
      }
    }
    for (let x = -5.5; x < 6; x++)
      for (let z = 0; z < 2; z++)
        box(
          x,
          0.03,
          COURSE_LENGTH + z,
          1,
          0.08,
          1,
          (Math.floor(x + 5.5) + z) % 2 ? "#edf0dd" : "#303c40",
        );
    box(0, 5, COURSE_LENGTH, 12, 0.6, 0.6, "#e6d3a4");
    for (const x of [-6, 6]) box(x, 2.5, COURSE_LENGTH, 0.4, 5, 0.4, "#475d63");
    const $ = (s) => overlay.querySelector(s);
    function best() {
      try {
        return (
          Number(localStorage.getItem("minigames-slipstream-hillside-best")) ||
          0
        );
      } catch {
        return 0;
      }
    }
    function start() {
      results.hide();
      models.forEach((m) => {
        hillside.remove(m);
        disposeAvatar(m);
      });
      models = [];
      players = [racer("YOU", -1.5)];
      if (mode === "local") players.push(racer("PLAYER 2", 1.5));
      if (mode === "ai")
        for (let i = 0; i < 3; i++)
          players.push(racer(["RELAY", "QUAY", "SWITCH"][i], [-4, 1.5, 4][i]));
      players.forEach((p, i) => {
        const actor = createAvatar(
          i === 0 ? "attacker" : "defender",
          i === 0 ? getAvatar() : undefined,
          false,
        );
        hillside.add(actor);
        models.push(actor);
      });
      looks.forEach((look) => {
        look.yaw = 0;
        look.pitch = 0.36;
      });
      elapsed = 0;
      countdown = 3;
      running = true;
      $(".ss-top").hidden = true;
      setPaused(false);
      keys.clear();
      $(".ss-foot").textContent =
        `${mode === "local" ? "P1 A / D · P2 ← / → · P1 I J K L LOOK · P2 NUMPAD 8/4/5/6 LOOK" : "A / D STRAFE · I J K L LOOK"} · BLUE SLIP ’N SLIDES BOOST · BROWN MUD SLOWS · ESC PAUSE`;

      $(".ss-hud").hidden = false;
      $(".ss-foot").hidden = false;
    }
    function finish() {
      running = false;
      const ranked = [...players].sort(
        (a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity) || b.z - a.z,
      );
      const p = players[0];
      for (const [i, racer] of players.entries())
        models[i].userData.outcome =
          racer === ranked[0] && racer.finish !== null ? "win" : "lose";
      let record = false;
      if (mode === "trial" && p.finish && (!best() || p.finish < best())) {
        record = true;
        try {
          localStorage.setItem(
            "minigames-slipstream-hillside-best",
            String(p.finish),
          );
        } catch {}
      }
      results.show(
        record
          ? "New record."
          : mode === "trial"
            ? "Run complete."
            : ranked[0].name + " wins.",
        mode === "trial" ? "Time trial" : "Race results",
        ranked.map((r, i) => [
          r.finish === null ? "DNF" : `${r.finish.toFixed(2)} s`,
          `${i + 1}. ${r.name} · ${r.mudEntries} MUDPILES`,
        ]),
      );
    }

    const results = gameResults(
      overlay,
      "Slipstream",
      start,
      () => $("[data-exit]").click(),
      `
      <div class="result-options">
        <button type="button" class="text-button" data-mode="ai">RACE RIVALS</button>
        <button type="button" class="text-button" data-mode="trial">TIME TRIAL</button>
        <button type="button" class="text-button" data-mode="local">LOCAL / 2P</button>
      </div>`,
    );
    overlay.querySelectorAll("[data-mode]").forEach((button) => {
      button.onclick = () => {
        mode = button.dataset.mode;
        start();
      };
    });

    function setPaused(value) {
      paused = value;
      keys.clear();
      setPauseScreen(overlay, paused, overlay);
    }
    $("[data-pause-resume]").onclick = () => setPaused(false);
    $("[data-pause-restart]").onclick = start;
    $("[data-pause-home]").onclick = () => $("[data-exit]").click();

    function key(e) {
      if (!overlay) return;
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "KeyI",
          "KeyJ",
          "KeyK",
          "KeyL",
          "Numpad8",
          "Numpad4",
          "Numpad5",
          "Numpad6",
          "KeyA",
          "KeyD",

          "Escape",
        ].includes(e.code)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === "keydown") {
          keys.add(e.code);
          if (e.code === "Escape" && !e.repeat && running) setPaused(!paused);
        } else keys.delete(e.code);
      }
    }
    document.addEventListener("keydown", key, true);
    document.addEventListener("keyup", key, true);
    const blur = () => {
      keys.clear();
      if (running && !paused) setPaused(true);
    };
    window.addEventListener("blur", blur);
    const resize = () => renderer.setSize(innerWidth, innerHeight);
    resize();
    window.addEventListener("resize", resize);
    $("[data-exit]").onclick = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("keyup", key, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", resize);
      models.forEach(releaseAvatar);
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      overlay.remove();
      overlay = null;
      document.querySelector("#deploy")?.focus();
    };
    const input = (i) => ({
      steer:
        i === 0
          ? Number(keys.has("KeyD")) - Number(keys.has("KeyA"))
          : Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
    });
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (running && !paused) {
        if (countdown > 0) countdown -= dt;
        else {
          players.forEach((r, i) =>
            stepRacer(
              r,
              i === 0 || (mode === "local" && i === 1)
                ? input(i)
                : botInput(r, items, i, difficulty),
              dt,
              elapsed,
              items,
            ),
          );
          elapsed += dt;
          if (players.every((r) => r.finish !== null) || elapsed > 75) finish();
        }
      }
      players.forEach((r, i) => {
        const m = models[i];
        m.position.set(r.x, 0, -r.z);
        animateAvatar(
          m,
          {
            crouch: false,
            moveSpeed:
              running && !paused && countdown <= 0 && r.finish === null
                ? r.speed
                : 0,
          },
          paused ? 0 : dt,
          m.userData.outcome,
        );
        m.rotation.z = 0;
      });
      arrows.forEach((a) => (a.mesh.position.z = -a.z - ((elapsed * 8) % 1)));
      if (running)
        $(".ss-hud").innerHTML =
          `<span>${paused ? "PAUSED / ESC TO RESUME" : countdown > 0 ? `START IN ${Math.ceil(countdown)}` : elapsed.toFixed(2) + " s"}</span>` +
          players
            .slice(0, mode === "local" ? 2 : 1)
            .map(
              (r) =>
                `<span>${r.name} / ${Math.floor(r.z)} OF 420 M<br><b>${r.speed.toFixed(1)} m/s</b> · ${r.chain ? "BOOST ×" + r.chain : "FIND THE SLIP ’N SLIDES"}${r.mud ? " · MUD / SLOWED" : ""}</span>`,
            )
            .join("");
      renderer.setScissorTest(true);
      const views = mode === "local" && players.length ? 2 : 1;
      for (let i = 0; i < views; i++) {
        const width = innerWidth / views;
        renderer.setViewport(i * width, 0, width, innerHeight);
        renderer.setScissor(i * width, 0, width, innerHeight);
        const r = players[i] || { x: 0, z: 5 };
        camera.aspect = width / innerHeight;
        camera.updateProjectionMatrix();
        const look = looks[i];
        const codes =
          i === 0
            ? ["KeyI", "KeyJ", "KeyK", "KeyL"]
            : ["Numpad8", "Numpad4", "Numpad5", "Numpad6"];
        if (!paused) {
          look.yaw +=
            (Number(keys.has(codes[1])) - Number(keys.has(codes[3]))) *
            dt *
            1.5;
          look.pitch = T.MathUtils.clamp(
            look.pitch +
              (Number(keys.has(codes[2])) - Number(keys.has(codes[0]))) * dt,
            -0.08,
            1.25,
          );
        }
        const distance = 9;
        camera.position.set(
          r.x + Math.sin(look.yaw) * Math.cos(look.pitch) * distance,
          1.15 + Math.sin(look.pitch) * distance,
          -r.z + Math.cos(look.yaw) * Math.cos(look.pitch) * distance,
        );
        camera.position.applyMatrix4(hillside.matrixWorld);
        camera.lookAt(
          new T.Vector3(r.x, 1.15, -r.z).applyMatrix4(hillside.matrixWorld),
        );
        renderer.render(scene, camera);
      }
    }
    start();
    raf = requestAnimationFrame(frame);
  };
}
