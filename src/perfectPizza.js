import preview from "./assets/modes/perfect-pizza.jpg";
import voiceURL from "./assets/pizza/voice.mp3";
import voiceMap from "./assets/pizza/voice.json";
import { gameResults } from "./gameResults.js";
import {
  bindDialogEscape,
  pauseScreen,
  setPauseScreen,
} from "./pauseActions.js";
import { createPerfectPizzaScene } from "./perfectPizzaScene.js";
import {
  COOK_TIME,
  IDLE_HINT,
  ORDERS_PER_ROUND,
  cookPhase,
  countLine,
  countedLine,
  createKitchen,
  currentStep,
  doneness,
  orderLine,
  rng,
  roundOrders,
  sayLine,
  stationsFor,
  stepLine,
  tap,
  tick,
  wanted,
  wrongLine,
} from "../shared/perfectPizza.js";
import { AVATARS, COLORS, avatarChoice } from "../shared/avatars.js";
import "./perfectPizza.css";

const HOW_TO =
  "A customer holds up a picture of the pizza they'd like. Make it! Walk your chef around the kitchen with WASD or the arrow keys, and press E (or Space) to use whatever you're standing next to. Every pizza is made the same way: pick up the dough and put it on the pan, scoop the sauce and put it on the pizza, pick up the cheese and put it on the dough, then add the toppings in the picture, counting them to match. The toppings change with every order. Then pick up the pizza and put it in the oven. While it bakes, a ring fills up: when it's full, press E at the oven to take it out, then carry it to the pan and press E to put it down. Wait too long and it burns, so you make a new one. If you use the wrong thing, you'll hear what to do and the right thing wiggles. On a touch screen, use the arrows (or tap where to walk) and the ✋ button. On a controller, the stick walks and A uses.";
// Seconds from a customer walking in to them asking, and from serving to
// the next customer.
const ASK_AFTER = 1.6;
const NEXT_AFTER = 3.4;

function sounds() {
  const audio = window.AudioContext ? new AudioContext() : null;
  const tone = (freq, start, length, type = "sine", volume = 0.1, slide) => {
    if (audio?.state !== "running") return;
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
  const noise = (volume, length, cutoff, type = "bandpass") => {
    if (audio?.state !== "running") return;
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * length),
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  };
  const SCALE = [523, 587, 659, 784, 880, 1047];
  return {
    audio,
    resume: () => audio?.resume().catch(() => {}),
    plop: () => tone(300, 0, 0.14, "sine", 0.1, 520),
    pour: () => noise(0.12, 0.5, 900, "lowpass"),
    sizzle: () => noise(0.05, 0.9, 5000, "highpass"),
    shake: () =>
      [0, 0.06, 0.12].forEach((t) =>
        setTimeout(() => noise(0.08, 0.05, 3000), t * 1000),
      ),
    // One note higher per topping, for counting.
    topping: (n) => tone(SCALE[Math.min(n - 1, 5)], 0, 0.22, "triangle", 0.09),
    // Soft "hmm, not that one". Never a buzz.
    other: () => tone(520, 0, 0.18, "sine", 0.07, 660),
    ding: () =>
      [1319, 1760].forEach((f, i) => tone(f, i * 0.12, 0.6, "sine", 0.1)),
    whoosh: () => noise(0.08, 0.3, 1400),
    served: () =>
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(f, i * 0.09, 0.26, "triangle", 0.09),
      ),
    done: () =>
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
        tone(f, i * 0.11, 0.3, "triangle", 0.09),
      ),
  };
}

