import * as T from "three";
import { InputManager, keyboardCode } from "./input.js";
import { StanceControl, eyeHeight } from "../shared/movement.js";
import { createEditorSession } from "../shared/editorSession.js";
import {
  CUSTOM_SIZES,
  PIECE_TYPES,
  MIN_PIECE_OPACITY,
  pieceBase,
  pieceTop,
  ensurePieceIds,
} from "../shared/customMap.js";
import { worldPiece, moveWorldSelection } from "../shared/worldBuilder.js";
import { rotatePieces } from "../shared/builderTools.js";
import { builderPieceGeometry } from "./builderGeometry.js";
import { createPieceBrowser } from "./pieceBrowser.js";
import { liveFields } from "./liveFields.js";
import { PRESETS, describeSize, placeGroup } from "../shared/pieceCatalog.js";
import {
  pieceFields,
  propKind,
  fieldInputs,
  readFields,
  WINDOW_NOTE,
} from "../shared/pieceProps.js";

export function createGameBuilder({ world, audio, actions }) {
  const root = document.createElement("section");
  root.id = "game-builder";
  root.hidden = true;
  root.innerHTML = `<div class="gb-heading"><strong>MAP EDITOR</strong><span id="gb-mode">WALKING</span><button data-gb="pause">PAUSE / TOOLS</button></div><div class="gb-crosshair">+</div><div id="gb-hint" aria-live="polite"></div><div id="gb-position"></div><div class="gb-slots"><button data-gb="select">1 · SELECT / EDIT</button><button data-gb="palette">2 · NEW PIECE</button><button data-gb="properties">PIECE OPTIONS</button></div><div id="gb-prompts"></div>
  <div id="gb-dialog" hidden><div class="gb-card"><h2 id="gb-title">Editor paused</h2><div id="gb-pause"><button data-gb="resume">RESUME EDITING</button><button data-gb="flight">TOGGLE WALK / FLY</button><button data-gb="top">SWITCH TO 2D PLANNER</button><button data-gb="test">PLAYTEST FROM HERE</button><button data-gb="save">SAVE MAP</button><button data-gb="undo">UNDO</button><button data-gb="redo">REDO</button><button data-gb="exit">EXIT BUILDER</button></div><div id="gb-palette" hidden><input type="hidden" id="gb-type" value="wall"><div id="gb-browser"></div><p id="gb-picked" class="gb-note"></p><div class="gb-fields"><label>Width (m)<input id="gb-width" type="number" value="4" min=".5" max="40" step=".5"></label><label>Depth (m)<input id="gb-depth" type="number" value=".5" min=".5" max="76" step=".5"></label><label>Thickness / rise (m)<input id="gb-height" type="number" value="4" min=".1" max="12" step=".1"></label><label>Base elevation (m)<input id="gb-base" type="number" value="0" min="0" max="32" step=".1"></label></div><label>Placement <select id="gb-placement"><option value="surface">Snap to aimed surface</option><option value="ground">Ground</option><option value="custom">Custom elevation</option></select></label><label>Color <input id="gb-color" type="color" value="#7896a2"></label><label>Opacity <span class="gb-opacity"><input id="gb-opacity" type="range" min="${MIN_PIECE_OPACITY * 100}" max="100" step="5" value="100"><output for="gb-opacity">100%</output></span></label><button data-gb="place">USE PIECE / START PLACING</button></div><div id="gb-properties" hidden><p id="gb-selected"></p><div class="gb-fields"><div id="gb-edit-fields" class="gb-contents"></div><label>Base elevation (m)<input id="gb-edit-base" data-live="base" type="number" min="0" max="32" step=".1"></label></div><small id="gb-window-note" class="gb-note" hidden>${WINDOW_NOTE}</small><label>Color <input id="gb-selected-color" data-live="color" type="color" value="#7896a2"></label><label>Opacity <span class="gb-opacity"><input id="gb-selected-opacity" data-live="opacity" type="range" min="${MIN_PIECE_OPACITY * 100}" max="100" step="5" value="100"><output for="gb-selected-opacity">100%</output></span></label><label class="gb-check"><input id="gb-selected-slim" data-live="slim" type="checkbox"> Slim (stops flicker where pieces touch)</label><small class="gb-note">Changes apply as you edit; undo takes back the whole edit. See-through pieces are still solid.</small><button data-gb="revert">REVERT</button><button data-gb="move" aria-pressed="false">MOVE (M)</button><button data-gb="rotate">ROTATE CLOCKWISE</button><button data-gb="duplicate">DUPLICATE</button><div class="gb-save-group"><input id="gb-group-name" maxlength="32" placeholder="Name" aria-label="Name for the saved piece"><button data-gb="saveGroup">SAVE TO MY PIECES</button></div><button data-gb="delete">DELETE SELECTED</button></div><button data-gb="resume">CLOSE / RESUME</button></div></div>`;
  document.querySelector("#app").append(root);
  const propertiesPanel = root.querySelector("#gb-properties");
  propertiesPanel.classList.add("gb-card", "gb-sidebar");
  propertiesPanel.setAttribute("aria-label", "Selected piece properties");
  propertiesPanel.setAttribute("role", "complementary");
  root.append(propertiesPanel);
  const $ = (s) => root.querySelector(s),
    canvas = world.renderer.domElement,
    stance = new StanceControl();
  // Opacity sliders read 10–100 (%); pieces store 0.1–1.
  const opacityOf = (id) => Number($(id).value) / 100,
    showOpacity = (id) =>
      ($(`output[for="${id.slice(1)}"]`).textContent = `${$(id).value}%`),
    setOpacity = (id, value) => {
      $(id).value = Math.round(value * 100);
      showOpacity(id);
    };
  for (const id of ["#gb-opacity", "#gb-selected-opacity"])
    $(id).addEventListener("input", () => showOpacity(id));
  // Selected-piece options apply as you edit (see liveFields).
  const live = liveFields(propertiesPanel, {
    read: () => panelFields(),
    apply: (changes) => {
      cancel();
      return actions.onProperties(changes);
    },
    onError: (text) => hint(text),
    onApplied: () =>
      hint("Applied. Collision follows size, not opacity or slim."),
    onDone: () => actions.onPropertiesDone(),
  });
  // The piece library: a preset fills in the New Piece fields; a saved
  // group starts placing straight away.
  function pickEntry(entry) {
    if (entry.kind === "group") {
      setMoving(false);
      tool = "group";
      stamp = { group: entry, turns: 0 };
      lift = 0;
      resume();
      hint(`${entry.name}: click/RT to place · Z rotate · Esc cancel`);
      return;
    }
    $("#gb-type").value = entry.t;
    $("#gb-width").value = entry.w;
    $("#gb-depth").value = entry.d;
    $("#gb-height").value = entry.h;
    $("#gb-picked").textContent = `${entry.name} · ${describeSize(entry)}`;
  }
  const browser = createPieceBrowser({
    container: $("#gb-browser"),
    label: "Piece library",
    getGroups: actions.getGroups,
    onPick: pickEntry,
    onDeleteGroup: actions.onDeleteGroup,
  });
  pickEntry({ kind: "preset", ...PRESETS[0] });
  browser.select("preset", PRESETS[0].id);
  const input = new InputManager(action),
    ray = new T.Raycaster(),
    pointer = new T.Vector2(),
    ghost = new T.Group(),
    highlight = new T.Group();
  world.scene.add(ghost);
  world.scene.add(highlight);
  let active = false,
    paused = false,
    modal = "pause",
    session = null,
    mapKey = "",
    tool = "select",
    held = null,
    // A My Pieces group being placed (tool "group") and its quarter turns.
    stamp = null,
    // Selecting only selects; the selection follows the aim only while moving.
    moving = false,
    rotation = 0,
    lift = 0,
    distance = null,
    fly = false,
    yaw = 0,
    pitch = 0,
    rightDrag = false,
    captured = false,
    accumulator = 0,
    aimed = null,
    hit = null,
    candidate = null,
    staged = null,
    ghostKey = "",
    highlightKey = "",
    message = "",
    savedView = null,
    menuRepeat = 0,
    sprintLatched = false,
    slide = 0,
    slidePress = false,
    propertiesKey = "";
  const extra = new Set();
  function stop() {
    input.clear();
    extra.clear();
    stance.cancel();
    rightDrag = false;
  }
  function hint(text) {
    message = text;
    $("#gb-hint").textContent = text;
  }
  function clearGhost() {
    ghost.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    ghost.clear();
    ghostKey = "";
  }
  // The panel's current values, as onProperties takes them.
  function panelFields() {
    return {
      ...readFields($("#gb-edit-fields")),
      base:
        $("#gb-edit-base").value.trim() === ""
          ? NaN
          : Number($("#gb-edit-base").value),
      color: $("#gb-selected-color").value,
      opacity: opacityOf("#gb-selected-opacity"),
      slim: $("#gb-selected-slim").checked,
    };
  }
  function setMoving(on) {
    if (!on) cancel();
    moving = on;
    const b = $('[data-gb="move"]');
    b.textContent = on ? "STOP MOVING (M)" : "MOVE (M)";
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("active", on);
  }
  // Pick up the current selection where the crosshair is.
  function grab(point) {
    const indices = [...actions.getState().selection],
      def = structuredClone(actions.getState().def);
    held = {
      indices,
      ids: indices.map((i) => def.pieces[i].id),
      def,
      signature: JSON.stringify(actions.getState().def),
      anchor: { x: point.x, y: point.y, z: point.z },
    };
    distance = Math.max(
      0.5,
      Math.min(45, world.camera.position.distanceTo(point)),
    );
  }
  // Put moved pieces down where they are previewed; returns false if they
  // can't go there.
  function drop() {
    preview();
    if (!staged) return false;
    const ids = held.ids,
      pieces = staged;
    setMoving(false);
    actions.onReplace(ids, pieces);
    return true;
  }
  function toggleMove() {
    if (moving) {
      if (held && !drop()) return hint("Cannot place the selection there.");
      setMoving(false);
      hint("Moved. The selection stays selected.");
    } else if (actions.getState().selection.length) {
      tool = "select";
      setMoving(true);
      lift = 0;
    } else hint("Select a piece first.");
  }
  function cancel() {
    held = null;
    candidate = null;
    staged = null;
    lift = 0;
    distance = null;
    clearGhost();
  }
  function unlock() {
    captured = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    stop();
  }
  function dialog(kind = "pause") {
    if (kind === "properties") {
      syncProperties(true);
      unlock();
      $("#gb-edit-fields input")?.focus();
      return;
    }
    if (held) cancel();
    paused = true;
    modal = kind;
    unlock();
    $("#gb-dialog").hidden = false;
    for (const name of ["pause", "palette", "properties"])
      $(`#gb-${name}`).hidden = name !== kind;
    $("#gb-title").textContent = {
      pause: "Editor paused",
      palette: "New piece",
      properties: "Selected piece options",
    }[kind];
    $("#gb-dialog button:not([hidden])")?.focus();
  }
  function syncProperties(force = false) {
    const state = actions.getState();
    propertiesPanel.hidden = !state.selection.length || paused;
    const key = JSON.stringify([state.selection, staged || state.def.pieces]);
    if (
      !force &&
      (key === propertiesKey ||
        propertiesPanel.contains(document.activeElement))
    )
      return;
    propertiesKey = key;
    const selectedPiece = staged?.[0] || state.def.pieces[state.selection[0]];
    // Only the sizes this kind of piece has (a radius, a window's opening).
    $("#gb-edit-fields").innerHTML = selectedPiece
      ? fieldInputs(pieceFields(selectedPiece))
      : "";
    $("#gb-window-note").hidden =
      !selectedPiece || propKind(selectedPiece) !== "window";
    $("#gb-edit-base").value = selectedPiece ? pieceBase(selectedPiece) : 0;
    for (const b of $("#gb-properties").querySelectorAll("button"))
      b.disabled = !selectedPiece;
    const first =
      actions.getState().def.pieces[actions.getState().selection[0]];
    $("#gb-selected-color").value = first?.color || "#7896a2";
    setOpacity("#gb-selected-opacity", first?.opacity ?? 1);
    $("#gb-selected-slim").checked = !!first?.slim;
    live.reset();
    $("#gb-selected").textContent =
      `${PIECE_TYPES[selectedPiece?.t]?.name || "Piece"} · ${state.selection.length} selected`;
  }
  function resume() {
    paused = false;
    $("#gb-dialog").hidden = true;
    stop();
    try {
      canvas
        .requestPointerLock()
        ?.catch(() =>
          hint("Mouse capture unavailable. Right-drag or IJKL to look."),
        );
    } catch {
      hint("Right-drag or IJKL to look.");
    }
  }
  function safeMode() {
    fly = !fly;
    stop();
    if (!fly) {
      const s = actions.safePoint({
        x: session.player.x,
        z: session.player.z,
        y: session.player.y,
      });
      if (s)
        Object.assign(session.player, s, {
          vy: 0,
          grounded: true,
          clamber: null,
        });
      else {
        fly = true;
        hint("No safe walking surface here; fly to open space first.");
      }
    }
  }
  function meshes() {
    return world.level?.children.filter((o) => o.isMesh) || [];
  }
  function aim() {
    world.camera.updateMatrixWorld();
    ray.setFromCamera(new T.Vector2(), world.camera);
    hit =
      ray.intersectObjects(meshes(), false).find((h) => h.object.isMesh) ||
      null;
    // Decorative strips can lie in front of the collision body: pick the nearest authored piece separately.
    const pieces = ray.intersectObjects(
      meshes().filter((m) => Number.isInteger(m.userData.pieceIndex)),
      false,
    );
    const piece = pieces[0];
    // Decorative caps, stripes and ledges must not block their authored body.
    aimed =
      piece && piece.distance <= 45 ? piece.object.userData.pieceIndex : null;
    return distance !== null
      ? ray.ray.at(distance, new T.Vector3())
      : hit && hit.distance < 45
        ? hit.point.clone()
        : ray.ray.at(7, new T.Vector3());
  }
  function drawGhost(pieces, valid = true) {
    const key = JSON.stringify([pieces, valid, !!held]);
    if (key === ghostKey) return;
    clearGhost();
    ghostKey = key;
    for (const p of pieces) {
      const m = new T.Mesh(
        builderPieceGeometry(p),
        new T.MeshStandardMaterial({
          color: valid ? "#8ce4b6" : "#ff7167",
          transparent: true,
          opacity: held ? 0.08 : 0.5,
          depthWrite: false,
        }),
      );
      m.position.set((p.x0 + p.x1) / 2, pieceBase(p), (p.z0 + p.z1) / 2);
      ghost.add(m);
      const outline = new T.LineSegments(
        new T.EdgesGeometry(m.geometry),
        new T.LineBasicMaterial({
          color: valid ? "#ffffff" : "#ff7167",
          toneMapped: false,
          depthTest: false,
          depthWrite: false,
        }),
      );
      outline.position.copy(m.position);
      outline.renderOrder = 26;
      ghost.add(outline);
      if (PIECE_TYPES[p.t].ramp) {
        const [x, z] = {
          "-z": [0, -1],
          "+z": [0, 1],
          "-x": [-1, 0],
          "+x": [1, 0],
        }[p.dir];
        const arrow = new T.ArrowHelper(
          new T.Vector3(x, 0.3, z).normalize(),
          new T.Vector3(
            (p.x0 + p.x1) / 2,
            pieceBase(p) + (p.h || PIECE_TYPES[p.t].h) / 2 + 0.2,
            (p.z0 + p.z1) / 2,
          ),
          Math.min(2, Math.max(p.x1 - p.x0, p.z1 - p.z0) * 0.6),
          "#fff1a0",
          0.35,
          0.2,
        );
        arrow.line.geometry = arrow.line.geometry.clone();
        arrow.cone.geometry = arrow.cone.geometry.clone();
        ghost.add(arrow);
      }
    }
  }
  function drawHighlight() {
    const state = actions.getState(),
      indices = [
        ...new Set([...state.selection, ...(aimed === null ? [] : [aimed])]),
      ];
    const key = JSON.stringify([mapKey, indices, state.selection]);
    if (key === highlightKey) return;
    highlightKey = key;
    highlight.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    highlight.clear();
    for (const m of meshes().filter((m) =>
      indices.includes(m.userData.pieceIndex),
    )) {
      m.updateMatrixWorld(true);
      const line = new T.LineSegments(
        new T.EdgesGeometry(m.geometry),
        new T.LineBasicMaterial({
          color: state.selection.includes(m.userData.pieceIndex)
            ? "#ffffff"
            : "#8ce3d2",
          toneMapped: false,
          depthWrite: false,
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      line.matrixAutoUpdate = false;
      line.matrix.copy(m.matrixWorld);
      line.renderOrder = 25;
      highlight.add(line);
      if (state.selection.includes(m.userData.pieceIndex)) {
        const glow = new T.Mesh(
          m.geometry.clone(),
          new T.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: 0.2,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            blending: T.AdditiveBlending,
            side: T.DoubleSide,
          }),
        );
        glow.matrixAutoUpdate = false;
        glow.matrix.copy(m.matrixWorld);
        glow.renderOrder = 24;
        highlight.add(glow);
      }
    }
  }
  function preview() {
    const state = actions.getState(),
      point = aim();
    if (moving && !state.selection.length) setMoving(false);
    // Property edits while moving keep the selection following the aim.
    if (!held && moving && tool === "select") grab(point);
    drawHighlight();
    candidate = null;
    staged = null;
    if (held) {
      if (held.signature !== JSON.stringify(state.def)) {
        cancel();
        hint("Map changed; the pending edit was cancelled.");
        return;
      }
      const delta = {
        x: Math.round((point.x - held.anchor.x) * 2) / 2,
        y: Math.round((point.y - held.anchor.y + lift) * 10) / 10,
        z: Math.round((point.z - held.anchor.z) * 2) / 2,
      };
      const moved = moveWorldSelection(held.def, held.indices, delta);
      if (moved) {
        staged = moved.pieces.filter((p) => held.ids.includes(p.id));
        drawGhost(staged);
        hint(
          `MOVING ${staged.length} · base ${Math.min(...staged.map(pieceBase)).toFixed(1)} m · E / M / click drop · R/F height · Z rotate · Esc cancel`,
        );
      } else {
        clearGhost();
        hint("Cannot place outside the map or above the height limit.");
      }
      return;
    }
    if (tool === "group" && stamp) {
      const normal = hit?.face?.normal,
        base = normal && normal.y > 0.5 ? point.y : 0;
      candidate = placeGroup(
        state.def,
        stamp.group,
        { x: point.x, y: Math.max(0, base + lift), z: point.z },
        stamp.turns,
      );
      if (candidate) {
        drawGhost(candidate);
        hint(
          `${stamp.group.name} · base ${Math.min(...candidate.map(pieceBase)).toFixed(1)} m · click/RT place · Z rotate · R/F height · Esc cancel`,
        );
      } else {
        clearGhost();
        hint("That group doesn't fit here: check the map edge and height.");
      }
      return;
    }
    if (tool === "place") {
      const type = $("#gb-type").value,
        normal = hit?.face?.normal || new T.Vector3(0, 1, 0),
        width = Number($("#gb-width").value),
        depth = Number($("#gb-depth").value),
        height = Number($("#gb-height").value),
        mode = $("#gb-placement").value;
      const base =
        mode === "ground"
          ? 0
          : mode === "custom"
            ? Number($("#gb-base").value)
            : normal.y < -0.5
              ? point.y - height
              : normal.y > 0.5
                ? point.y
                : Math.max(0, point.y - height / 2);
      if (Math.abs(normal.x) > 0.5)
        point.x += (normal.x * (rotation % 2 ? depth : width)) / 2;
      if (Math.abs(normal.z) > 0.5)
        point.z += (normal.z * (rotation % 2 ? width : depth)) / 2;
      candidate = worldPiece(
        state.def,
        type,
        { x: point.x, y: base + lift, z: point.z },
        {
          width,
          depth,
          height,
          rotation,
          color: $("#gb-color").value,
          opacity: opacityOf("#gb-opacity"),
        },
      );
      if (candidate) {
        drawGhost([candidate]);
        hint(
          `${PIECE_TYPES[type].name} · base ${pieceBase(candidate).toFixed(1)} m · click/RT place · Z rotate · Esc cancel`,
        );
      } else {
        clearGhost();
        hint("Invalid placement: check bounds, dimensions and elevation.");
      }
      return;
    }
    clearGhost();
    const p = aimed === null ? null : state.def.pieces[aimed];
    hint(
      p
        ? `${PIECE_TYPES[p.t].name} · E / X select · Shift+E / RS add to group${state.selection.length ? " · M move selection" : ""}`
        : state.selection.length
          ? `${state.selection.length} selected · M move · R/F height · Z rotate · Esc deselect`
          : "Aim at a piece · E / X selects · 2 / Y opens New Piece",
    );
  }
  function pick(add = false) {
    if (held && !add) {
      if (!drop()) hint("Cannot place the selection there.");
      return;
    }
    // Adding to a moving group picks the whole group up again.
    if (held) cancel();
    aim();
    if (aimed === null) return hint("Aim at a piece first.");
    tool = "select";
    actions.onSelect(aimed, add);
    syncProperties(true);
  }
  function rotate(direction = 1) {
    if (held) {
      for (let i = 0; i < (direction === 1 ? 1 : 3); i++)
        rotatePieces(held.def, held.indices);
    } else if (tool === "group" && stamp)
      stamp.turns = (stamp.turns + (direction === 1 ? 1 : 3)) % 4;
    else if (tool === "place")
      rotation = (rotation + (direction === 1 ? 1 : 3)) % 4;
    else actions.onRotate();
  }
  function place() {
    if (held) return pick();
    if (tool === "group") {
      preview();
      if (candidate) {
        const error = actions.onPlaceGroup(candidate);
        hint(error || `Placed ${stamp.group.name}. Click again for another.`);
        lift = 0;
      }
      return;
    }
    if (tool === "place") {
      preview();
      if (candidate) {
        const p = { ...candidate };
        actions.onPlace(p);
        actions.onSelect(null);
        distance = null;
        lift = 0;
      }
    }
  }
  function height(delta) {
    if (held || tool === "place" || tool === "group") lift += delta;
    else if (fly && !actions.getState().selection.length)
      session.player.y = T.MathUtils.clamp(session.player.y + delta, 0, 38);
    else if (actions.getState().selection.length) actions.onLift(delta);
  }
  function action(name, down) {
    if (!active) return;
    if (paused) {
      if (!down) return;
      if (name === "pause" || name === "stance") {
        resume();
        return;
      }
      const items = [
        ...$("#gb-dialog").querySelectorAll("button,input,select"),
      ].filter((e) => e.offsetParent && !e.disabled);
      if (name === "jump") {
        (items.includes(document.activeElement)
          ? document.activeElement
          : items[0]
        )?.click();
      } else if (["slot1", "slot2", "slot3", "slot4"].includes(name)) {
        const d = ["slot1", "slot4"].includes(name) ? -1 : 1;
        items[
          (items.indexOf(document.activeElement) + d + items.length) %
            items.length
        ]?.focus();
      }
      return;
    }
    if (
      name === "stance" &&
      !fly &&
      down &&
      (input.held("sprint") || sprintLatched) &&
      input.movement().forward > 0.5 &&
      !held
    ) {
      slide++;
      slidePress = true;
      return;
    }
    if (name === "sprint" && down && input.device === "controller") {
      sprintLatched = !sprintLatched;
      return;
    }
    if (name === "stance" && !down && slidePress) {
      slidePress = false;
      return;
    }
    if (name === "stance") {
      if (down && held) {
        setMoving(false);
        actions.onSelect(null);
      } else if (down) stance.down(performance.now());
      else stance.up(performance.now());
      return;
    }
    if (!down) return;
    if (name === "interact") pick();
    else if (name === "use" || name === "useAlt") place();
    else if (name === "camera") dialog("palette");
    else if (name === "pause") dialog();
    else if (name === "developer") dialog("properties");
    else if (name === "previous") rotate(-1);
    else if (name === "next") rotate(1);
    else if (name === "slot1") height(0.5);
    else if (name === "slot3") height(-0.5);
    else if (name === "slot2")
      distance = Math.min(45, (distance ?? hit?.distance ?? 7) + 1);
    else if (name === "slot4")
      distance = Math.max(0.5, (distance ?? hit?.distance ?? 7) - 1);
    else if (name === "prone") {
      if (input.device === "controller") pick(true);
      else stance.stance = stance.stance === "prone" ? "standing" : "prone";
    }
  }
  const events = {
    resume,
    pause: () => dialog(),
    exit: () => actions.onExit(),
    palette: () => dialog("palette"),
    properties: () => dialog("properties"),
    flight: () => {
      safeMode();
      resume();
    },
    top: () => actions.onBack(),
    test: () => {
      const p = session.player;
      cancel();
      actions.onTest({ x: p.x, y: p.y, z: p.z });
    },
    save: () => {
      actions.onSave();
      hint("Map saved.");
    },
    undo: () => {
      cancel();
      actions.onUndo();
    },
    redo: () => {
      cancel();
      actions.onRedo();
    },
    select: () => {
      setMoving(false);
      tool = "select";
      stamp = null;
      actions.onSelect(null);
    },
    place: () => {
      tool = "place";
      stamp = null;
      setMoving(false);
      resume();
    },
    rotate: () => rotate(),
    duplicate: () => {
      cancel();
      actions.onDuplicate();
    },
    delete: () => {
      cancel();
      actions.onDelete();
    },
    revert: () => {
      cancel();
      hint(actions.onRevert());
      syncProperties(true);
    },
    saveGroup: () => {
      const message = actions.onSaveGroup($("#gb-group-name").value);
      hint(message);
      if (message.startsWith("Saved")) {
        $("#gb-group-name").value = "";
        browser.refresh();
      }
    },
    move: () => {
      toggleMove();
      if (moving) resume();
    },
  };
  root
    .querySelectorAll("[data-gb]")
    .forEach((b) => (b.onclick = () => events[b.dataset.gb]?.()));
  propertiesPanel.addEventListener("focusin", () => stop());
  function key(e, down) {
    if (!active) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (down) {
      if (e.code === "Escape") {
        if (held || tool === "place" || tool === "group" || moving) {
          setMoving(false);
          tool = "select";
          stamp = null;
          actions.onSelect(null);
        } else if (actions.getState().selection.length) actions.onSelect(null);
        else if (paused) resume();
        else dialog();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        ["KeyZ", "KeyY"].includes(e.code)
      ) {
        cancel();
        if (e.code === "KeyY" || e.shiftKey) actions.onRedo();
        else actions.onUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyD") {
        cancel();
        actions.onDuplicate();
      } else if (!paused && ["KeyR", "KeyF"].includes(e.code)) {
        if (held || actions.getState().selection.length)
          height(e.code === "KeyR" ? 0.5 : -0.5);
        else extra.add(e.code);
      } else if (!paused && e.code === "KeyZ") {
        rotate(e.shiftKey ? -1 : 1);
      } else if (!paused && ["Delete", "Backspace"].includes(e.code)) {
        cancel();
        actions.onDelete();
      } else if (!paused && e.code === "KeyE" && e.shiftKey) {
        pick(true);
      } else if (!paused && e.code === "KeyM") {
        toggleMove();
      } else if (!paused && ["Digit1", "Digit2", "KeyN"].includes(e.code)) {
        if (e.code === "Digit1") events.select();
        else dialog("palette");
      } else if (paused && e.code === "Enter") {
        document.activeElement?.click();
      } else if (paused && ["ArrowUp", "ArrowDown"].includes(e.code)) {
        const items = [
          ...$("#gb-dialog").querySelectorAll("button,input,select"),
        ].filter((el) => el.offsetParent && !el.disabled);
        items[
          (items.indexOf(document.activeElement) +
            (e.code === "ArrowUp" ? -1 : 1) +
            items.length) %
            items.length
        ]?.focus();
      } else if (!e.repeat) input.key(keyboardCode(e), true);
    } else {
      extra.delete(e.code);
      input.key(keyboardCode(e), false);
    }
    if (e.code !== "Tab") {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
  window.addEventListener("keydown", (e) => key(e, true), true);
  window.addEventListener("keyup", (e) => key(e, false), true);
  window.addEventListener(
    "mousedown",
    (e) => {
      if (!active || e.target !== canvas) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (paused) return;
      if (e.button === 2) rightDrag = true;
      else if (e.button === 0) place();
    },
    true,
  );
  window.addEventListener(
    "mouseup",
    (e) => {
      if (active && e.button === 2) rightDrag = false;
    },
    true,
  );
  window.addEventListener(
    "mousemove",
    (e) => {
      if (!active || paused) return;
      if (document.pointerLockElement === canvas || rightDrag) {
        const scale = input.config.mouseSensitivity;
        yaw -= e.movementX * scale;
        pitch = T.MathUtils.clamp(
          pitch - e.movementY * scale * (input.config.invertY ? -1 : 1),
          -1.5,
          1.5,
        );
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener(
    "click",
    (e) => {
      if (active && e.target === canvas) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!active || paused) return;
      e.preventDefault();
      if (held || tool === "place" || tool === "group")
        distance = T.MathUtils.clamp(
          (distance ?? hit?.distance ?? 7) + Math.sign(e.deltaY),
          0.5,
          45,
        );
    },
    { passive: false },
  );
  document.addEventListener("pointerlockchange", () => {
    if (!active) return;
    if (document.pointerLockElement === canvas) captured = true;
    else if (captured) {
      captured = false;
      dialog();
    }
  });
  window.addEventListener("blur", () => {
    if (active) dialog();
  });
  function updateMap() {
    const state = actions.getState(),
      key = JSON.stringify(state.def);
    if (key === mapKey) return;
    if (!session) {
      session = createEditorSession(state.def, savedView);
      fly = !!savedView?.fly;
      yaw = session.player.yaw;
      pitch = session.player.pitch;
    } else {
      if (held) cancel();
      if (session.updateMap(state.def))
        hint("Your previous position was blocked; moved to a safe surface.");
    }
    mapKey = key;
    world.setLevel(session.match.map);
  }
  function frame(dt) {
    if (!active) return;
    updateMap();
    input.poll();
    const p = session.player;
    if (!paused) {
      const slow = input.held("focus") ? 0.35 : 1;
      yaw +=
        ((+input.held("lookLeft") - +input.held("lookRight")) * 1.5 -
          input.look.x *
            input.config.lookSensitivity *
            (input.config.padInvertX ? -1 : 1)) *
        dt *
        slow;
      pitch = T.MathUtils.clamp(
        pitch +
          ((+input.held("lookUp") - +input.held("lookDown")) *
            1.5 *
            (input.config.invertY ? -1 : 1) -
            input.look.y *
              input.config.lookSensitivity *
              (input.config.padInvertY ? -1 : 1)) *
            dt *
            slow,
        -1.5,
        1.5,
      );
      const move = input.movement();
      if (Math.hypot(move.forward, move.side) < 0.1) sprintLatched = false;
      stance.update(performance.now());
      if (fly) {
        const s = CUSTOM_SIZES[actions.getState().def.size],
          speed = (input.held("sprint") || sprintLatched ? 10 : 4) * slow;
        const dx =
            (-Math.sin(yaw) * move.forward + Math.cos(yaw) * move.side) *
            speed *
            dt,
          dz =
            (-Math.cos(yaw) * move.forward - Math.sin(yaw) * move.side) *
            speed *
            dt;
        p.x = T.MathUtils.clamp(p.x + dx, -s.x + 0.32, s.x - 0.32);
        p.z = T.MathUtils.clamp(p.z + dz, -s.z + 0.32, s.z - 0.32);
        p.y = T.MathUtils.clamp(
          p.y +
            ((extra.has("KeyR") || input.held("jump") ? 1 : 0) -
              (extra.has("KeyF") || input.held("stance") ? 1 : 0)) *
              speed *
              dt,
          0,
          38,
        );
        p.crouch = p.prone = false;
        p.clamber = null;
        p.vy = 0;
      } else {
        const commands = {
          forward: move.forward,
          side: move.side,
          sprint: input.held("sprint") || sprintLatched,
          jump: input.held("jump"),
          crouch: stance.stance === "crouch",
          prone: stance.stance === "prone",
          slide,
          yaw,
          pitch,
        };
        accumulator += dt;
        while (accumulator >= 1 / 60) {
          session.step(commands, 1 / 60);
          accumulator -= 1 / 60;
        }
      }
      p.yaw = yaw;
      p.pitch = pitch;
    } else {
      menuRepeat -= dt;
      const axis = input.move.forward;
      if (Math.abs(axis) > 0.6 && menuRepeat <= 0) {
        const items = [
          ...$("#gb-dialog").querySelectorAll("button,input,select"),
        ].filter((e) => e.offsetParent && !e.disabled);
        items[
          (items.indexOf(document.activeElement) +
            (axis > 0 ? -1 : 1) +
            items.length) %
            items.length
        ]?.focus();
        menuRepeat = 0.22;
      }
    }
    for (const button of root.querySelectorAll(".gb-slots button"))
      button.classList.toggle(
        "active",
        button.dataset.gb ===
          (tool === "place" || tool === "group" ? "palette" : "select"),
      );
    const snapshot = session.snapshot();
    world.render(snapshot, { yaw, pitch }, dt, false);
    if (!paused) {
      preview();
      world.renderer.render(world.scene, world.camera);
      audio?.movement(snapshot, { yaw, pitch }, dt);
    }
    syncProperties();
    $("#gb-mode").textContent = fly ? "FLYING" : "WALKING";
    $("#gb-position").textContent =
      `${p.prone ? "PRONE" : p.crouch ? "CROUCHED" : p.clamber ? "CLAMBERING" : fly ? "FLY" : "WALK"} · ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    $("#gb-prompts").textContent =
      input.device === "controller"
        ? "LS move · RS look · X select/drop · Y new piece · LB/RB rotate · D-pad height/distance · B cancel · Menu pause"
        : "WASD move · IJKL/mouse look · Space jump/hold clamber · C crouch/hold prone · E select · M move/drop · R/F height · Z/Shift+Z rotate · 2 new piece · Esc pause";
  }
  return {
    frame,
    isActive: () => active,
    getView: () =>
      session
        ? {
            x: session.player.x,
            y: session.player.y,
            z: session.player.z,
            yaw,
            pitch,
            fly,
          }
        : savedView,
    setView: (v) => (savedView = v),
    refreshLibrary: () => browser.refresh(),
    open() {
      active = true;
      root.hidden = false;
      if (actions.getControls)
        input.config = structuredClone(actions.getControls());
      document.body.classList.add("builder-in-game", "in-arena", "playing");
      updateMap();
      tool = "select";
      setMoving(false);
      actions.onSelect(null);
      world.camera.position.set(
        session.player.x,
        session.player.y + eyeHeight(session.player),
        session.player.z,
      );
      world.resize();
      resume();
    },
    close() {
      active = false;
      unlock();
      cancel();
      highlight.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      highlight.clear();
      highlightKey = "";
      root.hidden = true;
      document.body.classList.remove("builder-in-game", "in-arena", "playing");
      world.resize();
    },
    cancel,
  };
}
