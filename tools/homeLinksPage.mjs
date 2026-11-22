// The Pages build's play/ page. Kids see only the released games, each a link
// that opens it on the character screen. A grown-up taps GROWN-UPS and enters
// GROWN_UP_CODE on the keypad to see every game (tagged WIP / Not for mobile)
// and switch which ones are released; the menu then shows only those. The
// list lives in this device's localStorage (RELEASED_KEY, src/released.js).
// Any link here can also be added to the Home Screen from Safari
// (Share → Add to Home Screen). Works with touch, mouse, keyboard and an Xbox
// controller: D-pad / left stick moves, A presses, B backs out.
import { HOME_LINKS } from "../src/homeLinks.js";
import {
  DEFAULT_RELEASED,
  FROM_LIST_KEY,
  GROWN_UP_CODE,
  NEEDS_KEYS,
  RELEASED_KEY,
  WIP_GAMES,
} from "../src/released.js";

export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

export function homeLinksPage(base) {
  const byName = (a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  // Touch-friendly games first, then the ones needing keys; A–Z within each.
  const order = (games) =>
    games.sort(
      (a, b) =>
        Number(NEEDS_KEYS.includes(a.id)) - Number(NEEDS_KEYS.includes(b.id)) ||
        byName(a, b),
    );
  const card = ({ id, name }) => {
    const wip = WIP_GAMES.includes(id),
      keys = NEEDS_KEYS.includes(id),
      tags = [
        wip && `<span class="tag wip">WIP</span>`,
        keys && `<span class="tag keys">Not for mobile</span>`,
      ]
        .filter(Boolean)
        .join("");
    return `<li data-id="${id}"><a href="${base}play/${id}/"${keys ? ' class="needs-keys"' : ""}><img src="${base}icons/games/${id}-180.png" alt="" width="96" height="96" /><span class="name">${escapeHtml(name)}</span>${tags ? `<span class="tags">${tags}</span>` : ""}</a><button class="release" aria-pressed="false" aria-label="Release ${escapeHtml(name)}"></button></li>`;
  };
  const section = (title, note, games) =>
    games.length
      ? `<section><h2>${title}</h2>${note ? `<p class="note grown">${note}</p>` : ""}<ul>${order(games).map(card).join("\n")}</ul></section>`
      : "";
  const finished = HOME_LINKS.filter((g) => !WIP_GAMES.includes(g.id)),
    wip = HOME_LINKS.filter((g) => WIP_GAMES.includes(g.id));
  const config = JSON.stringify({
    base,
    code: GROWN_UP_CODE,
    key: RELEASED_KEY,
    defaults: DEFAULT_RELEASED,
    fromList: FROM_LIST_KEY,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta name="theme-color" content="#2a1641" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Mini Games" />
<title>Mini Games</title>
<link rel="apple-touch-icon" href="${base}icons/icon-180.png" />
<link rel="manifest" href="${base}play/manifest.webmanifest" />
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: max(28px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 48px max(24px, env(safe-area-inset-left)); font: 17px/1.4 system-ui, -apple-system, sans-serif; background: #2a1641; color: #faf8fc; }
header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
h1 { font-size: 28px; margin: 0 auto 0 0; }
.pill { color: #faf8fc; text-decoration: none; border: 1px solid #c4b4d755; border-radius: 999px; padding: 10px 18px; font: inherit; font-size: 14px; letter-spacing: 0.08em; background: #281341d9; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; }
.pill:hover, .pill:focus-visible { border-color: #e8b5ff; color: #e8b5ff; outline: none; }
.how { margin: 0 0 8px; color: #d8cce6; max-width: 46em; }
.key { display: flex; gap: 14px; flex-wrap: wrap; margin: 0 0 8px; color: #c2b4d3; font-size: 14px; align-items: center; }
h2 { font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; color: #c2b4d3; margin: 28px 0 4px; }
.note { margin: 0 0 14px; color: #b3a5c6; font-size: 14px; }
ul { list-style: none; padding: 0; margin: 14px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
li { display: flex; flex-direction: column; gap: 8px; }
li a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; color: inherit; text-decoration: none; text-align: center; padding: 14px 10px; border-radius: 20px; background: #231335d9; border: 2px solid transparent; }
li a:hover, li a:focus-visible { border-color: #e8b5ff; background: #33204ad9; outline: none; }
li img { border-radius: 22px; box-shadow: 0 6px 16px #0006; }
li a.needs-keys img { opacity: 0.75; }
.name { font-weight: 600; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.tag { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
.tag.wip { background: #ffd84a; color: #2a1641; }
.tag.keys { background: #ff8f8f33; color: #ffc2c2; border: 1px solid #ff8f8f88; }
.release { min-height: 44px; border-radius: 14px; border: 2px solid #c4b4d755; background: transparent; color: #d8cce6; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.release::before { content: "Release"; }
.release[aria-pressed="true"] { background: #7be0a1; border-color: #7be0a1; color: #1d3a26; }
.release[aria-pressed="true"]::before { content: "✓ Released"; }
.release:focus-visible { outline: 3px solid #e8b5ff; outline-offset: 2px; }
/* Kids: only the released games, no tags, notes or release buttons. */
body:not(.grown) .grown, body:not(.grown) .release, body:not(.grown) .tags, body:not(.grown) li:not(.released), body:not(.grown) section.empty { display: none; }
body.grown .kid { display: none; }
#toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #faf8fc; color: #2a1641; padding: 10px 18px; border-radius: 999px; font-weight: 600; font-size: 15px; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
#toast.show { opacity: 1; }
/* The grown-ups' keypad. */
#keypad { position: fixed; inset: 0; background: #150a22e6; display: grid; place-items: center; z-index: 10; }
#keypad[hidden] { display: none; }
#keypad .box { background: #2a1641; border: 1px solid #c4b4d755; border-radius: 24px; padding: 24px; width: min(340px, 92vw); text-align: center; }
#keypad h3 { margin: 0 0 14px; font-size: 18px; }
.dots { display: flex; justify-content: center; gap: 14px; margin-bottom: 18px; height: 18px; }
.dots span { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #c4b4d7; }
.dots span.on { background: #e8b5ff; border-color: #e8b5ff; }
.dots.wrong { animation: shake 0.35s; }
@keyframes shake { 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
.digits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.digits button { min-height: 64px; border-radius: 18px; border: 2px solid transparent; background: #3a2456; color: #faf8fc; font: inherit; font-size: 24px; font-weight: 600; cursor: pointer; }
.digits button.small { font-size: 15px; }
.digits button:hover, .digits button:focus-visible { border-color: #e8b5ff; outline: none; }
</style>
</head>
<body>
<header><h1>Games</h1><button class="pill kid" id="grown-up">GROWN-UPS</button><button class="pill grown" id="lock">🔒 LOCK</button><a class="pill" id="back" href="${base}">← MINI GAMES</a></header>
<div class="grown">
<p class="how">Tap <b>Release</b> to put a game on the kids' menu on this device; only released games show there and on this page once you lock it. Release games from inside the Home Screen app: an iPad keeps Safari's list and each Home Screen icon's list separately.</p>
<p class="how">To make a game its own Home Screen icon, open it here in Safari and choose <b>Share → Add to Home Screen</b>. Its icon opens straight to the character screen.</p>
<div class="key"><span class="tag wip">WIP</span> still being built <span class="tag keys">Not for mobile</span> needs a keyboard or controller</div>
</div>
${section("Games", "", finished)}
${section("Work in progress", "Still being built: these may change or break.", wip)}
<div id="keypad" hidden role="dialog" aria-modal="true" aria-label="Grown-ups code"><div class="box"><h3>Grown-ups code</h3><div class="dots"><span></span><span></span><span></span><span></span></div><div class="digits">${[
    1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]
    .map((n) => `<button data-digit="${n}">${n}</button>`)
    .join(
      "",
    )}<button class="small" data-cancel>Cancel</button><button data-digit="0">0</button><button class="small" data-erase aria-label="Delete">⌫</button></div></div></div>
<div id="toast" role="status"></div>
<script>
(() => {
  const CFG = ${config};
  const $ = (s, el = document) => el.querySelector(s);
  // The same offline cache as the rest of Mini Games, so the Home Screen
  // launcher opens without a connection.
  navigator.serviceWorker?.register(CFG.base + "sw.js", { scope: CFG.base }).catch(() => {});
  // A game opened from here comes back here (its Back and logo); the full
  // menu link goes back to the normal menu.
  const fromList = (on) => {
    try { on ? sessionStorage.setItem(CFG.fromList, "1") : sessionStorage.removeItem(CFG.fromList); } catch {}
  };
  for (const a of document.querySelectorAll("li a")) a.addEventListener("click", () => fromList(true));
  $("#back").addEventListener("click", () => fromList(false));
  const cards = [...document.querySelectorAll("li[data-id]")];
  const known = new Set(cards.map((li) => li.dataset.id));
  const load = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(CFG.key));
      if (Array.isArray(saved)) return saved.filter((id) => known.has(id));
    } catch {}
    return [...CFG.defaults];
  };
  let released = load();
  const save = () => {
    try { localStorage.setItem(CFG.key, JSON.stringify(released)); } catch {}
  };
  const toast = (text) => {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
  };
  const render = () => {
    for (const li of cards) {
      const on = released.includes(li.dataset.id);
      li.classList.toggle("released", on);
      $(".release", li).setAttribute("aria-pressed", String(on));
    }
    for (const sec of document.querySelectorAll("section"))
      sec.classList.toggle("empty", !sec.querySelector("li.released"));
  };
  for (const li of cards)
    $(".release", li).onclick = () => {
      const id = li.dataset.id, name = $(".name", li).textContent;
      if (released.includes(id)) {
        if (released.length === 1) return toast("Keep at least one game released");
        released = released.filter((x) => x !== id);
        toast(name + " hidden from the kids' menu");
      } else {
        released.push(id);
        toast(name + " released");
      }
      save();
      render();
    };
  render();

  // Grown-ups mode lasts until LOCK, or until the app or tab is closed.
  const GROWN = "minigames.grownUps";
  const setGrown = (on) => {
    document.body.classList.toggle("grown", on);
    try { on ? sessionStorage.setItem(GROWN, "1") : sessionStorage.removeItem(GROWN); } catch {}
  };
  try { setGrown(sessionStorage.getItem(GROWN) === "1"); } catch {}
  $("#lock").onclick = () => {
    setGrown(false);
    $("#grown-up").focus();
  };

  const pad = $("#keypad"), dots = [...pad.querySelectorAll(".dots span")];
  let typed = "";
  const show = () => dots.forEach((d, i) => d.classList.toggle("on", i < typed.length));
  const openPad = () => {
    typed = "";
    show();
    pad.hidden = false;
    $("[data-digit='1']", pad).focus();
  };
  const closePad = () => {
    pad.hidden = true;
    $("#grown-up").focus();
  };
  $("#grown-up").onclick = openPad;
  const press = (digit) => {
    if (typed.length >= CFG.code.length) return;
    typed += digit;
    show();
    if (typed.length < CFG.code.length) return;
    if (typed === CFG.code) {
      pad.hidden = true;
      setGrown(true);
      $(".release")?.focus();
    } else {
      const row = $(".dots", pad);
      row.classList.remove("wrong");
      void row.offsetWidth;
      row.classList.add("wrong");
      setTimeout(() => ((typed = ""), show()), 350);
    }
  };
  pad.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.digit) press(b.dataset.digit);
    else if ("erase" in b.dataset) (typed = typed.slice(0, -1)), show();
    else if ("cancel" in b.dataset) closePad();
  });

  // Keyboard and Xbox controller: move between whatever can be pressed.
  const targets = () =>
    [...(pad.hidden ? document : pad).querySelectorAll("a, button")].filter(
      (el) => el.offsetParent !== null,
    );
  const move = (dx, dy) => {
    const list = targets(), from = list.includes(document.activeElement) ? document.activeElement : null;
    if (!from) return list[0]?.focus();
    const a = from.getBoundingClientRect(), ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const b = el.getBoundingClientRect(), x = b.x + b.width / 2 - ax, y = b.y + b.height / 2 - ay;
      const along = x * dx + y * dy, across = Math.abs(x * dy) + Math.abs(y * dx);
      if (along <= 1) continue;
      const score = along + across * 3;
      if (score < bestScore) (bestScore = score), (best = el);
    }
    best?.focus();
    best?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const back = () => (pad.hidden ? (location.href = CFG.base) : closePad());
  addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) (e.preventDefault(), move(...d));
    else if (e.key === "Escape") back();
    else if (!pad.hidden && /^[0-9]$/.test(e.key)) press(e.key);
    else if (!pad.hidden && e.key === "Backspace") (typed = typed.slice(0, -1)), show();
  });
  let held = {}, next = 0;
  const poll = (t) => {
    for (const gp of navigator.getGamepads?.() || []) {
      if (!gp) continue;
      const btn = (i) => gp.buttons[i]?.pressed;
      const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
      const dx = btn(14) || sx < -0.5 ? -1 : btn(15) || sx > 0.5 ? 1 : 0;
      const dy = btn(12) || sy < -0.5 ? -1 : btn(13) || sy > 0.5 ? 1 : 0;
      if ((dx || dy) && t >= next) {
        move(dx, dx ? 0 : dy);
        next = t + (held.dir ? 160 : 320);
        held.dir = true;
      } else if (!dx && !dy) (held.dir = false), (next = 0);
      if (btn(0) && !held.a && targets().includes(document.activeElement)) document.activeElement.click();
      if (btn(1) && !held.b) back();
      held.a = btn(0);
      held.b = btn(1);
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();
</script>
</body>
</html>
`;
}