// Speaks a line ({text, keys}). The recorded voice when its clips are
// loaded (Kokoro, see tools/make_pizza_voice.py); until then, or if they
// can't load, the browser's own speech reads the text.
function speaker(audio) {
  const synth = window.speechSynthesis;
  let voice;
  const chooseVoice = () => {
    const voices = synth?.getVoices() || [];
    const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
    voice =
      english.find((v) => /samantha|natural|aria|jenny|female/i.test(v.name)) ||
      english.find((v) => v.localService) ||
      english[0];
  };
  chooseVoice();
  synth?.addEventListener?.("voiceschanged", chooseVoice);

  let clips = null;
  let playing = [];
  if (audio)
    fetch(voiceURL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((bytes) => audio.decodeAudioData(bytes))
      .then((buffer) => (clips = buffer))
      .catch(() => {});

  function hush() {
    for (const source of playing)
      try {
        source.stop();
      } catch {}
    playing = [];
    synth?.cancel();
  }

  function playClips(keys) {
    let at = audio.currentTime + 0.05;
    for (const key of keys) {
      const [start, length] = voiceMap[key];
      const source = audio.createBufferSource();
      source.buffer = clips;
      source.connect(audio.destination);
      source.start(at, Math.max(0, start - 0.04), length + 0.1);
      playing.push(source);
      at += length + 0.14;
    }
  }

  return {
    say({ text, keys }) {
      hush();
      if (clips && audio.state === "running" && keys.every((k) => voiceMap[k]))
        return playClips(keys);
      if (!synth) return;
      const line = new SpeechSynthesisUtterance(text);
      if (voice) line.voice = voice;
      line.rate = 0.9;
      line.pitch = 1.1;
      synth.speak(line);
    },
    hush,
    stop() {
      hush();
      synth?.removeEventListener?.("voiceschanged", chooseVoice);
    },
  };
}

const join = (...lines) => {
  const list = lines.filter(Boolean);
  return {
    text: list.map((l) => l.text).join(" "),
    keys: list.flatMap((l) => l.keys),
  };
};

export function installPerfectPizza(getLevel, getAvatar) {
  const games = document.querySelector('.choice-row[aria-label="Game"]');
  if (!games) return;
  const entry = document.createElement("button");
  entry.className = "choice";
  entry.dataset.game = "perfectpizza";
  entry.setAttribute("aria-pressed", "false");
  entry.innerHTML = `<span class="map-thumb"><img src="${preview}" alt="A little pizza kitchen with dough, a pot of sauce and an oven" draggable="false"></span><strong>Perfect Pizza</strong><small>Look at the picture and make the pizza! Dough, sauce, cheese, then count on the toppings and bake it.</small>`;
  games.append(entry);
  entry.onclick = () => open(avatarChoice(getAvatar()));
}

function open(avatar) {
  document.exitPointerLock?.();
  const dialog = document.createElement("dialog");
  dialog.className = "perfect-pizza";
  dialog.setAttribute("aria-label", "Perfect Pizza");
  dialog.innerHTML = `
    <header><strong>Perfect Pizza</strong><div><button data-exit>Back to games</button></div></header>
    <div class="pizza-field">
      <canvas aria-label="A pizza kitchen with dough, a pot of marinara, an oven, cheese and toppings"></canvas>
      <button class="pizza-card" data-card hidden aria-label="Hear the order again">
        <span class="pizza-label">Order</span>
        <img data-card-img alt="" draggable="false">
        <span class="pizza-again" aria-hidden="true">🔊</span>
      </button>
      <ol class="pizza-plates" data-plates hidden aria-label="Pizzas served"></ol>
      <div class="pizza-timer" data-timer hidden aria-hidden="true"><i></i><b></b></div>
      <div class="pizza-use" data-use-tip hidden aria-hidden="true"></div>
      <div class="pizza-pad" data-touch hidden>
        <button type="button" data-dir="up" aria-label="Walk to the back">▲</button>
        <button type="button" data-dir="left" aria-label="Walk left">◀</button>
        <button type="button" data-dir="down" aria-label="Walk to the front">▼</button>
        <button type="button" data-dir="right" aria-label="Walk right">▶</button>
      </div>
      <button type="button" class="pizza-use-button" data-use hidden aria-label="Use it">✋</button>
      <section class="pizza-panel">
        <h2>Perfect Pizza</h2>
        <p>Customers hold up a picture of the pizza they'd like. Make it for them! Carry the dough to the pan, then the sauce, then the cheese, and count on the toppings in the picture. Bake it, and take it out before it burns. ${ORDERS_PER_ROUND} pizzas to make.</p>
        <button class="primary" data-play>Let's make pizza!</button>
        <small class="pizza-keys">WASD / arrows to walk · E to use · Controller: stick and A</small>
      </section>
    </div>
    <footer>
      <span data-message role="status"></span>
      <button data-pause hidden>Pause / Esc</button>
    </footer>
    ${pauseScreen("Perfect Pizza", HOW_TO)}`;
  document.body.append(dialog);
  const get = (key) => dialog.querySelector(`[data-${key}]`);
  const canvas = dialog.querySelector("canvas");
  canvas.tabIndex = -1;
  const panel = dialog.querySelector(".pizza-panel");
  const card = get("card");
  const timer = get("timer");
  const sfx = sounds();
  const voice = speaker(sfx.audio);

  // ready: start panel. arriving: a customer walking in. playing: cooking.
  // serving: the pizza going to the customer. paused. finished.
  let state = "ready";
  let pausedFrom = null;
  let random = rng(1);
  let orders = [];
  let served = 0;
  let kitchen = null;
  let toppingsCounted = 0;
  let elapsed = 0;
  let sinceAction = 0;
  let timers = [];
  let previous = 0;
  let frame;
  let messageTimer;
  let lastWaiting = -10;
  // Controller: stick / D-pad move the ring, A picks (padBridge).
  dialog.padPlaying = () =>
    state === "playing" || state === "serving" || state === "arriving";

  function say(line) {
    if (!line?.keys.length) return;
    get("message").textContent = line.text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (get("message").textContent = ""), 5000);
    voice.say(line);
  }

  const later = (seconds, fn) => timers.push({ at: elapsed + seconds, fn });

  function plates() {
    get("plates").replaceChildren(
      ...orders.map((o, i) => {
        const item = document.createElement("li");
        if (i < served) {
          item.classList.add("full");
          item.textContent = "🍕";
        }
        return item;
      }),
    );
  }

  function customerChoice() {
    const others = AVATARS.filter((c) => c !== avatar.character);
    const colors = Object.keys(COLORS);
    return {
      character: others[Math.floor(random() * others.length)],
      color: colors[Math.floor(random() * colors.length)],
    };
  }

  function nextOrder() {
    const order = orders[served];
    kitchen = createKitchen(order);
    const { front } = stationsFor(order, random);
    const picture = scene.thumbnail(order);
    get("card-img").src = picture;
    card.hidden = true;
    scene.setOrder(order, front, picture);
    scene.customerIn(customerChoice());
    scene.hint(null);
    state = "arriving";
    if (served > 0) say(sayLine("next"));
    later(ASK_AFTER + (served > 0 ? 0.6 : 0), () => {
      card.hidden = false;
      card.classList.remove("pop");
      void card.offsetWidth;
      card.classList.add("pop");
      state = "playing";
      sinceAction = 0;
      say(join(orderLine(order), stepLine(kitchen)));
    });
  }

  // Say the order and what to do now (the card, or a long wait).
  function remind() {
    if (!kitchen) return;
    const step = currentStep(kitchen);
    if (step?.kind === "cook" && cookPhase(kitchen.cook.t) !== "cooking")
      return say(join(orderLine(kitchen.order), sayLine("ready")));
    say(join(orderLine(kitchen.order), stepLine(kitchen)));
  }

  function handle(station) {
    if (state !== "playing" || !station) return false;
    const before = currentStep(kitchen);
    const events = tap(kitchen, station);
    const lines = [];
    let progressed = false;
    for (const event of events) {
      switch (event.type) {
        case "pick":
          sfx.plop();
          scene.pick(event.item);
          progressed = true;
          break;
        case "place":
          if (event.item === "pizza" || event.item === "baked") sfx.whoosh();
          else if (event.item === "sauce") sfx.pour();
          else if (event.item === "cheese") sfx.shake();
          else sfx.plop();
          scene.place(event.item);
          progressed = true;
          break;
        case "take":
          sfx.whoosh();
          scene.take();
          progressed = true;
          break;
        case "cooking":
          setTimeout(() => sfx.sizzle(), 450);
          lines.push(sayLine("waiting"));
          break;
        case "topping":
          sfx.topping(event.n);
          scene.topping(event.topping, event.n);
          toppingsCounted++;
          progressed = true;
          if (!events.some((e) => e.type === "counted"))
            lines.push(countLine(event.n));
          break;
        case "counted":
          lines.push(countedLine(event.count));
          break;
        case "step":
          lines.push(stepLine(kitchen, event.step));
          break;
        case "served":
          lines.push(sayLine("served"));
          serve();
          break;
        case "notyet":
          sfx.other();
          lines.push(sayLine("notyet"));
          break;
        case "waiting":
          // Don't nag on every tap while it cooks.
          if (elapsed - lastWaiting > 3) {
            lines.push(sayLine("waiting"));
            lastWaiting = elapsed;
          }
          break;
        case "enough":
          sfx.other();
          lines.push(sayLine("enough"));
          scene.wiggle(station);
          break;
        case "wrong":
          sfx.other();
          scene.wiggle(station);
          event.want.forEach((id) => setTimeout(() => scene.wiggle(id), 250));
          scene.hint(event.want[0]);
          lines.push(wrongLine(kitchen));
          break;
      }
    }
    if (progressed || currentStep(kitchen) !== before) {
      sinceAction = 0;
      scene.hint(null);
    }
    say(join(...lines));
    return progressed;
  }

  function serve() {
    state = "serving";
    timer.hidden = true;
    card.hidden = true;
    scene.hint(null);
    later(0.5, () => {
      sfx.served();
      scene.serve();
      served++;
      plates();
    });
    later(NEXT_AFTER - 1, () => scene.customerOut());
    later(NEXT_AFTER, () => (served >= orders.length ? finish() : nextOrder()));
  }

  // The ring over the oven: fills green while it bakes, full and green to
  // orange when ready, red and pulsing when it's about to burn.
  function showTimer() {
    const cook = kitchen?.cook;
    if (!cook || state === "serving") {
      timer.hidden = true;
      // Out of the oven: keep it as brown as it got.
      scene.cooking(null, 0);
      return;
    }
    const phase = cookPhase(cook.t);
    const at = scene.screenOf("oven", true);
    timer.hidden = !at;
    if (!at) return;
    timer.style.left = `${at.x}px`;
    timer.style.top = `${at.y}px`;
    const fill = phase === "cooking" ? cook.t / COOK_TIME : 1;
    let color = "#3fbf5a";
    if (phase === "ready") {
      const late = (cook.t - COOK_TIME) / 8;
      color = `color-mix(in srgb, #ff9f1c ${Math.round(late * 100)}%, #3fbf5a)`;
    } else if (phase === "warn") color = "#ef3e36";
    timer.style.setProperty("--fill", `${fill * 360}deg`);
    timer.style.setProperty("--ring", color);
    timer.dataset.phase = phase;
    timer.querySelector("b").textContent =
      phase === "cooking" ? "" : phase === "warn" ? "🔥" : "🔔";
    scene.cooking(doneness(cook.t), phase === "warn" ? 2 : 1);
  }

  function step(dt) {
    if (state === "ready" || state === "finished" || state === "paused") return;
    elapsed += dt;
    if (state === "playing") {
      for (const event of tick(kitchen, dt)) {
        if (event.type === "ready") {
          sfx.ding();
          say(sayLine("ready"));
          scene.hint("oven");
        } else if (event.type === "warn") {
          say(sayLine("warn"));
          scene.wiggle("oven");
        } else if (event.type === "burnt") {
          sfx.whoosh();
          scene.burnt();
          scene.hint(null);
          sinceAction = 0;
          voice.hush();
          later(1.2, () => say(join(sayLine("burnt"), stepLine(kitchen))));
        }
      }
      const cooking = currentStep(kitchen)?.kind === "cook";
      if (!cooking) {
        sinceAction += dt;
        if (sinceAction >= IDLE_HINT) {
          sinceAction = 0;
          scene.hint(wanted(kitchen)[0]);
          wanted(kitchen).forEach((id) => scene.wiggle(id));
          say(stepLine(kitchen));
        }
      }
    }
    showTimer();
    const due = timers.filter((t) => t.at <= elapsed);
    timers = timers.filter((t) => t.at > elapsed);
    for (const t of due) t.fn();
  }

  // Walking, and the "use" tip over whatever the chef can reach.
  const tip = get("use-tip");
  function walk() {
    const can = ["playing", "serving", "arriving"].includes(state);
    const on = (dir) => can && (keys[dir] || buttons[dir]);
    scene.setMove(
      (on("right") ? 1 : 0) - (on("left") ? 1 : 0),
      (on("down") ? 1 : 0) - (on("up") ? 1 : 0),
    );
    const near = state === "playing" ? scene.reach() : null;
    scene.cursor(near);
    const at = near && scene.screenOf(near, true);
    tip.hidden = !at;
    if (at) {
      tip.textContent = touch ? "✋" : "E";
      tip.style.left = `${at.x}px`;
      tip.style.top = `${at.y}px`;
    }
    get("use").classList.toggle("ready", Boolean(near));
  }

  function loop(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    walk();
    step(dt);
    scene.draw(state === "paused" ? 0 : dt);
    if (state !== "paused") frame = requestAnimationFrame(loop);
  }

  function finish() {
    state = "finished";
    card.hidden = true;
    timer.hidden = true;
    get("pause").hidden = true;
    scene.cursor(null);
    sfx.done();
    voice.say(sayLine("done"));
    results.show(
      "Perfect pizzas!",
      `You made all ${orders.length} pizzas: ${"🍕 ".repeat(orders.length).trim()}`,
      [
        [String(orders.length), "PIZZAS"],
        [String(toppingsCounted), "TOPPINGS COUNTED"],
      ],
    );
  }

  function start(reset) {
    results.hide();
    sfx.resume();
    panel.hidden = true;
    dialog.querySelector("header").hidden = true;
    get("plates").hidden = false;
    get("pause").hidden = false;
    setPauseScreen(dialog, false, canvas);
    canvas.focus({ preventScroll: true });
    if (reset) {
      random = rng((Math.random() * 2 ** 32) >>> 0);
      orders = roundOrders(random);
      served = 0;
      toppingsCounted = 0;
      elapsed = 0;
      timers = [];
      plates();
      nextOrder();
    } else {
      state = pausedFrom || "playing";
      if (state === "playing") remind();
    }
    pausedFrom = null;
    cancelAnimationFrame(frame);
    previous = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function pause() {
    if (!["playing", "serving", "arriving"].includes(state)) return;
    pausedFrom = state;
    state = "paused";
    voice.hush();
    release();
    setPauseScreen(dialog, true);
  }

  const results = gameResults(
    dialog,
    "Perfect Pizza",
    () => start(true),
    () => dialog.close(),
  );
  get("play").onclick = () => start(true);
  get("pause-resume").onclick = () => start(false);
  get("pause-restart").onclick = () => start(true);
  get("pause-home").onclick = () => dialog.close();
  get("pause").onclick = pause;
  get("exit").onclick = () => dialog.close();
  card.onclick = () => {
    if (state === "playing") remind();
    canvas.focus({ preventScroll: true });
  };
  bindDialogEscape(dialog, () => {
    if (state === "paused") start(false);
    else if (["playing", "serving", "arriving"].includes(state)) pause();
    else dialog.close();
  });

  // --- Walking and the one "use" button ----------------------------------------
  // WASD / arrows walk (a controller's stick arrives as WASD through the pad
  // bridge); E, Space or Enter (a controller's A) uses whatever the chef is
  // standing next to.
  const keys = { up: false, down: false, left: false, right: false };
  const buttons = { up: false, down: false, left: false, right: false };
  function release() {
    for (const dir of Object.keys(keys)) keys[dir] = buttons[dir] = false;
  }
  function use() {
    if (state !== "playing") return;
    const near = scene.reach();
    if (!near) {
      // Nothing close enough: show where to go and say what to do.
      const want = wanted(kitchen)[0];
      scene.hint(want);
      scene.wiggle(want);
      say(stepLine(kitchen));
      return;
    }
    scene.poke(near);
    handle(near);
  }
  const directions = {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
  };
  dialog.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (!["playing", "serving", "arriving"].includes(state)) return;
    if (event.target === card && (event.key === " " || event.key === "Enter"))
      return;
    const key = event.key.toLowerCase();
    if (directions[key]) {
      event.preventDefault();
      keys[directions[key]] = true;
    } else if (key === "e" || key === " " || key === "enter") {
      event.preventDefault();
      if (!event.repeat) use();
    }
  });
  dialog.addEventListener("keyup", (event) => {
    event.stopPropagation();
    const dir = directions[event.key.toLowerCase()];
    if (dir) keys[dir] = false;
  });

  // Tap a thing (or the floor) and the chef walks over to it. Tapping never
  // uses anything: that's the button's job.
  canvas.addEventListener("pointerdown", (event) => {
    if (!["playing", "serving", "arriving"].includes(state)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const station = scene.stationAt(event.clientX, event.clientY);
    if (station) scene.walkTo(station);
    else scene.walkToScreen(event.clientX, event.clientY);
  });

  // On touch screens: hold-to-walk arrows and a big ✋ use button.
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  get("touch").hidden = !touch;
  get("use").hidden = !touch;
  for (const button of dialog.querySelectorAll("[data-dir]")) {
    const dir = button.dataset.dir;
    const hold = (on) => (event) => {
      event.preventDefault();
      buttons[dir] = on;
      if (on) button.setPointerCapture?.(event.pointerId);
    };
    button.addEventListener("pointerdown", hold(true));
    for (const end of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(end, hold(false));
  }
  get("use").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    use();
  });

  window.addEventListener("blur", pause);
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    clearTimeout(messageTimer);
    window.removeEventListener("blur", pause);
    voice.stop();
    scene.dispose();
    sfx.audio?.close().catch(() => {});
    dialog.remove();
    document.querySelector("#deploy")?.focus();
  });

  const scene = createPerfectPizzaScene(canvas, avatar);
  dialog.showModal();
  previous = performance.now();
  frame = requestAnimationFrame(loop);
  get("play").focus();
}
