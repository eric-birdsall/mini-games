import { createGameBuilder } from "./gameBuilder.js";
import { moveWorldSelection } from "../shared/worldBuilder.js";

import {
  clearanceIssues,
  playtestPoint,
  movePieces,
  duplicatePieces,
  rotatePieces,
  PLAYER_RADIUS,
  surfaceElevation,
  elevatePieces,
  stackPieces,
} from "../shared/builderTools.js";
// The map builder: a top-down grid editor for player-built maps. Drag to
// place walls, cover, platforms and ramps on a 0.5 m grid; click to place
// the two spawns and three terminals. A live checklist runs the same checks
// the game does (including whether every spawn can reach every terminal),
// maps save in this browser and travel as share codes, and Test / Play
// start a real match on the map.
import {
  CUSTOM_SIZES,
  PIECE_TYPES,
  MAX_PIECES,
  MIN_PIECE_OPACITY,
  blankCustomMap,
  checkCustomMap,
  validateCustomMap,
  buildCustomMap,
  pieceBase,
  pieceHeight,
  pieceTop,
  MAX_BUILD_HEIGHT,
  ensurePieceIds,
  partsOf,
} from "../shared/customMap.js";
import {
  TYPE_COLORS,
  PRESETS,
  cleanGroups,
  makeGroup,
  placeGroup,
  MAX_GROUPS,
} from "../shared/pieceCatalog.js";
import { createPieceBrowser } from "./pieceBrowser.js";
import { liveFields } from "./liveFields.js";
import {
  pieceFields,
  propKind,
  setPieceFields,
  fieldInputs,
  readFields,
  WINDOW_NOTE,
} from "../shared/pieceProps.js";

const TOOLS = [
  { id: "test", key: "T", label: "Test here", hint: "click a safe spot" },
  { id: "select", key: "V", label: "Select", hint: "Del · arrows / IJKL · R" },
  { id: "erase", key: "E", label: "Eraser", hint: "click" },
];
// Spawns and terminals live in the piece library's Map Setup category:
// pick one, then click the map to put it there (the nearer terminal moves).
const markerIcon = (color, text, square) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3236"/>${
      square
        ? `<rect x="14" y="14" width="36" height="36" fill="${color}"/>`
        : `<circle cx="32" cy="32" r="19" fill="${color}"/>`
    }<text x="32" y="37" font-family="monospace" font-weight="bold" font-size="${text.length > 1 ? 12 : 16}" fill="#fff" text-anchor="middle">${text}</text></svg>`,
  )}`;
const MARKERS = [
  {
    id: "attacker",
    key: "8",
    name: "Infiltrator spawn",
    note: "Click to place · one per map",
    icon: markerIcon("#7f77dd", "INF"),
  },
  {
    id: "defender",
    key: "9",
    name: "Sentinel spawn",
    note: "Click to place · one per map",
    icon: markerIcon("#c0392b", "SEN"),
  },
  {
    id: "terminal",
    key: "0",
    name: "Terminal",
    note: "Click to move the nearer of A / B",
    icon: markerIcon("#e24b4a", "A·B", true),
  },
].map((m) => ({ ...m, kind: "marker" }));
const SAVED = "minigames.maps.v1",
  CURRENT = "minigames.maps.current";
const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
const snap = (v) => Math.round(v * 2) / 2;
// Share codes: the map as base64 JSON (unicode-safe).
const encode = (def) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(def))));
const decode = (code) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0)),
    ),
  );

