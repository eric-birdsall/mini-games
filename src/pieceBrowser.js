// The piece library browser, the same in the 2D planner and the 3D editor:
// search, category tabs, and cards with a picture, name and size.
import {
  CATEGORIES,
  describeSize,
  searchLibrary,
} from "../shared/pieceCatalog.js";
import { thumbnail, presetPiece } from "./pieceThumbs.js";

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// `getGroups()` lists My Pieces; `onPick(entry)` receives a preset
// ({ kind: "preset", id, t, w, d, h, ... }) or a group ({ kind: "group",
// id, name, pieces }); `onDeleteGroup(id)` removes a saved group.
// `extra` adds a category of the editor's own entries ({ kind, id, name,
// note, icon, key? }) ahead of the pieces, e.g. the 2D planner's spawns.
export function createPieceBrowser({
  container,
  label,
  getGroups,
  onPick,
  onDeleteGroup,
  extra = null,
}) {
  let category = "all",
    query = "",
    selected = null;
  container.classList.add("piece-browser");
  container.innerHTML = `<input class="pb-search" type="search" placeholder="Search pieces" aria-label="Search ${escape(label)}">
    <div class="pb-tabs" role="tablist" aria-label="Piece categories">${[
      { id: "all", label: "All" },
      ...(extra ? [extra.category] : []),
      ...CATEGORIES,
    ]
      .map(
        (c) =>
          `<button type="button" role="tab" data-cat="${c.id}" aria-selected="${c.id === "all"}">${c.label}</button>`,
      )
      .join("")}</div>
    <div class="pb-grid" role="listbox" aria-label="${escape(label)}"></div>`;
  const search = container.querySelector(".pb-search"),
    grid = container.querySelector(".pb-grid");
  search.addEventListener("input", () => {
    query = search.value;
    render();
  });
  // Keys typed in the search box belong to it, not the editor shortcuts.
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = query = "";
      render();
      search.blur();
    }
    e.stopPropagation();
  });
  for (const tab of container.querySelectorAll("[data-cat]"))
    tab.onclick = () => {
      category = tab.dataset.cat;
      for (const t of container.querySelectorAll("[data-cat]"))
        t.setAttribute("aria-selected", String(t === tab));
      render();
    };
  function card(entry) {
    const group = entry.kind === "group",
      id = `${entry.kind}:${entry.id}`;
    return `<div class="pb-card${selected === id ? " selected" : ""}" role="option" aria-selected="${selected === id}" data-entry="${escape(id)}" tabindex="0" title="${escape(entry.name)}">
      <img class="pb-thumb" alt="" ${entry.icon ? `src="${entry.icon}"` : `data-thumb="${escape(id)}"`}>
      <span class="pb-name">${escape(entry.name)}</span>
      <small class="pb-size">${entry.note ? escape(entry.note) : `${group ? `${entry.pieces.length} piece${entry.pieces.length === 1 ? "" : "s"} · ` : ""}${escape(describeSize({ ...entry, t: group ? null : entry.t }))}`}</small>
      ${entry.key ? `<kbd>${entry.key}</kbd>` : ""}
      ${group ? `<button type="button" class="pb-delete" data-delete="${escape(entry.id)}" aria-label="Delete ${escape(entry.name)} from My Pieces" title="Delete from My Pieces">×</button>` : ""}
    </div>`;
  }
  function render() {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean),
      own =
        extra && (category === "all" || category === extra.category.id)
          ? extra.entries.filter((e) =>
              words.every((w) =>
                `${e.name} ${extra.category.label}`.toLowerCase().includes(w),
              ),
            )
          : [],
      entries = [
        ...own,
        ...(category === extra?.category.id
          ? []
          : searchLibrary(query, category, getGroups())),
      ];
    grid.innerHTML = entries.length
      ? entries.map(card).join("")
      : `<p class="pb-empty">${
          category === "mine" && !query
            ? "No saved pieces yet. Select pieces and choose Save to My Pieces."
            : "No pieces match."
        }</p>`;
    const byId = new Map(entries.map((e) => [`${e.kind}:${e.id}`, e]));
    for (const el of grid.querySelectorAll("[data-entry]")) {
      const entry = byId.get(el.dataset.entry),
        pick = () => {
          selected = el.dataset.entry;
          for (const c of grid.querySelectorAll(".pb-card")) {
            c.classList.toggle("selected", c === el);
            c.setAttribute("aria-selected", String(c === el));
          }
          onPick(entry);
        };
      el.onclick = (e) => {
        if (!e.target.closest("[data-delete]")) pick();
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      };
    }
    for (const b of grid.querySelectorAll("[data-delete]"))
      b.onclick = (e) => {
        e.stopPropagation();
        // My Pieces has no undo, so ask first.
        const group = getGroups().find((g) => g.id === b.dataset.delete);
        if (group && confirm(`Delete “${group.name}” from My Pieces?`))
          onDeleteGroup(group.id);
      };
    for (const img of grid.querySelectorAll("[data-thumb]")) {
      const entry = byId.get(img.dataset.thumb),
        key =
          entry.kind === "group"
            ? `${entry.id}:${JSON.stringify(entry.pieces)}`
            : entry.id;
      thumbnail(
        key,
        entry.kind === "group" ? entry.pieces : [presetPiece(entry)],
      ).then((url) => {
        if (url) img.src = url;
      });
    }
  }
  render();
  return {
    refresh: render,
    // Mark a preset (by id) or group as the current choice; null clears.
    select(kind, id) {
      selected = kind ? `${kind}:${id}` : null;
      render();
    },
    showCategory(id) {
      container.querySelector(`[data-cat="${id}"]`)?.click();
    },
  };
}