export function createBuilder({ onPlay, onClose, gameWorld, audio, controls, allowHosting = true }) {
  const app = document.querySelector("#app");
  app.insertAdjacentHTML(
    "beforeend",
    `<section id="builder" class="panel-screen builder" hidden aria-label="Map builder">
      <div class="builder-left">
      <div class="builder-tools" role="toolbar" aria-label="Tools">${TOOLS.map(
        (t) =>
          `<button data-tool="${t.id}" title="${t.label} (${t.key})"><kbd>${t.key}</kbd><span>${t.label}</span><small>${t.hint}</small></button>`,
      ).join(
        "",
      )}<button id="builder-duplicate" title="Duplicate selection (Ctrl/⌘ D)"><kbd>⌘D</kbd><span>Duplicate</span></button><button id="builder-undo" title="Undo (Ctrl/⌘ Z)"><kbd>⌘Z</kbd><span>Undo</span></button><button id="builder-redo" title="Redo (Ctrl/⌘ Shift Z or Ctrl Y)"><kbd>⌘⇧Z</kbd><span>Redo</span></button></div>
      <div class="builder-label">PIECES</div>
      <div id="builder-pieces"></div>
      <small class="builder-note">Pick a piece, then drag on the map. My Pieces: click to place; R turns.</small>
      </div>
      <div class="builder-center">

        <div class="builder-stage"><canvas id="builder-canvas" tabindex="0" aria-label="Map editing canvas"></canvas><div id="builder-coords"></div></div>

      </div>
      <aside class="builder-side">
        <div class="eyebrow">MAP BUILDER</div>
        <button id="builder-edit-world" class="primary">ENTER MAP EDITOR</button>
        <label>Name <input id="builder-name" maxlength="24"></label>
        <label>Size <select id="builder-size">${Object.entries(CUSTOM_SIZES)
          .map(([k, s]) => `<option value="${k}">${s.label}</option>`)
          .join("")}</select></label>
        <div id="builder-piece-props" hidden><div class="builder-label">SELECTED PIECE</div><div id="builder-props-title" class="builder-note"></div><div id="builder-props" class="builder-props"></div><small id="builder-window-note" class="builder-note" hidden>${WINDOW_NOTE}</small><small class="builder-note">Changes apply as you type. Undo takes back the whole edit.</small><button id="builder-revert-props" class="secondary">REVERT</button></div>
        <div class="builder-label">BUILD HEIGHT</div>
        <label>Placement <select id="builder-placement"><option value="ground">Ground</option><option value="surface">On a surface</option><option value="custom">Custom elevation</option></select></label>
        <div class="builder-row"><label>Base elevation (m)<input id="builder-elevation" type="number" min="0" max="31.9" step="0.1" value="0"></label><label>Thickness / rise (m)<input id="builder-height" type="number" min="0.1" max="12" step="0.1" value="4"></label></div>
        <small class="builder-note">F = thin floor / bridge deck. Surface mode snaps to the top under your first click. Ramps rise from their base by the specified amount.</small>
        <button id="builder-apply-height" class="secondary">APPLY TO SELECTED PIECES</button>
        <div class="builder-row"><button id="builder-lower" class="secondary">LOWER 0.5 m</button><button id="builder-raise" class="secondary">RAISE 0.5 m</button></div>
        <div class="builder-row"><label>Floor spacing (m)<input id="builder-stack-rise" type="number" min="0.1" max="32" step="0.1" value="4.3"></label><button id="builder-stack" class="secondary">STACK COPY ↑</button></div>
        <label>Editing height (m)<input id="builder-layer" type="number" min="0" max="32" step="0.1" value="0"></label>
        <label class="builder-check-label"><input id="builder-other-levels" type="checkbox" checked> Fade other levels</label>

        <div class="builder-label">PIECE COLOR</div>
        <label>Color <input id="builder-color" type="color" value="#9a9e9d" aria-label="Piece color"></label>
        <label>Opacity <span class="builder-opacity"><input id="builder-opacity" type="range" min="${MIN_PIECE_OPACITY * 100}" max="100" step="5" value="100" aria-label="Piece opacity"><output id="builder-opacity-value">100%</output></span></label>
        <label class="builder-check-label" title="Draws the piece 1 cm inside its edges so faces flush with another piece don't flicker. Size and collision don't change."><input id="builder-slim" type="checkbox"> Slim (stops flicker where pieces touch)</label>
        <label class="builder-check-label"><input id="builder-color-new" type="checkbox"> Use this color and opacity for new pieces</label>
        <div class="builder-row"><button id="builder-apply-color" class="secondary">APPLY COLOR</button><button id="builder-apply-opacity" class="secondary">APPLY OPACITY</button></div>
        <button id="builder-reset-color" class="secondary">RESET TO DEFAULT</button>
        <small id="builder-color-status" class="builder-note">Select one or more pieces to recolor them together. See-through pieces are still solid.</small>
        <div class="builder-label">MY PIECES</div>
        <div class="builder-row"><input id="builder-group-name" maxlength="32" placeholder="Name" aria-label="Name for the saved piece"><button id="builder-save-group" class="secondary">SAVE SELECTION</button></div>
        <div class="builder-label">CHECKS</div>
        <ul id="builder-checks"></ul>
        <div id="builder-count"></div>
        <div id="builder-selected"></div>
        <small class="builder-note">Drag a piece (or the selection) to move it. Shift-click to add/remove pieces. Drag empty space to box-select. Arrows / IJKL move; Shift takes larger steps. R rotates; Delete removes; ⌘/Ctrl+D duplicates.</small>
        <label><input id="builder-clearance" type="checkbox" checked> Show clearance warnings</label>
        <ul id="builder-clearance-list"></ul>
        <div class="builder-label">PLAY IT</div>
        <div class="builder-row"><label><input type="radio" name="builder-team" value="attacker" checked> Infiltrator</label><label><input type="radio" name="builder-team" value="defender"> Sentinel</label></div>
        <button id="builder-training" class="primary">PLAY NOW</button>
        <div class="builder-row"><button id="builder-solo" class="secondary">PLAY NOW · VS BOT</button><button id="builder-host" class="secondary">HOST A MATCH</button></div>
        <small class="builder-note">T → click a safe spot to test from there. Play now goes straight into the map (training: every gadget, no timer). Esc → Return to editor brings you back.</small>
        <div class="builder-label">MY MAPS</div>
        <div class="builder-row"><select id="builder-saved" aria-label="Saved maps"></select><button id="builder-load" class="secondary">LOAD</button></div>
        <div class="builder-row"><button id="builder-save" class="secondary">SAVE</button><button id="builder-delete" class="secondary">DELETE</button><button id="builder-new" class="secondary">NEW</button></div>
        <div class="builder-label">SHARE</div>
        <textarea id="builder-code" rows="3" placeholder="Paste a share code here, or copy yours" aria-label="Share code"></textarea>
        <div class="builder-row"><button id="builder-copy" class="secondary">COPY CODE</button><button id="builder-import" class="secondary">LOAD CODE</button></div>
        <div id="builder-message" role="status"></div>
        <button id="builder-close" class="text-button">← BACK TO MENU</button>
      </aside>
    </section>`,
  );
  const $ = (s) => document.querySelector(s),
    canvas = $("#builder-canvas"),
    ctx = canvas.getContext("2d");
  let def = store.get(CURRENT, null) || blankCustomMap(),
    tool = "select",
    // The selected piece (its index) or marker ("attacker", "defender",
    // "t0", "t1", "t2"): Del removes a piece, arrows / IJKL nudge, R turns it clockwise.
    selected = null,
    selection = new Set(),
    issues = [],
    drag = null,
    hover = null,
    undo = [],
    redo = [],
    checked = null,
    checkTimer = 0,
    // A My Pieces group being placed (tool "group"), and its quarter turns.
    stamp = null;
  // My Pieces: saved groups, shared by the 2D and 3D browsers.
  const MINE = "minigames.pieces.mine";
  let groups = cleanGroups(store.get(MINE, []));
  if (validateCustomMap(def).error && !def.pieces) def = blankCustomMap();

  let worldEditor = null,
    worldActive = false,
    savedWorldView = null,
    collisionMap = null;
  ensurePieceIds(def);
  const resume = store.get("minigames.maps.editor", null);
  if (resume?.map === JSON.stringify(def)) {
    selected = resume.selected;
    selection = new Set((resume.selection || []).filter((i) => def.pieces[i]));
    undo = resume.undo || [];
    redo = resume.redo || [];
    tool =
      [...TOOLS, ...MARKERS].some((t) => t.id === resume.tool) ||
      PIECE_TYPES[resume.tool]
        ? resume.tool
        : "select";
    for (const [id, value] of Object.entries(resume.settings || {}))
      if ($(id)) $(id).value = value;
    $("#builder-color-new").checked = !!resume.colorNew;
    showOpacity();

    worldActive = !!resume.worldActive;
    savedWorldView = resume.worldView;
  }
  function saveEditor() {
    store.set("minigames.maps.editor", {
      map: JSON.stringify(def),
      selected,
      selection: [...selection],
      undo,
      redo,
      tool,
      settings: Object.fromEntries(
        [
          "#builder-placement",
          "#builder-elevation",
          "#builder-height",
          "#builder-layer",
          "#builder-stack-rise",
          "#builder-color",
          "#builder-opacity",
        ].map((id) => [id, $(id).value]),
      ),
      colorNew: $("#builder-color-new").checked,

      worldActive,
      worldView: worldEditor?.getView() || savedWorldView,
    });
  }
  const say = (text) => ($("#builder-message").textContent = text);
  function opacity() {
    return Number($("#builder-opacity").value) / 100;
  }
  function percent(value) {
    return `${Math.round(value * 100)}%`;
  }
  function showOpacity() {
    $("#builder-opacity-value").textContent = percent(opacity());
  }
  // The picker shows one piece's look; "use for new pieces" follows whether
  // that piece has a custom color or opacity.
  function pickLook(p) {
    $("#builder-color").value = p.color || TYPE_COLORS[p.t];
    $("#builder-opacity").value = Math.round((p.opacity ?? 1) * 100);
    $("#builder-color-new").checked = !!(p.color || p.opacity);
    $("#builder-slim").checked = !!p.slim;
    showOpacity();
  }
  // The color and opacity a new piece gets, if any.
  const newLook = () => ({
    ...($("#builder-color-new").checked
      ? {
          color: $("#builder-color").value,
          ...(opacity() < 1 ? { opacity: opacity() } : {}),
        }
      : {}),
    ...($("#builder-slim").checked ? { slim: true } : {}),
  });
  const historyState = () =>
    JSON.stringify({
      def,
      selected,
      selection: [...selection],
      layer: layer(),
    });
  function remember() {
    // Anything else undoable ends a properties edit's undo step.
    if (propEdit) propEdit.stepped = false;
    undo.push(historyState());
    if (undo.length > 60) undo.shift();
    redo = [];
  }
  function travelHistory(from, to) {
    if (!from.length) return;
    worldEditor?.cancel();
    drag = null;
    propEdit = null;
    to.push(historyState());
    if (to.length > 60) to.shift();
    const snapshot = JSON.parse(from.pop());
    def = snapshot.def;
    selected = snapshot.selected;
    selection = new Set(snapshot.selection);
    $("#builder-layer").value = snapshot.layer ?? 0;
    syncFields();
    changed();
  }
  function changed() {
    ensurePieceIds(def);
    collisionMap = null;
    store.set(CURRENT, def);
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runChecks, 200);
    draw();
  }
  function runChecks() {
    checked = checkCustomMap(def);
    issues = clearanceIssues(def);
    $("#builder-clearance-list").replaceChildren();
    for (const issue of issues.slice(0, 8)) {
      const li = document.createElement("li");
      li.textContent = "⚠ " + issue.text;
      $("#builder-clearance-list").append(li);
    }
    if (issues.length > 8) {
      const li = document.createElement("li");
      li.textContent = `…and ${issues.length - 8} more warnings`;
      $("#builder-clearance-list").append(li);
    }
    if (!issues.length)
      $("#builder-clearance-list").textContent =
        "✓ No narrow gaps or blocked ramp landings found.";
    const list = [];
    const { error } = validateCustomMap(def);
    list.push({ ok: !error, text: error || "Spawns and terminals placed" });
    for (const c of checked.checks) list.push(c);
    for (const text of checked.warnings) list.push({ warn: true, text });
    $("#builder-checks").innerHTML = list
      .map(
        (c) =>
          `<li class="${c.ok ? "ok" : c.warn ? "warn" : "bad"}">${c.ok ? "✓" : c.warn ? "⚠" : "✕"} ${c.text}</li>`,
      )
      .join("");
    const playable = !checked.errors.length;
    for (const id of ["#builder-training", "#builder-solo", "#builder-host"])
      $(id).disabled = !playable;
    $("#builder-count").textContent =
      `${def.pieces.length} / ${MAX_PIECES} pieces`;
    draw();
  }
  function refreshSaved() {
    const saved = store.get(SAVED, {});
    $("#builder-saved").innerHTML = Object.keys(saved).length
      ? Object.keys(saved)
          .sort()
          .map((n) => `<option>${n.replace(/</g, "&lt;")}</option>`)
          .join("")
      : "<option disabled>No saved maps</option>";
  }
  function setTool(id) {
    tool = id;
    if (id !== "group") stamp = null;
    if (PIECE_TYPES[id]) $("#builder-height").value = PIECE_TYPES[id].h;
    else if (MARKERS.some((m) => m.id === id)) browser?.select("marker", id);
    else if (id !== "group") browser?.select(null);
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.classList.toggle("selected", b.dataset.tool === id));
  }
  // A library card: a preset becomes the drawing tool at its size; a saved
  // group follows the pointer until clicked into place.
  function pickEntry(entry) {
    if (entry.kind === "marker") {
      setTool(entry.id);
      say(`${entry.name}: ${entry.note.toLowerCase()}.`);
    } else if (entry.kind === "group") {
      setTool("group");
      stamp = { group: entry, turns: 0 };
      say(`${entry.name}: click the map to place it. R turns it.`);
    } else {
      setTool(entry.t);
      $("#builder-height").value = entry.h;
      say(
        `${entry.name}: drag out its footprint (suggested ${entry.w} × ${entry.d} m).`,
      );
    }
    draw();
  }
  function stampAt(point) {
    return stamp
      ? placeGroup(
          def,
          stamp.group,
          { ...point, y: elevationAt(point) },
          stamp.turns,
        )
      : null;
  }
  function saveGroups() {
    store.set(MINE, groups);
    browser?.refresh();
    worldEditor?.refreshLibrary();
  }
  // Save the selection as a My Pieces group; returns a message.
  function saveGroup(name) {
    const pieces = [...selection].map((i) => def.pieces[i]).filter(Boolean),
      group = makeGroup(pieces, name);
    if (!group) return "Select up to 100 pieces to save.";
    if (groups.length >= MAX_GROUPS)
      return `My Pieces holds ${MAX_GROUPS}; delete one first.`;
    groups = [group, ...groups];
    saveGroups();
    return `Saved “${group.name}” to My Pieces.`;
  }
  function deleteGroup(id) {
    const group = groups.find((g) => g.id === id);
    if (!group) return;
    groups = groups.filter((g) => g.id !== id);
    if (stamp?.group.id === id) setTool("select");
    saveGroups();
    say(`Deleted “${group.name}” from My Pieces.`);
  }
  // Add placed pieces (a group) to the map, selected; returns an error.
  function addPieces(pieces) {
    if (!pieces) return "That doesn't fit there.";
    const next = { ...def, pieces: [...def.pieces, ...pieces] },
      valid = validateCustomMap(next);
    if (valid.error) return valid.error;
    remember();
    const start = def.pieces.length;
    def = next;
    ensurePieceIds(def);
    selection = new Set(pieces.map((_, i) => start + i));
    selected = start;
    $("#builder-layer").value = pieceBase(pieces[0]);
    changed();
  }
  const browser = createPieceBrowser({
    container: $("#builder-pieces"),
    label: "Piece library",
    getGroups: () => groups,
    onPick: pickEntry,
    onDeleteGroup: deleteGroup,
    extra: {
      category: { id: "setup", label: "Map Setup" },
      entries: MARKERS,
    },
  });
  $("#builder-save-group").onclick = () => {
    const message = saveGroup($("#builder-group-name").value);
    say(message);
    if (message.startsWith("Saved")) {
      $("#builder-group-name").value = "";
      browser.showCategory("mine");
    }
  };

  const layer = () => Number($("#builder-layer").value) || 0;
  const activeAt = (p) =>
    pieceBase(p) <= layer() + 0.05 && pieceTop(p) >= layer() - 0.35;
  function elevationAt(point, exclude = []) {
    const mode = $("#builder-placement").value;
    return mode === "surface"
      ? surfaceElevation(def, point, exclude)
      : mode === "custom"
        ? Number($("#builder-elevation").value)
        : 0;
  }
  function testPoint(point) {
    collisionMap ||= buildCustomMap(def);
    return playtestPoint(def, point, collisionMap);
  }
  // Canvas: world ↔ screen. North (−z) is up, like the minimap.
  let view = { scale: 1, cx: 0, cy: 0 };
  function fit() {
    const box = canvas.parentElement.getBoundingClientRect(),
      dpr = devicePixelRatio || 1,
      s = CUSTOM_SIZES[def.size];
    canvas.width = Math.max(1, box.width * dpr);
    canvas.height = Math.max(1, box.height * dpr);
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    view.scale =
      Math.min(box.width / (s.x * 2 + 3), box.height / (s.z * 2 + 3)) * dpr;
    view.cx = canvas.width / 2;
    view.cy = canvas.height / 2;
  }
  const sx = (x) => view.cx + x * view.scale,
    sy = (z) => view.cy + z * view.scale;
  function toWorld(e) {
    const r = canvas.getBoundingClientRect(),
      dpr = devicePixelRatio || 1;
    return {
      x: ((e.clientX - r.left) * dpr - view.cx) / view.scale,
      z: ((e.clientY - r.top) * dpr - view.cy) / view.scale,
    };
  }
  function clampIn(p) {
    const s = CUSTOM_SIZES[def.size];
    return {
      x: Math.max(-s.x, Math.min(s.x, snap(p.x))),
      z: Math.max(-s.z, Math.min(s.z, snap(p.z))),
    };
  }
  function rampDir(a, b) {
    const dx = b.x - a.x,
      dz = b.z - a.z;
    return Math.abs(dz) >= Math.abs(dx)
      ? dz >= 0
        ? "+z"
        : "-z"
      : dx >= 0
        ? "+x"
        : "-x";
  }
  function draw() {
    if ($("#builder").hidden) return;
    if (worldActive) return;
    const s = CUSTOM_SIZES[def.size],
      dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1a1d1f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#2b3134";
    ctx.fillRect(
      sx(-s.x),
      sy(-s.z),
      s.x * 2 * view.scale,
      s.z * 2 * view.scale,
    );
    // Grid: every metre, stronger every 5 m.
    for (let x = Math.ceil(-s.x); x <= s.x; x++) {
      ctx.strokeStyle = x % 5 ? "#ffffff0d" : "#ffffff22";
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(-s.z));
      ctx.lineTo(sx(x), sy(s.z));
      ctx.stroke();
    }
    for (let z = Math.ceil(-s.z); z <= s.z; z++) {
      ctx.strokeStyle = z % 5 ? "#ffffff0d" : "#ffffff22";
      ctx.beginPath();
      ctx.moveTo(sx(-s.x), sy(z));
      ctx.lineTo(sx(s.x), sy(z));
      ctx.stroke();
    }
    ctx.strokeStyle = "#cfcfcf88";
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(
      sx(-s.x),
      sy(-s.z),
      s.x * 2 * view.scale,
      s.z * 2 * view.scale,
    );
    ctx.lineWidth = 1;
    // A shaped piece from above: its steps, curve, posts and openings, with
    // see-through runs dashed along their middle.
    const planParts = (p) => {
      for (const part of partsOf(p)) {
        if (part.k === "cyl") {
          ctx.beginPath();
          ctx.arc(sx(part.x), sy(part.z), part.r * view.scale, 0, Math.PI * 2);
          ctx.fill();
        } else if (part.k === "arc") {
          ctx.beginPath();
          ctx.ellipse(
            sx(part.cx),
            sy(part.cz),
            part.rx * view.scale,
            part.rz * view.scale,
            0,
            part.a0,
            part.a1,
          );
          ctx.ellipse(
            sx(part.cx),
            sy(part.cz),
            (part.rx - part.t) * view.scale,
            (part.rz - part.t) * view.scale,
            0,
            part.a1,
            part.a0,
            true,
          );
          ctx.closePath();
          ctx.fill();
        } else if (part.hidden && !part.soft) {
          const alongX = part.x1 - part.x0 >= part.z1 - part.z0,
            mid = alongX ? (part.z0 + part.z1) / 2 : (part.x0 + part.x1) / 2;
          ctx.save();
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 3 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.beginPath();
          if (alongX) {
            ctx.moveTo(sx(part.x0), sy(mid));
            ctx.lineTo(sx(part.x1), sy(mid));
          } else {
            ctx.moveTo(sx(mid), sy(part.z0));
            ctx.lineTo(sx(mid), sy(part.z1));
          }
          ctx.stroke();
          ctx.restore();
        } else if (
          part.role === "post" ||
          part.role === "foliage" ||
          (part.solid && !part.hidden)
        ) {
          const pw = Math.max((part.x1 - part.x0) * view.scale, 2 * dpr),
            ph = Math.max((part.z1 - part.z0) * view.scale, 2 * dpr);
          ctx.fillRect(
            sx((part.x0 + part.x1) / 2) - pw / 2,
            sy((part.z0 + part.z1) / 2) - ph / 2,
            pw,
            ph,
          );
          if (part.solid) {
            ctx.strokeStyle = "#00000044";
            ctx.strokeRect(
              sx(part.x0),
              sy(part.z0),
              (part.x1 - part.x0) * view.scale,
              (part.z1 - part.z0) * view.scale,
            );
          }
        }
      }
    };
    const piece = (p, ghost) => {
      const x = sx(p.x0),
        y = sy(p.z0),
        w = (p.x1 - p.x0) * view.scale,
        h = (p.z1 - p.z0) * view.scale;
      const alpha = ghost ? 0.55 : activeAt(p) ? 1 : 0.18;
      // A see-through piece's fill fades; its outline stays easy to find.
      ctx.globalAlpha = alpha * (p.opacity ?? 1);
      ctx.fillStyle = p.color || TYPE_COLORS[p.t];
      if (PIECE_TYPES[p.t].shape) planParts(p);
      else ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = PIECE_TYPES[p.t].shape ? "#cfcfcf55" : "#00000066";
      ctx.strokeRect(x, y, w, h);
      if (PIECE_TYPES[p.t].ramp || PIECE_TYPES[p.t].shape === "stairs") {
        // An arrow pointing uphill.
        const mx = x + w / 2,
          my = y + h / 2,
          [dx, dz] = {
            "+z": [0, 1],
            "-z": [0, -1],
            "+x": [1, 0],
            "-x": [-1, 0],
          }[p.dir],
          len = Math.min(Math.abs(dx ? w : h) * 0.35, 40 * dpr);
        ctx.strokeStyle = "#e9e9e9";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(mx - dx * len, my - dz * len);
        ctx.lineTo(mx + dx * len, my + dz * len);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx + dx * len, my + dz * len, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "#e9e9e9";
        ctx.fill();
        ctx.lineWidth = 1;
      }
      if (w > 34 * dpr && h > 16 * dpr) {
        ctx.fillStyle = "#101214cc";
        ctx.font = `${10 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(
          `${pieceBase(p).toFixed(1)} → ${pieceTop(p).toFixed(1)} m`,
          x + w / 2,
          y + h / 2 + 4 * dpr,
        );
      }
      ctx.globalAlpha = 1;
    };
    for (const p of [...def.pieces].sort((a, b) => pieceBase(a) - pieceBase(b)))
      if (activeAt(p) || $("#builder-other-levels").checked) piece(p, false);
    if (tool === "group" && hover)
      for (const p of stampAt(hover) || []) piece(p, true);
    if (drag?.to && drag.tool !== "select")
      piece(rectOf(drag.from, drag.to, drag.tool), true);
    if ($("#builder-clearance").checked) {
      ctx.strokeStyle = "#ffb44d";
      ctx.fillStyle = "#ffb44d55";
      ctx.lineWidth = 2 * dpr;
      for (const r of issues) {
        ctx.fillRect(
          sx(r.x0),
          sy(r.z0),
          (r.x1 - r.x0) * view.scale,
          (r.z1 - r.z0) * view.scale,
        );
        ctx.strokeRect(
          sx(r.x0),
          sy(r.z0),
          (r.x1 - r.x0) * view.scale,
          (r.z1 - r.z0) * view.scale,
        );
      }
      ctx.lineWidth = 1;
    }
    if (drag?.tool === "select") {
      const r = rectOf(drag.from, drag.to);
      ctx.fillStyle = "#f7d77422";
      ctx.strokeStyle = "#f7d774";
      ctx.fillRect(
        sx(r.x0),
        sy(r.z0),
        (r.x1 - r.x0) * view.scale,
        (r.z1 - r.z0) * view.scale,
      );
      ctx.strokeRect(
        sx(r.x0),
        sy(r.z0),
        (r.x1 - r.x0) * view.scale,
        (r.z1 - r.z0) * view.scale,
      );
    }
    for (const index of selection) {
      const sel = def.pieces[index];
      if (!sel) continue;
      ctx.strokeStyle = "#f7d774";
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(
        sx(sel.x0) - 2 * dpr,
        sy(sel.z0) - 2 * dpr,
        (sel.x1 - sel.x0) * view.scale + 4 * dpr,
        (sel.z1 - sel.z0) * view.scale + 4 * dpr,
      );
      ctx.lineWidth = 1;
    }
    const marker = (p, color, text, square) => {
      const r = 10 * dpr;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (square) ctx.rect(sx(p.x) - r, sy(p.z) - r, r * 2, r * 2);
      else ctx.arc(sx(p.x), sy(p.z), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${10 * dpr}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(text, sx(p.x), sy(p.z) + 4 * dpr);
    };
    marker(def.spawns.attacker, "#7f77dd", "INF");
    marker(def.spawns.defender, "#c0392b", "SEN");
    def.terminals.forEach((t, i) => marker(t, "#e24b4a", "ABC"[i], true));
    const m = markerAt(selected);
    if (m) {
      ctx.strokeStyle = "#f7d774";
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(sx(m.x), sy(m.z), 15 * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (hover) {
      const safe = testPoint({ ...hover, y: layer() });
      ctx.strokeStyle = safe ? "#8de4bd" : "#ff7171";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(
        sx(hover.x),
        sy(hover.z),
        PLAYER_RADIUS * view.scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
      $("#builder-coords").textContent =
        `${hover.x.toFixed(1)}, ${hover.z.toFixed(1)} · ${safe ? `player fits · height ${safe.y.toFixed(1)} m` : "player blocked"}`;
    }
    showSelection();

    ctx.fillStyle = "#cfcfcf";
    ctx.font = `bold ${12 * dpr}px monospace`;
    ctx.textAlign = "left";
    ctx.fillText("N ↑", sx(-s.x) + 6 * dpr, sy(-s.z) - 8 * dpr);
  }
  function markerAt(key) {
    if (key === "attacker" || key === "defender") return def.spawns[key];
    if (/^t\d$/.test(key)) return def.terminals[+key[1]];
    return null;
  }
  // The selected piece's own size fields (the first, for a group); rebuilt
  // only when the selection or that piece changes, never mid-typing.
  let propsKey = "";
  function syncProps(force = false) {
    const first = def.pieces[[...selection][0]],
      key = JSON.stringify([[...selection], first]),
      panel = $("#builder-piece-props");
    panel.hidden = !first;
    if (!first || (!force && key === propsKey)) return;
    if (!force && panel.contains(document.activeElement)) return;
    propsKey = key;
    $("#builder-props").innerHTML = fieldInputs(pieceFields(first));
    liveProps.reset();
    $("#builder-window-note").hidden = propKind(first) !== "window";
    $("#builder-props-title").textContent =
      selection.size > 1
        ? `${PIECE_TYPES[first.t].name} + ${selection.size - 1} more · changed fields apply to all that have them`
        : PIECE_TYPES[first.t].name;
  }
  const liveProps = liveFields($("#builder-props"), {
    read: () => readFields($("#builder-props")),
    apply: applyProperties,
    onError: say,
    onApplied: () => say(""),
    onDone: endPropEdit,
  });
  $("#builder-revert-props").onclick = () => {
    say(revertProperties());
    syncProps(true);
  };
  function showSelection() {
    const p = typeof selected === "number" ? def.pieces[selected] : null,
      label = p
        ? `${PIECE_TYPES[p.t].name} · ${p.x1 - p.x0} × ${p.z1 - p.z0} m · base ${pieceBase(p).toFixed(1)} / top ${pieceTop(p).toFixed(1)} m — ${worldActive ? "E drops/releases · R/F height · IJKL look" : "Del removes · arrows/IJKL nudge · R rotates"}`
        : markerAt(selected)
          ? `${{ attacker: "Infiltrator spawn", defender: "Sentinel spawn", t0: "Terminal A", t1: "Terminal B", t2: "Terminal C" }[selected]} — arrows / IJKL nudge`
          : "";
    $("#builder-selected").textContent =
      selection.size > 1
        ? `${selection.size} pieces selected — ${worldActive ? "E drops · R/F height · IJKL look" : "arrows/IJKL move · R rotates group"} · ⌘/Ctrl+D duplicates`
        : label;
    syncProps();
    $("#builder-undo").disabled = !undo.length;
    $("#builder-redo").disabled = !redo.length;
    $("#builder-duplicate").disabled = !selection.size;
    $("#builder-apply-color").disabled =
      $("#builder-apply-opacity").disabled =
      $("#builder-reset-color").disabled =
        !selection.size;
    const pieces = [...selection].map((i) => def.pieces[i]).filter(Boolean),
      colors = new Set(pieces.map((p) => p.color || "default")),
      opacities = new Set(pieces.map((p) => p.opacity ?? 1));
    $("#builder-color-status").textContent = !selection.size
      ? "Choose a color and opacity for new pieces, or select pieces to change them. See-through pieces are still solid."
      : `${selection.size} selected · ${colors.size > 1 ? "mixed colors" : [...colors][0]} · ${opacities.size > 1 ? "mixed opacity" : `${percent([...opacities][0])} opaque`}. Apply either one to all; changes can be undone.`;
  }
  // What's under a point: a marker (within ~1 m), else the topmost piece.
  function pick(w) {
    for (const key of [
      "attacker",
      "defender",
      ...def.terminals.map((t, i) => `t${i}`),
    ]) {
      const m = markerAt(key);
      if (layer() < 1.8 && Math.hypot(m.x - w.x, m.z - w.z) < 1.1) return key;
    }
    const i = def.pieces.findLastIndex(
      (q) =>
        activeAt(q) && w.x >= q.x0 && w.x <= q.x1 && w.z >= q.z0 && w.z <= q.z1,
    );
    return i < 0 ? null : i;
  }
  // Move the selection by (dx, dz), kept inside the map.
  function nudge(dx, dz) {
    const s = CUSTOM_SIZES[def.size];
    if (selection.size) {
      const next = structuredClone(def);
      if (!movePieces(next, [...selection], dx, dz)) return;
      remember();
      def = next;
    } else {
      const m = markerAt(selected);
      if (!m) return;
      const x = Math.max(-s.x + 0.5, Math.min(s.x - 0.5, m.x + dx)),
        z = Math.max(-s.z + 0.5, Math.min(s.z - 0.5, m.z + dz));
      if (x === m.x && z === m.z) return;
      remember();
      Object.assign(m, { x, z });
    }
    changed();
  }
  // Drag the selection (or a spawn / terminal) so it follows the pointer by
  // whole grid steps; one undo step for the whole drag.
  function dragMove(point) {
    const dx = point.x - drag.from.x,
      dz = point.z - drag.from.z;
    if (!drag.moved && !dx && !dz) return;
    if (!drag.moved) {
      remember();
      drag.moved = true;
    }
    const next = structuredClone(drag.origin);
    if (selection.size) movePieces(next, [...selection], dx, dz);
    else {
      const s = CUSTOM_SIZES[next.size],
        key = selected,
        m =
          key === "attacker" || key === "defender"
            ? next.spawns[key]
            : next.terminals[+key[1]];
      m.x = Math.max(-s.x + 0.5, Math.min(s.x - 0.5, m.x + dx));
      m.z = Math.max(-s.z + 0.5, Math.min(s.z - 0.5, m.z + dz));
    }
    def = next;
  }
  // Turn the selected group clockwise, preserving the grid and ramp directions.
  function rotate() {
    if (!selection.size) return;
    const next = structuredClone(def);
    if (!rotatePieces(next, [...selection]))
      return say("That group cannot fit after rotating.");
    remember();
    def = next;
    changed();
  }
  function duplicate() {
    const next = structuredClone(def),
      indices = duplicatePieces(next, [...selection]);
    if (!indices)
      return say("Select pieces and leave enough room within the piece limit.");
    remember();
    def = next;
    selection = new Set(indices);
    selected = indices[0];
    changed();
    say(
      `Duplicated ${indices.length} piece${indices.length === 1 ? "" : "s"}.`,
    );
  }
  function removeSelected() {
    if (!selection.size) return;
    remember();
    def.pieces = def.pieces.filter((_, i) => !selection.has(i));
    selection.clear();
    selected = null;
    changed();
  }
  function rectOf(a, b, t) {
    return {
      t,
      x0: Math.min(a.x, b.x),
      x1: Math.max(a.x, b.x),
      z0: Math.min(a.z, b.z),
      z1: Math.max(a.z, b.z),
      ...(PIECE_TYPES[t]
        ? {
            y: drag?.base ?? elevationAt(a),
            h: Number($("#builder-height").value),
            ...newLook(),
          }
        : {}),
      ...(PIECE_TYPES[t]?.dir ? { dir: rampDir(a, b) } : {}),
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    const p = clampIn(toWorld(e));
    if (tool === "test") {
      const point = testPoint({ ...p, y: layer() });
      if (!point) return say("Pick an open spot: the player cannot fit there.");
      play("training", point);
      return;
    }
    if (tool === "select") {
      const hit = pick(toWorld(e));
      if (typeof hit === "number") {
        // Pressing on a piece that's already selected keeps the group, so
        // the whole selection can be dragged; a plain click (no drag) on it
        // narrows the selection to that piece on release.
        const held = !e.shiftKey && selection.has(hit);
        if (!e.shiftKey && !held) selection.clear();
        if (e.shiftKey && selection.has(hit)) selection.delete(hit);
        else selection.add(hit);
        if (!e.shiftKey) {
          drag = {
            tool: "move",
            from: p,
            origin: def,
            moved: false,
            hit,
            held,
          };
          canvas.setPointerCapture(e.pointerId);
        }
        selected = selection.size ? [...selection][0] : null;
        if (selection.size === 1) {
          const piece = def.pieces[selected];
          $("#builder-elevation").value = pieceBase(piece);
          $("#builder-height").value = pieceHeight(piece);
          pickLook(piece);
          $("#builder-placement").value =
            pieceBase(piece) > 0 ? "custom" : "ground";
          syncPlacement();
        }
      } else if (hit) {
        selection.clear();
        selected = hit;
        drag = { tool: "move", from: p, origin: def, moved: false };
        canvas.setPointerCapture(e.pointerId);
      } else {
        if (!e.shiftKey) {
          selection.clear();
          selected = null;
        }
        drag = { tool: "select", from: p, to: p, add: e.shiftKey };
        canvas.setPointerCapture(e.pointerId);
      }
      draw();
      return;
    }
    if (tool === "group") {
      const error = addPieces(stampAt(p));
      if (error) say(error);
      else say(`Placed ${stamp.group.name}. Click again for another.`);
      return;
    }
    if (PIECE_TYPES[tool]) {
      const base = elevationAt(p),
        height = Number($("#builder-height").value);
      if (
        !Number.isFinite(base) ||
        !Number.isFinite(height) ||
        base < 0 ||
        height < 0.1 ||
        height > 12 ||
        base + height > MAX_BUILD_HEIGHT
      )
        return say(
          "Choose a valid base and thickness/rise; the top must be at most 32 m.",
        );
      $("#builder-elevation").value = base;
      drag = { tool, from: p, to: p, base };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "attacker" || tool === "defender") {
      remember();
      def.spawns[tool] = p;
    } else if (tool === "terminal") {
      remember();
      // An older map with two terminals gets its third here; otherwise the
      // nearest terminal moves here.
      if (def.terminals.length < 3) def.terminals.push(p);
      else {
        const gap = (t) => Math.hypot(t.x - p.x, t.z - p.z),
          near = def.terminals.reduce(
            (best, t, i) => (gap(t) < gap(def.terminals[best]) ? i : best),
            0,
          );
        def.terminals[near] = p;
      }
    } else if (tool === "erase") {
      const w = toWorld(e),
        i = def.pieces.findLastIndex(
          (q) =>
            activeAt(q) &&
            w.x >= q.x0 &&
            w.x <= q.x1 &&
            w.z >= q.z0 &&
            w.z <= q.z1,
        );
      if (i < 0) return;
      remember();
      def.pieces.splice(i, 1);
      selected = null;
      selection.clear();
    }
    changed();
  });
  canvas.addEventListener("pointermove", (e) => {
    hover = clampIn(toWorld(e));
    canvas.style.cursor =
      tool === "select" && (drag?.tool === "move" || pick(toWorld(e)) !== null)
        ? "move"
        : "";
    if (drag?.tool === "move") dragMove(hover);
    else if (drag) drag.to = hover;
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.tool === "move") {
      const { moved, hit, held } = drag;
      drag = null;
      if (moved) changed();
      else if (held) {
        selection = new Set([hit]);
        selected = hit;
        draw();
      }
      return;
    }
    const r = rectOf(drag.from, drag.to, drag.tool);
    if (drag.tool === "select") {
      def.pieces.forEach((p, i) => {
        if (
          activeAt(p) &&
          p.x0 >= r.x0 &&
          p.x1 <= r.x1 &&
          p.z0 >= r.z0 &&
          p.z1 <= r.z1
        )
          selection.add(i);
      });
      selected = selection.size ? [...selection][0] : null;
      drag = null;
      draw();
      return;
    }
    drag = null;
    if (r.x1 - r.x0 < 0.5 || r.z1 - r.z0 < 0.5) {
      say("Drag out a rectangle at least 0.5 m each way.");
      draw();
      return;
    }
    if (def.pieces.length >= MAX_PIECES) {
      say(`A map holds at most ${MAX_PIECES} pieces.`);
      draw();
      return;
    }
    remember();
    def.pieces.push(r);
    $("#builder-layer").value = pieceBase(r);
    // Selected straight away, ready to nudge or turn.
    selected = def.pieces.length - 1;
    selection = new Set([selected]);
    say("");
    changed();
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    $("#builder-coords").textContent = "";
  });

  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $("#builder-undo").onclick = () => travelHistory(undo, redo);
  $("#builder-redo").onclick = () => travelHistory(redo, undo);
  $("#builder-duplicate").onclick = duplicate;
  $("#builder-color").oninput = () => ($("#builder-color-new").checked = true);
  $("#builder-opacity").oninput = () => {
    $("#builder-color-new").checked = true;
    showOpacity();
  };
  // A properties edit: the panels apply as you type, and everything from
  // the first change until focus leaves the panel (or the selection
  // changes) is one undo step. `origin` is the selection as it was, for
  // Revert.
  let propEdit = null;
  const selectedIds = () => [...selection].map((i) => def.pieces[i]?.id);
  function propEditFor() {
    const key = JSON.stringify(selectedIds());
    if (propEdit?.key !== key)
      propEdit = {
        key,
        origin: [...selection].map((i) => structuredClone(def.pieces[i])),
        stepped: false,
      };
    return propEdit;
  }
  function endPropEdit() {
    propEdit = null;
  }
  // Put the selection back as it was when this edit began.
  function revertProperties() {
    const edit = propEdit?.key === JSON.stringify(selectedIds()) && propEdit;
    if (!edit) return "Nothing to revert.";
    const next = structuredClone(def);
    for (const p of edit.origin) {
      const i = next.pieces.findIndex((q) => q.id === p.id);
      if (i >= 0) next.pieces[i] = structuredClone(p);
    }
    if (JSON.stringify(next) === JSON.stringify(def))
      return "Nothing to revert.";
    remember();
    def = next;
    propEdit = null;
    changed();
    return "Reverted.";
  }
  // Apply panel fields to the selection (both editors), live.
  // Sizes go through each piece's own kind (radius, opening, block size);
  // base moves the selection together, keeping its lowest piece at `base`.
  function applyProperties(values) {
    if (!selection.size) return "Select a piece first.";
    const { base, color, opacity, slim, ...sizes } = values;
    if (base !== undefined && !(base >= 0))
      return "Choose a valid base elevation.";
    const next = structuredClone(def),
      lowest = Math.min(
        ...[...selection].map((i) => pieceBase(next.pieces[i])),
      );
    for (const i of selection) {
      const p = next.pieces[i],
        error = setPieceFields(p, sizes, next.size);
      if (error) return error;
      if (base !== undefined)
        p.y = Math.round((base + pieceBase(p) - lowest) * 10) / 10;
      if (color !== undefined) p.color = color;
      if (opacity !== undefined)
        if (opacity < 1) p.opacity = opacity;
        else delete p.opacity;
      if (slim !== undefined)
        if (slim) p.slim = true;
        else delete p.slim;
    }
    const valid = validateCustomMap(next);
    if (valid.error) return valid.error;
    if (JSON.stringify(next) === JSON.stringify(def)) return;
    const edit = propEditFor();
    if (!edit.stepped) {
      remember();
      edit.stepped = true;
    }
    def = next;
    changed();
  }
  // Set one look field (color or opacity) on every selected piece; an
  // undefined value restores the default. Opacity 1 is the default.
  function paintSelection(changes) {
    if (!selection.size) return false;
    const same = (p) => Object.entries(changes).every(([k, v]) => p[k] === v);
    if ([...selection].every((i) => same(def.pieces[i]))) return false;
    remember();
    for (const i of selection)
      for (const [k, v] of Object.entries(changes))
        if (v === undefined) delete def.pieces[i][k];
        else def.pieces[i][k] = v;
    changed();
    return true;
  }
  const opacityChange = (value) => ({
    opacity: value < 1 ? value : undefined,
  });
  $("#builder-apply-color").onclick = () =>
    paintSelection({ color: $("#builder-color").value }) &&
    say(`Applied ${$("#builder-color").value} to ${selection.size} pieces.`);
  $("#builder-apply-opacity").onclick = () =>
    paintSelection(opacityChange(opacity())) &&
    say(
      `Set ${selection.size} pieces to ${percent(opacity())} opacity. They stay solid.`,
    );
  // Slim sets the selected pieces at once; with nothing selected it's for
  // new pieces.
  $("#builder-slim").onchange = () => {
    const slim = $("#builder-slim").checked;
    if (paintSelection({ slim: slim || undefined }))
      say(
        `${selection.size} pieces ${slim ? "drawn slim: no flicker where they touch" : "drawn full size"}. Collision is unchanged.`,
      );
  };
  $("#builder-reset-color").onclick = () =>
    paintSelection({ color: undefined, opacity: undefined }) &&
    say("Selected pieces use their default color and opacity.");
  function lift(delta) {
    const next = structuredClone(def);
    if (!elevatePieces(next, [...selection], delta))
      return say("Select pieces and keep their tops between 0 and 32 m.");
    remember();
    def = next;
    $("#builder-layer").value = pieceBase(def.pieces[[...selection][0]]);
    changed();
  }
  $("#builder-raise").onclick = () => lift(0.5);
  $("#builder-lower").onclick = () => lift(-0.5);
  $("#builder-stack").onclick = () => {
    const next = structuredClone(def),
      copies = stackPieces(
        next,
        [...selection],
        Number($("#builder-stack-rise").value),
      );
    if (!copies)
      return say(
        "Select a floor group, choose positive spacing, and leave room below 32 m and the piece limit.",
      );
    remember();
    def = next;
    selection = new Set(copies);
    selected = copies[0];
    $("#builder-layer").value = pieceBase(def.pieces[selected]);
    changed();
    say(`Stacked ${copies.length} pieces upward.`);
  };
  $("#builder-apply-height").onclick = () => {
    if (!selection.size) return say("Select pieces first.");
    const next = structuredClone(def),
      height = Number($("#builder-height").value),
      base = elevationAt(
        {
          x: (def.pieces[selected].x0 + def.pieces[selected].x1) / 2,
          z: (def.pieces[selected].z0 + def.pieces[selected].z1) / 2,
        },
        [...selection],
      );
    if (
      !Number.isFinite(base) ||
      !Number.isFinite(height) ||
      base < 0 ||
      height < 0.1 ||
      height > 12 ||
      base + height > MAX_BUILD_HEIGHT
    )
      return say("Choose valid elevation and thickness/rise values.");
    const min = Math.min(
      ...[...selection].map((i) => pieceBase(next.pieces[i])),
    );
    for (const i of selection) {
      next.pieces[i].y =
        Math.round((base + pieceBase(next.pieces[i]) - min) * 10) / 10;
      next.pieces[i].h = Math.round(height * 10) / 10;
    }
    if (validateCustomMap(next).error)
      return say("That selection would exceed the height limit.");
    remember();
    def = next;
    $("#builder-layer").value = base;
    changed();
  };
  function syncPlacement() {
    $("#builder-elevation").disabled =
      $("#builder-placement").value !== "custom";
  }
  $("#builder-placement").onchange = syncPlacement;
  syncPlacement();
  for (const id of ["#builder-layer", "#builder-other-levels"])
    $(id).onchange = draw;
  $("#builder-layer").oninput = draw;
  $("#builder-clearance").onchange = draw;
  // While the builder is open it owns the keyboard (tool keys, undo).
  window.addEventListener(
    "keydown",
    (e) => {
      if ($("#builder").hidden) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        e.stopImmediatePropagation();
        return;
      }

      const t = [...TOOLS, ...MARKERS].find(
          (t) => t.key.toLowerCase() === e.key.toLowerCase(),
        ),
        preset = PRESETS.find(
          (p) => p.key?.toLowerCase() === e.key.toLowerCase(),
        );
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
      ) {
        $(
          e.key.toLowerCase() === "y" || e.shiftKey
            ? "#builder-redo"
            : "#builder-undo",
        ).click();
        e.preventDefault();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        duplicate();
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeSelected();
        e.preventDefault();
      } else if (
        e.key.startsWith("Arrow") ||
        (!e.metaKey &&
          !e.ctrlKey &&
          ["i", "j", "k", "l"].includes(e.key.toLowerCase()))
      ) {
        const step = e.shiftKey ? 2 : 0.5,
          [dx, dz] = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
            i: [0, -step],
            j: [-step, 0],
            k: [0, step],
            l: [step, 0],
          }[e.key.startsWith("Arrow") ? e.key : e.key.toLowerCase()];
        nudge(dx, dz);
        e.preventDefault();
      } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        if (stamp) {
          stamp.turns = (stamp.turns + 1) % 4;
          draw();
        } else rotate();
      } else if (t && !e.metaKey && !e.ctrlKey) setTool(t.id);
      else if (preset && !e.metaKey && !e.ctrlKey) {
        pickEntry({ kind: "preset", ...preset });
        browser.select("preset", preset.id);
      } else if (e.key !== "Escape") return;
      else close();
      e.stopImmediatePropagation();
    },
    { capture: true },
  );
  function syncFields() {
    $("#builder-name").value = def.name;
    $("#builder-size").value = def.size;
  }
  let nameEditing = false;
  $("#builder-name").onfocus = () => (nameEditing = false);
  $("#builder-name").onblur = () => (nameEditing = false);
  $("#builder-name").oninput = (e) => {
    if (e.target.value === def.name) return;
    if (!nameEditing) {
      remember();
      nameEditing = true;
    }
    def.name = e.target.value;
    changed();
  };
  $("#builder-size").onchange = (e) => {
    remember();
    const fresh = blankCustomMap(e.target.value),
      s = CUSTOM_SIZES[e.target.value],
      fits = (p) => Math.abs(p.x) <= s.x - 1.5 && Math.abs(p.z) <= s.z - 1.5;
    def.size = e.target.value;
    // Keep what fits; put spawns and terminals that don't back at defaults.
    for (const team of ["attacker", "defender"])
      if (!fits(def.spawns[team])) def.spawns[team] = fresh.spawns[team];
    // (An older map's two terminals take the outer two defaults.)
    def.terminals = def.terminals.map((t, i) =>
      fits(t) ? t : fresh.terminals[def.terminals.length < 3 ? i * 2 : i],
    );
    def.pieces = def.pieces.filter(
      (p) =>
        Math.abs(p.x0) <= s.x &&
        Math.abs(p.x1) <= s.x &&
        Math.abs(p.z0) <= s.z &&
        Math.abs(p.z1) <= s.z,
    );
    selected = null;
    selection.clear();
    fit();
    changed();
  };
  $("#builder-new").onclick = () => {
    remember();
    def = blankCustomMap(def.size);
    selected = null;
    selection.clear();
    syncFields();
    changed();
    say("New map. Undo brings the old one back.");
  };
  $("#builder-save").onclick = () => {
    saveEditor();
    const saved = store.get(SAVED, {});
    saved[def.name || "Custom map"] = def;
    store.set(SAVED, saved);
    refreshSaved();
    $("#builder-saved").value = def.name;
    say(`Saved “${def.name}”.`);
  };
  $("#builder-load").onclick = () => {
    const saved = store.get(SAVED, {}),
      pick = saved[$("#builder-saved").value];
    if (!pick) return;
    remember();
    def = structuredClone(pick);
    selected = null;
    selection.clear();
    syncFields();
    fit();
    changed();
    say(`Loaded “${def.name}”.`);
  };
  $("#builder-delete").onclick = () => {
    const saved = store.get(SAVED, {}),
      name = $("#builder-saved").value;
    if (!saved[name]) return;
    delete saved[name];
    store.set(SAVED, saved);
    refreshSaved();
    say(`Deleted “${name}”.`);
  };
  $("#builder-copy").onclick = async () => {
    const code = encode(def);
    $("#builder-code").value = code;
    try {
      await navigator.clipboard.writeText(code);
      say("Share code copied.");
    } catch {
      $("#builder-code").select();
      say("Share code ready to copy.");
    }
  };
  $("#builder-import").onclick = () => {
    try {
      const { def: next, error } = validateCustomMap(
        decode($("#builder-code").value),
      );
      if (error) return say(error);
      remember();
      def = next;
      selected = null;
      selection.clear();
      syncFields();
      fit();
      changed();
      say(`Loaded “${def.name}” from the code.`);
    } catch {
      say("That isn't a map code.");
    }
  };
  const team = () =>
    document.querySelector('input[name="builder-team"]:checked').value;
  const play = (kind, point) => {
    const { def: clean, error } = validateCustomMap(def);
    if (error) return say(error);
    const checks = checkCustomMap(clean);
    if (!point && checks.errors.length) return say(checks.errors[0]);
    saveEditor();
    onPlay(clean, kind, team(), point);
  };
  $("#builder-training").onclick = () => play("training");
  $("#builder-solo").onclick = () => play("solo");
  $("#builder-host").onclick = () => play("multi");
  if (!allowHosting) $("#builder-host").hidden = true;
  $("#builder-close").onclick = () => close();
  window.addEventListener("resize", () => {
    if (!$("#builder").hidden) {
      fit();
      draw();
    }
  });
  function worldState() {
    return {
      def,
      selection: [...selection],
      tool,
      height: Number($("#builder-height").value),
      placement: $("#builder-placement").value,
      base: Number($("#builder-elevation").value),
      color: $("#builder-color-new").checked
        ? $("#builder-color").value
        : undefined,
      opacity: $("#builder-color-new").checked ? opacity() : 1,
    };
  }
  function setWorld(enabled) {
    worldActive = enabled;
    $("#builder").hidden = enabled;
    if (enabled) {
      setTool("select");
      if (!worldEditor) {
        worldEditor = createGameBuilder({
          world: gameWorld,
          audio,
          actions: {
            getState: worldState,
            getControls: controls,
            onExit: () => {
              saveEditor();
              close();
            },
            onToolSelect: () => setTool("select"),
            onRotate: rotate,
            onBack: () => setWorld(false),
            onMessage: say,
            onSelect(index, add = false) {
              if (index === null) {
                if (!add) {
                  selection.clear();
                  selected = null;
                }
              } else {
                if (!add) selection.clear();
                if (add && selection.has(index)) selection.delete(index);
                else selection.add(index);
                selected = selection.size ? [...selection][0] : null;
              }
              if (selection.size === 1) {
                const p = def.pieces[selected];
                $("#builder-height").value = pieceHeight(p);
                $("#builder-elevation").value = pieceBase(p);
                $("#builder-placement").value =
                  pieceBase(p) > 0 ? "custom" : "ground";
                pickLook(p);
                $("#builder-layer").value = pieceBase(p);
                syncPlacement();
              }
              draw();
            },
            onPlace(piece) {
              if (def.pieces.length >= MAX_PIECES)
                return say(`A map holds at most ${MAX_PIECES} pieces.`);
              const next = { ...def, pieces: [...def.pieces, piece] },
                valid = validateCustomMap(next);
              if (valid.error) return say(valid.error);
              remember();
              def = next;
              selected = def.pieces.length - 1;
              selection = new Set([selected]);
              $("#builder-layer").value = pieceBase(piece);
              changed();
            },
            onMove(delta) {
              const next = moveWorldSelection(def, [...selection], delta);
              if (!next) return say("The selection cannot fit there.");
              remember();
              def = next;
              $("#builder-layer").value = pieceBase(def.pieces[selected]);
              changed();
            },
            onLift: lift,
            onDelete: removeSelected,
            onTest(point) {
              const safe = testPoint(point);
              if (!safe) return say("No safe test start at that surface.");
              play("training", safe);
            },
            // Only the fields the panel changed are sent; they apply together
            // as one undo step.
            onProperties: applyProperties,
            onPropertiesDone: endPropEdit,
            onRevert: revertProperties,
            safePoint: testPoint,
            onReplace(ids, pieces) {
              const next = structuredClone(def);
              for (let n = 0; n < ids.length; n++) {
                const i = next.pieces.findIndex((p) => p.id === ids[n]);
                if (i < 0) return;
                next.pieces[i] = { ...pieces[n], id: ids[n] };
              }
              const valid = validateCustomMap(next);
              if (valid.error) return say(valid.error);
              remember();
              def = next;
              changed();
            },
            onSave: () => $("#builder-save").click(),
            getGroups: () => groups,
            onDeleteGroup: deleteGroup,
            onSaveGroup: saveGroup,
            onPlaceGroup: addPieces,
            onUndo: () => travelHistory(undo, redo),
            onRedo: () => travelHistory(redo, undo),
            onDuplicate: duplicate,
          },
        });
        if (savedWorldView) {
          worldEditor.setView(savedWorldView);
          savedWorldView = null;
        }
      }
      worldEditor.open();
    } else {
      worldEditor?.close();
      fit();
      draw();
    }
  }
  $("#builder-edit-world").onclick = () => setWorld(!worldActive);
  function close() {
    worldEditor?.close();
    $("#builder").hidden = true;
    onClose();
  }
  function open() {
    $("#builder").hidden = false;
    syncFields();
    const savedHeight = $("#builder-height").value;
    setTool(tool);
    $("#builder-height").value = savedHeight;
    refreshSaved();
    if (worldActive) setWorld(true);
    else fit();
    runChecks();
    draw();
  }
  return {
    open,
    close,
    inGame: () => worldActive && !!worldEditor?.isActive(),
    frame: (dt) => worldEditor?.frame(dt),
  };
}
